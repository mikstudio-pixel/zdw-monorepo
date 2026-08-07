<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\NavigationStore;
use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class NavigationMigration implements Migration
{
    /** @var array<string, int>|null */
    private ?array $publishedSponsorPageIds = null;

    public function __construct(
        private readonly PageStore $pages,
        private readonly NavigationStore $navigation
    ) {
    }

    public function id(): string
    {
        return '20260808_005_navigation';
    }

    public function label(): string
    {
        return 'Víceúrovňová navigace a odkaz na Sponzory';
    }

    public function preflight(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        $sponsorPageIds = $this->sponsorPageIds();

        return $this->navigation->matchesDesiredNavigation($sponsorPageIds)
            ? [PreflightCheck::pass('navigation.ready', 'Navigace už odpovídá této verzi.')]
            : [PreflightCheck::warning('navigation.changes', 'Budou obnoveny čtyři víceúrovňová menu a odkaz na Sponzory v legacy menu.')];
    }

    public function apply(): void
    {
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně migrovat navigaci.');
        }

        $sponsorPageIds = $this->sponsorPageIds();
        if ($this->navigation->matchesDesiredNavigation($sponsorPageIds)) {
            return;
        }

        $this->navigation->rebuildTwoTierMenus();
        $this->navigation->ensureLegacySponsorItem($sponsorPageIds);
        $this->navigation->enableTwoTierNavigation();
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->navigation->matchesDesiredNavigation($this->sponsorPageIds())
            ? [PreflightCheck::pass('navigation.saved', 'Navigace byla ověřena.')]
            : [PreflightCheck::blocker('navigation.mismatch', 'Navigace po migraci neodpovídá manifestu.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $pageIds = $this->publishedSponsorPageIds();
        if (2 !== count($pageIds)) {
            $checks[] = PreflightCheck::blocker(
                'navigation.sponsor_page',
                'Navigace vyžaduje právě jednu publikovanou stránku pro slugy sponzori a partners.'
            );
        }
        if (!$this->navigation->isAvailable()) {
            $checks[] = PreflightCheck::blocker(
                'navigation.api',
                'API pluginu ZDW Multi-level Header není dostupné.'
            );
        } else {
            if (!$this->navigation->blueprintsResolvable()) {
                $checks[] = PreflightCheck::blocker(
                    'navigation.targets',
                    'Některé cílové stránky víceúrovňové navigace neexistují nebo nejsou publikované.'
                );
            }
            if (!$this->navigation->legacyParentsResolvable()) {
                $checks[] = PreflightCheck::blocker(
                    'navigation.legacy_parents',
                    'V původních menu chybí očekávané nadřazené položky sekce Festival.'
                );
            }
        }

        return $checks;
    }

    /** @return array<string, int> */
    private function sponsorPageIds(): array
    {
        $pageIds = $this->publishedSponsorPageIds();
        if (2 !== count($pageIds)) {
            throw new RuntimeException('Stránky partnerů nelze jednoznačně určit.');
        }

        return $pageIds;
    }

    /** @return array<string, int> */
    private function publishedSponsorPageIds(): array
    {
        if (null !== $this->publishedSponsorPageIds) {
            return $this->publishedSponsorPageIds;
        }

        $this->publishedSponsorPageIds = [];
        foreach (['cs' => 'sponzori', 'en' => 'partners'] as $language => $slug) {
            $pageIds = array_values(array_filter(
                $this->pages->findPageIdsBySlug($slug),
                fn (int $pageId): bool => null !== $this->pages->find($pageId)
            ));
            if (1 === count($pageIds)) {
                $this->publishedSponsorPageIds[$language] = $pageIds[0];
            }
        }

        return $this->publishedSponsorPageIds;
    }
}
