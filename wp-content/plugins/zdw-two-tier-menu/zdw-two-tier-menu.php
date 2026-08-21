<?php
/**
 * Plugin Name: ZDW Multi-level Header
 * Description: Three-row header, multi-level navigation and homepage programme grid for Zlin Design Week.
 * Version: 0.2.2
 * Author: Zlin Design Week
 */

defined( 'ABSPATH' ) || exit;

const ZDW_TWO_TIER_MENU_OPTION_ENABLED  = 'zdw_two_tier_menu_enabled';
const ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED = 'zdw_two_tier_menu_notice_enabled';
const ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS = 'zdw_two_tier_menu_notice_text_cs';
const ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN = 'zdw_two_tier_menu_notice_text_en';
const ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS  = 'zdw_two_tier_menu_notice_url_cs';
const ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN  = 'zdw_two_tier_menu_notice_url_en';
const ZDW_TWO_TIER_MENU_OPTION_DB_VERSION          = 'zdw_two_tier_menu_db_version';
const ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK        = 'zdw_two_tier_menu_upgrade_lock';
const ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK        = 'zdw_two_tier_menu_install_lock';
const ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK          = 'zdw_two_tier_menu_state_lock';
const ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL = 'zdw_two_tier_menu_enable_after_install';
const ZDW_TWO_TIER_MENU_DB_VERSION                 = '0.2.1';
const ZDW_TWO_TIER_MENU_UPGRADE_LOCK_TTL           = 300;
const ZDW_TWO_TIER_MENU_STATE_LOCK_TTL             = 30;

/**
 * Menu names are deliberately independent of theme locations. This keeps the
 * existing Header Menu assignments untouched and makes the experiment easy to
 * disable or remove.
 *
 * @return array<string, array<string, string>>
 */
function zdw_two_tier_menu_names() {
	return array(
		'top' => array(
			'cs' => 'ZDW Multi-level — Upper CS',
			'en' => 'ZDW Multi-level — Upper EN',
		),
		'bottom' => array(
			'cs' => 'ZDW Multi-level — Lower CS',
			'en' => 'ZDW Multi-level — Lower EN',
		),
	);
}

/**
 * Create one page-backed menu item.
 *
 * @param int $menu_id Menu term ID.
 * @param int $page_id Page post ID.
 * @param string $title Optional custom label.
 * @param int    $parent_id Parent menu item ID.
 * @return int Menu item ID, or zero on failure.
 */
function zdw_two_tier_menu_add_page( $menu_id, $page_id, $title = '', $parent_id = 0 ) {
	$page = get_post( $page_id );
	if ( ! $page instanceof WP_Post ) {
		return 0;
	}

	$result = wp_update_nav_menu_item(
		$menu_id,
		0,
		array(
			'menu-item-title'     => $title ? $title : $page->post_title,
			'menu-item-parent-id' => $parent_id,
			'menu-item-object'    => 'page',
			'menu-item-object-id' => $page_id,
			'menu-item-type'      => 'post_type',
			'menu-item-status'    => 'publish',
		)
	);

	return is_wp_error( $result ) ? 0 : (int) $result;
}

/**
 * Create one URL-backed menu item.
 *
 * @param int $menu_id Menu term ID.
 * @param string $title Link label.
 * @param string $url Link URL.
 * @param int    $parent_id Parent menu item ID.
 * @return int Menu item ID, or zero on failure.
 */
function zdw_two_tier_menu_add_url( $menu_id, $title, $url, $parent_id = 0 ) {
	$result = wp_update_nav_menu_item(
		$menu_id,
		0,
		array(
			'menu-item-title'  => $title,
			'menu-item-parent-id' => $parent_id,
			'menu-item-url'    => $url,
			'menu-item-type'   => 'custom',
			'menu-item-status' => 'publish',
		)
	);

	return is_wp_error( $result ) ? 0 : (int) $result;
}

/**
 * Exact menu structure requested for the 2027 header.
 *
 * @return array<string, array<string, array<int, array<string, mixed>>>>
 */
function zdw_two_tier_menu_blueprints() {
	return array(
		'top' => array(
			'cs' => array(
				array( 'page' => 10204, 'title' => 'FESTIVAL', 'children' => array(
					array( 'page' => 10204, 'title' => 'O nás' ),
					array( 'path' => '/rocniky/', 'title' => 'Minulé ročníky' ),
					array( 'page' => 15606, 'title' => 'Přístupnost festivalu' ),
				) ),
				array( 'slug' => 'sponzori', 'title' => 'PARTNEŘI' ),
				array( 'page' => 202, 'title' => 'PRESS' ),
				array( 'page' => 17, 'title' => 'KONTAKTY' ),
				array( 'page' => 24, 'title' => 'BLOG' ),
			),
			'en' => array(
				array( 'page' => 10206, 'title' => 'FESTIVAL', 'children' => array(
					array( 'page' => 10206, 'title' => 'About us' ),
					array( 'path' => '/en/rocniky/', 'title' => 'Previous years' ),
					array( 'page' => 15608, 'title' => 'Festival accessibility' ),
				) ),
				array( 'slug' => 'partners', 'title' => 'PARTNERS' ),
				array( 'page' => 1330, 'title' => 'PRESS' ),
				array( 'page' => 179, 'title' => 'CONTACTS' ),
				array( 'page' => 5536, 'title' => 'BLOG' ),
			),
		),
		'bottom' => array(
			'cs' => array(
				array( 'page' => 193, 'title' => 'Best in Design', 'children' => array(
					array( 'page' => 215, 'title' => 'O soutěži' ),
					array( 'page' => 219, 'title' => 'Pravidla' ),
					array( 'page' => 21716, 'title' => 'Porota 2026' ),
					array( 'page' => 44077, 'title' => 'Finalisté 2026' ),
					array( 'page' => 28911, 'title' => 'FAQ' ),
					array( 'path' => '/best-in-design-rocniky/', 'title' => 'Minulé ročníky' ),
					array( 'page' => 258, 'title' => 'Kontakt' ),
				) ),
				array( 'page' => 12142, 'title' => 'Design KANTÝNA' ),
			),
			'en' => array(
				array( 'page' => 995, 'title' => 'Best in Design', 'children' => array(
					array( 'page' => 1015, 'title' => 'About the competition' ),
					array( 'page' => 1020, 'title' => 'Rules' ),
					array( 'page' => 21738, 'title' => 'Jury 2026' ),
					array( 'page' => 44083, 'title' => 'Finalists 2026' ),
					array( 'page' => 29580, 'title' => 'FAQ' ),
					array( 'path' => '/en/best-in-design/minule-rocniky/', 'title' => 'Previous years' ),
					array( 'page' => 1013, 'title' => 'Contact' ),
				) ),
				array( 'page' => 12192, 'title' => 'Design CANTEEN' ),
			),
		),
	);
}

/**
 * Verify one item before any existing menu is replaced.
 *
 * @param array<string, mixed> $item Menu item blueprint.
 * @return bool
 */
