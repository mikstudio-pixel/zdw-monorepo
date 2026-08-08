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
    public function __construct(
        private readonly PostStore $posts,
        private readonly HomepageBodyTransformer $transformer,
        /** @var array<int, string> */
        private readonly array $homepages = [2 => 'zdw', 93 => 'zdw-en']
    ) {
    }

    public function id(): string
    {
        return '20260808_007_homepage_body';
    }

    public function label(): string
    {
        return 'Stejná finální skladba české a anglické homepage';
    }

    public function preflight(): array
    {
        $changed = false;
        foreach ($this->homepages as $postId => $slug) {
            $post = $this->posts->find($postId);
            if (null === $post || $slug !== $post->slug()) {
                return [PreflightCheck::blocker(
                    'homepage.body_missing',
                    sprintf('Homepage ID %d se slugem %s nebyla nalezena.', $postId, $slug)
                )];
            }

            try {
                $desired = $this->transformer->desiredPageContent($post->content());
            } catch (Throwable $error) {
                return [PreflightCheck::blocker('homepage.body_structure', $error->getMessage())];
            }
            $changed = $changed || !$this->transformer->equivalent($post->content(), $desired);
        }

        return $changed
            ? [PreflightCheck::warning('homepage.body_changes', 'Z obou homepage budou odstraněny staré obsahové bloky.')]
            : [PreflightCheck::pass('homepage.body_ready', 'Obě homepage už mají stejnou finální skladbu bloků.')];
    }

    public function apply(): void
    {
        $updates = [];
        foreach ($this->homepages as $postId => $slug) {
            $post = $this->posts->find($postId);
            if (null === $post || $slug !== $post->slug()) {
                throw new RuntimeException(sprintf('Homepage ID %d nebyla bezpečně nalezena.', $postId));
            }

            $desired = $this->transformer->desiredPageContent($post->content());
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                $updates[$post->id()] = $desired;
            }
        }

        foreach ($updates as $postId => $desired) {
            $this->posts->updateContent($postId, $desired);
        }
    }

    public function verify(): array
    {
        foreach ($this->homepages as $postId => $slug) {
            $post = $this->posts->find($postId);
            if (null === $post || $slug !== $post->slug()) {
                return [PreflightCheck::blocker('homepage.body_missing', 'Některá homepage nebyla po migraci nalezena.')];
            }

            try {
                $desired = $this->transformer->desiredPageContent($post->content());
            } catch (Throwable $error) {
                return [PreflightCheck::blocker('homepage.body_verify', $error->getMessage())];
            }
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                return [PreflightCheck::blocker(
                    'homepage.body_mismatch',
                    sprintf('Homepage ID %d neodpovídá finální skladbě bloků.', $postId)
                )];
            }
        }

        return [PreflightCheck::pass('homepage.body_saved', 'Finální skladba obou homepage byla ověřena.')];
    }
}
