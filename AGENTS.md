# Project layout

WordPress lives in `wordpress/`; Liquid Studio lives in `liquid-studio/`.
Run project tools in their own directories. Preserve WordPress's restrictive
source allowlist and deployment scope. Do not commit production data, local
credentials, dependencies or generated application builds.

# Pull requests

Open PRs ready for review. Address Codex, CodeRabbit and Macroscope feedback on
the current HEAD before running remote CI. If CodeRabbit has no capacity, do
not wait for it. Once available reviews are clean, dispatch `tests.yml` exactly
once and wait for it to pass. Recheck all review threads and pending reviews
before finishing. Keep fixes proportionate and maintainable.
