<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_activate')) {
    throw new RuntimeException('Two-tier menu activation API is unavailable.');
}

$previousEnabled = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, false);
$previousVersion = get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, false);

try {
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0');
    delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
    zdw_two_tier_menu_activate();
    if ('1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0')
        || ZDW_TWO_TIER_MENU_DB_VERSION !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)) {
        throw new RuntimeException('A successful activation did not re-enable navigation after an earlier failure.');
    }

    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0');
    update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, 'previous-version');
    zdw_two_tier_menu_upgrade();
    if ('1' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0')
        || ZDW_TWO_TIER_MENU_DB_VERSION !== get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)) {
        throw new RuntimeException('A successful upgrade did not re-enable navigation after an earlier failure.');
    }
} finally {
    false === $previousEnabled
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, $previousEnabled);
    false === $previousVersion
        ? delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION)
        : update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $previousVersion);
}

echo "Two-tier enable retry integration test passed.\n";
