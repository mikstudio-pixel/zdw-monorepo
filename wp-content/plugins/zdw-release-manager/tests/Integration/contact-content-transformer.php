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

$mixedPress = '<!-- wp:zdw/contacts {"contacts":[],"variant":"compact"} /-->'
    . '<!-- wp:group --><div class="wp-block-group"><!-- wp:acf/contact-person {"name":"acf/contact-person"} /--></div><!-- /wp:group -->';
$mixedResult = $transformer->pressPage($mixedPress, $eva);
if (1 !== substr_count($mixedResult, 'wp:zdw/contacts') || str_contains($mixedResult, 'wp:acf/contact-person')) {
    throw new RuntimeException('Press transform kept a stale legacy contact beside the migrated block.');
}

$unsafeMixedPress = '<!-- wp:zdw/contacts {"contacts":[],"variant":"compact"} /-->'
    . '<!-- wp:group --><div class="wp-block-group">'
    . '<!-- wp:paragraph --><p>Unrelated sibling must survive</p><!-- /wp:paragraph -->'
    . '<!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->'
    . '</div><!-- /wp:group -->';
try {
    $transformer->pressPage($unsafeMixedPress, $eva);
    throw new RuntimeException('Mixed contact transform accepted a legacy group with unrelated siblings.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'nesouvisející obsah')) {
        throw $error;
    }
}

$unsafeInitialPress = '<!-- wp:group --><div class="wp-block-group">'
    . '<!-- wp:paragraph --><p>Unrelated initial sibling</p><!-- /wp:paragraph -->'
    . '<!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->'
    . '</div><!-- /wp:group -->';
try {
    $transformer->pressPage($unsafeInitialPress, $eva);
    throw new RuntimeException('Initial contact transform accepted a legacy group with unrelated siblings.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'nesouvisející obsah')) {
        throw $error;
    }
}

$rawMixedPress = '<!-- wp:zdw/contacts {"contacts":[],"variant":"compact"} /-->'
    . '<!-- wp:group --><div class="wp-block-group">Raw editorial note'
    . '<!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->'
    . '</div><!-- /wp:group -->';
try {
    $transformer->pressPage($rawMixedPress, $eva);
    throw new RuntimeException('Mixed contact transform accepted raw content beside the legacy contact.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'nesouvisející obsah')) {
        throw $error;
    }
}

$unrelatedAccreditation = '<!-- wp:group --><div class="wp-block-group"><!-- wp:heading --><h2>Akreditace novinářů bude otevřena později</h2><!-- /wp:heading --></div><!-- /wp:group -->';
$legacyAccreditation = '<!-- wp:group --><div class="wp-block-group"><!-- wp:columns --><div class="wp-block-columns">'
    . '<!-- wp:column --><div class="wp-block-column"><!-- wp:spacer {"height":"30px"} --><div style="height:30px" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer -->'
    . '<!-- wp:heading {"textAlign":"center","level":4} --><h4 class="wp-block-heading has-text-align-center">AKREDITACE</h4><!-- /wp:heading -->'
    . '<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} --><div class="wp-block-buttons"><!-- wp:button {"textAlign":"center"} --><div class="wp-block-button"><a class="wp-block-button__link has-text-align-center wp-element-button" href="https://docs.google.com/forms/d/e/1FAIpQLSerSEKT-2eufUO50ymmo3cyJAZb-Q3yfmGizhRRzLXtQBLihA/viewform" target="_blank" rel="noreferrer noopener">ZOBRAZIT SOUBORY</a></div><!-- /wp:button --></div><!-- /wp:buttons --></div><!-- /wp:column -->'
    . '<!-- wp:column --><div class="wp-block-column"><!-- wp:spacer {"height":"30px"} --><div style="height:30px" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer --><!-- wp:heading {"textAlign":"center","level":4} --><h4 class="wp-block-heading has-text-align-center"></h4><!-- /wp:heading --></div><!-- /wp:column -->'
    . '<!-- wp:column --><div class="wp-block-column"><!-- wp:spacer {"height":"30px"} --><div style="height:30px" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer --><!-- wp:heading {"textAlign":"center","level":4} --><h4 class="wp-block-heading has-text-align-center"></h4><!-- /wp:heading --></div><!-- /wp:column -->'
    . '</div><!-- /wp:columns --></div><!-- /wp:group -->';
$overlappingAccreditation = str_replace(
    '<!-- /wp:button -->',
    '<!-- /wp:button --><!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->',
    $legacyAccreditation
);
$overlapResult = $transformer->pressPage($overlappingAccreditation, $eva);
if (1 !== substr_count($overlapResult, 'wp:zdw/contacts')) {
    throw new RuntimeException('An overlapping accreditation/contact group was removed without replacement.');
}

$groupClosing = '</div><!-- /wp:group -->';
$unsafeAccreditation = substr($legacyAccreditation, 0, -strlen($groupClosing))
    . '<!-- wp:paragraph --><p>Retained accreditation note</p><!-- /wp:paragraph -->'
    . $groupClosing;
