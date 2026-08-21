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
                ['en' => 43],
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
                ['en' => 43],
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
}
