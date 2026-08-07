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
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class HomepageIntroMigration implements Migration
{
    private const VIDEO_FILENAME = 'zdw-bg-trimmed-30-muted.mp4';
    private const POSTER_ID = 35610;

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
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$post, $video, $poster] = $this->targets();
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
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně migrovat úvodní blok homepage.');
        }

        [$post, $video, $poster] = $this->targets();
        $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
        if (!$this->transformer->equivalent($post->content(), $desired)) {
            $this->posts->updateContent($post->id(), $desired);
        }
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        try {
            [$post, $video, $poster] = $this->targets();
            $desired = $this->transformer->desiredPageContent($post->content(), $video, $poster);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('intro.verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('intro.saved', 'Úvodní video a obsah bloku byly ověřeny.')]
            : [PreflightCheck::blocker('intro.mismatch', 'Úvodní blok homepage neodpovídá migraci.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $videos = $this->media->findByFilename(self::VIDEO_FILENAME);
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

        if (!$this->media->find(self::POSTER_ID) instanceof MediaAsset) {
            $checks[] = PreflightCheck::blocker('intro.poster_missing', sprintf('Chybí poster obrázek ID %d.', self::POSTER_ID));
        }

        $post = $this->posts->find(2);
        if (null === $post || 'zdw' !== $post->slug()) {
            $checks[] = PreflightCheck::blocker('intro.homepage', 'Homepage ID 2 se slugem zdw nebyla nalezena.');
        }

        return $checks;
    }

    /** @return array{0: \ZDW\ReleaseManager\Domain\PostRecord, 1: MediaAsset, 2: MediaAsset} */
    private function targets(): array
    {
        $post = $this->posts->find(2);
        $videos = $this->media->findByFilename(self::VIDEO_FILENAME);
        $poster = $this->media->find(self::POSTER_ID);
        if (null === $post || 1 !== count($videos) || !$poster instanceof MediaAsset) {
            throw new RuntimeException('Cíle úvodní migrace nejsou jednoznačné.');
        }

        return [$post, $videos[0], $poster];
    }
}
