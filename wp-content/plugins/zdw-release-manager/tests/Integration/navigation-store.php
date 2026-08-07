<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressNavigationStore;

$sponsorPage = get_page_by_path('sponzori', OBJECT, 'page');
if (!$sponsorPage instanceof WP_Post) {
    throw new RuntimeException('Sponsor page is missing.');
}

$store = new WordPressNavigationStore();
if (!$store->isAvailable()) {
    throw new RuntimeException('Navigation API is unavailable.');
}
if (!$store->matchesDesiredNavigation((int) $sponsorPage->ID)) {
    throw new RuntimeException('Navigation does not match its blueprint.');
}

echo "WordPressNavigationStore integration test passed.\n";
