<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class EnvironmentSnapshot
{
    /**
     * @param list<string> $installedThemes
     * @param list<string> $activePlugins
     * @param array<string, int> $pageSlugCounts
     * @param array<string, int> $menuNameCounts
     */
    public function __construct(
        public readonly string $phpVersion,
        public readonly string $wordpressVersion,
        public readonly string $activeTheme,
        public readonly array $installedThemes,
        public readonly array $activePlugins,
        public readonly array $pageSlugCounts,
        public readonly array $menuNameCounts
    ) {
    }

    public function withVersions(string $phpVersion, string $wordpressVersion): self
    {
        return new self(
            $phpVersion,
            $wordpressVersion,
            $this->activeTheme,
            $this->installedThemes,
            $this->activePlugins,
            $this->pageSlugCounts,
            $this->menuNameCounts
        );
    }
}
