<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\OptionStore;

final class InMemoryOptionStore implements OptionStore
{
    /** @var array<string, mixed> */
    private array $values;

    /** @var list<string> */
    public array $writes = [];

    /** @param array<string, mixed> $values */
    public function __construct(array $values = [])
    {
        $this->values = $values;
    }

    public function get(string $name): mixed
    {
        return $this->values[$name] ?? null;
    }

    public function set(string $name, mixed $value): void
    {
        $this->values[$name] = $value;
        $this->writes[] = $name;
    }
}
