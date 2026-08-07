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

        try {
            $migration->apply();
            $verification = $migration->verify();

            if ($this->hasBlocker($verification)) {
                return new RunResult(
                    RunResult::FAILED,
                    'Závěrečné ověření migrace selhalo.',
                    $verification
                );
            }

            $this->stateStore->markApplied($migrationId);
        } catch (Throwable $error) {
            return new RunResult(RunResult::FAILED, $error->getMessage());
        }

        return new RunResult(
            RunResult::APPLIED,
            'Migrace byla úspěšně aplikována.',
            $verification
        );
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
