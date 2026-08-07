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

    public function findPageIdsBySlug(string $slug): array
    {
        $ids = get_posts([
            'name' => $slug,
            'post_type' => 'page',
            'post_status' => 'publish',
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

    public function setLanguage(int $postId, string $language): void
    {
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

        return is_string($path) && '' !== $path ? basename($path) : null;
    }

    private function assertUnfilteredHtmlCapability(): void
    {
        if (!current_user_can('unfiltered_html')) {
            throw new RuntimeException('Aktuální účet nemůže bezpečně uložit nefiltrovaný Gutenberg obsah.');
        }
    }
}
