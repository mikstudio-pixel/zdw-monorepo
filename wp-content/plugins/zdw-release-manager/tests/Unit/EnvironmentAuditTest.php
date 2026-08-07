<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Application\EnvironmentAudit;
use ZDW\ReleaseManager\Domain\AuditRequirements;
use ZDW\ReleaseManager\Domain\EnvironmentSnapshot;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class EnvironmentAuditTest extends TestCase
{
    public function test_a_matching_environment_passes_without_blockers(): void
    {
        $checks = $this->audit()->inspect($this->matchingSnapshot());

        self::assertNotEmpty($checks);
        self::assertFalse($this->containsSeverity($checks, PreflightCheck::BLOCKER));
        self::assertSame(PreflightCheck::PASS, $this->find($checks, 'page.kontakty')->severity());
        self::assertSame(PreflightCheck::PASS, $this->find($checks, 'menu.header_menu')->severity());
    }

    public function test_missing_dependencies_and_ambiguous_content_are_blockers(): void
    {
        $snapshot = new EnvironmentSnapshot(
            phpVersion: '8.3.0',
            wordpressVersion: '6.8.6',
            activeTheme: 'zdw-theme',
            installedThemes: ['zdw-theme'],
            activePlugins: ['polylang/polylang.php'],
            pageSlugCounts: ['kontakty' => 2],
            menuNameCounts: []
        );

        $checks = $this->audit()->inspect($snapshot);

        self::assertSame(PreflightCheck::BLOCKER, $this->find($checks, 'theme.zdw_theme_child')->severity());
        self::assertSame(PreflightCheck::BLOCKER, $this->find($checks, 'plugin.advanced_custom_fields_pro')->severity());
        self::assertSame(PreflightCheck::BLOCKER, $this->find($checks, 'page.kontakty')->severity());
        self::assertSame(PreflightCheck::BLOCKER, $this->find($checks, 'menu.header_menu')->severity());
        self::assertSame(PreflightCheck::WARNING, $this->find($checks, 'theme.active')->severity());
    }

    public function test_unsupported_php_is_a_blocker_but_older_wordpress_is_a_warning(): void
    {
        $snapshot = $this->matchingSnapshot()->withVersions('8.0.30', '6.7.2');

        $checks = $this->audit()->inspect($snapshot);

        self::assertSame(PreflightCheck::BLOCKER, $this->find($checks, 'runtime.php')->severity());
        self::assertSame(PreflightCheck::WARNING, $this->find($checks, 'runtime.wordpress')->severity());
    }

    private function audit(): EnvironmentAudit
    {
        return new EnvironmentAudit(new AuditRequirements(
            minimumPhpVersion: '8.1.0',
            recommendedWordPressVersion: '6.8.0',
            expectedActiveTheme: 'zdw-theme-child',
            requiredThemes: ['zdw-theme', 'zdw-theme-child'],
            requiredPlugins: [
                'polylang/polylang.php',
                'advanced-custom-fields-pro/acf.php',
                'zdw-functions/zdw-functions.php',
            ],
            requiredPageSlugs: ['kontakty', 'sponzori'],
            requiredMenuNames: ['Header Menu']
        ));
    }

    private function matchingSnapshot(): EnvironmentSnapshot
    {
        return new EnvironmentSnapshot(
            phpVersion: '8.3.0',
            wordpressVersion: '6.8.6',
            activeTheme: 'zdw-theme-child',
            installedThemes: ['zdw-theme', 'zdw-theme-child'],
            activePlugins: [
                'polylang/polylang.php',
                'advanced-custom-fields-pro/acf.php',
                'zdw-functions/zdw-functions.php',
            ],
            pageSlugCounts: ['kontakty' => 1, 'sponzori' => 1],
            menuNameCounts: ['Header Menu' => 1]
        );
    }

    /** @param list<PreflightCheck> $checks */
    private function containsSeverity(array $checks, string $severity): bool
    {
        foreach ($checks as $check) {
            if ($check->severity() === $severity) {
                return true;
            }
        }

        return false;
    }

    /** @param list<PreflightCheck> $checks */
    private function find(array $checks, string $code): PreflightCheck
    {
        foreach ($checks as $check) {
            if ($check->code() === $code) {
                return $check;
            }
        }

        self::fail(sprintf('Check %s was not found.', $code));
    }
}
