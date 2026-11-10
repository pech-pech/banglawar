# Project Volley P1 build contract (adds to CONTRACT.md; this file wins where they differ)

Date 2026-11-10. M picked P1: Chapter 1 stages 1-10 hand-authored, E-01..E-05, ONE boss = B-01 Volley Tower at stage 10 (M's pick; D3 lists B-03 there, M overrides), Supply Drop at stage 5, Cache at stage 9, the 16 ch1 field mods, results screen. Cards per field upgrade = 3 (M's pick; TUNE.CARDS_OFFERED default 3). Already done from P0 visual QA: enemies pushed apart from the hero, hero blink 35%, room floor same sand as ground. Gentle numbers stay; difficulty knobs stay in the drawer.
Design: D3 section 2.1 rows 1-10 (stages), section 3 (R01-R03, SD, CA1, BA1 templates), section 5 (Cache); D1 section 4 (E-04, E-05) and section 6 B-01; D2 (ch1 pool SK-01..07, 09, 11, 13, 15, 16, 17, 27, 33; Supply Drop minors SK-10, 12, 14, 15); DESIGN.md sections 3, 9-11 (stage 4 eased to 3 enemies, templates swapped at stages 6 and 8, Cache spike gaps 2 tiles, stages 1-10 fixed positions and spawn timing; cover blocks enemy flat rounds; lobbed shells pass over cover).
Folder: /mnt/project-files/games-design/archero-type/2026-11-10/ (network mount, trailing slash, never search all of /mnt/project-files/).

## Run flow
Stage 1 -> ... -> 10. Stage 5 Supply Drop (no enemies; pick 1 of 2: a Supply Drop minor mod, or repair 40% max HP). Stage 9 Cache (2 x E-01 plus spikes; after clear, a chest gives one free field-upgrade card screen and 2 repair packs; no credits in P1). Stage 10 boss B-01 in BA1. Boss killed -> phase 'results' (win). Death -> phase 'results' (lose). Results screen: win/lose, stage reached, time, kills, level, mods taken, damage taken, then one tap = new run. P0's endless loop is removed (keep TUNE.ENDLESS false; if true, continue from stage 1 with lap scaling after the boss).

