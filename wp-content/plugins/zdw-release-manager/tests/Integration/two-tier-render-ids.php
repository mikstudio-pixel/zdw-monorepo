<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_render_nav')) {
    throw new RuntimeException('Two-tier menu plugin is unavailable.');
}

foreach (['cs', 'en'] as $language) {
    $expectedHomeUrl = function_exists('pll_home_url') ? pll_home_url($language) : home_url('/');
    if ($expectedHomeUrl !== zdw_two_tier_menu_home_url($language)) {
        throw new RuntimeException(sprintf('The header homepage URL is not localized for %s.', $language));
    }
}

ob_start();
zdw_two_tier_menu_render_nav('top', 'zdw-two-tier__menu--top');
zdw_two_tier_menu_render_nav('top', 'zdw-two-tier__menu--mobile-top');
$markup = (string) ob_get_clean();

preg_match_all('/\sid="([^"]+)"/', $markup, $matches);
$ids = $matches[1] ?? [];
if ([] === $ids || count($ids) !== count(array_unique($ids))) {
    throw new RuntimeException('Repeated desktop/mobile menu renders contain duplicate DOM IDs.');
}
foreach (['zdw-two-tier-top-desktop-cs', 'zdw-two-tier-top-mobile-cs'] as $expected) {
    if (!in_array($expected, $ids, true)) {
        throw new RuntimeException(sprintf('Expected menu DOM ID is missing: %s', $expected));
    }
}

$menuName = zdw_two_tier_menu_names()['top']['cs'];
$menu = wp_get_nav_menu_object($menuName);
if (!$menu) {
    throw new RuntimeException('A required menu fixture is unavailable.');
}
$menuId = (int) $menu->term_id;
$enabledExisted = zdw_two_tier_menu_option_exists(ZDW_TWO_TIER_MENU_OPTION_ENABLED);
$enabledBefore = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED);
$versionExisted = zdw_two_tier_menu_option_exists(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
$versionBefore = get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
try {
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1');
    update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, ZDW_TWO_TIER_MENU_DB_VERSION);
    $renamed = wp_update_nav_menu_object($menuId, ['menu-name' => 'ZDW unavailable menu fixture']);
    if (is_wp_error($renamed)) {
        throw new RuntimeException('The required-menu fallback fixture could not be created.');
    }
    if (zdw_two_tier_menu_required_menus_available(true) || zdw_two_tier_menu_is_active()) {
        throw new RuntimeException('A missing required menu did not fall back to the legacy header.');
    }
} finally {
    $restored = wp_update_nav_menu_object($menuId, ['menu-name' => $menuName]);
    if ($enabledExisted) {
        update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, $enabledBefore);
    } else {
        delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED);
    }
    if ($versionExisted) {
        update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, $versionBefore);
    } else {
        delete_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION);
    }
    zdw_two_tier_menu_required_menus_available(true);
    if (is_wp_error($restored)) {
        throw new RuntimeException('The required-menu fallback fixture could not be restored.');
    }
}

echo "Two-tier menu DOM ID integration test passed.\n";
