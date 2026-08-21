<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressOptionStore;
use ZDW\ReleaseManager\Migrations\DesiredOptionsMigration;

$option = 'zdw_release_manager_integration_option';
$integerOption = 'zdw_release_manager_integration_integer_option';
delete_option($option);
delete_option($integerOption);

try {
    $store = new WordPressOptionStore();
    $store->set($option, 'expected');

    if ('expected' !== $store->get($option)) {
        throw new RuntimeException('WordPressOptionStore roundtrip failed.');
    }

    // Writing the same value must remain a successful idempotent operation.
    $store->set($option, 'expected');

    register_setting('general', $integerOption, [
        'type' => 'integer',
        'sanitize_callback' => static fn (mixed $value): int => (int) $value,
    ]);

    $migration = new DesiredOptionsMigration(
        'integration_scalar_options',
        'Integration scalar options',
        $store,
        [$integerOption => '25']
    );
    $migration->apply();

    if ('pass' !== $migration->verify()[0]->severity()) {
        throw new RuntimeException('Sanitized integer option did not match the string manifest value.');
    }

    $rewrite = static fn (mixed $value): string => 'rewritten';
    add_filter('pre_update_option_' . $option, $rewrite);
    try {
        $rejected = false;
        try {
            $store->set($option, 'requested');
        } catch (RuntimeException) {
            $rejected = true;
        }
        if (!$rejected || 'rewritten' !== $store->get($option)) {
            throw new RuntimeException('WordPressOptionStore accepted a transformed option write.');
        }
    } finally {
        remove_filter('pre_update_option_' . $option, $rewrite);
    }
} finally {
    delete_option($option);
    delete_option($integerOption);
}

echo "WordPressOptionStore integration test passed.\n";
