# PWA update contract (pgs-update-1) — one shared pattern for every game

Problem: after a PR merges, phones (Brave/Chrome Android, Fold) keep running old builds.
Causes found in scout (2026-11-24):
1. Several game SWs were cache-first for js/css, so old files win until a VERSION bump + two reopens.
2. A sw.js whose bytes do not change is never re-installed (VERSION bump forgotten = no update at all).
3. GitHub Pages sends `Cache-Control: max-age=600`; SW fetches without `cache:'no-cache'` can get 10-min-old files.
4. An installed PWA resumed from background never navigates, so old JS keeps running; nobody calls `reg.update()`,
   nobody reloads on `controllerchange`.
5. All games share one origin (pech-pech.github.io). `activate` handlers that delete "every cache except mine" wipe
   OTHER games' offline caches.

Fix = shared files in `pages/_shared/`, a deploy-time build stamp, a CI check, an e2e.
Nobody edits a file they do not own (owners at bottom). Guess = write "admin default" in a comment and keep going.

## 1. Build id

- Placeholder string, exactly: `__PGS_BUILD__`
- `tools/stamp_build.py` (deploy time) computes per game: `build = sha256( sorted list of (relpath, bytes) for every
  file under pages/<game>/ except version.json, then every file under pages/_shared/ ) [:10]`, optional `--salt S`
  mixed into the hash (tests use it to force a new build). Unstamped/dev build = the literal placeholder.
- Stamp replaces `__PGS_BUILD__` in `pages/<game>/sw.js` and `pages/<game>/index.html`, and writes
  `pages/<game>/version.json` = `{"game":"<game>","build":"<build>","stamped_at":"<UTC ISO>"}`.
- Stamp also appends `?v=<build>` to relative `src="..."`/`href="..."` attributes in index.html whose path ends in
  `.js`, `.css` or `.webmanifest` (skip `http`, `//`, `data:`, `#`, anything already containing `?`).
  Regex only on attribute syntax inside tags; never touch inline script bodies.
- CLI: `python3 tools/stamp_build.py <pages_dir> [--salt S] [--only game1,game2] [--dry-run]`. Prints
  `<game> <build>` per game. Exit 1 if any placeholder survives in a stamped sw.js/index.html.
- Games = every direct subfolder of `<pages_dir>` that has `manifest.webmanifest` (skip `_shared`).

## 2. `pages/_shared/sw-core.js` (classic script, loaded by importScripts)

Defines one global: `self.pgsServiceWorker(cfg)`; cfg = `{ game: string, build: string, precache?: string[],
legacy?: string[] }`. `legacy` = exact old cache names or prefixes this game used before (to delete).

Behaviour:
- `CACHE = 'pgs-' + game + '-' + build`.
- install: open CACHE, add `scope+'index.html'`, `../_shared/update.js` and each precache url as `new Request(u, {cache:'reload'})` with `Promise.allSettled`
  (one bad file must not fail install), then `self.skipWaiting()`.
- activate: delete caches whose name starts with `'pgs-' + game + '-'` and != CACHE, plus any name equal to or
  starting with an entry in `legacy`. NEVER delete other caches (other games share the origin). Then
  `self.clients.claim()`.
- fetch: only GET, only same-origin, only URLs starting with `self.registration.scope` or `../_shared/` (resolved); else return (browser default).
  - Requests with a `Range` header: return (pass through, no caching).
  - `version.json`: `fetch(url, {cache:'no-store'})`, never cached.
  - Navigations (`req.mode === 'navigate'`): `fetch(req.url, {cache:'no-cache', credentials:'same-origin'})`,
    cache key = scope + 'index.html' (if the navigation path is another .html file, key = that URL without search).
    Offline fallback: match key, then match scope + 'index.html'.
  - Everything else: `fetch(req, {cache:'no-cache'})`. NETWORK FIRST ALWAYS.
  - Store response copy in CACHE only if `res.ok && res.status === 200 && res.type === 'basic'` (inside
    `e.waitUntil`, errors swallowed).
  - Network error → `caches.open(CACHE)` match with `{ignoreSearch:true}`; then other caches whose names start with
    `'pgs-'+game+'-'` with `{ignoreSearch:true}`; else `Response.error()`.
