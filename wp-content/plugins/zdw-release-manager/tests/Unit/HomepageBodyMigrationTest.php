<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\HomepageBodyMigration;
use ZDW\ReleaseManager\Tests\Support\FakeHomepageBodyTransformer;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class HomepageBodyMigrationTest extends TestCase
{
    public function test_compacts_both_homepages_idempotently(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(2, 'zdw', 'legacy-czech-body'),
            new PostRecord(93, 'zdw-en', 'legacy-english-body'),
        ]);
        $migration = new HomepageBodyMigration(
            $posts,
            new FakeHomepageBodyTransformer(),
            [2 => 'zdw', 93 => 'zdw-en']
        );

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $migration->apply();

        self::assertSame([2, 93], $posts->writes);
        self::assertSame('compact:legacy-czech-body', $posts->find(2)?->content());
        self::assertSame('compact:legacy-english-body', $posts->find(93)?->content());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_wrong_homepage_is_a_blocker(): void
    {
        $migration = new HomepageBodyMigration(
            new InMemoryPostStore([new PostRecord(2, 'wrong', 'legacy-body')]),
            new FakeHomepageBodyTransformer(),
            [2 => 'zdw']
        );

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        self::assertSame('homepage.body_missing', $migration->preflight()[0]->code());
    }

    public function test_missing_english_homepage_is_a_blocker(): void
    {
        $migration = new HomepageBodyMigration(
            new InMemoryPostStore([new PostRecord(2, 'zdw', 'legacy-czech-body')]),
            new FakeHomepageBodyTransformer()
        );

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        self::assertSame('homepage.body_missing', $migration->preflight()[0]->code());
    }
}
