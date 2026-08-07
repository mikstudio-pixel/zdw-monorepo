#!/bin/sh

set -eu
set +x

ZDW_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
. "${ZDW_SCRIPT_DIR}/ftp-common.sh"

ZDW_STTY_STATE="$(stty -g)"
trap 'stty "${ZDW_STTY_STATE}" 2>/dev/null || true' EXIT HUP INT TERM

printf 'FTP heslo pro %s: ' "${ZDW_FTP_USER}"
stty -echo
IFS= read -r ZDW_FTP_SECRET
stty "${ZDW_STTY_STATE}"
printf '\n'

if [ -z "${ZDW_FTP_SECRET}" ]; then
    echo 'Heslo nesmí být prázdné.' >&2
    exit 1
fi

security add-generic-password \
    -U \
    -a "${ZDW_FTP_USER}" \
    -s "${ZDW_FTP_KEYCHAIN_SERVICE}" \
    -w "${ZDW_FTP_SECRET}" >/dev/null

unset ZDW_FTP_SECRET
echo 'Heslo bylo uloženo do macOS Klíčenky; v projektu ani ve skriptech není.'
