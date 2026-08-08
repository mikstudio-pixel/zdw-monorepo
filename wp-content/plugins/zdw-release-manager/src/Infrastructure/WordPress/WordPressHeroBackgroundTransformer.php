<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\HeroBackgroundTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class WordPressHeroBackgroundTransformer implements HeroBackgroundTransformer
{
    public function desiredPageContent(string $content, MediaAsset $background): string
    {
        $blocks = parse_blocks($content);
        $matches = [];
        foreach ($blocks as $index => $block) {
            if ('zdw/intro-effect' === ($block['blockName'] ?? null)) {
                $matches[] = $index;
            }
        }
        if (1 !== count($matches)) {
            throw new RuntimeException('Na stránce Best in Design nebyl nalezen právě jeden úvodní blok.');
        }

        $index = $matches[0];
        $blocks[$index]['attrs']['backgroundId'] = $background->id();
        $blocks[$index]['attrs']['backgroundUrl'] = $background->url();
        $blocks[$index]['attrs']['backgroundAlt'] = '';
        $blocks[$index]['attrs']['applyEffect'] = false;

        return serialize_blocks($blocks);
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    private function normalize(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->normalize($item), $value);
        }

        return is_string($value) ? html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8') : $value;
    }
}
