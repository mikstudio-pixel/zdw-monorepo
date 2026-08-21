<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
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
        $originals = [];
        $attempted = [];

        try {
            foreach ($this->desiredValues as $name => $value) {
                $original = $this->store->get($name);
                if ($this->valuesMatch($original, $value)) {
                    continue;
                }

                $originals[$name] = ['exists' => $this->store->has($name), 'value' => $original];
                if ($this->store->has($name) !== $originals[$name]['exists']
                    || !$this->valuesMatch($this->store->get($name), $original)) {
                    throw new RuntimeException(sprintf(
                        'Nastavení %s mezitím změnil jiný požadavek.',
                        $name
                    ));
                }
                $attempted[] = $name;
                $this->store->set($name, $value);
            }
        } catch (Throwable $error) {
            $rollbackFailure = null;
            foreach (array_reverse($attempted) as $name) {
                try {
                    $current = $this->store->get($name);
                    if ($this->store->has($name) === $originals[$name]['exists']
                        && $this->valuesMatch($current, $originals[$name]['value'])) {
                        continue;
                    }
                    if (!$this->valuesMatch($current, $this->desiredValues[$name])) {
                        $rollbackFailure ??= new RuntimeException(sprintf(
                            'Nastavení %s mezitím změnil jiný požadavek.',
                            $name
                        ));
                        continue;
                    }
                    if ($originals[$name]['exists']) {
                        $this->store->set($name, $originals[$name]['value']);
                    } else {
                        $this->store->delete($name);
                    }
                } catch (Throwable $rollbackError) {
                    $rollbackFailure ??= $rollbackError;
                }
            }

            if (null !== $rollbackFailure) {
                throw new RuntimeException(
                    sprintf('%s Obnova nastavení selhala: %s', $error->getMessage(), $rollbackFailure->getMessage()),
                    0,
                    $error
                );
            }

            throw $error;
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
        if ($actual === $expected) {
            return true;
        }

        // register_setting() may sanitize integer and boolean options to native
        // scalar types. Persistent object caches can retain those types between
        // requests even though the migration manifest uses WordPress' string
        // representation. Compare scalar values canonically without weakening
        // array, object or null checks.
        return is_scalar($actual)
            && is_scalar($expected)
            && (string) $actual === (string) $expected;
    }
}
