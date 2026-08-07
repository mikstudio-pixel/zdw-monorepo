<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class SponsorPageMigration implements Migration
{
    /** @param list<int> $attachmentIds */
    public function __construct(
        private readonly PageStore $store,
        private readonly array $attachmentIds,
        private readonly string $desiredContent
    ) {
    }

    public function id(): string
    {
        return '20260807_004_sponsor_page';
    }

    public function label(): string
    {
        return 'Stránka Sponzoři s editovatelným Gutenberg blokem';
    }

    public function preflight(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        $pageIds = $this->store->findPageIdsBySlug('sponzori');
        if ([] === $pageIds) {
            return [PreflightCheck::warning('sponsors.create', 'Bude vytvořena stránka Sponzoři.')];
        }

        $page = $this->store->find($pageIds[0]);

        return null !== $page && $page->content() === $this->desiredContent
            ? [PreflightCheck::pass('sponsors.ready', 'Stránka Sponzoři už odpovídá této verzi.')]
            : [PreflightCheck::warning('sponsors.update', 'Bude aktualizován obsah stránky Sponzoři.')];
    }

    public function apply(): void
    {
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně vytvořit nebo aktualizovat stránku Sponzoři.');
        }

        $pageIds = $this->store->findPageIdsBySlug('sponzori');
        if ([] === $pageIds) {
            $pageId = $this->store->createPage('Sponzoři', 'sponzori', $this->desiredContent);
            $this->store->setLanguage($pageId, 'cs');

            return;
        }

        $page = $this->store->find($pageIds[0]);
        if (null === $page) {
            throw new RuntimeException('Stránku Sponzoři se nepodařilo načíst.');
        }
        if ($page->content() !== $this->desiredContent) {
            $this->store->updateContent($page->id(), $this->desiredContent);
        }
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        $pageIds = $this->store->findPageIdsBySlug('sponzori');
        if (1 !== count($pageIds)) {
            return [PreflightCheck::blocker('sponsors.count', 'Stránka Sponzoři nebyla jednoznačně nalezena.')];
        }

        $page = $this->store->find($pageIds[0]);
        if (null === $page || $page->content() !== $this->desiredContent) {
            return [PreflightCheck::blocker('sponsors.content', 'Obsah stránky Sponzoři neodpovídá migraci.')];
        }

        return [PreflightCheck::pass('sponsors.saved', 'Stránka Sponzoři byla ověřena.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $missingAttachments = array_values(array_filter(
            $this->attachmentIds,
            fn (int $attachmentId): bool => !$this->store->attachmentExists($attachmentId)
        ));
        if ([] !== $missingAttachments) {
            $checks[] = PreflightCheck::blocker(
                'sponsors.attachments',
                sprintf('Chybí loga v knihovně médií: %s.', implode(', ', $missingAttachments))
            );
        }

        $pageIds = $this->store->findPageIdsBySlug('sponzori');
        if (count($pageIds) > 1) {
            $checks[] = PreflightCheck::blocker(
                'sponsors.duplicate',
                sprintf('Slug sponzori používá více stránek: %s.', implode(', ', $pageIds))
            );
        }

        return $checks;
    }
}
