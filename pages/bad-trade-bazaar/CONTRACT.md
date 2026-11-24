# CONTRACT: Bad Trade Bazaar, slice btb-slice-1 (frozen by lead 2026-11-24)
Saiyan. Fast Makers. Contract first, zero waits. FM wins conflicts. Scout once, brief fully. One owner per file. Even slices, split the longest. Makers self-test, return path plus 3 lines. One QA pass, blockers only.

Game folder: `pages/bad-trade-bazaar/` (repo root `/home/user/banglawar`). Plain ES modules, no build step, no dependencies, no network calls, free assets only (CSS/SVG drawn in code). Pages: https://pech-pech.github.io/banglawar/bad-trade-bazaar/
Design sources (read-only, network mount, use full paths): `/mnt/project-files/games-design/concepts/CG-20261124-001/` SHEET.md (numbers), work/constraints-fold-ux-v2.md (layout), looks/look-a.html + look-a.png (look), work/sim/sim-spare.js (reference sim: core must reproduce its rules).
Never guess silently: if unsure, pick, label `admin default` in a code comment, keep going. Never ask.

## MUST-HAVES (M's words, word for word; all IN)
1 Bad Trade Bazaar | 2 Every losing trade | 3 leaves a 'scar' card | 4 that you can slot into your build | 5 so your worst calls become your strongest perks | 6 Loop | 7 Tap to buy or sell auto-ticking stocks during a three-minute run | 8 collect scar cards from losses | 9 then reset the run | 10 slot scars to boost the next one

## Files and owners (one owner per file)
| File | Owner |
|---|---|
| core.js, tools/bots.mjs | maker 1 (core) |
| index.html, style.css | maker 2a (shell + look): all static DOM with the ids below, all CSS incl. both layouts, `.active`, states via data attributes |
| ui.js | maker 2b (logic): renders into maker 2a's DOM ids; may create repeated children (tray cards, slot cards, scar cards) using class names listed below; sparkline drawn on canvas |
| house.js, manifest.webmanifest, sw.js, icon-192.png, icon-512.png, icon-maskable-512.png, tools/make-icons.mjs | maker 3 (house) |
| tools/e2e.mjs | maker 4 (e2e) |
| CONTRACT.md, pages/index.html link, README | lead / integrator |

