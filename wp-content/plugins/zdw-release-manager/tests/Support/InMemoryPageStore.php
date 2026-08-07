<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class InMemoryPageStore implements PageStore
{
    /** @var array<int, PostRecord> */
    private array $pages = [];

    /** @var array<int, string> */
    private array $attachments = [];

    /** @var array<int, string> */
    private array $languages = [];

    /** @var list<int> */
    public array $writes = [];

    public ?int $languagePostId = null;

    /** @param list<PostRecord> $pages
     *  @param array<int, string> $attachments
     */
    public function __construct(array $pages = [], array $attachments = [])
    {
        foreach ($pages as $page) {
            $this->pages[$page->id()] = $page;
        }
        foreach ($attachments as $attachmentId => $filename) {
            $this->attachments[$attachmentId] = $filename;
        }
    }

    public function find(int $postId): ?PostRecord
    {
        return $this->pages[$postId] ?? null;
    }

    public function updateContent(int $postId, string $content): void
    {
        $page = $this->pages[$postId];
        $this->pages[$postId] = new PostRecord($postId, $page->slug(), $content);
        $this->writes[] = $postId;
    }

    public function findPageIdsBySlug(string $slug): array
    {
        return array_values(array_map(
            static fn (PostRecord $page): int => $page->id(),
            array_filter($this->pages, static fn (PostRecord $page): bool => $page->slug() === $slug)
        ));
    }

    public function createPage(string $title, string $slug, string $content): int
    {
        $id = [] === $this->pages ? 1 : max(array_keys($this->pages)) + 1;
        $this->pages[$id] = new PostRecord($id, $slug, $content);
        $this->writes[] = $id;

        return $id;
    }

    public function setLanguage(int $postId, string $language): void
    {
        $this->languagePostId = $postId;
        $this->languages[$postId] = $language;
    }

    public function language(int $postId): ?string
    {
        return $this->languages[$postId] ?? null;
    }

    public function attachmentExists(int $attachmentId): bool
    {
        return isset($this->attachments[$attachmentId]);
    }

    public function attachmentFilename(int $attachmentId): ?string
    {
        return $this->attachments[$attachmentId] ?? null;
    }
}
