<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\HomepageIntroMigration;
use ZDW\ReleaseManager\Tests\Support\FakeIntroContentTransformer;
use ZDW\ReleaseManager\Tests\Support\FakeMediaStore;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class HomepageIntroMigrationTest extends TestCase
{
    public function test_missing_video_blocks_the_migration_with_upload_guidance(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]);
        $media = new FakeMediaStore([], new MediaAsset(35610, 'poster.jpg'));
        $migration = new HomepageIntroMigration($posts, $media, new FakeIntroContentTransformer());

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertStringContainsString('Média', $checks[0]->message());
    }

    public function test_apply_updates_only_the_homepage_intro_and_is_idempotent(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]);
        $media = new FakeMediaStore(
            [new MediaAsset(99, 'video.mp4')],
            new MediaAsset(35610, 'poster.jpg')
        );
        $migration = new HomepageIntroMigration($posts, $media, new FakeIntroContentTransformer());

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $migration->apply();

        self::assertSame([2], $posts->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
    }
}