## 1. core.js (pure, no DOM, no time, runs in Node and browser)
```js
export const BUILD = 'btb-slice-1';
export const DEFAULTS = {            // every key is live in the Tweak menu
  runSec: 180, tickMs: 1000, startCash: 100, slots: 3, stackCap: 2,
  base: [10, 25, 60], vol: [0.010, 0.018, 0.030], volScale: 1,
  K: 0.08, M: 0.8, regimeMin: 10, regimeMax: 25, pUp: 0.35, pDown: 0.35,
  saleCut: 0.015, lossLine: 0.04, holdSec: 15, endScar: true,
  spareCash: 1, spareCap: 10, buyLockMs: 300,
  perk: [0.30, 8, 0.02, 0.30, 1.0, 0.8],   // index = scar type
  run1Seed: 'btb-run1'                      // fixed seed, run 1 shows a loss chance inside 25 s (maker 1 picks a seed that does)
};
export const STOCKS = ['Calm', 'Middle', 'Wild'];   // placeholder names
export const SCARS = [ // type = stock*2 + (big?1:0); names placeholders
  { type:0, name:'Penny Nick',  stock:0, big:false, kind:'gain',   only:-1 }, // wins pay +perk[0] extra profit (any stock)
  { type:1, name:'Deep Cut',    stock:0, big:true,  kind:'cash' },            // start run +perk[1] cash
  { type:2, name:'Sharp Eye',   stock:1, big:false, kind:'disc' },            // buys perk[2] cheaper (loss test still uses market price)
  { type:3, name:'Cushion',     stock:1, big:true,  kind:'refund' },          // losing sales return perk[3] of the loss
  { type:4, name:'Wild Streak', stock:2, big:false, kind:'gain',   only:2 },  // Wild wins pay +perk[4] extra profit
  { type:5, name:'Tycoon',      stock:2, big:true,  kind:'hold' },            // wins held >= holdSec pay +perk[5] extra profit
];
export function perkText(type, config) -> string   // e.g. "Wins pay +30%", max 2 short lines, used on cards
export function hash(str) -> uint32                 // FNV-1a
export function mulberry32(seed) -> () => float
export function newProfile(salt) -> Profile
export function runSeed(profile, config) -> string  // run 1 = config.run1Seed, else `btb-${profile.salt}-r${profile.runs.length+1}`
export function newRun(profile, config) -> State    // uses validated profile.build, profile.sparesNext as start bonus
export function tick(state) -> Event[]              // advance 1 s; at t == runSec auto-sells held stocks and sets state.over = true
export function canBuy(state, i) -> boolean
export function buyPreview(state, i) -> { lot }     // lot = free cash / number of flat stocks
export function buy(state, i) -> Event | null
export function sellPreview(state, i) -> SellPreview   // MUST equal what sell() then does at the same price
export function sell(state, i) -> Event | null
export function endRun(profile, state) -> RunSummary   // applies drops to profile (collection, sparesNext), pushes summary to profile.runs, clears build slots no longer legal
export function validateBuild(profile, config) -> build  // each type used <= min(stackCap, collection[type]) times
export function setSlot(profile, slotIndex, type|null, config) -> boolean
export function protoCheck(profile) -> { run1, medianR3to5, ratio, pass, deliberateLosses } // ratio null until 5 runs
export function report(profile, config) -> string      // Copy report text (below)
```
State keeps its own `config` copy (state.config) so tick/buy/sell need no config arg.
Rules (must reproduce sim-spare.js mode A, cap 10):
- Price per stock i: own RNG stream `mulberry32(hash(seed+':stock'+i))`; regime length `regimeMin + floor(r*(regimeMax-regimeMin+1))`, dir +1 if u<pUp, -1 if u<pUp+pDown, else 0; `ret = dir*M*vol + K*ln(base/p) + vol*(r+r-1)`; vol = vol[i]*volScale; `p = max(0.5, round2(p*(1+ret)))`. Price series may be precomputed at newRun (state.px[i][t], t=0..runSec). Perks and bots never draw from price streams.
- Buy: one position per stock; lot = cash / flat stocks; needs lot > 1; qty = lot / (p*(1-disc)); store buyPrice = p (market), cost = lot, t.
- Sell at price p: proceeds = qty*p*(1-saleCut); gain = proceeds - cost. Losing trade = p < buyPrice (fee ignored). Loss: proceeds += -gain*refund (only when gain<0). Win: proceeds += max(0,gain)*(gainPerk[i] + (held >= holdSec ? holdPerk : 0)) (gain perks only on profit above zero, admin default). pnl = proceeds - cost.
- Scar type = i*2 + ((buy-p)/buy >= lossLine ? 1 : 0). Every losing sale drops one scar (auto-sale at end too, if endScar). If owned count (collection[type] + same-type drops already counted this run, capped at stackCap) is already stackCap, the drop is a SPARE.
- endRun: collection[type] = min(stackCap, ...); sparesNext = min(spareCap, spares this run) * spareCash; spares from run N pay at run N+1 only, then gone. Scars kept forever; slotting does not use them up.
- Start cash = startCash + sum(cash perks) + profile.sparesNext.
- state.firstTap = t of first buy/sell (null if none). Deliberate loss = losing sale with >= 10 s left (not the auto-sale).

Shapes:
```
Profile = { v:1, salt, collection:[6 ints], build:[type|null x slots], sparesNext:int, runs:RunSummary[] }
State   = { config, seed, t, runSec, cash, startCash, px:[[...]x3], pos:[{qty,buyPrice,cost,t}|null x3], over, firstTap, trades, losing, deliberate, drops:[{type,spare,t,i,pnl}], log:Event[], build:[...], perks:{gain:[3], hold, disc, cash, refund} }
Event   = { kind:'tick'|'buy'|'sell'|'end', t, i?, price?, lot?, pnl?, loss?, scar?:{type,name,spare}|null, auto? }
SellPreview = { pnl (rounded 2), loss:boolean, scar:{type,name,spare}|null, perkTag:string|null }   // perkTag e.g. 'Tycoon' when a perk adds on a win
RunSummary = { n, seed, startCash, endCash, trades, losing, deliberate, scars:[types], spares, build:[types], firstTap, cut }
```
Report text (plain text): line 1 `Bad Trade Bazaar btb-slice-1 report`, config diff vs DEFAULTS (or `config: default`), then per run: `run N seed S start X end Y trades T losing L (deliberate D) scars [names] spares P build [names] firstTap Fs`, then `PROTO end cash run1 X, median r3-5 Y, ratio Z% -> PASS/FAIL/needs 5 runs; deliberate losses total D`.

