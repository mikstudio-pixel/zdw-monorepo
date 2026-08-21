<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use WP_Post;

final class WordPressConditionalPostContentUpdater
{
    public static function update(
        int $postId,
        string $expectedContent,
        string $content,
        string $failureMessage
    ): bool {
        $postBefore = get_post($postId);
        if (!$postBefore instanceof WP_Post
            || 'page' !== $postBefore->post_type
            || 'publish' !== $postBefore->post_status
            || $expectedContent !== (string) $postBefore->post_content) {
            return false;
        }

        global $wpdb;
        $updated = $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$wpdb->posts}
                SET post_content = %s, post_modified = %s, post_modified_gmt = %s
                WHERE ID = %d AND post_type = 'page' AND post_status = 'publish'
                    AND CAST(post_content AS BINARY) = CAST(%s AS BINARY)",
                $content,
                current_time('mysql'),
                current_time('mysql', true),
                $postId,
                $expectedContent
            )
        );
        if (false === $updated) {
            throw new RuntimeException(sprintf($failureMessage, $postId));
        }
        if (1 !== $updated) {
            return false;
        }

        clean_post_cache($postId);
        $postAfter = get_post($postId);
        if (!$postAfter instanceof WP_Post) {
            throw new RuntimeException(sprintf('Aktualizovanou stránku ID %d nelze načíst.', $postId));
        }

        self::saveRevision($postBefore);
        self::dispatchUpdateLifecycle($postId, $postBefore, $postAfter);

        return true;
    }

    private static function saveRevision(WP_Post $postBefore): void
    {
        if (!wp_revisions_enabled($postBefore)) {
            return;
        }

        $revisionId = _wp_put_post_revision($postBefore);
        if (is_wp_error($revisionId) || 0 === $revisionId) {
            $message = is_wp_error($revisionId)
                ? $revisionId->get_error_message()
                : 'WordPress revizi nevytvořil.';
            throw new RuntimeException(sprintf(
                'Nelze uložit revizi stránky ID %d: %s',
                $postBefore->ID,
                $message
            ));
        }
    }

    private static function dispatchUpdateLifecycle(
        int $postId,
        WP_Post $postBefore,
        WP_Post $postAfter
    ): void {
        wp_transition_post_status($postAfter->post_status, $postBefore->post_status, $postAfter);
        do_action("edit_post_{$postAfter->post_type}", $postId, $postAfter);
        do_action('edit_post', $postId, $postAfter);
        do_action('post_updated', $postId, $postAfter, $postBefore);
        do_action("save_post_{$postAfter->post_type}", $postId, $postAfter, true);
        do_action('save_post', $postId, $postAfter, true);
        do_action('wp_insert_post', $postId, $postAfter, true);
        wp_after_insert_post($postAfter, true, $postBefore);
    }
}
