<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\DesiredPostContentMigration;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class DesiredPostContentMigrationTest extends TestCase
{
    public function test_missing_or_mismatched_posts_block_the_migration(): void
    {
        $store = new InMemoryPostStore([
            new PostRecord(17, 'wrong-slug', 'old'),
        ]);
        $migration = $this->migration($store);

        $checks = $migration->preflight();

        self::assertSame(['blocker', 'blocker'], array_map(
            static fn ($check): string => $check->severity(),
            $checks
        ));
        self::assertSame([], $store->writes);
    }

    public function test_apply_updates_only_changed_content_and_verifies_it(): void
    {
        $store = new InMemoryPostStore([
            new PostRecord(17, 'kontakty', 'old'),
            new PostRecord(179, 'contacts', 'english'),
        ]);
        $migration = $this->migration($store);

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $verification = $migration->verify();

        self::assertSame([17], $store->writes);
        self::assertSame('pass', $verification[0]->severity());
    }

    public function test_apply_rechecks_identity_before_writing(): void
    {
        $store = new InMemoryPostStore([new PostRecord(17, 'wrong-slug', 'old')]);
        $migration = $this->migration($store);

        $this->expectException(RuntimeException::class);

        try {
            $migration->apply();
        } finally {
            self::assertSame([], $store->writes);
        }
    }

    private function migration(InMemoryPostStore $store): DesiredPostContentMigration
    {
        return new DesiredPostContentMigration(
            '20260807_002_primary_contacts',
            'Hlavní kontakty',
            $store,
            [
                17 => ['slug' => 'kontakty', 'content' => 'czech'],
                179 => ['slug' => 'contacts', 'content' => 'english'],
            ]
        );
    }
}
