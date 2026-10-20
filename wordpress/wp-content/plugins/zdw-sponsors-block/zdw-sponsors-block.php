<?php
/**
 * Plugin Name: ZDW Sponsors Block
 * Description: Gutenberg block for editable Zlin Design Week sponsor sections.
 * Version: 1.2.1
 * Author: Zlin Design Week
 */

defined( 'ABSPATH' ) || exit;

/**
 * The legacy logo galleries were attached to the homepage as a single ACF
 * metabox. The Gutenberg block now owns this content, so hide the old box
 * without deleting its stored values.
 */
function zdw_sponsors_block_remove_legacy_home_metabox( $post ) {
	if ( $post instanceof WP_Post && 2 === (int) $post->ID ) {
		remove_meta_box( 'acf-group_5dfe9f90c4d81', 'page', 'normal' );
	}
}
add_action( 'add_meta_boxes_page', 'zdw_sponsors_block_remove_legacy_home_metabox', 99 );

/**
 * Sponsor sections in the same order as the legacy footer.
 *
 * The key is stored in block content. The title slug reuses the existing
 * Polylang strings so Czech and English keep the current translations.
 */
function zdw_sponsors_block_sections() {
	return array(
		'poradatele'                        => array( 'title' => 'organiser', 'editorTitle' => 'Pořadatelé', 'size' => 'large' ),
		'festival_vznika_za_podpory'        => array( 'title' => 'festival-supporters', 'editorTitle' => 'Festival vzniká za finanční podpory', 'size' => 'large' ),
		'hlavni_partner'                    => array( 'title' => 'main-partner', 'editorTitle' => 'Hlavní partner', 'size' => 'default' ),
		'generalni_medialni_partner'        => array( 'title' => 'general-media-partner', 'editorTitle' => 'Generální mediální partner', 'size' => 'default' ),
		'hlavni_medialni_partneri'          => array( 'title' => 'main-media-partners', 'editorTitle' => 'Hlavní mediální partneři', 'size' => 'default' ),
		'oficialni_vuz_festivalu'           => array( 'title' => 'official-festival-car', 'editorTitle' => 'Oficiální vůz festivalu', 'size' => 'default' ),
		'oficialni_hotel_festivalu'         => array( 'title' => 'official-festival-hotel', 'editorTitle' => 'Oficiální hotel festivalu', 'size' => 'default' ),
		'hlavni_napoj_festivalu'            => array( 'title' => 'main-festival-drink', 'editorTitle' => 'Hlavní nápoj festivalu', 'size' => 'default' ),
		'partneri'                          => array( 'title' => 'partners', 'editorTitle' => 'Partneři', 'size' => 'default' ),
		'medialni_partneri'                 => array( 'title' => 'media-partners', 'editorTitle' => 'Mediální partneři', 'size' => 'default' ),
		'garanti_a_partneri_best_in_design' => array( 'title' => 'guarantors-and-partners-best-in-design', 'editorTitle' => 'Garanti a partneři Best in Design', 'size' => 'default' ),
	);
}

function zdw_sponsors_block_title( $slug ) {
	if ( function_exists( 'pll__' ) ) {
		return pll__( $slug );
	}

	return $slug;
}

function zdw_sponsors_block_attachment_field( $field, $attachment_id ) {
	if ( function_exists( 'get_field' ) ) {
		return get_field( $field, $attachment_id );
	}

	return get_post_meta( $attachment_id, $field, true );
}

