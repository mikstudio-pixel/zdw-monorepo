<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\NavigationMigration;
use ZDW\ReleaseManager\Tests\Support\FakeNavigationStore;
use ZDW\ReleaseManager\Tests\Support\InMemoryPageStore;

final class NavigationMigrationTest extends TestCase
{
    public function test_missing_sponsor_page_or_navigation_api_blocks_apply(): void
    {
        $pages = new InMemoryPageStore();
        $navigation = new FakeNavigationStore();
        $navigation->available = false;
        $migration = new NavigationMigration($pages, $navigation);

        $checks = $migration->preflight();

        self::assertSame(['blocker', 'blocker'], array_map(
            static fn ($check): string => $check->severity(),
            $checks
        ));
    }

    public function test_apply_rebuilds_navigation_and_is_idempotent(): void
    {
        $pages = new InMemoryPageStore([new PostRecord(42, 'sponzori', 'content')]);
        $navigation = new FakeNavigationStore();
        $migration = new NavigationMigration($pages, $navigation);

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();

        self::assertSame(1, $navigation->rebuilds);
        self::assertSame(42, $navigation->legacySponsorPageId);
        self::assertSame('pass', $migration->verify()[0]->severity());

        $migration->apply();
        self::assertSame(1, $navigation->rebuilds);
    }
}
