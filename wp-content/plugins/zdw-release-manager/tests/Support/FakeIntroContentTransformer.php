<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\IntroContentTransformer;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class FakeIntroContentTransformer implements IntroContentTransformer
{
    public function desiredPageContent(string $content, MediaAsset $video, MediaAsset $poster): string
    {
        $suffix = sprintf('|intro:%d:%d', $video->id(), $poster->id());

        return str_ends_with($content, $suffix) ? $content : $content . $suffix;
    }

    public function equivalent(string $first, string $second): bool
    {
        return $first === $second;
    }
}
