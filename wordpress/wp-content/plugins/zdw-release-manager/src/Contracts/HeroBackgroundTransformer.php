<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\MediaAsset;

interface HeroBackgroundTransformer
{
    public function desiredPageContent(string $content, MediaAsset $background): string;

    public function equivalent(string $first, string $second): bool;
}
