#!/bin/sh

set -eu
set +x

ZDW_SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
. "${ZDW_SCRIPT_DIR}/ftp-common.sh"

ZDW_REMOTE_PATH="${1:-/}"
zdw_ftp_validate_remote_path "${ZDW_REMOTE_PATH}"
zdw_ftp_load_password

ZDW_LFTP_SETTINGS="$(zdw_ftp_connection_settings)"

"${ZDW_LFTP_BIN}" -c "
${ZDW_LFTP_SETTINGS}
open --env-password --user ${ZDW_FTP_USER} --port ${ZDW_FTP_PORT} ftp://${ZDW_FTP_HOST};
cls -la ${ZDW_REMOTE_PATH};
"
