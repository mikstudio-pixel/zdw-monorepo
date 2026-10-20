<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Domain;

final class PostRecord
{
    public function __construct(
        private readonly int $postId,
        private readonly string $postSlug,
        private readonly string $postContent
    ) {
    }

    public function id(): int
    {
        return $this->postId;
    }

    public function slug(): string
    {
        return $this->postSlug;
    }

    public function content(): string
    {
        return $this->postContent;
    }
}
