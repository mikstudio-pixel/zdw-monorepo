<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class SpyMigration implements Migration
{
    public int $preflightCalls = 0;
    public int $applyCalls = 0;
    public int $verifyCalls = 0;
    public bool $throwOnApply = false;

    /** @param list<PreflightCheck> $preflightChecks
     *  @param list<PreflightCheck> $verificationChecks
     */
    public function __construct(
        private readonly string $migrationId,
        private readonly string $migrationLabel,
        private array $preflightChecks = [],
        private array $verificationChecks = []
    ) {
    }

    public function id(): string
    {
        return $this->migrationId;
    }

    public function label(): string
    {
        return $this->migrationLabel;
    }

    public function preflight(): array
    {
        ++$this->preflightCalls;

        return $this->preflightChecks;
    }

    public function apply(): void
    {
        ++$this->applyCalls;

        if ($this->throwOnApply) {
            throw new RuntimeException('Simulated apply failure.');
        }
    }

    public function verify(): array
    {
        ++$this->verifyCalls;

        return $this->verificationChecks;
    }
}
