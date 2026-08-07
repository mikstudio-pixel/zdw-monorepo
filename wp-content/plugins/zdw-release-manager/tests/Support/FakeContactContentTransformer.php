<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Tests\Support;

use RuntimeException;
use ZDW\ReleaseManager\Contracts\ContactContentTransformer;

final class FakeContactContentTransformer implements ContactContentTransformer
{
    public ?string $throwOnContent = null;

    public function pressPage(string $content, array $contacts): string
    {
        $this->maybeThrow($content);

        return str_ends_with($content, '|press') ? $content : $content . '|press';
    }

    public function replaceFirstContact(string $content, array $contacts): string
    {
        $this->maybeThrow($content);

        return str_ends_with($content, '|contact') ? $content : $content . '|contact';
    }

    public function equivalent(string $first, string $second): bool
    {
        return $first === $second;
    }

    private function maybeThrow(string $content): void
    {
        if ($content === $this->throwOnContent) {
            throw new RuntimeException('Simulated transform failure.');
        }
    }
}
