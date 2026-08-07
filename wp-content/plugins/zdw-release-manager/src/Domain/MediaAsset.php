<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class MediaAsset
{
    public function __construct(
        private readonly int $attachmentId,
        private readonly string $assetUrl
    ) {
    }

    public function id(): int
    {
        return $this->attachmentId;
    }

    public function url(): string
    {
        return $this->assetUrl;
    }
}
