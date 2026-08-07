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

if (($snapshot->pageSlugCounts['kontakty'] ?? 0) !== 1) {
    throw new RuntimeException('Kontakty page must be uniquely detected.');
}

if (($snapshot->menuNameCounts['Header Menu'] ?? 0) !== 1) {
    throw new RuntimeException('Header Menu must be uniquely detected.');
}

echo "WordPressEnvironmentCollector integration test passed.\n";
