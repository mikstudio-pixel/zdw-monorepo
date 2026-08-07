<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\HomepageBodyTransformer;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class HomepageBodyMigration implements Migration
{
    private const POST_ID = 2;
    private const POST_SLUG = 'zdw';

    public function __construct(
        private readonly PostStore $posts,
        private readonly HomepageBodyTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260808_007_homepage_body';
    }

    public function label(): string
    {
        return 'Finální skladba české homepage bez starých bloků';
    }

    public function preflight(): array
    {
        $post = $this->posts->find(self::POST_ID);
        if (null === $post || self::POST_SLUG !== $post->slug()) {
            return [PreflightCheck::blocker('homepage.body_missing', 'Česká homepage ID 2 se slugem zdw nebyla nalezena.')];
        }

        try {
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('homepage.body_structure', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('homepage.body_ready', 'Česká homepage už má finální skladbu bloků.')]
            : [PreflightCheck::warning('homepage.body_changes', 'Ze české homepage budou odstraněny staré obsahové bloky.')];
    }

    public function apply(): void
    {
        $post = $this->posts->find(self::POST_ID);
        if (null === $post || self::POST_SLUG !== $post->slug()) {
            throw new RuntimeException('Česká homepage nebyla bezpečně nalezena.');
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
            return [PreflightCheck::blocker('homepage.body_missing', 'Česká homepage nebyla po migraci nalezena.')];
        }

        try {
            $desired = $this->transformer->desiredPageContent($post->content());
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('homepage.body_verify', $error->getMessage())];
        }

        return $this->transformer->equivalent($post->content(), $desired)
            ? [PreflightCheck::pass('homepage.body_saved', 'Finální skladba české homepage byla ověřena.')]
            : [PreflightCheck::blocker('homepage.body_mismatch', 'Česká homepage neodpovídá finální skladbě bloků.')];
    }
}
