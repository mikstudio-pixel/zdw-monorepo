<?php

declare(strict_types=1);

$wordpressRoot = getenv('WP_ROOT') ?: '/var/www/html';
require $wordpressRoot . '/wp-load.php';
require_once dirname(__DIR__, 2) . '/zdw-release-manager.php';

use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressDesignCanteenCleanupTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressHeroBackgroundTransformer;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressMediaStore;
use ZDW\ReleaseManager\Infrastructure\WordPress\WordPressPostStore;
use ZDW\ReleaseManager\Migrations\BestInDesignHeroMigration;
use ZDW\ReleaseManager\Migrations\BestInDesignHeroMarkupMigration;
use ZDW\ReleaseManager\Migrations\DesignCanteenCleanupMigration;
use ZDW\ReleaseManager\Migrations\DesignCanteenProgramCleanupMigration;

$admins = get_users(['role' => 'administrator', 'number' => 1]);
if ([] === $admins) {
    throw new RuntimeException('Administrator fixture is unavailable.');
}
wp_set_current_user((int) $admins[0]->ID);

$hero = get_post(193);
$canteen = get_post(12142);
if (!$hero instanceof WP_Post || !$canteen instanceof WP_Post) {
    throw new RuntimeException('Final content migration fixtures are unavailable.');
}

$relativeFile = '2026/08/liza-marchkova-lizamarchkova-13-1-scaled.jpg';
$uploads = wp_get_upload_dir();
$absoluteFile = trailingslashit($uploads['basedir']) . $relativeFile;
if (!is_file($absoluteFile)) {
    throw new RuntimeException('Best in Design image fixture is unavailable.');
}
$attachmentId = wp_insert_attachment([
    'post_title' => 'Best in Design hero fixture',
    'post_status' => 'inherit',
    'post_mime_type' => 'image/jpeg',
    'guid' => trailingslashit($uploads['baseurl']) . $relativeFile,
], $absoluteFile);
if (is_wp_error($attachmentId)) {
    throw new RuntimeException($attachmentId->get_error_message());
}
update_post_meta((int) $attachmentId, '_wp_attached_file', $relativeFile);
$heroBlockIndex = static function (array $blocks): int {
    foreach ($blocks as $index => $block) {
        if ('zdw/intro-effect' === ($block['blockName'] ?? null)) {
            return $index;
        }
    }

    throw new RuntimeException('Best in Design hero block was not found.');
};

