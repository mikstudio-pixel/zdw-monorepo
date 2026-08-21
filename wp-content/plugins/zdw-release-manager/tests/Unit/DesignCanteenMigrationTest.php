<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Contracts\DesignCanteenCleanupTransformer;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\DesignCanteenCleanupMigration;
use ZDW\ReleaseManager\Migrations\DesignCanteenMigration;
use ZDW\ReleaseManager\Migrations\DesignCanteenProgramCleanupMigration;
use ZDW\ReleaseManager\Tests\Support\FakeDesignCanteenContentTransformer;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class DesignCanteenMigrationTest extends TestCase
{
    public function test_removes_obsolete_english_program_idempotently(): void
    {
        $posts = new InMemoryPostStore([
            new PostRecord(12192, 'design-kantyna-en', 'legacy-program'),
        ]);
        $migration = new DesignCanteenMigration(
            $posts,
            new FakeDesignCanteenContentTransformer()
        );

        self::assertSame('warning', $migration->preflight()[0]->severity());
        $migration->apply();
        $migration->apply();

        self::assertSame([12192], $posts->writes);
        self::assertSame('current:legacy-program', $posts->find(12192)?->content());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_wrong_english_page_is_a_blocker(): void
    {
        $migration = new DesignCanteenMigration(
            new InMemoryPostStore([new PostRecord(12192, 'wrong', 'legacy-program')]),
            new FakeDesignCanteenContentTransformer()
        );

        self::assertSame('blocker', $migration->preflight()[0]->severity());
        self::assertSame('canteen.english_missing', $migration->preflight()[0]->code());
    }

    public function test_program_cleanup_wrapper_has_distinct_check_codes(): void
    {
        $migration = new DesignCanteenCleanupMigration(
            new InMemoryPostStore([new PostRecord(12142, 'design-kantyna', 'legacy-program')]),
            new class implements DesignCanteenCleanupTransformer {
                public function desiredPageContent(string $content): string
                {
                    return str_starts_with($content, 'clean:') ? $content : 'clean:' . $content;
                }

                public function equivalent(string $first, string $second): bool
                {
                    return $first === $second;
                }
            }
        );
        $wrapper = new DesignCanteenProgramCleanupMigration($migration);

        self::assertSame('canteen.program_cleanup.changes', $wrapper->preflight()[0]->code());
        $wrapper->apply();
        self::assertSame('canteen.program_cleanup.saved', $wrapper->verify()[0]->code());
    }
}
