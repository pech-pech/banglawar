# Project Volley P0 build contract (every agent reads this first)

Date 2026-11-10. Supervisor: main session. If your work conflicts with this file, this file wins; flag the conflict in your final report, do not silently diverge.

Design sources (read only the parts you need, network mount, always use the trailing-slash folder path, never search the whole /mnt/project-files/ tree):
/mnt/project-files/games-design/archero-type/2026-11-10/
- DESIGN.md sections 1, 2, 5 (P0 row), 9, 10, 11 (DESIGN wins over part files)
- design/D1-core-combat.md sections 1, 2, 3, 4 (controls, hero stats, formulas, E-01..E-03)
- design/D2-skills.md (the 6 P0 cards)
- design/D3-chapters-rooms.md section 3 (R01 Open Yard, R02 Twin Pillars, R03 Center Block) and the XP curve
Lessons: /mnt/project-files/games-lessons/LESSONS.md (sections "Added 2026-11-05" onward apply to code).

## What P0 is
Portrait one-thumb shooter, flat shapes. Three hand-made rooms loop R01 -> R02 -> R03 -> R01 ... with rising enemy HP and damage. Real XP curve, HP bar, field upgrade card screen at stage clear, death and one-tap restart. Tuning drawer. WebGPU renderer with Canvas 2D fallback. Fold cover screen first (344 x 882 CSS px portrait). Theme: military, the Operator (one super soldier) vs rogue machines. All names are ours. No monetization.

