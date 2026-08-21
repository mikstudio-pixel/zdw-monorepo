<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Migrations;

use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\Migration;
use ZDW\ReleaseManager\Contracts\PageStore;
use ZDW\ReleaseManager\Domain\PreflightCheck;

final class SponsorPageMigration implements Migration
{
    public const PAGES = [
        'cs' => ['title' => 'Sponzoři', 'slug' => 'sponzori'],
        'en' => ['title' => 'Partners', 'slug' => 'partners'],
    ];

    /** @param array<int, string> $attachments */
    public function __construct(
        private readonly PageStore $store,
        private readonly array $attachments,
        private readonly string $desiredContent
    ) {
    }

    public function id(): string
    {
        return '20260808_004_sponsor_pages';
    }

    public function label(): string
    {
        return 'Stránky Sponzoři a Partners s editovatelným Gutenberg blokem';
    }

    public function preflight(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->pagesMatch()
            ? [PreflightCheck::pass('sponsors.ready', 'Stránky Sponzoři a Partners už odpovídají této verzi.')]
            : [PreflightCheck::warning('sponsors.update', 'Budou vytvořeny nebo aktualizovány stránky Sponzoři a Partners.')];
    }

    public function apply(): void
    {
        if ([] !== $this->blockingChecks()) {
            throw new RuntimeException('Nelze bezpečně vytvořit nebo aktualizovat stránky partnerů.');
        }

        $translations = [];
        $created = [];
        $originals = [];
        $translationExpectations = [];
        $translationsAttempted = false;

        try {
            foreach (self::PAGES as $language => $definition) {
                $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
                if ([] === $pageIds) {
                    $pageId = $this->store->createPage(
                        $definition['title'],
                        $definition['slug'],
                        $this->desiredContent
                    );
                    $fingerprint = $this->store->pageFingerprint($pageId);
                    if (null === $fingerprint) {
                        throw new RuntimeException(sprintf('Nově vytvořenou stránku ID %d nelze ověřit.', $pageId));
                    }
                    $created[$pageId] = [
                        'language' => $language,
                        'fingerprint' => $fingerprint,
                        'translations' => [[]],
                    ];
                } else {
                    $pageId = $pageIds[0];
                    $page = $this->store->find($pageId);
                    if (null === $page) {
                        throw new RuntimeException(sprintf('Stránku %s se nepodařilo načíst.', $definition['title']));
                    }
                    $originalTranslations = $this->store->translations($pageId);
                    ksort($originalTranslations);
                    $originals[$pageId] = [
                        'content' => $page->content(),
                        'language' => $this->store->language($pageId),
                        'translations' => $originalTranslations,
                        'targetLanguage' => $language,
                    ];
                    if ($page->content() !== $this->desiredContent) {
                        if (!$this->store->updateContentIfCurrent(
                            $pageId,
                            $page->content(),
                            $this->desiredContent
                        )) {
                            throw new RuntimeException(sprintf(
                                'Obsah stránky ID %d mezitím změnil jiný požadavek.',
                                $pageId
                            ));
                        }
                    }
                }

                $expectedLanguage = $originals[$pageId]['language'] ?? null;
                $currentLanguage = $this->store->language($pageId);
                $currentTranslations = $this->store->translations($pageId);
                ksort($currentTranslations);
                $expectedTranslations = $originals[$pageId]['translations'] ?? [];
                if ($currentLanguage !== $expectedLanguage || $currentTranslations !== $expectedTranslations) {
                    throw new RuntimeException(sprintf(
                        'Jazyk nebo překlady stránky ID %d mezitím změnil jiný požadavek.',
                        $pageId
                    ));
                }
                if ($language !== $currentLanguage) {
                    if (!$this->store->setLanguageIfCurrent($pageId, $currentLanguage, $language)) {
                        throw new RuntimeException(sprintf(
                            'Jazyk stránky ID %d mezitím změnil jiný požadavek.',
                            $pageId
                        ));
                    }

                    $currentTranslations = $this->store->translations($pageId);
                    ksort($currentTranslations);
                    $selfTranslation = [$language => $pageId];
                    if ($currentTranslations !== $expectedTranslations
                        && ([] !== $expectedTranslations || $currentTranslations !== $selfTranslation)) {
                        throw new RuntimeException(sprintf(
                            'Překladové vazby stránky ID %d mezitím změnil jiný požadavek.',
                            $pageId
                        ));
                    }
                    $translationExpectations[$pageId] = $currentTranslations;
                } else {
                    // Preserve the snapshot validated before any migration writes. A fresh read here
                    // could turn a concurrent editorial change into the CAS expectation itself.
                    $translationExpectations[$pageId] = $expectedTranslations;
                }
                if (isset($created[$pageId])) {
                    $created[$pageId]['translations'][] = $currentTranslations;
                    $created[$pageId]['translations'][] = [$language => $pageId];
                }
                $translations[$language] = $pageId;
            }

            $translationsAttempted = true;
            $recordedTranslations = $translations;
            ksort($recordedTranslations);
            foreach (array_keys($created) as $pageId) {
                $created[$pageId]['translations'][] = $recordedTranslations;
            }
            if (!$this->store->setTranslationsIfCurrent($translationExpectations, $translations)) {
                throw new RuntimeException(
                    'Propojení překladů nebylo uloženo, protože vazby mezitím změnil jiný požadavek.'
                );
            }
            if (!$this->pagesMatch()) {
                throw new RuntimeException('Propojení překladů stránek Sponzoři a Partners nebylo uloženo.');
            }
        } catch (Throwable $error) {
            $rollbackFailure = $this->rollback($created, $originals, $translationsAttempted, $translations);
            if (null !== $rollbackFailure) {
                throw new RuntimeException(
                    sprintf('%s Obnova stránek selhala: %s', $error->getMessage(), $rollbackFailure->getMessage()),
                    0,
                    $error
                );
            }

            throw $error;
        }
    }

