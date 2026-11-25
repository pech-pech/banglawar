# PGS layout gate

A Playwright check that opens a game at 7 installed-PWA sizes, visits every state via `window.__test`, and fails on layout bugs (clipped or overlapping text, horizontal scroll, tiny or covered tap targets). Full spec: `CONTRACT.md`.

## Sizes (CSS px)

fold-cover 344x882 (the eye size) and 475x638, fold-open 704x823 and 882x704, Galaxy S23 Ultra 384x824, desktop 1366x768 and 1920x1080.

## Gate a new game

1. Add `pages/<game>/layout-gate.json` (no marker = not gated; old games stay ungated):
   `{"version":1,"entry":"index.html","minStates":3,"canvas":false,"webgl":false,"settleMs":150,"soft":[],"waivers":[]}`
2. Expose `window.__test = { ready, states(), goto(name), seed(n) }` (see CONTRACT section 4). Every reachable screen must be a state.
3. Tag where useful: `data-layout="mark"` (chart marks), `"fill"` (should be mostly used), `"ignore"` (decor), `data-layout-ok="reason"` (exempt, counted as waiver).
4. New `pages/<g>/index.html` without the marker fails CI.

## Run locally

```
cd tools/layout-gate && npm install && npx playwright install chromium && npm test
node tools/layout-gate/gate.mjs --game <game> --out /tmp/lg
node tools/layout-gate/gated.mjs --list
node tools/layout-gate/gated.mjs --changed origin/main
```

Exit 0 = PASS, 1 = FAIL, 2 = usage/crash. Paste the printed `Layout gate: ...` line into the PR body.

## Read the report

`<out>/layout-report.json` has verdict, counts, and every issue (size, state, check, detail, selector, box). `sheet-<size>.png` is a grid of state thumbnails with red HARD counts. Inspectors look at `sheet-fold-cover-344x882.png` plus 2x close-ups at 344x882 only. Default out is `pages/<game>/qa/layout/`; the report is tied to the game by `gameHash`, so any edit after a run makes it stale.

## SOFT vs HARD

HARD issues fail the gate. SOFT issues (fill-empty, svg-empty-half, canvas-*) are reported but never block until calibrated on 3 games. Only M can move a check to `soft` or add `waivers` in a game's marker, and only by card; makers and the assistant never add them on their own.

## Locks

- Plugin hook: blocks ready/merge/non-draft PR actions unless each changed gated game has a PASS report with a matching `gameHash`. Bypass only via `.layout-gate-waiver` (`M waived by card: <reason>`), which the assistant never writes.
- CI (`.github/workflows/layout-gate.yml`): unit tests, new-game marker check, gate on each changed gated game, report uploaded as artifact `layout-out`.
- gameup rule: layout report missing, stale or FAIL means the verdict cannot be GO.

## Calibration

See `calibrate/CALIBRATION.md` (Chart school buggy 9d23ac3 vs fixed f7e77c5).