$unsafeAccreditationResult = $transformer->pressPage($syntheticPress . $unsafeAccreditation, $eva);
if (!str_contains($unsafeAccreditationResult, 'Retained accreditation note')) {
    throw new RuntimeException('Accreditation cleanup removed an unrelated sibling block.');
}

$columnsClosing = '</div><!-- /wp:columns -->';
$unsafeAccreditationRow = str_replace(
    $columnsClosing,
    '<!-- wp:paragraph --><p>Retained row note</p><!-- /wp:paragraph -->' . $columnsClosing,
    $legacyAccreditation
);
$unsafeAccreditationRowResult = $transformer->pressPage($syntheticPress . $unsafeAccreditationRow, $eva);
if (!str_contains($unsafeAccreditationRowResult, 'Retained row note')) {
    throw new RuntimeException('Accreditation cleanup removed a non-column row child.');
}

$rawAccreditation = substr($legacyAccreditation, 0, -strlen($groupClosing))
    . 'Retained raw accreditation note'
    . $groupClosing;
$rawAccreditationResult = $transformer->pressPage($syntheticPress . $rawAccreditation, $eva);
if (!str_contains($rawAccreditationResult, 'Retained raw accreditation note')) {
    throw new RuntimeException('Accreditation cleanup removed unrelated raw content.');
}

$nestedAccreditation = str_replace(
    '</div><!-- /wp:buttons --></div><!-- /wp:column -->',
    '</div><!-- /wp:buttons --><!-- wp:paragraph --><p>Retained nested accreditation note</p><!-- /wp:paragraph --></div><!-- /wp:column -->',
    $legacyAccreditation
);
$nestedAccreditationResult = $transformer->pressPage($syntheticPress . $nestedAccreditation, $eva);
if (!str_contains($nestedAccreditationResult, 'Retained nested accreditation note')) {
    throw new RuntimeException('Accreditation cleanup removed an unrelated nested block.');
}

$nestedRawAccreditation = str_replace(
    '</div><!-- /wp:buttons --></div><!-- /wp:column -->',
    '</div><!-- /wp:buttons -->Retained nested raw accreditation note</div><!-- /wp:column -->',
    $legacyAccreditation
);
$nestedRawResult = $transformer->pressPage($syntheticPress . $nestedRawAccreditation, $eva);
if (!str_contains($nestedRawResult, 'Retained nested raw accreditation note')) {
    throw new RuntimeException('Accreditation cleanup removed unrelated nested raw content.');
}

$nestedMarkupAccreditation = str_replace(
    '</div><!-- /wp:spacer --><!-- wp:heading',
    '</div><!-- /wp:spacer --><img src="editorial-marker.jpg" alt=""><!-- wp:heading',
    $legacyAccreditation
);
$nestedMarkupResult = $transformer->pressPage($syntheticPress . $nestedMarkupAccreditation, $eva);
if (!str_contains($nestedMarkupResult, 'editorial-marker.jpg')) {
    throw new RuntimeException('Accreditation cleanup removed unrelated tag-only content.');
}

$editedAccreditationText = str_replace('ZOBRAZIT SOUBORY', 'NOVÝ REDAKČNÍ ODKAZ', $legacyAccreditation);
if (!str_contains($transformer->pressPage($syntheticPress . $editedAccreditationText, $eva), 'NOVÝ REDAKČNÍ ODKAZ')) {
    throw new RuntimeException('Accreditation cleanup removed edited button text.');
}
$editedAccreditationUrl = str_replace('1FAIpQLSerSEKT-2eufUO50ymmo3cyJAZb-Q3yfmGizhRRzLXtQBLihA', 'editorial-form', $legacyAccreditation);
if (!str_contains($transformer->pressPage($syntheticPress . $editedAccreditationUrl, $eva), 'editorial-form')) {
    throw new RuntimeException('Accreditation cleanup removed an edited button URL.');
}

$safePress = $syntheticPress . $unrelatedAccreditation . $legacyAccreditation;
$safeResult = $transformer->pressPage($safePress, $eva);
if (false === strpos($safeResult, 'Akreditace novinářů bude otevřena později')) {
    throw new RuntimeException('Press transform removed unrelated accreditation copy.');
}
if (false !== strpos($safeResult, '>AKREDITACE<')) {
    throw new RuntimeException('Press transform kept the structurally identified legacy accreditation section.');
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

$duplicateContactTypes = '<!-- wp:acf/contact-person {"name":"acf/contact-person"} /-->'
    . '<!-- wp:zdw/contacts {"contacts":[],"variant":"compact"} /-->';
try {
    $transformer->replaceFirstContact($duplicateContactTypes, $anna);
    throw new RuntimeException('Accessibility transform accepted two competing contact blocks.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), 'právě jeden')) {
        throw $error;
    }
}

echo "WordPressContactContentTransformer integration test passed.\n";
