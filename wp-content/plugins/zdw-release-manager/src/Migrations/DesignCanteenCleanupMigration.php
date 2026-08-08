<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\DesignCanteenCleanupTransformer;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PostRecord;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class DesignCanteenCleanupMigration implements Migration
{
    private const POST_ID = 12142;
    private const POST_SLUG = 'design-kantyna';

    public function __construct(
        private readonly PostStore $posts,
        private readonly DesignCanteenCleanupTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260808_010_design_canteen_czech_cleanup';
    }

    public function label(): string
    {
        return 'Česká Design Canteen bez dvou zastaralých bloků';
    }

    public function preflight(): array
    {
        try {
            $post = $this->target();
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('canteen.cs_target', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('canteen.cs_ready', 'Česká Design Canteen už neobsahuje zastaralé bloky.')]
            : [PreflightCheck::warning('canteen.cs_changes', 'Budou odstraněny pouze bloky navigace k místu a programu 2026.')];
    }

    public function apply(): void
    {
        $post = $this->target();
        $desired = $this->transformer->desiredPageContent($post->content());
        if (!$this->transformer->equivalent($post->content(), $desired)) {
            $this->posts->updateContent($post->id(), $desired);
        }
    }

    public function verify(): array
    {
        try {
            $post = $this->target();
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('canteen.cs_verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('canteen.cs_saved', 'Česká Design Canteen byla ověřena.')]
            : [PreflightCheck::blocker('canteen.cs_mismatch', 'Česká Design Canteen stále obsahuje zastaralé bloky.')];
    }

    private function target(): PostRecord
    {
        $post = $this->posts->find(self::POST_ID);
        if (!$post instanceof PostRecord || self::POST_SLUG !== $post->slug()) {
            throw new RuntimeException('Česká stránka Design Canteen nebyla bezpečně nalezena.');
        }

        return $post;
    }
}
