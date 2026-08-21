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

$rawMarker = '<aside data-zdw-test="raw-content">Editorial raw marker</aside>';
$withRawContent = $rawMarker . (string) $post->post_content;
$rawResult = $transformer->desiredPageContent($withRawContent);
if (!str_contains($rawResult, $rawMarker)) {
    throw new RuntimeException('Design Canteen transform removed unrelated top-level raw content.');
}

$nestedBlocks = parse_blocks((string) $post->post_content);
$nestedFixtureCreated = false;
foreach ($nestedBlocks as &$block) {
    if ('core/group' !== ($block['blockName'] ?? null)
        || !str_contains(serialize_block($block), 'is-style-with-vertical-lines')
        || !str_contains(serialize_block($block), 'wp:esab/accordion')) {
        continue;
    }
    foreach (($block['innerContent'] ?? []) as $contentIndex => $fragment) {
        if ($contentIndex > 0 && is_string($fragment) && '' === trim($fragment)) {
            $block['innerContent'][$contentIndex] = '<aside>Nested editorial raw marker</aside>';
            $nestedFixtureCreated = true;
            break 2;
        }
    }
}
unset($block);
if (!$nestedFixtureCreated) {
    throw new RuntimeException('Design Canteen retained-section fixture could not be created.');
}
$nestedRawContent = serialize_blocks($nestedBlocks);
$nestedRawRejected = false;
try {
    $transformer->desiredPageContent($nestedRawContent);
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'raw obsah')) {
        throw $error;
    }
    $nestedRawRejected = true;
}
if (!$nestedRawRejected) {
    throw new RuntimeException('Design Canteen transform accepted raw content inside the retained section.');
}

$namedBlocks = parse_blocks($desired);
$namedFixtureCreated = false;
$paragraph = array_values(array_filter(
    parse_blocks('<!-- wp:paragraph --><p>New editorial note</p><!-- /wp:paragraph -->'),
    static fn (array $block): bool => null !== ($block['blockName'] ?? null)
))[0];
foreach ($namedBlocks as &$block) {
    if ('core/group' !== ($block['blockName'] ?? null)
        || !str_contains(serialize_block($block), 'is-style-with-vertical-lines')
        || !str_contains(serialize_block($block), 'wp:esab/accordion')) {
        continue;
    }
    $block['innerBlocks'][] = $paragraph;
    array_splice($block['innerContent'], -1, 0, ["\n\n", null]);
    $namedFixtureCreated = true;
    break;
}
unset($block);
if (!$namedFixtureCreated) {
    throw new RuntimeException('Design Canteen named-block fixture could not be created.');
}
$namedBlockRejected = false;
try {
    $transformer->desiredPageContent(serialize_blocks($namedBlocks));
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'další redakční blok')) {
        throw $error;
    }
    $namedBlockRejected = true;
}
if (!$namedBlockRejected) {
    throw new RuntimeException('Design Canteen transform accepted a new named editorial block.');
}

echo "WordPressDesignCanteenContentTransformer integration test passed.\n";
