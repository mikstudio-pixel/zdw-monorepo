<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressNavigationStore;

$sponsorPage = get_page_by_path('sponzori', OBJECT, 'page');
$partnerPage = get_page_by_path('partners', OBJECT, 'page');
if (!$sponsorPage instanceof WP_Post || !$partnerPage instanceof WP_Post) {
    throw new RuntimeException('Sponsor translation pages are missing.');
}
$sponsorPageIds = ['cs' => (int) $sponsorPage->ID, 'en' => (int) $partnerPage->ID];

if (!function_exists('pll_set_post_language')) {
    throw new RuntimeException('Polylang language API is unavailable.');
}
$languageFixture = wp_insert_post([
    'post_type' => 'page',
    'post_status' => 'publish',
    'post_title' => 'Navigation language fixture',
]);
if (is_wp_error($languageFixture)) {
    throw new RuntimeException('Navigation language fixture could not be created.');
}
pll_set_post_language((int) $languageFixture, 'cs');
try {
    if (!zdw_two_tier_menu_blueprint_item_resolvable(['page' => (int) $languageFixture, 'title' => 'Fixture'], 'cs')
        || zdw_two_tier_menu_blueprint_item_resolvable(['page' => (int) $languageFixture, 'title' => 'Fixture'], 'en')) {
        throw new RuntimeException('Navigation blueprint accepted a page from the wrong language.');
    }
} finally {
    wp_delete_post((int) $languageFixture, true);
}

$store = new WordPressNavigationStore();
if (!$store->isAvailable()) {
    throw new RuntimeException('Navigation API is unavailable.');
}
if (!$store->blueprintsResolvable()) {
    throw new RuntimeException('Navigation blueprint contains an unavailable target.');
}
if (!$store->legacyParentsResolvable()) {
    throw new RuntimeException('Legacy navigation parents are unavailable.');
}
if (!$store->matchesDesiredNavigation($sponsorPageIds)) {
    throw new RuntimeException('Navigation does not match its blueprint.');
}

$menuSnapshots = [];
$menuNames = ['Header Menu', 'Header Menu EN'];
foreach (zdw_two_tier_menu_names() as $languages) {
    foreach ($languages as $name) {
        $menuNames[] = (string) $name;
    }
}
foreach (array_unique($menuNames) as $name) {
    $menu = wp_get_nav_menu_object($name);
    $menuSnapshots[$name] = $menu
        ? zdw_two_tier_menu_snapshot_items((int) $menu->term_id)
        : null;
}
$optionSnapshots = [];
foreach (['zdw_two_tier_menu_enabled', 'zdw_two_tier_menu_enable_after_install', 'zdw_two_tier_menu_db_version'] as $option) {
    $optionSnapshots[$option] = get_option($option, '__missing__');
}
$restorableSnapshot = static function (?array $snapshot): ?array {
    if (null === $snapshot) {
        return null;
    }
    foreach ($snapshot as &$item) {
        unset($item['post']['post_modified'], $item['post']['post_modified_gmt']);
    }
    unset($item);

    return $snapshot;
};
try {
    $store->applyDesiredNavigation(['cs' => $sponsorPageIds['cs']]);
    throw new RuntimeException('An incomplete atomic navigation update unexpectedly succeeded.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'jazyk en')) {
        throw $error;
    }
}
foreach ($menuSnapshots as $name => $snapshot) {
    $menu = wp_get_nav_menu_object($name);
    $current = $menu ? zdw_two_tier_menu_snapshot_items((int) $menu->term_id) : null;
    if ($restorableSnapshot($snapshot) !== $restorableSnapshot($current)) {
        throw new RuntimeException(sprintf('Atomic navigation rollback did not restore menu %s.', $name));
    }
}
foreach ($optionSnapshots as $option => $snapshot) {
    if ($snapshot !== get_option($option, '__missing__')) {
        throw new RuntimeException(sprintf('Atomic navigation rollback did not restore option %s.', $option));
    }
}

$installLock = zdw_two_tier_menu_acquire_install_lock();
if (!is_string($installLock)) {
    throw new RuntimeException('The navigation contention fixture could not acquire the install lock.');
}
try {
    try {
        $store->rebuildTwoTierMenus();
        throw new RuntimeException('A competing navigation rebuild unexpectedly succeeded.');
    } catch (RuntimeException $error) {
        if (!str_contains($error->getMessage(), 'jiný požadavek')) {
            throw new RuntimeException('Install-lock contention was not reported as a retryable condition.');
        }
    }
} finally {
    zdw_two_tier_menu_release_install_lock($installLock);
}