    public function verify(): array
    {
        $checks = $this->blockingChecks();
        if ([] !== $checks) {
            return $checks;
        }

        return $this->pagesMatch()
            ? [PreflightCheck::pass('sponsors.saved', 'Stránky Sponzoři a Partners byly ověřeny.')]
            : [PreflightCheck::blocker('sponsors.content', 'Stránky Sponzoři a Partners neodpovídají migraci.')];
    }

    /** @return list<PreflightCheck> */
    private function blockingChecks(): array
    {
        $checks = [];
        $invalidAttachments = [];
        foreach ($this->attachments as $attachmentId => $expectedFilename) {
            $actualFilename = $this->store->attachmentFilename($attachmentId);
            if (!$this->store->attachmentExists($attachmentId) || $expectedFilename !== $actualFilename) {
                $invalidAttachments[] = sprintf(
                    '%d (%s; nalezeno %s)',
                    $attachmentId,
                    $expectedFilename,
                    $actualFilename ?? 'nic'
                );
            }
        }
        if ([] !== $invalidAttachments) {
            $checks[] = PreflightCheck::blocker(
                'sponsors.attachments',
                sprintf('Loga v knihovně médií neodpovídají manifestu: %s.', implode(', ', $invalidAttachments))
            );
        }

        foreach (self::PAGES as $language => $definition) {
            $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
            if (count($pageIds) > 1) {
                $checks[] = PreflightCheck::blocker(
                    'sponsors.duplicate',
                    sprintf('Slug %s používá více stránek: %s.', $definition['slug'], implode(', ', $pageIds))
                );
            } elseif (1 === count($pageIds) && null === $this->store->find($pageIds[0])) {
                $checks[] = PreflightCheck::blocker(
                    'sponsors.unpublished_slug',
                    sprintf(
                        'Slug %s už používá nepublikovaná stránka ID %d; nejprve ji publikujte, přejmenujte nebo odstraňte.',
                        $definition['slug'],
                        $pageIds[0]
                    )
                );
            } elseif (1 === count($pageIds)) {
                $actualLanguage = $this->store->language($pageIds[0]);
                if (null !== $actualLanguage && $language !== $actualLanguage) {
                    $checks[] = PreflightCheck::blocker(
                        'sponsors.language_conflict',
                        sprintf(
                            'Stránka ID %d se slugem %s patří do jazyka %s; očekává se %s.',
                            $pageIds[0],
                            $definition['slug'],
                            $actualLanguage,
                            $language
                        )
                    );
                }
            }
        }

        return $checks;
    }

