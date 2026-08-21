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

    /** @var array<string, list<int>> */
    private array $unpublishedSlugOwners = [];

    /** @var array<string, int> */
    private array $translations = [];

    /** @var array<int, array<string, int>> */
    private array $translationGroupsByPost = [];

    /** @var list<int> */
    public array $writes = [];

    public ?int $languagePostId = null;

    /** @var array<int, list<int>> */
    public array $throwOnLanguageAttempts = [];

    /** @var array<int, int> */
    private array $languageAttempts = [];

    /** @var list<int> */
    public array $deleted = [];

    /** @var list<int> */
    public array $throwOnTranslationAttempts = [];

    private int $translationAttempts = 0;

    /** @var list<array<string, int>> */
    public array $translationWrites = [];

    public bool $ignoreTranslationWrites = false;

    /** @var array<int, string> */
    public array $replaceContentBeforeConditionalUpdate = [];

    /** @var array<int, array<int, string>> */
    public array $replaceContentBeforeTranslationAttempts = [];

    /** @param list<PostRecord> $pages
     *  @param array<int, string> $attachments
     *  @param array<string, list<int>> $unpublishedSlugOwners
     *  @param array<int, string> $languages
     *  @param array<string, int> $translations
     */
    public function __construct(
        array $pages = [],
        array $attachments = [],
        array $unpublishedSlugOwners = [],
        array $languages = [],
        array $translations = []
    )
    {
        foreach ($pages as $page) {
            $this->pages[$page->id()] = $page;
        }
        foreach ($attachments as $attachmentId => $filename) {
            $this->attachments[$attachmentId] = $filename;
        }
        $this->unpublishedSlugOwners = $unpublishedSlugOwners;
        $this->languages = $languages;
        $this->translations = $translations;
        foreach ($translations as $postId) {
            $this->translationGroupsByPost[$postId] = $translations;
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

    public function updateContentIfCurrent(int $postId, string $expectedContent, string $content): bool
    {
        if (isset($this->replaceContentBeforeConditionalUpdate[$postId])) {
            $page = $this->pages[$postId];
            $this->pages[$postId] = new PostRecord(
                $postId,
                $page->slug(),
                $this->replaceContentBeforeConditionalUpdate[$postId]
            );
            unset($this->replaceContentBeforeConditionalUpdate[$postId]);
        }
        if (($this->pages[$postId] ?? null)?->content() !== $expectedContent) {
            return false;
        }

        $this->updateContent($postId, $content);

        return true;
    }

    public function findPageIdsBySlug(string $slug): array
    {
        $published = array_values(array_map(
            static fn (PostRecord $page): int => $page->id(),
            array_filter($this->pages, static fn (PostRecord $page): bool => $page->slug() === $slug)
        ));

        return array_values(array_merge($published, $this->unpublishedSlugOwners[$slug] ?? []));
    }

    public function createPage(string $title, string $slug, string $content): int
    {
        $id = [] === $this->pages ? 1 : max(array_keys($this->pages)) + 1;
        $this->pages[$id] = new PostRecord($id, $slug, $content);
        $this->writes[] = $id;

        return $id;
    }

    public function deletePage(int $postId): void
    {
        $this->detachTranslation($postId);
        unset($this->pages[$postId], $this->languages[$postId]);
        $this->deleted[] = $postId;
    }

    public function setLanguage(int $postId, ?string $language): void
    {
        $attempt = ($this->languageAttempts[$postId] ?? 0) + 1;
        $this->languageAttempts[$postId] = $attempt;
        $this->languagePostId = $postId;
        if (null === $language) {
            $this->detachTranslation($postId);
            unset($this->languages[$postId]);
        } else {
            $this->languages[$postId] = $language;
        }
        if (in_array($attempt, $this->throwOnLanguageAttempts[$postId] ?? [], true)) {
            throw new \RuntimeException(sprintf('Language write failed for ID %d.', $postId));
        }
    }

    public function language(int $postId): ?string
    {
        return $this->languages[$postId] ?? null;
    }

    public function translations(int $postId): array
    {
        return $this->translationGroupsByPost[$postId] ?? [];
    }

    public function setTranslations(array $translations): void
    {
        ++$this->translationAttempts;
        foreach ($this->replaceContentBeforeTranslationAttempts[$this->translationAttempts] ?? [] as $postId => $content) {
            if (isset($this->pages[$postId])) {
                $page = $this->pages[$postId];
                $this->pages[$postId] = new PostRecord($postId, $page->slug(), $content);
            }
        }
        $this->translationWrites[] = $translations;
        if ($this->ignoreTranslationWrites) {
            return;
        }
        foreach ($translations as $postId) {
            $this->detachTranslation($postId);
        }
        $this->translations = $translations;
        foreach ($translations as $postId) {
            $this->translationGroupsByPost[$postId] = $translations;
        }
        if (in_array($this->translationAttempts, $this->throwOnTranslationAttempts, true)) {
            throw new \RuntimeException('Translation write failed.');
        }
    }

    /** @return array<string, int> */
    public function translationGroup(): array
    {
        return $this->translations;
    }

    public function attachmentExists(int $attachmentId): bool
    {
        return isset($this->attachments[$attachmentId]);
    }

    public function attachmentFilename(int $attachmentId): ?string
    {
        return $this->attachments[$attachmentId] ?? null;
    }

    private function detachTranslation(int $postId): void
    {
        $group = $this->translationGroupsByPost[$postId] ?? [];
        if ([] === $group) {
            return;
        }

        unset($this->translationGroupsByPost[$postId]);
        $remaining = array_filter(
            $group,
            static fn (int $translationId): bool => $translationId !== $postId
        );
        foreach ($remaining as $translationId) {
            $this->translationGroupsByPost[$translationId] = $remaining;
        }
    }
}
