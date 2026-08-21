<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Contracts\HeroBackgroundTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Migrations\BestInDesignHeroMarkupMigration;
use ZDW\ReleaseManager\Migrations\BestInDesignHeroMigration;
use ZDW\ReleaseManager\Tests\Support\FakeMediaStore;
use ZDW\ReleaseManager\Tests\Support\InMemoryPostStore;

final class BestInDesignHeroMigrationTest extends TestCase
{
    public function test_wordpress_collision_filename_is_an_allowed_fallback(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(193, 'best-in-design', 'hero')]);
        $media = new FakeMediaStore([
            new MediaAsset(44256, 'https://example.test/uploads/liza-marchkova-lizamarchkova-13-1-scaled-1.jpg'),
        ]);
        $transformer = new class implements HeroBackgroundTransformer {
            public function desiredPageContent(string $content, MediaAsset $background): string
            {
                $suffix = '|hero:' . $background->id();

                return str_ends_with($content, $suffix) ? $content : $content . $suffix;
            }

            public function equivalent(string $first, string $second): bool
            {
                return $first === $second;
            }
        };
        $migration = new BestInDesignHeroMigration($posts, $media, $transformer);
        $markupMigration = new BestInDesignHeroMarkupMigration($migration);

        self::assertSame('warning', $migration->preflight()[0]->severity());
        self::assertSame('bid.hero_markup.changes', $markupMigration->preflight()[0]->code());
        $migration->apply();

        self::assertSame([193], $posts->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
        self::assertSame('bid.hero_markup.saved', $markupMigration->verify()[0]->code());
    }

    public function test_both_expected_filenames_are_ambiguous_and_blocked(): void
    {
        $migration = new BestInDesignHeroMigration(
            new InMemoryPostStore([new PostRecord(193, 'best-in-design', 'hero')]),
            new FakeMediaStore([
                new MediaAsset(1, 'https://example.test/uploads/liza-marchkova-lizamarchkova-13-1-scaled.jpg'),
                new MediaAsset(2, 'https://example.test/uploads/liza-marchkova-lizamarchkova-13-1-scaled-1.jpg'),
            ]),
            new class implements HeroBackgroundTransformer {
                public function desiredPageContent(string $content, MediaAsset $background): string
                {
                    return $content;
                }

                public function equivalent(string $first, string $second): bool
                {
                    return $first === $second;
                }
            }
        );

        $check = $migration->preflight()[0];

        self::assertSame('blocker', $check->severity());
        self::assertStringContainsString('právě jedna fotografie', $check->message());
    }
}
