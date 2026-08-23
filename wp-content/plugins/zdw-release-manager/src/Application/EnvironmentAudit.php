<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Application;

use ZDW\ReleaseManager\Domain\AuditRequirements;
use ZDW\ReleaseManager\Domain\EnvironmentSnapshot;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class EnvironmentAudit
{
    public function __construct(private readonly AuditRequirements $requirements)
    {
    }

    /** @return list<PreflightCheck> */
    public function inspect(EnvironmentSnapshot $snapshot): array
    {
        $checks = [];

        $checks[] = version_compare($snapshot->phpVersion, $this->requirements->minimumPhpVersion, '>=')
            ? PreflightCheck::pass('runtime.php', sprintf('PHP %s splňuje minimum.', $snapshot->phpVersion))
            : PreflightCheck::blocker(
                'runtime.php',
                sprintf('PHP %s je starší než požadované minimum %s.', $snapshot->phpVersion, $this->requirements->minimumPhpVersion)
            );

        $checks[] = version_compare($snapshot->wordpressVersion, $this->requirements->recommendedWordPressVersion, '>=')
            ? PreflightCheck::pass('runtime.wordpress', sprintf('WordPress %s je podporovaný.', $snapshot->wordpressVersion))
            : PreflightCheck::warning(
                'runtime.wordpress',
                sprintf('WordPress %s je starší než doporučená verze %s.', $snapshot->wordpressVersion, $this->requirements->recommendedWordPressVersion)
            );

        $checks[] = $snapshot->activeTheme === $this->requirements->expectedActiveTheme
            ? PreflightCheck::pass('theme.active', sprintf('Aktivní theme je %s.', $snapshot->activeTheme))
            : PreflightCheck::blocker(
                'theme.active',
                sprintf('Aktivní theme je %s; očekává se %s.', $snapshot->activeTheme, $this->requirements->expectedActiveTheme)
            );

        foreach ($this->requirements->requiredThemes as $theme) {
            $code = 'theme.' . $this->code($theme);
            $checks[] = in_array($theme, $snapshot->installedThemes, true)
                ? PreflightCheck::pass($code, sprintf('Theme %s je nainstalovaná.', $theme))
                : PreflightCheck::blocker($code, sprintf('Theme %s chybí.', $theme));
        }

        foreach ($this->requirements->requiredPlugins as $plugin) {
            $pluginFolder = dirname($plugin);
            $pluginCode = '.' === $pluginFolder ? pathinfo($plugin, PATHINFO_FILENAME) : $pluginFolder;
            $code = 'plugin.' . $this->code($pluginCode);
            $checks[] = in_array($plugin, $snapshot->activePlugins, true)
                ? PreflightCheck::pass($code, sprintf('Plugin %s je aktivní.', $plugin))
                : PreflightCheck::blocker($code, sprintf('Plugin %s není aktivní.', $plugin));
        }

        foreach ($this->requirements->requiredPageSlugs as $slug) {
            $count = $snapshot->pageSlugCounts[$slug] ?? 0;
            $code = 'page.' . $this->code($slug);
            $checks[] = 1 === $count
                ? PreflightCheck::pass($code, sprintf('Stránka %s byla jednoznačně nalezena.', $slug))
                : PreflightCheck::blocker(
                    $code,
                    0 === $count
                        ? sprintf('Stránka %s nebyla nalezena.', $slug)
                        : sprintf('Slug %s není jednoznačný; nalezeno: %d.', $slug, $count)
                );
        }

        foreach ($this->requirements->requiredMenuNames as $menuName) {
            $count = $snapshot->menuNameCounts[$menuName] ?? 0;
            $code = 'menu.' . $this->code($menuName);
            $checks[] = 1 === $count
                ? PreflightCheck::pass($code, sprintf('Menu %s bylo jednoznačně nalezeno.', $menuName))
                : PreflightCheck::blocker(
                    $code,
                    0 === $count
                        ? sprintf('Menu %s nebylo nalezeno.', $menuName)
                        : sprintf('Menu %s není jednoznačné; nalezeno: %d.', $menuName, $count)
                );
        }

        return $checks;
    }

    private function code(string $value): string
    {
        $code = strtolower($value);
        $code = preg_replace('/[^a-z0-9]+/', '_', $code) ?? '';

        return trim($code, '_');
    }
}
