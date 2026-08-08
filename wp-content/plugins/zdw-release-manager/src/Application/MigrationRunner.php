<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Application;

use Throwable;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\StateStore;
use ZDW\ReleaseManager\Domain\MigrationPlanItem;
use ZDW\ReleaseManager\Domain\MigrationRegistry;
use ZDW\ReleaseManager\Domain\PreflightCheck;
use ZDW\ReleaseManager\Domain\RunResult;

final class MigrationRunner
{
    private const EXECUTION_LOCK_ID = '__zdw_release_manager_execution__';

    public function __construct(
        private readonly MigrationRegistry $registry,
        private readonly StateStore $stateStore
    ) {
    }

    /** @return list<MigrationPlanItem> */
    public function plan(): array
    {
        $plan = [];

        foreach ($this->registry->all() as $migration) {
            if ($this->stateStore->isApplied($migration->id())) {
                $plan[] = new MigrationPlanItem(
                    $migration->id(),
                    $migration->label(),
                    MigrationPlanItem::APPLIED
                );
                continue;
            }

            try {
                $checks = $migration->preflight();
                $status = $this->hasBlocker($checks)
                    ? MigrationPlanItem::BLOCKED
                    : MigrationPlanItem::READY;
            } catch (Throwable $error) {
                $checks = [PreflightCheck::blocker('preflight.exception', $error->getMessage())];
                $status = MigrationPlanItem::BLOCKED;
            }

            $plan[] = new MigrationPlanItem(
                $migration->id(),
                $migration->label(),
                $status,
                $checks
            );
        }

        return $plan;
    }

    public function apply(string $migrationId): RunResult
    {
        try {
            $migration = $this->registry->get($migrationId);
        } catch (Throwable $error) {
            return new RunResult(RunResult::FAILED, $error->getMessage());
        }

        if ($this->stateStore->isApplied($migrationId)) {
            return new RunResult(RunResult::SKIPPED, 'Migrace už byla aplikována.');
        }

        $executionToken = $this->stateStore->claim(self::EXECUTION_LOCK_ID);
        if (null === $executionToken) {
            return new RunResult(
                RunResult::SKIPPED,
                'Migraci právě provádí jiný požadavek; zkuste to znovu po jeho dokončení.'
            );
        }

        try {
            if ($this->stateStore->isApplied($migrationId)) {
                return new RunResult(RunResult::SKIPPED, 'Migrace už byla aplikována.');
            }

            try {
                $preflight = $migration->preflight();
            } catch (Throwable $error) {
                return new RunResult(RunResult::FAILED, $error->getMessage());
            }

            if ($this->hasBlocker($preflight)) {
                return new RunResult(
                    RunResult::BLOCKED,
                    'Migraci blokuje neúspěšná vstupní kontrola.',
                    $preflight
                );
            }

            $claimToken = $this->stateStore->claim($migrationId);
            if (null === $claimToken) {
                return new RunResult(
                    RunResult::SKIPPED,
                    'Migraci právě provádí jiný požadavek nebo už byla aplikována.'
                );
            }

            try {
                $migration->apply();
                $verification = $migration->verify();

                if ($this->hasBlocker($verification)) {
                    $this->stateStore->release($migrationId, $claimToken);

                    return new RunResult(
                        RunResult::FAILED,
                        'Závěrečné ověření migrace selhalo.',
                        $verification
                    );
                }

                $this->stateStore->markApplied($migrationId, $claimToken);
            } catch (Throwable $error) {
                $this->stateStore->release($migrationId, $claimToken);

                return new RunResult(
                    RunResult::FAILED,
                    $error->getMessage()
                );
            }

            return new RunResult(
                RunResult::APPLIED,
                'Migrace byla úspěšně aplikována.',
                $verification
            );
        } finally {
            $this->stateStore->release(self::EXECUTION_LOCK_ID, $executionToken);
        }
    }

    /** @param list<PreflightCheck> $checks */
    private function hasBlocker(array $checks): bool
    {
        foreach ($checks as $check) {
            if ($check->isBlocking()) {
                return true;
            }
        }

        return false;
    }
}
