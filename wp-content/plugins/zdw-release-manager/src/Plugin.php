<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager;

use ZDW\ReleaseManager\Application\EnvironmentAudit;
use ZDW\ReleaseManager\Application\MigrationRunner;
use ZDW\ReleaseManager\Domain\AuditRequirements;
use ZDW\ReleaseManager\Domain\MigrationRegistry;
use ZDW\ReleaseManager\Infrastructure\WordPress\AdminPage;
use ZDW\ReleaseManager\Infrastructure\WordPress\OptionStateStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressContactContentTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressEnvironmentCollector;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressIntroContentTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressNavigationStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressOptionStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPageStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;
use ZDW\ReleaseManager\Migrations\DesiredOptionsMigration;
use ZDW\ReleaseManager\Migrations\DesiredPostContentMigration;
use ZDW\ReleaseManager\Migrations\HomepageIntroMigration;
use ZDW\ReleaseManager\Migrations\InitialContactContent;
use ZDW\ReleaseManager\Migrations\InitialSponsorContent;
use ZDW\ReleaseManager\Migrations\NavigationMigration;
use ZDW\ReleaseManager\Migrations\SecondaryContactsMigration;
use ZDW\ReleaseManager\Migrations\SponsorPageMigration;

final class Plugin
{
    private static bool $booted = false;

    public static function boot(): void
    {
        if (self::$booted || !is_admin()) {
            return;
        }
        self::$booted = true;

        $requirements = new AuditRequirements(
            '8.2.0',
            '6.8.0',
            'zdw-theme-child',
            ['zdw-theme', 'zdw-theme-child'],
            [
                'polylang/polylang.php',
                'advanced-custom-fields-pro/acf.php',
                'zdw-functions/zdw-functions.php',
                'zdw-contacts-block/zdw-contacts-block.php',
                'zdw-intro-experiment/zdw-intro-experiment.php',
                'zdw-sponsors-block/zdw-sponsors-block.php',
                'zdw-two-tier-menu/zdw-two-tier-menu.php',
            ],
            ['kontakty'],
            ['Header Menu', 'Header Menu EN']
        );

        $audit = new EnvironmentAudit($requirements);
        $collector = new WordPressEnvironmentCollector(
            $requirements->requiredPageSlugs,
            $requirements->requiredMenuNames
        );
        $optionStore = new WordPressOptionStore();
        $postStore = new WordPressPostStore();
        $pageStore = new WordPressPageStore();
        $registry = new MigrationRegistry([
            new DesiredOptionsMigration(
                '20260807_001_interface_settings',
                'Nastavení úvodního bloku a víceúrovňového menu',
                $optionStore,
                [
                    'zdw_intro_effect_mode' => 'overlay',
                    'zdw_intro_effect_intensity' => '25',
                    'zdw_intro_overlay_color' => '#000000',
                    'zdw_intro_overlay_opacity' => '30',
                    'zdw_intro_overlay_blend_mode' => 'multiply',
                    'zdw_intro_plain_title' => '1',
                    'zdw_two_tier_menu_notice_enabled' => '1',
                    'zdw_two_tier_menu_notice_text_cs' => "SEE YOU IN MAY '27⭐",
                    'zdw_two_tier_menu_notice_text_en' => "SEE YOU IN MAY '27⭐",
                    'zdw_two_tier_menu_notice_url_cs' => '',
                    'zdw_two_tier_menu_notice_url_en' => '',
                ]
            ),
            new DesiredPostContentMigration(
                '20260807_002_primary_contacts',
                'Hlavní kontakty a kontakt Best in Design',
                $postStore,
                InitialContactContent::desiredPosts()
            ),
            new SecondaryContactsMigration(
                $postStore,
                new WordPressContactContentTransformer()
            ),
            new SponsorPageMigration(
                $pageStore,
                InitialSponsorContent::attachments(),
                InitialSponsorContent::block()
            ),
            new NavigationMigration(
                $pageStore,
                new WordPressNavigationStore()
            ),
            new HomepageIntroMigration(
                $postStore,
                new WordPressMediaStore(),
                new WordPressIntroContentTransformer()
            ),
        ]);
        $runner = new MigrationRunner($registry, new OptionStateStore());
        $adminPage = new AdminPage($audit, $collector, $runner);

        add_action('admin_menu', [$adminPage, 'register'], 20);
    }
}
