<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressIntroContentTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;
use ZDW\ReleaseManager\Domain\MediaAsset;

$posts = new WordPressPostStore();
$media = new WordPressMediaStore();
$transformer = new WordPressIntroContentTransformer();
// These fixture IDs and the migrated content come from the dump configured by ZDW_SQL_DUMP.
$homepage = $posts->find(2);
$videos = $media->findByFilename('zdw-bg-trimmed-30-muted.mp4');
$poster = $media->find(35610);

if (null === $homepage || 1 !== count($videos) || null === $poster) {
    throw new RuntimeException('Homepage intro fixtures are not unique.');
}

$desired = $transformer->desiredPageContent($homepage->content(), $videos[0], $poster);
if (!$transformer->equivalent($homepage->content(), $desired)) {
    throw new RuntimeException('Homepage intro does not match the release manifest.');
}
if (!$transformer->equivalent($desired, $transformer->desiredPageContent($desired, $videos[0], $poster))) {
    throw new RuntimeException('Homepage intro transform is not idempotent.');
}

$literalVideo = new MediaAsset(99991, 'https://example.test/uploads/$1-video.mp4');
$literalPoster = new MediaAsset(99992, 'https://example.test/uploads/poster.jpg');
$literalResult = $transformer->desiredPageContent($homepage->content(), $literalVideo, $literalPoster);
if (false === strpos($literalResult, 'https://example.test/uploads/$1-video.mp4')) {
    throw new RuntimeException('Intro replacement interpreted replacement-string metacharacters.');
}

echo "Homepage intro integration test passed.\n";
