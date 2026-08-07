<?php

declare(strict_types=1);

require '/var/www/html/wp-load.php';
require_once '/var/www/html/wp-content/plugins/zdw-release-manager/zdw-release-manager.php';

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

echo "WordPressContactContentTransformer integration test passed.\n";
