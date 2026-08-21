<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use WP_Post;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class WordPressPostStore implements PostStore
{
    public function find(int $postId): ?PostRecord
    {
        $post = get_post($postId);
        if (!$post instanceof WP_Post || 'page' !== $post->post_type || 'publish' !== $post->post_status) {
            return null;
        }

        return new PostRecord((int) $post->ID, (string) $post->post_name, (string) $post->post_content);
    }

    public function updateContent(int $postId, string $content): void
    {
        if (!current_user_can('unfiltered_html')) {
            throw new RuntimeException('Aktuální účet nemůže bezpečně uložit nefiltrovaný Gutenberg obsah.');
        }
        if (!current_user_can('edit_post', $postId)) {
            throw new RuntimeException(sprintf('Aktuální účet nemůže upravit stránku ID %d.', $postId));
        }

        $result = wp_update_post([
            'ID' => $postId,
            'post_content' => wp_slash($content),
        ], true);

        if (is_wp_error($result)) {
            throw new RuntimeException($result->get_error_message());
        }

        if ($postId !== (int) $result) {
            throw new RuntimeException(sprintf('WordPress neaktualizoval stránku ID %d.', $postId));
        }
    }

    public function updateContentIfCurrent(int $postId, string $expectedContent, string $content): bool
    {
        if (!current_user_can('unfiltered_html') || !current_user_can('edit_post', $postId)) {
            throw new RuntimeException(sprintf('Aktuální účet nemůže bezpečně obnovit stránku ID %d.', $postId));
        }

        global $wpdb;
        $updated = $wpdb->update(
            $wpdb->posts,
            [
                'post_content' => $content,
                'post_modified' => current_time('mysql'),
                'post_modified_gmt' => current_time('mysql', true),
            ],
            [
                'ID' => $postId,
                'post_type' => 'page',
                'post_status' => 'publish',
                'post_content' => $expectedContent,
            ],
            ['%s', '%s', '%s'],
            ['%d', '%s', '%s', '%s']
        );
        if (false === $updated) {
            throw new RuntimeException(sprintf('Podmíněná obnova stránky ID %d selhala.', $postId));
        }
        if (1 === $updated) {
            clean_post_cache($postId);

            return true;
        }

        return false;
    }
}
