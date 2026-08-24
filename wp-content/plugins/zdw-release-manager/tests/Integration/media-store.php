<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPageStore;

$attachmentId = wp_insert_attachment([
    'post_mime_type' => 'video/mp4',
    'post_status' => 'inherit',
    'post_title' => 'ZDW missing-file integration fixture',
    'guid' => content_url('uploads/zdw-definitely-missing.mp4'),
]);
if (is_wp_error($attachmentId)) {
    throw new RuntimeException($attachmentId->get_error_message());
}

$upload = null;
$caseAttachmentId = 0;

try {
    $upload = wp_upload_bits('zdw-case-fixture-' . wp_generate_uuid4() . '.mp4', null, 'fixture');
    if (!empty($upload['error'])) {
        throw new RuntimeException((string) $upload['error']);
    }

    $caseAttachmentId = wp_insert_attachment([
        'post_mime_type' => 'video/mp4',
        'post_status' => 'inherit',
        'post_title' => 'ZDW filename case integration fixture',
        'guid' => $upload['url'],
    ]);
    if (is_wp_error($caseAttachmentId)) {
        throw new RuntimeException($caseAttachmentId->get_error_message());
    }

    update_post_meta((int) $attachmentId, '_wp_attached_file', '2099/01/zdw-definitely-missing.mp4');
    update_attached_file((int) $caseAttachmentId, $upload['file']);
    $store = new WordPressMediaStore();
    if (null !== $store->find((int) $attachmentId)) {
        throw new RuntimeException('A stale attachment whose upload is missing was accepted as media.');
    }

    $matches = $store->findByFilename(strtoupper(basename($upload['file'])));
    if (1 !== count($matches) || (int) $caseAttachmentId !== $matches[0]->id()) {
        throw new RuntimeException('An existing attachment was not matched case-insensitively by filename.');
    }

    $pageStore = new WordPressPageStore();
    if (null !== $pageStore->attachmentFilename((int) $attachmentId)) {
        throw new RuntimeException('A stale attachment whose upload is missing was accepted as a sponsor logo.');
    }
} finally {
    wp_delete_attachment((int) $attachmentId, true);
    if (is_int($caseAttachmentId) && 0 < $caseAttachmentId) {
        wp_delete_attachment($caseAttachmentId, true);
    } elseif (is_array($upload) && is_string($upload['file'] ?? null)) {
        wp_delete_file($upload['file']);
    }
}

echo "WordPressMediaStore integration test passed.\n";
