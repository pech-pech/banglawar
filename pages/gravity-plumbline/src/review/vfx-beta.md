# VFX + lighting beta (slice S8) - build report
Files: `src/parts/light.js` (PL.Light), `src/parts/vfx.js` (PL.Vfx), `src/test/vfx.test.js` (15 node tests, all pass), `src/test/vfx-demo.html`, `src/test/vfx-shots.js`. Screenshots: `src/review/shots-beta/vfx-<size>-<full|lite|reduced>-<a|b>.png` (475x638, 344x882, 816x568 at deviceScaleFactor 2). No game file edited, nothing installed, nothing spent, nothing committed. All choices "admin default".

## API and call order (skin / ui loop)
```
once            PL.Vfx.init(cssW, cssH, devicePixelRatio, {seed})   // also PL.Vfx.resize(w,h,dpr) on resize
                canvas backing = PL.Vfx.dprFor(devicePixelRatio)     // min(dpr,2) full, min(dpr,1.5) lite/off
per room        PL.Vfx.setRoom(state.room)                           // builds hazard mask, lanterns, spike tips, gate list, exit
optional        PL.Vfx.setBackdrop(farImg, nearImg)  // image = 2 parallax layers (0.05 / 0.18); none = procedural dusk observatory
per frame       PL.Vfx.update(realDtSec, state.events, state, state.g)   // state needs x,y,t,dead,grounded; bad dt is ignored
                const fx = PL.Vfx.cameraFx()   // {shx,shy,tilt,zoom}: apply to ctx before drawing (0 in reduced/off)
                PL.Vfx.drawBack(ctx, cam)      // INSTEAD of the paper fill: backdrop, parallax, aurora, god rays, motes
                ...skin draws walls, crumbles, gates, crushers, spikes, exit, hero (use PL.Vfx.heroDeform())...
                PL.Vfx.drawFront(ctx, cam)     // gate ribbons, spike glints, portal, rim light, lantern + hero light, particles, bloom, vignette+grade
                ...HUD, pad...
                PL.Vfx.drawOverlay(ctx, cam)   // star-iris wipe, above HUD, below DEV badge
transitions     PL.Vfx.wipe('close', () => { swap room; PL.Vfx.setRoom(r); PL.Vfx.wipe('open'); }) ; PL.Vfx.wipeState()
settings        PL.Vfx.setQuality('auto'|'full'|'lite'|'off'), setReduced(bool), setShakeScale(0..1), setHazards(rects), fire(name,{x,y}), stats()
```
cam = the frame draw.js already gets `{scale,cx,cy}` (W,H optional, else init size). hero deform: `ctx.translate(heroScreen+bob); rotate(d.ang); scale(d.sx,d.sy); rotate(-d.ang)`, draw upright; `d.dx,d.dy` (world px) and `d.vanish/alpha` give the win spiral-in; `d.blink` for the blink frame. Load order in inline.py: `... camera light vfx draw ...` (light before vfx). The state.events array is cleared by core every step, so the loop must pass the events collected over all steps of the frame (concatenate) or flips/lands get missed. Crusher slam has no game event: Vfx detects the extreme of the crusher sine itself from `state.t` (same formula as draw.js); the skin may also call `PL.Vfx.fire('slam',{x,y,nx,ny})`.

## What it does (spec items)
1. Backdrop: procedural gradient wall, elliptical dome with 90 stars, brass ring, ribs, six arched windows with sunset valley and mountains, banners, near-layer columns/arcade, two parallax layers; image path supported (baked once to an offscreen at cover size).
2. Aurora: 3 curtain ribbons of 40-60 soft bars each, additive, moving sine fronts, shimmer; god rays: 4 baked wedges swaying +-1.5 deg over 9 s with 24 dust motes drifting toward the new "down" (re-aim 0.4 s); lantern glow pools (<=6, flicker 5 + 7.3 Hz sines + smoothed noise, depth <=12%), gold rim light on wall edges (stands out on the edge facing away from gravity, +30% within 120 px of the hero), hero as a moving gold light + teal tail glow, bloom via 1/4 and 1/8 res buffers (two shrink/grow round trips, no ctx.filter), vignette + dusk grade (one baked overlay).
3. Particles (one typed pool of 160): teal flame trail (90/s full), flip burst + dust toward new down, dive streaks, land puff, crumble shards, slam dust + shake, death shatter, win starburst + celebration swell, portal suction, gate ribbons + chevrons + edge orbs, spike glint sweep (every 3.5 s, 450 ms, per-cluster offset), portal breathing glow + counter-rotating ring ticks, star-iris wipe (fade in lite/off/reduced).
4. Quality ladder: Governor on real frame deltas, down when avg > 20 ms for 2 s, up when < 17.5 ms for 10 s, min 30 s apart (x2 back-off up to 8x if a step-down follows an up-step within 60 s), never while a flip, slam or wipe is running, hitches > 250 ms ignored. Deviation from vfx-lighting.md (15 ms / 11 ms thresholds): rAF delta on a locked 60 Hz phone is 16.7 ms, so a 15 ms threshold would always step down. Caps: particles 160 / 64 / 0 and 24 in reduced-motion. Reduced-motion (also read from prefers-reduced-motion at init): no shake, tilt, zoom, flashes, star wipe, suction, motes, flicker; aurora and shafts frozen; trail short (0.22 s, 20/s).
5. Flash limiter: at most 2 brightness pulses per second (hard cap 3), pulse alpha <= 0.25; celebration is a 0.6 s swell. Hazard rule: spikes, gates and the crusher (its CURRENT box, from state.t; swept box as fallback) +6 px are cut out of rim, particles (hard clip) and of lantern/hero glow and bloom (feathered hole punched in the half/quarter-res buffer). God rays and aurora are drawn in drawBack, i.e. behind the skin's hazards. Extra rects: `setHazards([[x,y,w,h]...])`.
6. Own RNG (`PL.vfxRand`, mulberry32). Never touches game state; never allocates in draw/update after init (typed pool, baked sprites).

