<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class InMemoryPostStore implements PostStore
{
    /** @var array<int, PostRecord> */
    private array $posts;

    /** @var list<int> */
    public array $writes = [];

    public ?int $throwOnUpdateId = null;
    public ?int $throwAfterUpdateId = null;

    /** @var array<int, list<int>> */
    public array $throwOnUpdateAttempts = [];

    /** @var array<int, list<int>> */
    public array $throwOnFindAttempts = [];

    /** @var array<int, array<int, string>> */
    public array $replaceContentOnFindAttempts = [];

    /** @var array<int, int> */
    private array $updateAttempts = [];

    /** @var array<int, int> */
    private array $findAttempts = [];

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
        $attempt = ($this->findAttempts[$postId] ?? 0) + 1;
        $this->findAttempts[$postId] = $attempt;
        if (in_array($attempt, $this->throwOnFindAttempts[$postId] ?? [], true)) {
            throw new RuntimeException(sprintf('Post ID %d lookup failed.', $postId));
        }
        if (isset($this->replaceContentOnFindAttempts[$postId][$attempt], $this->posts[$postId])) {
            $post = $this->posts[$postId];
            $this->posts[$postId] = new PostRecord(
                $post->id(),
                $post->slug(),
                $this->replaceContentOnFindAttempts[$postId][$attempt]
            );
        }

        return $this->posts[$postId] ?? null;
    }

    public function updateContent(int $postId, string $content): void
    {
        $attempt = ($this->updateAttempts[$postId] ?? 0) + 1;
        $this->updateAttempts[$postId] = $attempt;
        if ($postId === $this->throwOnUpdateId
            || in_array($attempt, $this->throwOnUpdateAttempts[$postId] ?? [], true)) {
            throw new RuntimeException(sprintf('Post ID %d update failed.', $postId));
        }

        $post = $this->posts[$postId];
        $this->posts[$postId] = new PostRecord($post->id(), $post->slug(), $content);
        $this->writes[] = $postId;

        if ($postId === $this->throwAfterUpdateId) {
            $this->throwAfterUpdateId = null;
            throw new RuntimeException(sprintf('Post ID %d failed after update.', $postId));
        }
    }
}
