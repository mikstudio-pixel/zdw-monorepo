<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\DesignCanteenCleanupTransformer;

final class WordPressDesignCanteenCleanupTransformer implements DesignCanteenCleanupTransformer
{
    private const MARKERS = [
        'KUDY TUDY DO KANTÝNY?',
        'CO TI LETOS NASERVÍRUJEME NA ZLÍNSKÉM ZÁMKU?',
        'SOBOTA, 9. KVĚTNA',
        'NEDĚLE, 10. KVĚTNA',
    ];

    private const EXPECTED_CHILD_BLOCKS = [
        'KUDY TUDY DO KANTÝNY?' => ['esab/accordion'],
        'CO TI LETOS NASERVÍRUJEME NA ZLÍNSKÉM ZÁMKU?' => ['core/heading', 'core/columns', 'core/columns'],
        'SOBOTA, 9. KVĚTNA' => ['core/heading', 'core/columns', 'core/spacer', 'core/columns', 'core/spacer'],
        'NEDĚLE, 10. KVĚTNA' => ['core/heading', 'core/columns', 'core/spacer'],
    ];

    private const EXPECTED_TREES = [
        'KUDY TUDY DO KANTÝNY?' => 'core/group(esab/accordion(esab/accordion-child(core/paragraph,core/paragraph,core/paragraph,core/paragraph)))',
        'CO TI LETOS NASERVÍRUJEME NA ZLÍNSKÉM ZÁMKU?' => 'core/group(core/heading,core/columns(core/column(core/heading),core/column(core/heading)),core/columns(core/column(core/html),core/column(core/html)))',
        'SOBOTA, 9. KVĚTNA' => 'core/group(core/heading,core/columns(core/column(core/html),core/column(core/html)),core/spacer,core/columns(core/column,core/column),core/spacer)',
        'NEDĚLE, 10. KVĚTNA' => 'core/group(core/heading,core/columns(core/column(core/html),core/column(core/html)),core/spacer)',
    ];

    private const EXPECTED_PAYLOAD_HASHES = [
        'KUDY TUDY DO KANTÝNY?' => '2c56ff57115fbb9e8212e26f280f8a88137ef023a4353d994230980e86b566bc',
        'CO TI LETOS NASERVÍRUJEME NA ZLÍNSKÉM ZÁMKU?' => '6803236b684b7e63a7d61b7bbe39ba9d66df1951dcfd3aee3eb562c247d187b6',
        'SOBOTA, 9. KVĚTNA' => '568942216634ed8b99b5023031b9544855b93f7e49b6df2909386711554a3cb1',
        'NEDĚLE, 10. KVĚTNA' => 'ab69f1e607f655c82e07e96412ce66feceac4b47903da01fd651f64b55b0a33b',
    ];

    public function desiredPageContent(string $content): string
    {
        $blocks = parse_blocks($content);
        $matches = [];
        foreach ($blocks as $index => $block) {
            if ('core/group' !== ($block['blockName'] ?? null)) {
                continue;
            }
            $text = $this->plainText($block);
            $groupMarkers = [];
            foreach (self::MARKERS as $marker) {
                if (str_contains($text, $marker)) {
                    $groupMarkers[] = $marker;
                }
            }
            if ([] === $groupMarkers) {
                continue;
            }
            if (!$this->isDedicatedLegacyGroup($block, $groupMarkers)) {
                throw new RuntimeException('Zastaralá sekce Design Canteen obsahuje také jiný obsah a nelze ji bezpečně odstranit.');
            }
            foreach ($groupMarkers as $marker) {
                $matches[$marker][] = $index;
            }
        }

        $found = array_sum(array_map('count', $matches));
        if (0 === $found) {
            return $content;
        }
        foreach ($matches as $markerMatches) {
            if (1 !== count($markerMatches)) {
                throw new RuntimeException('Českou Design Canteen nelze bezpečně očistit od zastaralých bloků.');
            }
        }

        $remove = array_values(array_unique(array_merge(...array_values($matches))));
        foreach ($remove as $index) {
            foreach ([$index - 1, $index + 1] as $adjacent) {
                if ('core/spacer' === ($blocks[$adjacent]['blockName'] ?? null)) {
                    $remove[] = $adjacent;
                }
            }
        }
        $remove = array_unique($remove);
        $blocks = array_values(array_filter($blocks, static fn (array $block, int $index): bool => !in_array($index, $remove, true), ARRAY_FILTER_USE_BOTH));

        return serialize_blocks($blocks);
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    /** @param array<string, mixed> $block */
    private function plainText(array $block): string
    {
        $text = html_entity_decode(wp_strip_all_tags(serialize_block($block)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = (string) preg_replace('/\s+/u', ' ', $text);

        return mb_strtoupper(trim($text), 'UTF-8');
    }

    /** @param array<string, mixed> $block
     *  @param list<string> $markers
     */
    private function isDedicatedLegacyGroup(array $block, array $markers): bool
    {
        if (1 !== count($markers)) {
            return false;
        }

        if (WordPressBlockContentGuard::hasUnexpectedContainerContent($block)) {
            return false;
        }

        $children = array_values(array_filter(
            $block['innerBlocks'] ?? [],
            static fn (mixed $child): bool => is_array($child) && null !== ($child['blockName'] ?? null)
        ));
        $names = array_map(static fn (array $child): string => (string) $child['blockName'], $children);
        $marker = $markers[0];
        if (($names !== (self::EXPECTED_CHILD_BLOCKS[$marker] ?? []))
            || [] === $children
            || (self::EXPECTED_TREES[$marker] ?? null) !== $this->blockTree($block)
            || !hash_equals(
                self::EXPECTED_PAYLOAD_HASHES[$marker] ?? '',
                hash('sha256', serialize_block($block))
            )) {
            return false;
        }

        $leadText = $this->plainText($children[0]);

        return 'esab/accordion' === $names[0]
            ? str_starts_with($leadText, $marker)
            : $marker === $leadText;
    }

    /** @param array<string, mixed> $block */
    private function blockTree(array $block): string
    {
        $name = (string) ($block['blockName'] ?? 'RAW');
        $children = array_map(
            fn (mixed $child): string => is_array($child) ? $this->blockTree($child) : 'INVALID',
            $block['innerBlocks'] ?? []
        );

        return [] === $children ? $name : $name . '(' . implode(',', $children) . ')';
    }

    private function normalize(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->normalize($item), $value);
        }

        return is_string($value) ? html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8') : $value;
    }
}