## Measured (headless Chromium, software raster, no GPU, NOT phone numbers)
Per-frame cost incl. forced raster flush (getImageData), 475x638 @2x, no throttle: drawBack + drawFront = full 46 ms, lite 38 ms, off 14 ms (the plain backdrop blit alone is about 9-11 ms in software; update() is 0.1 ms). Software compositing of full-screen blends dominates here; on a GPU canvas these are cheap, but that is unmeasured. Probe below: per-frame time of update+draw JS under 4x CPU throttle (`demo.timeOne`). The mean is dominated by a few multi-second stalls where Chrome flushes the software raster queue; median and p95 show the steady command-recording cost.

<!--PROBE-->
(300 frames at 475x638, 120 frames at the other sizes to keep the run under 10 min; 4x CPU throttle; headless software raster, no GPU)

| size | quality | avg ms | median ms | p95 ms | particles |
|---|---|---|---|---|---|
| 475x638 | full | 222.92 | 24.70 | 62.00 | 39 (peak 72) |
| 475x638 | lite | 146.85 | 5.10 | 12.70 | 13 (peak 24) |
| 475x638 | off | 45.91 | 1.00 | 4.70 | 0 (peak 0) |
| 344x882 | full | 192.40 | 23.90 | 50.70 | 51 (peak 70) |
| 344x882 | lite | 141.49 | 4.10 | 8.60 | 12 (peak 24) |
| 344x882 | off | 1.61 | 1.00 | 7.50 | 0 (peak 0) |
| 816x568 | full | 263.59 | 28.00 | 74.80 | 51 (peak 70) |
| 816x568 | lite | 156.69 | 5.10 | 8.30 | 12 (peak 24) |
| 816x568 | off | 0.52 | 0.20 | 1.30 | 0 (peak 0) |
<!--/PROBE-->

## Look-target comparison (honest)
Target `scene-1-dusk.png` is painted art; ours is procedural. Close: dusk palette, violet-teal aurora curtains inside the dome, soft shafts, warm lantern pools, gold rim light, teal flame on the hero, coral hazards, windows with a sunset valley. Gaps: (1) no painted texture, brass machinery, telescopes, constellation banners (needs the real backdrop art via setBackdrop); (2) aurora is a bar curtain, not the flowing sheets with fine texture of the target; (3) the dome ellipse is a geometric approximation and its position is a fixed fraction (`opts.dome`) unless the real image is used; (4) the stone and gold edges in the demo are my stand-in skin, the real look depends on the skin agent; (5) bloom is soft but coarse (1/8 res blur), no real thresholding; (6) hero light can wash a pale star out under heavy bloom near the dome; (7) the 6 px hazard cut-out leaves a visible dark gap in the rim light beside spikes. Not verified: any real phone, a real GPU canvas, 60 fps, OLED look, battery, whether it looks stunning to the daughter.

## Iterations
1. First render: aurora too faint and blue, shafts invisible, rim and bloom neon. Fix: greener/violet bars, stronger shafts, rim alpha down, lantern pools up.
2. Hard rectangular holes in bloom/shafts around the crusher and gate (hard clip). Fix: feathered hole punch in the small buffers, crusher box follows its real position, rim on non-standing edges dimmer, hero light lower.
3. Perf pass: aurora + shafts to one half-res buffer reused by bloom and cached when static (lite/reduced), vignette + grade merged into one overlay, bloom blend lighter. A per-lantern sub-rect blit double-counted overlapping glows (visible squares) and was reverted.

## Not done / for the skin or admin
- Tweak ids (`vfx.quality`, `vfx.bloom`, ...) not wired: only setQuality, setShakeScale, setReduced exist.
- Lantern sway, hero idle blink art, pad-key and pip animations, medal reveal and spike glint on non-crystal skins belong to the skin; Vfx exposes heroDeform and fire().
- Replay-hash on/off test needs core and the skin; Vfx never writes state so it is expected to pass, unverified.
- Hazard-contrast probe (render hazards with VFX full vs off, compare luminance) not written.
- Backdrop memory: far 1.5x baked (about 3 MB at 475x638) plus near, vignette, bloom and soft buffers; about 5 MB, not measured.

## Self-review
Went well: demo + screenshots made the look judgeable early and exposed real defects (box edges, washed hero). Slowed: first probe design ran over the 10 min tool limit under software raster; mean frame time is useless there because of flush stalls; tested 3 blit tricks blindly. Improvements: 1. "Probe median+p95 only": report median and p95, run 150 frames. benefit: runs under 3 min. 2. "Hazard probe": add a luminance-contrast check script to the role. benefit: proves rule 4 instead of asserting. 3. "Skin contract first": get the skin agent's draw call order before building. benefit: no API guesswork.

## Status
Done: modules, tests (15 pass), demo, shots, probe. Next: skin agent wires the call order above and inline.py order `camera light vfx draw`; real backdrop image via setBackdrop. Blockers: none. Feedback for administrator: events array must be accumulated across fixed steps per frame; thresholds deviate from the plan (see item 4).
