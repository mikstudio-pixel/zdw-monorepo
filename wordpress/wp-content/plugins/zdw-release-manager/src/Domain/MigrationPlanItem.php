<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class MigrationPlanItem
{
    public const APPLIED = 'applied';
    public const READY = 'ready';
    public const BLOCKED = 'blocked';

    /** @param list<PreflightCheck> $checks */
    public function __construct(
        private readonly string $migrationId,
        private readonly string $label,
        private readonly string $status,
        private readonly array $checks = []
    ) {
    }

    public function migrationId(): string
    {
        return $this->migrationId;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function status(): string
    {
        return $this->status;
    }

    /** @return list<PreflightCheck> */
    public function checks(): array
    {
        return $this->checks;
    }
}
