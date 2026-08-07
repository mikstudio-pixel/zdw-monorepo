<?php

declare(strict_types=1);

require '/var/www/html/wp-load.php';
require_once '/var/www/html/wp-content/plugins/zdw-release-manager/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressIntroContentTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;

$posts = new WordPressPostStore();
$media = new WordPressMediaStore();
$transformer = new WordPressIntroContentTransformer();
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

echo "Homepage intro integration test passed.\n";
