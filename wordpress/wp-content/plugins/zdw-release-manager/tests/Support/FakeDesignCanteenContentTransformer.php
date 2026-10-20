<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\DesignCanteenContentTransformer;

final class FakeDesignCanteenContentTransformer implements DesignCanteenContentTransformer
{
    public function desiredPageContent(string $content): string
    {
        return str_starts_with($content, 'current:') ? $content : 'current:' . $content;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $first === $second;
    }
}
