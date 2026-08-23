#!/bin/sh

set -eu
set +x

ZDW_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
readonly ZDW_PROJECT_ROOT="$(CDPATH='' cd -- "${ZDW_SCRIPT_DIR}/.." && pwd)"
. "${ZDW_SCRIPT_DIR}/ftp-common.sh"

zdw_usage() {
    cat >&2 <<'EOF'
Použití:
  ./scripts/ftp-deploy.sh preview theme <název-adresáře>
  ./scripts/ftp-deploy.sh preview plugin <název-adresáře>
  ./scripts/ftp-deploy.sh upload theme <název-adresáře> --confirm-upload
  ./scripts/ftp-deploy.sh upload plugin <název-adresáře> --confirm-upload

Skript nikdy nemaže vzdálené soubory. Režim preview nic nenahrává.
EOF
    exit 2
}

[ "$#" -ge 3 ] || zdw_usage

readonly ZDW_DEPLOY_MODE="$1"
readonly ZDW_COMPONENT_TYPE="$2"
readonly ZDW_COMPONENT_NAME="$3"
readonly ZDW_CONFIRMATION="${4:-}"

case "${ZDW_DEPLOY_MODE}" in
    preview|upload) ;;
    *) zdw_usage ;;
esac

case "${ZDW_COMPONENT_TYPE}" in
    theme)
        readonly ZDW_COMPONENT_PARENT='themes'
        ;;
    plugin)
        readonly ZDW_COMPONENT_PARENT='plugins'
        ;;
    *) zdw_usage ;;
esac

case "${ZDW_COMPONENT_NAME}" in
    ''|'.'|'..'|*[!A-Za-z0-9_.-]*)
        echo "Neplatný název adresáře: ${ZDW_COMPONENT_NAME}" >&2
        exit 2
        ;;
esac

readonly ZDW_LOCAL_SOURCE="wp-content/${ZDW_COMPONENT_PARENT}/${ZDW_COMPONENT_NAME}"
readonly ZDW_REMOTE_TARGET="${ZDW_FTP_WEBROOT}/wp-content/${ZDW_COMPONENT_PARENT}/${ZDW_COMPONENT_NAME}"

if [ ! -d "${ZDW_PROJECT_ROOT}/${ZDW_LOCAL_SOURCE}" ]; then
    echo "Lokální adresář neexistuje: ${ZDW_LOCAL_SOURCE}" >&2
    exit 2
fi

zdw_ftp_validate_remote_path "${ZDW_REMOTE_TARGET}"

if [ "${ZDW_DEPLOY_MODE}" = 'upload' ] && [ "${ZDW_CONFIRMATION}" != '--confirm-upload' ]; then
    echo 'Upload nebyl potvrzen. Nejprve spusťte preview a zkontrolujte výstup.' >&2
    zdw_usage
fi

zdw_ftp_load_password
ZDW_LFTP_SETTINGS="$(zdw_ftp_connection_settings)"

if [ "${ZDW_DEPLOY_MODE}" = 'preview' ]; then
    readonly ZDW_MIRROR_MODE='--dry-run'
else
    readonly ZDW_MIRROR_MODE=''
fi

echo "Zdroj:  ${ZDW_LOCAL_SOURCE}"
echo "Cíl:    ${ZDW_REMOTE_TARGET}"
echo "Režim:  ${ZDW_DEPLOY_MODE} (bez mazání vzdálených souborů)"

cd "${ZDW_PROJECT_ROOT}"

"${ZDW_LFTP_BIN}" -c "
${ZDW_LFTP_SETTINGS}
open --env-password --user ${ZDW_FTP_USER} --port ${ZDW_FTP_PORT} ftp://${ZDW_FTP_HOST};
mirror --reverse --transfer-all --overwrite --no-perms --parallel=4 --verbose=1 --max-errors=1 ${ZDW_MIRROR_MODE} \
  --exclude-glob .DS_Store \
  --exclude '^\.git(/|$)' \
  --exclude '^vendor(/|$)' \
  --exclude '^tests(/|$)' \
  --exclude '^tools(/|$)' \
  --exclude '^\.phpunit\.cache(/|$)' \
  --exclude-glob composer.json \
  --exclude-glob composer.lock \
  --exclude-glob phpunit.xml.dist \
  ${ZDW_LOCAL_SOURCE} ${ZDW_REMOTE_TARGET};
"
