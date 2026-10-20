<?php

declare(strict_types=1);

namespace ZDW\ReleaseManager\Infrastructure\WordPress;

use ZDW\ReleaseManager\Application\EnvironmentAudit;
use ZDW\ReleaseManager\Application\MigrationRunner;
use ZDW\ReleaseManager\Domain\MigrationPlanItem;
use ZDW\ReleaseManager\Domain\PreflightCheck;
use ZDW\ReleaseManager\Domain\RunResult;

final class AdminPage
{
    public function __construct(
        private readonly EnvironmentAudit $audit,
        private readonly WordPressEnvironmentCollector $collector,
        private readonly MigrationRunner $runner
    ) {
    }

    public function register(): void
    {
        add_submenu_page(
            'zdw-functions',
            'ZDW nasazení',
            'Nasazení',
            'manage_options',
            'zdw-release-manager',
            [$this, 'render']
        );
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Nemáte oprávnění spravovat nasazení.', 'zdw-release-manager'));
        }

        $checks = null;
        $runResult = null;
        if ('POST' === ($_SERVER['REQUEST_METHOD'] ?? '') && isset($_POST['zdw_release_manager_action'])) {
            $action = sanitize_key(wp_unslash($_POST['zdw_release_manager_action']));
            if ('preflight' === $action) {
                check_admin_referer('zdw_release_manager_preflight');
                $checks = $this->audit->inspect($this->collector->collect());
            } elseif ('apply' === $action && isset($_POST['migration_id'])) {
                $migrationId = sanitize_key(wp_unslash($_POST['migration_id']));
                check_admin_referer('zdw_release_manager_apply_' . $migrationId);
                $checks = $this->audit->inspect($this->collector->collect());

                if ($this->hasBlockingChecks($checks)) {
                    $runResult = new RunResult(
                        RunResult::BLOCKED,
                        'Migrace nebyla spuštěna, protože kontrola prostředí obsahuje blokující chybu.',
                        $checks
                    );
                } else {
                    $runResult = $this->runner->apply($migrationId);
                }
            }
        }

        $plan = $this->runner->plan();
        ?>
        <div class="wrap">
            <h1>ZDW nasazení</h1>
            <p>Bezpečný, verzovaný deployment stránek, menu a nastavení. Audit nic nemění.</p>

            <?php if ($runResult instanceof RunResult) : ?>
                <?php $this->renderRunResult($runResult); ?>
            <?php endif; ?>

            <h2>Kontrola prostředí</h2>
            <form method="post">
                <?php wp_nonce_field('zdw_release_manager_preflight'); ?>
                <input type="hidden" name="zdw_release_manager_action" value="preflight">
                <?php submit_button('Spustit kontrolu', 'secondary', 'submit', false); ?>
            </form>

            <?php if (is_array($checks)) : ?>
                <?php $this->renderChecks($checks); ?>
            <?php endif; ?>

            <h2>Dostupné migrace</h2>
            <?php $this->renderPlan($plan); ?>
        </div>
        <?php
    }

    /** @param list<PreflightCheck> $checks */
    private function renderChecks(array $checks): void
    {
        echo '<table class="widefat striped" style="max-width:1100px;margin-top:16px"><thead><tr><th>Stav</th><th>Kontrola</th><th>Výsledek</th></tr></thead><tbody>';
        foreach ($checks as $check) {
            $labels = [
                PreflightCheck::PASS => 'OK',
                PreflightCheck::WARNING => 'Varování',
                PreflightCheck::BLOCKER => 'Blokuje',
            ];
            printf(
                '<tr><td><strong>%1$s</strong></td><td><code>%2$s</code></td><td>%3$s</td></tr>',
                esc_html($labels[$check->severity()] ?? $check->severity()),
                esc_html($check->code()),
                esc_html($check->message())
            );
        }
        echo '</tbody></table>';
    }

    /** @param list<MigrationPlanItem> $plan */
    private function renderPlan(array $plan): void
    {
        if ([] === $plan) {
            echo '<div class="notice notice-info inline"><p>Nejsou zaregistrované žádné migrace.</p></div>';

            return;
        }

        echo '<table class="widefat striped" style="max-width:1100px"><thead><tr><th>ID</th><th>Migrace</th><th>Kontroly</th><th>Stav a akce</th></tr></thead><tbody>';
        foreach ($plan as $item) {
            echo '<tr>';
            printf('<td><code>%s</code></td>', esc_html($item->migrationId()));
            printf('<td>%s</td>', esc_html($item->label()));
            echo '<td>';
            foreach ($item->checks() as $check) {
                printf(
                    '<div><strong>%1$s:</strong> %2$s</div>',
                    esc_html($check->severity()),
                    esc_html($check->message())
                );
            }
            echo '</td><td>';
            if (MigrationPlanItem::READY === $item->status()) {
                echo '<form method="post">';
                wp_nonce_field('zdw_release_manager_apply_' . $item->migrationId());
                printf(
                    '<input type="hidden" name="zdw_release_manager_action" value="apply"><input type="hidden" name="migration_id" value="%s">',
                    esc_attr($item->migrationId())
                );
                submit_button(
                    'Aplikovat migraci',
                    'primary small',
                    'submit',
                    false,
                    ['onclick' => "return confirm('Opravdu aplikovat tuto databázovou migraci?');"]
                );
                echo '</form>';
            } else {
                echo esc_html($item->status());
            }
            echo '</td></tr>';
        }
        echo '</tbody></table>';
    }

    private function renderRunResult(RunResult $result): void
    {
        $noticeClass = RunResult::APPLIED === $result->status()
            ? 'notice-success'
            : (RunResult::SKIPPED === $result->status() ? 'notice-info' : 'notice-error');

        printf(
            '<div class="notice %1$s inline"><p><strong>%2$s</strong> %3$s</p></div>',
            esc_attr($noticeClass),
            esc_html($result->status()),
            esc_html($result->message())
        );

        if ([] !== $result->checks()) {
            $this->renderChecks($result->checks());
        }
    }

    /** @param list<PreflightCheck> $checks */
    private function hasBlockingChecks(array $checks): bool
    {
        foreach ($checks as $check) {
            if ($check->isBlocking()) {
                return true;
            }
        }

        return false;
    }
}
