<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_sponsors_block_render')) {
    throw new RuntimeException('ZDW Sponsors Block is not active.');
}

$uploads = wp_upload_dir();
if (!empty($uploads['error'])) {
    throw new RuntimeException((string) $uploads['error']);
}

$filename = 'zdw-sponsor-full-size-integration.png';
$path = trailingslashit($uploads['path']) . $filename;
$relativePath = trailingslashit($uploads['subdir']) . $filename;
$relativePath = ltrim($relativePath, '/');
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
if (!is_string($png) || false === file_put_contents($path, $png)) {
    throw new RuntimeException('Could not create the sponsor render fixture.');
}

$attachmentId = wp_insert_attachment([
    'post_mime_type' => 'image/png',
    'post_status' => 'inherit',
    'post_title' => 'ZDW sponsor full-size integration fixture',
    'guid' => trailingslashit($uploads['url']) . $filename,
], $path);
if (is_wp_error($attachmentId)) {
    unlink($path);
    throw new RuntimeException($attachmentId->get_error_message());
}

try {
    update_post_meta((int) $attachmentId, '_wp_attached_file', $relativePath);
    wp_update_attachment_metadata((int) $attachmentId, [
        'width' => 1000,
        'height' => 1000,
        'file' => $relativePath,
        'sizes' => [
            'medium' => [
                'file' => 'zdw-sponsor-full-size-integration-500x500.png',
                'width' => 500,
                'height' => 500,
                'mime-type' => 'image/png',
            ],
        ],
    ]);
    update_post_meta((int) $attachmentId, 'url', 'https://example.com/sponsor');

    $html = do_blocks(sprintf(
        '<!-- wp:zdw/sponsors %s /-->',
        json_encode(
            ['sections' => ['poradatele' => [(int) $attachmentId]]],
            JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        )
    ));
    if (!str_contains($html, $filename) || str_contains($html, '-500x500.png')) {
        throw new RuntimeException('Sponsor render selected a missing generated thumbnail instead of the original logo.');
    }
    if (!str_contains($html, '<a href="https://example.com/sponsor"')
        || !str_contains($html, 'alt="ZDW sponsor full-size integration fixture"')) {
        throw new RuntimeException('Linked sponsor logo does not have an accessible attachment-title fallback.');
    }

    wp_update_post(['ID' => (int) $attachmentId, 'post_title' => '']);
    $block = sprintf(
        '<!-- wp:zdw/sponsors %s /-->',
        json_encode(
            ['sections' => ['poradatele' => [(int) $attachmentId]]],
            JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        )
    );
    $fallbackHtml = do_blocks($block);
    if (!str_contains($fallbackHtml, '<a href="https://example.com/sponsor"')
        || !str_contains($fallbackHtml, 'alt="example.com"')) {
        throw new RuntimeException('A linked sponsor without label or title lost its accessible fallback.');
    }

    update_post_meta((int) $attachmentId, 'url', ['invalid-array-value']);
    update_post_meta((int) $attachmentId, 'label', ['invalid-array-value']);
    $invalidFieldHtml = do_blocks($block);
    if (!str_contains($invalidFieldHtml, $filename) || str_contains($invalidFieldHtml, 'Array')) {
        throw new RuntimeException('Non-scalar sponsor fields were not safely normalized.');
    }
} finally {
    wp_delete_attachment((int) $attachmentId, true);
    if (is_file($path)) {
        unlink($path);
    }
}

echo "ZDW sponsor block render integration test passed.\n";
