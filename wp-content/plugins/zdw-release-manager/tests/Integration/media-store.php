<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;

$attachmentId = wp_insert_attachment([
    'post_mime_type' => 'video/mp4',
    'post_status' => 'inherit',
    'post_title' => 'ZDW missing-file integration fixture',
    'guid' => content_url('uploads/zdw-definitely-missing.mp4'),
]);
if (is_wp_error($attachmentId)) {
    throw new RuntimeException($attachmentId->get_error_message());
}

try {
    update_post_meta((int) $attachmentId, '_wp_attached_file', '2099/01/zdw-definitely-missing.mp4');
    $store = new WordPressMediaStore();
    if (null !== $store->find((int) $attachmentId)) {
        throw new RuntimeException('A stale attachment whose upload is missing was accepted as media.');
    }
} finally {
    wp_delete_attachment((int) $attachmentId, true);
}

echo "WordPressMediaStore integration test passed.\n";
