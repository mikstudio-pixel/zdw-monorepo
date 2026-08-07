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
}
