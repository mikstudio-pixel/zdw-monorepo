<?php
/**
 * Plugin Name: ZDW Intro Experiment
 * Description: Non-destructive experiments for the ZDW Intro Effect block.
 * Version: 0.3.1
 * Author: Zlin Design Week
 */

defined( 'ABSPATH' ) || exit;

/**
 * Return a cache-busting version based on an asset's modification time.
 */
function zdw_intro_experiment_asset_version( $relative_path ) {
	$path = plugin_dir_path( __FILE__ ) . ltrim( $relative_path, '/' );

	return file_exists( $path ) ? (string) filemtime( $path ) : '0.3.0';
}

/**
 * Register experiment assets and make sure our preparation script runs before
 * the original front-end renderer.
 */
function zdw_intro_experiment_register_assets() {
	wp_register_script(
		'zdw-intro-experiment-pre',
		plugins_url( 'assets/frontend-pre.js', __FILE__ ),
		array(),
		zdw_intro_experiment_asset_version( 'assets/frontend-pre.js' ),
		true
	);

	wp_register_script(
		'zdw-intro-experiment-frontend',
		plugins_url( 'assets/frontend.js', __FILE__ ),
		array( 'zdw-intro-effect-frontend' ),
		zdw_intro_experiment_asset_version( 'assets/frontend.js' ),
		true
	);

	wp_register_style(
		'zdw-intro-experiment',
		plugins_url( 'assets/frontend.css', __FILE__ ),
		array( 'zdw-intro-effect-style' ),
		zdw_intro_experiment_asset_version( 'assets/frontend.css' )
	);

	$wp_scripts = wp_scripts();

	if ( isset( $wp_scripts->registered['zdw-intro-effect-frontend'] ) ) {
		$dependencies = &$wp_scripts->registered['zdw-intro-effect-frontend']->deps;
		if ( ! in_array( 'zdw-intro-experiment-pre', $dependencies, true ) ) {
			array_unshift( $dependencies, 'zdw-intro-experiment-pre' );
		}
	}
}
add_action( 'init', 'zdw_intro_experiment_register_assets', 20 );

function zdw_intro_experiment_enqueue_frontend_assets() {
	if ( ! is_singular() || ! has_block( 'zdw/intro-effect' ) ) {
		return;
	}

	wp_enqueue_style( 'zdw-intro-experiment' );
	wp_enqueue_script( 'zdw-intro-experiment-frontend' );
	wp_add_inline_script(
		'zdw-intro-experiment-pre',
		'window.ZDWIntroExperimentConfig = ' . wp_json_encode(
			array(
				'mode'             => get_option( 'zdw_intro_effect_mode', 'filter' ),
				'filterIntensity'  => (int) get_option( 'zdw_intro_effect_intensity', 0 ),
				'overlayColor'     => get_option( 'zdw_intro_overlay_color', '#4e2797' ),
				'overlayOpacity'   => (int) get_option( 'zdw_intro_overlay_opacity', 25 ),
				'overlayBlendMode' => get_option( 'zdw_intro_overlay_blend_mode', 'normal' ),
				'plainTitle'       => (bool) get_option( 'zdw_intro_plain_title', false ),
			)
		) . ';',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'zdw_intro_experiment_enqueue_frontend_assets', 20 );

function zdw_intro_experiment_sanitize_intensity( $value ) {
	return max( 0, min( 100, (int) $value ) );
}

function zdw_intro_experiment_sanitize_mode( $value ) {
	$allowed = array( 'none', 'filter', 'overlay' );

	return in_array( $value, $allowed, true ) ? $value : 'filter';
}

function zdw_intro_experiment_sanitize_color( $value ) {
	$color = sanitize_hex_color( $value );

	return $color ? $color : '#4e2797';
}

function zdw_intro_experiment_sanitize_blend_mode( $value ) {
	$allowed = array( 'normal', 'screen', 'multiply', 'overlay', 'soft-light', 'color' );

	return in_array( $value, $allowed, true ) ? $value : 'normal';
}

function zdw_intro_experiment_sanitize_checkbox( $value ) {
	return empty( $value ) ? 0 : 1;
}

function zdw_intro_experiment_register_setting() {
	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_effect_mode',
		array(
			'type'              => 'string',
			'default'           => 'filter',
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_mode',
		)
	);

	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_effect_intensity',
		array(
			'type'              => 'integer',
			'default'           => 0,
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_intensity',
		)
	);

	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_overlay_color',
		array(
			'type'              => 'string',
			'default'           => '#4e2797',
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_color',
		)
	);

	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_overlay_opacity',
		array(
			'type'              => 'integer',
			'default'           => 25,
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_intensity',
		)
	);

	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_overlay_blend_mode',
		array(
			'type'              => 'string',
			'default'           => 'normal',
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_blend_mode',
		)
	);

	register_setting(
		'zdw_intro_experiment',
		'zdw_intro_plain_title',
		array(
			'type'              => 'boolean',
			'default'           => false,
			'sanitize_callback' => 'zdw_intro_experiment_sanitize_checkbox',
		)
	);
}
add_action( 'admin_init', 'zdw_intro_experiment_register_setting' );

