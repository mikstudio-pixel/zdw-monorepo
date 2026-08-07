<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\MediaAsset;

interface MediaStore
{
    /** @return list<MediaAsset> */
    public function findByFilename(string $filename): array;

    public function find(int $attachmentId): ?MediaAsset;
}