function zdw_two_tier_menu_blueprint_item_resolvable( $item ) {
	if ( empty( $item['title'] ) || ! is_string( $item['title'] ) ) {
		return false;
	}

	$target_count = (int) isset( $item['page'] ) + (int) isset( $item['slug'] ) + (int) isset( $item['path'] );
	if ( 1 !== $target_count ) {
		return false;
	}

	if ( isset( $item['page'] ) ) {
		$page = get_post( (int) $item['page'] );
		if ( ! $page instanceof WP_Post || 'page' !== $page->post_type || 'publish' !== $page->post_status ) {
			return false;
		}
	} elseif ( isset( $item['slug'] ) ) {
		$page = get_page_by_path( (string) $item['slug'], OBJECT, 'page' );
		if ( ! $page instanceof WP_Post || 'publish' !== $page->post_status ) {
			return false;
		}
	} elseif ( ! is_string( $item['path'] ) || '/' !== substr( $item['path'], 0, 1 ) ) {
		return false;
	}

	if ( isset( $item['children'] ) ) {
		if ( ! is_array( $item['children'] ) ) {
			return false;
		}
		foreach ( $item['children'] as $child ) {
			if ( ! is_array( $child ) || ! zdw_two_tier_menu_blueprint_item_resolvable( $child ) ) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Resolve every page/slug target before destructive replacement starts.
 *
 * @return bool
 */
function zdw_two_tier_menu_blueprints_resolvable() {
	$names      = zdw_two_tier_menu_names();
	$blueprints = zdw_two_tier_menu_blueprints();

	foreach ( $names as $row => $languages ) {
		foreach ( $languages as $language => $name ) {
			unset( $name );
			if ( ! isset( $blueprints[ $row ][ $language ] ) || ! is_array( $blueprints[ $row ][ $language ] ) ) {
				return false;
			}
			foreach ( $blueprints[ $row ][ $language ] as $item ) {
				if ( ! is_array( $item ) || ! zdw_two_tier_menu_blueprint_item_resolvable( $item ) ) {
					return false;
				}
			}
		}
	}

	return true;
}

/**
 * Insert one blueprint item and its children.
 *
 * @param int                  $menu_id Menu term ID.
 * @param array<string, mixed> $item Menu item blueprint.
 * @param int                  $parent_id Parent menu item ID.
 * @return bool Whether the complete item subtree was inserted.
 */
function zdw_two_tier_menu_insert_blueprint_item( $menu_id, $item, $parent_id = 0 ) {
	if ( isset( $item['page'] ) || isset( $item['slug'] ) ) {
		$page_id = isset( $item['page'] ) ? (int) $item['page'] : 0;
		if ( ! $page_id ) {
			$page = get_page_by_path( (string) $item['slug'], OBJECT, 'page' );
			$page_id = $page instanceof WP_Post ? (int) $page->ID : 0;
		}
		$item_id = zdw_two_tier_menu_add_page( $menu_id, $page_id, (string) $item['title'], $parent_id );
	} elseif ( isset( $item['path'], $item['title'] ) ) {
		$item_id = zdw_two_tier_menu_add_url( $menu_id, (string) $item['title'], home_url( (string) $item['path'] ), $parent_id );
	} else {
		return false;
	}

	if ( ! $item_id ) {
		return false;
	}

	if ( empty( $item['children'] ) ) {
		return true;
	}

	foreach ( $item['children'] as $child ) {
		if ( ! zdw_two_tier_menu_insert_blueprint_item( $menu_id, $child, $item_id ) ) {
			return false;
		}
	}

	return true;
}

/**
 * Capture enough data to reconstruct a menu and its hierarchy.
 *
 * @param int $menu_id Menu term ID.
 * @return array<int, array<string, mixed>>
 */
function zdw_two_tier_menu_snapshot_items( $menu_id ) {
	$snapshot = array();
	foreach ( (array) wp_get_nav_menu_items( $menu_id ) as $item ) {
		$snapshot[] = array(
			'original_id' => (int) $item->ID,
			'title'       => (string) $item->title,
			'description' => (string) $item->description,
			'attr_title'  => (string) $item->attr_title,
			'target'      => (string) $item->target,
			'classes'     => is_array( $item->classes ) ? implode( ' ', $item->classes ) : (string) $item->classes,
			'xfn'         => (string) $item->xfn,
			'url'         => (string) $item->url,
			'status'      => (string) $item->post_status,
			'type'        => (string) $item->type,
			'object'      => (string) $item->object,
			'object_id'   => (int) $item->object_id,
			'parent_id'   => (int) $item->menu_item_parent,
			'position'    => (int) $item->menu_order,
		);
	}

	return $snapshot;
}

/**
 * Convert one snapshot row to wp_update_nav_menu_item() arguments.
 *
 * @param array<string, mixed> $item Snapshot row.
 * @param int                  $parent_id Restored parent item ID.
 * @return array<string, mixed>
 */
function zdw_two_tier_menu_snapshot_item_args( $item, $parent_id ) {
	return array(
		'menu-item-title'       => (string) $item['title'],
		'menu-item-description' => (string) $item['description'],
		'menu-item-attr-title'  => (string) $item['attr_title'],
		'menu-item-target'      => (string) $item['target'],
		'menu-item-classes'     => (string) $item['classes'],
		'menu-item-xfn'         => (string) $item['xfn'],
		'menu-item-url'         => (string) $item['url'],
		'menu-item-status'      => (string) $item['status'],
		'menu-item-type'        => (string) $item['type'],
		'menu-item-object'      => (string) $item['object'],
		'menu-item-object-id'   => (int) $item['object_id'],
		'menu-item-parent-id'   => $parent_id,
		'menu-item-position'    => (int) $item['position'],
	);
}

/**
 * Remove every item from one menu.
 *
 * @param int $menu_id Menu term ID.
 * @return bool
 */
function zdw_two_tier_menu_clear_items( $menu_id ) {
	foreach ( (array) wp_get_nav_menu_items( $menu_id ) as $item ) {
		if ( ! wp_delete_post( $item->ID, true ) ) {
			return false;
		}
	}

	return true;
}

/**
 * Restore a snapshot after a failed replacement.
 *
 * @param int                             $menu_id Menu term ID.
 * @param array<int, array<string, mixed>> $snapshot Original items.
 * @return bool
 */
function zdw_two_tier_menu_restore_items( $menu_id, $snapshot ) {
	if ( ! zdw_two_tier_menu_clear_items( $menu_id ) ) {
		return false;
	}

	$restored_ids = array();
	foreach ( $snapshot as $item ) {
		$result = wp_update_nav_menu_item(
			$menu_id,
			0,
			zdw_two_tier_menu_snapshot_item_args( $item, 0 )
		);
		if ( is_wp_error( $result ) || ! $result ) {
			return false;
		}
		$restored_ids[ (int) $item['original_id'] ] = (int) $result;
	}

	foreach ( $snapshot as $item ) {
		$original_parent = (int) $item['parent_id'];
		if ( 0 === $original_parent ) {
			continue;
		}
		if ( ! isset( $restored_ids[ $original_parent ], $restored_ids[ (int) $item['original_id'] ] ) ) {
			return false;
		}
		$result = wp_update_nav_menu_item(
			$menu_id,
			$restored_ids[ (int) $item['original_id'] ],
			zdw_two_tier_menu_snapshot_item_args( $item, $restored_ids[ $original_parent ] )
		);
		if ( is_wp_error( $result ) || ! $result ) {
			return false;
		}
	}

	return true;
}

/**
 * Flatten a menu blueprint while retaining its expected hierarchy.
 *
 * @param array<int, array<string, mixed>> $items Blueprint items.
 * @param string                           $parent_path Expected parent path.
 * @return array<int, array<string, mixed>>
 */
function zdw_two_tier_menu_flatten_blueprint( $items, $parent_path = '' ) {
	$flat = array();
	foreach ( $items as $index => $item ) {
		$path   = '' === $parent_path ? (string) $index : $parent_path . '.' . $index;
		$flat[] = array(
			'path'        => $path,
			'parent_path' => $parent_path,
			'title'       => (string) $item['title'],
			'definition'  => $item,
		);
		if ( ! empty( $item['children'] ) && is_array( $item['children'] ) ) {
			$flat = array_merge( $flat, zdw_two_tier_menu_flatten_blueprint( $item['children'], $path ) );
		}
	}

	return $flat;
}

/**
 * Check whether one menu item resolves to the blueprint target.
 *
 * @param object               $actual Actual WordPress menu item.
 * @param array<string, mixed> $definition Blueprint item.
 * @return bool
 */
function zdw_two_tier_menu_target_matches( $actual, $definition ) {
	if ( isset( $definition['page'] ) || isset( $definition['slug'] ) ) {
		$page_id = isset( $definition['page'] ) ? (int) $definition['page'] : 0;
		if ( ! $page_id ) {
			$page    = get_page_by_path( (string) $definition['slug'], OBJECT, 'page' );
			$page_id = $page instanceof WP_Post ? (int) $page->ID : 0;
		}

		return $page_id > 0
			&& 'post_type' === (string) $actual->type
			&& 'page' === (string) $actual->object
			&& $page_id === (int) $actual->object_id;
	}

	if ( ! isset( $definition['path'] ) ) {
		return false;
	}

	return 'custom' === (string) $actual->type
		&& untrailingslashit( (string) $actual->url ) === untrailingslashit( home_url( (string) $definition['path'] ) );
}

/**
 * Verify that a menu is a complete, ordered installation of its blueprint.
 *
 * @param int                              $menu_id Menu term ID.
 * @param array<int, array<string, mixed>> $blueprint Expected structure.
 * @return bool
 */
function zdw_two_tier_menu_menu_matches_blueprint( $menu_id, $blueprint ) {
	$actual   = array_values( (array) wp_get_nav_menu_items( $menu_id ) );
	$expected = zdw_two_tier_menu_flatten_blueprint( $blueprint );
	if ( count( $actual ) !== count( $expected ) ) {
		return false;
	}

	$actual_ids_by_path = array();
	foreach ( $expected as $index => $item ) {
		$actual_item        = $actual[ $index ];
		$expected_parent_id = '' === $item['parent_path']
			? 0
			: ( $actual_ids_by_path[ $item['parent_path'] ] ?? -1 );
		if ( (string) $actual_item->title !== $item['title']
			|| (int) $actual_item->menu_item_parent !== $expected_parent_id
			|| ! zdw_two_tier_menu_target_matches( $actual_item, $item['definition'] ) ) {
			return false;
		}
		$actual_ids_by_path[ $item['path'] ] = (int) $actual_item->ID;
	}

	return true;
}

/**
 * Restore every menu already modified during an incomplete installation.
 *
 * @param array<int, array<string, mixed>> $affected Modified menus.
 * @param array<int, int>                  $created_menu_ids Menus created by the failed installation.
 * @param bool                             $state_locked Whether the caller owns the header-state lock.
 * @return bool Whether every snapshot was restored and every new menu removed.
 */
function zdw_two_tier_menu_rollback_install( $affected, $created_menu_ids = array(), $state_locked = false ) {
	$created_lookup = array_fill_keys( array_map( 'intval', $created_menu_ids ), true );
	$success        = true;
	foreach ( $affected as $menu ) {
		if ( ! isset( $created_lookup[ (int) $menu['id'] ] )
			&& ! zdw_two_tier_menu_restore_items( $menu['id'], $menu['snapshot'] ) ) {
			$success = false;
		}
	}
	foreach ( $created_menu_ids as $menu_id ) {
		$deleted = wp_delete_nav_menu( (int) $menu_id );
		if ( is_wp_error( $deleted ) || ! $deleted ) {
			$success = false;
		}
	}

	if ( ! $success ) {
		if ( $state_locked ) {
			zdw_two_tier_menu_record_install_failure_unlocked();
		} else {
			zdw_two_tier_menu_record_install_failure();
		}
	}

	return $success;
}

/**
 * Create the four editable menus, optionally replacing their seeded content.
 *
 * @param bool $replace Whether existing items should be replaced.
 * @param bool $state_locked Whether the caller owns the header-state lock.
 * @return bool Whether all four menus were installed completely.
 */
function zdw_two_tier_menu_install_menus_unlocked( $replace = false, $state_locked = false ) {
	$names      = zdw_two_tier_menu_names();
	$blueprints = zdw_two_tier_menu_blueprints();
	if ( ! zdw_two_tier_menu_blueprints_resolvable() ) {
		return false;
	}

	$menus            = array();
	$created_menu_ids = array();
	foreach ( $names as $row => $languages ) {
		foreach ( $languages as $language => $name ) {
			$menu = wp_get_nav_menu_object( $name );
			if ( $menu ) {
				$menu_id = (int) $menu->term_id;
			} else {
				$created = wp_create_nav_menu( $name );
				if ( is_wp_error( $created ) || ! $created ) {
					zdw_two_tier_menu_rollback_install( array(), $created_menu_ids, $state_locked );

					return false;
				}
				$menu_id            = (int) $created;
				$created_menu_ids[] = $menu_id;
			}
			$menus[] = array(
				'id'        => $menu_id,
				'blueprint' => $blueprints[ $row ][ $language ],
				'snapshot'  => zdw_two_tier_menu_snapshot_items( $menu_id ),
			);
		}
	}

	if ( ! $replace ) {
		$affected = array();
		foreach ( $menus as $menu ) {
			if ( ! empty( $menu['snapshot'] ) ) {
				if ( ! zdw_two_tier_menu_menu_matches_blueprint( $menu['id'], $menu['blueprint'] ) ) {
					zdw_two_tier_menu_rollback_install( $affected, $created_menu_ids, $state_locked );

					return false;
				}
				continue;
			}
			$affected[] = $menu;
			foreach ( $menu['blueprint'] as $item ) {
				if ( ! zdw_two_tier_menu_insert_blueprint_item( $menu['id'], $item ) ) {
					zdw_two_tier_menu_rollback_install( $affected, $created_menu_ids, $state_locked );

					return false;
				}
			}
			if ( ! zdw_two_tier_menu_menu_matches_blueprint( $menu['id'], $menu['blueprint'] ) ) {
				zdw_two_tier_menu_rollback_install( $affected, $created_menu_ids, $state_locked );

				return false;
			}
		}

		return true;
	}

	$affected = array();
	foreach ( $menus as $menu ) {
		$affected[] = $menu;
		$success    = zdw_two_tier_menu_clear_items( $menu['id'] );
		if ( $success ) {
			foreach ( $menu['blueprint'] as $item ) {
				if ( ! zdw_two_tier_menu_insert_blueprint_item( $menu['id'], $item ) ) {
					$success = false;
					break;
				}
			}
			$success = $success && zdw_two_tier_menu_menu_matches_blueprint( $menu['id'], $menu['blueprint'] );
		}

		if ( ! $success ) {
			zdw_two_tier_menu_rollback_install( $affected, $created_menu_ids, $state_locked );

			return false;
		}
	}

	return true;
}

/**
 * Serialize complete menu discovery, mutation and rollback across all callers.
 *
 * @param bool $replace Whether existing items should be replaced.
 * @return bool|null Success/failure, or null when another installer owns the lock.
 */
function zdw_two_tier_menu_install_menus( $replace = false ) {
	$lock_token = zdw_two_tier_menu_acquire_install_lock();
	if ( null === $lock_token ) {
		return null;
	}
	$state_lock_token = zdw_two_tier_menu_acquire_state_lock( true );
	if ( null === $state_lock_token ) {
		zdw_two_tier_menu_release_install_lock( $lock_token );

		return null;
	}

	try {
		return zdw_two_tier_menu_install_menus_unlocked( $replace, true );
	} finally {
		zdw_two_tier_menu_release_state_lock( $state_lock_token );
		zdw_two_tier_menu_release_install_lock( $lock_token );
	}
}

/** Record a failed installation while the caller owns the header-state lock. */
function zdw_two_tier_menu_record_install_failure_unlocked() {
	$enabled = get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, null );
	$pending = get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '0' );
	if ( null === $enabled || '0' !== (string) $enabled || '1' === (string) $pending ) {
		update_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '0' );
		update_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '1' );
	}
	delete_option( ZDW_TWO_TIER_MENU_OPTION_DB_VERSION );

	return true;
}

