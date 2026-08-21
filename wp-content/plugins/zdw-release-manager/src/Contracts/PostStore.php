<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

use ZDW\ReleaseManager\Domain\PostRecord;

interface PostStore
{
    public function find(int $postId): ?PostRecord;

    public function updateContent(int $postId, string $content): void;

    /**
     * Replace content only when the stored value exactly matches the expected value.
     *
     * False means the guard did not match or no row was changed, including when
     * the replacement already equals the stored content.
     */
    public function updateContentIfCurrent(int $postId, string $expectedContent, string $content): bool;
}
