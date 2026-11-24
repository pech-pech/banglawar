# PWA update e2e

Checks contract pgs-update-1 (`pages/_shared/CONTRACT-pwa-update.md` section 8) in headless Chromium.

    node tests/pwa-update/e2e.js [game,...] [--no-legacy] [--legacy-only] [--jobs N] [--timeout S] [--list]

- Default: all games, `--jobs 4` (admin default), `--timeout 120` seconds per game (admin default).
- Needs `playwright` (preinstalled), `python3`, and `git` (legacy step uses `git archive $PGS_LEGACY_REF pages`,
  default `origin/main`).
- Builds are copied into `os.tmpdir()` once per build (A, B, C, L) and stamped with
  `tools/stamp_build.py <dir> --salt X --only <games>`. One local server per game maps `/banglawar/*` to the current
  dir with `Cache-Control: max-age=600`.

Steps per game: 1 first load on A (controller + `PGS_BUILD`==A); 2 swap to B, reload, expect B; 4 offline reload
still B; 3 toast path (first game only, `PGS_UPDATE_CFG={autoReloadWindowMs:0}`, swap to C, `PGS_UPDATE.check()`,
`#pgs-update-toast`, click `#pgs-update-reload`, expect C); 5 legacy (old SW from the ref, swap to B, up to 3
reloads, prints reload count). Output: one PASS/FAIL line per game per step; exit 1 on any FAIL. Page errors are
logged, never fail. `--legacy-only` skips steps 1-4 (works before the new SW exists).
