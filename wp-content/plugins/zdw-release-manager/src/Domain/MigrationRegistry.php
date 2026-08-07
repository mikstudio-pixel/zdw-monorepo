<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

use InvalidArgumentException;
use ZDW\ReleaseManager\Contracts\Migration;

final class MigrationRegistry
{
    /** @var array<string, Migration> */
    private array $migrations = [];

    /** @param iterable<Migration> $migrations */
    public function __construct(iterable $migrations = [])
    {
        foreach ($migrations as $migration) {
            $this->add($migration);
        }
    }

    public function add(Migration $migration): void
    {
        $id = $migration->id();

        if (preg_match('/^\d{8}_\d{3}_[a-z0-9_]+$/', $id) !== 1) {
            throw new InvalidArgumentException(sprintf('Invalid migration ID: %s', $id));
        }

        if (isset($this->migrations[$id])) {
            throw new InvalidArgumentException(sprintf('Duplicate migration ID: %s', $id));
        }

        $this->migrations[$id] = $migration;
    }

    /** @return list<Migration> */
    public function all(): array
    {
        return array_values($this->migrations);
    }

    public function get(string $migrationId): Migration
    {
        if (!isset($this->migrations[$migrationId])) {
            throw new InvalidArgumentException(sprintf('Unknown migration: %s', $migrationId));
        }

        return $this->migrations[$migrationId];
    }
}
