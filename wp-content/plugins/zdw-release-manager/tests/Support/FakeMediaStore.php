<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\MediaStore;
use ZDW\ReleaseManager\Domain\MediaAsset;

final class FakeMediaStore implements MediaStore
{
    /** @param list<MediaAsset> $videos */
    public function __construct(
        private readonly array $videos = [],
        private readonly ?MediaAsset $poster = null
    ) {
    }

    public function findByFilename(string $filename): array
    {
        return $this->videos;
    }

    public function find(int $attachmentId): ?MediaAsset
    {
        return null !== $this->poster && $this->poster->id() === $attachmentId ? $this->poster : null;
    }
}
