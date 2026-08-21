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

$stateLock = zdw_two_tier_menu_acquire_state_lock();
if (!is_string($stateLock)) {
    throw new RuntimeException('The header-state lock could not be acquired.');
}
$menuSnapshots = [];
foreach (zdw_two_tier_menu_names() as $languages) {
    foreach ($languages as $name) {
        $menu = wp_get_nav_menu_object($name);
        if ($menu) {
            $menuSnapshots[(int) $menu->term_id] = zdw_two_tier_menu_snapshot_items((int) $menu->term_id);
        }
    }
}
try {
    if (null !== zdw_two_tier_menu_install_menus(true)) {
        throw new RuntimeException('Menu replacement began while another request owned the header-state lock.');
    }
    foreach ($menuSnapshots as $menuId => $snapshot) {
        if ($snapshot !== zdw_two_tier_menu_snapshot_items($menuId)) {
            throw new RuntimeException('State-lock contention allowed menu mutation before serialization.');
        }
    }
} finally {
    zdw_two_tier_menu_release_state_lock($stateLock);
}
$releasedInstallLock = zdw_two_tier_menu_acquire_install_lock();
if (!is_string($releasedInstallLock)) {
    throw new RuntimeException('State-lock contention leaked the installation lock.');
}
zdw_two_tier_menu_release_install_lock($releasedInstallLock);

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
$enabledBefore = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, null);
$pendingBefore = get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, null);
$versionBefore = get_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, null);

try {
    $parentId = zdw_two_tier_menu_add_url((int) $menuId, 'Original parent', home_url('/original/'));
    $childId = zdw_two_tier_menu_add_url((int) $menuId, 'Original child', home_url('/original/child/'), $parentId);
    if (!$parentId || !$childId) {
        throw new RuntimeException('Failed to create the rollback fixture menu.');
    }
    add_post_meta($parentId, '_zdw_rollback_test', 'first');
    add_post_meta($parentId, '_zdw_rollback_test', 'second');
    update_post_meta($childId, '_zdw_related_menu_item', $parentId);

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

    if (!zdw_two_tier_menu_rollback_install(
        [['id' => (int) $menuId, 'snapshot' => $snapshot]],
        [(int) $createdMenuId]
    )) {
        throw new RuntimeException('A complete menu snapshot rollback reported failure.');
    }
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
        || (int) $restored[0]->ID !== $parentId
        || (int) $restored[1]->ID !== $childId
        || (int) $restored[0]->ID !== (int) $restored[1]->menu_item_parent
        || ['first', 'second'] !== get_post_meta($parentId, '_zdw_rollback_test')
        || $parentId !== (int) get_post_meta($childId, '_zdw_related_menu_item', true)) {
        throw new RuntimeException('The restored menu hierarchy does not match the snapshot.');
    }

    if (!zdw_two_tier_menu_clear_items((int) $menuId)) {
        throw new RuntimeException('The rollback failure fixture could not clear the menu.');
    }
    update_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1');
    $rejectMenuItems = static fn (bool $maybeEmpty, array $postarr): bool =>
        'nav_menu_item' === ($postarr['post_type'] ?? '') ? true : $maybeEmpty;
    add_filter('wp_insert_post_empty_content', $rejectMenuItems, 10, 2);
    try {
        if (zdw_two_tier_menu_rollback_install([['id' => (int) $menuId, 'snapshot' => $snapshot]])) {
            throw new RuntimeException('A rejected snapshot restore unexpectedly reported success.');
        }
    } finally {
        remove_filter('wp_insert_post_empty_content', $rejectMenuItems, 10);
    }
    if ('0' !== (string) get_option(ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1')) {
        throw new RuntimeException('A failed snapshot restore did not fail the header closed.');
    }
} finally {
    if (wp_get_nav_menu_object((int) $menuId)) {
        wp_delete_nav_menu((int) $menuId);
    }
    if (wp_get_nav_menu_object((int) $createdMenuId)) {
        wp_delete_nav_menu((int) $createdMenuId);
    }
    foreach ([
        ZDW_TWO_TIER_MENU_OPTION_ENABLED => $enabledBefore,
        ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL => $pendingBefore,
        ZDW_TWO_TIER_MENU_OPTION_DB_VERSION => $versionBefore,
    ] as $option => $value) {
        if (null === $value) {
            delete_option($option);
        } else {
            update_option($option, $value);
        }
    }
}

echo "Two-tier menu restore integration test passed.\n";
