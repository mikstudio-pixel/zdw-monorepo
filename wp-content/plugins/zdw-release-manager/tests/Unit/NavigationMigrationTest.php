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
        $pages = new InMemoryPageStore([
            new PostRecord(42, 'sponzori', 'content'),
            new PostRecord(43, 'partners', 'content'),
        ]);
        $navigation = new FakeNavigationStore();
        $migration = new NavigationMigration($pages, $navigation);

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();

        self::assertSame(1, $navigation->rebuilds);
        self::assertSame(['cs' => 42, 'en' => 43], $navigation->legacySponsorPageIds);
        self::assertTrue($navigation->enabled);
        self::assertSame('pass', $migration->verify()[0]->severity());

        $migration->apply();
        self::assertSame(1, $navigation->rebuilds);
    }

    public function test_an_unresolvable_blueprint_blocks_before_any_menu_is_rebuilt(): void
    {
        $pages = new InMemoryPageStore([
            new PostRecord(42, 'sponzori', 'content'),
            new PostRecord(43, 'partners', 'content'),
        ]);
        $navigation = new FakeNavigationStore();
        $navigation->blueprintsResolvable = false;
        $migration = new NavigationMigration($pages, $navigation);

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        $result = $migration->preflight()[0];
        self::assertStringContainsString('cílov', $result->message());

        $this->expectException(\RuntimeException::class);
        try {
            $migration->apply();
        } finally {
            self::assertSame(0, $navigation->rebuilds);
        }
    }

    public function test_missing_legacy_parents_block_before_any_menu_is_rebuilt(): void
    {
        $pages = new InMemoryPageStore([
            new PostRecord(42, 'sponzori', 'content'),
            new PostRecord(43, 'partners', 'content'),
        ]);
        $navigation = new FakeNavigationStore();
        $navigation->legacyParentsResolvable = false;
        $migration = new NavigationMigration($pages, $navigation);

        self::assertSame('blocker', $migration->preflight()[0]->severity());

        $this->expectException(\RuntimeException::class);
        try {
            $migration->apply();
        } finally {
            self::assertSame(0, $navigation->rebuilds);
        }
    }

    public function test_later_navigation_failure_restores_the_previous_visible_state(): void
    {
        $pages = new InMemoryPageStore([
            new PostRecord(42, 'sponzori', 'content'),
            new PostRecord(43, 'partners', 'content'),
        ]);
        $navigation = new FakeNavigationStore();
        $navigation->throwDuringAtomicAfterLegacy = true;
        $migration = new NavigationMigration($pages, $navigation);

        try {
            $migration->apply();
            self::fail('A later navigation failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame([], $navigation->legacySponsorPageIds);
            self::assertFalse($navigation->enabled);
            self::assertFalse($navigation->matching);
        }
    }

    public function test_failed_navigation_rollback_surfaces_the_recovery_failure(): void
    {
        $pages = new InMemoryPageStore([
            new PostRecord(42, 'sponzori', 'content'),
            new PostRecord(43, 'partners', 'content'),
        ]);
        $navigation = new FakeNavigationStore();
        $navigation->throwDuringAtomicAfterLegacy = true;
        $navigation->throwDuringRollback = true;

        $this->expectExceptionMessage('Obnova navigace nebyla dokončena');
        (new NavigationMigration($pages, $navigation))->apply();
    }
}
