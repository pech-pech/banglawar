# PGS layout gate: contract (v1, 2026-11-25)

Spec: games-design/pgs-layout-gate/PROPOSAL.md section 0 (M's locked picks). This file is the single contract for all makers.
Node 20+ (local 22), Playwright 1.63 (cloud image has it globally; CI installs `playwright@1.63.0`). ES modules (`.mjs`) for Node files; plain browser JS (`.js`, no imports) for files injected into pages. No other dependencies.

## 1. Files (one owner each)

| Path (repo root) | What | Owner |
|---|---|---|
| tools/layout-gate/CONTRACT.md | this file | lead |
| tools/layout-gate/probe.js | in-page DOM/SVG checks: defines `window.__pgsLayoutProbe(opt)` | M1 |
| tools/layout-gate/fixtures/bad.html, good.html | DOM/SVG fixtures with `window.__test` | M1 |
| tools/layout-gate/test/probe.test.mjs | node --test: bad.html hits every HARD check, good.html zero HARD | M1 |
| tools/layout-gate/canvas-hook.js | init script: logs canvas fillText/strokeText boxes into `window.__pgsCanvasText` | M3 |
| tools/layout-gate/canvas-probe.js | in-page canvas checks: defines `window.__pgsCanvasProbe(opt)` | M3 |
| tools/layout-gate/fixtures/canvas.html (+ canvas-good.html) | canvas fixtures with `window.__test` | M3 |
| tools/layout-gate/test/canvas.test.mjs | node --test for canvas path | M3 |
| tools/layout-gate/gate.mjs | CLI runner: server, viewports, states, report, contact sheets | M2 |
| tools/layout-gate/hash.mjs | `gameHash(gameDir)` export + CLI | M2 |
| tools/layout-gate/test/gate.test.mjs | node --test: gate on fixtures (bad = FAIL, good = PASS, report shape, hash) | M2 |
| tools/layout-gate/gated.mjs | lists gated games; `--changed <base>` filter; new-game marker check | M4 |
| tools/layout-gate/package.json | `{"type":"module","private":true,"devDependencies":{"playwright":"1.63.0"},"scripts":{"test":"node --test test/*.test.mjs"}}` | M4 |
| .github/workflows/layout-gate.yml | CI check | M4 |
| tools/layout-gate/README.md | how to use, add a game, waive | M4 |
| tools/layout-gate/calibrate/chart-school-shim.js + calibrate.mjs + CALIBRATION.md | fixture run on Chart school 9d23ac3 (buggy) vs f7e77c5 (fixed) | M7 |
| plugin pgs-1.13.0 hooks/layout-gate.mjs + .test.mjs + hooks.json | ready/merge lock | M5 |
| plugin pgs-1.13.0 skills, agents, README, plugin.json, scripts/layout-gate/ template | rule text | M6 |

## 2. Sizes (CSS px, installed PWA, no browser bars)

```js
export const SIZES = [
  { id: 'fold-cover-344x882', w: 344, h: 882, device: 'Fold cover', mobile: true, eye: true },
  { id: 'fold-cover-475x638', w: 475, h: 638, device: 'Fold cover', mobile: true },
  { id: 'fold-open-704x823',  w: 704, h: 823, device: 'Fold open portrait', mobile: true },
  { id: 'fold-open-882x704',  w: 882, h: 704, device: 'Fold open landscape', mobile: true },
  { id: 's23u-384x824',       w: 384, h: 824, device: 'Galaxy S23 Ultra', mobile: true },
  { id: 'desk-1366x768',      w: 1366, h: 768, device: 'Desktop', mobile: false },
  { id: 'desk-1920x1080',     w: 1920, h: 1080, device: 'Desktop', mobile: false },
];
```
Context: `viewport {w,h}`, `deviceScaleFactor 1`, `hasTouch` + `isMobile` = `mobile`, `serviceWorkers: 'block'`, `reducedMotion: 'reduce'`. Standalone mode via init script: `matchMedia('(display-mode: standalone)')` and `(display-mode: fullscreen)` return matches true; `navigator.standalone = true`. Page URL gets `?layoutgate=1`.

## 3. Marker file `pages/<game>/layout-gate.json` (no marker = game not gated)

```json
{
  "version": 1,
  "entry": "index.html",
  "minStates": 3,
  "canvas": false,
  "webgl": false,
  "settleMs": 150,
  "soft": [],
  "waivers": []
}
```
- `soft`: check ids M has allowed to stay SOFT for this game (only M, by card).
- `waivers`: `[{ "check": "<id>", "state": "<name or *>", "size": "<size id or *>", "match": "<substring of detail>", "reason": "<why>" }]`. A waived HARD issue counts as waived, not fail.
- `webgl: true`: report adds `notChecked: ["webgl-scene"]`; never claims PASS for scene content.

## 4. Game test hook `window.__test` (required in gated games)

```js
window.__test = {
  ready: true,                 // boolean, or a Promise that resolves when the app is ready
  states(),                    // -> string[] (or Promise of it): every reachable screen/state name, >= minStates
  goto(name),                  // -> Promise<void>: put the app into that state from anywhere (seeded, no animation wait)
  seed(n),                     // set RNG seed (called with 1 before states())
};
```
Gate waits up to 10 s for `window.__test` and `ready`. Missing hook, throw in goto, or fewer than `minStates` states = HARD fail `contract`.

## 5. Tags (author side, optional except where noted)

- `data-layout="mark"`: a chart/plot/game mark; word text must not sit over it.
- `data-layout="fill"`: a content box that should be mostly used (SOFT empty check).
- `data-layout-ok="reason"` on an element (or ancestor): that element is exempt from all checks; counted as a waiver with the reason.
- `data-layout="ignore"`: decorative layer excluded from checks without counting (backgrounds, particles). Use sparingly; counted in report `ignored`.

## 6. In-page probe API

`window.__pgsLayoutProbe(opt)` returns `Issue[]` (DOM + SVG). `window.__pgsCanvasProbe(opt)` returns `Issue[]` (canvas). Both are pure, synchronous, no imports.

```js
opt = { dupPx: 14, tapMin: 48, textMin: 12, fillMin: 0.6, overlapFrac: 0.15 }
Issue = { check: '<id>', severity: 'HARD'|'SOFT', detail: '<short human text>', sel: '<css-ish path>', box: [x,y,w,h], waived: '<reason>'|undefined }
```

Check ids (exact strings):

| id | severity | rule |
|---|---|---|
| `h-scroll` | HARD | `documentElement.scrollWidth > innerWidth + 1` |
| `offscreen` | HARD | visible text/control box outside viewport horizontally, or a fixed/sticky element outside viewport |
| `clipped` | HARD | text cut: own text wider/taller than an ancestor with overflow hidden/clip, or `text-overflow: ellipsis` actually truncating |
| `text-overlap` | HARD | two visible text boxes (HTML or SVG `text`) overlap > overlapFrac of the smaller, neither contains the other |
| `dup-label` | HARD | same text (len > 1) drawn 2+ times within dupPx x and 1.5*dupPx y |
| `tap-small` | HARD | visible `button,a[href],[role=button],input,select,textarea,[data-act],[onclick]` under tapMin in width or height (not inside svg unless it has role=button) |
| `tap-covered` | HARD | `elementFromPoint` at the tap target centre is not the target or its descendant/ancestor-label |
| `text-small` | HARD | computed font-size < textMin for visible text (SVG text: rendered height of glyph box < textMin*0.75) |
| `text-over-mark` | HARD | word text (3+ letters) overlaps a `[data-layout=mark]` element > 25% of text area, text not inside that mark |
| `under-bar` | HARD | probe scrolls the main scroller to its max, then a visible tap target or text of normal content whose centre is still hit by a `position:fixed/sticky` element (not its own ancestor) is reported; scroll restored. Pairs with exactly one side in a fixed/sticky bar are skipped by `text-overlap`, `text-over-mark`, `tap-covered` |
| `fill-empty` | SOFT | `[data-layout=fill]` box: union of visible children/marks covers < fillMin of its width or one half (left/right) is empty |
| `svg-empty-half` | SOFT | untagged svg >= 120x60 with > 8 shapes: one horizontal half holds < 8% of shapes |
| `canvas-text-overlap` | SOFT | logged canvas text boxes overlap (same canvas) |
| `canvas-dup-label` | SOFT | same canvas text within dupPx |
| `canvas-text-outside` | SOFT | canvas text box outside its canvas |
| `canvas-empty-half` | SOFT | 2d canvas pixel check: left or right half blank |
| `contract` | HARD | gate-side only (hook missing, goto threw, too few states) |
| `load-error` | HARD | gate-side only (page error / console error at load) |

SOFT -> HARD after calibration on 3 games (Chart school SVG, Trivia Duel canvas, Cricket Sixes mixed); until then SOFT never blocks.
Visibility: width and height >= 1, not `display:none`/`visibility:hidden`/`opacity:0` (self or ancestor), not under `[aria-hidden=true]`, not `[data-layout=ignore]`.

## 7. Gate CLI

```
node tools/layout-gate/gate.mjs --game <name> [--pages pages] [--base http://...] [--sizes id,id] [--out <dir>] [--shim <file.js>] [--no-sheets] [--json]
```
- No `--base`: serves `--pages` dir (default `pages`) on a free port with a tiny built-in static server (node:http, correct MIME types).
- Loads `<base>/<game>/<entry>?layoutgate=1`. Init scripts in order: standalone shim, canvas-hook.js, `--shim` file (fixtures/calibration only), then probe.js + canvas-probe.js added after load via `addScriptTag`.
- For each size: `seed(1)`, `states()`, for each state: `goto(state)`, wait 2 rAF + `settleMs`, run both probes, apply marker waivers, screenshot (viewport only) for the sheet.
- Exit code: 0 PASS, 1 FAIL (any non-waived HARD), 2 usage/crash.
- Writes `<out>/layout-report.json` and `<out>/sheet-<size id>.png` (default out `pages/<game>/qa/layout/`). Sheet = grid of state thumbnails, each labelled with state name and red outline count of HARD issues; built by rendering an HTML grid in the same browser and screenshotting it.
- Prints one line: `Layout gate: PASS|FAIL, 7 sizes x N states, F fail, S soft, K waived` (this exact line goes in the PR body).

## 8. Report `layout-report.json`

```json
{
  "gate": "pgs-layout-gate", "version": 1,
  "game": "chart-school", "gameHash": "sha256:...", "commit": "<git HEAD at run, informational>",
  "createdAt": "ISO", "verdict": "PASS|FAIL",
  "sizes": ["fold-cover-344x882", "..."], "states": ["desk", "..."],
  "counts": { "hard": 0, "soft": 0, "waived": 0, "ignored": 0 },
  "issues": [ { "size": "...", "state": "...", "check": "...", "severity": "HARD", "detail": "...", "sel": "...", "box": [0,0,0,0], "waived": null } ],
  "waivers": [ { "check": "...", "reason": "...", "count": 1 } ],
  "notChecked": [],
  "summary": "Layout gate: PASS, 7 sizes x 12 states, 0 fail, 3 soft, 1 waived"
}
```
`issues` holds HARD, SOFT and waived items (waived has `waived` = reason). Cap 50 issues per size x state in the file.

## 9. gameHash (freshness, used by hook and CI)

`gameHash(dir)`: sha256 over every file under `pages/<game>/` sorted by POSIX relative path, excluding the top-level `qa/` directory, the top-level `sw.js` (nested `sw.js` and nested `qa/` are hashed), and dot-files (files whose name starts with `.`) at any depth (dot directories are walked); feed `relpath + "\0" + bytes + "\0"` per file. Output `"sha256:<hex>"`. Same algorithm copied verbatim into the plugin hook (no import across repos). CLI: `node tools/layout-gate/hash.mjs pages/<game>` prints the hash.

## 10. Locks

1. Plugin hook (`hooks/layout-gate.mjs`, PreToolUse): blocks `mcp__*__update_pull_request` with `draft:false`, `mcp__*__create_pull_request` without `draft:true`, `mcp__*__merge_pull_request`, Bash `gh pr ready`, `gh pr merge`, `gh pr create` without `--draft`, unless every gated game changed vs `origin/main` (fallback: every gated game) has `pages/<game>/qa/layout/layout-report.json` with `verdict:"PASS"` and `gameHash` equal to the recomputed hash. Repo found from `CLAUDE_PROJECT_DIR`, cwd, or their direct child dirs holding `pages/*/layout-gate.json`. No gated game found = allow. Bypass only: file `<repo>/.layout-gate-waiver` containing a line `M waived by card: <reason>` (hook prints that it was used); the assistant must never write it (guarded like ART_UNLOCKED).
2. CI (`layout-gate.yml`, on pull_request): (a) unit tests of the gate; (b) every gated game changed in the PR runs the gate, FAIL fails the check, report + sheets uploaded as artifact; (c) a new game folder (`pages/<g>/index.html` added in the PR) without `layout-gate.json` fails.
3. Rule text: gameup blocker "layout report missing, stale or FAIL = verdict cannot be GO"; PR body carries the summary line; inspector (never the maker) looks at sheet-fold-cover-344x882 + 2x close-ups at 344x882 only.
