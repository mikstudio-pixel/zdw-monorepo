# Zlin Design Week

Two independent projects share this repository:

| Project | Contents | Getting started |
| --- | --- | --- |
| [`wordpress/`](wordpress/README.md) | WordPress child theme, maintained plugins, Docker and FTPES tooling | `cd wordpress` and follow its README |
| [`liquid-studio/`](liquid-studio/README.md) | Desktop and browser video/image editor, shared WebGL effects and the original prototype | `cd liquid-studio` and follow its README |

Run commands from the relevant project directory. WordPress deployment scripts
remain inside `wordpress/` and upload only its selected theme or plugin.
Liquid Studio has its own build and is not deployed with WordPress.

Production data, WordPress core, third-party plugins, uploads, installed
dependencies and application build outputs are excluded from Git.

The **Tests** GitHub Actions workflow runs manually after reviews are resolved.
It checks the WordPress release manager and Liquid Studio's desktop and browser
code. See each project's README for local verification commands.
