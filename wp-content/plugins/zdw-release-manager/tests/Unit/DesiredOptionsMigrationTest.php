<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Migrations\DesiredOptionsMigration;
use ZDW\ReleaseManager\Tests\Support\InMemoryOptionStore;

final class DesiredOptionsMigrationTest extends TestCase
{
    public function test_preflight_reports_the_number_of_changed_options_without_writing(): void
    {
        $store = new InMemoryOptionStore(['effect' => 'filter', 'enabled' => '1']);
        $migration = new DesiredOptionsMigration(
            '20260807_001_interface_settings',
            'Nastavení rozhraní',
            $store,
            ['effect' => 'overlay', 'enabled' => '1', 'opacity' => '30']
        );

        $checks = $migration->preflight();

        self::assertSame('warning', $checks[0]->severity());
        self::assertStringContainsString('2', $checks[0]->message());
        self::assertSame([], $store->writes);
    }

    public function test_apply_only_writes_values_that_differ_and_verify_passes(): void
    {
        $store = new InMemoryOptionStore(['effect' => 'filter', 'enabled' => '1']);
        $migration = new DesiredOptionsMigration(
            '20260807_001_interface_settings',
            'Nastavení rozhraní',
            $store,
            ['effect' => 'overlay', 'enabled' => '1', 'opacity' => '30']
        );

        $migration->apply();
        $verification = $migration->verify();

        self::assertSame(['effect', 'opacity'], $store->writes);
        self::assertSame('pass', $verification[0]->severity());
    }

    public function test_verify_blocks_when_a_value_does_not_match(): void
    {
        $store = new InMemoryOptionStore(['effect' => 'filter']);
        $migration = new DesiredOptionsMigration(
            '20260807_001_interface_settings',
            'Nastavení rozhraní',
            $store,
            ['effect' => 'overlay']
        );

        $verification = $migration->verify();

        self::assertSame('blocker', $verification[0]->severity());
        self::assertStringContainsString('effect', $verification[0]->message());
    }

    public function test_registered_integer_and_boolean_options_match_string_manifest_values(): void
    {
        $store = new InMemoryOptionStore([
            'intensity' => 25,
            'opacity' => 30,
            'plain_title' => 1,
        ]);
        $migration = new DesiredOptionsMigration(
            '20260807_001_interface_settings',
            'Nastavení rozhraní',
            $store,
            [
                'intensity' => '25',
                'opacity' => '30',
                'plain_title' => '1',
            ]
        );

        self::assertSame('pass', $migration->preflight()[0]->severity());

        $migration->apply();

        self::assertSame([], $store->writes);
        self::assertSame('pass', $migration->verify()[0]->severity());
    }

    public function test_later_option_failure_restores_changed_and_absent_options(): void
    {
        $store = new InMemoryOptionStore(['effect' => 'filter']);
        $store->throwOnSetAttempts = ['opacity' => [1]];
        $migration = new DesiredOptionsMigration(
            '20260807_001_interface_settings',
            'Nastavení rozhraní',
            $store,
            ['effect' => 'overlay', 'intensity' => '25', 'opacity' => '30']
        );

        try {
            $migration->apply();
            self::fail('A later option failure should abort the migration.');
        } catch (\RuntimeException $error) {
            self::assertStringContainsString('opacity', $error->getMessage());
            self::assertSame('filter', $store->get('effect'));
            self::assertFalse($store->has('intensity'));
            self::assertFalse($store->has('opacity'));
            self::assertSame(['effect', 'intensity', 'opacity', 'opacity', 'intensity', 'effect'], $store->writes);
            self::assertSame(['opacity', 'intensity'], $store->deletes);
        }
    }
}
