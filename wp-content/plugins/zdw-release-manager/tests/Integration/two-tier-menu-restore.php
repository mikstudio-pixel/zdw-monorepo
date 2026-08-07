<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_snapshot_items')) {
    throw new RuntimeException('Two-tier menu snapshot API is unavailable.');
}

$menuName = 'ZDW rollback integration ' . wp_generate_uuid4();
$menuId = wp_create_nav_menu($menuName);
if (is_wp_error($menuId)) {
    throw new RuntimeException($menuId->get_error_message());
}

try {
    $parentId = zdw_two_tier_menu_add_url((int) $menuId, 'Original parent', home_url('/original/'));
    $childId = zdw_two_tier_menu_add_url((int) $menuId, 'Original child', home_url('/original/child/'), $parentId);
    if (!$parentId || !$childId) {
        throw new RuntimeException('Failed to create the rollback fixture menu.');
    }

    $snapshot = zdw_two_tier_menu_snapshot_items((int) $menuId);
    if (2 !== count($snapshot)) {
        throw new RuntimeException('The original menu snapshot is incomplete.');
    }

    if (!zdw_two_tier_menu_clear_items((int) $menuId)
        || !zdw_two_tier_menu_add_url((int) $menuId, 'Partial replacement', home_url('/partial/'))
        || !zdw_two_tier_menu_restore_items((int) $menuId, $snapshot)) {
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
}

echo "Two-tier menu restore integration test passed.\n";
