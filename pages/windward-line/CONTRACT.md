# Windward Line proto: build contract (lead, 2026-11-25)

Game: wildfire valley defense, the "Zombies Aren't Real" type (plan with a budget, then watch; call-ins only live).
M must-haves, verbatim: "plan a clone of this type of game. change the setting and theme. keep visuals simple like this."
Picks: "Forest valley vs wildfire" (fire burns fuel, not people; villagers flee to shelters; rivers block; firebreaks are walls;
water bombers as call-ins; no one turns). "Call-ins only, like the video" (PLAN-only build; live = call-ins, pause, speed).
Spec: games-design/city-swarm-defense/2026-11-25-concept/CONCEPT-SHEET.md "PROTO SPEC v2". Player = adult (M). No kid framing.
Visuals: SIMPLE like the video: flat dark map, coloured cells, small dots. No art files. Canvas 2D.

Rules for makers: one owner per file (table below). Never edit a file you do not own. Need something from another file?
Use the API below exactly; if it is missing, write a tiny local fallback in YOUR file and mark `// admin default`.
Plain ES modules (`import`/`export`), no build step, no dependencies, no network. Sim files are pure (no DOM, no
Math.random, no Date) so Node tests can run them. All randomness through `state.rng` (or forks of it).
Self-test your file (node for pure files; Playwright for DOM files: `require('playwright')` works, chromium.launch()).
Return: path(s) + 3 lines (what, test result, open risk).

## Files and owners

| File | Owner | Exports |
|---|---|---|
| js/contract.js, CONTRACT.md | lead (frozen) | see file |
| js/rng.js | M1 | `makeRng(seed)` -> `{next(), int(n), range(a,b), chance(p), fork(label)}` (mulberry32; fork = new rng seeded by hash(seed,label)) |
| js/map.js | M1 | `buildMap(stage)`, `validateMap(map)` |
| js/fire.js | M2 | `fireStep(state)`, `igniteAt(state,x,y,kind)`, `wetCell(state,i,ticks)`, `extinguish(state,i)`, `windFactor(state,dx,dy)` |
| js/people.js | M3 | `spawnPeople(state)`, `buildFlow(state)`, `peopleStep(state)` |
| js/sim.js | M4 | `createState(stage,cfg,seed)`, `startRun(state)`, `step(state)`, `queueCallin(state,type,x,y)`, `checkEnd(state)`, `finishRun(state)`, `causeLine(state)`, `hashState(state)`, `runToEnd(state,maxTicks)` |
| js/plan.js | M5 | `costOf(state,action)`, `applyAction(state,action)`, `undo(state)`, `refundAll(state)`, `rebuild(state)`, `removeAt(state,x,y)`, `buildingAt(state,x,y)`, `planSummary(state)` |
| js/render.js | M6 | `initRender(canvas)`, `draw(r,state,view,overlay)`, `screenToCell(view,px,py)`, `fitView(viewW,viewH)` |
| js/ui.js, style.css | M7 | `initUI(root, api)` -> `{update(state), showResult(state), showUnlock(text), hideOverlays(), toast(text)}` |
| index.html, js/main.js | M8 | boot, loop, input, save; sets `window.WL` |
| js/tweak.js | M9 | `initTweak(panelEl, getCfg, setCfg)`, `copyReport(state)`, `listPresets()`, `savePreset(name,cfg)`, `loadPreset(name)`, `deletePreset(name)`, `presetCode(cfg)`, `parsePresetCode(code)` |
| js/testhook.js, layout-gate.json | M10 | `installTestHook(WL)` sets `window.__test` |
| tests/sim.test.mjs, tests/bots.mjs | M11 | node --test; bot rows |
| sw.js, manifest.webmanifest, icon-192.png, icon-512.png, icon-maskable-512.png | M12 | PWA |

