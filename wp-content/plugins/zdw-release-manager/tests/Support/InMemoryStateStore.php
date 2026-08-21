<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\StateStore;

final class InMemoryStateStore implements StateStore
{
    /** @var array<string, true> */
    private array $applied = [];

    /** @var array<string, string> */
    private array $claims = [];

    private int $tokenSequence = 0;

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

    public function claim(string $migrationId): ?string
    {
        if ($this->isApplied($migrationId) || isset($this->claims[$migrationId])) {
            return null;
        }

        $token = $this->newToken();
        $this->claims[$migrationId] = $token;

        return $token;
    }

    public function release(string $migrationId, string $claimToken): void
    {
        if (($this->claims[$migrationId] ?? null) === $claimToken) {
            unset($this->claims[$migrationId]);
        }
    }

    public function renew(string $migrationId, string $claimToken): bool
    {
        return ($this->claims[$migrationId] ?? null) === $claimToken;
    }

    public function markApplied(string $migrationId, string $claimToken): void
    {
        if (($this->claims[$migrationId] ?? null) !== $claimToken) {
            throw new \RuntimeException('Nelze potvrdit migraci bez vlastnictví jejího zámku.');
        }

        $this->applied[$migrationId] = true;
        $this->release($migrationId, $claimToken);
    }

    public function replaceClaimForTest(string $migrationId): string
    {
        $token = $this->newToken();
        $this->claims[$migrationId] = $token;

        return $token;
    }

    public function hasClaimForTest(string $migrationId, string $claimToken): bool
    {
        return ($this->claims[$migrationId] ?? null) === $claimToken;
    }

    private function newToken(): string
    {
        ++$this->tokenSequence;

        return 'claim-' . $this->tokenSequence;
    }
}
