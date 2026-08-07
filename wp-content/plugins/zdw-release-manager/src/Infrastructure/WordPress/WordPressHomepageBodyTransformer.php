<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\HomepageBodyTransformer;

final class WordPressHomepageBodyTransformer implements HomepageBodyTransformer
{
    public function desiredPageContent(string $content): string
    {
        $blocks = parse_blocks($content);
        $meaningful = array_values(array_filter(
            $blocks,
            static fn (array $block): bool => null !== ($block['blockName'] ?? null)
        ));
        if ([] === $meaningful || 'zdw/intro-effect' !== $meaningful[0]['blockName']) {
            throw new RuntimeException('Homepage nezačíná očekávaným úvodním blokem.');
        }

        $introSpacing = $this->matchingBlocks($meaningful, 'core/group', 'is-style-default');
        $showcases = $this->matchingBlocks($meaningful, 'core/group', 'na-co-se-tesit-section');
        if (1 !== count($introSpacing) || 1 !== count($showcases)) {
            throw new RuntimeException('Nelze jednoznačně určit mezery a sekci „Na co se těšit“ na homepage.');
        }

        $showcaseIndex = array_search($showcases[0], $meaningful, true);
        if (!is_int($showcaseIndex)) {
            throw new RuntimeException('Sekci „Na co se těšit“ se nepodařilo lokalizovat.');
        }

        $spacers = array_values(array_filter(
            array_slice($meaningful, 1, $showcaseIndex - 1),
            static fn (array $block): bool => 'core/spacer' === ($block['blockName'] ?? null)
        ));
        $tiles = $meaningful[$showcaseIndex + 1] ?? null;
        if (1 !== count($spacers) || !is_array($tiles) || 'core/group' !== ($tiles['blockName'] ?? null)) {
            throw new RuntimeException('Navazující bloky sekce „Na co se těšit“ neodpovídají očekávané struktuře.');
        }

        return serialize_blocks([
            $meaningful[0],
            $introSpacing[0],
            $spacers[0],
            $showcases[0],
            $tiles,
        ]);
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    /** @param list<array<string, mixed>> $blocks
     *  @return list<array<string, mixed>>
     */
    private function matchingBlocks(array $blocks, string $name, string $className): array
    {
        return array_values(array_filter(
            $blocks,
            static function (array $block) use ($name, $className): bool {
                $classes = preg_split('/\s+/', (string) ($block['attrs']['className'] ?? '')) ?: [];

                return $name === ($block['blockName'] ?? null) && in_array($className, $classes, true);
            }
        ));
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
