<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class DesiredPostContentMigration implements Migration
{
    /** @param array<int, array{slug: string, content: string}> $desiredPosts */
    public function __construct(
        private readonly string $migrationId,
        private readonly string $migrationLabel,
        private readonly PostStore $store,
        private readonly array $desiredPosts
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

    public function preflight(): array
    {
        $checks = $this->identityChecks();
        if ([] !== $checks) {
            return $checks;
        }

        $changed = $this->changedPostIds();
        if ([] === $changed) {
            return [PreflightCheck::pass('posts.ready', 'Obsah cílových stránek už odpovídá této verzi.')];
        }

        return [PreflightCheck::warning(
            'posts.changes',
            sprintf('Migrace změní obsah %d stránek: %s.', count($changed), implode(', ', $changed))
        )];
    }

    public function apply(): void
    {
        $identityChecks = $this->identityChecks();
        if ([] !== $identityChecks) {
            throw new RuntimeException('Nelze bezpečně určit cílové stránky migrace.');
        }

        foreach ($this->desiredPosts as $postId => $desired) {
            $post = $this->store->find($postId);
            if (null !== $post && $post->content() !== $desired['content']) {
                $this->store->updateContent($postId, $desired['content']);
            }
        }
    }

    public function verify(): array
    {
        $identityChecks = $this->identityChecks();
        if ([] !== $identityChecks) {
            return $identityChecks;
        }

        $changed = $this->changedPostIds();
        if ([] !== $changed) {
            return [PreflightCheck::blocker(
                'posts.mismatch',
                sprintf('Neodpovídá obsah stránek: %s.', implode(', ', $changed))
            )];
        }

        return [PreflightCheck::pass(
            'posts.saved',
            sprintf('Byl ověřen obsah %d stránek.', count($this->desiredPosts))
        )];
    }

    /** @return list<PreflightCheck> */
    private function identityChecks(): array
    {
        $checks = [];

        foreach ($this->desiredPosts as $postId => $desired) {
            $post = $this->store->find($postId);
            if (null === $post) {
                $checks[] = PreflightCheck::blocker(
                    'post.missing.' . $postId,
                    sprintf('Chybí očekávaná stránka ID %d (%s).', $postId, $desired['slug'])
                );
            } elseif ($post->slug() !== $desired['slug']) {
                $checks[] = PreflightCheck::blocker(
                    'post.slug.' . $postId,
                    sprintf('Stránka ID %d má slug %s místo %s.', $postId, $post->slug(), $desired['slug'])
                );
            }
        }

        return $checks;
    }

    /** @return list<int> */
    private function changedPostIds(): array
    {
        $changed = [];

        foreach ($this->desiredPosts as $postId => $desired) {
            $post = $this->store->find($postId);
            if (null !== $post && $post->content() !== $desired['content']) {
                $changed[] = $postId;
            }
        }

        return $changed;
    }
}
