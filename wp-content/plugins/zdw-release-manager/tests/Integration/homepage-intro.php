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
// Page IDs come from ZDW_SQL_DUMP; the current video and poster are loaded into the local Media Library.
$homepages = array_filter([$posts->find(2), $posts->find(93)]);
$videos = $media->findByFilename('ZDW-bg-cut02.mp4');
$posters = $media->findByFilename('ZDW-bg-cut02-poster.jpg');
$poster = 1 === count($posters) ? $posters[0] : null;

if (2 !== count($homepages) || 1 !== count($videos) || 1 !== count($posters) || null === $poster) {
    throw new RuntimeException('Homepage intro fixtures are not unique.');
}

foreach ($homepages as $homepage) {
    $desired = $transformer->desiredPageContent($homepage->content(), $videos[0], $poster);
    if (!$transformer->equivalent($homepage->content(), $desired)) {
        throw new RuntimeException(sprintf('Homepage intro ID %d does not match the release manifest.', $homepage->id()));
    }
    if (!$transformer->equivalent($desired, $transformer->desiredPageContent($desired, $videos[0], $poster))) {
        throw new RuntimeException(sprintf('Homepage intro transform ID %d is not idempotent.', $homepage->id()));
    }
}

$literalVideo = new MediaAsset(99991, 'https://example.test/uploads/$1-video.mp4');
$literalPoster = new MediaAsset(99992, 'https://example.test/uploads/poster.jpg');
$literalResult = $transformer->desiredPageContent($homepages[0]->content(), $literalVideo, $literalPoster);
if (false === strpos($literalResult, 'https://example.test/uploads/$1-video.mp4')) {
    throw new RuntimeException('Intro replacement interpreted replacement-string metacharacters.');
}

$duplicateRejected = false;
try {
    $transformer->desiredPageContent(
        $homepages[0]->content() . $homepages[0]->content(),
        $videos[0],
        $poster
    );
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'právě jeden úvodní blok')) {
        throw $error;
    }
    $duplicateRejected = true;
}
if (!$duplicateRejected) {
    throw new RuntimeException('Intro replacement accepted duplicate intro blocks.');
}

echo "Homepage intro integration test passed.\n";
