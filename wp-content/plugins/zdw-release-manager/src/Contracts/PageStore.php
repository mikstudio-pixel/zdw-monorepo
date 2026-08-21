<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Contracts;

interface PageStore extends PostStore
{
    /** @return list<int> */
    public function findPageIdsBySlug(string $slug): array;

    public function createPage(string $title, string $slug, string $content): int;

    public function deletePage(int $postId): void;

    /** Fingerprint all persisted page fields relevant to safe deletion. */
    public function pageFingerprint(int $postId): ?string;

    public function setLanguage(int $postId, ?string $language): void;

    public function language(int $postId): ?string;

    /** @return array<string, int> */
    public function translations(int $postId): array;

    /** @param array<string, int> $translations */
    public function setTranslations(array $translations): void;

    public function attachmentExists(int $attachmentId): bool;

    public function attachmentFilename(int $attachmentId): ?string;
}
