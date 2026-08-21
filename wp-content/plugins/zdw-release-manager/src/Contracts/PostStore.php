<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\PostRecord;

interface PostStore
{
    public function find(int $postId): ?PostRecord;

    public function updateContent(int $postId, string $content): void;

    public function updateContentIfCurrent(int $postId, string $expectedContent, string $content): bool;
}