## New seams (exact names)
State additions (owner SIM): `S.phase` adds 'supply' | 'results'; `S.stageKind` 'combat'|'supply'|'cache'|'boss'; `S.shells: [{x,y,tx,ty,t,T,r,dmg,src}]` (lobbed, land at tx,ty when t>=T, ignore cover; the renderer draws the landing marker the whole flight); `S.hazards: [{x,y,w,h,kind:'spikes'}]` (60 base dmg scaled, 1.0 s re-hit, ignore cover); `S.boss: null | {id, type:'B-01', name, hp, maxHp, phase:1|2, attack:'A'|'B'|'C'|null, tell01}` (the boss is ALSO in S.enemies with `boss:true`, r about 1.0); `S.chest: null | {x,y,open}`; `S.supply: null | [{kind:'mod',index}|{kind:'repair'}]`; `S.result: null | {win, stage, t, kills, level, picks, dmgTaken}`; `S.fx: []` visual hints from mods (cleared each step like events).
Enemies registry (owner ENEMIES for E-04, E-05, B-01; owner SIM moves E-01..E-03 into it): `V.AI[type] = { base:{hp, contact, dmg, speed, r, size, xp, tell, cd}, init(S,e,api), step(S,e,dt,api) }`. Files: parts/ai-p0.js (SIM: E-01..E-03), parts/ai-p1.js (ENEMIES: E-04, E-05), parts/boss.js (ENEMIES: B-01). Sim calls `V.AI[e.type].step` each step for living enemies and handles generic things (spawn grace, hit flash, death, XP, separation).
`api` = `V.Sim.api` (owner SIM): `ev(S,o)`, `rng(S)` (run Rng), `enemyDmg(S,base)`, `steerTo(S,e,tx,ty,speed,dt)`, `enemyShoot(S,e,ang,speed,dmg,opts)` (opts.bounces), `lob(S,e,tx,ty,T,r,dmg)`, `hurtHero(S,dmg,src,x,y)`, `clearLine(S,x1,y1,x2,y2,pad)`, `hitsSolid(S,x,y,r)`, `hero(S)`, `dist(a,b)`, `angleTo(a,b)`, `tellT(S,base)` (applies TELL_MULT), `spawnEnemy(S,type,x,y)`.
Mods registry (owner MODS, parts/mods.js): `V.MODS = [{id:'SK-xx', key, name, desc, max, pool:['F'|'SD'|'BB'], weight, hooks}]`; `V.CARDS = V.MODS` alias. Hooks (all optional; sim calls them with n = copies held): `stats(S, n, st)` adjusts derived stats st = {atkMul, rateMul, critAdd, hpMaxAdd, dmgTakenMul, moveMul}; `pattern(S, n, list)` pushes extra rounds `{ang, off, mul}` (ang relative to forward, off = sideways offset, mul = damage multiplier) for one volley; `round(S, n, r)` sets flags on each new round (r.pierce, r.bounceWall, r.rico, r.burn, r.poison, r.freeze ...); `onHit(S, n, e, r, api)`; `onKill(S, n, e, api)`; `tick(S, n, dt, api)` (orbitals/strikes; may push to S.fx); `onPick(S, n)`. Values from D2 and DESIGN section 3 rows 5, 7, 12. Offer = CARDS_OFFERED distinct mods from the chapter pool weighted by `weight`, never a capped one; SIM implements offer and the hook calls, MODS implements the 16 mods + 4 SD minors.
Stages (owner STAGES, parts/stages.js): `V.STAGES = { ch1: [ {stage, kind, room, spawns:[{type,x,y,t}], note} x 10 ] }` with fixed positions and spawn times (t = seconds after room start), plus extra room templates added to `V.ROOMS` (SD, CA1 with spikes '^' and 2-tile gaps, BA1, plus any swapped templates for stages 6/8). Grid legend as D3; add '^' spikes, 'C' chest spot, 'B' boss spot.
Render (owner RENDER, scene.js): E-04 walker + landing ring marker per shell + shell arc; E-05 kneel + red lane line (locks 0.2 s before dash) + stunned look; B-01 big multi-barrel tower with attack tells (A: floor lines, B: barrel spin-up, C: fan + first bounce segment drawn) and a phase-2 look; spikes; Supply Drop crate; Cache chest; mod visuals from round flags and S.fx; a small HP bar above the hero (M's UI pick: top bar AND HP over the hero). Keep hit flash, blink 35%, same-sand floor.
Shell (owner SHELL): supply screen (2 choices), cache card screen, results screen, boss HP bar (DOM, top of room, boss name), card screen per M's UI picks (sent separately), Copy report adds stage reached, result, mods. game.html adds the new script tags in load order.
Tests (owner TEST): e2e for the P1 flow (stage 5 supply, stage 9 cache chest, stage 10 boss, results win/lose, 3 cards). Mark the 6 sandbox "default picks WebGPU" rows EXPECTED with the reason (M's Fold report 12:11 showed renderer WebGPU, 16.7 ms p95, 0 gaps). Fix the knob-count check so each knob needs its own input.
Bot (owner SIM): bot.js runs stage 1-10 runs for idle/naive/skilled plus a human-like bot (0.25 s reaction delay, position-only threat model): clear rate, death stage, HP per stage, boss kill time, hits by source. 200+ seeds.

## Files and owners
| Owner | Files |
|---|---|
| SIM | parts/sim.js, parts/ai-p0.js (new), parts/tune.js, parts/rooms.js (keeps R01-R03), bot.js, BOT-RESULTS.txt |
| ENEMIES (new) | parts/ai-p1.js, parts/boss.js |
| MODS (new) | parts/mods.js |
| STAGES (new) | parts/stages.js |
| RENDER | parts/scene.js, render2d.js, gpu.js, render.js, gpu-test.js |
| SHELL | game.html, parts/input.js, audio.js, ui.js, main.js |
| TEST | e2e.js, E2E-RESULTS.txt |
| Supervisor | build.py runs, commits |
Load order: tune, rng, rooms, stages, mods, sim, ai-p0, ai-p1, boss, scene, render2d, gpu, render, input, audio, ui, main.
Same rules as CONTRACT.md: own files only, deterministic sim (no Math.random/Date), no installs, no network, no commits. SIM lands the registry seams FIRST (within about 8 minutes) and posts a note at the top of sim.js when they exist; until then others code against this file.

## Renderer-read fields (from RENDER, 12:18; missing fields fall back to defaults)
- E-04: st 'tell'/'act' + aimAng. S.shells: x,y = launch point, tx,ty = target, t/T = flight progress (if the sim moves x,y along the flight, set shell.moving=true).
- E-05: st 'tell' = kneel; aimAng = lane direction; e.lane = lane length in units (default 8); e.locked=true (or tell01 >= 0.75) once locked; st 'stun' or e.stunT>0 = stunned.
- B-01: enemy boss:true. S.boss.attack 'A'|'B'|'C' + tell01 while telling. A: e.lines = [{ang} or {x1,y1,x2,y2}]. C: e.segs = [{x1,y1,x2,y2}] first bounce segment. S.boss.phase 2 = red-hot look.
- Enemy status: e.burnT>0, e.poisonT>0, e.frozenT>0.
- Round flags: r.pierce, r.rico, r.burn, r.poison, r.freeze, r.bounceWall.
- S.fx {k,x,y,...}: 'arc' {x1,y1,x2,y2}, 'orb' {x,y,r}, 'strike' {x,y,r}, 'heal', 'dodge', 'shield', 'blast' {x,y,r}.
- Supply crate drawn at room centre when S.stageKind==='supply' (or S.supplyPos).
