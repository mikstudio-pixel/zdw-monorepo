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

    public function set(string $name, mixed $value): void
    {
        if (update_option($name, $value, $this->autoload)) {
            return;
        }

        if ($this->get($name) === $value) {
            return;
        }

        throw new RuntimeException(sprintf('Nepodařilo se uložit nastavení %s.', $name));
    }
}
