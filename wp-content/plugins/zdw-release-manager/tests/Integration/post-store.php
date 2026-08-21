<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPageStore;

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
    $pageStore = new WordPressPageStore();
    if (null === $store->find((int) $publishedPage)) {
        throw new RuntimeException('Published page was not accepted.');
    }
    if (null !== $store->find((int) $draftPage) || null !== $store->find((int) $publishedPost)) {
        throw new RuntimeException('Draft page or non-page migration target was accepted.');
    }
    $fingerprintBeforeMetadata = $pageStore->pageFingerprint((int) $publishedPage);
    update_post_meta((int) $publishedPage, '_wp_page_template', 'review-fixture.php');
    if ($fingerprintBeforeMetadata === $pageStore->pageFingerprint((int) $publishedPage)) {
        throw new RuntimeException('Page metadata was omitted from the rollback fingerprint.');
    }
    delete_post_meta((int) $publishedPage, '_wp_page_template');
    if (function_exists('pll_set_post_language')) {
        $publishedLanguage = $pageStore->language((int) $publishedPage);
        $targetLanguage = 'cs' === $publishedLanguage ? 'en' : 'cs';
        if (!$pageStore->setLanguageIfCurrent((int) $publishedPage, $publishedLanguage, $targetLanguage)
            || $pageStore->setLanguageIfCurrent((int) $publishedPage, $publishedLanguage, $targetLanguage)) {
            throw new RuntimeException('Conditional language write did not enforce its locked expectation.');
        }
        $draftLanguage = $pageStore->language((int) $draftPage);
        $draftTargetLanguage = 'cs' === $targetLanguage ? 'en' : 'cs';
        if (!$pageStore->setLanguageIfCurrent((int) $draftPage, $draftLanguage, $draftTargetLanguage)) {
            throw new RuntimeException('Conditional language fixture could not assign its second language.');
        }
        $translationExpectations = [
            (int) $publishedPage => $pageStore->translations((int) $publishedPage),
            (int) $draftPage => $pageStore->translations((int) $draftPage),
        ];
        $desiredTranslations = [
            $targetLanguage => (int) $publishedPage,
            $draftTargetLanguage => (int) $draftPage,
        ];
        if (!$pageStore->setTranslationsIfCurrent($translationExpectations, $desiredTranslations)
            || $pageStore->setTranslationsIfCurrent([(int) $publishedPage => []], $desiredTranslations)) {
            throw new RuntimeException('Conditional translation write did not enforce its locked expectations.');
        }

        $translationTerms = wp_get_object_terms(
            (int) $publishedPage,
            'post_translations',
            ['fields' => 'all']
        );
        $translationTerm = is_array($translationTerms) ? reset($translationTerms) : false;
        if (!$translationTerm instanceof WP_Term) {
            throw new RuntimeException('A translation term fixture is required for the cache-lock test.');
        }
        global $wpdb;
        $termTaxonomyId = (int) $translationTerm->term_taxonomy_id;
        $originalDescription = (string) $wpdb->get_var($wpdb->prepare(
            "SELECT description FROM {$wpdb->term_taxonomy} WHERE term_taxonomy_id = %d",
            $termTaxonomyId
        ));
        $translationLanguages = array_keys($desiredTranslations);
        $translationPageIds = array_values($desiredTranslations);
        $editorTranslations = [
            $translationLanguages[0] => $translationPageIds[1],
            $translationLanguages[1] => $translationPageIds[0],
        ];
        try {
            if (1 !== $wpdb->update(
                $wpdb->term_taxonomy,
                ['description' => serialize($editorTranslations)],
                ['term_taxonomy_id' => $termTaxonomyId],
                ['%s'],
                ['%d']
            )) {
                throw new RuntimeException('The translation cache fixture could not emulate an editor write.');
            }
            if ($pageStore->setTranslationsIfCurrent(
                array_fill_keys(array_values($desiredTranslations), $desiredTranslations),
                $desiredTranslations
            )) {
                throw new RuntimeException('A cached translation term hid a newer editor mapping.');
            }
        } finally {
            $wpdb->update(
                $wpdb->term_taxonomy,
                ['description' => $originalDescription],
                ['term_taxonomy_id' => $termTaxonomyId],
                ['%s'],
                ['%d']
            );
            clean_term_cache([(int) $translationTerm->term_id], 'post_translations', false);
            clean_object_term_cache(array_values($desiredTranslations), 'post');
        }

        $lockedWrite = new ReflectionMethod($pageStore, 'withPolylangWriteLock');
        $originalExcerpt = (string) get_post_field('post_excerpt', (int) $publishedPage, 'raw');
        $lockedResult = $lockedWrite->invoke(
            $pageStore,
            [(int) $publishedPage],
            static function () use ($wpdb, $publishedPage): bool {
                $wpdb->update(
                    $wpdb->posts,
                    ['post_excerpt' => 'uncommitted-lock-fixture'],
                    ['ID' => (int) $publishedPage],
                    ['%s'],
                    ['%d']
                );

                return false;
            }
        );
        clean_post_cache((int) $publishedPage);
        if (false !== $lockedResult
            || $originalExcerpt !== (string) get_post_field('post_excerpt', (int) $publishedPage, 'raw')) {
            throw new RuntimeException('A failed locked Polylang callback committed its partial database write.');
        }
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
    $throwingLifecycle = static function (int $postId) use ($publishedPage): void {
        if ((int) $publishedPage === $postId) {
            throw new RuntimeException('Lifecycle fixture failure.');
        }
    };
    add_action('wp_after_insert_post', $throwingLifecycle, 10, 1);
    try {
        try {
            $store->updateContentIfCurrent(
                (int) $publishedPage,
                'conditional-restore',
                'lifecycle-failure'
            );
            throw new RuntimeException('A throwing lifecycle hook unexpectedly completed the update.');
        } catch (RuntimeException $error) {
            if (!str_contains($error->getMessage(), 'Lifecycle fixture failure.')) {
                throw $error;
            }
        }
    } finally {
        remove_action('wp_after_insert_post', $throwingLifecycle, 10);
    }
    if ('conditional-restore' !== $store->find((int) $publishedPage)?->content()) {
        throw new RuntimeException('A post-write lifecycle failure left migrated content persisted.');
    }
} finally {
    wp_set_current_user($previousUserId);
    wp_delete_post((int) $publishedPage, true);
    wp_delete_post((int) $draftPage, true);
    wp_delete_post((int) $publishedPost, true);
}

echo "WordPressPostStore integration test passed.\n";
