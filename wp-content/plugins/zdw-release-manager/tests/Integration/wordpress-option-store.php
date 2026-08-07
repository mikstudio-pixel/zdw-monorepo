<?php

declare(strict_types=1);

require '/var/www/html/wp-load.php';
require_once '/var/www/html/wp-content/plugins/zdw-release-manager/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressOptionStore;

$option = 'zdw_release_manager_integration_option';
delete_option($option);

try {
    $store = new WordPressOptionStore();
    $store->set($option, 'expected');

    if ('expected' !== $store->get($option)) {
        throw new RuntimeException('WordPressOptionStore roundtrip failed.');
    }

    // Writing the same value must remain a successful idempotent operation.
    $store->set($option, 'expected');
} finally {
    delete_option($option);
}

echo "WordPressOptionStore integration test passed.\n";
