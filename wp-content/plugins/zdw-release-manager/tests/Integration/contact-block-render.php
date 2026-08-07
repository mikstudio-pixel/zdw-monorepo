<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';

if (!function_exists('zdw_contacts_block_render')) {
    throw new RuntimeException('ZDW Contacts Block render API is unavailable.');
}

$email = 'eva.sevcikova@zlindesignweek.com';
for ($attempt = 0; $attempt < 20; $attempt++) {
    $attributes = [
        'contacts' => [[
            'name' => 'Eva Ševčíková',
            'role' => 'Public Relations',
            'email' => $email,
        ]],
    ];
    $html = do_blocks(sprintf(
        '<!-- wp:zdw/contacts %s /-->',
        wp_json_encode($attributes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    ));
    $visibleText = html_entity_decode(wp_strip_all_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (!str_contains($visibleText, $email) || str_contains($html, '&amp;#')) {
        throw new RuntimeException('The obfuscated email is double-escaped in rendered contact HTML.');
    }
}

echo "ZDW contact block render integration test passed.\n";
