<?php
/**
 * One-off content migration for the 2027 contact team.
 *
 * Run a preview:
 * php /var/www/html/wp-content/plugins/zdw-contacts-block/tools/migrate-contacts.php
 *
 * Apply changes:
 * php /var/www/html/wp-content/plugins/zdw-contacts-block/tools/migrate-contacts.php --apply
 */

if ( 'cli' !== PHP_SAPI ) {
	exit( "This script can only be run from the command line.\n" );
}

require '/var/www/html/wp-load.php';

$apply = in_array( '--apply', $argv, true );

$team = array(
	array(
		'section' => 'Festival Management',
		'name'  => 'Ondřej Staněk',
		'role'  => 'Project Manager & Creative Director',
		'email' => 'ondrej.stanek@zlindesignweek.com',
		'phone' => '+420 731 560 687',
	),
	array(
		'section' => 'Festival Management',
		'name'  => 'Matěj Pešek',
		'role'  => 'Production Director',
		'email' => 'matej.pesek@zlindesignweek.com',
		'phone' => '+420 722 952 351',
	),
	array(
		'section' => 'Festival Management',
		'name'  => 'Šárka Doležalová',
		'role'  => 'Best in Design Director',
		'email' => 'sarka.dolezalova@zlindesignweek.com',
		'phone' => '+420 705 226 157',
	),
	array(
		'section' => 'Festival Management',
		'name'  => 'Emma Matisko',
		'role'  => 'Design CANTEEN Director',
		'email' => 'emma.matisko@zlindesignweek.com',
		'phone' => '+420 733 710 703',
	),
	array(
		'section' => 'Partnerships & Public Relations',
		'name'  => 'Barbora Hanoldová',
		'role'  => 'Partnerships Director',
		'email' => 'b_hanoldova@utb.cz',
		'phone' => '+420 720 497 790',
	),
	array(
		'section' => 'Partnerships & Public Relations',
		'name'  => 'Eva Ševčíková',
		'role'  => 'Public Relations',
		'email' => 'eva.sevcikova@zlindesignweek.com',
		'phone' => '+420 723 457 715',
	),
	array(
		'section' => 'Guest Service & Accessibility',
		'name'  => 'Adam Bruno Rafaj',
		'role'  => 'Guest Service',
		'email' => 'adam.rafaj@zlindesignweek.com',
		'phone' => '+420 735 124 545',
	),
	array(
		'section' => 'Guest Service & Accessibility',
		'name'  => 'Anna Svobodová',
		'role'  => 'Coordinator of Accessibility',
		'email' => 'anna.svobodova@zlindesignweek.com',
		'phone' => '+420 733 144 711',
	),
);

$eva = array(
	array(
		'name'  => 'Eva Ševčíková',
		'role'  => 'Public Relations',
		'email' => 'eva.sevcikova@zlindesignweek.com',
		'phone' => '+420 723 457 715',
	),
);

$sarka = array(
	array(
		'name'  => 'Šárka Doležalová',
		'role'  => 'Best in Design Director',
		'email' => 'sarka.dolezalova@zlindesignweek.com',
		'phone' => '+420 705 226 157',
	),
);

$anna = array(
	array(
		'name'  => 'Anna Svobodová',
		'role'  => 'Coordinator of Accessibility',
		'email' => 'anna.svobodova@zlindesignweek.com',
		'phone' => '+420 733 144 711',
	),
);

/**
 * Return a parsed dynamic contact block.
 *
 * @param array<int, array<string, string>> $contacts Contacts.
 * @param string                            $variant  Block variant.
 * @return array<string, mixed>
 */
function zdw_contacts_migration_block( $contacts, $variant ) {
	return array(
		'blockName'    => 'zdw/contacts',
		'attrs'        => array(
			'contacts' => $contacts,
			'variant'  => $variant,
		),
		'innerBlocks'  => array(),
		'innerHTML'    => '',
		'innerContent' => array(),
	);
}

/**
 * Return a serialized dynamic contact block.
 *
 * @param array<int, array<string, string>> $contacts Contacts.
 * @param string                            $variant  Block variant.
 * @return string
 */
function zdw_contacts_migration_serialized_block( $contacts, $variant ) {
	return serialize_block( zdw_contacts_migration_block( $contacts, $variant ) );
}

/**
 * Replace the contact group and accreditation group on a press-kit page.
 *
 * @param string                            $content  Existing block content.
 * @param array<int, array<string, string>> $contacts Replacement contact.
 * @return string
 */
