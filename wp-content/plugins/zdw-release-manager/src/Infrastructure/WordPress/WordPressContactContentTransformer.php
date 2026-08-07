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
        $contactIndex = $this->contactTargetIndex($blocks);
        $accreditationIndex = $this->accreditationTargetIndex($blocks);
        $updated = [];
        $skipBlankTail = false;

        foreach ($blocks as $index => $block) {
            if ($accreditationIndex === $index) {
                $last = end($updated);
                if (is_array($last) && 'core/spacer' === ($last['blockName'] ?? null)) {
                    array_pop($updated);
                }
                $skipBlankTail = true;
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
        $patterns = [
            '/<!--\s+wp:zdw\/contacts\s+.*?\/-->/s',
            '/<!--\s+wp:acf\/contact-person\s+.*?\/-->/s',
        ];

        foreach ($patterns as $pattern) {
            $updated = preg_replace_callback(
                $pattern,
                static fn (): string => $replacement,
                $content,
                1,
                $count
            );
            if (null === $updated) {
                throw new RuntimeException('Regulární výraz pro kontaktní blok selhal.');
            }
            if (1 === $count) {
                return $updated;
            }
        }

        throw new RuntimeException('Na stránce nebyl nalezen kontaktní blok.');
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

    /** @param list<array<string, mixed>> $blocks */
    private function contactTargetIndex(array $blocks): int
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

        $matches = [] !== $desired ? $desired : $legacy;
        if (1 !== count($matches)) {
            throw new RuntimeException('Na stránce pro média nebyl nalezen právě jeden původní kontakt.');
        }

        return $matches[0];
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

        $columnsBlocks = array_values(array_filter(
            $block['innerBlocks'] ?? [],
            static fn (mixed $innerBlock): bool => is_array($innerBlock)
                && 'core/columns' === ($innerBlock['blockName'] ?? null)
        ));
        if (1 !== count($columnsBlocks)) {
            return false;
        }

        $columns = array_values(array_filter(
            $columnsBlocks[0]['innerBlocks'] ?? [],
            static fn (mixed $innerBlock): bool => is_array($innerBlock)
                && 'core/column' === ($innerBlock['blockName'] ?? null)
        ));
        if (3 !== count($columns)) {
            return false;
        }

        $headings = $this->headingTexts($columns[0]);
        $expectedHeading = 1 === count($headings)
            && in_array($headings[0], ['AKREDITACE', 'ACCREDITATION'], true);

        return $expectedHeading
            && $this->containsBlock($columns[0], 'core/button')
            && '' === $this->plainText($columns[1])
            && '' === $this->plainText($columns[2]);
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
