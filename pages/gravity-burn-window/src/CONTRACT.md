# Burn Window build contract (2026-11-18). Read ONLY this file + the file named in your brief.
Game: one-thumb orbital courier. Hold anywhere = burn prograde; release = coast. Real inverse-square pull, fuel tight, dock at the gate under 90 px/s. Plain shapes first, then polished look.

## Files (pages/gravity-burn-window/)
- src/sim.js (DONE, UMD BW.sim): constants C, newState, step(st,sector,{burn,throttle}), predict(st,sector,{seconds,includeDark}), checksum, inputFromEvents, schedToEvents, runSchedule, energy, bodyX/bodyY(b,t), mulberry32, hashSeed. READ ITS CODE for signatures; do not edit it.
- src/gen.js (DONE, BW.gen): generateSector(runSeed,index) -> sector {index,type,bodies[],gate{x,y},start{x,y,vx,vy},fuel0,par{fuel,sched},dockFuels[]}; searchBest. ~1 s per sector in node; slower on phone. Throws on failure (game catches and retries with generateSector(runSeed+1000*k, index)).
- src/render.js (BW.render): `draw(ctx, V, G)`; pure drawing, no input, no state changes.
- src/game.js: loop, input, state machine, DOM HUD/buttons, Copy report, localStorage.
- src/audio.js (BW.audio): free WebAudio synth.
- src/index.src.html: shell with <!--SRC--> marker; build.py inlines sim,gen,audio,render,game in that order into ../index.html (single file).
- tests/*.js: node tests.

## World and view
World 340x486 px (sim units). View V = {w,h (CSS px of canvas), dpr, scale, ox, oy}; world->screen: sx=ox+x*scale, sy=oy+y*scale. Layout: top HUD strip 56 px (DOM buttons), playfield = world*scale, centred horizontally, top at y=56; scale = min(w/340, (h-56-96)/486) clamped 0.8..1.5; rest zone below (faint pad at thumb rest). Check 475x638 (scale 1.0) and 344x882 (scale 1.012).
All touch targets >= 56 CSS px. Buttons: Retry (HUD strip left, 72x56), Warp x1/x3 toggle, Mute, Copy report (top-right, 96x56).

## G (snapshot passed to render.draw)
G = { sector, st (sim state), t (st.n*C.DT), pred (predict result: dots every 6th point fading; tick at pred.closest), ghostLine (array of {x,y} dashed or null), ghost (replay craft state or null), phase ('intro'|'run'|'docked'|'failed'|'end'), warp (1|3), throttle (0.25..1), fuelMax, parFuel, msg (string|null), reduced (bool), sectorIndex, sectorCount }.
render.draw draws: background, bodies (dark ones as faint ring only), gate ring, craft triangle along heading (st.hx,st.hy), flame when st.active, predicted dots, fuel bar (par marker), sector label, speed readout, phase overlay text.

## Input
Pointer events on the whole page (not on buttons): any active pointer = burn. Vertical drag from press point: throttle = clamp(1 - max(0,|dy|-12)/120, 0.25, 1). Quick tap still burns >= 80 ms (sim handles via tickLeft). Burn events logged as [step, burn(0|1), throttle%]. Fixed timestep accumulator 1/120, max 8 steps/frame, warp x3 = 3x steps, warp auto-off within 45 px of any visible body. Hidden tab / blur: release input, drop accumulator.

## Rules (admin default where spec silent)
- 8 sectors per run, seed from ?seed=N (default: date number = daily seed). Sector fuel = min(75, 45 + 0.4*leftover). Retry restarts the sector at once. Intro overlay "tap to launch" only on a new sector.
- Dock: inside gate r22, speed < 90. Fail: crash, lost (>120 px outside), stranded (fuel 0 and 25 s coast predict ends crashed/lost), clock > 90 s.
- Medals PROPOSED (M decides): efficiency = sum(par)/sum(fuel used on docked attempts). Bronze = finish 8, Silver >= 0.55, Gold >= 0.75.
- Ghost: best-fuel docking attempt per (seed, sector) kept in localStorage as events; replay drawn as translucent craft.
- Ghost line: after a burn ends, dashed path of where the craft would have gone without that burn (predict from burn-start state, 3 s).
- Result/end screens ignore taps for 1.0 s and need a press that began after they appeared; >=56 px Next button.
- Reduced motion: no shake, no flame flicker, no particles. localStorage always in try/catch.
- Copy report JSON: {game,version,seed,renderer:'Canvas2D',device:{w,h,dpr,ua,reducedMotion},fps:{avg,p95ms,gaps50},determinism:{ok,checksum} (scripted schedule run twice at boot),attempts:[{sector,attempt,result,fuelUsed,par,steps,checksum,burns}],inputLog:[{sector,attempt,events}],ticks:{physicsSteps,elapsedMs},energyDrift,settings}.
- Test hooks: window.__bw = {state, sector, phase, report(), setSeed(n), launch()} (live getters).

## Audio (BW.audio)
init() on first pointerdown (capture) AND keydown; suspend on hidden tab; hum(speed 0..160); burn(on,throttle) whoosh; dock(), crash(), tick(); mute(bool); voice cap 12; own mulberry32 stream; peak < 0.9. Free synth; mark "not heard by ear".

## Look
Plain shapes first (dark bg, filled circles, white triangle, thin gate ring, dotted path, orange fuel bar). Polish: chart-table style, thin orbit rings, brass #c9a24a + teal #3fb8a8 on #0a1214, soft engine glow, seeded starfield.
