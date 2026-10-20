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

    public function test_custom_target_uses_its_versioned_id_and_filename(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(193, 'best-in-design', 'hero')]);
        $media = new FakeMediaStore([
            new MediaAsset(591, 'https://example.test/uploads/patrik-ziska-patrikziska-591.jpg'),
        ]);
        $migration = new BestInDesignHeroMigration(
            posts: $posts,
            media: $media,
            transformer: new class implements HeroBackgroundTransformer {
                public function desiredPageContent(string $content, MediaAsset $background): string
                {
                    $suffix = '|hero:' . $background->id();

                    return str_ends_with($content, $suffix) ? $content : $content . $suffix;
                }

                public function equivalent(string $first, string $second): bool
                {
                    return $first === $second;
                }
            },
            migrationId: '20260827_014_best_in_design_hero_patrik_ziska',
            filenames: [
                'patrik_ziska_@patrikziska_591.jpg',
                'patrik-ziska-patrikziska-591.jpg',
            ],
            migrationLabel: 'Fotografie Patrika Žišky v českém hero Best in Design',
            migrationDependencies: ['20260808_009_best_in_design_hero']
        );

        self::assertSame('20260827_014_best_in_design_hero_patrik_ziska', $migration->id());
        self::assertSame('Fotografie Patrika Žišky v českém hero Best in Design', $migration->label());
        self::assertSame(['20260808_009_best_in_design_hero'], $migration->dependencies());
        self::assertSame('warning', $migration->preflight()[0]->severity());

        $migration->apply();

        self::assertSame([193], $posts->writes);
        self::assertSame('hero|hero:591', $posts->find(193)?->content());
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_concurrent_hero_edit_is_not_overwritten(): void
    {
        $posts = new InMemoryPostStore([new PostRecord(193, 'best-in-design', 'hero')]);
        $posts->replaceContentBeforeConditionalUpdate = [193 => 'editor-hero'];
        $migration = new BestInDesignHeroMigration(
            $posts,
            new FakeMediaStore([
                new MediaAsset(44256, 'https://example.test/uploads/liza-marchkova-lizamarchkova-13-1-scaled.jpg'),
            ]),
            new class implements HeroBackgroundTransformer {
                public function desiredPageContent(string $content, MediaAsset $background): string
                {
                    return $content . '|hero:' . $background->id();
                }

                public function equivalent(string $first, string $second): bool
                {
                    return $first === $second;
                }
            }
        );

        try {
            $migration->apply();
            self::fail('A concurrent hero edit should abort the migration.');
        } catch (\RuntimeException) {
            self::assertSame('editor-hero', $posts->find(193)?->content());
        }
    }
}
