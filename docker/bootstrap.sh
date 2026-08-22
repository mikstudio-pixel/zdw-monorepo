#!/bin/sh
set -eu

cd /var/www/html

echo "Čekám na dokončení importu databáze a inicializaci WordPressu…"
attempt=0
until wp core is-installed --path=/var/www/html >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 180 ]; then
        echo "WordPress nebyl připraven ani po 6 minutách." >&2
        exit 1
    fi
    sleep 2
done

echo "Přepisuji produkční adresy na ${ZDW_LOCAL_URL}…"
wp search-replace \
    'https://zlindesignweek.com/2026' \
    "${ZDW_LOCAL_URL}" \
    --all-tables-with-prefix \
    --precise \
    --recurse-objects \
    --skip-columns=guid \
    --quiet

wp search-replace \
    'http://zlindesignweek.com/2026' \
    "${ZDW_LOCAL_URL}" \
    --all-tables-with-prefix \
    --precise \
    --recurse-objects \
    --skip-columns=guid \
    --quiet

wp search-replace \
    '//zlindesignweek.com/2026' \
    "${ZDW_LOCAL_URL}" \
    --all-tables-with-prefix \
    --precise \
    --recurse-objects \
    --skip-columns=guid \
    --quiet

wp search-replace \
    '/data/web/virtuals/211950/virtual/www/2026' \
    '/var/www/html' \
    --all-tables-with-prefix \
    --precise \
    --recurse-objects \
    --quiet

wp option update blog_public 0 --quiet

if wp user get "${ZDW_LOCAL_ADMIN_USER}" >/dev/null 2>&1; then
    existing_email="$(wp user get "${ZDW_LOCAL_ADMIN_USER}" --field=user_email)"
    if [ "${existing_email}" != "${ZDW_LOCAL_ADMIN_EMAIL}" ]; then
        echo "Login ${ZDW_LOCAL_ADMIN_USER} už používá jiný účet (${existing_email}); lokální přihlašovací údaje nelze bezpečně nastavit." >&2
        exit 1
    fi
    wp user update \
        "${ZDW_LOCAL_ADMIN_USER}" \
        --role=administrator \
        --user_pass="${ZDW_LOCAL_ADMIN_PASSWORD}" \
        --quiet
else
    existing_login="$(wp user get "${ZDW_LOCAL_ADMIN_EMAIL}" --field=user_login 2>/dev/null || true)"
    if [ -n "${existing_login}" ]; then
        echo "E-mail ${ZDW_LOCAL_ADMIN_EMAIL} už používá jiný účet (${existing_login}); lokálního administrátora nelze vytvořit." >&2
        exit 1
    fi
    wp user create \
        "${ZDW_LOCAL_ADMIN_USER}" \
        "${ZDW_LOCAL_ADMIN_EMAIL}" \
        --role=administrator \
        --user_pass="${ZDW_LOCAL_ADMIN_PASSWORD}" \
        --quiet
fi

if wp theme is-installed zdw-theme-child >/dev/null 2>&1 \
    && wp theme is-installed zdw-theme >/dev/null 2>&1; then
    wp theme activate zdw-theme-child --quiet
elif wp theme is-installed zdw-theme >/dev/null 2>&1; then
    echo "Child theme zdw-theme-child chybí; dočasně aktivuji parent theme."
    wp theme activate zdw-theme --quiet
elif wp theme is-installed twentytwentyfive >/dev/null 2>&1; then
    echo "Vlastní téma zdw-theme chybí; dočasně aktivuji Twenty Twenty-Five."
    wp theme activate twentytwentyfive --quiet
else
    echo "Upozornění: není dostupné vlastní ani výchozí téma." >&2
fi

if ! wp rewrite structure '/%postname%/' --hard --quiet; then
    echo 'Upozornění: nepodařilo se nastavit pretty permalinks.' >&2
fi
if ! wp cache flush --quiet; then
    echo 'Upozornění: nepodařilo se vyprázdnit cache.' >&2
fi

echo "Lokální kopie je připravená na ${ZDW_LOCAL_URL}"
