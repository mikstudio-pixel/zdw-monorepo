<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\ContactContentTransformer;

final class WordPressContactContentTransformer implements ContactContentTransformer
{
    /** @param list<array<string, string>> $contacts */
    public function pressPage(string $content, array $contacts): string
    {
        $replacement = $this->parsedContactBlock($contacts, 'compact');
        $blocks = parse_blocks($content);
        $contactTarget = $this->contactTarget($blocks);
        $contactIndex = $contactTarget['replace'];
        $accreditationIndex = $this->accreditationTargetIndex($blocks);
        $updated = [];
        $skipBlankTail = false;

        foreach ($blocks as $index => $block) {
            if ($accreditationIndex === $index && $contactIndex !== $index) {
                $last = end($updated);
                if (is_array($last) && 'core/spacer' === ($last['blockName'] ?? null)) {
                    array_pop($updated);
                }
                $skipBlankTail = true;
                continue;
            }

            if (in_array($index, $contactTarget['remove'], true)) {
                continue;
            }

            if ($contactIndex === $index) {
                $updated[] = $replacement;
                $skipBlankTail = false;
                continue;
            }

            if ($skipBlankTail && $this->isBlankTailBlock($block)) {
                continue;
            }

            $skipBlankTail = false;
            $updated[] = $block;
        }

        return serialize_blocks($updated);
    }

