<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressBlockContentGuard;

final class WordPressBlockContentGuardTest extends TestCase
{
    public function test_accepts_an_empty_core_container_wrapper(): void
    {
        self::assertFalse(WordPressBlockContentGuard::hasUnexpectedContainerContent([
            'blockName' => 'core/group',
            'innerBlocks' => [[
                'blockName' => 'core/spacer',
                'innerBlocks' => [],
                'innerHTML' => '<div class="wp-block-spacer"></div>',
                'innerContent' => ['<div class="wp-block-spacer"></div>'],
            ]],
            'innerContent' => ['<div class="wp-block-group">', null, '</div>'],
        ]));
    }

    public function test_rejects_tag_only_content_in_a_container_wrapper(): void
    {
        self::assertTrue(WordPressBlockContentGuard::hasUnexpectedContainerContent([
            'blockName' => 'core/group',
            'innerBlocks' => [[
                'blockName' => 'core/spacer',
                'innerBlocks' => [],
            ]],
            'innerContent' => [
                '<div class="wp-block-group"><img src="editorial-marker.jpg" alt="">',
                null,
                '</div>',
            ],
        ]));
    }

    public function test_rejects_tag_only_content_in_a_nested_container(): void
    {
        self::assertTrue(WordPressBlockContentGuard::hasUnexpectedContainerContent([
            'blockName' => 'core/columns',
            'innerBlocks' => [[
                'blockName' => 'core/column',
                'innerBlocks' => [[
                    'blockName' => 'core/heading',
                    'innerBlocks' => [],
                ]],
                'innerContent' => ['<div class="wp-block-column">', null, '<iframe></iframe></div>'],
            ]],
            'innerContent' => ['<div class="wp-block-columns">', null, '</div>'],
        ]));
    }

    public function test_rejects_tag_only_content_in_an_otherwise_empty_column(): void
    {
        self::assertTrue(WordPressBlockContentGuard::hasUnexpectedContainerContent([
            'blockName' => 'core/column',
            'innerBlocks' => [],
            'innerHTML' => '<div class="wp-block-column"><img src="editorial-marker.jpg" alt=""></div>',
            'innerContent' => ['<div class="wp-block-column"><img src="editorial-marker.jpg" alt=""></div>'],
        ]));
    }
}