function zdw_intro_experiment_add_settings_page() {
	add_options_page(
		'ZDW Intro Experiment',
		'ZDW Intro Experiment',
		'manage_options',
		'zdw-intro-experiment',
		'zdw_intro_experiment_render_settings_page'
	);
}
add_action( 'admin_menu', 'zdw_intro_experiment_add_settings_page' );

function zdw_intro_experiment_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$mode            = get_option( 'zdw_intro_effect_mode', 'filter' );
	$intensity       = (int) get_option( 'zdw_intro_effect_intensity', 0 );
	$overlay_color   = get_option( 'zdw_intro_overlay_color', '#4e2797' );
	$overlay_opacity = (int) get_option( 'zdw_intro_overlay_opacity', 25 );
	$blend_mode      = get_option( 'zdw_intro_overlay_blend_mode', 'normal' );
	$plain_title     = (bool) get_option( 'zdw_intro_plain_title', false );
	?>
	<div class="wrap">
		<h1>ZDW Intro Experiment</h1>
		<p>Experimentální nastavení se použije na Intro Effect bloky s videem. Původní šablona ani plugin ZDW Functions se nemění.</p>
		<form action="options.php" method="post">
			<?php settings_fields( 'zdw_intro_experiment' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="zdw-intro-effect-mode">Režim efektu</label></th>
					<td>
						<select id="zdw-intro-effect-mode" name="zdw_intro_effect_mode">
							<option value="none" <?php selected( $mode, 'none' ); ?>>Bez efektu</option>
							<option value="filter" <?php selected( $mode, 'filter' ); ?>>Původní barevná mapa</option>
							<option value="overlay" <?php selected( $mode, 'overlay' ); ?>>Jednoduchý color overlay</option>
						</select>
						<p class="description">Color overlay používá jen jednu barevnou vrstvu nad videem a je výrazně lehčí než původní efekt.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zdw-intro-effect-intensity">Intenzita barevného filtru</label></th>
					<td>
						<input
							type="range"
							id="zdw-intro-effect-intensity"
							name="zdw_intro_effect_intensity"
							min="0"
							max="100"
							step="5"
							value="<?php echo esc_attr( $intensity ); ?>"
							oninput="document.getElementById('zdw-intro-effect-intensity-value').value = this.value"
						>
						<output id="zdw-intro-effect-intensity-value"><?php echo esc_html( $intensity ); ?></output> %
						<p class="description">0 % zobrazí původní video. Vyšší hodnota přimíchá barevnou mapu; video zůstává oříznuté pomocí cover.</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zdw-intro-overlay-color">Barva overlaye</label></th>
					<td>
						<input
							type="color"
							id="zdw-intro-overlay-color"
							name="zdw_intro_overlay_color"
							value="<?php echo esc_attr( $overlay_color ); ?>"
						>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zdw-intro-overlay-opacity">Intenzita overlaye</label></th>
					<td>
						<input
							type="range"
							id="zdw-intro-overlay-opacity"
							name="zdw_intro_overlay_opacity"
							min="0"
							max="100"
							step="5"
							value="<?php echo esc_attr( $overlay_opacity ); ?>"
							oninput="document.getElementById('zdw-intro-overlay-opacity-value').value = this.value"
						>
						<output id="zdw-intro-overlay-opacity-value"><?php echo esc_html( $overlay_opacity ); ?></output> %
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="zdw-intro-overlay-blend-mode">Prolnutí overlaye</label></th>
					<td>
						<select id="zdw-intro-overlay-blend-mode" name="zdw_intro_overlay_blend_mode">
							<option value="normal" <?php selected( $blend_mode, 'normal' ); ?>>Normal</option>
							<option value="screen" <?php selected( $blend_mode, 'screen' ); ?>>Glow (Screen)</option>
							<option value="multiply" <?php selected( $blend_mode, 'multiply' ); ?>>Multiply</option>
							<option value="overlay" <?php selected( $blend_mode, 'overlay' ); ?>>Overlay</option>
							<option value="soft-light" <?php selected( $blend_mode, 'soft-light' ); ?>>Soft Light</option>
							<option value="color" <?php selected( $blend_mode, 'color' ); ?>>Color</option>
						</select>
						<p class="description">Normal pouze překryje obraz; Glow ho zesvětlí, Multiply ztmaví a ostatní režimy mění kontrast nebo barevnost.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Hlavní nápis</th>
					<td>
						<input type="hidden" name="zdw_intro_plain_title" value="0">
						<label for="zdw-intro-plain-title">
							<input
								type="checkbox"
								id="zdw-intro-plain-title"
								name="zdw_intro_plain_title"
								value="1"
								<?php checked( $plain_title ); ?>
							>
							Čistě bílý hlavní nápis bez negativního efektu
						</label>
						<p class="description">Vypne režim Exclusion pouze pro nápis ZLIN DESIGN WEEK; ostatní vrstvy hero bloku zůstanou beze změny.</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<?php do_action( 'zdw_intro_experiment_after_settings' ); ?>
	</div>
	<?php
}
