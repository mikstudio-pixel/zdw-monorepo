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

delete_option(ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK);
try {
    $stateToken = zdw_two_tier_menu_acquire_state_lock();
    if (!is_string($stateToken)) {
        throw new RuntimeException('The state lock fixture could not be acquired.');
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK, [
        'token' => $stateToken,
        'claimed_at' => time() - ZDW_TWO_TIER_MENU_STATE_LOCK_TTL + 1,
    ], false);
    if (!zdw_two_tier_menu_renew_state_lock($stateToken)
        || zdw_two_tier_menu_renew_state_lock('different-owner')) {
        throw new RuntimeException('Only the current state-lock owner may renew its claim.');
    }
} finally {
    if (isset($stateToken) && is_string($stateToken)) {
        zdw_two_tier_menu_release_state_lock($stateToken);
    }
    delete_option(ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK);
}

delete_option(ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK);
try {
    $installToken = zdw_two_tier_menu_acquire_install_lock();
    if (!is_string($installToken) || zdw_two_tier_menu_native_menu_writes_blocked()) {
        throw new RuntimeException('The install-lock owner was blocked from its own menu writes.');
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK, [
        'token' => 'competing-request',
        'claimed_at' => time(),
    ], false);
    if (!zdw_two_tier_menu_native_menu_writes_blocked()) {
        throw new RuntimeException('A native menu write was not blocked behind another request\'s rebuild.');
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK, [
        'token' => 'abandoned-request',
        'claimed_at' => time() - ZDW_TWO_TIER_MENU_UPGRADE_LOCK_TTL - 1,
    ], false);
    if (zdw_two_tier_menu_native_menu_writes_blocked()) {
        throw new RuntimeException('An expired install lock continued to block native menu writes.');
    }
} finally {
    if (isset($installToken) && is_string($installToken)) {
        zdw_two_tier_menu_release_install_lock($installToken);
    }
    delete_option(ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK);
    unset($GLOBALS['zdw_two_tier_menu_install_lock_token']);
}

$previousEnabled = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, false);
$previousVersion = get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false);
try {
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1');
    delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
    if (zdw_two_tier_menu_is_active()) {
        throw new RuntimeException('Navigation did not fail closed while installation was incomplete.');
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, ZDW_TWO_TIER_MENU_DB_VERSION);
    if (!zdw_two_tier_menu_is_active()) {
        throw new RuntimeException('Completed enabled navigation was not activated.');
    }
} finally {
    false === $previousEnabled
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, $previousEnabled);
    false === $previousVersion
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $previousVersion);
}
echo "Two-tier upgrade lock integration test passed.\n";
