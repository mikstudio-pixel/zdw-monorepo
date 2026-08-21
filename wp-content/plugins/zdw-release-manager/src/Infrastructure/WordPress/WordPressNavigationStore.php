<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use RuntimeException;
use Throwable;
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
            && function_exists('zdw_two_tier_menu_enable_completed_install')
            && function_exists('zdw_two_tier_menu_complete_install_state_unlocked')
            && function_exists('zdw_two_tier_menu_install_menus')
            && function_exists('zdw_two_tier_menu_install_menus_unlocked')
            && function_exists('zdw_two_tier_menu_snapshot_items')
            && function_exists('zdw_two_tier_menu_restore_items')
            && function_exists('zdw_two_tier_menu_acquire_install_lock')
            && function_exists('zdw_two_tier_menu_renew_install_lock')
            && function_exists('zdw_two_tier_menu_release_install_lock')
            && function_exists('zdw_two_tier_menu_acquire_state_lock')
            && function_exists('zdw_two_tier_menu_renew_state_lock')
            && function_exists('zdw_two_tier_menu_release_state_lock')
            && function_exists('zdw_two_tier_menu_record_install_failure_unlocked')
            && defined('ZDW_TWO_TIER_MENU_DB_VERSION');
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

    public function applyDesiredNavigation(array $sponsorPageIds): void
    {
        if (!$this->isAvailable()) {
            throw new RuntimeException('API pluginu ZDW Multi-level Header není dostupné.');
        }

        $installLock = zdw_two_tier_menu_acquire_install_lock();
        if (!is_string($installLock)) {
            throw new RuntimeException('Instalaci menu právě provádí jiný požadavek; zkuste migraci znovu.');
        }
        $stateLock = zdw_two_tier_menu_acquire_state_lock(true);
        if (!is_string($stateLock)) {
            zdw_two_tier_menu_release_install_lock($installLock);
            throw new RuntimeException('Navigaci právě upravuje jiný požadavek; zkuste migraci znovu.');
        }

        $snapshot = null;
        try {
            $heartbeat = function () use ($installLock, $stateLock): void {
                $this->assertNavigationLocks($installLock, $stateLock);
            };
            $snapshot = $this->navigationSnapshot($heartbeat);
            if (!zdw_two_tier_menu_install_menus_unlocked(true, true, $heartbeat)) {
                throw new RuntimeException('Cíle víceúrovňové navigace nelze bezpečně sestavit.');
            }
            $this->assertNavigationLocks($installLock, $stateLock);
            $this->ensureLegacySponsorItem($sponsorPageIds);
            $this->assertNavigationLocks($installLock, $stateLock);
            if (!zdw_two_tier_menu_complete_install_state_unlocked(true)) {
                throw new RuntimeException('Víceúrovňovou navigaci se nepodařilo bezpečně zapnout.');
            }
        } catch (Throwable $error) {
            if (null !== $snapshot) {
                try {
                    $this->assertNavigationLocks($installLock, $stateLock);
                    if (!$this->restoreNavigationSnapshot($snapshot, $installLock, $stateLock)) {
                        $this->assertNavigationLocks($installLock, $stateLock);
                        zdw_two_tier_menu_record_install_failure_unlocked();
                        throw new RuntimeException('Obnova původní navigace selhala; hlavička zůstala bezpečně v legacy režimu.');
                    }
                } catch (Throwable $rollbackError) {
                    throw new RuntimeException(
                        sprintf('%s Obnova navigace nebyla dokončena: %s', $error->getMessage(), $rollbackError->getMessage()),
                        0,
                        $error
                    );
                }
            }

            throw $error;
        } finally {
            zdw_two_tier_menu_release_state_lock($stateLock);
            zdw_two_tier_menu_release_install_lock($installLock);
        }
    }

    public function rebuildTwoTierMenus(): void
    {
        if (!$this->isAvailable()) {
            throw new RuntimeException('API pluginu ZDW Multi-level Header není dostupné.');
        }

        if (!$this->blueprintsResolvable()) {
            throw new RuntimeException('Cíle víceúrovňové navigace nelze bezpečně sestavit.');
        }

        $installed = zdw_two_tier_menu_install_menus(true);
        if (null === $installed) {
            throw new RuntimeException('Instalaci menu právě provádí jiný požadavek; zkuste migraci znovu.');
        }
        if (!$installed) {
            throw new RuntimeException('Cíle víceúrovňové navigace nelze bezpečně sestavit.');
        }
    }

    public function ensureLegacySponsorItem(array $sponsorPageIds): void
    {
        foreach ($this->legacyMenus() as $definition) {
            $sponsorPageId = $sponsorPageIds[$definition['language']] ?? 0;
            if (0 === $sponsorPageId) {
                throw new RuntimeException(sprintf('Chybí stránka partnerů pro jazyk %s.', $definition['language']));
            }
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
        if (!zdw_two_tier_menu_enable_completed_install()) {
            throw new RuntimeException('Víceúrovňovou navigaci se nepodařilo bezpečně zapnout.');
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
        $sponsorItemIds = [];
        foreach ($items as $item) {
            if ('page' === $item->object && $parentPageId === (int) $item->object_id && 0 === (int) $item->menu_item_parent) {
                $festivalParentId = (int) $item->ID;
            }
            if ('page' === $item->object && $sponsorPageId === (int) $item->object_id) {
                $sponsorItemIds[] = (int) $item->ID;
            }
        }

        if (0 === $festivalParentId) {
            throw new RuntimeException(sprintf('V menu %s chybí nadřazená festivalová položka.', $menuName));
        }

        $sponsorItemId = $sponsorItemIds[0] ?? 0;
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

        foreach (array_slice($sponsorItemIds, 1) as $duplicateItemId) {
            foreach ($items as $item) {
                if ($duplicateItemId !== (int) $item->menu_item_parent) {
                    continue;
                }

                update_post_meta((int) $item->ID, '_menu_item_menu_item_parent', $sponsorItemId);
                if ($sponsorItemId !== (int) get_post_meta((int) $item->ID, '_menu_item_menu_item_parent', true)) {
                    throw new RuntimeException(sprintf('Položku menu ID %d se nepodařilo bezpečně přesunout.', $item->ID));
                }
            }
            if (!wp_delete_post($duplicateItemId, true)) {
                throw new RuntimeException(sprintf('Duplicitní položku menu ID %d se nepodařilo odstranit.', $duplicateItemId));
            }
        }
    }

    public function matchesDesiredNavigation(array $sponsorPageIds): bool
    {
        if (!$this->isAvailable()
            || ZDW_TWO_TIER_MENU_DB_VERSION !== get_option('zdw_two_tier_menu_db_version')
            || '1' !== (string) get_option('zdw_two_tier_menu_enabled', '0')) {
            return false;
        }

        foreach ($this->legacyMenus() as $definition) {
            $sponsorPageId = $sponsorPageIds[$definition['language']] ?? 0;
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
        $matches = [];
        foreach ($items as $item) {
            if ('page' !== $item->object || $sponsorPageId !== (int) $item->object_id) {
                continue;
            }

            $matches[] = $item;
        }
        if (1 !== count($matches)) {
            return false;
        }

        $item = $matches[0];
        $parent = $byId[(int) $item->menu_item_parent] ?? null;

        return (string) $item->title === $title
            && null !== $parent
            && 'page' === $parent->object
            && 0 === (int) $parent->menu_item_parent
            && $this->pageIdBySlug($parentSlug) === (int) $parent->object_id;
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

    /** @return array{menus: array<string, array{id: ?int, items: array<int, array<string, mixed>>}>, options: array<string, array{exists: bool, value: mixed}>} */
    private function navigationSnapshot(callable $heartbeat): array
    {
        $names = [];
        foreach (zdw_two_tier_menu_names() as $languages) {
            foreach ($languages as $name) {
                $names[] = (string) $name;
            }
        }
        foreach ($this->legacyMenus() as $definition) {
            $names[] = $definition['menu'];
        }

        $menus = [];
        foreach (array_unique($names) as $name) {
            $heartbeat();
            $menu = wp_get_nav_menu_object($name);
            $menuId = $menu ? (int) $menu->term_id : null;
            $menus[$name] = [
                'id' => $menuId,
                'items' => null === $menuId ? [] : zdw_two_tier_menu_snapshot_items($menuId, $heartbeat),
            ];
        }

        $options = [];
        foreach ([
            'zdw_two_tier_menu_enabled',
            'zdw_two_tier_menu_enable_after_install',
            'zdw_two_tier_menu_db_version',
        ] as $option) {
            $exists = zdw_two_tier_menu_option_exists($option);
            $options[$option] = [
                'exists' => $exists,
                'value' => $exists ? get_option($option) : null,
            ];
        }

        return ['menus' => $menus, 'options' => $options];
    }

    /** @param array{menus: array<string, array{id: ?int, items: array<int, array<string, mixed>>}>, options: array<string, array{exists: bool, value: mixed}>} $snapshot */
    private function restoreNavigationSnapshot(array $snapshot, string $installLock, string $stateLock): bool
    {
        $success = true;
        foreach ($snapshot['menus'] as $name => $menuSnapshot) {
            $this->assertNavigationLocks($installLock, $stateLock);
            $current = wp_get_nav_menu_object($name);
            if (null === $menuSnapshot['id']) {
                if ($current) {
                    $deleted = wp_delete_nav_menu((int) $current->term_id);
                    $success = !is_wp_error($deleted) && (bool) $deleted && $success;
                }
                continue;
            }

            if (!$current || (int) $current->term_id !== $menuSnapshot['id']) {
                $success = false;
                continue;
            }
            $heartbeat = function () use ($installLock, $stateLock): void {
                $this->assertNavigationLocks($installLock, $stateLock);
            };
            $success = zdw_two_tier_menu_restore_items(
                $menuSnapshot['id'],
                $menuSnapshot['items'],
                $heartbeat
            ) && $success;
        }

        if (!$success) {
            return false;
        }
        $this->assertNavigationLocks($installLock, $stateLock);
        foreach ($snapshot['options'] as $option => $optionSnapshot) {
            $this->assertNavigationLocks($installLock, $stateLock);
            if ($optionSnapshot['exists']) {
                update_option($option, $optionSnapshot['value']);
                $success = $optionSnapshot['value'] === get_option($option, null) && $success;
            } else {
                delete_option($option);
                $missing = new \stdClass();
                $success = $missing === get_option($option, $missing) && $success;
            }
        }

        return $success;
    }

    private function assertNavigationLocks(string $installLock, string $stateLock): void
    {
        if (!zdw_two_tier_menu_renew_install_lock($installLock)
            || !zdw_two_tier_menu_renew_state_lock($stateLock)) {
            throw new RuntimeException('Zámek navigace vypršel; novější stav nebude přepsán.');
        }
    }

    /** @return list<array{language: string, menu: string, parentSlug: string, title: string}> */
    private function legacyMenus(): array
    {
        return [
            ['language' => 'cs', 'menu' => 'Header Menu', 'parentSlug' => 'o-festivalu', 'title' => 'Sponzoři'],
            ['language' => 'en', 'menu' => 'Header Menu EN', 'parentSlug' => 'about-the-festival-2', 'title' => 'Partners'],
        ];
    }
}
