# Project Volley: 5-tab home build contract (2026-11-10, M's pick "Build the 5-tab home screen")

M chose the full 5-tab home for this PR. The design intent is in /mnt/project-files/games-design/archero-type/2026-11-10-art-menus/:
- VISUAL-DESIGN.md
- mockups/menu-*.html and .png (one per tab; these are the visual target)
- mockups/ui-kit.css (the shared look)
- openart/final/ (the assets, plus ASSET-PLACEMENT.md once it exists)

The meta rules are in /mnt/project-files/games-design/archero-type/2026-11-10/DESIGN.md, row "P1.5: early meta slice":
- save data
- credits per room
- totals on the results screen
- one rifle that upgrades to level 10
- three Conditioning stats
- a debug power slider
- a local run log

Prices and income come from design/D4-meta-economy.md and design/N2-economy-rebaseline.md (these supersede D4).

Rules:
- No monetization: nothing costs real money and there is no shop tab.
- Gear and Conditioning are earned by playing only.
- Fold cover screen (344x882) comes first.
- Every button is at least 56 px.

## Tabs
The bottom tab bar has 5 tabs, left to right: Armory, Operator, Deploy (centre, default), Upgrades, Intel.
- Deploy: a Chapter 1 card with the key art, "OUTER PERIMETER", a big DEPLOY button and "Run starts at Stage 1". DEPLOY starts the existing run. After the results screen, "Home" returns here and "New run" still works.
- Armory: the rifle card. It shows the level (1-10), the stat it gives, the upgrade cost and an Upgrade button. Use the rifle icon P-05. The other gear slots (exo-plating, 2 modules, 2 drones) are shown locked, with "P2".
- Operator: the portrait P-02, total stats (max HP, attack and so on, coming from meta), the run log (last 10 runs), and best stage.
- Upgrades: the three Conditioning stats with level and cost, plus the "random level" buy if the design calls for it.
- Intel: Codex (the enemies and boss seen so far, drawn with V.Scene draw calls or as simple cards) and Settings (sound, haptics, the renderer label, reset save, and the debug power slider).

## Files and owners
| Owner | Files |
|---|---|
| LIAISON-ASSETS (shell) | game.html, parts/home.js (tab bar, tab router, Deploy tab, home show/hide around runs), src/home.css (from ui-kit.css), src/assets/*, build.py, sw.js, parts/ui.js and parts/main.js (only for the home/run handoff and the results-screen Home button) |
| META | parts/meta.js (new), plus small hooks in parts/sim.js (apply meta stats at run start, credits per room cleared) and in the results data |
| TABS-A | parts/tab-armory.js, parts/tab-operator.js |
| TABS-B | parts/tab-upgrades.js, parts/tab-intel.js |
| LIAISON-REQUESTS | sim.js (additive event fields only), scene.js, CONTRACT-P1.md |

META and LIAISON-REQUESTS both touch sim.js. Make small Edit-tool changes only, re-read the file before each one, and never rewrite the whole file.

Load order: tune, rng, rooms, stages, mods, meta, sim, ai-p0, ai-p1, boss, scene, render2d, gpu, render, input, audio, ui, tab-armory, tab-operator, tab-upgrades, tab-intel, home, main.

## Shared APIs (exact names)
- `V.Meta` (owned by META):
  - `load()` and `save()`. localStorage key `volley.save.v1`; every call is guarded with try/catch, and the game must work with no storage. `?fresh=1` ignores the save.
  - `state` = `{credits, rifle:{lvl}, cond:{hp, atk, rate}, runs:[{t, stage, win, kills, credits, dur}], best, codex:{seen:{'E-01':true,...}}, settings:{sound, haptics}}`
  - `cost(kind, id)` returns `{credits}` or null at max. `canBuy(kind, id)`. `buy(kind, id)` returns true or false and saves.
  - `stats()` returns `{hpAdd, atkMul, rateMul, ...}`; this is applied once at run start.
  - `award(result)` adds credits, the run log entry, best stage and codex entries, then saves. It returns `{credits}`.
  - `onChange(fn)` notifies listeners.
  - `power`: the debug slider value, 0-1, which scales `stats()`.
- `V.Tabs[id] = {id, title, icon, mount(el), show(), hide()}` with id one of `armory|operator|deploy|upgrades|intel`. home.js owns the bar and calls `mount` once and `show`/`hide` on switch. A tab draws into its own `el` with DOM and the classes from home.css. Tabs read and write only through `V.Meta`, and re-render on `V.Meta.onChange`.
- `V.ASSETS[key]` (shell): a data URI per asset key (P-02 portrait, P-05 rifle, P-08 coin, R-01 key art, R-03 helmet, R-07 shield cell, R-10 operator icon, the cog). Tabs fall back to a plain drawn shape if a key is missing.
- Run handoff (home.js): `V.Home.show()` and `V.Home.hide()`. DEPLOY calls `V.Home.hide()` and then starts the run as main.js does today. The results screen gets a "Home" button that calls `V.Home.show()`. Results also shows the credits earned (coin icon).

## Bot and balance
`node bot.js 200` must give the same results as before: bot runs never call `V.Meta`, and `stats()` is neutral when there is no save. Credits never change any sim number unless the player spends them.

## Rules
- Own files only.
- No Math.random or Date in sim-side code (UI timestamps for the run log are fine).
- No installs, no commits, no network, and no OpenArt or other credit spend.
- Check with Playwright at 344x882, dpr 1, ?gpu=0, with 0 console errors. Save screenshots to src/shots/home-<tab>-*.png.

## Design-thread rules (14:00, these override earlier lines)
- Tab bar: use the kit's code-drawn line glyphs from mockups/ui-kit.css for all 5 tabs, readable at 28 px. Generated images are NOT tab-bar icons: the Operator head and the cog go in larger slots per ASSET-PLACEMENT.md.
- Tab bar rules (qa/FIX-ROUND-1.md section B):
  - The centre Deploy button is bright only when selected. Otherwise it is dark metal with a cyan icon and outline.
  - A cyan indicator line marks the selected tab.
  - Pips are dots only, and never appear on the selected tab.
  - Labels are at least 11 px.
  - Action rows end 10 px above the raised centre button.
- Use the single sample save in qa/FIX-ROUND-1.md section A as test and preview data, so every screen shows the same numbers.
- Operator tab: the generated portrait replaces the "PORTRAIT PENDING" silhouette.
- Do NOT copy the mockup flaws listed in qa/QA-recheck-round-1.md.
- The mockup HTML is the layout source; take pixel values from those files.
- The assets will be in openart/final/: cut-out webp at 2x, with MANIFEST.md and ASSET-PLACEMENT.md (slots for every tab). Use those files once they exist.
- (qa/ is /mnt/project-files/games-design/archero-type/2026-11-10-art-menus/qa/)
