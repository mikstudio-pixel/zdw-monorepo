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

    public function claim(string $migrationId): ?string
    {
        if ($this->isApplied($migrationId)) {
            return null;
        }

        $optionName = $this->claimOptionName($migrationId);
        $token = bin2hex(random_bytes(16));
        $claim = ['migration' => $migrationId, 'token' => $token, 'claimed_at' => time()];
        if (add_option($optionName, $claim, '', false)) {
            return $token;
        }

        $existing = get_option($optionName, false);
        if (!is_array($existing) || !isset($existing['claimed_at'])) {
            return null;
        }
        if ((int) $existing['claimed_at'] > time() - self::CLAIM_TTL) {
            return null;
        }

        global $wpdb;
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options} AS current_claim "
            . "LEFT JOIN {$wpdb->options} AS applied_state ON applied_state.option_name = %s "
            . 'SET current_claim.option_value = %s '
            . 'WHERE current_claim.option_name = %s AND current_claim.option_value = %s '
            . 'AND applied_state.option_id IS NULL',
            $this->appliedOptionName($migrationId),
            maybe_serialize($claim),
            $optionName,
            maybe_serialize($existing)
        ));
        if (1 !== $updated) {
            return null;
        }

        wp_cache_delete($optionName, 'options');

        return $token;
    }

    public function release(string $migrationId, string $claimToken): void
    {
        $this->deleteOwnedClaim($migrationId, $claimToken);
    }

    public function renew(string $migrationId, string $claimToken): bool
    {
        $claim = $this->ownedClaim($migrationId, $claimToken);
        if (null === $claim) {
            return false;
        }

        $renewed = $claim;
        $renewed['claimed_at'] = max(time(), (int) $claim['claimed_at'] + 1);
        $optionName = $this->claimOptionName($migrationId);

        global $wpdb;
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s",
            maybe_serialize($renewed),
            $optionName,
            maybe_serialize($claim)
        ));
        if (1 !== $updated) {
            return false;
        }

        wp_cache_delete($optionName, 'options');

        return true;
    }

    public function markApplied(string $migrationId, string $claimToken): void
    {
        $claim = $this->ownedClaim($migrationId, $claimToken);
        if (null === $claim) {
            throw new RuntimeException('Nelze potvrdit migraci bez vlastnictví jejího zámku.');
        }

        $applied = ['migration' => $migrationId, 'applied_at' => gmdate('c')];
        $claimOption = $this->claimOptionName($migrationId);
        $appliedOption = $this->appliedOptionName($migrationId);

        global $wpdb;
        $inserted = $wpdb->query($wpdb->prepare(
            "INSERT INTO {$wpdb->options} (option_name, option_value, autoload) "
            . "SELECT %s, %s, 'no' FROM {$wpdb->options} "
            . 'WHERE option_name = %s AND option_value = %s LIMIT 1',
            $appliedOption,
            maybe_serialize($applied),
            $claimOption,
            maybe_serialize($claim)
        ));
        if (1 !== $inserted) {
            throw new RuntimeException(sprintf(
                'Nepodařilo se uložit stav migrace %s: požadavek ztratil vlastnictví zámku.',
                $migrationId
            ));
        }

        wp_cache_delete($appliedOption, 'options');
        wp_cache_delete('notoptions', 'options');
        $this->release($migrationId, $claimToken);
    }

    /** @return array<string, mixed>|null */
    private function ownedClaim(string $migrationId, string $claimToken): ?array
    {
        $claim = get_option($this->claimOptionName($migrationId), false);

        return is_array($claim)
            && $migrationId === ($claim['migration'] ?? null)
            && hash_equals((string) ($claim['token'] ?? ''), $claimToken)
            ? $claim
            : null;
    }

    private function deleteOwnedClaim(string $migrationId, string $claimToken): void
    {
        $claim = $this->ownedClaim($migrationId, $claimToken);
        if (null === $claim) {
            return;
        }

        $optionName = $this->claimOptionName($migrationId);
        global $wpdb;
        $deleted = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s",
            $optionName,
            maybe_serialize($claim)
        ));
        if (1 === $deleted) {
            wp_cache_delete($optionName, 'options');
        }
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
