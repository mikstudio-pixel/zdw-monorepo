<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Application;

use InvalidArgumentException;
use RuntimeException;
use Throwable;
use ZDW\ReleaseManager\Contracts\PostStore;
use ZDW\ReleaseManager\Domain\PostRecord;

final class AtomicPostContentUpdater
{
    public function __construct(private readonly PostStore $posts)
    {
    }

    /** @param array<int, string> $updates
     *  @param array<int, string> $originals
     */
    public function apply(array $updates, array $originals, string $rollbackLabel): void
    {
        if ([] !== array_diff_key($updates, $originals)) {
            throw new InvalidArgumentException('Every post update must have rollback content.');
        }

        $attemptedPostIds = [];
        try {
            foreach ($updates as $postId => $desired) {
                $attemptedPostIds[] = $postId;
                $this->posts->updateContent($postId, $desired);
            }
        } catch (Throwable $error) {
            $rollbackFailure = null;
            foreach (array_reverse($attemptedPostIds) as $postId) {
                try {
                    $current = $this->posts->find($postId);
                } catch (Throwable $readError) {
                    $rollbackFailure ??= [$postId, $readError];
                    continue;
                }
                if ($current instanceof PostRecord && $originals[$postId] === $current->content()) {
                    continue;
                }
                if ($current instanceof PostRecord && $updates[$postId] !== $current->content()) {
                    $rollbackFailure ??= [
                        $postId,
                        new RuntimeException('Obsah stránky mezitím změnil jiný požadavek.'),
                    ];
                    continue;
                }

                try {
                    if (!$this->posts->updateContentIfCurrent(
                        $postId,
                        $updates[$postId],
                        $originals[$postId]
                    )) {
                        $rollbackFailure ??= [
                            $postId,
                            new RuntimeException('Obsah stránky mezitím změnil jiný požadavek.'),
                        ];
                        continue;
                    }
                } catch (Throwable $rollbackError) {
                    try {
                        $restored = $this->posts->find($postId);
                    } catch (Throwable) {
                        $restored = null;
                    }
                    if ($restored instanceof PostRecord && $originals[$postId] === $restored->content()) {
                        continue;
                    }

                    $rollbackFailure ??= [$postId, $rollbackError];
                }
            }

            if (null !== $rollbackFailure) {
                [$postId, $rollbackError] = $rollbackFailure;
                throw new RuntimeException(
                    sprintf('%s ID %d selhalo: %s', $rollbackLabel, $postId, $rollbackError->getMessage()),
                    0,
                    $error
                );
            }

            throw $error;
        }
    }
}
