<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface ContactContentTransformer
{
    /** @param list<array<string, string>> $contacts */
    public function pressPage(string $content, array $contacts): string;

    /** @param list<array<string, string>> $contacts */
    public function replaceFirstContact(string $content, array $contacts): string;

    public function equivalent(string $first, string $second): bool;
}
