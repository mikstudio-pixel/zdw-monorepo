<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class SponsorPageMigration implements Migration
{
    private const PAGES = [
        'cs' => ['title' => 'Sponzoři', 'slug' => 'sponzori'],
        'en' => ['title' => 'Partners', 'slug' => 'partners'],
    ];

    /** @param array<int, string> $attachments */
    public function __construct(
        private readonly PageStore $store,
        private readonly array $attachments,
        private readonly string $desiredContent
    ) {
    }

    public function id(): string
    {
        return '20260808_004_sponsor_pages';
    }

    public function label(): string
    {
        return 'Stránky Sponzoři a Partners s editovatelným Gutenberg blokem';
    }

    public function preflight(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->pagesMatch()
            ? [PreflightCheck::pass('sponsors.ready', 'Stránky Sponzoři a Partners už odpovídají této verzi.')]
            : [PreflightCheck::warning('sponsors.update', 'Budou vytvořeny nebo aktualizovány stránky Sponzoři a Partners.')];
    }

    public function apply(): void
    {
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně vytvořit nebo aktualizovat stránky partnerů.');
        }

        $translations = [];
        foreach (self::PAGES as $language => $definition) {
            $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
            if ([] === $pageIds) {
                $pageId = $this->store->createPage(
                    $definition['title'],
                    $definition['slug'],
                    $this->desiredContent
                );
            } else {
                $pageId = $pageIds[0];
                $page = $this->store->find($pageId);
                if (null === $page) {
                    throw new RuntimeException(sprintf('Stránku %s se nepodařilo načíst.', $definition['title']));
                }
                if ($page->content() !== $this->desiredContent) {
                    $this->store->updateContent($pageId, $this->desiredContent);
                }
            }

            if ($language !== $this->store->language($pageId)) {
                $this->store->setLanguage($pageId, $language);
            }
            $translations[$language] = $pageId;
        }

        $this->store->setTranslations($translations);
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->pagesMatch()
            ? [PreflightCheck::pass('sponsors.saved', 'Stránky Sponzoři a Partners byly ověřeny.')]
            : [PreflightCheck::blocker('sponsors.content', 'Stránky Sponzoři a Partners neodpovídají migraci.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $invalidAttachments = [];
        foreach ($this->attachments as $attachmentId => $expectedFilename) {
            $actualFilename = $this->store->attachmentFilename($attachmentId);
            if (!$this->store->attachmentExists($attachmentId) || $expectedFilename !== $actualFilename) {
                $invalidAttachments[] = sprintf(
                    '%d (%s; nalezeno %s)',
                    $attachmentId,
                    $expectedFilename,
                    $actualFilename ?? 'nic'
                );
            }
        }
        if ([] !== $invalidAttachments) {
            $checks[] = PreflightCheck::blocker(
                'sponsors.attachments',
                sprintf('Loga v knihovně médií neodpovídají manifestu: %s.', implode(', ', $invalidAttachments))
            );
        }

        foreach (self::PAGES as $definition) {
            $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
            if (count($pageIds) > 1) {
                $checks[] = PreflightCheck::blocker(
                    'sponsors.duplicate',
                    sprintf('Slug %s používá více stránek: %s.', $definition['slug'], implode(', ', $pageIds))
                );
            } elseif (1 === count($pageIds) && null === $this->store->find($pageIds[0])) {
                $checks[] = PreflightCheck::blocker(
                    'sponsors.unpublished_slug',
                    sprintf(
                        'Slug %s už používá nepublikovaná stránka ID %d; nejprve ji publikujte, přejmenujte nebo odstraňte.',
                        $definition['slug'],
                        $pageIds[0]
                    )
                );
            }
        }

        return $checks;
    }

    private function pagesMatch(): bool
    {
        foreach (self::PAGES as $language => $definition) {
            $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
            if (1 !== count($pageIds)) {
                return false;
            }

            $page = $this->store->find($pageIds[0]);
            if (null === $page
                || $page->content() !== $this->desiredContent
                || $language !== $this->store->language($page->id())) {
                return false;
            }
        }

        return true;
    }
}
