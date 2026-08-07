<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class AuditRequirements
{
    /**
     * @param list<string> $requiredThemes
     * @param list<string> $requiredPlugins
     * @param list<string> $requiredPageSlugs
     * @param list<string> $requiredMenuNames
     */
    public function __construct(
        public readonly string $minimumPhpVersion,
        public readonly string $recommendedWordPressVersion,
        public readonly string $expectedActiveTheme,
        public readonly array $requiredThemes,
        public readonly array $requiredPlugins,
        public readonly array $requiredPageSlugs,
        public readonly array $requiredMenuNames
    ) {
    }
}
