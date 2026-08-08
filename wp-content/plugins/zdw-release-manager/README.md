# ZDW Release Manager

Versioned, auditable and idempotent WordPress content migrations for Zlin
Design Week. Version 0.6.0 includes environment preflight, a tested migration
runner, and ten idempotent migrations for colors and settings, contact
content, translated sponsor pages, navigation, final homepages, the Best in
Design hero, and removal of obsolete Czech Design Canteen sections.

## Development

Requirements: PHP 8.2+ and Composer.

```sh
composer install
composer test
```

Integration tests run against the local Docker WordPress:

```sh
docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/option-state-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/environment-collector.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/wordpress-option-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/post-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/contact-content-transformer.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/navigation-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/homepage-intro.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/homepage-body.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/design-canteen.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/media-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/contact-block-render.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/sponsor-block-render.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/final-content-migrations.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-upgrade-lock.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-menu-restore.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-enable-retry.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-render-ids.php
```

## Safety model

- Every migration has a unique, versioned ID.
- The runner only uses the current WordPress database connection; it has no
  source-site URL, credentials or remote write transport. The local migration
  lab uses a separate Compose project and separate named volumes.
- Applied migrations are skipped on subsequent runs.
- Blocking preflight checks prevent writes.
- All migration writes share one execution lease, so migrations that touch the
  same page cannot run concurrently.
- A migration is marked complete only after post-write verification succeeds.
- Every write is protected by the WordPress capability check and a per-migration nonce.
- Applying a migration reruns the environment audit and refuses to write when it contains a blocker.

The homepage intro migration is intentionally blocked until
`zdw-bg-trimmed-30-muted.mp4` exists exactly once in the WordPress Media
Library. It resolves the production attachment ID and URL at runtime and
replaces only the first intro block on both Czech and English homepages. A
separate guarded migration gives both localized homepages the same compact
structure and removes obsolete event cards. Another guarded migration removes
the outdated 2026 programme from the English Design Canteen while retaining
its translated evergreen sections.

The content-transformer integration fixture uses revisions `43859` and `40676`
from the SQL dump configured through `ZDW_SQL_DUMP`. Restore the matching
Updraft/SQL test copy before running that script; a missing fixture means the
required test database has not been restored.
