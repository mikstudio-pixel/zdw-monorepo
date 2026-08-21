<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\NavigationStore;

final class FakeNavigationStore implements NavigationStore
{
    public bool $available = true;
    public bool $blueprintsResolvable = true;
    public bool $legacyParentsResolvable = true;
    public bool $matching = false;
    public int $rebuilds = 0;
    /** @var array<string, int> */
    public array $legacySponsorPageIds = [];
    public bool $enabled = false;
    public bool $throwDuringAtomicAfterLegacy = false;

    public function isAvailable(): bool
    {
        return $this->available;
    }

    public function blueprintsResolvable(): bool
    {
        return $this->blueprintsResolvable;
    }

    public function legacyParentsResolvable(): bool
    {
        return $this->legacyParentsResolvable;
    }

    public function applyDesiredNavigation(array $sponsorPageIds): void
    {
        $originalLegacySponsorPageIds = $this->legacySponsorPageIds;
        $originalEnabled = $this->enabled;
        $originalMatching = $this->matching;

        try {
            $this->rebuildTwoTierMenus();
            $this->ensureLegacySponsorItem($sponsorPageIds);
            if ($this->throwDuringAtomicAfterLegacy) {
                throw new \RuntimeException('Navigation activation failed.');
            }
            $this->enableTwoTierNavigation();
        } catch (\Throwable $error) {
            $this->legacySponsorPageIds = $originalLegacySponsorPageIds;
            $this->enabled = $originalEnabled;
            $this->matching = $originalMatching;
            throw $error;
        }
    }

    public function rebuildTwoTierMenus(): void
    {
        ++$this->rebuilds;
    }

    public function ensureLegacySponsorItem(array $sponsorPageIds): void
    {
        $this->legacySponsorPageIds = $sponsorPageIds;
    }

    public function enableTwoTierNavigation(): void
    {
        $this->enabled = true;
        $this->matching = true;
    }

    public function matchesDesiredNavigation(array $sponsorPageIds): bool
    {
        return $this->enabled && $this->matching && $this->legacySponsorPageIds === $sponsorPageIds;
    }
}
