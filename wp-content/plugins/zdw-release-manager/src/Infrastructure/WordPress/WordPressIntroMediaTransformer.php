<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class WordPressIntroMediaTransformer implements IntroContentTransformer
{
    private const INTRO_PATTERN = '/<!--\s+wp:zdw\/intro-effect\s+.*?-->.*?<!--\s+\/wp:zdw\/intro-effect\s+-->/s';

    public function desiredPageContent(string $content, MediaAsset $video, MediaAsset $poster): string
    {
        if (1 !== preg_match_all(self::INTRO_PATTERN, $content)) {
            throw new RuntimeException('Na homepage nebyl nalezen právě jeden úvodní blok.');
        }

        $updated = preg_replace_callback(
            self::INTRO_PATTERN,
            fn (array $matches): string => $this->updatedIntroBlock($matches[0], $video, $poster),
            $content,
            1,
            $count
        );

        if (null === $updated || 1 !== $count) {
            throw new RuntimeException('Aktualizace médií úvodního bloku selhala.');
        }

        return $updated;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    private function updatedIntroBlock(string $content, MediaAsset $video, MediaAsset $poster): string
    {
        $blocks = parse_blocks($content);
        if (1 !== count($blocks) || 'zdw/intro-effect' !== ($blocks[0]['blockName'] ?? null)) {
            throw new RuntimeException('Úvodní blok nelze bezpečně načíst.');
        }

        $block = $blocks[0];
        $block['attrs']['backgroundId'] = $poster->id();
        $block['attrs']['backgroundUrl'] = $poster->url();
        $block['attrs']['videoId'] = $video->id();
        $block['attrs']['videoUrl'] = $video->url();

        if (1 !== $this->updateVideoMarkup($block, $video, $poster)) {
            throw new RuntimeException('Úvodní blok neobsahuje právě jeden video element.');
        }

        return serialize_block($block);
    }

    /** @param array<string, mixed> $block */
    private function updateVideoMarkup(array &$block, MediaAsset $video, MediaAsset $poster): int
    {
        $updatedVideos = 0;
        foreach ($block['innerContent'] ?? [] as $index => $fragment) {
            if (!is_string($fragment) || !str_contains(strtolower($fragment), '<video')) {
                continue;
            }

            $processor = new \WP_HTML_Tag_Processor($fragment);
            while ($processor->next_tag('video')) {
                $processor->set_attribute('src', $video->url());
                $processor->set_attribute('poster', $poster->url());
                ++$updatedVideos;
            }
            $block['innerContent'][$index] = $processor->get_updated_html();
        }

        if (isset($block['innerBlocks']) && is_array($block['innerBlocks'])) {
            foreach ($block['innerBlocks'] as &$innerBlock) {
                $updatedVideos += $this->updateVideoMarkup($innerBlock, $video, $poster);
            }
            unset($innerBlock);
        }

        return $updatedVideos;
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
