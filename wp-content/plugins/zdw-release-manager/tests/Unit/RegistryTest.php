<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Unit;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use ZDW\ReleaseManager\Domain\MigrationRegistry;
use ZDW\ReleaseManager\Tests\Support\SpyMigration;

final class RegistryTest extends TestCase
{
    public function test_it_preserves_registration_order_and_finds_a_migration(): void
    {
        $first = new SpyMigration('20260807_001_audit', 'Audit prostředí');
        $second = new SpyMigration('20260807_002_contacts', 'Kontakty');
        $registry = new MigrationRegistry([$first, $second]);

        self::assertSame([$first, $second], $registry->all());
        self::assertSame($second, $registry->get('20260807_002_contacts'));
    }

    public function test_it_rejects_duplicate_ids(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Duplicate migration ID');

        new MigrationRegistry([
            new SpyMigration('20260807_001_audit', 'První'),
            new SpyMigration('20260807_001_audit', 'Druhá'),
        ]);
    }

    public function test_it_rejects_ids_without_a_versioned_prefix(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid migration ID');

        new MigrationRegistry([
            new SpyMigration('update-contacts', 'Kontakty'),
        ]);
    }

    public function test_get_rejects_an_unknown_id(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Neznámá migrace');

        (new MigrationRegistry())->get('20260807_999_missing');
    }
}
