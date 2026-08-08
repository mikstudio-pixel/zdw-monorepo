<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\OptionStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class DesiredOptionsMigration implements Migration
{
    /**
     * WordPress persists scalar options as strings, so the manifest deliberately
     * uses strings and can retain strict, type-safe verification.
     *
     * @param array<string, string> $desiredValues
     */
    public function __construct(
        private readonly string $migrationId,
        private readonly string $migrationLabel,
        private readonly OptionStore $store,
        private readonly array $desiredValues
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
        $changed = $this->changedOptionNames();

        if ([] === $changed) {
            return [PreflightCheck::pass(
                'options.ready',
                'Všechna cílová nastavení už odpovídají této verzi.'
            )];
        }

        return [PreflightCheck::warning(
            'options.changes',
            sprintf('Migrace změní %d nastavení: %s.', count($changed), implode(', ', $changed))
        )];
    }

    public function apply(): void
    {
        foreach ($this->desiredValues as $name => $value) {
            if ($this->valuesMatch($this->store->get($name), $value)) {
                continue;
            }

            $this->store->set($name, $value);
        }
    }

    public function verify(): array
    {
        $changed = $this->changedOptionNames();

        if ([] !== $changed) {
            return [PreflightCheck::blocker(
                'options.mismatch',
                sprintf('Nesouhlasí uložená nastavení: %s.', implode(', ', $changed))
            )];
        }

        return [PreflightCheck::pass(
            'options.saved',
            sprintf('Bylo ověřeno %d nastavení.', count($this->desiredValues))
        )];
    }

    /** @return list<string> */
    private function changedOptionNames(): array
    {
        $changed = [];

        foreach ($this->desiredValues as $name => $value) {
            if (!$this->valuesMatch($this->store->get($name), $value)) {
                $changed[] = $name;
            }
        }

        return $changed;
    }

    private function valuesMatch(mixed $actual, mixed $expected): bool
    {
        return $actual === $expected;
    }
}
