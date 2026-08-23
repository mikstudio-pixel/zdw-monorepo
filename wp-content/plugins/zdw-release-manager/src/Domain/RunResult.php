<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class RunResult
{
    public const APPLIED = 'applied';
    public const SKIPPED = 'skipped';
    public const BLOCKED = 'blocked';
    public const FAILED = 'failed';

    /** @param list<PreflightCheck> $checks */
    public function __construct(
        private readonly string $status,
        private readonly string $message,
        private readonly array $checks = []
    ) {
    }

    public function status(): string
    {
        return $this->status;
    }

    public function message(): string
    {
        return $this->message;
    }

    /** @return list<PreflightCheck> */
    public function checks(): array
    {
        return $this->checks;
    }
}