tools/bots.mjs (`node pages/bad-trade-bazaar/tools/bots.mjs [seeds=200] [runs=6]`): imports ../core.js, ports the 7 bots of sim-spare.js (idle, noLoss, dump, farmer, human, skilled, skilledScars incl. pickBuild by RANK) driving newRun/tick/buy/sell/endRun only. Prints end cash p10/p50/p90 per bot for run 1, 3, 6, and GATES: G1 skilledScars run3 p50 > skilled run3 p50; G2 farmer run6 p50 < 100; G3 dump run6 p50 < skilled run6 p50; T1 (target only, report, never block) noLoss run3 p50 > dump run3 p50; plus proto ratio for skilledScars. Exit 1 if G1-G3 fail. Expected near sim-spare A cap 10: skilled r6 ~154, skilledScars r6 ~167, dump r6 ~120, farmer r6 ~30.

## 2. house.js (browser only, all storage in try/catch)
```js
export function loadProfile() -> Profile|null ; export function saveProfile(p)        // key 'btb-profile-v1'; never overwrite a newer v with older
export function loadConfig(DEFAULTS) -> config ; export function saveConfig(cfg)     // key 'btb-config-v1'; merge saved over DEFAULTS
export function isDev(cfg, DEFAULTS) -> boolean                                       // any key differs (deep compare arrays)
export function diffConfig(cfg, DEFAULTS) -> object
export function presetCode(cfg, DEFAULTS) -> string ; export function parsePresetCode(str) -> object|null   // 'BTB1:' + base64(JSON(diff))
export function listPresets() / savePreset(name, cfg) / loadPreset(name) -> cfg|null / deletePreset(name)      // key 'btb-presets-v1'
export async function copyText(text) -> boolean   // clipboard API with textarea fallback
export function mountSettings(rootEl, { DEFAULTS, SCARS, STOCKS, getConfig, setConfig, getReport, onResetProgress, onClose })
export function registerSW()                       // registers sw.js if isSecureContext
```
Settings panel (house builds everything INSIDE rootEl = `#settings-body`; ui owns `#settings` overlay + close button `#btn-settings-close`): Tweak menu ALWAYS visible: one row per DEFAULTS key (numbers = number inputs with sensible step, arrays = one input per item labelled by stock or scar name, booleans = toggle), each with reset-to-default; `Reset all`. Buttons row: `Copy report` (id `#btn-copy-report-settings`) then `Save preset` next to it, preset name input, preset slot list (load / delete), `Copy preset code`, `Paste preset code` (input + apply). `Reset progress` (2-step confirm in-panel, no browser dialogs). setConfig(cfg) saves and applies to the NEXT run (current run keeps its config, admin default). Text >= 14 px, buttons >= 56 px tall, inputs >= 48 px (admin default), panel scrolls inside itself.
manifest.webmanifest: name "Bad Trade Bazaar", short_name "Bazaar", start_url "./", scope "./", display "standalone", orientation "portrait", background/theme "#1a0f0a", 3 icons. sw.js: copy the pages/stock-terminal/sw.js pattern (network-first, VERSION 'btb-slice-1', CORE = ./, index.html, style.css, core.js, ui.js, house.js, manifest, icons). Icons: drawn by tools/make-icons.mjs with Playwright (lantern / awning motif on dark, Night bazaar palette).

