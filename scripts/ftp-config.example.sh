#!/bin/sh

# Copy to ftp-config.sh and fill in the values from WEDOS. ftp-config.sh is
# ignored by Git; the password belongs only in macOS Keychain.
ZDW_FTP_HOST='123456.w00.wedos.net'
ZDW_FTP_PORT='21'
ZDW_FTP_USER='w123456_example'
ZDW_FTP_KEYCHAIN_SERVICE='zdw-wedos-ftp'
ZDW_FTP_WEBROOT='/2026'
ZDW_LFTP_BIN='/opt/homebrew/bin/lftp'
