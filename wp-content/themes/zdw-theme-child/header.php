<!doctype html>
<html <?php language_attributes(); ?>>

<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<title><?php wp_title( '' ); ?><?php if ( wp_title( '', false ) ) { echo ' – '; } ?><?php bloginfo( 'name' ); ?></title>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1">
	<?php echo get_option( 'zdwf_head' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
	<?php wp_head(); ?>
	<style>
		:root {
			--dark: <?php echo esc_html( get_option( 'zdwf_color_dark' ) ); ?>;
			--light: <?php echo esc_html( get_option( 'zdwf_color_light' ) ); ?>;
			--bg: <?php echo esc_html( get_option( 'zdwf_color_bg' ) ); ?>;
			--zdw: <?php echo esc_html( get_option( 'zdwf_color_zdw' ) ); ?>;
			--wp--custom--carousel-block--navigation-color: <?php echo esc_html( get_option( 'zdwf_color_zdw' ) ); ?>;
			--confe: <?php echo esc_html( get_option( 'zdwf_color_confe' ) ); ?>;
			--vkd: <?php echo esc_html( get_option( 'zdwf_color_vkd' ) ); ?>;
			--bid: <?php echo esc_html( get_option( 'zdwf_color_bid' ) ); ?>;
			--plus: <?php echo esc_html( get_option( 'zdwf_color_plus' ) ); ?>;
			--font: <?php echo esc_html( get_option( 'zdwf_font_family' ) ); ?>;
			--heading-font: <?php echo esc_html( get_option( 'zdwf_font_family_heading' ) ); ?>;
		}

		body,
		html {
			font-family: var(--font);
		}

		h1, .h1, .is-style-h1,
		h2, .h2, .is-style-h2,
		h3, .h3, .is-style-h3,
		h4, .h4, .is-style-h4,
		h5, .h5, .is-style-h5,
		h6, .h6, .is-style-h6 {
			font-family: var(--heading-font);
		}
	</style>
	<?php if ( is_single() && 'post' === get_post_type() && has_post_thumbnail() ) : ?>
		<meta property="og:image" content="<?php echo esc_url( get_the_post_thumbnail_url( get_the_ID(), 'photo' ) ); ?>">
	<?php elseif ( is_front_page() ) : ?>
		<meta property="og:image" content="https://zlindesignweek.com/2020/wp-content/themes/zdw-theme/img/og-image.png">
	<?php endif; ?>
</head>

<body <?php body_class(); ?>>
	<?php wp_body_open(); ?>
	<div class="wrapper">
		<?php if ( function_exists( 'zdw_two_tier_menu_is_active' ) && zdw_two_tier_menu_is_active() ) : ?>
			<?php zdw_two_tier_menu_render_header(); ?>
		<?php else : ?>
			<header class="header" role="banner">
				<div class="container container--flex container--align-items-center container--space-between">
					<div style="display:flex;align-items:center">
						<div class="logo">
							<a href="<?php echo esc_url( home_url() ); ?>">
								<img src="<?php echo esc_url( get_template_directory_uri() . '/img/logo-white.svg' ); ?>" alt="<?php echo esc_attr( get_bloginfo( 'name', 'display' ) ); ?>" class="logo-img">
							</a>
						</div>
					</div>
					<div class="menu-trigger-wrap">
						<a href="" class="menu-trigger">
							<span class="menu-trigger-text">MENU</span>
							<span class="menu-trigger-icon icon-open">↓</span>
							<span class="menu-trigger-icon icon-close">↑</span>
						</a>
					</div>
					<nav class="header-nav" role="navigation">
						<?php wp_nav_menu( array( 'theme_location' => 'header-menu' ) ); ?>
					</nav>
				</div>
			</header>
			<?php endif; ?>
		<?php if ( function_exists( 'zdw_page_supports_side_images' ) && zdw_page_supports_side_images() ) : ?>
			<div id="side-images">
				<img class="side-image rellax" id="side-things-1" alt="" data-rellax-speed="2" src="<?php echo esc_url( get_template_directory_uri() . '/img/side-things.png?v=3' ); ?>" srcset="<?php echo esc_url( get_template_directory_uri() . '/img/side-things.png?v=3' ); ?>, <?php echo esc_url( get_template_directory_uri() . '/img/side-things@2x.png?v=3' ); ?> 2x">
				<img class="side-image rellax" id="side-things-2" alt="" data-rellax-speed="1" src="<?php echo esc_url( get_template_directory_uri() . '/img/side-things-2.png?v=2' ); ?>" srcset="<?php echo esc_url( get_template_directory_uri() . '/img/side-things-2.png?v=2' ); ?>, <?php echo esc_url( get_template_directory_uri() . '/img/side-things-2@2x.png?v=2' ); ?> 2x">
				<img class="side-image rellax" id="side-things-3" alt="" data-rellax-speed="1" src="<?php echo esc_url( get_template_directory_uri() . '/img/side-things-3.png?v=2' ); ?>" srcset="<?php echo esc_url( get_template_directory_uri() . '/img/side-things-3.png?v=2' ); ?>, <?php echo esc_url( get_template_directory_uri() . '/img/side-things-3@2x.png?v=2' ); ?> 2x">
			</div>
		<?php endif; ?>
