<?php

declare(strict_types=1);

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressDesignCanteenContentTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressDesignCanteenCleanupTransformer;

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

$legacyRevision = get_post(43893);
if (!$legacyRevision instanceof WP_Post) {
    throw new RuntimeException('Legacy Design Canteen revision 43893 is unavailable.');
}
$legacyBlocks = parse_blocks((string) $legacyRevision->post_content);
$nestedProgrammeFixtureCreated = false;
foreach ($legacyBlocks as &$block) {
    if ('core/group' !== ($block['blockName'] ?? null)
        || !str_contains(serialize_block($block), 'What will we serve you at ZlIn Castle this year?')) {
        continue;
    }
    foreach ($block['innerBlocks'] ?? [] as $programmeIndex => $programmeBlock) {
        if ('core/columns' !== ($programmeBlock['blockName'] ?? null)
            || !str_contains(serialize_block($programmeBlock), 'THURSDAY, 7 MAY')) {
            continue;
        }
        $block['innerBlocks'][$programmeIndex]['innerBlocks'][0]['innerBlocks'][] = $paragraph;
        array_splice(
            $block['innerBlocks'][$programmeIndex]['innerBlocks'][0]['innerContent'],
            -1,
            0,
            ["\n", null]
        );
        $nestedProgrammeFixtureCreated = true;
        break 2;
    }
}
unset($block);
if (!$nestedProgrammeFixtureCreated) {
    throw new RuntimeException('Nested obsolete-programme fixture could not be created.');
}
$nestedProgrammeRejected = false;
try {
    $transformer->desiredPageContent(serialize_blocks($legacyBlocks));
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'další redakční blok')) {
        throw $error;
    }
    $nestedProgrammeRejected = true;
}
if (!$nestedProgrammeRejected) {
    throw new RuntimeException('Design Canteen transform accepted nested editorial content in the obsolete programme.');
}

$nestedMarkupBlocks = parse_blocks((string) $legacyRevision->post_content);
$nestedMarkupFixtureCreated = false;
foreach ($nestedMarkupBlocks as &$block) {
    if ('core/group' !== ($block['blockName'] ?? null)
        || !str_contains(serialize_block($block), 'What will we serve you at ZlIn Castle this year?')) {
        continue;
    }
    foreach ($block['innerBlocks'] ?? [] as $programmeIndex => $programmeBlock) {
        if ('core/columns' !== ($programmeBlock['blockName'] ?? null)
            || !str_contains(serialize_block($programmeBlock), 'THURSDAY, 7 MAY')) {
            continue;
        }
        $block['innerBlocks'][$programmeIndex]['innerBlocks'][0]['innerContent'][0] .= '<img src="editorial-marker.jpg" alt="">';
        $nestedMarkupFixtureCreated = true;
        break 2;
    }
}
unset($block);
if (!$nestedMarkupFixtureCreated) {
    throw new RuntimeException('Nested tag-only obsolete-programme fixture could not be created.');
}
$nestedMarkupRejected = false;
try {
    $transformer->desiredPageContent(serialize_blocks($nestedMarkupBlocks));
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'další redakční blok')) {
        throw $error;
    }
    $nestedMarkupRejected = true;
}
if (!$nestedMarkupRejected) {
    throw new RuntimeException('Design Canteen transform accepted nested tag-only content in the obsolete programme.');
}

$czechLegacyRevision = get_post(43892);
if (!$czechLegacyRevision instanceof WP_Post) {
    throw new RuntimeException('Legacy Czech Design Canteen revision 43892 is unavailable.');
}
$cleanupTransformer = new WordPressDesignCanteenCleanupTransformer();
if ($cleanupTransformer->desiredPageContent((string) $czechLegacyRevision->post_content)
    === $czechLegacyRevision->post_content) {
    throw new RuntimeException('Legacy Czech Design Canteen fixture does not exercise the cleanup.');
}
$czechMarkupBlocks = parse_blocks((string) $czechLegacyRevision->post_content);
$czechMarkupFixtureCreated = false;
foreach ($czechMarkupBlocks as &$block) {
    if ('core/group' !== ($block['blockName'] ?? null)
        || false === stripos(serialize_block($block), 'Co ti letos naservírujeme na zlínském zámku?')) {
        continue;
    }
    foreach ($block['innerBlocks'] ?? [] as $childIndex => $child) {
        if ('core/columns' !== ($child['blockName'] ?? null)
            || [] === ($child['innerBlocks'] ?? [])) {
            continue;
        }
        $block['innerBlocks'][$childIndex]['innerBlocks'][0]['innerContent'][0] .= '<img src="editorial-marker.jpg" alt="">';
        $czechMarkupFixtureCreated = true;
        break 2;
    }
}
unset($block);
if (!$czechMarkupFixtureCreated) {
    throw new RuntimeException('Nested tag-only Czech Canteen fixture could not be created.');
}
$czechMarkupRejected = false;
try {
    $cleanupTransformer->desiredPageContent(serialize_blocks($czechMarkupBlocks));
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'jiný obsah')) {
        throw $error;
    }
    $czechMarkupRejected = true;
}
if (!$czechMarkupRejected) {
    throw new RuntimeException('Czech Design Canteen cleanup accepted nested tag-only content.');
}

echo "WordPressDesignCanteenContentTransformer integration test passed.\n";
