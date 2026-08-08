<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use ZDW\ReleaseManager\Contracts\Migration;

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
        return $this->migration->preflight();
    }

    public function apply(): void
    {
        $this->migration->apply();
    }

    public function verify(): array
    {
        return $this->migration->verify();
    }
}
