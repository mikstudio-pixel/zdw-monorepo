<?php
/**
 * Plugin Name: ZDW Local Safety
 * Description: Prevents the experimental local copy from sending email or running updates.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_filter('pre_wp_mail', static function ($return, $attributes) {
    return true;
}, 10, 2);

add_filter('automatic_updater_disabled', '__return_true');
add_filter('auto_update_core', '__return_false');
add_filter('auto_update_plugin', '__return_false');
add_filter('auto_update_theme', '__return_false');

add_action('admin_notices', static function () {
    echo '<div class="notice notice-warning"><p><strong>ZDW lokální kopie:</strong> odesílání e-mailů, cron a automatické aktualizace jsou vypnuté.</p></div>';
});
