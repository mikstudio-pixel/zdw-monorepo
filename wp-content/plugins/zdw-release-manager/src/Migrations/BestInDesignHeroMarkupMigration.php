<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class BestInDesignHeroMarkupMigration implements Migration
{
    public function __construct(private readonly BestInDesignHeroMigration $migration)
    {
    }

    public function id(): string
    {
        return '20260808_011_best_in_design_hero_markup';
    }

    public function label(): string
    {
        return 'Oprava uloženého HTML hero Best in Design';
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
                'bid.hero_markup.' . str_replace('bid.hero_', '', $check->code())
            ),
            $checks
        );
    }
}
