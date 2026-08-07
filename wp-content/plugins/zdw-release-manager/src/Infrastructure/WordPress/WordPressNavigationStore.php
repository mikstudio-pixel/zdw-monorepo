<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use WP_Post;
use ZDW\ReleaseManager\Contracts\NavigationStore;

final class WordPressNavigationStore implements NavigationStore
{
    public function isAvailable(): bool
    {
        return function_exists('zdw_two_tier_menu_names')
            && function_exists('zdw_two_tier_menu_blueprints')
            && function_exists('zdw_two_tier_menu_blueprints_resolvable')
            && function_exists('zdw_two_tier_menu_menu_matches_blueprint')
            && function_exists('zdw_two_tier_menu_install_menus');
    }

    public function blueprintsResolvable(): bool
    {
        return $this->isAvailable() && zdw_two_tier_menu_blueprints_resolvable();
    }

    public function legacyParentsResolvable(): bool
    {
        foreach ($this->legacyMenus() as $definition) {
            $menu = wp_get_nav_menu_object($definition['menu']);
            $parentPageId = $this->pageIdBySlug($definition['parentSlug']);
            if (!$menu || 0 === $parentPageId) {
                return false;
            }

            $found = false;
            foreach ((array) wp_get_nav_menu_items((int) $menu->term_id) as $item) {
                if ('page' === $item->object
                    && $parentPageId === (int) $item->object_id
                    && 0 === (int) $item->menu_item_parent) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                return false;
            }
        }

        return true;
    }

    public function rebuildTwoTierMenus(): void
    {
        if (!$this->isAvailable()) {
            throw new RuntimeException('API pluginu ZDW Multi-level Header není dostupné.');
        }

        if (!$this->blueprintsResolvable() || !zdw_two_tier_menu_install_menus(true)) {
            throw new RuntimeException('Cíle víceúrovňové navigace nelze bezpečně sestavit.');
        }
    }

    public function ensureLegacySponsorItem(int $sponsorPageId): void
    {
        foreach ($this->legacyMenus() as $definition) {
            $this->ensureLegacyMenuItem(
                $definition['menu'],
                $definition['parentSlug'],
                $definition['title'],
                $sponsorPageId
            );
        }
    }

    public function enableTwoTierNavigation(): void
    {
        if (!update_option('zdw_two_tier_menu_enabled', '1')) {
            $stored = get_option('zdw_two_tier_menu_enabled', null);
            if ('1' !== (string) $stored) {
                throw new RuntimeException('Víceúrovňovou navigaci se nepodařilo zapnout.');
            }
        }

        if (defined('ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL')) {
            delete_option(ZDW_TWO_TIER_MENU_OPTION_ENABLE_AFTER_INSTALL);
        }
        if (defined('ZDW_TWO_TIER_MENU_OPTION_DB_VERSION') && defined('ZDW_TWO_TIER_MENU_DB_VERSION')) {
            update_option(ZDW_TWO_TIER_MENU_OPTION_DB_VERSION, ZDW_TWO_TIER_MENU_DB_VERSION);
        }
    }

    private function ensureLegacyMenuItem(
        string $menuName,
        string $parentSlug,
        string $title,
        int $sponsorPageId
    ): void {
        $menu = wp_get_nav_menu_object($menuName);
        if (!$menu) {
            throw new RuntimeException(sprintf('Menu %s nebylo nalezeno.', $menuName));
        }

        $parentPageId = $this->pageIdBySlug($parentSlug);
        $items = (array) wp_get_nav_menu_items((int) $menu->term_id);
        $festivalParentId = 0;
        $sponsorItemId = 0;
        foreach ($items as $item) {
            if ('page' === $item->object && $parentPageId === (int) $item->object_id && 0 === (int) $item->menu_item_parent) {
                $festivalParentId = (int) $item->ID;
            }
            if ('page' === $item->object && $sponsorPageId === (int) $item->object_id) {
                $sponsorItemId = (int) $item->ID;
            }
        }

        if (0 === $festivalParentId) {
            throw new RuntimeException(sprintf('V menu %s chybí nadřazená festivalová položka.', $menuName));
        }

        $result = wp_update_nav_menu_item(
            (int) $menu->term_id,
            $sponsorItemId,
            [
                'menu-item-title' => $title,
                'menu-item-parent-id' => $festivalParentId,
                'menu-item-object' => 'page',
                'menu-item-object-id' => $sponsorPageId,
                'menu-item-type' => 'post_type',
                'menu-item-status' => 'publish',
            ]
        );

        if (is_wp_error($result)) {
            throw new RuntimeException($result->get_error_message());
        }
    }

    public function matchesDesiredNavigation(int $sponsorPageId): bool
    {
        if (!$this->isAvailable() || '1' !== (string) get_option('zdw_two_tier_menu_enabled', '0')) {
            return false;
        }

        foreach ($this->legacyMenus() as $definition) {
            if (!$this->legacySponsorItemMatches(
                $definition['menu'],
                $definition['parentSlug'],
                $definition['title'],
                $sponsorPageId
            )) {
                return false;
            }
        }

        $names = zdw_two_tier_menu_names();
        $blueprints = zdw_two_tier_menu_blueprints();
        foreach ($names as $row => $languages) {
            foreach ($languages as $language => $name) {
                if (!isset($blueprints[$row][$language])
                    || !is_array($blueprints[$row][$language])
                    || !$this->menuMatchesBlueprint((string) $name, $blueprints[$row][$language])) {
                    return false;
                }
            }
        }

        return true;
    }

    private function legacySponsorItemMatches(
        string $menuName,
        string $parentSlug,
        string $title,
        int $sponsorPageId
    ): bool
    {
        $menu = wp_get_nav_menu_object($menuName);
        if (!$menu) {
            return false;
        }

        $items = (array) wp_get_nav_menu_items((int) $menu->term_id);
        $byId = [];
        foreach ($items as $item) {
            $byId[(int) $item->ID] = $item;
        }
        foreach ($items as $item) {
            if ('page' !== $item->object || $sponsorPageId !== (int) $item->object_id) {
                continue;
            }

            $parent = $byId[(int) $item->menu_item_parent] ?? null;

            return (string) $item->title === $title
                && null !== $parent
                && 'page' === $parent->object
                && $this->pageIdBySlug($parentSlug) === (int) $parent->object_id;
        }

        return false;
    }

    /** @param list<array<string, mixed>> $blueprint */
    private function menuMatchesBlueprint(string $menuName, array $blueprint): bool
    {
        $menu = wp_get_nav_menu_object($menuName);
        return $menu
            && zdw_two_tier_menu_menu_matches_blueprint((int) $menu->term_id, $blueprint);
    }

    private function pageIdBySlug(string $slug): int
    {
        $page = get_page_by_path($slug, OBJECT, 'page');

        return $page instanceof WP_Post ? (int) $page->ID : 0;
    }

    /** @return list<array{menu: string, parentSlug: string, title: string}> */
    private function legacyMenus(): array
    {
        return [
            ['menu' => 'Header Menu', 'parentSlug' => 'o-festivalu', 'title' => 'Sponzoři'],
            ['menu' => 'Header Menu EN', 'parentSlug' => 'about-the-festival-2', 'title' => 'Partners'],
        ];
    }
}
