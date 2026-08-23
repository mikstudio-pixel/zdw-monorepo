<?php
/**
 * Child theme overrides intentionally live in template files. The parent
 * theme continues to register and enqueue all assets and functionality.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Polylang stores menu-location assignments per theme. When the child theme
 * was activated, WordPress fell back to a page list. Resolve the existing
 * Czech/English menus by name so the header stays identical to the parent.
 */
function zdw_child_restore_header_menu( $args ) {
	if ( empty( $args['theme_location'] ) || 'header-menu' !== $args['theme_location'] ) {
		return $args;
	}

	$language  = function_exists( 'pll_current_language' ) ? pll_current_language( 'slug' ) : 'cs';
	$menu_name = 'en' === $language ? 'Header Menu EN' : 'Header Menu';
	$menu      = wp_get_nav_menu_object( $menu_name );

	if ( $menu ) {
		$args['menu']        = (int) $menu->term_id;
		$args['fallback_cb'] = false;
	}

	return $args;
}
add_filter( 'wp_nav_menu_args', 'zdw_child_restore_header_menu', 20 );
