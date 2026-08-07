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
    public function test_compacts_czech_homepage_idempotently(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(2, 'zdw', 'legacy-body')]);
        $migration = new HomepageBodyMigration($posts, new FakeHomepageBodyTransformer());

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $migration->apply();

        self::assertSame([2], $posts->writes);
        self::assertSame('compact:legacy-body', $posts->find(2)?->content());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_wrong_homepage_is_a_blocker(): void
    {
        $migration = new HomepageBodyMigration(
            new InMemoryPostStore([new PostRecord(2, 'wrong', 'legacy-body')]),
            new FakeHomepageBodyTransformer()
        );

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        self::assertSame('homepage.body_missing', $migration->preflight()[0]->code());
    }
}
