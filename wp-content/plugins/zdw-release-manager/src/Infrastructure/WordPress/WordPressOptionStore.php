<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\OptionStore;

final class WordPressOptionStore implements OptionStore
{
    public function __construct(private readonly bool $autoload = true)
    {
    }

    public function get(string $name): mixed
    {
        return get_option($name, null);
    }

    public function has(string $name): bool
    {
        global $wpdb;

        return null !== $wpdb->get_var($wpdb->prepare(
            "SELECT option_id FROM {$wpdb->options} WHERE option_name = %s LIMIT 1",
            $name
        ));
    }

    public function set(string $name, mixed $value): void
    {
        update_option($name, $value, $this->autoload);

        if ($this->valuesMatch($this->get($name), $value)) {
            return;
        }

        throw new RuntimeException(sprintf('Nepodařilo se uložit nastavení %s.', $name));
    }

    /**
     * Atomic migration CAS. Existing rows intentionally bypass Options API
     * hooks because those hooks cannot be combined with the database predicate.
     *
     * @phpstan-impure
     */
    public function setIfCurrent(
        string $name,
        bool $expectedExists,
        mixed $expectedValue,
        mixed $value
    ): bool {
        if (!$expectedExists) {
            $knownFilteredValue = sanitize_option($name, $value);
            if (!add_option($name, $value, '', $this->autoload)) {
                return false;
            }

            $actual = $this->get($name);
            if ($this->valuesMatch($actual, $value)) {
                return true;
            }
            if (!$this->valuesMatch($actual, $knownFilteredValue)) {
                return false;
            }
            if (!$this->deleteIfCurrent($name, $actual)) {
                throw new RuntimeException(sprintf(
                    'Filtrem změněné nastavení %s nelze po souběžné úpravě bezpečně odstranit.',
                    $name
                ));
            }

            return false;
        }

        if ((string) maybe_serialize($expectedValue) === (string) maybe_serialize($value)) {
            return $this->storedValueMatches($name, $expectedValue);
        }

        global $wpdb;
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options}
            SET option_value = %s
            WHERE option_name = %s
                AND CAST(option_value AS BINARY) = CAST(%s AS BINARY)",
            maybe_serialize($value),
            $name,
            maybe_serialize($expectedValue)
        ));
        if (false === $updated) {
            throw new RuntimeException(sprintf('Podmíněné uložení nastavení %s selhalo.', $name));
        }
        if (1 !== $updated) {
            return false;
        }

        $this->clearCaches($name);

        return true;
    }

    public function delete(string $name): void
    {
        if (delete_option($name) || !$this->has($name)) {
            return;
        }

        throw new RuntimeException(sprintf('Nepodařilo se odstranit nastavení %s.', $name));
    }

    /** @phpstan-impure */
    public function deleteIfCurrent(string $name, mixed $expectedValue): bool
    {
        global $wpdb;
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options}
            WHERE option_name = %s
                AND CAST(option_value AS BINARY) = CAST(%s AS BINARY)",
            $name,
            maybe_serialize($expectedValue)
        ));
        if (false === $deleted) {
            throw new RuntimeException(sprintf('Podmíněné odstranění nastavení %s selhalo.', $name));
        }
        if (1 !== $deleted) {
            return false;
        }

        $this->clearCaches($name);

        return true;
    }

    private function clearCaches(string $name): void
    {
        wp_cache_delete($name, 'options');
        wp_cache_delete('alloptions', 'options');
        wp_cache_delete('notoptions', 'options');
    }

    private function storedValueMatches(string $name, mixed $expectedValue): bool
    {
        global $wpdb;
        $optionId = $wpdb->get_var($wpdb->prepare(
            "SELECT option_id FROM {$wpdb->options}
            WHERE option_name = %s
                AND CAST(option_value AS BINARY) = CAST(%s AS BINARY)
            LIMIT 1",
            $name,
            maybe_serialize($expectedValue)
        ));

        return null !== $optionId;
    }

    private function valuesMatch(mixed $actual, mixed $expected): bool
    {
        return $actual === $expected
            || (is_scalar($actual) && is_scalar($expected) && (string) $actual === (string) $expected);
    }
}
