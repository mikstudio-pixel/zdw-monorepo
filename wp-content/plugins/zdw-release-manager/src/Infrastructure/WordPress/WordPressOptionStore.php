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

    public function delete(string $name): void
    {
        if (delete_option($name) || !$this->has($name)) {
            return;
        }

        throw new RuntimeException(sprintf('Nepodařilo se odstranit nastavení %s.', $name));
    }

    private function valuesMatch(mixed $actual, mixed $expected): bool
    {
        return $actual === $expected
            || (is_scalar($actual) && is_scalar($expected) && (string) $actual === (string) $expected);
    }
}