    private function pagesMatch(): bool
    {
        $expectedTranslations = [];
        foreach (self::PAGES as $language => $definition) {
            $pageIds = $this->store->findPageIdsBySlug($definition['slug']);
            if (1 !== count($pageIds)) {
                return false;
            }

            $page = $this->store->find($pageIds[0]);
            if (null === $page
                || $page->content() !== $this->desiredContent
                || $language !== $this->store->language($page->id())) {
                return false;
            }
            $expectedTranslations[$language] = $page->id();
        }

        foreach ($expectedTranslations as $pageId) {
            $actualTranslations = $this->store->translations($pageId);
            foreach ($expectedTranslations as $language => $expectedPageId) {
                if (($actualTranslations[$language] ?? null) !== $expectedPageId) {
                    return false;
                }
            }
        }

        return true;
    }

    /** @param array<int, array{language: string, fingerprint: string, translations: list<array<string, int>>}> $created
     *  @param array<int, array{content: string, language: ?string, translations: array<string, int>, targetLanguage: string}> $originals
     */
    private function rollback(
        array $created,
        array $originals,
        bool $translationsAttempted,
        array $migrationTranslations
    ): ?Throwable
    {
        $failure = null;
        $phaseFailure = $this->rollbackContent($originals);
        $failure ??= $phaseFailure;
        if ($translationsAttempted) {
            $phaseFailure = $this->rollbackTranslations($originals, $migrationTranslations);
            $failure ??= $phaseFailure;
        }
        $phaseFailure = $this->rollbackLanguages($originals);
        $failure ??= $phaseFailure;
        $phaseFailure = $this->rollbackCreatedPages($created);
        $failure ??= $phaseFailure;

        return $failure;
    }

