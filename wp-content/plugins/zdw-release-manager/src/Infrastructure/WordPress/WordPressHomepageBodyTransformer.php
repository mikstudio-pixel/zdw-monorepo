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

        $showcases = $this->matchingBlocks($meaningful, 'core/group', 'na-co-se-tesit-section');
        if (1 !== count($showcases)) {
            throw new RuntimeException('Nelze jednoznačně určit lokalizovanou festivalovou sekci homepage.');
        }

        [$introSpacing, $spacer] = $this->canonicalSpacing();

        return serialize_blocks([
            $meaningful[0],
            $introSpacing,
            $spacer,
            $showcases[0],
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

    /** @return array{0: array<string, mixed>, 1: array<string, mixed>} */
    private function canonicalSpacing(): array
    {
        $blocks = array_values(array_filter(
            parse_blocks(<<<'BLOCKS'
<!-- wp:group {"className":"is-style-default"} -->
<div class="wp-block-group is-style-default"><!-- wp:spacer {"className":"is-style-medium"} -->
<div style="height:100px" aria-hidden="true" class="wp-block-spacer is-style-medium"></div>
<!-- /wp:spacer --></div>
<!-- /wp:group -->

<!-- wp:spacer -->
<div style="height:100px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
BLOCKS),
            static fn (array $block): bool => null !== ($block['blockName'] ?? null)
        ));
        if (2 !== count($blocks)) {
            throw new RuntimeException('Nepodařilo se sestavit sjednocené odsazení homepage.');
        }

        return [$blocks[0], $blocks[1]];
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
