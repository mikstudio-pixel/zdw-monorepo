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
        private readonly IntroContentTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260807_006_homepage_intro';
    }

    public function label(): string
    {
        return 'Video a obsah úvodního bloku homepage';
    }

    public function preflight(): array
    {
        [$post, $videos, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($post, $videos, $poster);
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$post, $video, $poster] = $this->targets($post, $videos, $poster);
            $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('intro.transform', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('intro.ready', 'Úvodní blok homepage už odpovídá této verzi.')]
            : [PreflightCheck::warning('intro.changes', 'Bude nahrazen pouze první úvodní blok homepage; ostatní obsah zůstane zachován.')];
    }

    public function apply(): void
    {
        [$post, $videos, $poster] = $this->resolvedTargets();
        if ([] !== $this->blockingChecks($post, $videos, $poster)) {
            throw new RuntimeException('Nelze bezpečně migrovat úvodní blok homepage.');
        }

        [$post, $video, $poster] = $this->targets($post, $videos, $poster);
        $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
        if (!$this->transformer->equivalent($post->content(), $desired)) {
            $this->posts->updateContent($post->id(), $desired);
        }
    }

    public function verify(): array
    {
        [$post, $videos, $poster] = $this->resolvedTargets();
        $checks = $this->blockingChecks($post, $videos, $poster);
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$post, $video, $poster] = $this->targets($post, $videos, $poster);
            $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('intro.verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('intro.saved', 'Úvodní video a obsah bloku byly ověřeny.')]
            : [PreflightCheck::blocker('intro.mismatch', 'Úvodní blok homepage neodpovídá migraci.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(?PostRecord $post, array $videos, ?MediaAsset $poster): array
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

        if (null === $post || 'zdw' !== $post->slug()) {
            $checks[] = PreflightCheck::blocker('intro.homepage', 'Homepage ID 2 se slugem zdw nebyla nalezena.');
        }

        return $checks;
    }

    /** @return array{0: \ZDW\ReleaseManager\Domain\PostRecord, 1: MediaAsset, 2: MediaAsset} */
    private function targets(?PostRecord $post, array $videos, ?MediaAsset $poster): array
    {
        if (null === $post || 1 !== count($videos) || !$poster instanceof MediaAsset) {
            throw new RuntimeException('Cíle úvodní migrace nejsou jednoznačné.');
        }

        return [$post, $videos[0], $poster];
    }

    /** @return array{0: ?PostRecord, 1: list<MediaAsset>, 2: ?MediaAsset} */
    private function resolvedTargets(): array
    {
        return [
            $this->posts->find(2),
            $this->media->findByFilename(self::VIDEO_FILENAME),
            $this->media->find(self::POSTER_ID),
        ];
    }

    private function filename(MediaAsset $asset): string
    {
        $path = parse_url($asset->url(), PHP_URL_PATH);

        return is_string($path) ? rawurldecode(basename($path)) : '';
    }
}
