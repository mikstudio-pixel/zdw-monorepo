<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\DesignCanteenContentTransformer;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class DesignCanteenMigration implements Migration
{
    private const POST_ID = 12192;
    private const POST_SLUG = 'design-kantyna-en';

    public function __construct(
        private readonly PostStore $posts,
        private readonly DesignCanteenContentTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260808_008_design_canteen_english';
    }

    public function label(): string
    {
        return 'Anglická Design Canteen bez zastaralého programu 2026';
    }

    public function preflight(): array
    {
        $post = $this->posts->find(self::POST_ID);
        if (null === $post || self::POST_SLUG !== $post->slug()) {
            return [PreflightCheck::blocker('canteen.english_missing', 'Anglická stránka Design Canteen nebyla nalezena.')];
        }

        try {
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('canteen.english_structure', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('canteen.english_ready', 'Anglická Design Canteen už odpovídá aktuální české skladbě.')]
            : [PreflightCheck::warning('canteen.english_changes', 'Z anglické Design Canteen bude odstraněn zastaralý program 2026.')];
    }

    public function apply(): void
    {
        $post = $this->posts->find(self::POST_ID);
        if (null === $post || self::POST_SLUG !== $post->slug()) {
            throw new RuntimeException('Anglická stránka Design Canteen nebyla bezpečně nalezena.');
        }

        $desired = $this->transformer->desiredPageContent($post->content());
        if (!$this->transformer->equivalent($post->content(), $desired)) {
            $this->posts->updateContent($post->id(), $desired);
        }
    }

    public function verify(): array
    {
        $post = $this->posts->find(self::POST_ID);
        if (null === $post || self::POST_SLUG !== $post->slug()) {
            return [PreflightCheck::blocker('canteen.english_missing', 'Anglická Design Canteen nebyla po migraci nalezena.')];
        }

        try {
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('canteen.english_verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('canteen.english_saved', 'Aktuální anglická Design Canteen byla ověřena.')]
            : [PreflightCheck::blocker('canteen.english_mismatch', 'Anglická Design Canteen stále obsahuje zastaralé bloky.')];
    }
}
