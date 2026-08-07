<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Application\MigrationRunner;
use ZDW\ReleaseManager\Domain\MigrationRegistry;
use ZDW\ReleaseManager\Domain\PreflightCheck;
use ZDW\ReleaseManager\Domain\RunResult;
use ZDW\ReleaseManager\Tests\Support\InMemoryStateStore;
use ZDW\ReleaseManager\Tests\Support\SpyMigration;

final class RunnerTest extends TestCase
{
    public function test_plan_distinguishes_applied_ready_and_blocked_migrations(): void
    {
        $applied = new SpyMigration('20260807_001_audit', 'Audit');
        $ready = new SpyMigration(
            '20260807_002_contacts',
            'Kontakty',
            [PreflightCheck::warning('contacts.changed', 'Kontakty byly od posledního exportu změněny.')]
        );
        $blocked = new SpyMigration(
            '20260807_003_menu',
            'Menu',
            [PreflightCheck::blocker('menu.missing', 'Chybí původní Header Menu.')]
        );
        $runner = new MigrationRunner(
            new MigrationRegistry([$applied, $ready, $blocked]),
            new InMemoryStateStore([$applied->id()])
        );

        $plan = $runner->plan();

        self::assertSame('applied', $plan[0]->status());
        self::assertSame('ready', $plan[1]->status());
        self::assertSame('blocked', $plan[2]->status());
        self::assertSame(0, $applied->preflightCalls, 'Applied migrations must not run preflight again.');
    }

    public function test_a_blocker_prevents_all_writes(): void
    {
        $migration = new SpyMigration(
            '20260807_001_audit',
            'Audit',
            [PreflightCheck::blocker('theme.missing', 'Chybí parent theme.')]
        );
        $store = new InMemoryStateStore();
        $runner = new MigrationRunner(new MigrationRegistry([$migration]), $store);

        $result = $runner->apply($migration->id());

        self::assertSame(RunResult::BLOCKED, $result->status());
        self::assertSame(0, $migration->applyCalls);
        self::assertFalse($store->isApplied($migration->id()));
    }

    public function test_successful_migration_is_verified_and_marked_applied(): void
    {
        $migration = new SpyMigration(
            '20260807_001_audit',
            'Audit',
            [PreflightCheck::pass('theme.ready', 'Theme je dostupná.')],
            [PreflightCheck::pass('audit.saved', 'Audit byl uložen.')]
        );
        $store = new InMemoryStateStore();
        $runner = new MigrationRunner(new MigrationRegistry([$migration]), $store);

        $result = $runner->apply($migration->id());

        self::assertSame(RunResult::APPLIED, $result->status());
        self::assertSame(1, $migration->applyCalls);
        self::assertSame(1, $migration->verifyCalls);
        self::assertTrue($store->isApplied($migration->id()));

        $secondResult = $runner->apply($migration->id());
        self::assertSame(RunResult::SKIPPED, $secondResult->status());
        self::assertSame(1, $migration->applyCalls, 'An applied migration must be idempotently skipped.');
    }

    public function test_failed_apply_is_reported_and_never_marked_applied(): void
    {
        $migration = new SpyMigration('20260807_001_audit', 'Audit');
        $migration->throwOnApply = true;
        $store = new InMemoryStateStore();
        $runner = new MigrationRunner(new MigrationRegistry([$migration]), $store);

        $result = $runner->apply($migration->id());

        self::assertSame(RunResult::FAILED, $result->status());
        self::assertStringContainsString('Simulated apply failure', $result->message());
        self::assertFalse($store->isApplied($migration->id()));

        $migration->throwOnApply = false;
        self::assertSame(RunResult::APPLIED, $runner->apply($migration->id())->status());
    }

    public function test_failed_verification_is_never_marked_applied(): void
    {
        $migration = new SpyMigration(
            '20260807_001_audit',
            'Audit',
            [],
            [PreflightCheck::blocker('audit.missing', 'Audit se nepodařilo ověřit.')]
        );
        $store = new InMemoryStateStore();
        $runner = new MigrationRunner(new MigrationRegistry([$migration]), $store);

        $result = $runner->apply($migration->id());

        self::assertSame(RunResult::FAILED, $result->status());
        self::assertFalse($store->isApplied($migration->id()));

        $migration->setVerification([PreflightCheck::pass('audit.saved', 'Audit byl uložen.')]);
        self::assertSame(RunResult::APPLIED, $runner->apply($migration->id())->status());
    }

    public function test_an_active_claim_prevents_a_concurrent_apply(): void
    {
        $migration = new SpyMigration('20260807_001_audit', 'Audit');
        $store = new InMemoryStateStore();
        self::assertTrue($store->claim($migration->id()));
        $runner = new MigrationRunner(new MigrationRegistry([$migration]), $store);

        $result = $runner->apply($migration->id());

        self::assertSame(RunResult::SKIPPED, $result->status());
        self::assertSame(0, $migration->applyCalls);
        self::assertStringContainsString('jiný požadavek', $result->message());
    }

    public function test_unknown_migration_id_is_reported_without_throwing(): void
    {
        $runner = new MigrationRunner(new MigrationRegistry(), new InMemoryStateStore());

        $result = $runner->apply('20260807_999_unknown');

        self::assertSame(RunResult::FAILED, $result->status());
        self::assertStringContainsString('Neznámá migrace', $result->message());
    }
}
