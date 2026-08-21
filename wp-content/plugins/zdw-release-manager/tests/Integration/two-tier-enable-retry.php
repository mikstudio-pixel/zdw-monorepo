<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_activate')
    || !defined('ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL')) {
    throw new RuntimeException('Two-tier menu activation API is unavailable.');
}

$previousEnabled = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, false);
$previousVersion = get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false);
$previousRetryEnable = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, false);

try {
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0');
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '1');
    delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
    if ('0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
        || false !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false)) {
        throw new RuntimeException('Activation retry fixture did not persist its disabled, versionless precondition.');
    }

    $stateLock = zdw_two_tier_menu_acquire_state_lock();
    if (!is_string($stateLock)) {
        throw new RuntimeException('The header state lock could not be acquired.');
    }
    try {
        if (false !== zdw_two_tier_menu_record_install_success()
            || '0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
            || '1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '0')) {
            throw new RuntimeException('Install completion changed header state while another request owned its lock.');
        }
    } finally {
        zdw_two_tier_menu_release_state_lock($stateLock);
    }

    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1');
    delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL);
    $rejectPending = static fn ($value, $oldValue) => '1' === (string) $value ? $oldValue : $value;
    add_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, $rejectPending, 10, 2);
    try {
        if (zdw_two_tier_menu_record_install_failure()
            || '1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0')
            || zdw_two_tier_menu_option_exists(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL)) {
            throw new RuntimeException('A rejected retry-marker write left the header disabled without a recovery marker.');
        }
    } finally {
        remove_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, $rejectPending, 10);
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0');
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '1');

    $rejectEnable = static fn ($value, $oldValue) => '1' === (string) $value ? $oldValue : $value;
    add_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_ENABLED, $rejectEnable, 10, 2);
    try {
        if (zdw_two_tier_menu_record_install_success()
            || '0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
            || '1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '0')
            || false !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false)) {
            throw new RuntimeException('A rejected enable write was incorrectly recorded as a completed install.');
        }
    } finally {
        remove_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_ENABLED, $rejectEnable, 10);
    }

    $rejectVersion = static fn ($value, $oldValue) => $oldValue;
    add_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $rejectVersion, 10, 2);
    try {
        if (zdw_two_tier_menu_record_install_success()
            || '0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
            || '1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '0')
            || false !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false)) {
            throw new RuntimeException('A rejected version write was incorrectly recorded as a completed install.');
        }
    } finally {
        remove_filter('pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $rejectVersion, 10);
    }

    zdw_two_tier_menu_activate();
    if ('1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0')
        || ZDW_TWO_TIER_MENU_DB_VERSION !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)
        || false !== get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, false)) {
        throw new RuntimeException('A successful activation did not re-enable navigation after an earlier failure.');
    }

    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0');
    delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL);
    update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, 'previous-version');
    if ('0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
        || 'previous-version' !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)) {
        throw new RuntimeException('Upgrade retry fixture did not persist its disabled, outdated-version precondition.');
    }
    zdw_two_tier_menu_upgrade();
    if ('0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')
        || ZDW_TWO_TIER_MENU_DB_VERSION !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)) {
        throw new RuntimeException('A successful upgrade overwrote the administrator\'s Legacy header choice.');
    }
} finally {
    false === $previousEnabled
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, $previousEnabled);
    false === $previousVersion
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $previousVersion);
    false === $previousRetryEnable
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, $previousRetryEnable);
}

echo "Two-tier enable retry integration test passed.\n";
