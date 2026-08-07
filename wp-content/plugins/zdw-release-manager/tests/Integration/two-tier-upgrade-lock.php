<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_acquire_upgrade_lock')) {
    throw new RuntimeException('Two-tier menu upgrade lock API is unavailable.');
}
if (!defined('ZDW_TWO_TIER_MENU_STATE_LOCK_TTL') || 30 !== ZDW_TWO_TIER_MENU_STATE_LOCK_TTL) {
    throw new RuntimeException('The header-state lock must use its dedicated 30-second TTL.');
}

delete_option(ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK);

try {
    $firstToken = zdw_two_tier_menu_acquire_upgrade_lock();
    if (!is_string($firstToken) || null !== zdw_two_tier_menu_acquire_upgrade_lock()) {
        throw new RuntimeException('Only one request may own the upgrade lock.');
    }

    update_option(ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK, [
        'token' => 'expired-owner',
        'claimed_at' => time() - ZDW_TWO_TIER_MENU_UPGRADE_LOCK_TTL - 1,
    ], false);
    $replacementToken = zdw_two_tier_menu_acquire_upgrade_lock();
    if (!is_string($replacementToken) || 'expired-owner' === $replacementToken) {
        throw new RuntimeException('The abandoned upgrade lock was not replaced.');
    }

    zdw_two_tier_menu_release_upgrade_lock('expired-owner');
    if (null !== zdw_two_tier_menu_acquire_upgrade_lock()) {
        throw new RuntimeException('An expired owner released the replacement upgrade lock.');
    }

    zdw_two_tier_menu_release_upgrade_lock($replacementToken);
    $finalToken = zdw_two_tier_menu_acquire_upgrade_lock();
    if (!is_string($finalToken)) {
        throw new RuntimeException('A released upgrade lock cannot be acquired again.');
    }
    zdw_two_tier_menu_release_upgrade_lock($finalToken);
} finally {
    delete_option(ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK);
}
echo "Two-tier upgrade lock integration test passed.\n";