/**
 * Fail closed without confusing a deliberate Legacy selection with a retry.
 */
function zdw_two_tier_menu_record_install_failure() {
	$lock_token = zdw_two_tier_menu_acquire_state_lock();
	if ( null === $lock_token ) {
		return false;
	}

	try {
		return zdw_two_tier_menu_record_install_failure_unlocked();
	} finally {
		zdw_two_tier_menu_release_state_lock( $lock_token );
	}
}

/**
 * Complete installation and only undo a disablement caused by an earlier failure.
 */
function zdw_two_tier_menu_record_install_success() {
	$lock_token = zdw_two_tier_menu_acquire_state_lock();
	if ( null === $lock_token ) {
		return false;
	}

	try {
		$enabled = get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, null );
		$pending = '1' === (string) get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL, '0' );
		if ( $pending || null === $enabled ) {
			update_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' );
		}
		delete_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL );
		update_option( ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, ZDW_TWO_TIER_MENU_DB_VERSION );

		return true;
	} finally {
		zdw_two_tier_menu_release_state_lock( $lock_token );
	}
}

/**
 * Explicitly enable a completely rebuilt menu while serializing manual saves.
 *
 * @return bool
 */
function zdw_two_tier_menu_enable_completed_install() {
	$lock_token = zdw_two_tier_menu_acquire_state_lock();
	if ( null === $lock_token ) {
		return false;
	}

	try {
		update_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' );
		delete_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL );
		update_option( ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, ZDW_TWO_TIER_MENU_DB_VERSION );

		return true;
	} finally {
		zdw_two_tier_menu_release_state_lock( $lock_token );
	}
}

