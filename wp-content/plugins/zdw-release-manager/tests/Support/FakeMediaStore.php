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
        $assets = $this->videos;
        if ($this->poster instanceof MediaAsset) {
            $assets[] = $this->poster;
        }

        return array_values(array_filter(
            $assets,
            static function (MediaAsset $asset) use ($filename): bool {
                $path = parse_url($asset->url(), PHP_URL_PATH);

                return is_string($path) && rawurldecode(basename($path)) === $filename;
            }
        ));
    }

    public function find(int $attachmentId): ?MediaAsset
    {
        return null !== $this->poster && $this->poster->id() === $attachmentId ? $this->poster : null;
    }
}
