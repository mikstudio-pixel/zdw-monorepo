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
                    $created[] = $pageId;
                } else {
                    $pageId = $pageIds[0];
                    $page = $this->store->find($pageId);
                    if (null === $page) {
                        throw new RuntimeException(sprintf('Stránku %s se nepodařilo načíst.', $definition['title']));
                    }
                    $originals[$pageId] = [
                        'content' => $page->content(),
                        'language' => $this->store->language($pageId),
                        'translations' => $this->store->translations($pageId),
                        'targetLanguage' => $language,
                    ];
                    if ($page->content() !== $this->desiredContent) {
                        $this->store->updateContent($pageId, $this->desiredContent);
                    }
                }

                if ($language !== $this->store->language($pageId)) {
                    $this->store->setLanguage($pageId, $language);
                }
                $translations[$language] = $pageId;
            }

            $translationsAttempted = true;
            $this->store->setTranslations($translations);
        } catch (Throwable $error) {
            $rollbackFailure = $this->rollback($created, $originals, $translationsAttempted);
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
        }

        return true;
    }

    /** @param list<int> $created
     *  @param array<int, array{content: string, language: ?string, translations: array<string, int>, targetLanguage: string}> $originals
     */
    private function rollback(array $created, array $originals, bool $translationsAttempted): ?Throwable
    {
        $failure = null;

        foreach (array_reverse($created) as $pageId) {
            try {
                $this->store->deletePage($pageId);
            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        foreach ($originals as $pageId => $original) {
            try {
                $page = $this->store->find($pageId);
                if (null === $page) {
                    throw new RuntimeException(sprintf('Stránku ID %d nelze při obnově načíst.', $pageId));
                }
                if ($page->content() === $this->desiredContent
                    && $page->content() !== $original['content']) {
                    $this->store->updateContent($pageId, $original['content']);
                } elseif (!in_array($page->content(), [$this->desiredContent, $original['content']], true)) {
                    throw new RuntimeException(sprintf('Stránka ID %d byla během obnovy mezitím upravena.', $pageId));
                }

            } catch (Throwable $error) {
                $failure ??= $error;
            }
        }

        if ($translationsAttempted) {
            $translationGroups = [];
            foreach ($originals as $pageId => $original) {
                $group = [] === $original['translations']
                    ? [$original['targetLanguage'] => $pageId]
                    : $original['translations'];
                ksort($group);
                $translationGroups[serialize($group)] = $group;
            }
            foreach ($translationGroups as $group) {
                try {
                    $this->store->setTranslations($group);
                } catch (Throwable $error) {
                    $failure ??= $error;
                }
            }
        }

        foreach ($originals as $pageId => $original) {
            try {
                $currentLanguage = $this->store->language($pageId);
                if ($currentLanguage === $original['targetLanguage']
                    && $currentLanguage !== $original['language']) {
                    $this->store->setLanguage($pageId, $original['language']);
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
