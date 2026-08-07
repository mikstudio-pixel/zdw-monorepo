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
        $updated = [];
        $contactReplaced = false;
        $skipBlankTail = false;

        foreach (parse_blocks($content) as $block) {
            $serialized = serialize_block($block);
            $isAccreditation = false !== stripos($serialized, 'AKREDITACE')
                || false !== stripos($serialized, 'ACCREDITATION');

            if ($isAccreditation) {
                $last = end($updated);
                if (is_array($last) && 'core/spacer' === ($last['blockName'] ?? null)) {
                    array_pop($updated);
                }
                $skipBlankTail = true;
                continue;
            }

            if (!$contactReplaced && 'zdw/contacts' === ($block['blockName'] ?? null)) {
                $updated[] = $replacement;
                $contactReplaced = true;
                $skipBlankTail = false;
                continue;
            }

            if (!$contactReplaced && 'core/group' === ($block['blockName'] ?? null)) {
                $updated[] = $replacement;
                $contactReplaced = true;
                $skipBlankTail = false;
                continue;
            }

            if ($skipBlankTail && $this->isBlankTailBlock($block)) {
                continue;
            }

            $skipBlankTail = false;
            $updated[] = $block;
        }

        if (!$contactReplaced) {
            throw new RuntimeException('Na stránce pro média nebyl nalezen původní kontakt.');
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
            $updated = preg_replace($pattern, $replacement, $content, 1, $count);
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
