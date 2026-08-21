<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_two_tier_menu_render_nav')) {
    throw new RuntimeException('Two-tier menu plugin is unavailable.');
}

foreach (['cs', 'en'] as $language) {
    $expectedHomeUrl = function_exists('pll_home_url') ? pll_home_url($language) : home_url('/');
    if ($expectedHomeUrl !== zdw_two_tier_menu_home_url($language)) {
        throw new RuntimeException(sprintf('The header homepage URL is not localized for %s.', $language));
    }
}

ob_start();
zdw_two_tier_menu_render_nav('top', 'zdw-two-tier__menu--top');
zdw_two_tier_menu_render_nav('top', 'zdw-two-tier__menu--mobile-top');
$markup = (string) ob_get_clean();

preg_match_all('/\sid="([^"]+)"/', $markup, $matches);
$ids = $matches[1] ?? [];
if ([] === $ids || count($ids) !== count(array_unique($ids))) {
    throw new RuntimeException('Repeated desktop/mobile menu renders contain duplicate DOM IDs.');
}
foreach (['zdw-two-tier-top-desktop-cs', 'zdw-two-tier-top-mobile-cs'] as $expected) {
    if (!in_array($expected, $ids, true)) {
        throw new RuntimeException(sprintf('Expected menu DOM ID is missing: %s', $expected));
    }
}

echo "Two-tier menu DOM ID integration test passed.\n";
