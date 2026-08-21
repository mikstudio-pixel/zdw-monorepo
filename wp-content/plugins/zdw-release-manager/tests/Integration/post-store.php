<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;

$administratorIds = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
if ([] === $administratorIds) {
    throw new RuntimeException('An administrator fixture is required for the conditional update test.');
}
$publishedPage = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Published fixture']);
$draftPage = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Draft fixture']);
$publishedPost = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Post fixture']);
$previousUserId = get_current_user_id();

try {
    wp_set_current_user((int) $administratorIds[0]);
    $store = new WordPressPostStore();
    if (null === $store->find((int) $publishedPage)) {
        throw new RuntimeException('Published page was not accepted.');
    }
    if (null !== $store->find((int) $draftPage) || null !== $store->find((int) $publishedPost)) {
        throw new RuntimeException('Draft page or non-page migration target was accepted.');
    }
    $postUpdatedCalls = 0;
    $postUpdated = static function (int $postId) use ($publishedPage, &$postUpdatedCalls): void {
        if ((int) $publishedPage === $postId) {
            ++$postUpdatedCalls;
        }
    };
    add_action('post_updated', $postUpdated, 10, 1);
    try {
        $updated = $store->updateContentIfCurrent((int) $publishedPage, '', 'conditional-restore');
    } finally {
        remove_action('post_updated', $postUpdated, 10);
    }
    if (!$updated) {
        throw new RuntimeException('A matching conditional content update was rejected.');
    }
    if (1 !== $postUpdatedCalls) {
        throw new RuntimeException('The conditional update did not dispatch the WordPress post lifecycle.');
    }
    $savedOriginal = false;
    foreach (wp_get_post_revisions((int) $publishedPage) as $revision) {
        if ('' === (string) $revision->post_content) {
            $savedOriginal = true;
            break;
        }
    }
    if (!$savedOriginal) {
        throw new RuntimeException('The conditional update did not preserve the pre-migration revision.');
    }
    if ($store->updateContentIfCurrent((int) $publishedPage, '', 'stale-overwrite')
        || 'conditional-restore' !== $store->find((int) $publishedPage)?->content()) {
        throw new RuntimeException('A stale conditional content update overwrote newer content.');
    }
    if ($store->updateContentIfCurrent((int) $publishedPage, 'CONDITIONAL-RESTORE', 'case-overwrite')
        || 'conditional-restore' !== $store->find((int) $publishedPage)?->content()) {
        throw new RuntimeException('A case-only stale conditional update overwrote newer content.');
    }
} finally {
    wp_set_current_user($previousUserId);
    wp_delete_post((int) $publishedPage, true);
    wp_delete_post((int) $draftPage, true);
    wp_delete_post((int) $publishedPost, true);
}

echo "WordPressPostStore integration test passed.\n";