/**
 * Install defaults for a fresh activation.
 */
function zdw_two_tier_menu_activate() {
	$installed = zdw_two_tier_menu_install_menus();
	if ( true === $installed ) {
		zdw_two_tier_menu_record_install_success();
	} elseif ( false === $installed ) {
		zdw_two_tier_menu_record_install_failure();
	}
	add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED, '1' );
	add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, "SEE YOU IN MAY '27⭐" );
	add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN, "SEE YOU IN MAY '27⭐" );
	add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS, '' );
	add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN, '' );
}
register_activation_hook( __FILE__, 'zdw_two_tier_menu_activate' );

/**
 * Acquire an owned, expiring option lock.
 *
 * @param string $option_name Lock option name.
 * @param int    $ttl Lock lifetime in seconds.
 * @return string|null Opaque ownership token, or null when another request owns the lock.
 */
function zdw_two_tier_menu_acquire_owned_lock( $option_name, $ttl ) {
	$token = wp_generate_uuid4();
	$claim = array(
		'token'      => $token,
		'claimed_at' => time(),
	);
	if ( add_option( $option_name, $claim, '', false ) ) {
		return $token;
	}

	$existing   = get_option( $option_name, false );
	$claimed_at = is_array( $existing )
		? (int) ( $existing['claimed_at'] ?? 0 )
		: ( is_numeric( $existing ) ? (int) $existing : 0 );
	if ( $claimed_at > time() - $ttl ) {
		return null;
	}

	global $wpdb;
	$updated = $wpdb->query(
		$wpdb->prepare(
			"UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s",
			maybe_serialize( $claim ),
			$option_name,
			maybe_serialize( $existing )
		)
	);
	if ( 1 !== $updated ) {
		return null;
	}

	wp_cache_delete( $option_name, 'options' );

	return $token;
}

/**
 * Release an option lock only when the caller still owns it.
 *
 * @param string $option_name Lock option name.
 * @param string $token Opaque ownership token.
 */
function zdw_two_tier_menu_release_owned_lock( $option_name, $token ) {
	$claim = get_option( $option_name, false );
	if ( ! is_array( $claim ) || ! hash_equals( (string) ( $claim['token'] ?? '' ), (string) $token ) ) {
		return;
	}

	global $wpdb;
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s",
			$option_name,
			maybe_serialize( $claim )
		)
	);
	wp_cache_delete( $option_name, 'options' );
}

/**
 * Acquire the automatic data-upgrade lock.
 *
 * @return string|null
 */
function zdw_two_tier_menu_acquire_upgrade_lock() {
	return zdw_two_tier_menu_acquire_owned_lock(
		ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK,
		ZDW_TWO_TIER_MENU_UPGRADE_LOCK_TTL
	);
}

/**
 * Release the automatic data-upgrade lock.
 *
 * @param string $token Opaque ownership token.
 */
function zdw_two_tier_menu_release_upgrade_lock( $token ) {
	zdw_two_tier_menu_release_owned_lock( ZDW_TWO_TIER_MENU_OPTION_UPGRADE_LOCK, $token );
}

/**
 * Acquire the menu discovery/mutation lock.
 *
 * @return string|null
 */
