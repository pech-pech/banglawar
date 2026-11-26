# Windward Line wl-look-1: visual overhaul build contract (lead, 2026-11-26)

M, verbatim: "visual overhaul" / "Smooth animations a must" / picked "A Clean vector" / shake + hit-stop: "None" / (older) "keep visuals simple like this."
Goal: ship Look A + smooth motion. DRAW-ONLY: sim files (contract.js, rng.js, map.js, fire.js, people.js, sim.js, plan.js) are FROZEN;
`hashState` of any run must not change. Game dir G = /home/user/banglawar/pages/windward-line/ . Design dir
D = /mnt/project-files/games-design/city-swarm-defense/2026-11-26-visual-overhaul/ (network mount: trailing slash, never search it).
Read: this file; D/lookA-src/render.js + D/lookA-src/style.css (the approved look: port its code, colours, shapes exactly);
D/MOTION-PLAN.md (rows named below by #); D/stills/A-*.png (approved stills); G/CONTRACT.md only if you need sim state shapes.
Note: G/js/render.js on disk is the OLD look until the shell maker replaces it. Do not read other makers' new files to wait on them.

## Rules for makers
One owner per file (table). Never edit a file you do not own. No git commands. No network, no deps, no art files, no web fonts.
Missing something from another file? Use the API here exactly; if absent write a tiny local fallback in YOUR file marked `// admin default`.
Never stop to ask. Plain ES modules. No Math.random / Date in draw (hash on index, `f.now`). No per-frame allocation in hot loops
(no new Path2D / arrays per frame: reuse), no shadowBlur/filter, no full-canvas getImageData. Text on canvas >= 12 px.
Self-test: `node --check <file>` plus (layer makers) copy G to your own scratch dir /tmp/claude-0/-home-user/ae3524a3-a00f-5b40-9af2-8c8df6c4e767/scratchpad/mk-<yourfile>/,
stub missing sibling modules with empty exported functions there, and run
`cd /tmp/claude-0/-home-user/ae3524a3-a00f-5b40-9af2-8c8df6c4e767/scratchpad && node shot.js <yourScratchDir> <yourScratchDir>/shots t` (prints PAGEERROR on JS errors; LOOK at a PNG).
Your real file goes to G. Time box 12 min. Return: path(s) + 3 lines (what, test result, open risk).

## Files and owners
| File (under G) | Owner | What |
|---|---|---|
| js/r/util.js | U | shared helpers (below) |
| js/render.js | SHELL | initRender, draw (builds frame ctx `f`, calls layers in order), screenToCell, fitView, resultMark, resize. Keep signatures. |
| js/r/terrain.js | TERRAIN | base land/water, burnt ground, roads/breaks/bridges bake + draw |
| js/r/built.js | BUILT | buildings, shelter zones + gates, pump rings, crews + tank bars, placement pop (#6) |
| js/r/fire.js | FIRE | smooth fire front + glow with eased per-cell intensity (#2 #3), embers (#4), strike ring (#16) |
| js/r/people.js | PEOPLE | people dots with tick interpolation (#1) |
| js/r/callins.js | CALLINS | call-in queue lines + countdown, armed aim, bomber pass + splash (#8), dozer sweep (#9) |
| js/r/hud.js | HUD | selected building, plan preview ghost + label with follow (#5), wind arrow turn (#10), result mark, pause dim (#17) |
| js/main.js | MAIN | alpha, calm flag, camera tween (#7), perf stats |
| js/ui.js | UI | result count-up + stars (#15), money roll (#14), Calm motion toggle, toast class |
| style.css | CSS | Look A chrome + all CSS motion (#12 #13 #18), narrow-label fix, reduced motion |
| js/tweak.js | TWEAK | "Frame stats" checkbox + overlay |
| js/testhook.js, tests/smooth.e2e.cjs | TEST | smoothness + hash-guard test |
| sw.js, CONTRACT.md, qa/, PR | INTEGRATOR | precache list adds js/r/*.js; merge; gates |

## js/r/util.js (U) exports, exact names
`N` (=MAP_W*MAP_H), `TAU`, `FONT` ('600 13px system-ui, -apple-system, "Segoe UI", sans-serif'), `BG`, `CYAN`, `BLUE`, `EMBER`, `INK`,
palette arrays `MEADOW FOREST FOREST_RIM ROCKC WATERC SHALLOW SAND ROADC ROADEDGE CLEARC CLEAREDGE BRIDGEC BRIDGEEDGE CHAR` (values from lookA-src),
`hsh(n)`, `ss(a,b,x)`, `blur(F)`, `axis(n,R,L)`, `mixc(c,t,a)`, `rr(ctx,x,y,w,h,r)`, `makeLut(stops)`,
`labelBox(ctx,text,cx,cy,vw,vh)`, `dashLine(ctx,x0,y0,x1,y1,color,lw,dash)` (all copied verbatim from lookA-src/render.js),
`mkCanvas(w,h)`, `clamp(x,a,b)`, `lerp(a,b,t)`, `easeOutQuad(t)`, `easeOutCubic(t)`, `easeInOutCubic(t)`, `easeOutBack(t)`,
`follow(cur,target,dt,rate)` (= cur + (target-cur)*(1-exp(-dt*rate))), `angLerp(a,b,t)` (shortest arc, radians).
Imports only from '../contract.js'. Until util.js lands, other makers code against these names (stub in scratch).

## Frame context `f` (SHELL builds one reused object per draw; layers only read it)
```
f = { r, ctx, state, view, overlay, g: state.grid, cfg: state.cfg||{},
  S, ox, oy,            // px per cell (CELL_PX*view.scale), view offset
  vw, vh, MW, MH,       // css view size, map size in px (MAP_W*S, MAP_H*S)
  sx(x), sy(y),         // cell -> screen px
  tick,                 // state.tick|0
  alpha,                // 0..1 progress to next sim tick (overlay.alpha, 0 when not running)
  now,                  // ms, performance.now()
  dt,                   // seconds since previous draw, clamped to 0.05; 0 on first frame
  time,                 // seconds of "world time" = accumulates dt only while run && !paused (flicker clock; freezes on pause)
  run, paused, result,  // phase flags (paused = overlay.paused)
  calm,                 // reduced motion (overlay.calm)
  tickChanged,          // true on the first draw after state.tick changed (or state object / phase changed: then also f.reset = true)
  reset,                // true when state object, stage, or phase changed, or tick went backwards: layers must snap, not tween
  wv }                  // {x,y} wind unit vector
```
`r` = render handle from initRender: `{canvas, ctx, dpr, w, h, lastMs, dbg:{maxJump:0, fireMaxDelta:0, fireCells:0, snaps:0}}`. Each layer keeps its own
state under ONE key on r: `r.terrain`, `r.built`, `r.fire`, `r.people`, `r.callins`, `r.hud` (created in its init).

## Layer exports (exact) and draw order in SHELL.draw
1. terrain.js: `initTerrain(r)`, `drawTerrain(f)`  : r.base, burnt, over (as look A). terrainKey must NOT scan 12 288 cells every frame: recompute only when
   f.tickChanged || f.reset || state.plan.length changed. Burnt layer: re-bake as look A (>= 3 ticks apart) but cross-fade old -> new over 0.5 s (two canvases) so burnt ground never pops.
   QA fix B5: forest canopy stipple and rock must not read as pixel speckle: use soft low-contrast blotches (>= 3 px, blurred) or none.
2. built.js: `initBuilt(r)`, `drawBuilt(f)` : buildings (look A drawBuilding; burnt state cross-fades 0.4 s), zones, gates, pump rings, crews, tank bars.
   Placement pop #6: when a zone/break/crew/pump first appears during plan phase: 220 ms easeOutBack scale 0.85->1 + alpha (zones, crews, pumps here; breaks are terrain, no pop).
   Tank bar width follows value with follow(rate 10).
3. fire.js: `initFire(r)`, `drawFire(f)`, `drawEmbers(f)`, plus `drawStrike(f)` called inside drawFire.
   Per-cell eased intensity fi[i] (Float32Array N): target = burn>0 ? look-A weight : 0; rise 0.35 s, fall 0.8 s (calm: 0.15 s both). Field F/G built from fi, not from burn.
   Flicker = smooth sin(f.time*k + hsh phase), never keyed on tick. Set r.dbg.fireMaxDelta = max |fi change| this frame, r.dbg.fireCells = active count. On f.reset snap fi to target.
   Embers: interpolate each ember between previous-tick and current position with f.alpha (match by array index; snap if moved > 4 cells or list length changed), streak tail 1.5 cells against motion, fade in; calm: no tail.
   Strike ring #16: at run start (tick 0-2) and each new spot fire event (state.events kind containing 'spot' or 'strike'; else detect a burning cell with no burning/burnt neighbour within 3 cells at tickChanged, max 3 per tick): ring grows to 6 cells over 0.4 s, alpha 0.8->0. No full-screen flash.
4. people.js: `initPeople(r)`, `drawPeople(f)` : keep prevX/prevY Float32Array; at f.tickChanged copy the positions drawn-as-current into prev (i.e. prev = last tick's sim pos); draw lerp(prev,cur,f.alpha).
   Snap (no lerp) if jump > 3 cells or f.reset; count snaps in r.dbg.snaps. r.dbg.maxJump = max screen px any person moved since the previous draw (0 on reset frames).
   QA fixes B3/B4: soft dots without the hard dark ring (use a 1 px translucent darker rim only), slight alpha 0.9 so piles read as density; hurt/exposed = magenta-pink #ff4fa3 with white rim
   (must not look like ember orange); lost = dark red #b3261e; safe = cyan #3fe0ff; fleeing = white. Pool the Path2D objects (reuse, rebuilt per frame via new Path2D only if no reset method: allowed max 6 per frame).
   People at the map edge: clamp draw position inside the map by 0.3 cell.
5. `drawEmbers(f)` (fire.js) after people.
6. callins.js: `initCallins(r)`, `drawCallins(f)` : queue dashed line + countdown label (look A), armed aim preview (look A).
   Bomber #8: for a queued bomber, during the last 1.2 s before atTick a small white plane glyph (code-drawn, ~14 px) flies along the drop line; at drop (queue item becomes done or tick>=atTick) a blue-white
   splash band along the line: ring/band expands 0.5 s easeOut then fades 0.6 s. Dozer #9: last 1.5 s before atTick a small yellow dozer block sweeps the line with a dust-brown trail. Calm: no plane/dozer glyph, static band fade only.
   Time for these = (atTick - (f.tick + f.alpha)) * cfg.tickSec. Keep finished effects in r.callins list keyed by queue item identity; clear on f.reset.
7. hud.js: `initHud(r)`, `drawHud(f)` : selected building outline; plan preview ghost + cost label, INCLUDING the hold text from current G/js/render.js
   (`HS = { weak:'weak', mid:'slow front', strong:'holds' }`, txt += ' · ' + HS[p.hold.key] when p.hold && p.ok; label colour '#ffd27a' when hold.key==='weak'): port that logic exactly.
   Preview end point follows the finger target with follow(rate 18) (#5; snap when preview appears or t changes). Wind arrow (look A) angle turns with angLerp over 0.6 s (#10) and pulses 1 Hz while a wind shift is pending
   (state.wind.shiftAtTick != null && !state.wind.shifted && within 10 s). Result mark (look A). Pause dim #17: when f.run && f.paused draw rgba(10,16,24,a) over the map, a eased to 0.25 in 150 ms, plus a centred "PAUSED" pill (13 px). No dim in plan/result.

SHELL.draw: resize, bg fill, build f, then 1..7, then r.lastMs. `resultMark` export stays in render.js (ui.js imports it). SHELL also exports nothing new. SHELL imports each layer by the exact names above.

## main.js (MAIN)
- Loop: keep fixed-step logic. `overlay.alpha = running && !paused ? clamp(acc,0,1) : (paused ? lastAlpha : 0)`. On pause do NOT zero acc (today `else acc = 0` also hits pause): keep acc while paused, zero it only when phase !== RUN.
- `overlay.paused = !!state.paused`, `overlay.calm = calm`.
- Calm motion: `calm` boolean = saved choice if set, else matchMedia('(prefers-reduced-motion: reduce)').matches. Save in the existing save object as `save.calm` (true/false/undefined). `api.getCalm()`, `api.setCalm(bool)`;
  toggles class `calm` on document.documentElement. Also WL.setCalm / WL.getCalm.
- Camera tween #7: programmatic camera changes (fit on resize/stage change, see-on-map jump) tween view {ox,oy,scale} 300 ms easeInOutCubic; never while a pointer is down; calm: instant. Pinch/pan stay 1:1.
- Perf: every frame push frame delta ms into a 240-slot ring. `WL.stats` = {fps, p50, p95, max, drawMs (rend.lastMs), simMs (last step batch ms), fireCells, maxJump} refreshed ~4x/s.
  `WL.perf(reset)` -> {frames, le17, le25, le34, gt34, p95, max, maxJumpPx, fireMaxDelta, snaps} accumulated since last reset (maxJumpPx / fireMaxDelta = running max of rend.dbg values).
  `WL.rend` = render handle. Keep window.__bench and everything else on WL as is.
- Import helpers from './r/util.js' (clamp, easeInOutCubic) or local fallback.

## ui.js (UI)  (keep every DOM id, class, data-act, data-layout attr; `hidden` attribute stays the single truth for open/closed)
- Result #15: pct counts 0 -> value over 900 ms easeOutCubic (rAF, text only); stars: element `.stars` holds 3 `span.star`, class `on` for earned (filled gold) else dim outline (QA B2: earned vs unearned must be obvious);
  earned stars get class `pop` one by one 250 ms apart after the count. Calm (api.getCalm && api.getCalm()): final values at once. When __test drives states (window.__test && window.__test.busy) or calm: no tween.
- Money #14: top bar money text rolls to new value over 300 ms (rAF only while changing); calm: instant.
- Settings: add row "Calm motion" toggle button `#calm-toggle` (aria-pressed), calls api.setCalm(!api.getCalm()); place above the Tweak section. Min height 44 px.
- Toast: keep hidden logic; add class `out` 200 ms before hiding for fade (CSS does it).
- Tool button labels (QA B1): at narrow width "Firebreak" and "$20/edge" touch edges. Add class `tool` label spans so CSS can shrink; if text is changed keep meaning ("Break" is NOT allowed: keep "Firebreak").

## style.css (CSS)
Start from D/lookA-src/style.css (approved chrome), merged with any selectors present in current G/style.css that it lacks. Add:
- #12 sheets: `.overlay:not([hidden])` fades in 180 ms; its inner sheet/card slides up 24 px -> 0 + opacity 220 ms cubic-bezier(.22,1,.36,1) via @keyframes (entry only; exit instant).
- #13 buttons: `transition: transform 90ms, background-color 120ms, border-color 120ms`; `:active { transform: scale(0.96) }`.
- #18 toast: slide 8 px + fade in 150 ms; `.out` fades 200 ms.
- stars: `.star` dim outline colour, `.star.on` gold #ffc83d, `.star.pop` keyframe scale 0.4 -> 1.15 -> 1 in 250 ms.
- `#calm-toggle` style like other setting buttons, pressed state cyan outline. `#frame-stats` overlay: fixed top-left under the top bar, 12 px monospace, dark translucent pill, pointer-events none.
- QA B1: at max-width 380 px tool buttons: font-size 12 px (not below), letter-spacing 0, padding-inline 2 px, min-width 0, text never overflows or touches the edge (overflow-wrap: anywhere not allowed for "Firebreak": use tighter padding/gap).
- Reduced motion: `@media (prefers-reduced-motion: reduce)` and `html.calm`: animations/transitions <= 120 ms fade only, no transform keyframes.
- All text >= 12 px, buttons >= 44 px tall, contrast >= 4.5:1.

## tweak.js (TWEAK)
Add a "Frame stats" checkbox row at the top of the tweak panel (off by default, saved in localStorage key 'wl-frame-stats'). When on, a `div#frame-stats` (appended to #app, data-layout="ignore") shows 2 lines from window.WL.stats,
refreshed every 250 ms via rAF timestamp check (no setInterval when off): `fps 60 | frame p50 16.7 p95 17.1 max 21` / `draw 1.8 ms | sim 0.4 | fire 512 | jump 2.1 px`. It is not a gameplay tweak: does NOT set the DEV badge.

## testhook.js + tests/smooth.e2e.cjs (TEST)
- testhook.js: keep all states. Set `window.__test.busy = true` while goto runs (false after). After goto, call WL.setCalm? NO: leave calm alone. States must still render deterministic stills: after stepping, the hook already refreshes; alpha is 0 when paused/not running.
- tests/smooth.e2e.cjs (run: `node tests/smooth.e2e.cjs` from G; uses require('playwright'), own tiny static server for the pages/ dir like scratchpad/shot.js, serviceWorkers:'block', viewport 475x638):
  1. Hash guard: page loads `?stage=2&seed=7`; in-page import of './js/sim.js' + './js/plan.js': build state, runToEnd -> hashState; must equal the same computed in Node from the frozen sim files (import via file URL in a child `node --input-type=module`) AND a live run driven by the frame loop for 80 ticks at 4x must hit the same hash as a headless 80-tick step loop with the same plan (motion on and calm).
  2. Smoothness at 1x and 4x, 6 s each on run-mid-like state (start run with the testhook bot plan, WL.perf(true) then wait): assert maxJumpPx <= 1.2 * S_px_per_cell_per_frame budget = (6 cells/s * S / 60) * 1.6 at 1x (scaled by speed), fireMaxDelta <= 0.25, snaps === 0 after the first second, p95 frame <= 34 ms (headless is noisy; print the histogram).
  3. Calm: emulate reducedMotion 'reduce': html has class `calm`, result sheet opens with final pct at once.
  Print one PASS/FAIL line per check; exit code 1 on fail. Until other files land it will fail: write it to the contract, self-test what exists, say so in your 3 lines.
