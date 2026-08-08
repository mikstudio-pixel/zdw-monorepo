<?php
/**
 * Plugin Name: ZDW Release Manager
 * Description: Versioned, auditable and idempotent content migrations for Zlin Design Week.
 * Version: 0.5.3
 * Requires PHP: 8.2
 * Author: Zlin Design Week
 */

defined('ABSPATH') || exit;

if (PHP_VERSION_ID < 80200) {
    add_action('admin_notices', static function (): void {
        echo '<div class="notice notice-error"><p>ZDW Release Manager vyžaduje PHP 8.2 nebo novější.</p></div>';
    });

    return;
}

spl_autoload_register(static function (string $class): void {
    $prefix = 'ZDW\\ReleaseManager\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $relativeClass = substr($class, strlen($prefix));
    if (1 !== preg_match('/^[A-Za-z_][A-Za-z0-9_\\\\]*$/', $relativeClass)) {
        return;
    }
    $path = __DIR__ . '/src/' . str_replace('\\', '/', $relativeClass) . '.php';
    if (is_readable($path)) {
        require $path;
    }
});

$zdwReleaseManagerBoot = static function (): void {
    ZDW\ReleaseManager\Plugin::boot();
};

if (did_action('plugins_loaded')) {
    $zdwReleaseManagerBoot();
} else {
    add_action('plugins_loaded', $zdwReleaseManagerBoot);
}
