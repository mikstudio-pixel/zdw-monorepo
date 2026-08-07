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
            && function_exists('zdw_two_tier_menu_install_menus');
    }

    public function blueprintsResolvable(): bool
    {
        return $this->isAvailable() && zdw_two_tier_menu_blueprints_resolvable();
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
        if (!$this->isAvailable()) {
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
        if (!$menu) {
            return false;
        }

        $actual = array_values((array) wp_get_nav_menu_items((int) $menu->term_id));
        $expected = $this->flattenBlueprint($blueprint);
        if (count($actual) !== count($expected)) {
            return false;
        }

        $actualIdsByPath = [];
        foreach ($expected as $index => $item) {
            $actualItem = $actual[$index];
            $expectedParentId = '' === $item['parentPath']
                ? 0
                : ($actualIdsByPath[$item['parentPath']] ?? -1);
            if ((string) $actualItem->title !== $item['title']
                || (int) $actualItem->menu_item_parent !== $expectedParentId
                || !$this->targetMatches($actualItem, $item['definition'])) {
                return false;
            }
            $actualIdsByPath[$item['path']] = (int) $actualItem->ID;
        }

        return true;
    }

    /** @param list<array<string, mixed>> $items
     *  @return list<array{path: string, parentPath: string, title: string, definition: array<string, mixed>}>
     */
    private function flattenBlueprint(array $items, string $parentPath = ''): array
    {
        $flat = [];
        foreach ($items as $index => $item) {
            $path = '' === $parentPath ? (string) $index : $parentPath . '.' . $index;
            $flat[] = [
                'path' => $path,
                'parentPath' => $parentPath,
                'title' => (string) $item['title'],
                'definition' => $item,
            ];
            if (!empty($item['children']) && is_array($item['children'])) {
                $flat = array_merge($flat, $this->flattenBlueprint($item['children'], $path));
            }
        }

        return $flat;
    }

    /** @param object $actual
     *  @param array<string, mixed> $definition
     */
    private function targetMatches(object $actual, array $definition): bool
    {
        if (isset($definition['page']) || isset($definition['slug'])) {
            $pageId = isset($definition['page'])
                ? (int) $definition['page']
                : $this->pageIdBySlug((string) $definition['slug']);

            return $pageId > 0
                && 'post_type' === (string) $actual->type
                && 'page' === (string) $actual->object
                && $pageId === (int) $actual->object_id;
        }

        if (!isset($definition['path'])) {
            return false;
        }

        $expectedUrl = home_url((string) $definition['path']);

        return 'custom' === (string) $actual->type
            && untrailingslashit((string) $actual->url) === untrailingslashit($expectedUrl);
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