## Map (map.js)
`buildMap(stage)` returns (deterministic, hand-made by code, NO rng needed):
```
map = { w:96, h:128, stage, type:Uint8Array(96*128) of TYPE,
  buildings:[{id, x, y, w, h, kind:'house'|'barn'|'hall', cells:[idx...]}],   // cells are TYPE.HOUSE
  homes:[{x,y,r,count}],          // where people spawn (sum of count = STAGES[stage].people)
  strikes:[{x,y,atSec}],          // fire starts; stage1: 1 at atSec 0 far north; stage2: 2 at 0
  spots:[{x,y}],                  // stage2 candidate new-spot cells (sim picks next one every STAGES.newSpotEvery s, up to cfg.spotMax)
  neck:[idx...],                  // stage 2 fuel neck cells (woods corridor across the river line) for the dozer
  town:{x,y,w,h} }
```
Layout (portrait, north = top = y 0, town = bottom third): forest (WOODS) top half with grass meadows, a river
(WATER) running west to east around y 70-74 with 2 BRIDGE crossings on the main roads, ROCK outcrops, town of ~30-40
buildings (house 2x2, barn 3x3, hall 4x4) at y 85-120, a grid of ROAD through town and 2 roads north into the forest
crossing bridges, grass around town. Stage 2: same valley, plus a WOODS fuel neck crossing the river line at the west
(a gap where woods touch on both banks, ~6 cells wide) so fire can reach the town flank without crossing water.
Wind: travel direction degrees, see `windVec` in contract.js (0 = south toward town, 180 = north). Stage 1 = 180 (away
from town), stage 2 = 225 then shifts -180 at 60 s -> 45 (toward the town's west flank via the neck).
`validateMap(map)` -> string[] of problems (empty = ok): sizes, people total, every building cell HOUSE, roads connect.

## State (sim.createState)
```
state = { stage, seed, cfg, rng, phase:'plan'|'run'|'result', tick:0, speed:1, paused:false,
  map, grid: initGrid(map),
  wind:{deg, level, vx, vy, shiftAtTick|null, shiftDeg|null, shifted:false},
  embers:[{x,y,vx,vy,left,from:{x,y}}],   // flying embers (float cells)
  people:{n, x:Float32Array, y:Float32Array, mode:Uint8Array, hp:Float32Array, freeze:Int16Array, home:Int16Array},
  plan:[action...],               // PLAN actions in order (replayable)
  zones:[{id,x,y,w,h,gates:[idx],cap,inside}], breaks:[{id,cells:[idx],width,breached:false,jumped:false}], roads:[{id,cells:[idx]}],
  crews:[{id,buildingId,x,y,range,tank,hydrant,lost:false,pump:false}], convs:[{buildingId,kind:'pump',x,y,radius}],
  callins:{bomber:{left}, dozer:{left}, queue:[{type,x,y,deg,atTick,done:false}]},
  money, spent:0,
  counts:{people0, safe:0, lost:0, burning:0, burnt:0, inZone:0},
  events:[], firstBreach:null, spotIndex:0, nextSpotTick, quietTicks:0,
  inputs:[{tick,type,x,y}],       // live call-ins, for replay
  result:null | {win, pct, stars, cause, hash, sec} }
```
Plan actions (plan.js): `{t:'zone',x,y,w,h}` (axis rect, cells inclusive), `{t:'break',x0,y0,x1,y1,width}`
(Bresenham line, widened perpendicular), `{t:'road',x0,y0,x1,y1}` (line of ROAD, BRIDGE over water),
`{t:'crew',buildingId}`, `{t:'pump',buildingId}`.
Costs: zone = perimeter cells x zoneCostPerCell; break = cells x breakCost (width included in cell count); road = new
road cells x roadCost; crew = crewBase + crewPerCell x building cells; pump = pumpCost. Max one pump (convMax).
`applyAction` checks phase === 'plan', tool allowed in STAGES[stage].tools, money, zone min side zoneMinSide, zone not
mostly water; pushes to `state.plan`, then `rebuild(state)`. `rebuild` = reset `state.grid` via `initGrid(state.map)`,
clear zones/breaks/roads/crews/convs, re-apply each plan action: zone cells -> `grid.zone=id+1` and burnable cells
inside -> CLEAR (whole zone cleared, admin default; buildings inside stay HOUSE but zone cells never ignite: fire.js
treats zone cells as non-burnable); gates = zone border cells that are ROAD/BRIDGE; cap = floor(area x zoneCapPerCell).
Break cells -> CLEAR + `grid.brk=id+1` (skip WATER/ROCK/ROAD cells). Road cells -> ROAD (BRIDGE on water). Crew range =
crewRangeBase + sqrt(building cells) (x pumpRangeMul if within a pump radius); hydrant = building centre inside a zone.
Money = STAGES[stage].money - sum of costs. `undo` pops last action + rebuild. `refundAll` clears plan + rebuild.
`removeAt(x,y)` removes the newest action covering that cell. `buildingAt(x,y)` -> building or null (nearest centre
within 3 cells). `planSummary` -> `{zones, breaks, roads, crews, pumps, cap, money}`. Each returns `{ok, reason}`.

## Run (sim.js, fire.js, people.js)
Tick = cfg.tickSec sim seconds. `step(state)` order:
1. wind: at `shiftAtTick - secToTicks(cfg,forecastLeadSec)` push 'wind-shift-warn'; at shiftAtTick deg += shiftDeg,
   recompute vx,vy via windVec, shifted = true, push 'wind-shift'.
2. strikes due this tick (atSec) -> `igniteAt(state,x,y,'strike')`; stage 2 new spot every newSpotEvery s from
   map.spots in order (up to cfg.spotMax) -> `igniteAt(...,'spot')`.
3. call-ins due -> bomber: line of cfg.bomberLen cells centred at (x,y), perpendicular to current wind, width
   bomberWidth: `extinguish` burning cells and `wetCell(state,i,cfg.wetTicks)`. Dozer: line of dozerLen cells
   perpendicular to wind, width 2: burnable -> CLEAR (burning ones extinguished first). Push 'callin-drop'.
4. crews: each live crew with tank >= 1 sprays up to sprayPerTick (x pumpRateMul) cells/tick: nearest burning cells in
   range first (each spray adds a hit; sprayOutTicks hits = `extinguish`), else pre-wets nearest unwet burnable cell
   within 2 of a burning cell in range. Each spray: `wetCell` + tank -1. Refill per second: hydrant = full tank;
   WATER within refillWaterDist = refill (x pumpRefillMul with pump). Crew building burning -> lost = true.
5. `fireStep(state)` (fire.js): burn countdown (0 -> burnt=1, never burns again). Spread: each burning cell tries 8
   neighbours with chance ignite[type] x windFactor(dx,dy) x (wet ? wetFactor : 1). Not burnable: ROAD, WATER, ROCK,
   CLEAR, BRIDGE, burnt, zone cells. windFactor = clamp(1 + windK x level x cos(angle(dx,dy) vs wind vec), windFloor, windCap).
   Firebreak heat: for each break, each brk cell: heat = sum heatW of burning cells within breakHeatR x windFactor
   toward the cell; if heat > breakHoldPerW x width, a burnable cell 1..width+1 beyond (downwind side) ignites at chance
   min(1,(heat-hold)/hold); first time per break push 'break-breach' (text names side via sideName).
   Embers: each burning cell spawns at chance emberRate x (1+level) x (woods 1, house 1.5, grass 0.3); flies downwind
   in +/-emberConeDeg cone, speed emberSpeed cells/tick, flight = emberFlightBase + emberFlightPerW x level cells; on
   landing ignite at emberLand[type] (x wetFactor if wet). If its straight path crossed a brk cell and it ignites,
   push 'ember-jump' once per break. Landing in a zone cell: push 'zone-hit' once per zone. Wet decays by 1.
   Also mark hot roads: ROAD/BRIDGE cell with 3+ burning neighbours; a gate cell that is hot -> 'gate-closed' once per
   zone; a road cell going hot with 20+ PANIC people within 10 cells -> 'road-cut' once. Store hot flags in grid.heat
   (heat >= 3 means hot) so people.js can read them. Update counts.burning/burnt.
6. `peopleStep(state)` (people.js): CALM wander near home 0.5 cells/s; AWARE when a burning cell within awareR (check
   via coarse 8x8 block burning counts, not per-dot full scan) -> PANIC; PANIC: freezeShare of dots freeze freezeSec
   first, then descend `grid.dist` to an open gate; speed runRoad on ROAD/BRIDGE else runOff; at a gate cell with zone
   capacity left (and gate flow budget gateFlow per second) -> SAFE (dot moves inside zone, stays). Zone full ->
   next nearest. LOST: on a burning cell, or hp <= 0 (heatDps/s within 1 cell of fire, smokeDps/s within smokeLen
   downwind). First LOST pushes 'first-loss'. `buildFlow(state)` = Dijkstra (binary heap) from open, non-full gates over
   walkable cells (ROAD/BRIDGE 1, GRASS/CLEAR 1.5, WOODS/HOUSE 2; burning, hot, WATER, ROCK blocked) every repathSec.
   No reachable gate: move away from nearest fire; alive dots adjacent to WATER or ROCK at end = refuge (count safe).
7. `checkEnd(state)`: quietTicks counts ticks with no burning cell and no ember (after the last scheduled strike);
   end when quiet >= endQuietSec or tick x tickSec >= roundMaxSec, then `finishRun`.
`finishRun`: phase 'result'; result = {win: pct >= cfg.winFloor, pct (int, (SAFE + refuge alive) / people0 x 100),
stars (count of cfg.stars reached), cause: causeLine(state), hash: hashState(state), sec}.
`causeLine(state)`: ONE line naming the first breach: "Wind shift hit west break at 1:04" (break-breach after
wind-shift), "Fire broke the north break at 0:52", "Embers jumped the north break at 0:41", "Embers reached the east
shelter at 1:12", "Road cut south-west at 0:58", "Gate closed at the west shelter at 1:02"; no breach but loss:
"Fire reached people in the south-west at 0:47, no shelter near"; win: "Passed: 64% alive (40 lost). First loss: south at 0:29" (see sim.js). sideName + fmtTime.
`hashState` = FNV-1a 32-bit over tick, grid.burn, grid.burnt, people x/y quantised (x*4|0), people.mode, money.
`runToEnd(state, maxTicks=20000)` steps until phase 'result'. `startRun` requires phase plan: spawnPeople, sets
nextSpotTick, shiftAtTick, phase 'run', buildFlow. Same seed + plan + inputs = same hash.
Retry / Edit plan: main.js copies the last run's `state.inputs` into `newState.replay`; `step()` re-queues each replay entry via `queueCallin` at its original tick (step 0, before wind and call-in resolution). Retry same plan therefore replays the live call-ins; Edit plan + START replays them too by default (admin default; a changed plan may make them land differently). `state.replay:[{tick,type,x,y}]`, empty on a fresh state.
`queueCallin(state,type,x,y)` -> {ok,reason}: phase run, tool in STAGES tools, uses left > 0; pushes queue
{atTick: tick + secToTicks(delay)}, inputs.
createState: rng = makeRng(seed); money = STAGES[stage].money; callins left from cfg; people arrays empty (n=0) until
startRun; counts.people0 = STAGES[stage].people.

## Screen (render.js, ui.js, main.js)
Look: SIMPLE like the video. Background #0d1117. Cells: GRASS #3d4a2a, WOODS #1f3a24, HOUSE #b9a27a (buildings get a
1 px darker outline), ROAD #5a5f66, WATER #1f4e79, ROCK #4a4a4a, CLEAR #6b5a3e, BRIDGE #7a6a50, burnt #1a1a1a.
Burning cell = orange/red dot cluster (#ff7a1a / #ff3b1a flicker by (i*31+tick)%k, no Math.random in render).
Ember = 1-2 px #ffd34d dot. People: white dots (#f2f2f2) CALM/AWARE, PANIC brighter + 1 px bigger, SAFE = #6fe3ff,
LOST = dim grey #555 dot stays (admin default). Zone = 2 px cyan #39d0ff outline + 15% fill; gates = small cyan
squares. Breaks = CLEAR cells + brown #a0703a outline. Crews: blue #4aa3ff filled square on building + range ring
(always in PLAN, faint in RUN), tank bar. Pump: dashed blue radius ring. Wind arrow drawn on map corner. Call-in
queue: dashed white line where it will land + seconds left. Canvas text >= 12 px. Cache static terrain in an
offscreen canvas; redraw dynamic layers each frame.
`view = {ox, oy, scale}`: screen x = cellX x CELL_PX x scale - ox (same for y). `fitView(viewW,viewH)` -> view that
fits the whole map centred. `screenToCell(view,px,py)` -> {x,y} floats. `overlay` = `{preview:{t,x0,y0,x1,y1,x,y,w,h,
ok,cost}|null, armed:'bomber'|'dozer'|null, aim:{x,y}|null, selectBuilding:id|null}`.

UI (DOM over the canvas; Fold cover 344x882 first, also 475x638, 704x823, 882x704, 384x824, 1366x768, 1920x1080):
- Top bar (read-only): money, "Valley 1 · stage 1/2", "Safe 0% / 25%", timer, wind arrow + forecast strip
  "now -> +60 s" (stage 2 shows the coming shift in PLAN and the warn in RUN), DEV badge (#dev-badge) when
  cfgDiffers(cfg), settings button #btn-settings.
- PLAN tray (#tray-plan): info row (tool, cost, hint), tools `button[data-tool=zone|break|road|crew|pump]`, break
  width chips 1/2/3, Undo, Clear all, START (#btn-start, 56 tall). Min tap 48x48, primary 56. No controls within
  16 px of left/right/bottom edges. Tray <= 30% of height on cover. Wide screens (>= 600 px wide and landscape):
  tray as right column.
- RUN tray (#tray-run): call-in chips `button[data-callin=bomber|dozer]` (uses left, "lands in 6 s", armed state),
  pause, 1x/2x/4x.
- Result sheet (#result): big %, PASS/FAIL vs floor, stars, ONE cause line (#cause), Retry same plan, Edit plan,
  Next stage (stage 1 win) / "Valley 1 continues - stages 3 to 5 later" after stage 2 win.
- Unlock card (#unlock) after stage 1 win: "Dozer line unlocked".
- Settings sheet (#settings): tweak panel (#tweak-panel, tweak.js renders), Copy report (#btn-copy) and Save preset
  (#btn-save-preset) side by side, presets list, preset code box, seed field, stage picker (1, 2 if unlocked),
  Reset to default.
api passed to initUI (main.js builds it): `{getState(), getTool(), setTool(t|null), setBreakWidth(w), undo(),
clearAll(), start(), pause(bool), setSpeed(n), armCallin(type|null), retry(), editPlan(), nextStage(), goStage(n),
openSettings(), closeSettings(), getCfg(), setCfg(cfg), setSeed(n), copyReport(), isUnlocked(tool)}`.
Element ids (fixed): #app, #map (canvas), #topbar, #tray-plan, #tray-run, #result, #cause, #unlock, #settings,
#tweak-panel, #dev-badge, #toast, #btn-start, #btn-settings, #btn-copy, #btn-save-preset.
Text >= 12 px everywhere (layout gate HARD). No horizontal scroll. Safe-area insets. Text never over map marks.

Input (main.js): no tool armed: 1 finger pans, 2 fingers pinch-zoom (wheel zoom on desktop). Tool armed: 1 finger
draws (zone = drag rect, break/road = drag line, crew/pump = tap building), 2 fingers always pan/zoom. Preview
label 64 px above the finger. Call-in: tap chip (arms), tap/drag on map shows aim, release = queueCallin; tap chip
again = cancel. Keyboard: Space pause, 1/2/3 speed, Esc cancel. Pointer events only.
Save (localStorage 'wl-save-v1', try/catch every read/write): {unlocked:[...], best:{1:pct,2:pct}, seed}.
Loop: requestAnimationFrame; sim ticks per real second = speed / tickSec; max 8 steps per frame; paused = 0.
`window.WL = {state, api, cfg, view, newState(stage,seed), render(), setOverlay(o), ui}` for the test hook.
URL `?seed=N&stage=N` honoured; `?bench=1` runs 600 ticks of stage 2 and toasts ms/tick. `?layoutgate=1` = no
animations needed (gate sets reduced motion).

## Test hook (testhook.js, M10)
`window.__test = {ready:Promise, states(), goto(name), seed(n), hash()}`; follow tools/layout-gate/CONTRACT.md s4.
States: plan-empty, plan-built, plan-stage2, run-early, run-mid, run-paused, callin-armed, result-win, result-fail,
unlock, settings-open. goto builds each by deterministic calls on WL (fixed bot plan via plan.applyAction, step N
ticks, finishRun) and resolves after 2 rAF. layout-gate.json: version 1, entry index.html, minStates 8, canvas true,
webgl false, settleMs 150, soft [], waivers []. main.js imports testhook.js and calls installTestHook(window.WL).

## Tests (M11)
tests/sim.test.mjs (node --test, imports ../js/*.js): map validates both stages; same seed+plan -> same hash twice;
changed plan -> different hash; idle plan stage 2 loses on seeds 1..200 (report loss rate; target >= 95%); a scripted
"good" plan wins stage 1 on most seeds; causeLine non-empty on a fail; round length sec reported.
tests/bots.mjs prints rows: idle, naive (1 zone on town), skilled (zone + breaks + crews + bomber) x stages 1-2 x 50
seeds: win rate, mean pct, mean round sec, mean ms/tick.

## PWA (M12)
sw.js EXACT shape from pages/_shared/CONTRACT-pwa-update.md section 3, game 'windward-line', precache ['./',
'./index.html','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png',
'./js/contract.js','./js/rng.js','./js/map.js','./js/fire.js','./js/people.js','./js/sim.js','./js/plan.js',
'./js/render.js','./js/ui.js','./js/main.js','./js/tweak.js','./js/testhook.js'], legacy [].
manifest like pages/chart-school/manifest.webmanifest (name Windward Line, theme #0d1117, portrait).
Icons by code (PIL if present, else node canvas-free PNG writer): dark bg, orange fire dots, cyan shelter square, white dots.
index.html (M8) head must carry `<meta name="pgs-build" content="__PGS_BUILD__">` and
`<script src="../_shared/update.js" defer></script>`, register `./sw.js`.

## Balance-1 changes (2026-11-25, after QA; see games-design/city-swarm-defense/2026-11-25-build/BALANCE-1.md)
- Score = % of people ALIVE at end (like the reference "% saved"). Anyone outside a shelter or refuge who was ever
  within cfg.exposeR (6) cells of fire counts lost at the end (people.exp flag).
- One shelter holds at most cfg.zoneCapMax (130) people (applied in sim.startRun). zoneCostPerCell 20, zoneCapPerCell 1.0.
- Houses inside a shelter can burn; cleared shelter ground cannot.
- Stage 1 wind travels toward the town (deg 0, level 1) so stage 1 teaches; stage 2 225 -> shift -180 at 60 s.
