<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\HomepageBodyTransformer;

final class FakeHomepageBodyTransformer implements HomepageBodyTransformer
{
    public function desiredPageContent(string $content): string
    {
        return str_starts_with($content, 'compact:') ? $content : 'compact:' . $content;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $first === $second;
    }
}