function zdw_sponsors_block_render( $attributes ) {
	$sections = isset( $attributes['sections'] ) && is_array( $attributes['sections'] ) ? $attributes['sections'] : array();

	if ( empty( $sections ) ) {
		return '';
	}

	$values = array(
		'paddingTop'          => array( 0, 240, 64 ),
		'paddingBottom'       => array( 0, 240, 64 ),
		'paddingTopMobile'    => array( 0, 160, 32 ),
		'paddingBottomMobile' => array( 0, 160, 32 ),
		'sectionGap'          => array( 0, 200, 80 ),
		'titleGap'            => array( 0, 80, 12 ),
		'logoGap'             => array( 0, 80, 0 ),
		'logoRowGap'          => array( 0, 80, 0 ),
	);

	foreach ( $values as $name => $limits ) {
		$value           = isset( $attributes[ $name ] ) ? (int) $attributes[ $name ] : $limits[2];
		$values[ $name ] = max( $limits[0], min( $limits[1], $value ) );
	}

	$style = sprintf(
		'--zdw-sponsors-pt:%dpx;--zdw-sponsors-pb:%dpx;--zdw-sponsors-pt-mobile:%dpx;--zdw-sponsors-pb-mobile:%dpx;--zdw-sponsors-section-gap:%dpx;--zdw-sponsors-title-gap:%dpx;--zdw-sponsors-logo-gap:%dpx;--zdw-sponsors-logo-row-gap:%dpx;',
		$values['paddingTop'],
		$values['paddingBottom'],
		$values['paddingTopMobile'],
		$values['paddingBottomMobile'],
		$values['sectionGap'],
		$values['titleGap'],
		$values['logoGap'],
		$values['logoRowGap']
	);

	$current_language = function_exists( 'pll_current_language' ) ? pll_current_language() : '';
	$definition       = zdw_sponsors_block_sections();
	$rendered         = array();

	foreach ( $definition as $key => $section ) {
		$image_ids = isset( $sections[ $key ] ) && is_array( $sections[ $key ] ) ? array_map( 'absint', $sections[ $key ] ) : array();
		$logos     = array();

		foreach ( array_filter( $image_ids ) as $attachment_id ) {
			$language = (string) zdw_sponsors_block_attachment_field( 'jazyky', $attachment_id );

			if ( in_array( $current_language, array( 'cs', 'en' ), true )
				&& ( ( 'cs' === $language && 'cs' !== $current_language ) || ( 'en' === $language && 'en' !== $current_language ) ) ) {
				continue;
			}

			$image_source = wp_get_attachment_image_src( $attachment_id, 'full' );
			if ( ! is_array( $image_source ) || empty( $image_source[0] ) ) {
				continue;
			}

			$url_value   = zdw_sponsors_block_attachment_field( 'url', $attachment_id );
			$label_value = zdw_sponsors_block_attachment_field( 'label', $attachment_id );
			$url         = is_scalar( $url_value ) ? esc_url_raw( (string) $url_value ) : '';
			$label       = is_scalar( $label_value ) ? (string) $label_value : '';
			$alt   = trim( wp_strip_all_tags( (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) ) );
			if ( '' !== $url && '' === $alt ) {
				$alt = trim( wp_strip_all_tags( (string) ( $label ?: get_the_title( $attachment_id ) ) ) );
			}
			if ( '' !== $url && '' === $alt ) {
				$host = wp_parse_url( $url, PHP_URL_HOST );
				$alt  = is_string( $host ) && '' !== $host ? $host : __( 'Sponsor', 'zdw-sponsors-block' );
			}
			$image = sprintf(
				'<img src="%1$s" %2$s class="zdw-sponsors__image" alt="%3$s" loading="lazy" decoding="async">',
				esc_url( $image_source[0] ),
				image_hwstring( (int) $image_source[1], (int) $image_source[2] ),
				esc_attr( $alt )
			);

			$logo  = '';

			if ( $label ) {
				$logo .= '<span class="zdw-sponsors__label">' . esc_html( $label ) . '</span>';
			}

			$logo .= $image;

			if ( '' !== $url ) {
				$logo = '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . $logo . '</a>';
			}

			$logos[] = '<div class="zdw-sponsors__logo">' . $logo . '</div>';
		}

		if ( empty( $logos ) ) {
			continue;
		}

		$rendered[] = sprintf(
			'<section class="zdw-sponsors__section zdw-sponsors__section--%1$s zdw-sponsors__section--%2$s"><h2 class="zdw-sponsors__title">%3$s</h2><div class="zdw-sponsors__logos">%4$s</div></section>',
			esc_attr( $section['size'] ),
			esc_attr( sanitize_html_class( $key ) ),
			esc_html( zdw_sponsors_block_title( $section['title'] ) ),
			implode( '', $logos )
		);
	}

	if ( empty( $rendered ) ) {
		return '';
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array(
			'class' => 'zdw-sponsors',
			'style' => $style,
		)
	);

	return '<div ' . $wrapper_attributes . '><div class="zdw-sponsors__inner">' . implode( '', $rendered ) . '</div></div>';
}

