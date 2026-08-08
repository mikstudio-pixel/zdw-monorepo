<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\HomepageBodyTransformer;

final class FakeHomepageBodyTransformer implements HomepageBodyTransformer
{
    public bool $throwOnTransform = false;
    public bool $alwaysMismatch = false;

    public function desiredPageContent(string $content): string
    {
        if ($this->throwOnTransform) {
            throw new \RuntimeException('Invalid homepage body.');
        }

        return str_starts_with($content, 'compact:') ? $content : 'compact:' . $content;
    }

    public function equivalent(string $first, string $second): bool
    {
        return !$this->alwaysMismatch && $first === $second;
    }
}
