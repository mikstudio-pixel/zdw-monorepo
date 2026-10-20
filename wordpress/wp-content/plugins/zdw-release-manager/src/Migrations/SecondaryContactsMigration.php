<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Application\AtomicPostContentUpdater;
use ZDW\ReleaseManager\Contracts\ContactContentTransformer;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class SecondaryContactsMigration implements Migration
{
    /** @var array<int, array{slug: string, kind: string}> */
    private const POSTS = [
        202 => ['slug' => 'pro-media', 'kind' => 'press'],
        1330 => ['slug' => 'press-kit', 'kind' => 'press'],
        15606 => ['slug' => 'pristupnost-festivalu', 'kind' => 'accessibility'],
        15608 => ['slug' => 'festival-accessibility', 'kind' => 'accessibility'],
    ];

    public function __construct(
        private readonly PostStore $store,
        private readonly ContactContentTransformer $transformer
    ) {
    }

    public function id(): string
    {
        return '20260807_003_secondary_contacts';
    }

    public function label(): string
    {
        return 'Kontakty pro média a přístupnost festivalu';
    }

    public function preflight(): array
    {
        $identity = $this->identityChecks();
        if ([] !== $identity) {
            return $identity;
        }

        try {
            $changed = $this->changedPostIds();
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('contacts.transform', $error->getMessage())];
        }

        return [] === $changed
            ? [PreflightCheck::pass('contacts.ready', 'Vedlejší kontaktní stránky už odpovídají této verzi.')]
            : [PreflightCheck::warning(
                'contacts.changes',
                sprintf('Migrace upraví kontakty na stránkách: %s.', implode(', ', $changed))
            )];
    }

    public function apply(): void
    {
        if ([] !== $this->identityChecks()) {
            throw new RuntimeException('Nelze bezpečně určit vedlejší kontaktní stránky.');
        }

        $updates = [];
        $originals = [];
        foreach (self::POSTS as $postId => $definition) {
            $post = $this->store->find($postId);
            if (null === $post) {
                throw new RuntimeException(sprintf('Chybí stránka ID %d.', $postId));
            }

            $desired = $this->desiredContent($definition['kind'], $post->content());
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                $updates[$postId] = $desired;
                $originals[$postId] = $post->content();
            }
        }

        (new AtomicPostContentUpdater($this->store))->apply($updates, $originals, 'Obnovení kontaktů na stránce');
    }

    public function verify(): array
    {
        $identity = $this->identityChecks();
        if ([] !== $identity) {
            return $identity;
        }

        try {
            $changed = $this->changedPostIds();
        } catch (Throwable $error) {
            return [PreflightCheck::blocker('contacts.verify', $error->getMessage())];
        }

        return [] === $changed
            ? [PreflightCheck::pass('contacts.saved', 'Kontakty pro média a přístupnost byly ověřeny.')]
            : [PreflightCheck::blocker(
                'contacts.mismatch',
                sprintf('Neodpovídají stránky: %s.', implode(', ', $changed))
            )];
    }

    /** @return list<PreflightCheck> */
    private function identityChecks(): array
    {
        $checks = [];
        foreach (self::POSTS as $postId => $definition) {
            $post = $this->store->find($postId);
            if (null === $post) {
                $checks[] = PreflightCheck::blocker(
                    'post.missing.' . $postId,
                    sprintf('Chybí očekávaná stránka ID %d (%s).', $postId, $definition['slug'])
                );
            } elseif ($definition['slug'] !== $post->slug()) {
                $checks[] = PreflightCheck::blocker(
                    'post.slug.' . $postId,
                    sprintf('Stránka ID %d má neočekávaný slug %s.', $postId, $post->slug())
                );
            }
        }

        return $checks;
    }

    /** @return list<int> */
    private function changedPostIds(): array
    {
        $changed = [];
        foreach (self::POSTS as $postId => $definition) {
            $post = $this->store->find($postId);
            if (null === $post) {
                continue;
            }

            $desired = $this->desiredContent($definition['kind'], $post->content());
            if (!$this->transformer->equivalent($post->content(), $desired)) {
                $changed[] = $postId;
            }
        }

        return $changed;
    }

    private function desiredContent(string $kind, string $content): string
    {
        return 'press' === $kind
            ? $this->transformer->pressPage($content, self::eva())
            : $this->transformer->replaceFirstContact($content, self::anna());
    }

    /** @return list<array<string, string>> */
    private static function eva(): array
    {
        return [[
            'name' => 'Eva Ševčíková',
            'role' => 'Public Relations',
            'email' => 'eva.sevcikova@zlindesignweek.com',
            'phone' => '+420 723 457 715',
        ]];
    }

    /** @return list<array<string, string>> */
    private static function anna(): array
    {
        return [[
            'name' => 'Anna Svobodová',
            'role' => 'Coordinator of Accessibility',
            'email' => 'anna.svobodova@zlindesignweek.com',
            'phone' => '+420 733 144 711',
        ]];
    }
}
