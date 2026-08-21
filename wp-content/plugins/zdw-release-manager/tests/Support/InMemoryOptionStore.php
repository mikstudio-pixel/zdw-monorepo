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

    /** @var list<string> */
    public array $deletes = [];

    /** @var array<string, list<int>> */
    public array $throwOnSetAttempts = [];

    /** @var array<string, int> */
    private array $setAttempts = [];

    /** @var array<string, mixed> */
    public array $replaceBeforeConditionalSet = [];

    /** @var array<string, array<int, mixed>> */
    public array $replaceBeforeHasAttempts = [];

    /** @var array<string, int> */
    private array $hasAttempts = [];

    /** @param array<string, mixed> $values */
    public function __construct(array $values = [])
    {
        $this->values = $values;
    }

    public function get(string $name): mixed
    {
        return $this->values[$name] ?? null;
    }

    public function has(string $name): bool
    {
        $attempt = ($this->hasAttempts[$name] ?? 0) + 1;
        $this->hasAttempts[$name] = $attempt;
        if (array_key_exists($attempt, $this->replaceBeforeHasAttempts[$name] ?? [])) {
            $this->values[$name] = $this->replaceBeforeHasAttempts[$name][$attempt];
        }

        return array_key_exists($name, $this->values);
    }

    public function set(string $name, mixed $value): void
    {
        $attempt = ($this->setAttempts[$name] ?? 0) + 1;
        $this->setAttempts[$name] = $attempt;
        $this->values[$name] = $value;
        $this->writes[] = $name;
        if (in_array($attempt, $this->throwOnSetAttempts[$name] ?? [], true)) {
            throw new \RuntimeException(sprintf('Option write failed for %s.', $name));
        }
    }

    /** @phpstan-impure */
    public function setIfCurrent(
        string $name,
        bool $expectedExists,
        mixed $expectedValue,
        mixed $value
    ): bool {
        if (array_key_exists($name, $this->replaceBeforeConditionalSet)) {
            $this->values[$name] = $this->replaceBeforeConditionalSet[$name];
            unset($this->replaceBeforeConditionalSet[$name]);
        }
        if (array_key_exists($name, $this->values) !== $expectedExists
            || ($expectedExists && !$this->valuesMatch($this->values[$name], $expectedValue))) {
            return false;
        }

        $this->set($name, $value);

        return true;
    }

    public function delete(string $name): void
    {
        unset($this->values[$name]);
        $this->writes[] = $name;
        $this->deletes[] = $name;
    }

    /** @phpstan-impure */
    public function deleteIfCurrent(string $name, mixed $expectedValue): bool
    {
        if (!array_key_exists($name, $this->values)
            || !$this->valuesMatch($this->values[$name], $expectedValue)) {
            return false;
        }

        $this->delete($name);

        return true;
    }

    private function valuesMatch(mixed $actual, mixed $expected): bool
    {
        return $actual === $expected
            || (is_scalar($actual) && is_scalar($expected) && (string) $actual === (string) $expected);
    }
}