    /** @param list<array<string, string>> $contacts */
    public function replaceFirstContact(string $content, array $contacts): string
    {
        $replacement = $this->contactBlock($contacts, 'compact');
        $pattern = '/<!--\s+wp:(?:zdw\/contacts|acf\/contact-person)\s+.*?\/-->/s';
        if (1 !== preg_match_all($pattern, $content)) {
            throw new RuntimeException('Na stránce nebyl nalezen právě jeden kontaktní blok.');
        }
        $updated = preg_replace_callback(
            $pattern,
            static fn (): string => $replacement,
            $content,
            1,
            $count
        );
        if (null === $updated || 1 !== $count) {
            throw new RuntimeException('Regulární výraz pro kontaktní blok selhal.');
        }

        return $updated;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    /** @param list<array<string, string>> $contacts */
    private function contactBlock(array $contacts, string $variant): string
    {
        return serialize_block([
            'blockName' => 'zdw/contacts',
            'attrs' => ['contacts' => $contacts, 'variant' => $variant],
            'innerBlocks' => [],
            'innerHTML' => '',
            'innerContent' => [],
        ]);
    }

    /** @param list<array<string, string>> $contacts
     *  @return array<string, mixed>
     */
    private function parsedContactBlock(array $contacts, string $variant): array
    {
        $blocks = parse_blocks($this->contactBlock($contacts, $variant));

        if (!isset($blocks[0]) || !is_array($blocks[0])) {
            throw new RuntimeException('Nepodařilo se sestavit kontaktní blok.');
        }

        return $blocks[0];
    }

    /** @param array<string, mixed> $block */
    private function isBlankTailBlock(array $block): bool
    {
        if ('core/spacer' === ($block['blockName'] ?? null)) {
            return true;
        }

        return 'core/paragraph' === ($block['blockName'] ?? null)
            && '' === trim(wp_strip_all_tags((string) ($block['innerHTML'] ?? '')));
    }

    /** @param list<array<string, mixed>> $blocks
     *  @return array{replace: int, remove: list<int>}
     */
    private function contactTarget(array $blocks): array
    {
        $desired = [];
        $legacy = [];

        foreach ($blocks as $index => $block) {
            if ('zdw/contacts' === ($block['blockName'] ?? null)) {
                $desired[] = $index;
                continue;
            }

            if ('core/group' === ($block['blockName'] ?? null)
                && $this->containsBlock($block, 'acf/contact-person')) {
                $legacy[] = $index;
            }
        }

        if (count($desired) > 1 || count($legacy) > 1 || ([] === $desired && [] === $legacy)) {
            throw new RuntimeException('Na stránce pro média nebyl nalezen právě jeden původní kontakt.');
        }

        if ([] !== $desired) {
            foreach ($legacy as $legacyIndex) {
                if (!$this->isDedicatedLegacyContactGroup($blocks[$legacyIndex])) {
                    throw new RuntimeException('Původní kontaktní skupina obsahuje nesouvisející obsah a nelze ji bezpečně odstranit.');
                }
            }

            return ['replace' => $desired[0], 'remove' => $legacy];
        }

        if (!$this->isDedicatedLegacyContactGroup($blocks[$legacy[0]])) {
            throw new RuntimeException('Původní kontaktní skupina obsahuje nesouvisející obsah a nelze ji bezpečně odstranit.');
        }

        return ['replace' => $legacy[0], 'remove' => []];
    }

    /** @param array<string, mixed> $block */
    private function isDedicatedLegacyContactGroup(array $block): bool
    {
        if ($this->isLegacyAccreditationBlock($block)) {
            return true;
        }

        if (WordPressBlockContentGuard::hasUnexpectedContainerContent($block)) {
            return false;
        }

        $children = $block['innerBlocks'] ?? [];
        if (!is_array($children) || [] === $children) {
            return false;
        }

        foreach ($children as $child) {
            if (!is_array($child) || null === ($child['blockName'] ?? null)) {
                return false;
            }

            $name = $child['blockName'] ?? null;
            if ('acf/contact-person' === $name || 'core/spacer' === $name) {
                continue;
            }
            if (in_array($name, ['core/group', 'core/columns', 'core/column'], true)
                && $this->isDedicatedLegacyContactGroup($child)) {
                continue;
            }
            if ('core/paragraph' === $name && '' === $this->plainText($child)) {
                continue;
            }

            return false;
        }

        return true;
    }

    /** @param list<array<string, mixed>> $blocks */
    private function accreditationTargetIndex(array $blocks): ?int
    {
        $matches = [];
        foreach ($blocks as $index => $block) {
            if ($this->isLegacyAccreditationBlock($block)) {
                $matches[] = $index;
            }
        }

        if (count($matches) > 1) {
            throw new RuntimeException('Na stránce pro média bylo nalezeno více původních sekcí akreditace.');
        }

        return $matches[0] ?? null;
    }

    /** @param array<string, mixed> $block */
    private function isLegacyAccreditationBlock(array $block): bool
    {
        if ('core/group' !== ($block['blockName'] ?? null)) {
            return false;
        }

        $innerBlocks = $block['innerBlocks'] ?? [];
        if (!is_array($innerBlocks)
            || 1 !== count($innerBlocks)
            || !is_array($innerBlocks[0])
            || 'core/columns' !== ($innerBlocks[0]['blockName'] ?? null)
            || WordPressBlockContentGuard::hasUnexpectedContainerContent($block)) {
            return false;
        }

        $columns = $innerBlocks[0]['innerBlocks'] ?? [];
        if (!is_array($columns)
            || 3 !== count($columns)
            || [] !== array_filter(
                $columns,
                static fn (mixed $column): bool => !is_array($column)
                    || 'core/column' !== ($column['blockName'] ?? null)
            )) {
            return false;
        }

        $contentChildren = static fn (array $column): array => array_values(array_filter(
            $column['innerBlocks'] ?? [],
            static fn (mixed $child): bool => is_array($child)
                && 'core/spacer' !== ($child['blockName'] ?? null)
        ));
        $firstChildren = $contentChildren($columns[0]);
        $firstNames = array_map(
            static fn (array $child): string => (string) ($child['blockName'] ?? ''),
            $firstChildren
        );
        $emptyColumnNames = static fn (array $column): array => array_map(
            static fn (array $child): string => (string) ($child['blockName'] ?? ''),
            $contentChildren($column)
        );
        if (['core/heading', 'core/buttons'] !== $firstNames
            || ['core/heading'] !== $emptyColumnNames($columns[1])
            || ['core/heading'] !== $emptyColumnNames($columns[2])) {
            return false;
        }

        $buttons = $firstChildren[1];
        $buttonNames = array_map(
            static fn (array $child): string => (string) ($child['blockName'] ?? ''),
            array_values(array_filter($buttons['innerBlocks'] ?? [], 'is_array'))
        );
        if (!in_array($buttonNames, [
            ['core/button'],
            ['core/button', 'acf/contact-person'],
        ], true)) {
            return false;
        }

        $headings = $this->headingTexts($columns[0]);
        $expectedHeading = 1 === count($headings)
            && in_array($headings[0], ['AKREDITACE', 'ACCREDITATION'], true);

        return $expectedHeading
            && $this->accreditationLeafPayloadMatches($columns, $headings[0])
            && '' === $this->plainText($columns[1])
            && '' === $this->plainText($columns[2]);
    }

    /** @param list<array<string, mixed>> $columns */
    private function accreditationLeafPayloadMatches(array $columns, string $heading): bool
    {
        $childNames = static fn (array $block): array => array_map(
            static fn (array $child): string => (string) ($child['blockName'] ?? ''),
            array_values(array_filter($block['innerBlocks'] ?? [], 'is_array'))
        );
        if (['core/spacer', 'core/heading', 'core/buttons'] !== $childNames($columns[0])
            || ['core/spacer', 'core/heading'] !== $childNames($columns[1])
            || ['core/spacer', 'core/heading'] !== $childNames($columns[2])) {
            return false;
        }

        $first = array_values(array_filter($columns[0]['innerBlocks'], 'is_array'));
        $second = array_values(array_filter($columns[1]['innerBlocks'], 'is_array'));
        $third = array_values(array_filter($columns[2]['innerBlocks'], 'is_array'));
        $spacerHtml = '<div style="height:30px" aria-hidden="true" class="wp-block-spacer"></div>';
        foreach ([$first[0], $second[0], $third[0]] as $spacer) {
            if (!$this->leafPayloadMatches($spacer, ['height' => '30px'], $spacerHtml)) {
                return false;
            }
        }

        $headingText = 'AKREDITACE' === $heading ? 'AKREDITACE' : 'ACCREDITATION';
        $headingHtml = sprintf(
            '<h4 class="wp-block-heading has-text-align-center">%s</h4>',
            $headingText
        );
        $emptyHeadingHtml = '<h4 class="wp-block-heading has-text-align-center"></h4>';
        if (!$this->leafPayloadMatches($first[1], ['textAlign' => 'center', 'level' => 4], $headingHtml)
            || !$this->leafPayloadMatches($second[1], ['textAlign' => 'center', 'level' => 4], $emptyHeadingHtml)
            || !$this->leafPayloadMatches($third[1], ['textAlign' => 'center', 'level' => 4], $emptyHeadingHtml)) {
            return false;
        }

        $buttons = $first[2];
        if (($buttons['attrs'] ?? []) != ['layout' => ['type' => 'flex', 'justifyContent' => 'center']]) {
            return false;
        }
        $buttonChildren = array_values(array_filter($buttons['innerBlocks'] ?? [], 'is_array'));
        $button = $buttonChildren[0] ?? [];
        $buttonText = 'AKREDITACE' === $heading ? 'ZOBRAZIT SOUBORY' : 'VIEW FILES';
        $buttonHtml = sprintf(
            '<div class="wp-block-button"><a class="wp-block-button__link has-text-align-center wp-element-button" href="https://docs.google.com/forms/d/e/1FAIpQLSerSEKT-2eufUO50ymmo3cyJAZb-Q3yfmGizhRRzLXtQBLihA/viewform" target="_blank" rel="noreferrer noopener">%s</a></div>',
            $buttonText
        );

        return $this->leafPayloadMatches($button, ['textAlign' => 'center'], $buttonHtml);
    }

    /** @param array<string, mixed> $block
     *  @param array<string, mixed> $attrs
     */
    private function leafPayloadMatches(array $block, array $attrs, string $innerHtml): bool
    {
        return ($block['attrs'] ?? []) == $attrs
            && trim((string) ($block['innerHTML'] ?? '')) === $innerHtml;
    }

    /** @param array<string, mixed> $block
     *  @return list<string>
     */
    private function headingTexts(array $block): array
    {
        $texts = [];
        foreach (($block['innerBlocks'] ?? []) as $innerBlock) {
            if (!is_array($innerBlock)) {
                continue;
            }
            if ('core/heading' === ($innerBlock['blockName'] ?? null)) {
                $texts[] = strtoupper($this->plainText($innerBlock));
            }
            $texts = array_merge($texts, $this->headingTexts($innerBlock));
        }

        return $texts;
    }

    /** @param array<string, mixed> $block */
    private function plainText(array $block): string
    {
        $text = html_entity_decode(wp_strip_all_tags(serialize_block($block)), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }

    /** @param array<string, mixed> $block */
    private function containsBlock(array $block, string $blockName): bool
    {
        foreach (($block['innerBlocks'] ?? []) as $innerBlock) {
            if (!is_array($innerBlock)) {
                continue;
            }
            if ($blockName === ($innerBlock['blockName'] ?? null)
                || $this->containsBlock($innerBlock, $blockName)) {
                return true;
            }
        }

        return false;
    }

    private function normalize(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->normalize($item), $value);
        }

        return is_string($value)
            ? html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')
            : $value;
    }
}
