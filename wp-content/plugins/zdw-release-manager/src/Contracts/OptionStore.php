<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface OptionStore
{
    public function get(string $name): mixed;

    public function set(string $name, mixed $value): void;
}
