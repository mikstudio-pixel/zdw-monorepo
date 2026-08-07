<?php

declare(strict_types=1);

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressHomepageBodyTransformer;

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

$post = get_post(2);
if (!$post instanceof WP_Post || 'zdw' !== $post->post_name) {
    throw new RuntimeException('Czech homepage fixture is unavailable.');
}

$transformer = new WordPressHomepageBodyTransformer();
$desired = $transformer->desiredPageContent((string) $post->post_content);
$secondPass = $transformer->desiredPageContent($desired);
if (!$transformer->equivalent($desired, $secondPass)) {
    throw new RuntimeException('Homepage body transform is not idempotent.');
}

$blocks = array_values(array_filter(
    parse_blocks($desired),
    static fn (array $block): bool => null !== ($block['blockName'] ?? null)
));
$names = array_column($blocks, 'blockName');
if (['zdw/intro-effect', 'core/group', 'core/spacer', 'core/group', 'core/group'] !== $names) {
    throw new RuntimeException('Homepage body manifest does not contain the expected five top-level blocks.');
}
if ('na-co-se-tesit-section' !== ($blocks[3]['attrs']['className'] ?? null)) {
    throw new RuntimeException('Homepage showcase block is missing from the transformed body.');
}

echo "Homepage body integration test passed.\n";
