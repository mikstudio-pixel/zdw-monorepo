<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressOptionStore;
use ZDW\ReleaseManager\Migrations\DesiredOptionsMigration;

$option = 'zdw_release_manager_integration_option';
$integerOption = 'zdw_release_manager_integration_integer_option';
$defaultOption = 'zdw_release_manager_integration_default_option';
$filteredAddOption = 'zdw_release_manager_integration_filtered_add';
$concurrentAddOption = 'zdw_release_manager_integration_concurrent_add';
delete_option($option);
delete_option($integerOption);
delete_option($defaultOption);
delete_option($filteredAddOption);
delete_option($concurrentAddOption);

try {
    $store = new WordPressOptionStore();
    $store->set($option, 'expected');

    if ('expected' !== $store->get($option)) {
        throw new RuntimeException('WordPressOptionStore roundtrip failed.');
    }

    // Writing the same value must remain a successful idempotent operation.
    $store->set($option, 'expected');

    if (!$store->setIfCurrent($option, true, 'expected', 'expected')) {
        throw new RuntimeException('An unchanged matching conditional option write was rejected.');
    }

    if ($store->setIfCurrent($option, true, 'stale', 'conditional')) {
        throw new RuntimeException('A stale conditional option write unexpectedly succeeded.');
    }
    if ('expected' !== $store->get($option)
        || !$store->setIfCurrent($option, true, 'expected', 'conditional')
        || 'conditional' !== $store->get($option)) {
        throw new RuntimeException('Atomic option compare-and-swap failed.');
    }
    if ($store->deleteIfCurrent($option, 'stale')
        || !$store->deleteIfCurrent($option, 'conditional')
        || $store->has($option)) {
        throw new RuntimeException('Atomic option deletion failed.');
    }
    $store->set($option, 'expected');

    $conditionalFilterCalls = 0;
    $conditionalRewrite = static function (mixed $value) use (&$conditionalFilterCalls): string {
        ++$conditionalFilterCalls;

        return 'filtered-conditional';
    };
    add_filter('pre_update_option_' . $option, $conditionalRewrite);
    try {
        if (!$store->setIfCurrent($option, true, 'expected', 'atomic-value')
            || 'atomic-value' !== $store->get($option)
            || 0 !== $conditionalFilterCalls) {
            throw new RuntimeException('The documented atomic conditional write contract changed.');
        }
    } finally {
        remove_filter('pre_update_option_' . $option, $conditionalRewrite);
    }
    $store->set($option, 'expected');

    register_setting('general', $integerOption, [
        'type' => 'integer',
        'sanitize_callback' => static fn (mixed $value): int => (int) $value,
    ]);
    register_setting('general', $defaultOption, [
        'type' => 'string',
        'default' => 'registered-default',
    ]);
    if ($store->has($defaultOption)) {
        throw new RuntimeException('A registered default was mistaken for a persisted option row.');
    }

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

    add_filter('sanitize_option_' . $filteredAddOption, $rewrite);
    try {
        if ($store->setIfCurrent($filteredAddOption, false, null, 'requested')
            || $store->has($filteredAddOption)) {
            throw new RuntimeException('A transformed conditional option add was accepted or left persisted.');
        }
    } finally {
        remove_filter('sanitize_option_' . $filteredAddOption, $rewrite);
    }
    $changeAfterAdd = static function (string $name) use ($concurrentAddOption): void {
        if ($concurrentAddOption === $name) {
            update_option($name, 'newer-write');
        }
    };
    add_action('add_option_' . $concurrentAddOption, $changeAfterAdd, 10, 1);
    try {
        if ($store->setIfCurrent($concurrentAddOption, false, null, 'requested')
            || 'newer-write' !== $store->get($concurrentAddOption)) {
            throw new RuntimeException('A newer post-add option write was deleted or accepted as the migration value.');
        }
    } finally {
        remove_action('add_option_' . $concurrentAddOption, $changeAfterAdd, 10);
    }
} finally {
    delete_option($option);
    delete_option($integerOption);
    delete_option($defaultOption);
    delete_option($filteredAddOption);
    delete_option($concurrentAddOption);
}

echo "WordPressOptionStore integration test passed.\n";
