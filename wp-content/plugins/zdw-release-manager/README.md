# ZDW Release Manager

Versioned, auditable and idempotent WordPress content migrations for Zlin
Design Week. Version 0.3.0 includes environment preflight, a tested migration
runner, and six idempotent migrations for settings, contact content, the
sponsor page, navigation, and the homepage intro video.

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
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/contact-content-transformer.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/navigation-store.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/homepage-intro.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-upgrade-lock.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-menu-restore.php

docker compose exec -T wordpress php \
  /var/www/html/wp-content/plugins/zdw-release-manager/tests/Integration/two-tier-enable-retry.php
```

## Safety model

- Every migration has a unique, versioned ID.
- Applied migrations are skipped on subsequent runs.
- Blocking preflight checks prevent writes.
- A migration is marked complete only after post-write verification succeeds.
- Every write is protected by the WordPress capability check and a per-migration nonce.
- Applying a migration reruns the environment audit and refuses to write when it contains a blocker.

The homepage intro migration is intentionally blocked until
`zdw-bg-trimmed-30-muted.mp4` exists exactly once in the WordPress Media
Library. It resolves the production attachment ID and URL at runtime and
replaces only the first intro block, preserving the remaining homepage.
