<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressDesignCanteenCleanupTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressHeroBackgroundTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;
use ZDW\ReleaseManager\Migrations\BestInDesignHeroMigration;
use ZDW\ReleaseManager\Migrations\DesignCanteenCleanupMigration;

$admins = get_users(['role' => 'administrator', 'number' => 1]);
if ([] === $admins) {
    throw new RuntimeException('Administrator fixture is unavailable.');
}
wp_set_current_user((int) $admins[0]->ID);

$hero = get_post(193);
$canteen = get_post(12142);
if (!$hero instanceof WP_Post || !$canteen instanceof WP_Post) {
    throw new RuntimeException('Final content migration fixtures are unavailable.');
}

$relativeFile = '2026/08/liza-marchkova-lizamarchkova-13-1-scaled.jpg';
$uploads = wp_get_upload_dir();
$absoluteFile = trailingslashit($uploads['basedir']) . $relativeFile;
if (!is_file($absoluteFile)) {
    throw new RuntimeException('Best in Design image fixture is unavailable.');
}
$attachmentId = wp_insert_attachment([
    'post_title' => 'Best in Design hero fixture',
    'post_status' => 'inherit',
    'post_mime_type' => 'image/jpeg',
    'guid' => trailingslashit($uploads['baseurl']) . $relativeFile,
], $absoluteFile);
if (is_wp_error($attachmentId)) {
    throw new RuntimeException($attachmentId->get_error_message());
}
update_post_meta((int) $attachmentId, '_wp_attached_file', $relativeFile);

try {
    $posts = new WordPressPostStore();
    $heroMigration = new BestInDesignHeroMigration(
        $posts,
        new WordPressMediaStore(),
        new WordPressHeroBackgroundTransformer()
    );
    if ('warning' !== $heroMigration->preflight()[0]->severity()) {
        throw new RuntimeException('Best in Design hero migration did not plan the fixture change.');
    }
    $heroMigration->apply();
    if ('pass' !== $heroMigration->verify()[0]->severity()) {
        throw new RuntimeException('Best in Design hero migration verification failed.');
    }
    $heroAttrs = parse_blocks((string) get_post(193)?->post_content)[0]['attrs'] ?? [];
    if ((int) $attachmentId !== ($heroAttrs['backgroundId'] ?? null) || false !== ($heroAttrs['applyEffect'] ?? null)) {
        throw new RuntimeException('Best in Design hero attributes do not match the local source.');
    }

    $canteenMigration = new DesignCanteenCleanupMigration(
        $posts,
        new WordPressDesignCanteenCleanupTransformer()
    );
    if ('warning' !== $canteenMigration->preflight()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen cleanup did not plan the fixture change.');
    }
    $canteenMigration->apply();
    if ('pass' !== $canteenMigration->verify()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen cleanup verification failed.');
    }
    $canteenContent = (string) get_post(12142)?->post_content;
    foreach (['Kudy tudy do kantýny?', 'Co ti letos naservírujeme na zlínském zámku?'] as $removed) {
        if (str_contains($canteenContent, $removed)) {
            throw new RuntimeException(sprintf('Obsolete Czech Design Canteen block remains: %s', $removed));
        }
    }
    if (!str_contains($canteenContent, 'CO KANTÝNA SERVÍROVALA MINULÝ ROK?')) {
        throw new RuntimeException('Czech Design Canteen cleanup removed the retained history section.');
    }
} finally {
    wp_update_post(['ID' => 193, 'post_content' => wp_slash($hero->post_content)]);
    wp_update_post(['ID' => 12142, 'post_content' => wp_slash($canteen->post_content)]);
    delete_post_meta((int) $attachmentId, '_wp_attached_file');
    wp_delete_attachment((int) $attachmentId, true);
}

echo "Final content migrations integration test passed.\n";
