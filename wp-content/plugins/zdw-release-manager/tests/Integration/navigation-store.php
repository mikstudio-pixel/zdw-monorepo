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
    $store->ensureLegacySponsorItem($sponsorPageIds);
    $matchingItems = array_filter(
        (array) wp_get_nav_menu_items((int) $legacyMenu->term_id),
        static fn ($item): bool => 'page' === $item->object
            && (int) $sponsorPage->ID === (int) $item->object_id
    );
    if (1 !== count($matchingItems)) {
        throw new RuntimeException('Duplicate legacy sponsor items were not consolidated.');
    }
} finally {
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