function zdw_sponsors_block_register() {
	$block_dir = __DIR__ . '/block';
	$editor_js = $block_dir . '/editor.js';
	$style_css = $block_dir . '/style.css';
	$editor_css = $block_dir . '/editor.css';

	wp_register_script(
		'zdw-sponsors-block-editor',
		plugins_url( 'block/editor.js', __FILE__ ),
		array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-element' ),
		file_exists( $editor_js ) ? (string) filemtime( $editor_js ) : '1.2.0',
		true
	);

	$editor_sections = array();
	foreach ( zdw_sponsors_block_sections() as $key => $section ) {
		$editor_sections[] = array( $key, $section['editorTitle'] );
	}
	wp_localize_script(
		'zdw-sponsors-block-editor',
		'zdwSponsorsBlockConfig',
		array( 'sections' => $editor_sections )
	);

	wp_register_style(
		'zdw-sponsors-block',
		plugins_url( 'block/style.css', __FILE__ ),
		array(),
		file_exists( $style_css ) ? (string) filemtime( $style_css ) : '1.2.0'
	);

	wp_register_style(
		'zdw-sponsors-block-editor',
		plugins_url( 'block/editor.css', __FILE__ ),
		array(),
		file_exists( $editor_css ) ? (string) filemtime( $editor_css ) : '1.2.0'
	);

	register_block_type(
		'zdw/sponsors',
		array(
			'api_version'     => 2,
			'editor_script'   => 'zdw-sponsors-block-editor',
			'style'           => 'zdw-sponsors-block',
			'editor_style'    => 'zdw-sponsors-block-editor',
			'attributes'      => array(
				'sections'            => array( 'type' => 'object', 'default' => array() ),
				'paddingTop'          => array( 'type' => 'number', 'default' => 64 ),
				'paddingBottom'       => array( 'type' => 'number', 'default' => 64 ),
				'paddingTopMobile'    => array( 'type' => 'number', 'default' => 32 ),
				'paddingBottomMobile' => array( 'type' => 'number', 'default' => 32 ),
				'sectionGap'          => array( 'type' => 'number', 'default' => 80 ),
				'titleGap'            => array( 'type' => 'number', 'default' => 12 ),
				'logoGap'             => array( 'type' => 'number', 'default' => 0 ),
				'logoRowGap'          => array( 'type' => 'number', 'default' => 0 ),
			),
			'render_callback' => 'zdw_sponsors_block_render',
		)
	);
}
add_action( 'init', 'zdw_sponsors_block_register' );

/**
 * Register a shared inserter category for ZDW blocks.
 *
 * @param array<int, array<string, string>> $categories Existing categories.
 * @return array<int, array<string, string>>
 */
function zdw_sponsors_block_categories( $categories ) {
	foreach ( $categories as $category ) {
		if ( 'zdw' === ( $category['slug'] ?? '' ) ) {
			return $categories;
		}
	}

	$categories[] = array( 'slug' => 'zdw', 'title' => 'ZDW' );

	return $categories;
}
add_filter( 'block_categories_all', 'zdw_sponsors_block_categories' );
