<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;

$publishedPage = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Published fixture']);
$draftPage = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Draft fixture']);
$publishedPost = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Post fixture']);

try {
    $store = new WordPressPostStore();
    if (null === $store->find((int) $publishedPage)) {
        throw new RuntimeException('Published page was not accepted.');
    }
    if (null !== $store->find((int) $draftPage) || null !== $store->find((int) $publishedPost)) {
        throw new RuntimeException('Draft page or non-page migration target was accepted.');
    }
} finally {
    wp_delete_post((int) $publishedPage, true);
    wp_delete_post((int) $draftPage, true);
    wp_delete_post((int) $publishedPost, true);
}

echo "WordPressPostStore integration test passed.\n";
