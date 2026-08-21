<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use WP_Post;
use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class WordPressPageStore implements PageStore
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
        $this->assertUnfilteredHtmlCapability();
        if (!current_user_can('edit_post', $postId)) {
            throw new RuntimeException(sprintf('Aktuální účet nemůže upravit stránku ID %d.', $postId));
        }

        $result = wp_update_post(['ID' => $postId, 'post_content' => wp_slash($content)], true);
        if (is_wp_error($result) || $postId !== (int) $result) {
            $message = is_wp_error($result) ? $result->get_error_message() : 'Neznámá chyba WordPressu.';
            throw new RuntimeException(sprintf('Nelze aktualizovat stránku ID %d: %s', $postId, $message));
        }
    }

    public function updateContentIfCurrent(int $postId, string $expectedContent, string $content): bool
    {
        $this->assertUnfilteredHtmlCapability();
        if (!current_user_can('edit_post', $postId)) {
            throw new RuntimeException(sprintf('Aktuální účet nemůže upravit stránku ID %d.', $postId));
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
            throw new RuntimeException(sprintf('Podmíněná obnova stránky ID %d selhala.', $postId));
        }
        if (1 === $updated) {
            clean_post_cache($postId);

            return true;
        }

        return false;
    }

    public function findPageIdsBySlug(string $slug): array
    {
        $ids = get_posts([
            'name' => $slug,
            'post_type' => 'page',
            'post_status' => 'any',
            'numberposts' => -1,
            'fields' => 'ids',
            'suppress_filters' => true,
        ]);

        return array_values(array_map('intval', $ids));
    }

    public function createPage(string $title, string $slug, string $content): int
    {
        $this->assertUnfilteredHtmlCapability();

        $result = wp_insert_post([
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_title' => $title,
            'post_name' => $slug,
            'post_content' => wp_slash($content),
        ], true);
        if (is_wp_error($result)) {
            throw new RuntimeException($result->get_error_message());
        }

        return (int) $result;
    }

    public function deletePage(int $postId): void
    {
        if (!current_user_can('delete_post', $postId) || false === wp_delete_post($postId, true)) {
            throw new RuntimeException(sprintf('Nelze odstranit nově vytvořenou stránku ID %d.', $postId));
        }
    }

    public function pageFingerprint(int $postId): ?string
    {
        $post = get_post($postId, ARRAY_A);
        if (!is_array($post) || 'page' !== ($post['post_type'] ?? null)) {
            return null;
        }

        $fields = array_intersect_key($post, array_flip([
            'post_author',
            'post_date',
            'post_date_gmt',
            'post_content',
            'post_title',
            'post_excerpt',
            'post_status',
            'comment_status',
            'ping_status',
            'post_password',
            'post_name',
            'post_parent',
            'menu_order',
            'post_type',
        ]));

        return hash('sha256', serialize($fields));
    }

    public function setLanguage(int $postId, ?string $language): void
    {
        if (null === $language) {
            foreach (['post_translations', 'language'] as $taxonomy) {
                $result = wp_set_object_terms($postId, [], $taxonomy);
                if (is_wp_error($result)) {
                    throw new RuntimeException($result->get_error_message());
                }
            }

            return;
        }

        if (!function_exists('pll_set_post_language')) {
            throw new RuntimeException('Polylang API není dostupné.');
        }

        pll_set_post_language($postId, $language);
    }

    public function language(int $postId): ?string
    {
        if (!function_exists('pll_get_post_language')) {
            return null;
        }

        $language = pll_get_post_language($postId, 'slug');

        return is_string($language) && '' !== $language ? $language : null;
    }

    public function translations(int $postId): array
    {
        if (!function_exists('pll_get_post_translations')) {
            return [];
        }

        $translations = pll_get_post_translations($postId);
        if (!is_array($translations)) {
            return [];
        }

        $normalized = [];
        foreach ($translations as $language => $translationId) {
            if (is_string($language) && is_numeric($translationId)) {
                $normalized[$language] = (int) $translationId;
            }
        }

        return $normalized;
    }

    public function setTranslations(array $translations): void
    {
        if (!function_exists('pll_save_post_translations')) {
            throw new RuntimeException('Polylang API není dostupné.');
        }

        pll_save_post_translations($translations);
    }

    public function attachmentExists(int $attachmentId): bool
    {
        $post = get_post($attachmentId);

        return $post instanceof WP_Post
            && 'attachment' === $post->post_type
            && 'inherit' === $post->post_status;
    }

    public function attachmentFilename(int $attachmentId): ?string
    {
        if (!$this->attachmentExists($attachmentId)) {
            return null;
        }

        $path = get_attached_file($attachmentId);

        return is_string($path) && '' !== $path && is_file($path) ? basename($path) : null;
    }

    private function assertUnfilteredHtmlCapability(): void
    {
        if (!current_user_can('unfiltered_html')) {
            throw new RuntimeException('Aktuální účet nemůže bezpečně uložit nefiltrovaný Gutenberg obsah.');
        }
    }
}
