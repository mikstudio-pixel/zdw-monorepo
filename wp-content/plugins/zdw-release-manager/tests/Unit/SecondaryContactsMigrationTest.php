<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\SecondaryContactsMigration;
use ZDW\ReleaseManager\Tests\Support\FakeContactContentTransformer;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class SecondaryContactsMigrationTest extends TestCase
{
    public function test_expected_page_identity_is_a_hard_precondition(): void
    {
        $missingStore = new InMemoryPostStore(array_slice($this->posts(), 0, 3));
        $migration = new SecondaryContactsMigration($missingStore, new FakeContactContentTransformer());

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertStringContainsString('15608', $checks[0]->message());
    }

    public function test_apply_is_idempotent_and_updates_all_secondary_contacts(): void
    {
        $store = new InMemoryPostStore($this->posts());
        $migration = new SecondaryContactsMigration($store, new FakeContactContentTransformer());

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        self::assertSame([202, 1330, 15606, 15608], $store->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());

        $migration->apply();
        self::assertSame([202, 1330, 15606, 15608], $store->writes);
    }

    public function test_all_content_is_transformed_before_the_first_write(): void
    {
        $store = new InMemoryPostStore($this->posts());
        $transformer = new FakeContactContentTransformer();
        $transformer->throwOnContent = 'en press';
        $migration = new SecondaryContactsMigration($store, $transformer);

        try {
            $migration->apply();
            self::fail('Transform failure was not propagated.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('transform failure', $error->getMessage());
        }

        self::assertSame([], $store->writes);
    }

    public function test_apply_rolls_back_earlier_contacts_when_a_later_write_fails(): void
    {
        $store = new InMemoryPostStore($this->posts());
        $store->throwOnUpdateId = 1330;
        $migration = new SecondaryContactsMigration($store, new FakeContactContentTransformer());

        try {
            $migration->apply();
            self::fail('Later contact write failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('cs press', $store->find(202)?->content());
            self::assertSame('en press', $store->find(1330)?->content());
            self::assertSame([202, 202], $store->writes);
        }
    }

    /** @return list<PostRecord> */
    private function posts(): array
    {
        return [
            new PostRecord(202, 'pro-media', 'cs press'),
            new PostRecord(1330, 'press-kit', 'en press'),
            new PostRecord(15606, 'pristupnost-festivalu', 'cs accessibility'),
            new PostRecord(15608, 'festival-accessibility', 'en accessibility'),
        ];
    }
}
