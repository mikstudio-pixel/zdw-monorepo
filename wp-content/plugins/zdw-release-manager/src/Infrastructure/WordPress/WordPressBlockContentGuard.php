<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

final class WordPressBlockContentGuard
{
    /** @param array<string, mixed> $block */
    public static function hasUnexpectedContainerContent(array $block): bool
    {
        $children = $block['innerBlocks'] ?? [];
        if (!is_array($children)) {
            return true;
        }

        $namedChildren = [];
        foreach ($children as $child) {
            if (!is_array($child)) {
                return true;
            }
            if (null === ($child['blockName'] ?? null)) {
                if ('' !== trim((string) ($child['innerHTML'] ?? ''))) {
                    return true;
                }
                continue;
            }
            $namedChildren[] = $child;
            if (self::hasUnexpectedContainerContent($child)) {
                return true;
            }
        }

        if ([] === $namedChildren) {
            $emptyPattern = self::emptyWrapperPattern((string) ($block['blockName'] ?? ''));
            if (null === $emptyPattern) {
                return false;
            }
            if ([] !== $children) {
                return true;
            }

            $innerContent = $block['innerContent'] ?? null;
            if (!is_array($innerContent)
                || [] !== array_filter($innerContent, static fn (mixed $fragment): bool => !is_string($fragment))) {
                return true;
            }
            $markup = implode('', $innerContent);

            return $markup !== (string) ($block['innerHTML'] ?? '')
                || 1 !== preg_match($emptyPattern, $markup);
        }

        $innerContent = $block['innerContent'] ?? null;
        if (!is_array($innerContent)
            || count($namedChildren) !== count(array_filter($innerContent, static fn (mixed $fragment): bool => null === $fragment))) {
            return true;
        }

        $fragments = array_values(array_filter($innerContent, 'is_string'));
        if (count($fragments) < 2) {
            return true;
        }

        $opening = (string) array_shift($fragments);
        $closing = (string) array_pop($fragments);
        if ([] !== array_filter($fragments, static fn (string $fragment): bool => '' !== trim($fragment))) {
            return true;
        }

        [$openingPattern, $closingPattern] = self::wrapperPatterns((string) ($block['blockName'] ?? ''));

        return null === $openingPattern
            || 1 !== preg_match($openingPattern, $opening)
            || 1 !== preg_match($closingPattern, $closing);
    }

    /** @return array{0: ?string, 1: string} */
    private static function wrapperPatterns(string $blockName): array
    {
        if (in_array($blockName, ['core/group', 'core/columns', 'core/column', 'core/buttons'], true)) {
            return ['~^\s*<div\b[^>]*>\s*$~s', '~^\s*</div>\s*$~s'];
        }
        if ('esab/accordion' === $blockName) {
            return [
                '~^\s*<div\b[^>]*class="[^"]*\bwp-block-esab-accordion\b[^"]*"[^>]*>\s*<div\b[^>]*class="[^"]*\besab__container\b[^"]*"[^>]*>\s*$~s',
                '~^\s*</div>\s*</div>\s*$~s',
            ];
        }
        if ('esab/accordion-child' === $blockName) {
            return [
                '~^\s*<div\b[^>]*class="[^"]*\bwp-block-esab-accordion-child\b[^"]*"[^>]*>.*<div\b[^>]*class="[^"]*\besab__body\b[^"]*"[^>]*>\s*$~s',
                '~^\s*</div>\s*</div>\s*$~s',
            ];
        }

        return [null, '~$~'];
    }

    private static function emptyWrapperPattern(string $blockName): ?string
    {
        if ('core/spacer' === $blockName) {
            return '~^\s*<div\b(?=[^>]*\bwp-block-spacer\b)[^>]*>\s*</div>\s*$~s';
        }

        return in_array($blockName, ['core/group', 'core/columns', 'core/column', 'core/buttons'], true)
            ? '~^\s*<div\b[^>]*>\s*</div>\s*$~s'
            : null;
    }
}
