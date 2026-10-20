<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\SponsorPageMigration;
use ZDW\ReleaseManager\Tests\Support\InMemoryPageStore;

final class SponsorPageMigrationTest extends TestCase
{
    public function test_missing_attachments_or_duplicate_slug_block_writes(): void
    {
        $store = new InMemoryPageStore([
            new PostRecord(1, 'sponzori', 'one'),
            new PostRecord(2, 'sponzori', 'two'),
        ]);
        $migration = new SponsorPageMigration($store, [10 => 'one.svg', 20 => 'two.svg'], 'desired');

        $checks = $migration->preflight();

        self::assertSame(['blocker', 'blocker'], array_map(
            static fn ($check): string => $check->severity(),
            $checks
        ));
        self::assertSame([], $store->writes);
    }

    public function test_missing_pages_are_created_and_linked_as_translations(): void
    {
        $store = new InMemoryPageStore([], [10 => 'one.svg', 20 => 'two.svg']);
        $migration = new SponsorPageMigration($store, [10 => 'one.svg', 20 => 'two.svg'], 'desired');

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();

        self::assertSame([1, 2], $store->writes);
        self::assertSame('cs', $store->language(1));
        self::assertSame('en', $store->language(2));
        self::assertSame(['cs' => 1, 'en' => 2], $store->translationGroup());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_existing_page_is_updated_idempotently(): void
    {
        $store = new InMemoryPageStore(
            [new PostRecord(42, 'sponzori', 'old')],
            [10 => 'one.svg', 20 => 'two.svg']
        );
        $migration = new SponsorPageMigration($store, [10 => 'one.svg', 20 => 'two.svg'], 'desired');

        $migration->apply();
        $migration->apply();

        self::assertSame([42, 43], $store->writes);
        self::assertSame('cs', $store->language(42));
        self::assertSame('en', $store->language(43));
        self::assertSame(['cs' => 42, 'en' => 43], $store->translationGroup());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_reused_attachment_id_with_wrong_file_blocks_writes(): void
    {
        $store = new InMemoryPageStore([], [10 => 'unrelated.svg']);
        $migration = new SponsorPageMigration($store, [10 => 'expected.svg'], 'desired');

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        self::assertSame([], $store->writes);
    }

    public function test_unpublished_slug_owner_blocks_page_creation(): void
    {
        $store = new InMemoryPageStore([], [10 => 'one.svg'], ['sponzori' => [77]]);
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertSame('sponsors.unpublished_slug', $checks[0]->code());
        self::assertSame([], $store->writes);
    }

    public function test_existing_page_in_another_language_blocks_reassignment(): void
    {
        $store = new InMemoryPageStore(
            [new PostRecord(42, 'sponzori', 'old')],
            [10 => 'one.svg'],
            [],
            [42 => 'en']
        );
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertSame('sponsors.language_conflict', $checks[0]->code());
        self::assertSame([], $store->writes);
    }

    public function test_later_language_failure_restores_existing_pages_and_removes_created_page(): void
    {
        $store = new InMemoryPageStore(
            [new PostRecord(42, 'sponzori', 'original')],
            [10 => 'one.svg'],
            [],
            [42 => 'cs']
        );
        $store->throwOnLanguageAttempts = [43 => [1]];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A later language failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 43', $error->getMessage());
            self::assertSame('original', $store->find(42)?->content());
            self::assertSame('cs', $store->language(42));
            self::assertSame([], $store->findPageIdsBySlug('partners'));
            self::assertSame([43], $store->deleted);
            self::assertSame([], $store->translationGroup());
        }
    }

    public function test_translation_failure_restores_content_and_original_translation_groups(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en'],
            ['cs' => 42, 'en' => 99]
        );
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation write failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
            self::assertSame(['cs' => 42, 'en' => 99], $store->translations(42));
            self::assertSame(['en' => 43], $store->translations(43));
            self::assertSame([
                ['cs' => 42, 'en' => 43],
                ['cs' => 42, 'en' => 99],
            ], $store->translationWrites);
        }
    }

    public function test_translation_failure_restores_previously_unlinked_pages(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en']
        );
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation write failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
            self::assertSame(['cs' => 42], $store->translations(42));
            self::assertSame(['en' => 43], $store->translations(43));
            self::assertSame([
                ['cs' => 42, 'en' => 43],
                ['cs' => 42],
            ], $store->translationWrites);
        }
    }

    public function test_matching_content_and_languages_are_not_ready_until_translations_are_linked(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'desired'),
                new PostRecord(43, 'partners', 'desired'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en']
        );
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        self::assertSame('warning', $migration->preflight()[0]->severity());
        self::assertSame('blocker', $migration->verify()[0]->severity());

        $migration->apply();

        self::assertSame(['cs' => 42, 'en' => 43], $store->translations(42));
        self::assertSame(['cs' => 42, 'en' => 43], $store->translations(43));
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_silent_translation_failure_rolls_back_page_content(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en']
        );
        $store->ignoreTranslationWrites = true;
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A silent translation failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('Propojení překladů', $error->getMessage());
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
        }
    }

    public function test_concurrent_editor_change_is_not_overwritten(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en']
        );
        $store->replaceContentBeforeConditionalUpdate = [42 => 'editor-change'];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A concurrent editor change should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('jiný požadavek', $error->getMessage());
            self::assertSame('editor-change', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
        }
    }

    public function test_concurrent_language_change_is_not_overwritten(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [43 => 'en']
        );
        $store->replaceLanguageBeforeConditionalSet = [42 => 'de'];

        try {
            (new SponsorPageMigration($store, [10 => 'one.svg'], 'desired'))->apply();
            self::fail('A concurrent language change should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('Jazyk', $error->getMessage());
            self::assertSame('de', $store->language(42));
            self::assertSame('original-cs', $store->find(42)?->content());
        }
    }

    public function test_concurrent_translation_change_is_not_overwritten(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en']
        );
        $store->replaceTranslationsBeforeConditionalSet = ['cs' => 42, 'en' => 99];

        try {
            (new SponsorPageMigration($store, [10 => 'one.svg'], 'desired'))->apply();
            self::fail('A concurrent translation change should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('Propojení překladů', $error->getMessage());
            self::assertStringContainsString('Překladové vazby', $error->getMessage());
            self::assertSame(['cs' => 42, 'en' => 99], $store->translations(42));
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
        }
    }

    public function test_translation_snapshot_is_not_refreshed_after_validation(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [42 => 'cs', 43 => 'en'],
            ['cs' => 42, 'en' => 43]
        );
        $store->replaceTranslationsBeforeReadAttempts = [
            42 => [3 => ['cs' => 42, 'en' => 99]],
        ];

        try {
            (new SponsorPageMigration($store, [10 => 'one.svg'], 'desired'))->apply();
            self::fail('A concurrent translation change should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('Propojení překladů', $error->getMessage());
            self::assertStringContainsString('Překladové vazby', $error->getMessage());
            self::assertSame(['cs' => 42, 'en' => 99], $store->translations(42));
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertSame('original-en', $store->find(43)?->content());
        }
    }

    public function test_translation_failure_restores_a_page_without_a_language(): void
    {
        $store = new InMemoryPageStore(
            [
                new PostRecord(42, 'sponzori', 'original-cs'),
                new PostRecord(43, 'partners', 'original-en'),
            ],
            [10 => 'one.svg'],
            [],
            [43 => 'en']
        );
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation write failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertNull($store->language(42));
            self::assertSame([], $store->translations(42));
            self::assertSame(['en' => 43], $store->translations(43));
            self::assertSame([
                ['cs' => 42, 'en' => 43],
                ['en' => 43],
            ], $store->translationWrites);
        }
    }

    public function test_concurrently_edited_created_page_is_not_deleted_during_rollback(): void
    {
        $store = new InMemoryPageStore([], [10 => 'one.svg']);
        $store->replaceContentBeforeTranslationAttempts = [1 => [1 => 'editor-created-content']];
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('souběžné úpravě', $error->getMessage());
            self::assertSame('editor-created-content', $store->find(1)?->content());
            self::assertNull($store->find(2));
            self::assertSame([2], $store->deleted);
        }
    }

    public function test_created_page_with_an_edited_non_content_field_is_not_deleted(): void
    {
        $store = new InMemoryPageStore([], [10 => 'one.svg']);
        $store->replaceFingerprintBeforeTranslationAttempts = [1 => [1 => 'editor-title-state']];
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('souběžné úpravě', $error->getMessage());
            self::assertSame('desired', $store->find(1)?->content());
            self::assertNull($store->find(2));
        }
    }

    public function test_created_page_with_an_edited_translation_group_is_not_deleted(): void
    {
        $store = new InMemoryPageStore([], [10 => 'one.svg']);
        $store->replaceTranslationsAfterTranslationAttempts = [1 => ['cs' => 1, 'en' => 99]];
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A translation failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('souběžné úpravě', $error->getMessage());
            self::assertNotNull($store->find(1));
            self::assertNull($store->find(2));
            self::assertSame(['cs' => 1, 'en' => 99], $store->translations(1));
        }
    }

    public function test_translation_failure_restores_existing_group_after_removing_created_page(): void
    {
        $store = new InMemoryPageStore(
            [new PostRecord(42, 'sponzori', 'original-cs')],
            [10 => 'one.svg'],
            [],
            [42 => 'cs'],
            ['cs' => 42, 'en' => 99]
        );
        $store->throwOnTranslationAttempts = [1];
        $migration = new SponsorPageMigration($store, [10 => 'one.svg'], 'desired');

        try {
            $migration->apply();
            self::fail('A mixed translation-group failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('original-cs', $store->find(42)?->content());
            self::assertNull($store->find(43));
            self::assertSame([43], $store->deleted);
            self::assertSame(['cs' => 42, 'en' => 99], $store->translations(42));
            self::assertNotContains(43, $store->translations(42));
        }
    }
}