## 3. index.html + style.css + ui.js (maker 2)
index.html: viewport `width=device-width,initial-scale=1,viewport-fit=cover`, manifest link, theme-color, icons, `<script type="module" src="ui.js">`. ui.js imports core.js and house.js only via the exports above.
Required DOM ids (e2e relies on them; data attributes are part of the contract):
- `#screen-start`, `#screen-run`, `#screen-end`, `#screen-slot`, `#settings` (overlay with `#settings-body` and `#btn-settings-close`) — exactly one screen has class `active`; `body[data-screen]` = start|run|end|slot.
- start: `#title` (text "Bad Trade Bazaar"), `#build-id` (text btb-slice-1), `#btn-play`, `#btn-settings-start`.
- run: `#hud-timer` (m:ss), `#hud-cash`, `#btn-settings` (gear 56x56), `#dev-badge` (shown when isDev, present on every screen), `#banner` (name), `#build-strip` with 3 `.slot`, `#tray` with `.tray-card[data-type]` + `.badge` xN, `#toast`, rows `#row-0..2` each with `.stock-name`, `.price`, `.held`, `canvas.spark`, and toggle `#tog-0..2` with `data-mode="buy|sell"`, `data-loss="1|0"`, face text `BUY $33` / `SELL +$12` / `SELL −$8` plus chip `.chip` (`+SCAR Penny Nick` / `SPARE` / perk name on a win / `NO SCAR` when pnl<0 but not a losing trade).
- end: `#end-cash` ("100 → 142"), `#end-pl`, `#end-scars` with `.scar-card[data-type][data-spare]`, `#end-proto` (run 1 vs median r3-5 line), `#btn-copy-report`, `#btn-reset-run` ("RESET RUN → SLOT SCARS", tap 1).
- slot: `#slots` with 3 `.slot-big[data-slot]`, `#collection` with `.coll-card[data-type]` (count shown, disabled when 0 or all copies slotted), `#slot-effect` line, `#spare-note` (+N cash from spares next run), `#btn-start-run` (tap 2). Tap card then tap slot; tap filled slot clears it. Card tap with an empty slot fills first empty slot (admin default, fewer taps).
Flow: start → (no scars owned ? run : slot); run → end (auto at 180 s); end → slot (tap 1) → run (tap 2). Loop = 2 taps.
Clock: ui owns time. Fixed step: accumulate rAF delta, call core.tick once per config.tickMs; pause when document.hidden; cap catch-up at 3 ticks. Actions fire on `pointerdown`. After a buy the toggle ignores taps for buyLockMs and shows a ring. Toggle label locks while pointer is down.
Test hooks (always present, harmless): `window.__btb = { getState, getProfile, getConfig, step(n), report() }` — step(n) runs n ticks at once and re-renders (stops at run end and shows end screen). URL `?tick=MS` overrides tickMs for this page load only (shows DEV badge).
Layout: constraints-fold-ux-v2.md; T layout when height/width > 2.0 (344x882), else S layout (475x638). Use `100dvh`, `env(safe-area-inset-*)`, side margin 8, targets >= 56 px. NO scroll at 344x882 and 475x638 on run, end and slot screens.
Look: match looks/look-a.html (Night bazaar: warm lantern glow on dark, stall awning, paper price tags). Reuse its palette/CSS. Fixes at build: NO text under 14 px anywhere (drop "SLOT n" labels, names take the room); SELL face always carries the unit ($); gain SELL button solid filled (must not look disabled; distinct from BUY by an up arrow and a green-gold tint); loss = minus sign + down arrow + colour + scar chip (never colour only). Scar card drop: short flip into tray (<= 400 ms, none with prefers-reduced-motion). Sparkline: last 30 ticks, buy-price line, -4% tick with "4%" label at 14 px.
Fonts: system stack only, tabular numerals for prices.

## 4. tools/e2e.mjs (maker 4)
`node pages/bad-trade-bazaar/tools/e2e.mjs` — Playwright (pre-installed; `import { chromium } from 'playwright'` or createRequire; chromium.launch() no options), serves `pages/` with a tiny node http server on a free port, opens `/bad-trade-bazaar/?tick=5` at 344x882 (deviceScaleFactor 1). Steps: start shows title + build id → play → buy row 0 → step until a sell preview shows loss (use `__btb.step(1)` loops + read `#tog-0[data-loss]`) → sell → `#tray .tray-card` appears, toast shows → step to end → end shows cash + scar → reset (tap 1) → slot screen → slot a scar → start run (tap 2) → run screen shows slot filled → force a spare (own 2 of a type, then another loss of that type; may take several runs) → a `data-spare="1"` card and `#spare-note` shows +N → report text contains `btb-slice-1` (via `__btb.report()`) → Settings opens, Tweak rows present, change saleCut → `#dev-badge` visible → no console errors, no horizontal scroll, every visible text node computed font-size >= 14 px, every visible button >= 56 px tall on run screen. Then 475x638: no scroll on run/end/slot. Screenshots to `/tmp/btb-e2e/` (344x882 run, end, slot, settings; 475x638 run). Print PASS/FAIL per step; exit 1 on any fail. Write against this contract only; ui may land later: write the script first, then poll for ui.js + core.js existing and run it.

## Done-when (lead checks)
All 10 must-haves visible on the running build; bot gates G1-G3 pass; e2e PASS; one visual QA pass on 344x882; PR + Pages link.
