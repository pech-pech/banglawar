# Plumbline build contract (admin default choices marked [AD])
Source specs: /mnt/project-files/games-design/gravity/2026-11-18/concept-a-plumbline.md + KICKOFF.md "Fixes". This file wins on conflict.
Folder: /home/user/repo/pages/gravity-plumbline/. Parts in src/parts/*.js are plain scripts, concatenated in this order into ONE index.html by src/inline.py:
  core.js, rooms.js, camera.js, draw.js, ui.js   (shell: src/shell.html has `<!--PARTS-->`)
Every part starts with `const PL = (globalThis.PL = globalThis.PL || {});` and attaches to PL. core.js, rooms.js, camera.js MUST load in plain Node (no DOM). ui.js is DOM only. No external libs, no fetch, no paid art, plain shapes.

## Conventions
- px and seconds. Fixed step DT=1/120. Seeded RNG mulberry32 only; never Math.random in sim/rooms.
- Gravity dir index g: 0=up(0,-1) 1=right(1,0) 2=down(0,1) 3=left(-1,0). PL.DIRS = [[0,-1],[1,0],[0,1],[-1,0]].
- Rect = [x,y,w,h]. Room interior 336 wide x 500 tall (room coords, origin top-left). Border walls are included in room.walls (12 px thick, inside the 336x500 box).
- Bob: AABB collider 22x22 centred on (x,y) (half 11) [AD: box collider, drawn as circle r 12 -> use r 11 to match]. Spikes/exit use centre-distance/overlap tests below.

## Room object (rooms.js produces, core.js consumes)
{ name, teach, w:336, h:500, start:{x,y,g}, walls:[rect], spikes:[{r:rect}], crumbles:[rect], gates:[{r:rect,dir:g}], crushers:[{r:rect,ax,ay,amp,phase}], exit:{x,y} }
crusher rect at time t(s) = r shifted by (ax*amp*sin(2*pi*t/2.4+phase), ay*amp*sin(...)); ax,ay in {0,1}.

## core.js API
PL.C = {DT:1/120, G:1500, CAP:700, DIVE_CAP:900, DIVE_ADD:250, DIVE_BOOST_T:0.3, DIVE_CD:0.5, CHARGES:2, HALF:11, FRIC:900, DRAG:0.35, DRAG_AFTER:0.3, BOUNCE_SIDE:0.15, BUFFER:0.08, CRUMBLE_T:0.35, GATE_V:120, RESPAWN_T:0.3}
PL.DIRS
PL.newState(room) -> state
PL.step(state, inputs) -> mutates state one tick. inputs: array of {k:'flip',dir} | {k:'dive'}, applied at the START of the tick. Returns nothing; pushes strings into state.events (cleared at start of each step): 'flip','dive','land','death','win','crumble'.
PL.hash(state) -> string (x,y,vx,vy,g,charges,t,flips,dead,won, crumble states; exact numbers joined with ',').
PL.replay(room, log) -> {state, hash}: log=[{tick,k,dir}] sorted; runs from newState until log end + 600 ticks or win/death.
PL.solids(state) -> array of current solid rects (walls + intact crumbles + gates + crushers at current tick). Gate rects are included only if bob cannot pass (see rules).
State fields: room,t(tick),x,y,vx,vy,g,charges,grounded,airT,diveCd,diveBoost,pending(null|{dir,age}),crumbleS[] ({st:0|1|2,timer}), dead(ticks left, 0=alive), won, flips, lastLandSpeed, events[].
Rules (from concept A + review fixes):
1. v += DIRS[g]*G*DT; p += v*DT, semi-implicit Euler. Move x then resolve vs solids, move y then resolve.
2. ONE cap 700 on each axis (|vx|,|vy| <= CAP); while diveBoost>0 cap is 900. Drag 0.35/s on the off-gravity axis only once airT > 0.3 s.
3. Flip never changes v. Flip: same dir as g -> ignored. Grounded -> free. Airborne -> costs 1 charge if charges>0; if charges==0 store pending {dir,age:0}; pending expires after BUFFER s, applied free if landing happens inside it. Charges start 2, refill to 2 on any landing.
4. Dive (tap): if diveCd<=0: grounded -> free, airborne -> costs 1 charge (ignored if 0). Adds DIVE_ADD along DIRS[g] (may exceed CAP up to DIVE_CAP for DIVE_BOOST_T s), diveCd=0.5. [AD: review-1 defect 2 fix]
5. Grounded = hit a solid on the gravity side this tick. Friction 900 px/s^2 on the surface-parallel axis while grounded. Landing: v along gravity axis -> 0; side/ceiling hits bounce back 0.15*v.
6. Crumble: ledge starts a 0.35 s timer when landed on; then st=2 (gone) until room reset.
7. Gate: solid unless v.dir-component >= GATE_V (v dotted with DIRS[gate.dir]); one-way along its arrow.
8. Crusher is solid; if after resolve the bob still overlaps any solid by >1 px -> death.
9. Spike overlap (bob box shrunk 3 px each side) -> death. Exit: |bob centre - exit| < 18 -> won. Death: dead=RESPAWN_T*120 ticks countdown (inputs ignored), ui resets the room when it reaches 0.
10. [AD] Wall-ride refill is NOT in the 5-min proto (slice). Charge refill only on landing.

## rooms.js API
PL.mulberry32(seed) -> fn()->[0,1)
PL.buildRooms(seed) -> [room1, room2, room3]; seed picks per-room x-mirror and crusher phase only (layouts hardcoded). Same seed -> deep-equal result. Rooms teach in order: 1 Arc Carry (flip mid-fall bends path across a gap, spikes on the lazy line), 2 Charge Banking + crumble ledge + gate (Dive-tap needed to pass the gate), 3 crusher rhythm + Late Flip. Each room must be solvable; room 1 clearable in under 12 s with 2 flips. Start all rooms with gravity down on a ledge. No plain "flip to dodge spikes" rooms.

## camera.js API (pure, Node-loadable)
PL.camNew() -> cam
PL.camUpdate(cam, state, view, dt) -> frame {scale, cx, cy}  (room point (cx,cy) is the screen centre of the play area; screen px = (p - c)*scale + (W/2,H/2)). view={W,H} CSS px of the canvas; control strip = bottom 40% (y >= 0.6*H).
Targets: base scale W/336, zoom OUT with speed up to 480 px visible width at 700 px/s; look-ahead along velocity: 0.35 s on views with aspect W/H > 0.6 (475x638), 0.25 s on tall (344x882); bob kept at or above 55% of H on screen always; clamp so the room is not scrolled past its box more than 40 px; smooth (critically damped) but never lag so much that bob leaves the screen. Deterministic given inputs.
PL.sightAhead(frame, state, view) -> seconds of visible room ahead of bob along its velocity at current speed (for tests). Report in a header comment the measured values at cap speed on 344x882 and 475x638 falling toward the strip.

## draw.js (canvas drawing only, no input, no loop; Node-loadable if given a fake ctx)
PL.draw(ctx, view, frame, state, hud) -> draws one frame. view={W,H,dpr,inset:{t,b,l,r}}; frame from PL.camUpdate; hud={roomIdx,roomName,teach,timeS,flips,deaths,pathOn,seed,toast,ring(0..1 restart ring fill),completeScreen:null|{timeS,flips,deaths},fps,fx:[{x,y,age}] dust}.
PL.predictPath(state, seconds) -> [{x,y}] points (clone of bob only, current gravity, no flips; stops at spike/exit/landing/death). draw.js draws everything: room, hazards, bob, plumbline, path, HUD text, charge pips, the two 56x56 buttons (draw only) and PL.BTN = {copy:fn(view)->rect, path:fn(view)->rect} hit rects used by ui.js; the bottom-40% strip tint; room-complete screen. Plain shapes.

## ui.js (DOM)  [draw.js owns all pixels; ui.js owns events, loop, flow, report]
Canvas fills the viewport (100dvw x 100dvh, devicePixelRatio aware, safe-area insets). Fixed-step accumulator (max 5 steps/frame). Input in bottom 40% only (pointer events, touch-action none): swipe fires the instant drag passes 24 px with dominant axis lead 1.25x; tap (<180 ms, <10 px) = dive; hold 600 ms with <10 px move = restart room with a 72 px ring fill; keyboard arrows + Space for desktop debug. Input events are queued and applied at the start of the next tick; every applied input is logged {tick,k,dir} (tick = state.t at application).
HUD (top): room n/3 + name, run time, flips, deaths, charge pips; two 56x56 buttons top-right: Copy report, Path on/off (predicted path under current gravity, 0.8 s, dotted, stops at hazard/landing; default ON [AD]). Plumbline: 2 px line from bob toward current down. Draw: walls dark rects, spikes triangles, crumbles dashed, gates with arrow, crushers with track line, exit ring, dust burst on land (plain). Respect prefers-reduced-motion (no shake, no dust).
Flow: 3 rooms in sequence, run complete screen (time, flips, deaths, tap to restart; ignore taps for 500 ms after it appears). Seed from ?seed= else 1; show seed. Restart under 0.3 s.
Copy report (navigator.clipboard with textarea fallback, shows toast): seed, build id, UA, viewport + dpr, avg fps, run time, per-attempt log [{room,attempt,ticks,result,flips,landSpeeds[]}], 2nd-attempt-vs-first time per room, full input log, determinism check line: PL.replay of each cleared room's inputs equals recorded end hash -> "determinism OK/FAIL". Also print "WebGPU output: NOT seen (canvas 2D)".
Expose window.PL_TEST = {getState(), setSeed(n), inject(inputs), room(n)} for the test maker.

# SLICE CONTRACT (feature slice, after proto). Part order in inline.py: core, rooms, tpl1, tpl2, camera, draw, meta, audio, ui. Same `const PL = ...` header, each wrapped in an IIFE by inline.py. All new sim logic stays deterministic (no Date/Math.random in core/rooms/tpl).
## core.js additions [AD choices]
- PL.C gains WALL_RIDE_T:0.25, COYOTE_T:0.06. Wall-ride: airborne bob in continuous contact with a non-gravity-side solid (side wall / ceiling) for >= WALL_RIDE_T refills +1 charge (max CHARGES), once per distinct solid per airborne period (reset on landing). Coyote: for COYOTE_T s after grounded turns false (walking off a ledge, not after a flip/dive), flip and dive still count as grounded (free). Integer tick counters; add all new counters to PL.hash. State gets: rideT, rideUsed[], coyote. Events add 'ride'.
- Existing tests (test/sim.test.js, core-fix.test.js) must keep passing; add test/slice-core.test.js for both rules.
## rooms.js additions
- PL.mirrorRoom(room) -> new room mirrored in x (rects x' = 336 - x - w, exit/start x mirrored, gate dir 1<->3, start.g 1<->3, crusher phase = -phase, name unchanged, mirrored:true).
- PL.TEMPLATES = [] of {id, tier(1..3), teach, make(rng)->room}. rooms.js registers the existing 3 rooms as t01..t03 (tiers 1,2,2). tpl1.js pushes t04..t12 (9 templates), tpl2.js pushes t13..t20 (8 templates). Each make(rng) returns a full room object (contract room format, 336x500, 12 px border) using rng only for crusher phases.
- PL.buildShaft(seed, n=7) -> n rooms: rng from mulberry32(seed); pick n distinct templates, ordered by tier ascending (shuffle within tier by rng), each mirrored with rng()<0.5, room.templateId set. Same seed deep-equal. PL.buildRooms(seed) unchanged (tutorial trio).
- Template rules: no plain "flip to dodge spikes" rooms; each teaches one of: Arc Carry, Late Flip, Charge Banking, Corner Whip (wall-ride), Gate Punch (Dive over gate threshold), crusher rhythm; header comment per template with intended solution. EVERY template must be solvable with <=5 inputs in <=25 s for both mirror states (verify with a node brute-force harness importing core.js + rooms.js + your tpl file; src/test/solve.js is a model).
## meta.js (DOM-free except localStorage in try/catch)
PL.meta = { BANDS (PROPOSED, for 7-room shaft: bronze 240 s, silver 150, gold 105, plumb 75 and <=12 flips; flipStar <=15 flips; scale linearly by n/7 for other n), medalFor(ticks, flips, nRooms)->'plumb'|'gold'|'silver'|'bronze'|'none', flipStar(flips,nRooms)->bool, dailySeed() -> integer yyyymmdd of local date, keyFor(mode,seed,n), load() -> store object, recordRun(key,{ticks,flips,deaths,tuned}) -> {isBest,best:{ticks,flips,medal},medal,flipStar}, getBest(key), reset() }. localStorage key 'plumbline.v1', try/catch everywhere, never downgrade a saved best, tuned runs (tuned:true) are never saved as best.
## audio.js
PL.audio = { init() (create AudioContext lazily on first user gesture), onEvents(events, state) plays blips: flip, dive, land (volume by lastLandSpeed), death, win, crumble, ride; setMuted(b), isMuted(). Pure WebAudio synth, no files. Respect prefers-reduced-motion? no (audio ok) but volume low (<=0.15 gain). Node-loadable with AudioContext absent (all calls no-op).
## draw.js additions
PL.menuLayout(view, items) -> items with rect {x,y,w,h} (w>=240, h>=56, 16 px gap, centred in the upper 60% of the view); PL.drawMenu(ctx, view, menu) with menu={title:'Plumbline', sub, items:[{id,label,sub}], seed, hint, bestLines:[]}. hud.completeScreen gains {medal, flipStar, best:{timeS,flips,medal}, newBest, mode, seed, nRooms}; shows medal name and flip star, "tap to continue". hud.trail=[{x,y}] -> draw the last 2 s path as a faded polyline when present (death replay trail). hud.tuning={open, rows:[{id,label,value}], dirty} -> PL.tuningLayout(view, rows) -> rows with rects {minus:{x,y,w,h}, plus:{...}, label rect}, each button >=56 px; panel is drawn over the play area with a TUNED badge when dirty. hud.muted draws a small speaker state in the Path/Copy button row: PL.BTN gains snd(view) rect (56x56) left of path.
## ui.js additions
Start menu (items: Tutorial rooms (3 rooms, seed from ?seed else 1), Shaft: Daily (7 rooms, PL.meta.dailySeed()), Shaft: Seed (DOM text input overlay, digits only, no prompt()/alert()), Best times). Back to menu = hold 600 ms on the room-complete screen or a 56 px Menu button on the complete screen. Modes use PL.buildRooms / PL.buildShaft. After run complete: PL.meta.recordRun, show medal/best on the complete screen. Death trail: keep a 240-sample ring buffer of bob positions, on death pass hud.trail for 1.2 s. Tuning panel: long-press (800 ms) on the top-left HUD area (x<140,y<56) toggles it; rows G (1200..1900 step 100), CAP (500..900 step 50), CHARGES (1..4), each -/+ button; changes apply live to PL.C; a run with any non-default value is flagged tuned (not saved as best) and the Copy report prints the tuned values. Sound: call PL.audio.init() on first pointerdown, PL.audio.onEvents after each step batch; snd button toggles mute (persist in localStorage 'plumbline.mute' try/catch). Copy report additionally prints: mode, seed, template ids, medal/best, tuned values, wall-ride count per room.
