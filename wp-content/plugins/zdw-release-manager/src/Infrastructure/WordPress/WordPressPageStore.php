<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use Throwable;
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

        return WordPressConditionalPostContentUpdater::update(
            $postId,
            $expectedContent,
            $content,
            'Podmíněná obnova stránky ID %d selhala.'
        );
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

        $metadata = get_post_meta($postId);
        if (!is_array($metadata)) {
            $metadata = [];
        }
        ksort($metadata);

        return hash('sha256', serialize(['post' => $fields, 'meta' => $metadata]));
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

    public function setLanguageIfCurrent(int $postId, ?string $expectedLanguage, ?string $language): bool
    {
        return $this->withPolylangWriteLock([$postId], function () use (
            $postId,
            $expectedLanguage,
            $language
        ): bool {
            if ($this->language($postId) !== $expectedLanguage) {
                return false;
            }

            $this->setLanguage($postId, $language);

            return $this->language($postId) === $language;
        });
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

    public function setTranslationsIfCurrent(array $expectedByPost, array $translations): bool
    {
        $postIds = array_values(array_unique(array_merge(
            array_map('intval', array_keys($expectedByPost)),
            array_map('intval', array_values($translations))
        )));

        return $this->withPolylangWriteLock($postIds, function () use (
            $expectedByPost,
            $translations
        ): bool {
            foreach ($expectedByPost as $postId => $expected) {
                $current = $this->translations($postId);
                ksort($current);
                ksort($expected);
                if ($current !== $expected) {
                    return false;
                }
            }

            $this->setTranslations($translations);
            $expectedResult = $translations;
            ksort($expectedResult);
            foreach ($translations as $postId) {
                $current = $this->translations($postId);
                ksort($current);
                if ($current !== $expectedResult) {
                    return false;
                }
            }

            return true;
        });
    }

    /** @param list<int> $postIds */
    private function withPolylangWriteLock(array $postIds, callable $callback): bool
    {
        $postIds = array_values(array_unique(array_filter(array_map('intval', $postIds))));
        if ([] === $postIds) {
            throw new RuntimeException('Pro podmíněný Polylang zápis chybí stránky.');
        }

        global $wpdb;
        $ownsTransaction = 1 !== (int) $wpdb->get_var('SELECT @@in_transaction');
        if ($ownsTransaction && false === $wpdb->query('START TRANSACTION')) {
            throw new RuntimeException('Nelze zahájit transakci pro Polylang zápis.');
        }

        try {
            $placeholders = implode(', ', array_fill(0, count($postIds), '%d'));
            $relationshipLocks = $wpdb->get_results($wpdb->prepare(
                "SELECT object_id, term_taxonomy_id
                FROM {$wpdb->term_relationships}
                WHERE object_id IN ({$placeholders})
                ORDER BY object_id, term_taxonomy_id
                FOR UPDATE",
                ...$postIds
            ));
            $taxonomyLocks = $wpdb->get_results(
                "SELECT term_taxonomy_id
                FROM {$wpdb->term_taxonomy}
                WHERE taxonomy IN ('language', 'post_translations')
                ORDER BY term_taxonomy_id
                FOR UPDATE"
            );
            if (!is_array($relationshipLocks) || !is_array($taxonomyLocks)) {
                throw new RuntimeException('Nelze uzamknout Polylang vazby pro podmíněný zápis.');
            }

            clean_object_term_cache($postIds, 'post');
            $result = (bool) $callback();
            if ($ownsTransaction && false === $wpdb->query('COMMIT')) {
                throw new RuntimeException('Nelze potvrdit podmíněný Polylang zápis.');
            }

            return $result;
        } catch (Throwable $error) {
            if ($ownsTransaction) {
                $wpdb->query('ROLLBACK');
            }
            clean_object_term_cache($postIds, 'post');

            throw $error;
        }
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