function zdw_two_tier_menu_acquire_install_lock() {
	return zdw_two_tier_menu_acquire_owned_lock(
		ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK,
		ZDW_TWO_TIER_MENU_UPGRADE_LOCK_TTL
	);
}

/**
 * Release the menu discovery/mutation lock.
 *
 * @param string $token Opaque ownership token.
 */
function zdw_two_tier_menu_release_install_lock( $token ) {
	zdw_two_tier_menu_release_owned_lock( ZDW_TWO_TIER_MENU_OPTION_INSTALL_LOCK, $token );
}

/**
 * Acquire the short-lived header-state lock.
 *
 * @param bool $wait Briefly wait when an administrator is saving the setting.
 * @return string|null
 */
function zdw_two_tier_menu_acquire_state_lock( $wait = false ) {
	$attempts = $wait ? 40 : 1;
	for ( $attempt = 0; $attempt < $attempts; $attempt++ ) {
		$token = zdw_two_tier_menu_acquire_owned_lock(
			ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK,
			ZDW_TWO_TIER_MENU_STATE_LOCK_TTL
		);
		if ( null !== $token ) {
			return $token;
		}
		if ( $attempt + 1 < $attempts ) {
			usleep( 25000 );
		}
	}

	return null;
}

/**
 * Release the header-state lock.
 *
 * @param string $token Opaque ownership token.
 */
function zdw_two_tier_menu_release_state_lock( $token ) {
	zdw_two_tier_menu_release_owned_lock( ZDW_TWO_TIER_MENU_OPTION_STATE_LOCK, $token );
}

/**
 * One-time upgrade from the menu experiment to the production default.
 */
function zdw_two_tier_menu_upgrade() {
	if ( ZDW_TWO_TIER_MENU_DB_VERSION === get_option( ZDW_TWO_TIER_MENU_OPTION_DB_VERSION ) ) {
		return;
	}

	$lock_token = zdw_two_tier_menu_acquire_upgrade_lock();
	if ( null === $lock_token ) {
		return;
	}

	try {
		if ( ZDW_TWO_TIER_MENU_DB_VERSION === get_option( ZDW_TWO_TIER_MENU_OPTION_DB_VERSION ) ) {
			return;
		}

		$installed = zdw_two_tier_menu_install_menus();
		if ( null === $installed ) {
			return;
		}
		if ( ! $installed ) {
			zdw_two_tier_menu_record_install_failure();

			return;
		}
		if ( ! zdw_two_tier_menu_record_install_success() ) {
			return;
		}
		add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED, '1' );
		add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, "SEE YOU IN MAY '27⭐" );
		add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN, "SEE YOU IN MAY '27⭐" );
		add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS, '' );
		add_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN, '' );
	} finally {
		zdw_two_tier_menu_release_upgrade_lock( $lock_token );
	}
}
add_action( 'init', 'zdw_two_tier_menu_upgrade', 5 );

/**
 * Whether an administrator explicitly requested the isolated preview.
 *
 * @return bool
 */
function zdw_two_tier_menu_is_preview() {
	return current_user_can( 'manage_options' )
		&& isset( $_GET['zdw-menu-preview'] )
		&& 'new' === sanitize_key( wp_unslash( $_GET['zdw-menu-preview'] ) );
}

/**
 * Whether an administrator explicitly requested the legacy comparison.
 *
 * @return bool
 */
function zdw_two_tier_menu_is_legacy_preview() {
	return current_user_can( 'manage_options' )
		&& isset( $_GET['zdw-menu-preview'] )
		&& 'legacy' === sanitize_key( wp_unslash( $_GET['zdw-menu-preview'] ) );
}

/**
 * Public switch used by the child header template.
 *
 * @return bool
 */
function zdw_two_tier_menu_is_active() {
	if ( zdw_two_tier_menu_is_preview() ) {
		return true;
	}

	if ( zdw_two_tier_menu_is_legacy_preview() ) {
		return false;
	}

	return '1' === (string) get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' );
}

/**
 * Keep preview mode while navigating the experimental menu.
 *
 * @param string $url Target URL.
 * @return string
 */
function zdw_two_tier_menu_preview_url( $url ) {
	return zdw_two_tier_menu_is_preview() ? add_query_arg( 'zdw-menu-preview', 'new', $url ) : $url;
}

/**
 * Current Polylang language with a safe Czech fallback.
 *
 * @return string
 */
function zdw_two_tier_menu_language() {
	$language = function_exists( 'pll_current_language' ) ? pll_current_language( 'slug' ) : 'cs';
	return 'en' === $language ? 'en' : 'cs';
}

/**
 * Localized homepage URL with a safe site-root fallback.
 *
 * @param string $language Polylang language slug.
 * @return string
 */
function zdw_two_tier_menu_home_url( $language ) {
	if ( function_exists( 'pll_home_url' ) ) {
		$url = pll_home_url( $language );
		if ( is_string( $url ) && '' !== $url ) {
			return $url;
		}
	}

	return home_url( '/' );
}

/**
 * Render one of the isolated menus by name.
 *
 * @param string $kind top or bottom row.
 * @param string $class CSS class.
 */
function zdw_two_tier_menu_render_nav( $kind, $class ) {
	$language = zdw_two_tier_menu_language();
	$names    = zdw_two_tier_menu_names();
	$kind     = 'bottom' === $kind ? 'bottom' : 'top';
	$viewport = false !== strpos( $class, 'mobile' ) ? 'mobile' : 'desktop';
	$instance = $kind . '-' . $viewport . '-' . $language;
	$item_id_filter = static function ( $menu_id ) use ( $instance ) {
		return $menu_id ? $menu_id . '-' . $instance : '';
	};

	add_filter( 'nav_menu_item_id', $item_id_filter, 10, 1 );

	try {
		wp_nav_menu(
			array(
				'menu'        => $names[ $kind ][ $language ],
				'container'   => false,
				'menu_id'     => 'zdw-two-tier-' . $instance,
				'menu_class'  => 'zdw-two-tier__menu ' . $class,
				'depth'       => 2,
				'fallback_cb' => false,
			)
		);
	} finally {
		remove_filter( 'nav_menu_item_id', $item_id_filter, 10 );
	}
}

/**
 * Render the language switch independently from the editable navigation.
 */
function zdw_two_tier_menu_render_language_switch() {
	if ( ! function_exists( 'pll_the_languages' ) ) {
		return;
	}

	$languages = pll_the_languages( array( 'raw' => 1 ) );
	foreach ( $languages as $language ) {
		if ( ! empty( $language['current_lang'] ) || empty( $language['url'] ) ) {
			continue;
		}

		printf(
			'<a class="zdw-two-tier__language" href="%1$s" lang="%2$s" hreflang="%2$s">%3$s</a>',
			esc_url( zdw_two_tier_menu_preview_url( $language['url'] ) ),
			esc_attr( $language['slug'] ),
			esc_html( strtoupper( $language['slug'] ) )
		);
		break;
	}
}

/**
 * Render an optional announcement above both navigation rows.
 */
