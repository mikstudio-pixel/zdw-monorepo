<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\StateStore;

final class OptionStateStore implements StateStore
{
    public function __construct(
        private readonly string $optionName = 'zdw_release_manager_applied_migrations'
    ) {
    }

    public function isApplied(string $migrationId): bool
    {
        $state = get_option($this->optionName, []);

        return is_array($state) && array_key_exists($migrationId, $state);
    }

    public function markApplied(string $migrationId): void
    {
        $state = get_option($this->optionName, []);
        $state = is_array($state) ? $state : [];

        if (array_key_exists($migrationId, $state)) {
            return;
        }

        $state[$migrationId] = gmdate('c');

        if (!update_option($this->optionName, $state, false)) {
            throw new RuntimeException(sprintf('Nepodařilo se uložit stav migrace %s.', $migrationId));
        }
    }
}
