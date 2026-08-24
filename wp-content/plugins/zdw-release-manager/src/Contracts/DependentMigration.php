<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface DependentMigration
{
    /** @return list<string> */
    public function dependencies(): array;
}
