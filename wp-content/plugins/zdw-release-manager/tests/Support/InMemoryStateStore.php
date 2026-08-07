<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\StateStore;

final class InMemoryStateStore implements StateStore
{
    /** @var array<string, true> */
    private array $applied = [];

    /** @var array<string, true> */
    private array $claims = [];

    /** @param list<string> $applied */
    public function __construct(array $applied = [])
    {
        foreach ($applied as $migrationId) {
            $this->applied[$migrationId] = true;
        }
    }

    public function isApplied(string $migrationId): bool
    {
        return isset($this->applied[$migrationId]);
    }

    public function claim(string $migrationId): bool
    {
        if ($this->isApplied($migrationId) || isset($this->claims[$migrationId])) {
            return false;
        }

        $this->claims[$migrationId] = true;

        return true;
    }

    public function release(string $migrationId): void
    {
        unset($this->claims[$migrationId]);
    }

    public function markApplied(string $migrationId): void
    {
        $this->applied[$migrationId] = true;
        $this->release($migrationId);
    }
}
