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
    public function __construct(
        private readonly PageStore $pages,
        private readonly NavigationStore $navigation
    ) {
    }

    public function id(): string
    {
        return '20260807_005_navigation';
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

        $sponsorPageId = $this->sponsorPageId();

        return $this->navigation->matchesDesiredNavigation($sponsorPageId)
            ? [PreflightCheck::pass('navigation.ready', 'Navigace už odpovídá této verzi.')]
            : [PreflightCheck::warning('navigation.changes', 'Budou obnoveny čtyři víceúrovňová menu a odkaz na Sponzory v legacy menu.')];
    }

    public function apply(): void
    {
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně migrovat navigaci.');
        }

        $sponsorPageId = $this->sponsorPageId();
        if ($this->navigation->matchesDesiredNavigation($sponsorPageId)) {
            return;
        }

        $this->navigation->rebuildTwoTierMenus();
        $this->navigation->ensureLegacySponsorItem($sponsorPageId);
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->navigation->matchesDesiredNavigation($this->sponsorPageId())
            ? [PreflightCheck::pass('navigation.saved', 'Navigace byla ověřena.')]
            : [PreflightCheck::blocker('navigation.mismatch', 'Navigace po migraci neodpovídá manifestu.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $pageIds = $this->pages->findPageIdsBySlug('sponzori');
        if (1 !== count($pageIds)) {
            $checks[] = PreflightCheck::blocker(
                'navigation.sponsor_page',
                'Navigace vyžaduje právě jednu publikovanou stránku se slugem sponzori.'
            );
        }
        if (!$this->navigation->isAvailable()) {
            $checks[] = PreflightCheck::blocker(
                'navigation.api',
                'API pluginu ZDW Multi-level Header není dostupné.'
            );
        }

        return $checks;
    }

    private function sponsorPageId(): int
    {
        $pageIds = $this->pages->findPageIdsBySlug('sponzori');
        if (1 !== count($pageIds)) {
            throw new RuntimeException('Stránku Sponzoři nelze jednoznačně určit.');
        }

        return $pageIds[0];
    }
}
