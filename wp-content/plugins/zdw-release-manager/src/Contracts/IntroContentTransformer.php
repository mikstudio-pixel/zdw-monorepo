<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\MediaAsset;

interface IntroContentTransformer
{
    public function desiredPageContent(string $content, MediaAsset $video, MediaAsset $poster): string;

    public function equivalent(string $first, string $second): bool;
}