- message: `{type:'SKIP_WAITING'}` → `self.skipWaiting()`; `{type:'GET_BUILD'}` → reply on `e.ports[0]` or
  `e.source.postMessage({type:'BUILD', build})`.
- Also sets `self.PGS_BUILD = build`.

## 3. Each game's `pages/<game>/sw.js` — EXACT shape (CI enforces)

```js
// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: '<folder-name>', build: BUILD, precache: [ ... ], legacy: [ ... ] });
```
- `game` must equal the folder name. `precache`: keep the game's old offline list (relative './x' paths), drop
  entries for files that do not exist. `legacy`: every cache name/prefix the old sw.js used (e.g. `'sixes-offline'`,
  `'sq-'`, `'moonstep-'`). Prefixes must be specific to this game (never `'v'` or `''`). Keep a game's VERSION label
  as a comment only, if useful.
- No `addEventListener('fetch'` or `caches.` in game sw.js.

## 4. `pages/_shared/update.js` (classic script, no modules, no deps)

Loaded from every game's index.html `<head>`:
```html
<meta name="pgs-build" content="__PGS_BUILD__">
<script src="../_shared/update.js" defer></script>
```
Behaviour:
- `BUILD` = content of `meta[name=pgs-build]` (or `'dev'` if missing). `window.PGS_BUILD = BUILD`.
- On DOMContentLoaded and whenever new nodes appear (one MutationObserver, disconnect after 30 s): set
  `textContent = 'build ' + BUILD` of every `[data-pgs-build]` element whose text differs.
- Config: `const CFG = Object.assign({ autoReloadWindowMs: 15000, hiddenReloadMs: 300000, pollMs: 900000 },
  window.PGS_UPDATE_CFG || {})`.
- If `'serviceWorker' in navigator && isSecureContext`: `navigator.serviceWorker.register('sw.js',
  {updateViaCache:'none'})`. Remember `hadController = !!navigator.serviceWorker.controller` at start.
- `check()` (returns a Promise): `reg.update()` (catch), then `fetch('version.json', {cache:'no-store'})` → if JSON
  build exists, differs from BUILD and BUILD is not the placeholder → `state.newBuild = build`; if `reg.waiting`
  post `{type:'SKIP_WAITING'}`; if no SW active/supported → run the decide step below.
- Triggers: load, `visibilitychange` to visible, `online`, `setInterval(check, CFG.pollMs)`.
- On `controllerchange` (only if `hadController`; first install never reloads) and on version.json mismatch with no
  SW: decide:
  - page loaded < `autoReloadWindowMs` ago, OR page was hidden for ≥ `hiddenReloadMs` just before becoming visible
    → `reloadOnce()`.
  - else → `showToast()`.
- Also: if version.json says newer build and the SW controller does not change within 8 s → `showToast()`.
- `reloadOnce()`: sessionStorage key `'pgs-reloaded-' + (state.newBuild||'sw')`; if set → showToast instead
  (loop guard); else set it and `location.reload()`. Wrap storage in try/catch.
- Toast: one element `#pgs-update-toast`, fixed bottom-centre, above safe-area
  (`bottom: calc(12px + env(safe-area-inset-bottom))`), z-index 2147483647, inline styles only, dark bg
  `rgba(17,17,17,.92)`, white 14px system font, text "New version ready", button `#pgs-update-reload` "Reload"
  (min 44x44px) → `location.reload()`, and a "✕" dismiss `#pgs-update-dismiss` (44x44). Never shown twice at once.
- Expose `window.PGS_UPDATE = { build: BUILD, check, state, showToast }`; `state = { reg, newBuild, toast:false,
  reloads:0 }`.
- Must not throw anywhere (try/catch around everything); works on file:// or http without SW (just badge).

## 5. Game index.html changes (game makers)

- Add the two head lines from §4 (meta + script). Remove the game's own `serviceWorker.register(...)` call
  (in index.html or in its JS, e.g. bad-trade-bazaar/house.js, squad-duel/js/app.js) and any own
  controllerchange/update code. Keep everything else (e.g. orientation lock) intact.
- Start screen: next to the game's existing build/version label add `<span data-pgs-build></span>` (small, same
  style as the label). If the label is built in JS, add the span there. If the game has no label, add a tiny one
  at the start screen corner: font 10px, opacity .6. Keep the game's own label too.
