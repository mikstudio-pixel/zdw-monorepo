<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class InMemoryPostStore implements PostStore
{
    /** @var array<int, PostRecord> */
    private array $posts;

    /** @var list<int> */
    public array $writes = [];

    /** @param list<PostRecord> $posts */
    public function __construct(array $posts = [])
    {
        $this->posts = [];
        foreach ($posts as $post) {
            $this->posts[$post->id()] = $post;
        }
    }

    public function find(int $postId): ?PostRecord
    {
        return $this->posts[$postId] ?? null;
    }

    public function updateContent(int $postId, string $content): void
    {
        $post = $this->posts[$postId];
        $this->posts[$postId] = new PostRecord($post->id(), $post->slug(), $content);
        $this->writes[] = $postId;
    }
}
