# Last Over Lane v3 WebGPU painter contract (integrator: build thread main session)

M's pick (2026-11-10 04:50): "Start the WebGPU build". The rules stay byte-identical (CORE block untouched), the 2D look stays the fallback,
and an on-screen renderer label shows which renderer is live. Device: Galaxy Fold folded, portrait, 384x880 design, ratio kept.
Read CONTRACT.md first (shared state G, geometry). Plain JS, no libraries, no network, WGSL inline as template strings.

## Layering (decided)
`#view` holds two canvases: `<canvas id="gv">` (WebGPU, underneath) and `<canvas id="cv">` (2D, on top, transparent where it has nothing to draw).
- WebGPU (`gv`) draws: the BACKDROP (grass, mowing stripes, gully walls, lane, popping crease), lighting/look, the BALL GLOW + TRAIL, and PARTICLE BURSTS.
- 2D (`cv`) keeps everything that carries timing or text: bat line, lane ticks, the ball core (r=5 red, outline, shadow), bowler, batter, stumps, fielders, chips, tell plate, banner.
  When `G.gpuOn === true` the 2D field skips only its backdrop block. So timing truth never depends on the GPU.
- If WebGPU is missing, fails, `?gpu=0`, or the device is lost: `G.gpuOn = false`, `gv` is hidden, the 2D backdrop returns at once (exactly v2.1's look).
- Same rAF frame: the shell calls `LOLParts.gpu.draw(G)` first, then the 2D field, then the pad.

## Files and APIs
`parts/gpu.js` (agent: gpu-core) registers `LOLParts.gpu`:
```
init(canvas, G) -> Promise<boolean>   // adapter+device+context, pipelines; never throws; false = stay on Canvas 2D
resize(pxW, pxH, dpr)                 // shell calls after fit(); canvas.width/height already set by shell = css*dpr
draw(G)                               // encode + submit one frame; no-op unless ready; must not throw
get name()  -> 'WebGPU' | 'Canvas 2D' // LIVE getter (lesson L-TD-2); flips to 'Canvas 2D' on device loss
get ready() -> boolean
onLost(fn)                            // shell callback: fn(reason) after device loss -> shell sets G.gpuOn=false
readback() -> Promise<{w,h,nonBg,samples}>  // lesson L-TD-1: render one frame into an offscreen texture with COPY_SRC, copy to a
                                      // MAP_READ buffer, count pixels that differ from the clear colour; samples = 5 RGBA at fixed points
layers: []                            // extra layers pushed by gpufx.js (see below), drawn in order AFTER the backdrop in the same pass
```
`parts/gpufx.js` (agent: gpu-fx) pushes ONE layer object onto `LOLParts.gpu.layers` at load time (gpu.js loads first):
```
{ name:'fx', setup(ctx) -> Promise|void, encode(pass, ctx, G) }
ctx = { dev, fmt, W, H (CSS px of #view), dpr, time (G.now) }; each layer owns its own buffers/bind groups/pipelines.
```
gpu.js calls every layer's setup(ctx) once after its own pipelines are built (await it; a layer whose setup throws is dropped, not fatal),
updates ctx.W/H/dpr/time before each frame, and calls encode(pass, ctx, G) inside its single render pass. readback() must render the
layers too.
Both draw into the same render pass (one pass per frame, `loadOp:'clear'`, clear colour = #1e3a24). Canvas `alphaMode:'opaque'`.
Use additive blending for glow/sparks (`src: one, dst: one`, shader outputs premultiplied) and normal over for dust.

## Geometry (CSS px of #view, same function as 2D; NEVER move anything, the 2D layer sits on top)
`G.geom(W,H)` -> topY = 0.2H, batY = 0.86H, cx = W/2, laneTopW = 0.16W, laneBotW = 0.5W.
- Grass base #1e3a24, 5 horizontal mowing bands of H/4.9, odd bands +2.5% white.
- Gully walls: x in [0, 0.05W] and [0.95W, W], from y = topY-10 to H, base #3a3a3a.
- Lane: trapezoid, top edge y=topY width laneTopW, bottom edge y=H width laneBotW, centred on cx, base #c9b48a.
- Popping crease: white 55% line, 2 px, from cx-70 to cx+70 at y = batY+36.
- Ball centre: `G.path(p, W, H)` with p = (G.now - cur.tRel) / (cur.tArr - cur.tRel), valid when cur && cur.tRel!=null && G.now>=cur.tRel.
  Ball flies from p=0 to p=1 (arrival on the bat line), may run on to p~1.3 on a miss/leave. Evaluate the path on the CPU per frame
  and upload positions (it is shell JS, not shader math).
Everything must stay recognisably the SAME layout and colours as v2.1 (M approved it); the GPU adds depth, not a new design.

## Look goals (gpu-core: backdrop, one fullscreen-triangle fragment shader is fine)
1. Grass: base colour + mowing bands kept, plus a fine procedural blade/noise texture (value noise, 2 octaves, very low contrast <= 6%),
   a soft floodlight pool centred on the crease (cx, batY) and a vignette at the top corners (<= 18% darker). Bands must still read.
2. Lane: base colour kept, subtle grain noise, darker scuffed wear patches at the bowler's end (topY..topY+40) and around the crease, soft
   2-3 px darker edges so the lane sits IN the grass, a faint centre strip a little lighter.
3. Walls: bevel shading (lighter inner edge 2 px, darker outer), slight vertical gradient, tiny AO shadow cast on the grass/lane next to them.
4. Crease: crisp line at the exact spot (anti-aliased in the shader).
Contrast: the 2D bat line (#1a1400 3 px), ticks (#eef3e8) and red ball must stay as readable as on v2.1. Static backdrop (a <= 2% slow
light shimmer allowed; none when G.reduced). Work in CSS px via uniforms (W, H, dpr); fragment coords / dpr = CSS px.

## Look goals (gpu-fx: ball + bursts)
1. Ball glow: additive warm halo (radius 16 px, peak alpha 0.35) centred on the ball centre while 0 <= p <= 1.3. Nothing before tRel.
2. Trail: 10 soft quads at p - k*0.018 (k=1..10), fading alpha 0.25 -> 0, radius 5 -> 2. Same path function, so swing balls curve.
   Freeze both while G.now < cur.stopUntil (hit-stop). Stop glow+trail once cur.res is set (the 2D layer animates the hit flight).
3. Bursts at path(1) from cur.tSettle: Perfect (res.grade 'perfect', not out) 160 gold sparks 600 ms; Good 40 white sparks 400 ms;
   Edge 12 sparks 300 ms; OUT (res.out) red-brown dust puff, 24 soft quads, 500 ms. Stateless: hash(instance index) -> angle/speed/size,
   gravity-free with drag, fade by life, size 2-3 px. One instanced draw per active effect. Uniform buffer holds W, H, dpr, now, t0,
   origin, kind. No per-frame allocations (reuse typed arrays + writeBuffer).
4. G.reduced: no trail, no bursts (glow only).

## Shell (integrator, already decided)
- Adds `gv`, sizes it like `cv`, calls `gpu.init` after boot (non-blocking; 2D runs until ready), sets `G.gpuOn`.
- Readout label: "WebGPU · frame p50 .. p95 .. max .. · taps .." or "Canvas 2D · ..." from the live getter.
- Copy tap log adds `renderer`. `?gpu=0` forces Canvas 2D for an A/B comparison.
- `window.__lol.renderer` live getter, `window.__lol.gpuReadback()`.

## Done means
- In Playwright Chromium (pre-installed; `require('playwright')`), with WebGPU flags that work headless (test agent finds them),
  readback.nonBg > 0 ("WebGPU output: seen"), else report "NOT seen" honestly.
- 0 console errors in both renderers; `?gpu=0` looks exactly like v2.1.
- No change inside CORE-START..CORE-END.