function zdw_two_tier_menu_notice_is_visible() {
	if ( '1' !== (string) get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED, '0' ) ) {
		return false;
	}

	$text = 'en' === zdw_two_tier_menu_language()
		? get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN, '' )
		: get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, '' );

	return '' !== trim( (string) $text );
}

/**
 * Render an optional announcement above both navigation rows.
 */
function zdw_two_tier_menu_render_notice() {
	if ( ! zdw_two_tier_menu_notice_is_visible() ) {
		return;
	}

	$language = zdw_two_tier_menu_language();
	$text      = 'en' === $language
		? get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN, '' )
		: get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, '' );
	$url       = 'en' === $language
		? get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN, '' )
		: get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS, '' );

	?>
	<div class="zdw-two-tier__notice">
		<?php if ( $url ) : ?>
			<a href="<?php echo esc_url( zdw_two_tier_menu_preview_url( $url ) ); ?>"><?php echo esc_html( $text ); ?> <span aria-hidden="true">→</span></a>
		<?php else : ?>
			<span><?php echo esc_html( $text ); ?></span>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Multi-level header markup called only by the child theme.
 */
function zdw_two_tier_menu_render_header() {
	$language     = zdw_two_tier_menu_language();
	$top_label    = 'en' === $language ? 'Festival navigation' : 'Festivalová navigace';
	$bottom_label = 'en' === $language ? 'Projects navigation' : 'Navigace projektů';
	$home_url     = zdw_two_tier_menu_preview_url( zdw_two_tier_menu_home_url( $language ) );
	?>
	<header class="header zdw-two-tier<?php echo zdw_two_tier_menu_notice_is_visible() ? ' has-notice' : ''; ?>" role="banner">
		<?php zdw_two_tier_menu_render_notice(); ?>
		<div class="zdw-two-tier__top">
			<div class="zdw-two-tier__inner">
				<div class="logo zdw-two-tier__logo">
					<a href="<?php echo esc_url( $home_url ); ?>">
						<img src="<?php echo esc_url( get_template_directory_uri() . '/img/logo-white.svg' ); ?>" alt="<?php echo esc_attr( get_bloginfo( 'name', 'display' ) ); ?>" class="logo-img">
					</a>
				</div>
				<nav class="zdw-two-tier__desktop-nav" aria-label="<?php echo esc_attr( $top_label ); ?>">
					<?php zdw_two_tier_menu_render_nav( 'top', 'zdw-two-tier__menu--top' ); ?>
				</nav>
				<div class="zdw-two-tier__desktop-language"><?php zdw_two_tier_menu_render_language_switch(); ?></div>
				<button class="zdw-two-tier__trigger" type="button" aria-expanded="false" aria-controls="zdw-two-tier-mobile-panel">
					<span>MENU</span><span class="zdw-two-tier__trigger-icon" aria-hidden="true">↓</span>
				</button>
			</div>
		</div>
		<div class="zdw-two-tier__phase-row">
			<div class="zdw-two-tier__inner">
				<nav class="zdw-two-tier__phase-nav" aria-label="<?php echo esc_attr( $bottom_label ); ?>">
					<?php zdw_two_tier_menu_render_nav( 'bottom', 'zdw-two-tier__menu--bottom' ); ?>
				</nav>
			</div>
		</div>
		<div id="zdw-two-tier-mobile-panel" class="zdw-two-tier__mobile-panel" hidden>
			<div class="zdw-two-tier__mobile-group">
				<nav aria-label="<?php echo esc_attr( $top_label ); ?>">
					<?php zdw_two_tier_menu_render_nav( 'top', 'zdw-two-tier__menu--mobile-top' ); ?>
				</nav>
			</div>
			<div class="zdw-two-tier__mobile-group zdw-two-tier__mobile-group--current">
				<nav aria-label="<?php echo esc_attr( $bottom_label ); ?>">
					<?php zdw_two_tier_menu_render_nav( 'bottom', 'zdw-two-tier__menu--mobile-bottom' ); ?>
				</nav>
			</div>
			<div class="zdw-two-tier__mobile-language"><?php zdw_two_tier_menu_render_language_switch(); ?></div>
		</div>
	</header>
	<?php
}

/**
 * Add preview mode to editable menu links.
 *
 * @param array<string, string> $atts Menu link attributes.
 * @param WP_Post               $item Menu item.
 * @param stdClass              $args Menu arguments.
 * @return array<string, string>
 */
function zdw_two_tier_menu_preview_menu_links( $atts, $item, $args ) {
	if ( zdw_two_tier_menu_is_preview() && ! empty( $atts['href'] ) && false !== strpos( (string) $args->menu_class, 'zdw-two-tier__menu' ) ) {
		$atts['href'] = zdw_two_tier_menu_preview_url( $atts['href'] );
	}
	return $atts;
}
add_filter( 'nav_menu_link_attributes', 'zdw_two_tier_menu_preview_menu_links', 10, 3 );

/**
 * Render the redesigned, non-clickable homepage programme grid.
 *
 * @return string
 */
function zdw_two_tier_menu_render_showcase() {
	$language = zdw_two_tier_menu_language();
	$is_en    = 'en' === $language;
	$base_url = plugins_url( 'assets/images/', __FILE__ );
	$market   = wp_get_attachment_image_src( 35407, 'full' );
	$items    = array(
		array(
			'slug'   => 'exhibitions',
			'label'  => $is_en ? 'Exhibitions and installations' : 'Výstavy a instalace',
			'src'    => $base_url . 'exhibitions.jpg',
			'width'  => 1200,
			'height' => 1800,
		),
		array(
			'slug'   => 'discussions',
			'label'  => $is_en ? 'Discussions and conferences' : 'Diskuze a konference',
			'src'    => $base_url . 'discussions.jpg',
			'width'  => 1800,
			'height' => 1439,
		),
		array(
			'slug'   => 'performance',
			'label'  => $is_en ? 'Performance and fashion show' : 'Performance a fashion show',
			'src'    => $base_url . 'performance.jpg',
			'width'  => 1440,
			'height' => 1800,
		),
		array(
			'slug'   => 'workshops',
			'label'  => $is_en ? 'Educational and creative workshops' : 'Edukativní a tvůrčí workshopy',
			'src'    => $base_url . 'workshops.jpg',
			'width'  => 1440,
			'height' => 1800,
		),
		array(
			'slug'   => 'music',
			'label'  => $is_en ? 'Music programme' : 'Hudební program',
			'src'    => $base_url . 'music.jpg',
			'width'  => 1440,
			'height' => 1800,
		),
		array(
			'slug'   => 'market',
			'label'  => 'Design Market',
			'src'    => $market ? $market[0] : '',
			'width'  => $market ? (int) $market[1] : 1600,
			'height' => $market ? (int) $market[2] : 1200,
		),
	);
	$statement = $is_en
		? 'We are an open platform for sharing, discovery and the creation of meaningful cultural connections, a place for experimentation and debate about the future of design. We bring together people who are moving the design and creative scene forward.'
		: 'Jsme otevřenou platformou pro sdílení, objevování a vznik smysluplných kulturních vazeb, místem pro experiment a debaty o budoucnosti designu. Spojujeme lidi, kteří posouvají designérskou a kreativní scénu dál.';

	ob_start();
	?>
	<section class="zdw-showcase" aria-label="<?php echo esc_attr( $is_en ? 'What Zlin Design Week offers' : 'Co nabízí Zlin Design Week' ); ?>">
		<div class="zdw-showcase__intro">
			<p><?php echo esc_html( $statement ); ?></p>
		</div>
		<div class="zdw-showcase__grid">
			<?php foreach ( $items as $item ) : ?>
				<article class="zdw-showcase__item zdw-showcase__item--<?php echo esc_attr( $item['slug'] ); ?>">
					<?php if ( $item['src'] ) : ?>
						<img src="<?php echo esc_url( $item['src'] ); ?>" width="<?php echo esc_attr( $item['width'] ); ?>" height="<?php echo esc_attr( $item['height'] ); ?>" alt="" loading="lazy" decoding="async">
					<?php endif; ?>
					<h2 class="zdw-showcase__item-title"><?php echo esc_html( $item['label'] ); ?></h2>
				</article>
			<?php endforeach; ?>
		</div>
	</section>
	<?php
	return (string) ob_get_clean();
}

