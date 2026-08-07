<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\OptionStateStore;

$optionName = 'zdw_release_manager_integration_test_state';
$migrationId = '20260807_001_audit';
$appliedOption = $optionName . '_applied_' . md5($migrationId);
$claimOption = $optionName . '_claim_' . md5($migrationId);
delete_option($optionName);
delete_option($appliedOption);
delete_option($claimOption);

$store = new OptionStateStore($optionName);

if ($store->isApplied($migrationId)) {
    throw new RuntimeException('Fresh state must not report an applied migration.');
}

if (!$store->claim($migrationId) || $store->claim($migrationId)) {
    throw new RuntimeException('Only one request may claim a migration.');
}
$store->release($migrationId);
if (!$store->claim($migrationId)) {
    throw new RuntimeException('A released migration must be claimable again.');
}
$store->markApplied($migrationId);
$store->markApplied($migrationId);

if (!$store->isApplied($migrationId) || $store->claim($migrationId)) {
    throw new RuntimeException('Stored migration was not reported as applied.');
}

$state = get_option($appliedOption, []);
if (!is_array($state) || ($state['migration'] ?? null) !== $migrationId) {
    throw new RuntimeException('State store must remain idempotent.');
}

delete_option($optionName);
delete_option($appliedOption);
delete_option($claimOption);
echo "OptionStateStore integration test passed.\n";
