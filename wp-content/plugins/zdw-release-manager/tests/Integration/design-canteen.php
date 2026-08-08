<?php

declare(strict_types=1);

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressDesignCanteenContentTransformer;

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

$post = get_post(12192);
if (!$post instanceof WP_Post || 'design-kantyna-en' !== $post->post_name) {
    throw new RuntimeException('English Design Canteen fixture is unavailable.');
}

$transformer = new WordPressDesignCanteenContentTransformer();
$desired = $transformer->desiredPageContent((string) $post->post_content);
$secondPass = $transformer->desiredPageContent($desired);
if (!$transformer->equivalent($desired, $secondPass)) {
    throw new RuntimeException('Design Canteen transform is not idempotent.');
}
if (str_contains($desired, 'What will we serve you at ZlIn Castle this year?')) {
    throw new RuntimeException('Obsolete 2026 Design Canteen programme remains in the English page.');
}
foreach (['IT ALL STARTED ON FACEBOOK', 'DESIGN OF ALL TASTES PODCAST', 'A Look Back at the Design Canteen Last Year'] as $expected) {
    if (!str_contains($desired, $expected)) {
        throw new RuntimeException(sprintf('Expected translated section is missing: %s', $expected));
    }
}

echo "WordPressDesignCanteenContentTransformer integration test passed.\n";
