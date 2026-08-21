<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class HomepageIntroMigration implements Migration
{
    private const VIDEO_FILENAME = 'zdw-bg-trimmed-30-muted.mp4';
    private const POSTER_ID = 35610;
    private const POSTER_FILENAME = '16-zdw-tag-jiri-edit-1-2.jpg';

    public function __construct(
        private readonly PostStore $posts,
        private readonly MediaStore $media,
        private readonly IntroContentTransformer $transformer,
        /** @var array<int, string> */
        private readonly array $homepages = [2 => 'zdw']
    ) {
    }

    public function id(): string
    {
        return '20260808_006_homepage_intros';
    }

    public function label(): string
    {
        return 'Video a obsah úvodního bloku obou homepage';
    }

    public function preflight(): array
    {
        [$posts, $videos, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($posts, $videos, $poster);
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$posts, $video, $poster] = $this->targets($posts, $videos, $poster);
            $matches = $this->allHomepagesMatch($posts, $video, $poster);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('intro.transform', $error->getMessage())];
        }

        return $matches
            ? [PreflightCheck::pass('intro.ready', 'Úvodní bloky obou homepage už odpovídají této verzi.')]
            : [PreflightCheck::warning('intro.changes', 'Na české i anglické homepage bude nahrazen pouze první úvodní blok; ostatní obsah zůstane zachován.')];
    }

    public function apply(): void
    {
        [$posts, $videos, $poster] = $this->resolvedTargets();
        if ([] !== $this->blockingChecks($posts, $videos, $poster)) {
            throw new RuntimeException('Nelze bezpečně migrovat úvodní blok homepage.');
        }

        [$posts, $video, $poster] = $this->targets($posts, $videos, $poster);
        $updates = [];
        $originals = [];
        foreach ($posts as $post) {
            $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                $updates[$post->id()] = $desired;
                $originals[$post->id()] = $post->content();
            }
        }

        $attemptedPostIds = [];
        try {
            foreach ($updates as $postId => $desired) {
                $attemptedPostIds[] = $postId;
                $this->posts->updateContent($postId, $desired);
            }
        } catch (Throwable $error) {
            foreach (array_reverse($attemptedPostIds) as $postId) {
                $current = $this->posts->find($postId);
                if ($current instanceof PostRecord && $originals[$postId] === $current->content()) {
                    continue;
                }

                try {
                    $this->posts->updateContent($postId, $originals[$postId]);
                } catch (Throwable $rollbackError) {
                    $restored = $this->posts->find($postId);
                    if ($restored instanceof PostRecord && $originals[$postId] === $restored->content()) {
                        continue;
                    }

                    throw new RuntimeException(
                        sprintf('Obnovení homepage ID %d po neúspěšné migraci selhalo: %s', $postId, $rollbackError->getMessage()),
                        0,
                        $error
                    );
                }
            }

            throw $error;
        }
    }

    public function verify(): array
    {
        [$posts, $videos, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($posts, $videos, $poster);
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$posts, $video, $poster] = $this->targets($posts, $videos, $poster);
            $matches = $this->allHomepagesMatch($posts, $video, $poster);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('intro.verify', $error->getMessage())];
        }

        return $matches
            ? [PreflightCheck::pass('intro.saved', 'Úvodní video a obsah bloků obou homepage byly ověřeny.')]
            : [PreflightCheck::blocker('intro.mismatch', 'Některý úvodní blok homepage neodpovídá migraci.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(array $posts, array $videos, ?MediaAsset $poster): array
    {
        $checks = [];
        if ([] === $videos) {
            $checks[] = PreflightCheck::blocker(
                'intro.video_missing',
                sprintf('Nejprve nahrajte soubor %s přes WordPress → Média.', self::VIDEO_FILENAME)
            );
        } elseif (1 !== count($videos)) {
            $checks[] = PreflightCheck::blocker(
                'intro.video_duplicate',
                sprintf('Soubor %s je v Médiích vícekrát; ponechte právě jednu kopii.', self::VIDEO_FILENAME)
            );
        }

        if (!$poster instanceof MediaAsset) {
            $checks[] = PreflightCheck::blocker('intro.poster_missing', sprintf('Chybí poster obrázek ID %d.', self::POSTER_ID));
        } elseif (self::POSTER_FILENAME !== $this->filename($poster)) {
            $checks[] = PreflightCheck::blocker(
                'intro.poster_mismatch',
                sprintf('Poster ID %d neodpovídá souboru %s.', self::POSTER_ID, self::POSTER_FILENAME)
            );
        }

        foreach ($this->homepages as $postId => $slug) {
            $post = $posts[$postId] ?? null;
            if (!$post instanceof PostRecord || $slug !== $post->slug()) {
                $checks[] = PreflightCheck::blocker(
                    'intro.homepage_' . $postId,
                    sprintf('Homepage ID %d se slugem %s nebyla nalezena.', $postId, $slug)
                );
            }
        }

        return $checks;
    }

    /** @return array{0: array<int, PostRecord>, 1: MediaAsset, 2: MediaAsset} */
    private function targets(array $posts, array $videos, ?MediaAsset $poster): array
    {
        $resolvedPosts = array_filter(
            $posts,
            static fn (mixed $post): bool => $post instanceof PostRecord
        );
        if (count($resolvedPosts) !== count($this->homepages)
            || 1 !== count($videos)
            || !$poster instanceof MediaAsset) {
            throw new RuntimeException('Cíle úvodní migrace nejsou jednoznačné.');
        }

        return [$resolvedPosts, $videos[0], $poster];
    }

    /** @return array{0: array<int, ?PostRecord>, 1: list<MediaAsset>, 2: ?MediaAsset} */
    private function resolvedTargets(): array
    {
        $posts = [];
        foreach (array_keys($this->homepages) as $postId) {
            $posts[$postId] = $this->posts->find($postId);
        }

        return [
            $posts,
            $this->media->findByFilename(self::VIDEO_FILENAME),
            $this->media->find(self::POSTER_ID),
        ];
    }

    /** @param array<int, PostRecord> $posts */
    private function allHomepagesMatch(array $posts, MediaAsset $video, MediaAsset $poster): bool
    {
        foreach ($posts as $post) {
            $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                return false;
            }
        }

        return true;
    }

    private function filename(MediaAsset $asset): string
    {
        $path = parse_url($asset->url(), PHP_URL_PATH);

        return is_string($path) ? rawurldecode(basename($path)) : '';
    }
}