/**
 * Replace the old linked-tile groups without modifying editor content.
 *
 * @param string               $block_content Rendered block HTML.
 * @param array<string, mixed> $block Parsed block data.
 * @return string
 */
function zdw_two_tier_menu_filter_showcase_blocks( $block_content, $block ) {
	if ( ! is_front_page() || 'core/group' !== ( $block['blockName'] ?? '' ) ) {
		return $block_content;
	}

	$class_name = (string) ( $block['attrs']['className'] ?? '' );
	if ( false !== strpos( $class_name, 'na-co-se-tesit-section' ) ) {
		return zdw_two_tier_menu_render_showcase();
	}

	return $block_content;
}
add_filter( 'render_block', 'zdw_two_tier_menu_filter_showcase_blocks', 20, 2 );

/**
 * Load the homepage grid independently of the selected header variant.
 */
function zdw_two_tier_menu_showcase_assets() {
	if ( ! is_front_page() ) {
		return;
	}

	$path = __DIR__ . '/assets/showcase.css';
	wp_enqueue_style(
		'zdw-homepage-showcase',
		plugins_url( 'assets/showcase.css', __FILE__ ),
		array(),
		file_exists( $path ) ? (string) filemtime( $path ) : ZDW_TWO_TIER_MENU_DB_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'zdw_two_tier_menu_showcase_assets', 31 );

/**
 * Load header assets only while the multi-level variant is visible.
 */
function zdw_two_tier_menu_assets() {
	if ( ! zdw_two_tier_menu_is_active() ) {
		return;
	}

	$asset_dir = __DIR__ . '/assets';
	$menu_css  = $asset_dir . '/menu.css';
	$menu_js   = $asset_dir . '/menu.js';
	wp_enqueue_style(
		'zdw-two-tier-menu',
		plugins_url( 'assets/menu.css', __FILE__ ),
		array(),
		file_exists( $menu_css ) ? (string) filemtime( $menu_css ) : ZDW_TWO_TIER_MENU_DB_VERSION
	);
	wp_enqueue_script(
		'zdw-two-tier-menu',
		plugins_url( 'assets/menu.js', __FILE__ ),
		array(),
		file_exists( $menu_js ) ? (string) filemtime( $menu_js ) : ZDW_TWO_TIER_MENU_DB_VERSION,
		true
	);
}
add_action( 'wp_enqueue_scripts', 'zdw_two_tier_menu_assets', 30 );

/**
 * Body hook for layout and isolated styling.
 *
 * @param array<int, string> $classes Body classes.
 * @return array<int, string>
 */
function zdw_two_tier_menu_body_class( $classes ) {
	if ( zdw_two_tier_menu_is_active() ) {
		$classes[] = 'zdw-two-tier-menu-active';
		if ( zdw_two_tier_menu_notice_is_visible() ) {
			$classes[] = 'zdw-two-tier-menu-has-notice';
		}
	}
	return $classes;
}
add_filter( 'body_class', 'zdw_two_tier_menu_body_class' );

/**
 * Normalize the header switch.
 *
 * @param mixed $value Submitted option value.
 * @return string
 */
function zdw_two_tier_menu_sanitize_enabled_setting( $value ) {
	return '1' === (string) $value ? '1' : '0';
}

/**
 * Hold the state lock across the complete Settings API option update.
 *
 * @param mixed  $value Submitted value.
 * @param mixed  $old_value Stored value.
 * @param string $option Option name.
 * @return mixed
 */
function zdw_two_tier_menu_lock_manual_setting_update( $value, $old_value, $option ) {
	unset( $option );
	if ( ! current_user_can( 'manage_options' )
		|| ! isset( $_POST['option_page'] )
		|| 'zdw_two_tier_menu' !== sanitize_key( wp_unslash( $_POST['option_page'] ) ) ) {
		return $value;
	}

	$token = zdw_two_tier_menu_acquire_state_lock( true );
	if ( null === $token ) {
		add_settings_error(
			'zdw_two_tier_menu',
			'zdw_two_tier_menu_state_busy',
			'Nastavení headeru právě mění jiný požadavek. Zkuste je prosím uložit znovu.',
			'error'
		);

		return $old_value;
	}

	$GLOBALS['zdw_two_tier_menu_setting_lock_token'] = $token;
	delete_option( ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL );

	return $value;
}
add_filter(
	'pre_update_option_' . ZDW_TWO_TIER_MENU_OPTION_ENABLED,
	'zdw_two_tier_menu_lock_manual_setting_update',
	10,
	3
);

/** Release a manual-settings lock at the end of the request. */
function zdw_two_tier_menu_release_manual_setting_lock() {
	$token = $GLOBALS['zdw_two_tier_menu_setting_lock_token'] ?? null;
	if ( is_string( $token ) ) {
		zdw_two_tier_menu_release_state_lock( $token );
		unset( $GLOBALS['zdw_two_tier_menu_setting_lock_token'] );
	}
}
add_action( 'shutdown', 'zdw_two_tier_menu_release_manual_setting_lock' );

/**
 * Register isolated experiment settings.
 */
function zdw_two_tier_menu_register_settings() {
	register_setting(
		'zdw_two_tier_menu',
		ZDW_TWO_TIER_MENU_OPTION_ENABLED,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'zdw_two_tier_menu_sanitize_enabled_setting',
			'default'           => '1',
		)
	);

	register_setting(
		'zdw_two_tier_menu',
		ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED,
		array(
			'type'              => 'string',
			'sanitize_callback' => static function ( $value ) {
				return '1' === (string) $value ? '1' : '0';
			},
			'default'           => '1',
		)
	);

	foreach ( array( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN ) as $option ) {
		register_setting(
			'zdw_two_tier_menu',
			$option,
			array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			)
		);
	}

	foreach ( array( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS, ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN ) as $option ) {
		register_setting(
			'zdw_two_tier_menu',
			$option,
			array(
				'type'              => 'string',
				'sanitize_callback' => 'esc_url_raw',
			)
		);
	}
}
add_action( 'admin_init', 'zdw_two_tier_menu_register_settings' );

