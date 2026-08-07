<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_snapshot_items')) {
    throw new RuntimeException('Two-tier menu snapshot API is unavailable.');
}

$installLock = zdw_two_tier_menu_acquire_install_lock();
if (!is_string($installLock)) {
    throw new RuntimeException('The menu installation lock could not be acquired.');
}
try {
    if (null !== zdw_two_tier_menu_install_menus()) {
        throw new RuntimeException('A competing installer entered menu discovery while the installation lock was owned.');
    }
} finally {
    zdw_two_tier_menu_release_install_lock($installLock);
}

$menuName = 'ZDW rollback integration ' . wp_generate_uuid4();
$menuId = wp_create_nav_menu($menuName);
if (is_wp_error($menuId)) {
    throw new RuntimeException($menuId->get_error_message());
}
$createdMenuName = 'ZDW created rollback integration ' . wp_generate_uuid4();
$createdMenuId = wp_create_nav_menu($createdMenuName);
if (is_wp_error($createdMenuId)) {
    wp_delete_nav_menu((int) $menuId);
    throw new RuntimeException($createdMenuId->get_error_message());
}

try {
    $parentId = zdw_two_tier_menu_add_url((int) $menuId, 'Original parent', home_url('/original/'));
    $childId = zdw_two_tier_menu_add_url((int) $menuId, 'Original child', home_url('/original/child/'), $parentId);
    if (!$parentId || !$childId) {
        throw new RuntimeException('Failed to create the rollback fixture menu.');
    }

    $blueprint = [
        [
            'path' => '/original/',
            'title' => 'Original parent',
            'children' => [
                ['path' => '/original/child/', 'title' => 'Original child'],
            ],
        ],
    ];
    if (!zdw_two_tier_menu_menu_matches_blueprint((int) $menuId, $blueprint)) {
        throw new RuntimeException('A complete menu was not recognized as matching its blueprint.');
    }

    $snapshot = zdw_two_tier_menu_snapshot_items((int) $menuId);
    if (2 !== count($snapshot)) {
        throw new RuntimeException('The original menu snapshot is incomplete.');
    }

    if (!zdw_two_tier_menu_clear_items((int) $menuId)
        || !zdw_two_tier_menu_add_url((int) $menuId, 'Original parent', home_url('/original/'))) {
        throw new RuntimeException('The partial-menu fixture could not be created.');
    }
    if (zdw_two_tier_menu_menu_matches_blueprint((int) $menuId, $blueprint)) {
        throw new RuntimeException('A partial menu was accepted as a complete blueprint installation.');
    }
    if (!zdw_two_tier_menu_add_url((int) $createdMenuId, 'Partial new menu', home_url('/partial-new/'))) {
        throw new RuntimeException('The newly-created menu fixture could not be populated.');
    }

    zdw_two_tier_menu_rollback_install(
        [['id' => (int) $menuId, 'snapshot' => $snapshot]],
        [(int) $createdMenuId]
    );
    if (wp_get_nav_menu_object((int) $createdMenuId)) {
        throw new RuntimeException('A menu created during the failed installation was not removed.');
    }

    if (!zdw_two_tier_menu_menu_matches_blueprint((int) $menuId, $blueprint)) {
        throw new RuntimeException('The original menu could not be restored.');
    }

    $restored = array_values((array) wp_get_nav_menu_items((int) $menuId));
    if (2 !== count($restored)
        || 'Original parent' !== (string) $restored[0]->title
        || 'Original child' !== (string) $restored[1]->title
        || (int) $restored[0]->ID !== (int) $restored[1]->menu_item_parent) {
        throw new RuntimeException('The restored menu hierarchy does not match the snapshot.');
    }
} finally {
    wp_delete_nav_menu((int) $menuId);
    if (wp_get_nav_menu_object((int) $createdMenuId)) {
        wp_delete_nav_menu((int) $createdMenuId);
    }
}

echo "Two-tier menu restore integration test passed.\n";