Room contents (DESIGN.md P0 row; positions from D3 spawn slots `e`):
- R01 Open Yard: 3 x E-01 Chaser drone.
- R02 Twin Pillars: 1 x E-01, 2 x E-02 Gun drone.
- R03 Center Block: 1 x E-03 Spread turret, 1 x E-02, 1 x E-01.
Stage counter starts at 1 and goes up by 1 per cleared room. Enemy HP = base x ENEMY_HP_GLOBAL (0.72) x (1 + HP_SLOPE x (stage-1)); damage = base x DMG_MULT x (1 + DMG_SLOPE x (stage-1)). HP_SLOPE 0.036, DMG_SLOPE 0.012 (DESIGN 11, ch1; linear is admin default). Gentle early numbers stay (M's pick).
Cover rule (M's pick, overrides D1/D3): pillars, crates and blocks stop enemy flat rounds as well as the Operator's rounds and lock line.
Controls (M verbatim): "The thumb control should take place on the game screen. No overlay required. No separate touchpad needs to be shown". Touch anywhere on the game screen, drag to move (direction = finger offset from touch-down point, full speed past the deadzone, hysteresis enter 14 px / exit 8 px CSS), release (or return inside deadzone) = stop, brace 0.15 s, auto-lock nearest enemy with a clear line, auto-fire. No joystick graphic, no ring at the thumb, no pad zone. Keyboard WASD/arrows also move (desktop testing only).
Upgrade cards: 6-card pool = forward round, multi-shot, attack +30%, attack speed +25%, diagonal rounds, ricochet (use D2 values and IDs for the matching SK entries). Cards offered per field upgrade = TUNE.CARDS_OFFERED, default 2 (admin default reading of "two upgrade picks from a 6-card pool"; 3 is the reference). Card screen appears at stage clear when a level-up is pending (one screen per pending level). Level cap 11.
XP: small 4, medium 8 (E-01 small, E-02/E-03 medium). Levels 2..11 cost 25, 35, 50, 65, 90, 125, 175, 245, 335, 465.
Defaults adopted (DESIGN 3): rifle holds fire when no clear line; free revive is NOT in P0; repair pack drop per D1 1.5.

## Files and owners (no two agents write the same file)
All code under /home/user/banglawar/pages/volley/src/ . Plain browser JS, no build tools, no npm installs (ask the supervisor first; playwright is preinstalled: `require('playwright')`, chromium.launch() needs no options).
Every part file starts with: `(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {}; ... })();`
so the sim files also load in node (`require`) for the headless bot.

| Owner | Files |
|---|---|
| A SIM | parts/tune.js, parts/rng.js, parts/rooms.js, parts/sim.js, bot.js (node), BOT-RESULTS.txt |
| B RENDER | parts/scene.js, parts/render2d.js, parts/gpu.js, parts/render.js, gpu-test.js |
| C SHELL | game.html, parts/input.js, parts/audio.js, parts/ui.js, parts/main.js, build.py, ../index.html (built), ../manifest.webmanifest, ../sw.js, ../icon-*.png, the one-line link in /home/user/banglawar/pages/index.html |
| D TEST | e2e.js, E2E-RESULTS.txt (Playwright, against the built ../index.html and src/game.html) |
Load order in game.html: tune, rng, rooms, sim, scene, render2d, gpu, render, input, audio, ui, main.

## Shared API (the seams; implement exactly these names)

### A SIM (pure, deterministic, no DOM, no Math.random, no Date)
- `V.TUNE_DEFAULTS` object of knobs (numbers/bools), and `V.TUNE` = a copy the shell mutates live. Knobs at least: ENEMY_HP_GLOBAL 0.72, HP_SLOPE 0.036, DMG_SLOPE 0.012, ENEMY_DMG_MULT 1, ENEMY_SHOT_SPEED_MULT 1, TELL_MULT 1, HERO_HP 600, HERO_ATK 150, CRIT_CHANCE 0.05, CRIT_MULT 2, MOVE_SPEED 4.5, BRACE_DELAY 0.15, FIRE_INTERVAL 0.8, ROUND_SPEED 14, ROUND_R 0.12, INVULN 0.6, CARDS_OFFERED 2, TIME_SCALE 1, HITSTOP_MS 50, DEADZONE_ENTER 14, DEADZONE_EXIT 8, HAPTICS true, SOUND true. Shell-only knobs may be added by C in ui.js by extending `V.TUNE_DEFAULTS`/`V.TUNE` at load (do not edit tune.js).
- `V.Rng(seed)` -> object with `.next()` [0,1), `.int(n)`, `.range(a,b)`. Every random source in the sim uses the run's Rng (L-TD-6).
- `V.ROOMS` = { R01:{name, grid:[15 strings of 9 chars], spawns:[{type,x,y}]}, R02..., R03... } and `V.ROOM_ORDER = ['R01','R02','R03']`.
- `V.CARDS` = [{id:'SK-xx', key, name, desc}] (6 entries, short plain names, our own wording).
- `V.Sim.create(seed, tune)` -> state S. `V.Sim.step(S, inp)` advances exactly 1/60 s x tune.TIME_SCALE (fixed step; the shell runs the accumulator). `inp = {mx, my}` world-space direction, length 0 = no move, else normalised by the sim. `V.Sim.pick(S, index)` chooses a card (index into S.cards). `V.Sim.restart(S)` -> new state with the same tune and seed+1.
- Coordinates: world units, 1 tile = 1 unit, room is x 0..9, y 0..15, y grows DOWN (row 0 = north door wall, row 14 = spawn row). Entity x,y are centres.
- State S (read-only to everyone else):
```
S = { seed, frame, t, tune,
  phase: 'play' | 'clear' | 'pick' | 'dead',   // clear = door open, walk north through it to load the next room
  stage, roomId, lap,
  room: { w:9, h:15, solids:[{x,y,w,h,kind:'wall'|'pillar'|'block'}], door:{x,y,w,h,open} },   // solids x,y = top-left corner
  hero: { x,y, r:0.28, hp, maxHp, atk, ang, moving, braced, brace01, fireCd, invulnT, lockId, lockClear, level, xp, xpNext, mods:{} },
  enemies: [{ id, type:'E-01'|'E-02'|'E-03', x,y,r, hp,maxHp, ang, st:'spawn'|'move'|'tell'|'act'|'cool', tell01, aimAng, flashT, size:'small'|'medium' }],
  rounds: [{x,y,vx,vy,r}],             // Operator rounds
  shots:  [{x,y,vx,vy,r}],             // enemy rounds; r is the hitbox; renderer draws them at 2x r
  pickups:[{x,y,kind:'xp'|'repair',v}],
  cards: null | [cardIndex, ...],      // set while phase==='pick'
  events: [ {k, x,y, ...} ],           // cleared at the START of each step. k in: fire, hit, crit, kill, hurt, lock, unlock, tell, door, room, levelup, pick, death, pickup
  stats: { kills, dmgTaken, hitsBy:{'E-01':n,...}, roomTimes:[{stage,roomId,s}], bracedSteps, playSteps, shots, picks:[] } }
```
- Headless bot (bot.js, node): idle, naive (moves randomly, stops often), skilled (dodges tells/shots, stops when safe) on at least 200 seeds (L-CD-1); report rooms cleared, death stage, HP left per room (L-TD-10), kill times / shots per enemy type vs D1 targets (E-01 2 shots, E-02 3 shots at stage 1), braced uptime %. Idle must die. Writes BOT-RESULTS.txt itself with date, seeds and every row (L-LOL-6).

### B RENDER
- `V.Scene.build(S, view, out)` turns state into a draw list. `view = {w,h,dpr, ox,oy, s}` (CSS px; s = px per world unit; screen = ox + x*s, oy + y*s). `out` is an array reused per frame (set out.length = 0 first); push primitives:
  `{p:'circle', x,y,r, c}` `{p:'ring', x,y,r,lw, c, a0?, a1?}` (arc when a0/a1 given, radians) `{p:'rect', x,y,w,h, rot?, c}` (x,y = centre) `{p:'line', x1,y1,x2,y2, lw, c}` `{p:'ngon', x,y,r,n,rot, c}`; all in CSS px; `c` = [r,g,b,a] 0..1.
  Scene covers: ground (whole screen; below the room the ground continues, not a panel), room walls/cover, door (closed/open), hero (cyan accents) with facing, brace progress ring, lock ring on target (amber when no clear line), enemies (dark gunmetal with red sensor light) with their tells (E-01 yellow flash, E-02 thin red aim line, E-03 barrel glow + ground fan wedge), hit flash (whole shape, QA-TW-6), Operator rounds (cyan), enemy shots (red-magenta, drawn at 2x hitbox), pickups, enemy HP pips, hero blink while invulnerable, simple particles from S.events (sparks on hit/kill; the scene keeps its own particle list, seeded from S.seed, never touching sim RNG). Look direction G2 (sand ground, thin dark outlines, hard low-sun shadow offset) but flat shapes only.
  Extra: `V.Scene.stress` (int, 0 = off) adds N dummy moving shapes for GPU load testing (set by ?stress=N or the drawer).
- `V.Render.create({c2d, cgpu, forceCanvas})` -> Promise<R>. `R.name` is a LIVE getter: 'WebGPU' or 'Canvas 2D' (L-TD-2). `R.resize(w,h,dpr)` (GPU DPR capped at 2), `R.draw(list, view)`, `R.readback()` -> Promise<{w,h,nonBg}> (GPU only), `R.onChange(fn)` called when the renderer switches (fallback/loss). The unused canvas is hidden. Fallback rules L-LOL-7 (slow-frame against measured cadence, whole-session window) and L-LOL-8 (release device on fallback, one re-init after a non-'destroyed' loss). Canvas 2D path: no per-frame shadowBlur (L-TD-9). Reference implementation to borrow from: /home/user/banglawar/pages/last-over-lane/src/parts/gpu.js and src/gpu-test.js (proven swiftshader flags).
- gpu-test.js: headless check that reports "WebGPU output: seen / NOT seen" via readback (L-TD-1), 0 console errors, Canvas 2D perf line (CPU 4x, 300 frames, gaps > 50 ms). Until game.html exists, test with your own tiny harness page (src/render-harness.html, yours) that loads the parts with a fake S.

### C SHELL
- game.html: `<canvas id="cgpu">` and `<canvas id="c2d">` full screen, DOM HUD on top: HP bar, XP bar + level, stage/room label, renderer label (reads `R.name` live, plus viewport WxH and dpr), gear button for the tuning drawer. Overlays: card screen, death screen (one tap restart), pause card, "cover screen build" note on wide screens (aspect > 0.75: game runs in a centred portrait column at 344:882 aspect, still playable). HUD text hidden under every overlay (L-TD-3). Touch targets >= 56 CSS px at 344 x 882 (L-TD-4). Toasts max 40% width (L-TD-5).
- Layout: room 9 x 15 fits the screen width under the HUD (s = min(w/9, (h - hud)/15)), sits at the top; the area below is ground and touchable. Thumb-safe: hero start (row 14) must not sit inside the bottom 15% of the screen.
- input.js: `V.Input.attach(el, tuneRef)`; `V.Input.read()` -> {mx,my} (CSS px offset converted to direction, hysteresis per TUNE.DEADZONE_ENTER/EXIT measured from touch-down); one pointer only; pointercancel/blur releases; keeps a compact input log for the report.
- audio.js: four synth sounds (fire, hit, hurt, door/levelup) via WebAudio, follow L-HB-1 and L-HB-2 (unlock on first pointerdown capture + keydown, suspend on hidden, voice cap, own RNG). Haptics via navigator.vibrate on hurt (and short on kill), guarded, TUNE.HAPTICS.
- ui.js: HUD updates, card screen (cards from S.cards, names from V.CARDS), death screen with run stats, tuning drawer with sliders for every TUNE knob (grouped: hero, enemies, feel, input), live apply, Reset, `Copy settings` (JSON of TUNE) and `Copy report` (settings + renderer + viewport + frame-time p50/p95/max + gaps > 50 ms + braced uptime % + hits by source + room clear times + kills + deaths + level + seed + build version). Clipboard with a textarea fallback.
- main.js: boot (read ?seed, ?gpu=0, ?stress=N), fixed 60 Hz accumulator (max 5 steps per frame), hit-stop (skip sim steps for TUNE.HITSTOP_MS on hit/kill events), red edge flash on hurt, pause on visibilitychange/blur and resume by tap (L-LOL-2), test hook `window.__pv = { get renderer(){...}, get S(){...}, step(n,inp), pick(i), restart(), readback(), tune, input }`.
- build.py: inline parts into one file (like last-over-lane/src/inline.py), then add PWA head + sw registration WITHOUT the landscape orientation lock (this game is portrait). Output ../index.html. Manifest name "Project Volley", portrait, theme #1b1a17. sw.js VERSION 'volley-p0-1'. Icons: simple generated PNGs (python stdlib only: write PNG bytes with zlib).
- Add the link to the game list in /home/user/banglawar/pages/index.html: `<br><a href="volley/">Project Volley</a>`.

### D TEST (Playwright, headless, viewport 344 x 882, deviceScaleFactor 1; also 412 x 904 and a wide 1104 x 884 check)
Tests against `window.__pv`: boots with 0 console errors on ?gpu=0 and default; renderer label text equals __pv.renderer; touch drag anywhere (including below the room) moves the hero, release braces and fires within about 0.3 s; no joystick element/graphic at the thumb; room clear opens the door and walking north loads the next room; card screen shows TUNE.CARDS_OFFERED cards, tapping one applies it; death screen and one-tap restart; HUD text not visible through overlays (elementFromPoint, L-TD-3); every button >= 56 px (L-TD-4); hidden-tab pause, then no damage during a faked 1 s gap (L-LOL-2); same ?seed gives the same run (step 600 frames twice, compare hashes); wide screen shows the cover-screen note. Write E2E-RESULTS.txt with date and every row. Until the shell exists, write the tests against the contract; then run them once game.html and parts exist (check for the files at most every 20 s, give up after 25 min and report).

## Rules for all agents
- Stay inside your own files. Read others' files freely.
- No installs, no network fetches, no commits or pushes (the supervisor commits).
- Short comments only where they help.
- Finish with a short report: what you built, how you tested it, what is unverified, any contract conflicts.
