# Slice A: Starfall skin (play-field renderer) - change note
Files: `src/parts/draw.js` (rewritten world renderer), `src/test/skin-harness.html` + `src/test/skin-shots.js` (new), shots `src/review/shots-beta/skin-*.png`. No commit. Choices labelled admin default.

## What PL.draw does now (world only; no HUD, no pad)
Order: PL.Vfx.drawBack (art backdrop top-anchored so the dome shows; procedural aurora bars follow the art's dome) -> moonstone platforms (PL.Assets.drawPlatform, multiply-toned lavender) -> lanterns (code, picked clear of start/exit/hazards) -> crumble ledges (art + 3 crack stages from state.crumbleS timer, shake, fade) -> exit portal art (glow left to Vfx) -> gates (code: teal-white ribbon, waves, chevrons flowing along the pass dir, end orbs) -> spikes (art rotated to their wall, coral halo) -> crushers (PL.crusherRect, art head, coral lane that heats toward the stroke end) -> hero -> PL.Vfx.drawFront.
Hero: body by pose (idle, land, hurt, win; fall/dive = idle stretched by Vfx.heroDeform, dive extra), box-sized (2*HALF*1.18), feet eased to gravity, shadow, blink lids, idle bob, win vanish.
Hit-rect overlay: Tweak `SKIN_DEBUG`=1, `PL.Skin.setDebug(true)` or `hud.debug`. Shot: skin-*-debug.png (drawn art sits inside the rects).
Quality: Tweak `FX_QUALITY` (0 auto,1 full,2 lite,3 off) or `hud.quality`; reduced motion: `hud.reduced`. Missing art => Starfall code shapes (coral #ff7a6b from PL.UI.C when present). Whole frame is try/catch wrapped.
Removed: paper/grid, swipe strip tint, swipe hint, plumbline, old dust.

## Changes other parts must know
- `PL.draw(ctx, view, frame, state, hud)` signature unchanged, but it no longer draws the HUD, toast, tuning panel, teach banner or complete screen. Old code kept as `PL.drawHudLegacy` (runs only if `hud.legacyHud` is true). `PL.BTN`, `PL.menuLayout`, `PL.drawMenu`, `PL.tuningLayout`, `PL.predictPath` kept as they were.
- draw.js owns the Vfx/Light lifecycle: lazy `PL.Vfx.init/resize`, `setRoom` on room change, `setBackdrop`, `update(dt, events, state, g)` each draw. Call `PL.Vfx.drawOverlay` (star wipe) yourself above the HUD.
- Events: sim runs up to 5 steps/frame and clears `state.events` each step, so draw.js wraps `PL.step` (only for the live state) to collect them. If ui.js passes `hud.events` (array of strings) that wins.
- draw.js calls `PL.Assets.load()` if nobody has (same-folder files). inline.py part order must include assets, light, vfx (and uikit before draw for tokens, optional) before draw.js.
- Hacks: sets `PL.Vfx._V.room` to a gates-less clone (skin draws gates; Vfx's gate chevrons ran along the long axis, not the pass dir), `PL.Light._S.dome` and `_S.bloomAmt=0.55`.

## Verified
`NODE_PATH=/opt/node22/lib/node_modules node src/test/skin-shots.js [475|344|816]` -> all passed: art loaded, 0 draw errors, console clean, 3 views x (4 scenes + debug + 3 hero crops). Node fake-ctx run of draw.js without Vfx/Assets: no throw. Mean draw (headless SOFTWARE canvas, dpr 2): full 49-64 ms, lite ~44, off ~9 ms at 475; NOT a device number, 60 fps on Fold not proven.
## Not verified / gaps vs look target
- Real index.html build and e2e (ui.js is being rewritten; inline.py part list excludes assets/light/vfx today). Reduced-motion and lite/off only checked at 475 off/lite once. No device or colour-blind check.
- Spikes are thin (rect 16 px tall) so the coral reads smaller than in the target; halo helps. Platforms are plain brick, no brass brackets or carved corners as in the target. Lanterns are small code boxes, not the brass lantern art. Backdrop interior is hazier/greyer than the target (Light's shaft sprite is grey-white, not teal/violet; light.js is another agent's file). Flame trail is round beads, not a flame.