$legacyMenu = wp_get_nav_menu_object('Header Menu');
$festivalPage = get_page_by_path('o-festivalu', OBJECT, 'page');
if (!$legacyMenu || !$festivalPage instanceof WP_Post) {
    throw new RuntimeException('Legacy navigation fixture is unavailable.');
}
$festivalParentId = 0;
foreach ((array) wp_get_nav_menu_items((int) $legacyMenu->term_id) as $item) {
    if ('page' === $item->object
        && (int) $festivalPage->ID === (int) $item->object_id
        && 0 === (int) $item->menu_item_parent) {
        $festivalParentId = (int) $item->ID;
        break;
    }
}
if (0 === $festivalParentId) {
    throw new RuntimeException('Legacy festival parent fixture is unavailable.');
}
$canonicalSponsorItemId = 0;
foreach ((array) wp_get_nav_menu_items((int) $legacyMenu->term_id) as $item) {
    if ('page' === $item->object && (int) $sponsorPage->ID === (int) $item->object_id) {
        $canonicalSponsorItemId = (int) $item->ID;
        break;
    }
}
if (0 === $canonicalSponsorItemId) {
    throw new RuntimeException('Canonical legacy sponsor fixture is unavailable.');
}
$duplicateId = wp_update_nav_menu_item((int) $legacyMenu->term_id, 0, [
    'menu-item-title' => 'Sponzoři duplicate fixture',
    'menu-item-parent-id' => $festivalParentId,
    'menu-item-object' => 'page',
    'menu-item-object-id' => (int) $sponsorPage->ID,
    'menu-item-type' => 'post_type',
    'menu-item-status' => 'publish',
]);
if (is_wp_error($duplicateId)) {
    throw new RuntimeException($duplicateId->get_error_message());
}
try {
    update_post_meta($canonicalSponsorItemId, '_menu_item_menu_item_parent', (int) $duplicateId);
    $store->ensureLegacySponsorItem($sponsorPageIds);
    $matchingItems = array_filter(
        (array) wp_get_nav_menu_items((int) $legacyMenu->term_id),
        static fn ($item): bool => 'page' === $item->object
            && (int) $sponsorPage->ID === (int) $item->object_id
    );
    if (1 !== count($matchingItems)) {
        throw new RuntimeException('Duplicate legacy sponsor items were not consolidated.');
    }
    $canonicalSponsorItem = reset($matchingItems);
    if ($festivalParentId !== (int) $canonicalSponsorItem->menu_item_parent) {
        throw new RuntimeException('Canonical sponsor item became its own parent during consolidation.');
    }
} finally {
    update_post_meta($canonicalSponsorItemId, '_menu_item_menu_item_parent', $festivalParentId);
    if (get_post((int) $duplicateId)) {
        wp_delete_post((int) $duplicateId, true);
    }
}

$legacyItems = (array) wp_get_nav_menu_items((int) $legacyMenu->term_id);
$sponsorItemId = 0;
$originalSponsorParentId = 0;
foreach ($legacyItems as $item) {
    if ('page' === $item->object && (int) $sponsorPage->ID === (int) $item->object_id) {
        $sponsorItemId = (int) $item->ID;
        $originalSponsorParentId = (int) $item->menu_item_parent;
        break;
    }
}
if (0 === $sponsorItemId) {
    throw new RuntimeException('Legacy sponsor item fixture is unavailable.');
}
$nestedFestivalId = wp_update_nav_menu_item((int) $legacyMenu->term_id, 0, [
    'menu-item-title' => 'Nested festival fixture',
    'menu-item-parent-id' => $festivalParentId,
    'menu-item-object' => 'page',
    'menu-item-object-id' => (int) $festivalPage->ID,
    'menu-item-type' => 'post_type',
    'menu-item-status' => 'publish',
]);
if (is_wp_error($nestedFestivalId)) {
    throw new RuntimeException($nestedFestivalId->get_error_message());
}
try {
    update_post_meta($sponsorItemId, '_menu_item_menu_item_parent', (int) $nestedFestivalId);
    if ($store->matchesDesiredNavigation($sponsorPageIds)) {
        throw new RuntimeException('A sponsor under a nested duplicate parent was accepted.');
    }

    $store->ensureLegacySponsorItem($sponsorPageIds);
    if (!$store->matchesDesiredNavigation($sponsorPageIds)) {
        throw new RuntimeException('The sponsor item was not restored under the top-level festival parent.');
    }
} finally {
    update_post_meta($sponsorItemId, '_menu_item_menu_item_parent', $originalSponsorParentId);
    if (get_post((int) $nestedFestivalId)) {
        wp_delete_post((int) $nestedFestivalId, true);
    }
}

echo "WordPressNavigationStore integration test passed.\n";
