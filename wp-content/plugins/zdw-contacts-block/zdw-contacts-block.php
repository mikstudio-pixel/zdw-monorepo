<?php
/**
 * Plugin Name: ZDW Contacts Block
 * Description: Editable, accessible contact cards for Zlin Design Week.
 * Version: 1.1.0
 * Author: Zlin Design Week
 */

defined( 'ABSPATH' ) || exit;

/**
 * Sanitize one contact stored in block attributes.
 *
 * @param mixed $contact Contact data.
 * @return array<string, string>
 */
function zdw_contacts_block_sanitize_contact( $contact ) {
	$contact = is_array( $contact ) ? $contact : array();
	$decode  = static function ( $value ) {
		return html_entity_decode( (string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	};

	return array(
		'section' => isset( $contact['section'] ) ? sanitize_text_field( $decode( $contact['section'] ) ) : '',
		'name'    => isset( $contact['name'] ) ? sanitize_text_field( $decode( $contact['name'] ) ) : '',
		'role'    => isset( $contact['role'] ) ? sanitize_text_field( $decode( $contact['role'] ) ) : '',
		'email'   => isset( $contact['email'] ) ? sanitize_email( $contact['email'] ) : '',
		'phone'   => isset( $contact['phone'] ) ? sanitize_text_field( $decode( $contact['phone'] ) ) : '',
	);
}

/**
 * Render the dynamic contact block.
 *
 * @param array<string, mixed> $attributes Block attributes.
 * @return string
 */
function zdw_contacts_block_render( $attributes ) {
	$contacts = isset( $attributes['contacts'] ) && is_array( $attributes['contacts'] )
		? array_map( 'zdw_contacts_block_sanitize_contact', $attributes['contacts'] )
		: array();
	$contacts = array_values(
		array_filter(
			$contacts,
			static function ( $contact ) {
				return '' !== $contact['name'];
			}
		)
	);

	if ( empty( $contacts ) ) {
		return '';
	}

	$variant      = isset( $attributes['variant'] ) && 'compact' === $attributes['variant'] ? 'compact' : 'grid';
	$current_lang = function_exists( 'pll_current_language' ) ? pll_current_language() : 'cs';
	$is_english   = 'en' === $current_lang;
	$label        = $is_english ? 'Contacts' : 'Kontakty';
	$sections     = array();

	foreach ( $contacts as $contact ) {
		// Keep previously saved contact pages compatible with the merged team structure.
		if ( 'Programme Directors' === $contact['section'] ) {
			$contact['section'] = 'Festival Management';
		}

		$details = array();

		if ( $contact['email'] ) {
			$details[] = sprintf(
				'<a class="zdw-contacts__link" href="mailto:%1$s">%2$s</a>',
				esc_attr( $contact['email'] ),
				esc_html( antispambot( $contact['email'] ) )
			);
		}

		if ( $contact['phone'] ) {
			$phone_href = preg_replace( '/[^0-9+]/', '', $contact['phone'] );
			$details[]  = sprintf(
				'<a class="zdw-contacts__link" href="tel:%1$s">%2$s</a>',
				esc_attr( $phone_href ),
				esc_html( $contact['phone'] )
			);
		}

		$heading_level = $contact['section'] ? 'h3' : 'h2';
		$person        = sprintf(
			'<article class="zdw-contacts__person"><div class="zdw-contacts__identity"><%1$s class="zdw-contacts__name">%2$s</%1$s><p class="zdw-contacts__role">%3$s</p></div><div class="zdw-contacts__details">%4$s</div></article>',
			$heading_level,
			esc_html( $contact['name'] ),
			esc_html( $contact['role'] ),
			implode( '', $details )
		);

		$section_key = $contact['section'] ? $contact['section'] : '__unsectioned';
		if ( ! isset( $sections[ $section_key ] ) ) {
			$sections[ $section_key ] = array(
				'title'  => $contact['section'],
				'people' => array(),
			);
		}
		$sections[ $section_key ]['people'][] = $person;
	}

	$rendered_sections = array();
	foreach ( $sections as $section ) {
		$section_heading = $section['title']
			? '<h2 class="zdw-contacts__section-title">' . esc_html( $section['title'] ) . '</h2>'
			: '';
		$rendered_sections[] = sprintf(
			'<section class="zdw-contacts__section">%1$s<div class="zdw-contacts__people">%2$s</div></section>',
			$section_heading,
			implode( '', $section['people'] )
		);
	}

	$wrapper_attributes = get_block_wrapper_attributes(
		array(
			'class' => sprintf( 'zdw-contacts zdw-contacts--%s', esc_attr( $variant ) ),
		)
	);

	return sprintf(
		'<section %1$s aria-label="%2$s"><div class="zdw-contacts__inner"><div class="zdw-contacts__track">%3$s</div></div></section>',
		$wrapper_attributes,
		esc_attr( $label ),
		implode( '', $rendered_sections )
	);
}

/**
 * Register block assets and the dynamic block.
 */
function zdw_contacts_block_register() {
	$block_dir = __DIR__ . '/block';

	wp_register_script(
		'zdw-contacts-block-editor',
		plugins_url( 'block/editor.js', __FILE__ ),
		array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-html-entities' ),
		(string) filemtime( $block_dir . '/editor.js' ),
		true
	);

	wp_register_style(
		'zdw-contacts-block',
		plugins_url( 'block/style.css', __FILE__ ),
		array(),
		(string) filemtime( $block_dir . '/style.css' )
	);

	wp_register_style(
		'zdw-contacts-block-editor',
		plugins_url( 'block/editor.css', __FILE__ ),
		array(),
		(string) filemtime( $block_dir . '/editor.css' )
	);

	register_block_type(
		'zdw/contacts',
		array(
			'api_version'     => 2,
			'editor_script'   => 'zdw-contacts-block-editor',
			'style'           => 'zdw-contacts-block',
			'editor_style'    => 'zdw-contacts-block-editor',
			'attributes'      => array(
				'contacts' => array( 'type' => 'array', 'default' => array() ),
				'variant'  => array( 'type' => 'string', 'default' => 'grid' ),
			),
			'render_callback' => 'zdw_contacts_block_render',
		)
	);
}
add_action( 'init', 'zdw_contacts_block_register' );