/**
 * Add the experiment under Appearance.
 */
function zdw_two_tier_menu_admin_page() {
	add_theme_page(
		'Víceúrovňové menu',
		'Víceúrovňové menu',
		'manage_options',
		'zdw-two-tier-menu',
		'zdw_two_tier_menu_render_admin_page'
	);
}
add_action( 'admin_menu', 'zdw_two_tier_menu_admin_page' );

/**
 * Settings and direct links to the four editable WordPress menus.
 */
function zdw_two_tier_menu_render_admin_page() {
	$names       = zdw_two_tier_menu_names();
	$preview_url = add_query_arg( 'zdw-menu-preview', 'new', home_url( '/' ) );
	$legacy_url  = add_query_arg( 'zdw-menu-preview', 'legacy', home_url( '/' ) );
	?>
	<div class="wrap">
		<h1>Víceúrovňové menu</h1>
		<p>Nový třířádkový header je výchozí. Původní Header Menu zůstává zachované jako varianta Legacy.</p>
		<p><a class="button button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noopener noreferrer">Náhled Multi-level</a> <a class="button button-secondary" href="<?php echo esc_url( $legacy_url ); ?>" target="_blank" rel="noopener noreferrer">Náhled Legacy</a></p>
		<form action="options.php" method="post">
			<?php settings_fields( 'zdw_two_tier_menu' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">Použitý header</th>
					<td>
						<label><input type="radio" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_ENABLED ); ?>" value="1" <?php checked( '1', get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' ) ); ?>> Multi-level (výchozí)</label><br>
						<label><input type="radio" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_ENABLED ); ?>" value="0" <?php checked( '0', get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' ) ); ?>> Legacy</label>
					</td>
				</tr>
				<?php zdw_two_tier_menu_render_notice_settings_rows(); ?>
			</table>
			<?php submit_button(); ?>
		</form>

		<h2>Obsah samostatných menu</h2>
		<p>Horní a spodní řádek mají samostatnou českou a anglickou verzi. Vnořené položky lze upravit standardně přetažením.</p>
		<ul>
			<?php foreach ( $names as $row => $languages ) : ?>
				<?php foreach ( $languages as $language => $name ) : ?>
					<?php $menu = wp_get_nav_menu_object( $name ); ?>
					<li><strong><?php echo esc_html( ucfirst( $row ) . ' ' . strtoupper( $language ) ); ?>:</strong> <?php if ( $menu ) : ?><a href="<?php echo esc_url( admin_url( 'nav-menus.php?action=edit&menu=' . (int) $menu->term_id ) ); ?>"><?php echo esc_html( $name ); ?></a><?php else : ?>menu nebylo nalezeno<?php endif; ?></li>
				<?php endforeach; ?>
			<?php endforeach; ?>
		</ul>
	</div>
	<?php
}

/**
 * Shared announcement fields used on both experiment settings screens.
 */
function zdw_two_tier_menu_render_notice_settings_rows() {
	?>
	<tr>
		<th scope="row">Informační proužek</th>
		<td>
			<input type="hidden" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED ); ?>" value="0">
			<label><input type="checkbox" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED ); ?>" value="1" <?php checked( '1', get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_ENABLED, '0' ) ); ?>> Zobrazit proužek nad novým headerem</label>
		</td>
	</tr>
	<tr>
		<th scope="row"><label for="zdw-two-tier-notice-cs">Text proužku — CZ</label></th>
		<td><input class="regular-text" id="zdw-two-tier-notice-cs" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS ); ?>" value="<?php echo esc_attr( get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_CS, "SEE YOU IN MAY '27⭐" ) ); ?>"></td>
	</tr>
	<tr>
		<th scope="row"><label for="zdw-two-tier-notice-en">Text proužku — EN</label></th>
		<td><input class="regular-text" id="zdw-two-tier-notice-en" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN ); ?>" value="<?php echo esc_attr( get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_TEXT_EN, "SEE YOU IN MAY '27⭐" ) ); ?>"></td>
	</tr>
	<tr>
		<th scope="row"><label for="zdw-two-tier-notice-url-cs">Odkaz proužku — CZ</label></th>
		<td><input class="regular-text code" type="url" id="zdw-two-tier-notice-url-cs" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS ); ?>" value="<?php echo esc_attr( get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_CS, '' ) ); ?>" placeholder="https://…"></td>
	</tr>
	<tr>
		<th scope="row"><label for="zdw-two-tier-notice-url-en">Odkaz proužku — EN</label></th>
		<td>
			<input class="regular-text code" type="url" id="zdw-two-tier-notice-url-en" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN ); ?>" value="<?php echo esc_attr( get_option( ZDW_TWO_TIER_MENU_OPTION_NOTICE_URL_EN, '' ) ); ?>" placeholder="https://…">
			<p class="description">Odkaz je volitelný. Bez něj se proužek zobrazí pouze jako text.</p>
		</td>
	</tr>
	<?php
}

/**
 * Show the header switch alongside the existing intro-block experiment.
 */
function zdw_two_tier_menu_render_intro_experiment_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$preview_url = add_query_arg( 'zdw-menu-preview', 'new', home_url( '/' ) );
	$legacy_url  = add_query_arg( 'zdw-menu-preview', 'legacy', home_url( '/' ) );
	?>
	<hr style="margin:32px 0">
	<h2>Víceúrovňový header</h2>
	<p>Multi-level je výchozí varianta; původní header zůstává dostupný jako Legacy.</p>
	<p><a class="button button-secondary" href="<?php echo esc_url( $preview_url ); ?>" target="_blank" rel="noopener noreferrer">Náhled Multi-level</a> <a class="button button-secondary" href="<?php echo esc_url( $legacy_url ); ?>" target="_blank" rel="noopener noreferrer">Náhled Legacy</a> <a class="button button-link" href="<?php echo esc_url( admin_url( 'themes.php?page=zdw-two-tier-menu' ) ); ?>">Správa čtyř menu</a></p>
	<form action="options.php" method="post">
		<?php settings_fields( 'zdw_two_tier_menu' ); ?>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row">Použitý header</th>
				<td>
					<label><input type="radio" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_ENABLED ); ?>" value="1" <?php checked( '1', get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' ) ); ?>> Multi-level (výchozí)</label><br>
					<label><input type="radio" name="<?php echo esc_attr( ZDW_TWO_TIER_MENU_OPTION_ENABLED ); ?>" value="0" <?php checked( '0', get_option( ZDW_TWO_TIER_MENU_OPTION_ENABLED, '1' ) ); ?>> Legacy</label>
				</td>
			</tr>
			<?php zdw_two_tier_menu_render_notice_settings_rows(); ?>
		</table>
		<?php submit_button( 'Uložit nastavení headeru' ); ?>
	</form>
	<?php
}
add_action( 'zdw_intro_experiment_after_settings', 'zdw_two_tier_menu_render_intro_experiment_settings' );
