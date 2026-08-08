<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\HeroBackgroundTransformer;
use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class BestInDesignHeroMigration implements Migration
{
    private const POST_ID = 193;
    private const POST_SLUG = 'best-in-design';
    private const FILENAME = 'liza-marchkova-lizamarchkova-13-1-scaled.jpg';

    public function __construct(
        private readonly PostStore $posts,
        private readonly MediaStore $media,
        private readonly HeroBackgroundTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260808_009_best_in_design_hero';
    }

    public function label(): string
    {
        return 'Nová fotografie v českém hero Best in Design';
    }

    public function preflight(): array
    {
        try {
            [$post, $background] = $this->targets();
            $desired = $this->transformer->desiredPageContent($post->content(), $background);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('bid.hero_target', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('bid.hero_ready', 'Hero Best in Design už používá novou fotografii.')]
            : [PreflightCheck::warning('bid.hero_changes', 'Změní se pouze fotografie prvního bloku české stránky Best in Design.')];
    }

    public function apply(): void
    {
        [$post, $background] = $this->targets();
        $desired = $this->transformer->desiredPageContent($post->content(), $background);
        if (!$this->transformer->equivalent($post->content(), $desired)) {
            $this->posts->updateContent($post->id(), $desired);
        }
    }

    public function verify(): array
    {
        try {
            [$post, $background] = $this->targets();
            $desired = $this->transformer->desiredPageContent($post->content(), $background);
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('bid.hero_verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('bid.hero_saved', 'Fotografie hero Best in Design byla ověřena.')]
            : [PreflightCheck::blocker('bid.hero_mismatch', 'Hero Best in Design neodpovídá cílové fotografii.')];
    }

    /** @return array{PostRecord, MediaAsset} */
    private function targets(): array
    {
        $post = $this->posts->find(self::POST_ID);
        if (!$post instanceof PostRecord || self::POST_SLUG !== $post->slug()) {
            throw new RuntimeException('Česká stránka Best in Design nebyla bezpečně nalezena.');
        }
        $assets = $this->media->findByFilename(self::FILENAME);
        if (1 !== count($assets)) {
            throw new RuntimeException(sprintf('V Médiích musí být právě jeden soubor %s.', self::FILENAME));
        }

        return [$post, $assets[0]];
    }
}
