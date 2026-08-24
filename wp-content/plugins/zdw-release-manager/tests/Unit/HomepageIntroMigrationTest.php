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
        $media = new FakeMediaStore([], new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg'));
        $migration = new HomepageIntroMigration($posts, $media, new FakeIntroContentTransformer());

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertSame('intro.video_missing', $checks[0]->code());
        self::assertStringContainsString('Média', $checks[0]->message());
    }

    public function test_apply_updates_only_the_homepage_intro_and_is_idempotent(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]);
        $media = new FakeMediaStore(
            [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
            new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
        );
        $migration = new HomepageIntroMigration($posts, $media, new FakeIntroContentTransformer());

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $migration->apply();

        self::assertSame([2], $posts->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_apply_updates_both_language_homepages(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $media = new FakeMediaStore(
            [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
            new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
        );
        $migration = new HomepageIntroMigration(
            $posts,
            $media,
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        $migration->apply();

        self::assertSame([2, 93], $posts->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_configured_release_uses_the_new_video_and_poster_by_filename(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $migration = new HomepageIntroMigration(
            posts: $posts,
            media: new FakeMediaStore(
                [new MediaAsset(101, 'https://example.test/uploads/zdw-bg-cut02.mp4')],
                new MediaAsset(102, 'https://example.test/uploads/zdw-bg-cut02-poster.jpg')
            ),
            transformer: new FakeIntroContentTransformer(),
            homepages: [2 => 'zdw', 93 => 'zdw-en'],
            migrationId: '20260824_013_homepage_video_cut02',
            videoFilename: 'ZDW-bg-cut02.mp4',
            posterFilename: 'ZDW-bg-cut02-poster.jpg',
            posterId: null,
            migrationLabel: 'Nový střih videa obou homepage',
            migrationDependencies: ['20260808_006_homepage_intros']
        );

        self::assertSame('20260824_013_homepage_video_cut02', $migration->id());
        self::assertSame('Nový střih videa obou homepage', $migration->label());
        self::assertSame(['20260808_006_homepage_intros'], $migration->dependencies());
        self::assertSame('warning', $migration->preflight()[0]->severity());

        $migration->apply();

        self::assertSame([2, 93], $posts->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_apply_prepares_every_homepage_before_writing_any_intro(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $transformer = new FakeIntroContentTransformer();
        $transformer->throwOnContent = 'homepage-en';
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            $transformer,
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('English transform failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame([], $posts->writes);
            self::assertSame('homepage-cs', $posts->find(2)?->content());
        }
    }

    public function test_apply_rolls_back_an_earlier_intro_when_a_later_write_fails(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwOnUpdateId = 93;
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('English write failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('homepage-en', $posts->find(93)?->content());
            self::assertSame([2, 2], $posts->writes);
        }
    }

    public function test_false_conditional_write_is_not_misreported_as_a_rollback_failure(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->replaceContentBeforeConditionalUpdate = [93 => 'editor-change'];
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A concurrent write should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 93 mezitím změnil', $error->getMessage());
            self::assertStringNotContainsString('Obnovení homepage', $error->getMessage());
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('editor-change', $posts->find(93)?->content());
            self::assertSame([2, 2], $posts->writes);
        }
    }

    public function test_apply_rolls_back_the_failing_intro_when_a_hook_throws_after_persistence(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwAfterUpdateId = 93;
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A post-save hook failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 93', $error->getMessage());
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('homepage-en', $posts->find(93)?->content());
            self::assertSame([2, 93, 93, 2], $posts->writes);
        }
    }

    public function test_apply_continues_rolling_back_after_one_restore_fails(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwAfterUpdateId = 93;
        $posts->throwOnUpdateAttempts = [93 => [2]];
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A rollback failure should be reported after remaining restores are attempted.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 93', $error->getMessage());
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('homepage-en|intro:99:35610', $posts->find(93)?->content());
            self::assertSame([2, 93, 2], $posts->writes);
        }
    }

    public function test_apply_continues_rollback_when_a_rollback_read_fails(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwAfterUpdateId = 93;
        $posts->throwOnFindAttempts = [93 => [2]];
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A post-save hook failure should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('homepage-en|intro:99:35610', $posts->find(93)?->content());
            self::assertSame([2, 93, 2], $posts->writes);
        }
    }

    public function test_apply_preserves_a_concurrent_edit_during_rollback(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwAfterUpdateId = 93;
        $posts->replaceContentOnFindAttempts = [93 => [2 => 'editor-change']];
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A concurrent rollback edit should be reported.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 93', $error->getMessage());
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('editor-change', $posts->find(93)?->content());
            self::assertSame([2, 93, 2], $posts->writes);
        }
    }

    public function test_apply_preserves_an_edit_between_rollback_read_and_conditional_write(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'homepage-cs'),
            new PostRecord(93, 'zdw-en', 'homepage-en'),
        ]);
        $posts->throwAfterUpdateId = 93;
        $posts->replaceContentBeforeConditionalUpdateAttempts = [93 => [2 => 'editor-after-read']];
        $migration = new HomepageIntroMigration(
            $posts,
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            new FakeIntroContentTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        try {
            $migration->apply();
            self::fail('A concurrent rollback edit should be reported.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('ID 93', $error->getMessage());
            self::assertSame('homepage-cs', $posts->find(2)?->content());
            self::assertSame('editor-after-read', $posts->find(93)?->content());
            self::assertSame([2, 93, 2], $posts->writes);
        }
    }

    public function test_reused_poster_id_with_wrong_file_blocks_the_migration(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]);
        $media = new FakeMediaStore(
            [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
            new MediaAsset(35610, 'unrelated.jpg')
        );
        $migration = new HomepageIntroMigration($posts, $media, new FakeIntroContentTransformer());

        $checks = $migration->preflight();

        self::assertSame('blocker', $checks[0]->severity());
        self::assertStringContainsString('neodpovídá', $checks[0]->message());
    }

    public function test_duplicate_video_missing_poster_and_wrong_homepage_are_blockers(): void
    {
        $video = new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4');

        $duplicate = new HomepageIntroMigration(
            new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]),
            new FakeMediaStore([$video, new MediaAsset(100, $video->url())], new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')),
            new FakeIntroContentTransformer()
        );
        self::assertSame('intro.video_duplicate', $duplicate->preflight()[0]->code());

        $missingPoster = new HomepageIntroMigration(
            new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]),
            new FakeMediaStore([$video]),
            new FakeIntroContentTransformer()
        );
        self::assertSame('intro.poster_missing', $missingPoster->preflight()[0]->code());

        $wrongHomepage = new HomepageIntroMigration(
            new InMemoryPostStore([new PostRecord(2, 'wrong', 'homepage')]),
            new FakeMediaStore([$video], new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')),
            new FakeIntroContentTransformer()
        );
        self::assertSame('intro.homepage_2', $wrongHomepage->preflight()[0]->code());
    }

    public function test_verify_reports_a_content_mismatch(): void
    {
        $transformer = new FakeIntroContentTransformer();
        $migration = new HomepageIntroMigration(
            new InMemoryPostStore([new PostRecord(2, 'zdw', 'homepage')]),
            new FakeMediaStore(
                [new MediaAsset(99, 'zdw-bg-trimmed-30-muted.mp4')],
                new MediaAsset(35610, '16-zdw-tag-jiri-edit-1-2.jpg')
            ),
            $transformer
        );
        $transformer->alwaysMismatch = true;

        self::assertSame('intro.mismatch', $migration->verify()[0]->code());
    }
}
