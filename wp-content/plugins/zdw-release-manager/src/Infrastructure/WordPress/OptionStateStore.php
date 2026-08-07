<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\StateStore;

final class OptionStateStore implements StateStore
{
    private const CLAIM_TTL = 900;

    public function __construct(
        private readonly string $optionName = 'zdw_release_manager_applied_migrations'
    ) {
    }

    public function isApplied(string $migrationId): bool
    {
        $applied = get_option($this->appliedOptionName($migrationId), false);
        if (is_array($applied) && $migrationId === ($applied['migration'] ?? null)) {
            return true;
        }

        // Compatibility with states written by the first plugin build.
        $state = get_option($this->optionName, []);

        return is_array($state) && array_key_exists($migrationId, $state);
    }

    public function claim(string $migrationId): bool
    {
        if ($this->isApplied($migrationId)) {
            return false;
        }

        $optionName = $this->claimOptionName($migrationId);
        $claim = ['migration' => $migrationId, 'claimed_at' => time()];
        if (add_option($optionName, $claim, '', false)) {
            return true;
        }

        $existing = get_option($optionName, false);
        if (!is_array($existing) || !isset($existing['claimed_at'])) {
            return false;
        }
        if ((int) $existing['claimed_at'] > time() - self::CLAIM_TTL) {
            return false;
        }

        delete_option($optionName);

        return add_option($optionName, $claim, '', false);
    }

    public function release(string $migrationId): void
    {
        delete_option($this->claimOptionName($migrationId));
    }

    public function markApplied(string $migrationId): void
    {
        if ($this->isApplied($migrationId)) {
            $this->release($migrationId);

            return;
        }

        $applied = ['migration' => $migrationId, 'applied_at' => gmdate('c')];
        if (!add_option($this->appliedOptionName($migrationId), $applied, '', false)) {
            throw new RuntimeException(sprintf('Nepodařilo se uložit stav migrace %s.', $migrationId));
        }

        $this->release($migrationId);
    }

    private function appliedOptionName(string $migrationId): string
    {
        return $this->optionName . '_applied_' . md5($migrationId);
    }

    private function claimOptionName(string $migrationId): string
    {
        return $this->optionName . '_claim_' . md5($migrationId);
    }
}