try {
    $posts = new WordPressPostStore();
    $heroMigration = new BestInDesignHeroMigration(
        $posts,
        new WordPressMediaStore(),
        new WordPressHeroBackgroundTransformer()
    );
    if ('warning' !== $heroMigration->preflight()[0]->severity()) {
        throw new RuntimeException('Best in Design hero migration did not plan the fixture change.');
    }
    $heroMigration->apply();
    if ('pass' !== $heroMigration->verify()[0]->severity()) {
        throw new RuntimeException('Best in Design hero migration verification failed.');
    }
    $savedHeroContent = (string) get_post(193)?->post_content;
    $savedHeroBlocks = parse_blocks($savedHeroContent);
    $savedHeroBlock = $savedHeroBlocks[$heroBlockIndex($savedHeroBlocks)];
    $heroAttrs = $savedHeroBlock['attrs'] ?? [];
    if ((int) $attachmentId !== ($heroAttrs['backgroundId'] ?? null) || false !== ($heroAttrs['applyEffect'] ?? null)) {
        throw new RuntimeException('Best in Design hero attributes do not match the local source.');
    }
    if (!str_contains((string) ($savedHeroBlock['innerHTML'] ?? ''), basename($relativeFile))) {
        throw new RuntimeException('Best in Design saved markup still references the old background.');
    }
    if (str_contains((string) ($savedHeroBlock['innerHTML'] ?? ''), 'data-apply-effect="1"')) {
        throw new RuntimeException('Best in Design saved markup still enables the old effect.');
    }

    $corruptBlocks = parse_blocks($hero->post_content);
    $corruptIndex = $heroBlockIndex($corruptBlocks);
    $corruptBlocks[$corruptIndex]['attrs']['backgroundId'] = (int) $attachmentId;
    $corruptBlocks[$corruptIndex]['attrs']['backgroundUrl'] = (string) wp_get_attachment_url((int) $attachmentId);
    $corruptBlocks[$corruptIndex]['attrs']['backgroundAlt'] = '';
    $corruptBlocks[$corruptIndex]['attrs']['applyEffect'] = false;
    $corruptResult = wp_update_post(['ID' => 193, 'post_content' => wp_slash(serialize_blocks($corruptBlocks))], true);
    if (is_wp_error($corruptResult)) {
        throw new RuntimeException($corruptResult->get_error_message());
    }
    $markupRepair = new BestInDesignHeroMarkupMigration($heroMigration);
    if ('warning' !== $markupRepair->preflight()[0]->severity()) {
        throw new RuntimeException('Best in Design markup repair did not detect stale saved HTML.');
    }
    $markupRepair->apply();
    if ('pass' !== $markupRepair->verify()[0]->severity()) {
        throw new RuntimeException('Best in Design markup repair verification failed.');
    }

    $canteenMigration = new DesignCanteenCleanupMigration(
        $posts,
        new WordPressDesignCanteenCleanupTransformer()
    );
    if ('warning' !== $canteenMigration->preflight()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen cleanup did not plan the fixture change.');
    }
    $canteenMigration->apply();
    if ('pass' !== $canteenMigration->verify()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen cleanup verification failed.');
    }
    $canteenContent = (string) get_post(12142)?->post_content;
    foreach (['Kudy tudy do kantýny?', 'Co ti letos naservírujeme na zlínském zámku?'] as $removed) {
        if (str_contains($canteenContent, $removed)) {
            throw new RuntimeException(sprintf('Obsolete Czech Design Canteen block remains: %s', $removed));
        }
    }
    if (!str_contains($canteenContent, 'CO KANTÝNA SERVÍROVALA MINULÝ ROK?')) {
        throw new RuntimeException('Czech Design Canteen cleanup removed the retained history section.');
    }

    $canteenRestore = wp_update_post(['ID' => 12142, 'post_content' => wp_slash($canteen->post_content)], true);
    if (is_wp_error($canteenRestore)) {
        throw new RuntimeException($canteenRestore->get_error_message());
    }
    $programCleanup = new DesignCanteenProgramCleanupMigration(
        new DesignCanteenCleanupMigration(
            $posts,
            new WordPressDesignCanteenCleanupTransformer()
        )
    );
    if ('warning' !== $programCleanup->preflight()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen program cleanup did not plan the fixture change.');
    }
    $programCleanup->apply();
    if ('pass' !== $programCleanup->verify()[0]->severity()) {
        throw new RuntimeException('Czech Design Canteen program cleanup verification failed.');
    }
    $canteenContent = (string) get_post(12142)?->post_content;
    foreach (['SOBOTA, 9. KVĚTNA', 'NEDĚLE, 10. KVĚTNA'] as $removed) {
        if (str_contains($canteenContent, $removed)) {
            throw new RuntimeException(sprintf('Obsolete Czech Design Canteen program block remains: %s', $removed));
        }
    }
    if (!str_contains($canteenContent, 'CO KANTÝNA SERVÍROVALA MINULÝ ROK?')) {
        throw new RuntimeException('Czech Design Canteen program cleanup removed the retained history section.');
    }

    $mixedLegacyGroup = <<<'BLOCKS'
<!-- wp:group --><div class="wp-block-group">
<!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Co ti letos naservírujeme na zlínském zámku?</h3><!-- /wp:heading -->
<!-- wp:columns --><div class="wp-block-columns"></div><!-- /wp:columns -->
<!-- wp:columns --><div class="wp-block-columns"></div><!-- /wp:columns -->
<!-- wp:paragraph --><p>Retained editorial note</p><!-- /wp:paragraph -->
</div><!-- /wp:group -->
BLOCKS;
    try {
        (new WordPressDesignCanteenCleanupTransformer())->desiredPageContent($mixedLegacyGroup);
        throw new RuntimeException('Czech Design Canteen cleanup accepted a mixed legacy group.');
    } catch (RuntimeException $error) {
        if (!str_contains($error->getMessage(), 'jiný obsah')) {
            throw $error;
        }
    }

    $rawLegacyGroup = <<<'BLOCKS'
<!-- wp:group --><div class="wp-block-group">Retained raw Canteen note
<!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Co ti letos naservírujeme na zlínském zámku?</h3><!-- /wp:heading -->
<!-- wp:columns --><div class="wp-block-columns"></div><!-- /wp:columns -->
<!-- wp:columns --><div class="wp-block-columns"></div><!-- /wp:columns -->
</div><!-- /wp:group -->
BLOCKS;
    try {
        (new WordPressDesignCanteenCleanupTransformer())->desiredPageContent($rawLegacyGroup);
        throw new RuntimeException('Czech Design Canteen cleanup accepted raw content in a legacy group.');
    } catch (RuntimeException $error) {
        if (!str_contains($error->getMessage(), 'jiný obsah')) {
            throw $error;
        }
    }
} finally {
    foreach ([193 => $hero->post_content, 12142 => $canteen->post_content] as $restoreId => $restoreContent) {
        $restored = wp_update_post(['ID' => $restoreId, 'post_content' => wp_slash($restoreContent)], true);
        if (is_wp_error($restored)) {
            fwrite(STDERR, sprintf(
                "Fixture restore for post ID %d failed: %s\n",
                $restoreId,
                $restored->get_error_message()
            ));
        }
    }
    delete_post_meta((int) $attachmentId, '_wp_attached_file');
    wp_delete_attachment((int) $attachmentId, true);
}

echo "Final content migrations integration test passed.\n";
