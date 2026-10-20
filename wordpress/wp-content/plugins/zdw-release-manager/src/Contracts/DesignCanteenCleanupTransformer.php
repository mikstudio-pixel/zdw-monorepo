<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface DesignCanteenCleanupTransformer
{
    public function desiredPageContent(string $content): string;

    public function equivalent(string $first, string $second): bool;
}
