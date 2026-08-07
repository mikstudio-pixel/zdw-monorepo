<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\OptionStateStore;

$optionName = 'zdw_release_manager_integration_test_state';
delete_option($optionName);

$store = new OptionStateStore($optionName);

if ($store->isApplied('20260807_001_audit')) {
    throw new RuntimeException('Fresh state must not report an applied migration.');
}

$store->markApplied('20260807_001_audit');
$store->markApplied('20260807_001_audit');

if (!$store->isApplied('20260807_001_audit')) {
    throw new RuntimeException('Stored migration was not reported as applied.');
}

$state = get_option($optionName, []);
if (!is_array($state) || array_keys($state) !== ['20260807_001_audit']) {
    throw new RuntimeException('State store must remain idempotent.');
}

delete_option($optionName);
echo "OptionStateStore integration test passed.\n";
