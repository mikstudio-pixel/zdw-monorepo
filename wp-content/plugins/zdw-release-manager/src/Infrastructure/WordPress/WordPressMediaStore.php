<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use WP_Post;
use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class WordPressMediaStore implements MediaStore
{
    public function findByFilename(string $filename): array
    {
        $ids = get_posts([
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'numberposts' => 10,
            'fields' => 'ids',
            'suppress_filters' => true,
            'meta_query' => [[
                'key' => '_wp_attached_file',
                'value' => '(^|/)' . preg_quote($filename, '/') . '$',
                'compare' => 'REGEXP',
            ]],
        ]);
        $assets = [];

        foreach ($ids as $id) {
            $path = (string) get_post_meta((int) $id, '_wp_attached_file', true);
            if ($filename !== basename($path)) {
                continue;
            }
            $asset = $this->find((int) $id);
            if ($asset instanceof MediaAsset) {
                $assets[] = $asset;
            }
        }

        return $assets;
    }

    public function find(int $attachmentId): ?MediaAsset
    {
        $post = get_post($attachmentId);
        if (!$post instanceof WP_Post || 'attachment' !== $post->post_type || 'inherit' !== $post->post_status) {
            return null;
        }

        $url = wp_get_attachment_url($attachmentId);

        return is_string($url) && '' !== $url ? new MediaAsset($attachmentId, $url) : null;
    }
}
