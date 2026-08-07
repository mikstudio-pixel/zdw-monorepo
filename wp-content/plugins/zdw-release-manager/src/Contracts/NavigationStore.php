<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface NavigationStore
{
    public function isAvailable(): bool;

    public function rebuildTwoTierMenus(): void;

    public function ensureLegacySponsorItem(int $sponsorPageId): void;

    public function matchesDesiredNavigation(int $sponsorPageId): bool;
}