function zdw_contacts_migration_press_content( $content, $contacts ) {
	if ( has_block( 'zdw/contacts', $content ) ) {
		return $content;
	}

	$blocks          = parse_blocks( $content );
	$updated         = array();
	$contact_replaced = false;
	$skip_blank_tail = false;

	foreach ( $blocks as $block ) {
		$serialized       = serialize_block( $block );
		$is_accreditation = false !== stripos( $serialized, 'AKREDITACE' ) || false !== stripos( $serialized, 'ACCREDITATION' );

		if ( $is_accreditation ) {
			if ( ! empty( $updated ) && 'core/spacer' === end( $updated )['blockName'] ) {
				array_pop( $updated );
			}
			$skip_blank_tail = true;
			continue;
		}

		if ( ! $contact_replaced && 'core/group' === $block['blockName'] ) {
			$updated[]        = zdw_contacts_migration_block( $contacts, 'compact' );
			$contact_replaced = true;
			continue;
		}

		if ( $skip_blank_tail && ( 'core/spacer' === $block['blockName'] || ( 'core/paragraph' === $block['blockName'] && '' === trim( wp_strip_all_tags( $block['innerHTML'] ) ) ) ) ) {
			continue;
		}

		$skip_blank_tail = false;
		$updated[]       = $block;
	}

	return serialize_blocks( $updated );
}

/**
 * Replace the first legacy ACF contact block without touching adjacent copy.
 *
 * @param string                            $content  Existing block content.
 * @param array<int, array<string, string>> $contacts Replacement contact.
 * @return string
 */
function zdw_contacts_migration_replace_first_acf_contact( $content, $contacts ) {
	if ( has_block( 'zdw/contacts', $content ) ) {
		return $content;
	}

	$replacement = zdw_contacts_migration_serialized_block( $contacts, 'compact' );
	$updated     = preg_replace( '/<!--\s+wp:acf\/contact-person\s+.*?\/-->/s', $replacement, $content, 1 );

	if ( null === $updated || $updated === $content ) {
		throw new RuntimeException( 'Legacy ACF contact block was not found.' );
	}

	return $updated;
}

$changes = array(
	17    => zdw_contacts_migration_serialized_block( $team, 'grid' ),
	179   => zdw_contacts_migration_serialized_block( $team, 'grid' ),
	202   => zdw_contacts_migration_press_content( get_post_field( 'post_content', 202 ), $eva ),
	1330  => zdw_contacts_migration_press_content( get_post_field( 'post_content', 1330 ), $eva ),
	258   => zdw_contacts_migration_serialized_block( $sarka, 'compact' ),
	1013  => zdw_contacts_migration_serialized_block( $sarka, 'compact' ),
	15606 => zdw_contacts_migration_replace_first_acf_contact( get_post_field( 'post_content', 15606 ), $anna ),
	15608 => zdw_contacts_migration_replace_first_acf_contact( get_post_field( 'post_content', 15608 ), $anna ),
);

/**
 * Normalize parsed block values before comparing generated and stored content.
 * WordPress entity-encodes ampersands inside block JSON when a post is saved.
 *
 * @param mixed $value Parsed block value.
 * @return mixed
 */
function zdw_contacts_migration_normalize_value( $value ) {
	if ( is_array( $value ) ) {
		return array_map( 'zdw_contacts_migration_normalize_value', $value );
	}

	return is_string( $value ) ? html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : $value;
}

foreach ( $changes as $post_id => $content ) {
	$post = get_post( $post_id );
	if ( ! $post ) {
		throw new RuntimeException( sprintf( 'Post %d does not exist.', $post_id ) );
	}

	$content_matches = $content === $post->post_content
		|| zdw_contacts_migration_normalize_value( parse_blocks( $content ) )
			=== zdw_contacts_migration_normalize_value( parse_blocks( $post->post_content ) );
	$mode = $content_matches ? 'OK' : ( $apply ? 'UPDATE' : 'PREVIEW' );
	printf( "%s %d %-30s %d -> %d bytes\n", $mode, $post_id, $post->post_title, strlen( $post->post_content ), strlen( $content ) );

	if ( ! $apply || $content_matches ) {
		continue;
	}

	$result = wp_update_post(
		array(
			'ID'           => $post_id,
			// wp_update_post() unslashes input before saving. Preserve JSON escapes
			// emitted by serialize_block(), including the ampersand in job titles.
			'post_content' => wp_slash( $content ),
		),
		true
	);

	if ( is_wp_error( $result ) ) {
		throw new RuntimeException( $result->get_error_message() );
	}
}

echo $apply ? "Contact migration completed.\n" : "Preview only; run with --apply to save.\n";
