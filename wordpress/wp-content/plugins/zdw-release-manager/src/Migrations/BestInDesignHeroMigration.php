<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\DependentMigration;
use ZDW\ReleaseManager\Contracts\HeroBackgroundTransformer;
use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\MediaAsset;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class BestInDesignHeroMigration implements Migration, DependentMigration
{
    private const POST_ID = 193;
    private const POST_SLUG = 'best-in-design';
    private const DEFAULT_FILENAMES = [
        'liza-marchkova-lizamarchkova-13-1-scaled.jpg',
        'liza-marchkova-lizamarchkova-13-1-scaled-1.jpg',
    ];

    public function __construct(
        private readonly PostStore $posts,
        private readonly MediaStore $media,
        private readonly HeroBackgroundTransformer $transformer,
        private readonly string $migrationId = '20260808_009_best_in_design_hero',
        private readonly array $filenames = self::DEFAULT_FILENAMES,
        private readonly string $migrationLabel = 'Nová fotografie v českém hero Best in Design',
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
            if (!$this->posts->updateContentIfCurrent($post->id(), $post->content(), $desired)) {
                throw new RuntimeException('Obsah Best in Design mezitím změnil jiný požadavek.');
            }
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
        $assets = [];
        foreach ($this->filenames as $filename) {
            array_push($assets, ...$this->media->findByFilename($filename));
        }
        if (1 !== count($assets)) {
            throw new RuntimeException('V Médiích musí být právě jedna fotografie Best in Design s očekávaným názvem.');
        }

        return [$post, $assets[0]];
    }
}
