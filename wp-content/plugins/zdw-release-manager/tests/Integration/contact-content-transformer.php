<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressContactContentTransformer;

$transformer = new WordPressContactContentTransformer();
$eva = [[
    'name' => 'Eva Ševčíková',
    'role' => 'Public Relations',
    'email' => 'eva.sevcikova@zlindesignweek.com',
    'phone' => '+420 723 457 715',
]];
$anna = [[
    'name' => 'Anna Svobodová',
    'role' => 'Coordinator of Accessibility',
    'email' => 'anna.svobodova@zlindesignweek.com',
    'phone' => '+420 733 144 711',
]];

// Revisions 43859 and 40676 come from the SQL dump configured by ZDW_SQL_DUMP.
$pressRevision = get_post(43859);
if (!$pressRevision instanceof WP_Post) {
    throw new RuntimeException('Press-kit fixture revision 43859 is missing.');
}

$press = $transformer->pressPage($pressRevision->post_content, $eva);
if (1 !== substr_count($press, 'wp:zdw/contacts')) {
    throw new RuntimeException('Press transform did not create exactly one contact block.');
}
if (false !== stripos($press, 'AKREDITACE')) {
    throw new RuntimeException('Press transform kept the accreditation section.');
}
if (false === stripos($press, 'PRESS CENTRUM')) {
    throw new RuntimeException('Press transform removed unrelated content.');
}
if (!$transformer->equivalent($press, $transformer->pressPage($press, $eva))) {
    throw new RuntimeException('Press transform is not idempotent.');
}

$syntheticPress = '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph --><p>Do not replace</p><!-- /wp:paragraph --></div><!-- /wp:group -->'
    . '<!-- wp:group --><div class="wp-block-group"><!-- wp:acf/contact-person {"name":"acf/contact-person"} /--></div><!-- /wp:group -->';
$syntheticResult = $transformer->pressPage($syntheticPress, $eva);
if (false === strpos($syntheticResult, 'Do not replace') || 1 !== substr_count($syntheticResult, 'wp:zdw/contacts')) {
    throw new RuntimeException('Press transform replaced an unrelated group.');
}

$accessibilityRevision = get_post(40676);
if (!$accessibilityRevision instanceof WP_Post) {
    throw new RuntimeException('Accessibility fixture revision 40676 is missing.');
}

$accessibility = $transformer->replaceFirstContact($accessibilityRevision->post_content, $anna);
if (1 !== substr_count($accessibility, 'wp:zdw/contacts') || str_contains($accessibility, 'wp:acf/contact-person')) {
    throw new RuntimeException('Accessibility transform did not replace the legacy contact block.');
}
if (false === stripos($accessibility, 'Festival se dlouhodobě snaží')) {
    throw new RuntimeException('Accessibility transform removed adjacent copy.');
}
if (!$transformer->equivalent($accessibility, $transformer->replaceFirstContact($accessibility, $anna))) {
    throw new RuntimeException('Accessibility transform is not idempotent.');
}

$literalContact = [[
    'name' => '$1 Backslash',
    'role' => 'C:\\Editorial',
    'email' => 'literal@example.com',
    'phone' => '+420 000 000 000',
]];
$literalResult = $transformer->replaceFirstContact('<!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->', $literalContact);
$literalAttrs = parse_blocks($literalResult)[0]['attrs']['contacts'][0] ?? [];
if ('$1 Backslash' !== ($literalAttrs['name'] ?? null) || 'C:\\Editorial' !== ($literalAttrs['role'] ?? null)) {
    throw new RuntimeException('Contact replacement interpreted replacement-string metacharacters.');
}

echo "WordPressContactContentTransformer integration test passed.\n";
