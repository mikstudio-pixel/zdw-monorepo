<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class WordPressIntroContentTransformer implements IntroContentTransformer
{
    public function desiredPageContent(string $content, MediaAsset $video, MediaAsset $poster): string
    {
        $replacement = $this->introBlock($video, $poster);
        $pattern = '/<!--\s+wp:zdw\/intro-effect\s+.*?-->.*?<!--\s+\/wp:zdw\/intro-effect\s+-->/s';
        if (1 !== preg_match_all($pattern, $content)) {
            throw new RuntimeException('Na homepage nebyl nalezen právě jeden úvodní blok.');
        }
        $updated = preg_replace_callback(
            $pattern,
            static fn (): string => $replacement,
            $content,
            1,
            $count
        );

        if (null === $updated) {
            throw new RuntimeException('Regulární výraz úvodního bloku selhal.');
        }
        if (1 !== $count) {
            throw new RuntimeException('Na homepage nebyl nalezen právě jeden úvodní blok.');
        }

        return $updated;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $this->normalize(parse_blocks($first)) === $this->normalize(parse_blocks($second));
    }

    private function introBlock(MediaAsset $video, MediaAsset $poster): string
    {
        $attributes = json_encode([
            'backgroundId' => $poster->id(),
            'backgroundUrl' => $poster->url(),
            'backgroundAlt' => '',
            'videoId' => $video->id(),
            'videoUrl' => $video->url(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $videoUrl = esc_url($video->url());
        $posterUrl = esc_url($poster->url());
        $filterId = 'zdw-gmap-' . $video->id();

        return sprintf(
            <<<'BLOCK'
<!-- wp:zdw/intro-effect %1$s -->
<div class="wp-block-zdw-intro-effect intro-effect intro-effect-big" data-apply-effect="1"><svg class="zdw-filters" width="0" height="0" style="position:absolute" xmlns="http://www.w3.org/2000/svg"><defs><filter id="%2$s" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"></feColorMatrix><feComponentTransfer><feFuncR type="table" tableValues="0.906 0.306 0.051"></feFuncR><feFuncG type="table" tableValues="0.133 0.153 0.059"></feFuncG><feFuncB type="table" tableValues="0.447 0.592 0.243"></feFuncB></feComponentTransfer></filter></defs></svg><video class="ie-bg-video" src="%3$s" muted loop playsinline autoplay poster="%4$s" style="filter:url(#%2$s)"></video><!-- wp:group {"className":"zdw-intro-effect-inner"} -->
<div class="wp-block-group zdw-intro-effect-inner"><!-- wp:heading {"className":"text-glow-lg","style":{"elements":{"link":{"color":{"text":"var:preset|color|white"}}}},"textColor":"white"} -->
<h2 class="wp-block-heading text-glow-lg has-white-color has-text-color has-link-color">ZLIN</h2>
<!-- /wp:heading -->

<!-- wp:heading {"className":"text-glow-lg","style":{"typography":{"fontStyle":"normal","fontWeight":"900"},"elements":{"link":{"color":{"text":"var:preset|color|white"}}}},"textColor":"white"} -->
<h2 class="wp-block-heading text-glow-lg has-white-color has-text-color has-link-color" style="font-style:normal;font-weight:900">DESIGN</h2>
<!-- /wp:heading -->

<!-- wp:heading {"className":"text-glow-lg","style":{"elements":{"link":{"color":{"text":"var:preset|color|white"}}}},"textColor":"white"} -->
<h2 class="wp-block-heading text-glow-lg has-white-color has-text-color has-link-color">WEEK</h2>
<!-- /wp:heading --></div>
<!-- /wp:group -->

<!-- wp:group {"className":"zdw-intro-effect-side"} -->
<div class="wp-block-group zdw-intro-effect-side"><!-- wp:heading {"level":3,"className":"font-weight-regular text-glow","style":{"typography":{"textAlign":"right"}}} -->
<h3 class="wp-block-heading has-text-align-right font-weight-regular text-glow">6.—12. 5. 2027<br></h3>
<!-- /wp:heading --></div>
<!-- /wp:group --></div>
<!-- /wp:zdw/intro-effect -->
BLOCK,
            $attributes,
            esc_attr($filterId),
            $videoUrl,
            $posterUrl
        );
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
