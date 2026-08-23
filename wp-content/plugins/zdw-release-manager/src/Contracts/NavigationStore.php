<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface NavigationStore
{
    public function isAvailable(): bool;

    public function blueprintsResolvable(): bool;

    public function legacyParentsResolvable(): bool;

    /** @param array<string, int> $sponsorPageIds */
    public function applyDesiredNavigation(array $sponsorPageIds): void;

    public function rebuildTwoTierMenus(): void;

    /** @param array<string, int> $sponsorPageIds */
    public function ensureLegacySponsorItem(array $sponsorPageIds): void;

    public function enableTwoTierNavigation(): void;

    /** @param array<string, int> $sponsorPageIds */
    public function matchesDesiredNavigation(array $sponsorPageIds): bool;
}
