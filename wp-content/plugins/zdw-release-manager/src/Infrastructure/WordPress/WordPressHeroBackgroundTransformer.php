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
        $blocks[$index]['innerHTML'] = $this->rewriteSavedMarkup(
            (string) ($blocks[$index]['innerHTML'] ?? ''),
            $background->url()
        );
        foreach (($blocks[$index]['innerContent'] ?? []) as $contentIndex => $fragment) {
            if (is_string($fragment)) {
                $blocks[$index]['innerContent'][$contentIndex] = $this->rewriteSavedMarkup(
                    $fragment,
                    $background->url()
                );
            }
        }

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

    private function rewriteSavedMarkup(string $markup, string $backgroundUrl): string
    {
        $replacement = sprintf('background-image:url(%s)', esc_url($backgroundUrl));

        $rewritten = (string) preg_replace_callback(
            '/^(\s*<div\b)([^>]*)(>)/is',
            static function (array $match) use ($replacement): string {
                $attributes = (string) preg_replace(
                    '/\sdata-apply-effect=(["\'])1\1/i',
                    '',
                    $match[2]
                );
                if (preg_match('/\sstyle=(["\'])(.*?)\1/is', $attributes, $styleMatch, PREG_OFFSET_CAPTURE)) {
                    $style = $styleMatch[2][0];
                    if (preg_match('/background-image\s*:\s*url\([^)]*\)/i', $style)) {
                        $style = (string) preg_replace(
                            '/background-image\s*:\s*url\([^)]*\)/i',
                            $replacement,
                            $style,
                            1
                        );
                    } else {
                        $style = rtrim($style, "; \t\n\r\0\x0B") . ';' . $replacement;
                    }
                    $fullStyle = $styleMatch[0][0];
                    $newStyle = sprintf(' style=%1$s%2$s%1$s', $styleMatch[1][0], $style);
                    $attributes = substr_replace(
                        $attributes,
                        $newStyle,
                        $styleMatch[0][1],
                        strlen($fullStyle)
                    );
                } else {
                    $attributes .= sprintf(' style="%s"', $replacement);
                }

                return $match[1] . $attributes . $match[3];
            },
            $markup,
            1,
            $count
        );
        if (1 !== $count) {
            throw new RuntimeException('Uložené HTML úvodního bloku Best in Design neobsahuje očekávaný obal <div>.');
        }

        return $rewritten;
    }
}
