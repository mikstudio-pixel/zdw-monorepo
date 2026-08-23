<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface StateStore
{
    public function isApplied(string $migrationId): bool;

    /**
     * Acquire a migration lease.
     *
     * The returned opaque token owns the lease. A null result means another
     * request owns it or the migration has already been applied.
     */
    public function claim(string $migrationId): ?string;

    /** Renew only the lease identified by the supplied ownership token. */
    public function renew(string $migrationId, string $claimToken): bool;

    public function release(string $migrationId, string $claimToken): void;

    /** Complete only the lease identified by the supplied ownership token. */
    public function markApplied(string $migrationId, string $claimToken): void;
}
