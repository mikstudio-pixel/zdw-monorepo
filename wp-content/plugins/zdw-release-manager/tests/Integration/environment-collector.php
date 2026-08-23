<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressEnvironmentCollector;

$collector = new WordPressEnvironmentCollector(
    ['kontakty', 'sponzori'],
    ['Header Menu', 'Header Menu EN']
);
$snapshot = $collector->collect();

if ($snapshot->phpVersion === '' || $snapshot->wordpressVersion === '') {
    throw new RuntimeException('Runtime versions must be collected.');
}

if (!in_array('zdw-theme', $snapshot->installedThemes, true)) {
    throw new RuntimeException('Parent theme was not detected.');
}

if (!in_array('zdw-theme-child', $snapshot->installedThemes, true)) {
    throw new RuntimeException('Child theme was not detected.');
}

foreach (['kontakty', 'sponzori'] as $slug) {
    if (($snapshot->pageSlugCounts[$slug] ?? 0) !== 1) {
        throw new RuntimeException(sprintf('Page %s must be uniquely detected.', $slug));
    }
}

foreach (['Header Menu', 'Header Menu EN'] as $menuName) {
    if (($snapshot->menuNameCounts[$menuName] ?? 0) !== 1) {
        throw new RuntimeException(sprintf('Menu %s must be uniquely detected.', $menuName));
    }
}

if ('zdw-theme-child' !== $snapshot->activeTheme) {
    throw new RuntimeException('Child theme must be active in the release fixture.');
}

echo "WordPressEnvironmentCollector integration test passed.\n";
