<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use ZDW\ReleaseManager\Domain\EnvironmentSnapshot;

final class WordPressEnvironmentCollector
{
    /**
     * @param list<string> $pageSlugs
     * @param list<string> $menuNames
     */
    public function __construct(
        private readonly array $pageSlugs,
        private readonly array $menuNames
    ) {
    }

    public function collect(): EnvironmentSnapshot
    {
        global $wp_version;

        $themes = array_keys(wp_get_themes());
        $plugins = (array) get_option('active_plugins', []);

        if (is_multisite()) {
            $plugins = array_merge($plugins, array_keys((array) get_site_option('active_sitewide_plugins', [])));
        }

        $pageCounts = array_fill_keys($this->pageSlugs, 0);
        if ($this->pageSlugs !== []) {
            $pages = get_posts([
                'post_type' => 'page',
                'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
                'posts_per_page' => -1,
                'post_name__in' => $this->pageSlugs,
                'orderby' => 'none',
                'suppress_filters' => true,
            ]);

            foreach ($pages as $page) {
                if (isset($pageCounts[$page->post_name])) {
                    ++$pageCounts[$page->post_name];
                }
            }
        }

        $menuCounts = array_fill_keys($this->menuNames, 0);
        foreach (wp_get_nav_menus() as $menu) {
            if (isset($menuCounts[$menu->name])) {
                ++$menuCounts[$menu->name];
            }
        }

        return new EnvironmentSnapshot(
            PHP_VERSION,
            (string) $wp_version,
            get_stylesheet(),
            array_values(array_unique($themes)),
            array_values(array_unique($plugins)),
            $pageCounts,
            $menuCounts
        );
    }
}
