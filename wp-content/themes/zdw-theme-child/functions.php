<?php
/**
 * Child theme overrides intentionally live in template files. The parent
 * theme continues to register and enqueue all assets and functionality.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Load the licensed Roobert files from the child theme after the parent font
 * declarations. This keeps local and production rendering independent of
 * cross-origin font requests.
 */
function zdw_child_enqueue_local_fonts() {
	$relative_path = '/assets/fonts/roobert.css';
	$font_css_path = get_stylesheet_directory() . $relative_path;

	if ( ! is_file( $font_css_path ) ) {
		return;
	}

	wp_enqueue_style(
		'zdw-child-roobert',
		get_stylesheet_directory_uri() . $relative_path,
		array( 'main' ),
		(string) filemtime( $font_css_path )
	);
}
add_action( 'wp_enqueue_scripts', 'zdw_child_enqueue_local_fonts', 20 );

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

/**
 * Keep the site icon versioned with the child theme instead of relying on the
 * legacy Media Library favicon.
 */
function zdw_child_site_icon_url( $url ) {
	$relative_path = '/assets/site-icon.png';
	$icon_path     = get_stylesheet_directory() . $relative_path;

	if ( ! is_file( $icon_path ) ) {
		return $url;
	}

	return add_query_arg(
		'ver',
		(string) filemtime( $icon_path ),
		get_stylesheet_directory_uri() . $relative_path
	);
}
add_filter( 'get_site_icon_url', 'zdw_child_site_icon_url' );
