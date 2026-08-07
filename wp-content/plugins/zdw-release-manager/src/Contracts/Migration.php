<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\PreflightCheck;

interface Migration
{
    public function id(): string;

    public function label(): string;

    /** @return list<PreflightCheck> */
    public function preflight(): array;

    public function apply(): void;

    /** @return list<PreflightCheck> */
    public function verify(): array;
}