    /** @param array<int, array{language: string, fingerprint: string, translations: list<array<string, int>>}> $created */
    private function rollbackCreatedPages(array $created): ?Throwable
    {
        $failure = null;
        foreach (array_reverse($created, true) as $pageId => $snapshot) {
            try {
                $fingerprint = $this->store->pageFingerprint($pageId);
                if (null === $fingerprint) {
                    continue;
                }
                $page = $this->store->find($pageId);
                $language = $this->store->language($pageId);
                $translations = $this->store->translations($pageId);
                ksort($translations);
                if (null === $page
                    || !hash_equals($snapshot['fingerprint'], $fingerprint)
                    || !in_array($language, [null, $snapshot['language']], true)
                    || !in_array($translations, $snapshot['translations'], true)) {
                    throw new RuntimeException(sprintf(
                        'Nově vytvořenou stránku ID %d nelze smazat po souběžné úpravě.',
                        $pageId
                    ));
                }
                $this->store->deletePage($pageId);
            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        return $failure;
    }

    /** @param array<int, array{content: string, language: ?string, translations: array<string, int>, targetLanguage: string}> $originals */
    private function rollbackContent(array $originals): ?Throwable
    {
        $failure = null;
        foreach ($originals as $pageId => $original) {
            try {
                $page = $this->store->find($pageId);
                if (null === $page) {
                    throw new RuntimeException(sprintf('Stránku ID %d nelze při obnově načíst.', $pageId));
                }
                if ($page->content() === $this->desiredContent
                    && $page->content() !== $original['content']) {
                    if (!$this->store->updateContentIfCurrent(
                        $pageId,
                        $this->desiredContent,
                        $original['content']
                    )) {
                        throw new RuntimeException(sprintf(
                            'Stránku ID %d nelze bezpečně obnovit po souběžné úpravě.',
                            $pageId
                        ));
                    }
                } elseif (!in_array($page->content(), [$this->desiredContent, $original['content']], true)) {
                    throw new RuntimeException(sprintf('Stránka ID %d byla během obnovy mezitím upravena.', $pageId));
                }
            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        return $failure;
    }

    /** @param array<int, array{content: string, language: ?string, translations: array<string, int>, targetLanguage: string}> $originals */
    private function rollbackTranslations(array $originals, array $migrationTranslations): ?Throwable
    {
        ksort($migrationTranslations);
        $translationGroups = [];
        foreach ($originals as $pageId => $original) {
            if (null === $original['language']) {
                continue;
            }
            $group = [] === $original['translations']
                ? [$original['language'] => $pageId]
                : $original['translations'];
            ksort($group);
            $translationGroups[serialize($group)] = $group;
        }

        $failure = null;
        foreach ($translationGroups as $group) {
            try {
                $representativeId = (int) reset($group);
                $current = $this->store->translations($representativeId);
                ksort($current);
                $representativeOriginal = $originals[$representativeId]['translations'] ?? [];
                ksort($representativeOriginal);
                if ($current === $group || $current === $representativeOriginal) {
                    continue;
                }
                if ($current !== $migrationTranslations) {
                    throw new RuntimeException('Překladové vazby byly během obnovy mezitím upraveny.');
                }

                $expectedByPost = [];
                foreach ($migrationTranslations as $postId) {
                    $current = $this->store->translations($postId);
                    ksort($current);
                    if ($current === $migrationTranslations) {
                        $expectedByPost[$postId] = $migrationTranslations;
                        continue;
                    }
                    $original = $originals[$postId] ?? null;
                    $originalSnapshot = is_array($original) ? $original['translations'] : null;
                    $originalGroup = $originalSnapshot;
                    if (is_array($originalGroup) && [] === $originalGroup && null !== $original['language']) {
                        $originalGroup = [$original['language'] => $postId];
                    }
                    if (!is_array($originalGroup) || !is_array($originalSnapshot)) {
                        throw new RuntimeException('Překladové vazby byly během obnovy mezitím upraveny.');
                    }
                    ksort($originalGroup);
                    ksort($originalSnapshot);
                    if ($current !== $originalGroup && $current !== $originalSnapshot) {
                        throw new RuntimeException('Překladové vazby byly během obnovy mezitím upraveny.');
                    }
                }
                if (isset($expectedByPost[$representativeId])
                    && !$this->store->setTranslationsIfCurrent($expectedByPost, $group)) {
                    throw new RuntimeException('Překladové vazby nelze bezpečně obnovit po souběžné úpravě.');
                }
            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        return $failure;
    }

    /** @param array<int, array{content: string, language: ?string, translations: array<string, int>, targetLanguage: string}> $originals */
    private function rollbackLanguages(array $originals): ?Throwable
    {
        $failure = null;
        foreach ($originals as $pageId => $original) {
            try {
                $currentLanguage = $this->store->language($pageId);
                if ($currentLanguage === $original['targetLanguage']
                    && $currentLanguage !== $original['language']) {
                    if (!$this->store->setLanguageIfCurrent(
                        $pageId,
                        $original['targetLanguage'],
                        $original['language']
                    )) {
                        throw new RuntimeException(sprintf(
                            'Jazyk stránky ID %d nelze bezpečně obnovit po souběžné úpravě.',
                            $pageId
                        ));
                    }
                } elseif (!in_array($currentLanguage, [$original['targetLanguage'], $original['language']], true)) {
                    throw new RuntimeException(sprintf('Jazyk stránky ID %d byl během obnovy mezitím upraven.', $pageId));
                }
            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        return $failure;
    }
}
