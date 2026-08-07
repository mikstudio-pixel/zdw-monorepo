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
    public int $legacySponsorPageId = 0;
    public bool $enabled = false;

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

    public function rebuildTwoTierMenus(): void
    {
        ++$this->rebuilds;
    }

    public function ensureLegacySponsorItem(int $sponsorPageId): void
    {
        $this->legacySponsorPageId = $sponsorPageId;
    }

    public function enableTwoTierNavigation(): void
    {
        $this->enabled = true;
        $this->matching = true;
    }

    public function matchesDesiredNavigation(int $sponsorPageId): bool
    {
        return $this->enabled && $this->matching && $this->legacySponsorPageId === $sponsorPageId;
    }
}
