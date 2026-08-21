<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface OptionStore
{
    public function get(string $name): mixed;

    public function has(string $name): bool;

    public function set(string $name, mixed $value): void;

    /** @phpstan-impure */
    public function setIfCurrent(
        string $name,
        bool $expectedExists,
        mixed $expectedValue,
        mixed $value
    ): bool;

    public function delete(string $name): void;

    /** @phpstan-impure */
    public function deleteIfCurrent(string $name, mixed $expectedValue): bool;
}
