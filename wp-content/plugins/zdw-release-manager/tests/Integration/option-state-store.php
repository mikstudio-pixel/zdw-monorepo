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

$firstToken = $store->claim($migrationId);
if (!is_string($firstToken) || null !== $store->claim($migrationId)) {
    throw new RuntimeException('Only one request may claim a migration.');
}
$store->release($migrationId, $firstToken);
$secondToken = $store->claim($migrationId);
if (!is_string($secondToken)) {
    throw new RuntimeException('A released migration must be claimable again.');
}
$store->markApplied($migrationId, $secondToken);

if (!$store->isApplied($migrationId) || null !== $store->claim($migrationId)) {
    throw new RuntimeException('Stored migration was not reported as applied.');
}
$state = get_option($appliedOption, []);
if (!is_array($state) || ($state['migration'] ?? null) !== $migrationId) {
    throw new RuntimeException('State store must remain idempotent.');
}

delete_option($appliedOption);
update_option($claimOption, [
    'migration' => $migrationId,
    'token' => 'expired-owner',
    'claimed_at' => time() - 901,
], false);
$replacementToken = $store->claim($migrationId);
if (!is_string($replacementToken) || 'expired-owner' === $replacementToken) {
    throw new RuntimeException('A stale claim was not replaced with a new ownership token.');
}
$store->release($migrationId, 'expired-owner');
if (null !== $store->claim($migrationId)) {
    throw new RuntimeException('An expired owner released the replacement claim.');
}
try {
    $store->markApplied($migrationId, 'expired-owner');
    throw new RuntimeException('An expired owner completed the replacement claim.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'vlastnictví')) {
        throw $error;
    }
}
$store->release($migrationId, $replacementToken);

delete_option($optionName);
delete_option($appliedOption);
delete_option($claimOption);
echo "OptionStateStore integration test passed.\n";