- The game's Copy report (if any) should include `window.PGS_BUILD` — add one field if the report is easy to find;
  skip otherwise (note it).

## 6. `pages/build_pwa.py`

Inject the §4 meta + script into `<head>` instead of the old register script; keep the orientation-lock snippet
(as its own small `<script>`).

## 7. CI: `tools/check_pwa.py` + `.github/workflows/pwa-check.yml`

`python3 tools/check_pwa.py pages` exits 1 with one line per problem:
- each game (folder with manifest.webmanifest, not `_shared`) has sw.js matching:
  - contains `const BUILD = '__PGS_BUILD__';`
  - contains `importScripts('../_shared/sw-core.js?b=' + BUILD);`
  - contains `pgsServiceWorker({` with `game: '<folder>'`
  - does not contain `addEventListener('fetch'`, `addEventListener("fetch"` or `caches.`
- index.html contains `<meta name="pgs-build" content="__PGS_BUILD__">` and `../_shared/update.js`.
- no `serviceWorker.register(` in any `.html`/`.js` under the game folder (skip subfolders named
  test, tests, qa, tools, docs, mocks, node_modules).
- `pages/_shared/sw-core.js` and `update.js` exist; `node --check` passes on them (skip with warning if no node).
- runs `stamp_build.py` on a temp copy and asserts no placeholder left and every game got version.json.
Workflow `pwa-check.yml`: on `pull_request` and `push` to main for `pages/**`, `tools/**`, ubuntu, python3 + node 20,
runs the check. `pages.yml`: add steps before upload: `python3 tools/check_pwa.py pages` then
`python3 tools/stamp_build.py pages`. Add `tools/**` to its paths.

## 8. e2e: `tests/pwa-update/e2e.js` (+ `README.md`)

Node + Playwright (`require('playwright')`, preinstalled chromium, headless). Own tiny static server (node http)
serving a switchable temp dir under `/banglawar/` with `Cache-Control: max-age=600` (like Pages), on localhost
(secure ctx). Usage: `node tests/pwa-update/e2e.js [game,...] [--no-legacy]` (default all games). Per game:
1. copy `pages/` to tmp A, `stamp_build.py tmpA --salt A --only <game>`; serve; open `/banglawar/<game>/`;
   wait for `navigator.serviceWorker.controller` (≤20 s, reload once if needed); `window.PGS_BUILD` == build A.
2. Swap served dir to tmp B (`--salt B`). `page.reload()`; expect `PGS_BUILD` == build B within 20 s (auto reload
   allowed). PASS.
3. Toast path (first game only): with `PGS_UPDATE_CFG={autoReloadWindowMs:0}` via addInitScript, load build B,
   swap to C, call `PGS_UPDATE.check()`; expect `#pgs-update-toast` visible; click `#pgs-update-reload`; expect
   build C.
4. Offline: after step 2, `context.setOffline(true)`, reload, expect page loads and `PGS_BUILD` == B.
5. Legacy (old SW from before this PR on the phone): new browser context; tmp L = `pages/` from git ref
   `PGS_LEGACY_REF` (default `origin/main`) via `git archive`; load game (old SW installs, wait controller); swap to
   tmp B; reload up to 3 times (1 s apart); expect `PGS_BUILD` == B. Report how many reloads it took.
Print one line per game per step; exit 1 on any FAIL. Log page errors but do not fail on them.

## Owners (one owner per file)

| Maker | Files |
|---|---|
| core | `pages/_shared/sw-core.js`, `pages/_shared/update.js` |
| tools | `tools/stamp_build.py`, `tools/check_pwa.py`, `.github/workflows/pwa-check.yml`, `.github/workflows/pages.yml`, `pages/build_pwa.py` |
| e2e | `tests/pwa-update/*` |
| G1 | bad-trade-bazaar, chart-school, cricket-sixes, gravity-burn-window |
| G2 | gravity-moonstep, gravity-plumbline, gravity-wellhand, hollow-blade |
| G3 | last-over-lane, ridgeline, squad-duel, stock-terminal |
| G4 | tidewall, trivia-duel, volley, witch-school |
| lead | this contract, games-lessons docs |

Game makers own only `pages/<their games>/**`. No git commits by makers. Self-test: `node --check` your js, grep
your folder against §7 rules. Return: files touched + 3 lines.
