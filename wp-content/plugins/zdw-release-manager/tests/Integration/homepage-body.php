<?php

declare(strict_types=1);

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressHomepageBodyTransformer;

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

$transformer = new WordPressHomepageBodyTransformer();
foreach ([2 => 'zdw', 93 => 'zdw-en'] as $postId => $slug) {
    $post = get_post($postId);
    if (!$post instanceof WP_Post || $slug !== $post->post_name) {
        throw new RuntimeException(sprintf('Homepage fixture %d is unavailable.', $postId));
    }

    $desired = $transformer->desiredPageContent((string) $post->post_content);
    $secondPass = $transformer->desiredPageContent($desired);
    if (!$transformer->equivalent($desired, $secondPass)) {
        throw new RuntimeException(sprintf('Homepage body transform %d is not idempotent.', $postId));
    }

    $blocks = array_values(array_filter(
        parse_blocks($desired),
        static fn (array $block): bool => null !== ($block['blockName'] ?? null)
    ));
    $names = array_column($blocks, 'blockName');
    if (['zdw/intro-effect', 'core/group', 'core/spacer', 'core/group'] !== $names) {
        throw new RuntimeException(sprintf('Homepage %d does not contain the expected four top-level blocks.', $postId));
    }
    if ('is-style-default' !== ($blocks[1]['attrs']['className'] ?? null)) {
        throw new RuntimeException(sprintf('Homepage %d is missing canonical intro spacing.', $postId));
    }
    if ('na-co-se-tesit-section' !== ($blocks[3]['attrs']['className'] ?? null)) {
        throw new RuntimeException(sprintf('Homepage %d is missing its localized showcase.', $postId));
    }
    if (str_contains($desired, 'Flash Talks, powered by PechaKucha')) {
        throw new RuntimeException(sprintf('Homepage %d still contains an obsolete event card.', $postId));
    }

    foreach ([
        $desired . "\n<!-- wp:paragraph --><p>Editorial marker</p><!-- /wp:paragraph -->",
        '<aside>Raw editorial marker</aside>' . $desired,
    ] as $unsafeContent) {
        $rejected = false;
        try {
            $transformer->desiredPageContent($unsafeContent);
        } catch (RuntimeException) {
            $rejected = true;
        }
        if (!$rejected) {
            throw new RuntimeException(sprintf('Homepage %d transform accepted unrelated editorial content.', $postId));
        }
    }

    $nestedRawBlocks = parse_blocks($desired);
    array_splice($nestedRawBlocks[1]['innerContent'], 1, 0, ['Nested raw spacing note']);
    $nestedRawRejected = false;
    try {
        $transformer->desiredPageContent(serialize_blocks($nestedRawBlocks));
    } catch (RuntimeException) {
        $nestedRawRejected = true;
    }
    if (!$nestedRawRejected) {
        throw new RuntimeException(sprintf('Homepage %d accepted raw content inside spacing.', $postId));
    }

    $nestedMarkupBlocks = parse_blocks($desired);
    $nestedMarkupBlocks[1]['innerContent'][0] .= '<img src="editorial-marker.jpg" alt="Editorial marker">';
    $nestedMarkupRejected = false;
    try {
        $transformer->desiredPageContent(serialize_blocks($nestedMarkupBlocks));
    } catch (RuntimeException) {
        $nestedMarkupRejected = true;
    }
    if (!$nestedMarkupRejected) {
        throw new RuntimeException(sprintf('Homepage %d accepted tag-only content inside spacing.', $postId));
    }
}

echo "Homepage body integration test passed.\n";
