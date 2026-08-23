<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class DesignCanteenProgramCleanupMigration implements Migration
{
    public function __construct(private readonly DesignCanteenCleanupMigration $migration)
    {
    }

    public function id(): string
    {
        return '20260808_012_design_canteen_program_cleanup';
    }

    public function label(): string
    {
        return 'Odstranění zastaralého programu z české Design Canteen';
    }

    public function preflight(): array
    {
        return $this->remapChecks($this->migration->preflight());
    }

    public function apply(): void
    {
        $this->migration->apply();
    }

    public function verify(): array
    {
        return $this->remapChecks($this->migration->verify());
    }

    /** @param list<PreflightCheck> $checks
     *  @return list<PreflightCheck>
     */
    private function remapChecks(array $checks): array
    {
        return array_map(
            static fn (PreflightCheck $check): PreflightCheck => $check->withCode(
                'canteen.program_cleanup.' . str_replace('canteen.cs_', '', $check->code())
            ),
            $checks
        );
    }
}
