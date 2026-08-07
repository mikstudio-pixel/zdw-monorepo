<?php
ob_start();
pll_e( 'copyright-info' );
$footer_legal_content = trim( ob_get_clean() );
$footer_legal_parts = preg_split( '/<br\s*\/?\s*>/i', $footer_legal_content, 4 );
$footer_legal_parts = array_pad( $footer_legal_parts ?: array(), 4, '' );
$footer_legal_links = preg_replace( '/\s*\|\s*/', '', $footer_legal_parts[3] );
$footer_legal_label = function_exists( 'pll_current_language' ) && pll_current_language() === 'en'
	? 'Legal information'
	: 'Právní informace';
?>

<section class="footer-legal" aria-label="<?php echo esc_attr( $footer_legal_label ); ?>">
	<div class="footer-legal__primary">
		<p class="footer-legal__support"><?php echo wp_kses_post( $footer_legal_parts[0] ); ?></p>
		<p class="footer-legal__about"><?php echo wp_kses_post( $footer_legal_parts[1] ); ?></p>
	</div>
	<div class="footer-legal__meta">
		<p class="footer-legal__admin"><?php echo wp_kses_post( $footer_legal_parts[2] ); ?></p>
		<nav class="footer-legal__links" aria-label="<?php echo esc_attr( $footer_legal_label ); ?>">
			<?php echo wp_kses_post( $footer_legal_links ); ?>
		</nav>
	</div>
</section>
