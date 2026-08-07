<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface StateStore
{
    public function isApplied(string $migrationId): bool;

    public function claim(string $migrationId): bool;

    public function release(string $migrationId): void;

    public function markApplied(string $migrationId): void;
}
