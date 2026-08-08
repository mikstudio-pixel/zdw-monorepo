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

    public function desiredPageContent(string $content): string
    {
        $blocks = parse_blocks($content);
        $matches = [];
        foreach ($blocks as $index => $block) {
            if ('core/group' !== ($block['blockName'] ?? null)) {
                continue;
            }
            $text = $this->plainText($block);
            foreach (self::MARKERS as $marker) {
                if (str_contains($text, $marker)) {
                    $matches[$marker][] = $index;
                }
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

    private function normalize(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->normalize($item), $value);
        }

        return is_string($value) ? html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8') : $value;
    }
}
