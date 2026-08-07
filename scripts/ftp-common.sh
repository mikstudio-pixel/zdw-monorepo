#!/bin/sh

set -eu
set +x

readonly ZDW_FTP_CONFIG="${ZDW_SCRIPT_DIR}/ftp-config.sh"

if [ ! -f "${ZDW_FTP_CONFIG}" ]; then
    echo 'Chybí scripts/ftp-config.sh.' >&2
    echo 'Zkopírujte scripts/ftp-config.example.sh a doplňte údaje z WEDOS.' >&2
    exit 1
fi

. "${ZDW_FTP_CONFIG}"

: "${ZDW_FTP_HOST:?Chybí ZDW_FTP_HOST}"
: "${ZDW_FTP_PORT:?Chybí ZDW_FTP_PORT}"
: "${ZDW_FTP_USER:?Chybí ZDW_FTP_USER}"
: "${ZDW_FTP_KEYCHAIN_SERVICE:?Chybí ZDW_FTP_KEYCHAIN_SERVICE}"
: "${ZDW_FTP_WEBROOT:?Chybí ZDW_FTP_WEBROOT}"
: "${ZDW_LFTP_BIN:?Chybí ZDW_LFTP_BIN}"

readonly ZDW_FTP_HOST ZDW_FTP_PORT ZDW_FTP_USER ZDW_FTP_KEYCHAIN_SERVICE ZDW_FTP_WEBROOT ZDW_LFTP_BIN

zdw_ftp_load_password() {
    if ! ZDW_FTP_SECRET="$(
        security find-generic-password \
            -a "${ZDW_FTP_USER}" \
            -s "${ZDW_FTP_KEYCHAIN_SERVICE}" \
            -w 2>/dev/null
    )"; then
        echo 'FTP heslo není uložené v macOS Klíčence.' >&2
        echo 'Spusťte nejprve: ./scripts/ftp-save-password.sh' >&2
        exit 1
    fi

    export LFTP_PASSWORD="${ZDW_FTP_SECRET}"
    unset ZDW_FTP_SECRET
}

zdw_ftp_validate_remote_path() {
    case "${1}" in
        /*) ;;
        *)
            echo "Vzdálená cesta musí být absolutní: ${1}" >&2
            exit 2
            ;;
    esac

    case "${1}" in
        *[!A-Za-z0-9_./-]*)
            echo "Vzdálená cesta obsahuje nepovolené znaky: ${1}" >&2
            exit 2
            ;;
    esac

    case "${1}" in
        *'//'*)
            echo "Vzdálená cesta obsahuje prázdnou část: ${1}" >&2
            exit 2
            ;;
        '/.'|*'/./'*|*'/.'|'/..'|*'/../'*|*'/..')
            echo "Vzdálená cesta nesmí obsahovat . ani ..: ${1}" >&2
            exit 2
            ;;
    esac
}

zdw_ftp_connection_settings() {
    cat <<'EOF'
set cmd:fail-exit true;
set net:max-retries 2;
set net:timeout 20;
set net:reconnect-interval-base 5;
set ftp:passive-mode true;
set ftp:ssl-force true;
set ftp:ssl-protect-data true;
set ssl:verify-certificate true;
EOF
}
