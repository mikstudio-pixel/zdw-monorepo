<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class FakeIntroContentTransformer implements IntroContentTransformer
{
    public bool $alwaysMismatch = false;
    public string $throwOnContent = '';

    public function desiredPageContent(string $content, MediaAsset $video, MediaAsset $poster): string
    {
        if ('' !== $this->throwOnContent && str_contains($content, $this->throwOnContent)) {
            throw new \RuntimeException('Invalid homepage intro.');
        }

        $suffix = sprintf('|intro:%d:%d', $video->id(), $poster->id());

        return str_ends_with($content, $suffix) ? $content : $content . $suffix;
    }

    public function equivalent(string $first, string $second): bool
    {
        return !$this->alwaysMismatch && $first === $second;
    }
}
