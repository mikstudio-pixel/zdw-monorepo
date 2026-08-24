<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Application\AtomicPostContentUpdater;
use ZDW\ReleaseManager\Contracts\DependentMigration;
use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class HomepageIntroMigration implements Migration, DependentMigration
{
    private const DEFAULT_MIGRATION_ID = '20260808_006_homepage_intros';
    private const DEFAULT_LABEL = 'Video a obsah úvodního bloku obou homepage';
    private const DEFAULT_VIDEO_FILENAME = 'zdw-bg-trimmed-30-muted.mp4';
    private const DEFAULT_POSTER_ID = 35610;
    private const DEFAULT_POSTER_FILENAME = '16-zdw-tag-jiri-edit-1-2.jpg';

    public function __construct(
        private readonly PostStore $posts,
        private readonly MediaStore $media,
        private readonly IntroContentTransformer $transformer,
        /** @var array<int, string> */
        private readonly array $homepages = [2 => 'zdw'],
        private readonly string $migrationId = self::DEFAULT_MIGRATION_ID,
        private readonly string $videoFilename = self::DEFAULT_VIDEO_FILENAME,
        private readonly string $posterFilename = self::DEFAULT_POSTER_FILENAME,
        private readonly ?int $posterId = self::DEFAULT_POSTER_ID,
        private readonly string $migrationLabel = self::DEFAULT_LABEL,
        /** @var list<string> */
        private readonly array $migrationDependencies = []
    ) {
    }

    public function id(): string
    {
        return $this->migrationId;
    }

    public function label(): string
    {
        return $this->migrationLabel;
    }

    public function dependencies(): array
    {
        return $this->migrationDependencies;
    }

    public function preflight(): array
    {
        [$posts, $videos, $posters, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($posts, $videos, $posters, $poster);
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
        [$posts, $videos, $posters, $poster] = $this->resolvedTargets();
        if ([] !== $this->blockingChecks($posts, $videos, $posters, $poster)) {
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

        (new AtomicPostContentUpdater($this->posts))->apply(
            $updates,
            $originals,
            'Obnovení homepage po neúspěšné migraci'
        );
    }

    public function verify(): array
    {
        [$posts, $videos, $posters, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($posts, $videos, $posters, $poster);
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
    private function blockingChecks(array $posts, array $videos, array $posters, ?MediaAsset $poster): array
    {
        $checks = [];
        if ([] === $videos) {
            $checks[] = PreflightCheck::blocker(
                'intro.video_missing',
                sprintf('Nejprve nahrajte soubor %s přes WordPress → Média.', $this->videoFilename)
            );
        } elseif (1 !== count($videos)) {
            $checks[] = PreflightCheck::blocker(
                'intro.video_duplicate',
                sprintf('Soubor %s je v Médiích vícekrát; ponechte právě jednu kopii.', $this->videoFilename)
            );
        }

        if ([] === $posters) {
            $message = null === $this->posterId
                ? sprintf('Nejprve nahrajte poster %s přes WordPress → Média.', $this->posterFilename)
                : sprintf('Chybí poster obrázek ID %d.', $this->posterId);
            $checks[] = PreflightCheck::blocker('intro.poster_missing', $message);
        } elseif (1 !== count($posters)) {
            $checks[] = PreflightCheck::blocker(
                'intro.poster_duplicate',
                sprintf('Soubor %s je v Médiích vícekrát; ponechte právě jednu kopii.', $this->posterFilename)
            );
        } elseif (!$poster instanceof MediaAsset || 0 !== strcasecmp($this->posterFilename, $this->filename($poster))) {
            $checks[] = PreflightCheck::blocker(
                'intro.poster_mismatch',
                null === $this->posterId
                    ? sprintf('Poster neodpovídá souboru %s.', $this->posterFilename)
                    : sprintf('Poster ID %d neodpovídá souboru %s.', $this->posterId, $this->posterFilename)
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

    /** @return array{0: array<int, ?PostRecord>, 1: list<MediaAsset>, 2: list<MediaAsset>, 3: ?MediaAsset} */
    private function resolvedTargets(): array
    {
        $posts = [];
        foreach (array_keys($this->homepages) as $postId) {
            $posts[$postId] = $this->posts->find($postId);
        }

        $posters = null === $this->posterId
            ? $this->media->findByFilename($this->posterFilename)
            : array_values(array_filter([$this->media->find($this->posterId)]));

        return [
            $posts,
            $this->media->findByFilename($this->videoFilename),
            $posters,
            1 === count($posters) ? $posters[0] : null,
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
