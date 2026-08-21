<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\DesignCanteenContentTransformer;

final class WordPressDesignCanteenContentTransformer implements DesignCanteenContentTransformer
{
    public function desiredPageContent(string $content): string
    {
        $blocks = parse_blocks($content);
        $candidates = [];
        foreach ($blocks as $index => $block) {
            if ('core/group' !== ($block['blockName'] ?? null)) {
                continue;
            }
            $innerBlocks = $this->meaningful($block['innerBlocks'] ?? []);
            if (null !== $this->matchingIndex($innerBlocks, 'core/columns', 'is-style-with-vertical-lines')
                && null !== $this->matchingIndex($innerBlocks, 'esab/accordion')) {
                $candidates[$index] = $block;
            }
        }
        if (1 !== count($candidates)) {
            throw new RuntimeException('Nelze jednoznačně určit obsahovou sekci anglické Design Canteen.');
        }

        $index = array_key_first($candidates);
        $section = $candidates[$index];
        $innerBlocks = $this->meaningful($section['innerBlocks'] ?? []);
        $columnsIndex = $this->matchingIndex($innerBlocks, 'core/columns', 'is-style-with-vertical-lines');
        $accordionIndex = $this->matchingIndex($innerBlocks, 'esab/accordion');
        if (0 !== $columnsIndex || !is_int($accordionIndex) || $accordionIndex <= $columnsIndex) {
            throw new RuntimeException('Sekce Design Canteen nemá očekávané pořadí přeloženého obsahu.');
        }

        $lastRetained = $accordionIndex;
        if ('core/spacer' === ($innerBlocks[$accordionIndex + 1]['blockName'] ?? null)) {
            ++$lastRetained;
        }
        $section['innerBlocks'] = array_slice($innerBlocks, 0, $lastRetained + 1);
        $section['innerContent'] = $this->innerContent(
            $section['innerContent'] ?? [],
            count($section['innerBlocks'])
        );
        $blocks[$index] = $section;

        return serialize_blocks($blocks);
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    /** @param list<array<string, mixed>> $blocks
     *  @return list<array<string, mixed>>
     */
    private function meaningful(array $blocks): array
    {
        return array_values(array_filter(
            $blocks,
            static fn (array $block): bool => null !== ($block['blockName'] ?? null)
        ));
    }

    /** @param list<array<string, mixed>> $blocks */
    private function matchingIndex(array $blocks, string $name, ?string $className = null): ?int
    {
        $matches = [];
        foreach ($blocks as $index => $block) {
            if ($name !== ($block['blockName'] ?? null)) {
                continue;
            }
            if (null !== $className) {
                $classes = preg_split('/\s+/', (string) ($block['attrs']['className'] ?? '')) ?: [];
                if (!in_array($className, $classes, true)) {
                    continue;
                }
            }
            $matches[] = $index;
        }

        return 1 === count($matches) ? $matches[0] : null;
    }

    /** @param list<mixed> $original
     *  @return list<mixed>
     */
    private function innerContent(array $original, int $blockCount): array
    {
        if ([] === $original || !is_string($original[0]) || !is_string($original[array_key_last($original)])) {
            throw new RuntimeException('Obal sekce Design Canteen nelze bezpečně zachovat.');
        }

        $rebuilt = [$original[0]];
        for ($index = 0; $index < $blockCount; ++$index) {
            $rebuilt[] = null;
            if ($index < $blockCount - 1) {
                $rebuilt[] = "\n\n";
            }
        }
        $rebuilt[] = $original[array_key_last($original)];

        return $rebuilt;
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
