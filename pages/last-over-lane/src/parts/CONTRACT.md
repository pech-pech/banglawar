# Last Over Lane v2 build contract (integrator: build thread main session)

Spec: M's 5 picks (see /mnt/project-files/games-design/last-over-lane-ui/2026-11-10/: SUGGESTIONS.md, R1-R5, mockups/mock-B.html + mock-B.png = target look, mockups/QA-first-pass.md). Rules core = `// CORE-START..CORE-END` in ../game.html (LOL object: SECTORS, SCALE, RUNS, DELIVERIES, FIELDS, MATCH, windows(intent,perfectMs,assist), fieldFor(m,i), resolve, step).
Device: Galaxy Fold folded, portrait, design size 384x880 CSS px, ratio kept. Touch targets >= 56 px. Plain JS, no libraries, no network. Canvas 2D only (a WebGPU painter comes later, so draw from G state only, no hidden state you can't rebuild from G + now).

## Files
Shell `../game.html` (integrator) concatenates `parts/ui.js`, `parts/field.js`, `parts/pad.js` into one inline <script> AFTER core and BEFORE the shell code. Each part is an IIFE that does `window.LOLParts = window.LOLParts || {}; LOLParts.<name> = {...}`. A part may inject its own CSS with one <style> element (prefix every selector with its region id). No globals except LOLParts.

## DOM (created by shell, inside #stage, flex column, stage = 384x880 scaled)
- `#hud` (56 px, top strip, never overlapped)  -> ui
- `#view` (flex:1) containing `<canvas id="cv">` -> field ; tell plate + field chip + banner are drawn by field on the canvas
- `#res` (64 px: result line + early/late scale) -> ui
- `#intent` (84 px, 4 buttons) -> ui
- `#pad` (40% of stage height) containing `<canvas id="pc">` -> pad
- overlays `#ovStart`, `#ovEnd` (absolute, cover stage) -> ui
Canvases: shell sets canvas.width/height = css size * dpr (dpr = min(3, devicePixelRatio)) and ctx.setTransform(dpr,...) before calling draw; parts draw in CSS px using canvas.clientWidth/clientHeight.

## Shared state G (read-only for parts, shell owns it)
```
G.LOL, G.now (frame time ms, performance.now base), G.reduced (prefers-reduced-motion)
G.m        match: {balls[], i, runs, wkts, done, won, log[]} (log entries: {ball, delivery, intent, sector, grade, runs, out, why, offMs, kind})
G.field    current field object {name, guard:{leg?,straight?,off?,loft?}} (shell switches it on the over-break frame; HUD, field, pad all read this)
G.intent   'block'|'rotate'|'drive'|'slog'; G.perfectMs (60|40); G.assist (bool)
G.cur      live ball or null: {d (delivery key), tRun, tRel, tArr, locked (now > tArr-300),
            tap: {sector, t} | null, done, res (after settle: {grade, runs, out, why, kind, offMs}),
            tSettle, stopUntil (hit-stop end), rejectAt (time of last rejected intent tap)}
            res.kind: 'hit' | 'caught' | 'bowled' | 'leave' | 'miss'
G.banner   {text, until} | null   (over break "New field: Leg trap", 1500 ms hold)
G.path(p, W, H) -> [x,y] ball centre at progress p (0 release .. 1 arrival, may exceed 1), shell-defined.
G.geom(W,H) -> {topY, batY, cx, laneTopW, laneBotW, spots:{leg:[x,y], straight:[..], off:[..], loft:[..]}}  fielder spots on the field canvas. Loft spot is on the RIGHT (same side as in the fan pad).
G.stats    {p50, p95, max (frame gaps ms), tapMean, tapSd, n, corr}  for the corner readout.
```
Arrival truth: the ball CENTRE is on the bat line at exactly tArr. Ticks sit at the path positions for tArr-450, -300, -150 ms (p = 1 - k/(tArr-tRel)) and light when G.now passes them.

## Part APIs
- `LOLParts.field = { draw(ctx, G) }` lane, gully walls, bowler (run-up), batter (right-hander, stands on leg side of stumps), stumps (tilt when kind=='bowled'), 3 px bat line #1a1400 78 px wide at batY, lane ticks, fixed ball r=5 red #d9342b with 2 px #1a1400 outline + shadow directly under, frozen until stopUntil, then flight per grade (perfect 520 ms to boundary + gold burst 160 ms; good 640 ms 80% distance; edge 420 ms short and 35 deg off line; caught: ball flies to that sector's spot 480 ms, fielder scales 1->1.5 with red ring, dashed line; miss/leave: runs through), fielders as figures (red, diamond badge) with chip "✕ LEG" / open sectors as dashed ring + chip "✓ OFF" near spot, tell plate top-left beside bowler (from tRun to tRel+200, text from DELIVERIES[d].tell), field-name chip top-right, banner centred (G.banner), small corner readout bottom-left 11-12 px dim: "Canvas 2D · frame p50 x p95 y max z · taps -38±54 (n)". Reduced motion: no burst/scale pulse, instant moves.
- `LOLParts.pad = { draw(ctx, G), hit(x, y, W, H) -> sector|null }` fan seen from the batter: origin below the pad bottom centre; Leg left wedge, Straight middle, Off right, Loft = outer arc band across the top. Every region >= 56 px in both directions at 384 px wide. Guarded: red hatched fill + red border + fielder figure inside + chip "✕ FIELDER"; open: dark green fill + green border + dashed ring + chip "✓ OPEN"; shape differs, not only colour. Label 20-22 px. Loft fielder drawn on the RIGHT part of the arc. Pressed flash: gold outline 160 ms when G.cur.tap.sector === region and G.now - G.cur.tap.t < 160. hit(): by angle/radius; points outside the fan clamp to the nearest region (never null inside the canvas).
- `LOLParts.ui = { init(G, h), update(G), result(G), start(G), end(G, s) }`
  h (handlers from shell): {setIntent(i), play(), toggleWindow(), toggleAssist(), copyLog()}
  init builds #hud, #res, #intent, #ovStart, #ovEnd contents + CSS. update(G) each frame (cheap: only touch DOM on change): HUD score "6 / 20", "Need 14 off 8", wicket pips (3), ball pips (12), "Help +20" chip when assist; intent buttons: name 18 px, "±51 ms" (Math.round(LOL.windows(i,G.perfectMs,G.assist).perfect)), "Perfect 4" (LOL.RUNS.perfect[i]); chosen = gold; locked => strip dims to 45% + padlock on chosen; G.cur.rejectAt within 120 ms => 3 px shake.
  result(G): called once per settle: one line "Good · 2 runs · 38 early" (grade colour; OUT line "OUT · Caught at Leg · 38 early" red on #000c plate), ms once; scale 320x12: centre = perfect, zones from the chosen intent's windows (perfect/good/edge) mapped over ±200 ms, dot for THIS tap only (no trail), labels EARLY / LATE 12 px.
  start(G): one Play button in thumb reach, rules line (Edge into a fielder is caught; Good Drive or Slog into a fielder is caught; Edge into Loft always caught; Perfect beats a fielder, max 2 on the ground; field changes before balls 5 and 9; swing balls miss the stumps), "Perfect window 60 ms" toggle, "Timing help: +20 ms perfect" toggle, line "Learning your timing from your taps".
  end(G, s): title Won/Lost, 12-box ball strip (grade colours, OUT red, blank unbowled), three big numbers 28 px (Avg "47 early", Spread "±49", In window "75%"), advice line ("You tap early. Aim 40 ms later." if |mean|>25), buttons Play again + Copy tap log.
Tokens: --bg #0d1410 --pad #18261d --ink #eef3e8 --dim #c2cfc3 --acc #ffd23f --good #7be37b --bad #ff6b5b --edge #ffb347; text sizes 12/14/16/18/22/28; radii 8/12/16; min text 12 px. No navigator.vibrate.
