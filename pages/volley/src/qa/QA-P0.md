# QA-P0: Project Volley P0, visual QA initial pass (2026-11-10)

Inspector: pgs-visual-qa-inspector (independent; not the maker). One time-boxed pass, no PASS gate.
Build checked: src/game.html + parts as of 11:52 (files stable 40 s before the run). Capture script: `src/qa/qa-shots.js` (run `node src/qa/qa-shots.js`). Shots in `src/qa/shots/`, state log in `src/qa/shots/log.json`.

## Questions for the main session to ask (one at a time)
1/3. D1, WebGPU never shows under swiftshader: fix gpu.js first (recommended), accept Canvas 2D for P0, or only add the repaint guard?
2/3. D2 + D3, hero hidden under drones and on the hurt frame: draw the hero on top and blink at half alpha (recommended), or fix the drone spacing in the sim?
3/3. D5, the room floor reads as a lighter panel: use the same sand on both sides (recommended), soften the edge, or keep it?

## Defects (ranked)

### D1 HIGH: WebGPU path is lost at boot and never comes back (shot `21-webgpu.png`)
With `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan`, `navigator.gpu` exists, but by frame 17 `__pv.rendererWhy` = `lost:destroyed` and the renderer is Canvas 2D. Because the reason is `destroyed`, no re-init is tried (render.js line 53), so readback returns "renderer is Canvas 2D" and "WebGPU output: seen" cannot be shown. In the frozen test mode (`?freeze=1`) the playfield stayed **blank white** after the fallback (HUD only). In real-time mode the Canvas 2D fallback paints correctly (checked with an extra probe at 0.3, 1.5 and 4 s).
Likely cause (not verified): gpu.js destroys its own device (release() at gpu.js lines 99-120) during create or resize, and the browser reports that as a 'destroyed' loss.
- **A (recommended)**: B RENDER traces who calls `dev.destroy()` before the first frame and makes the loss handler ignore its own release. Cost: small debug job; unblocks the GPU proof.
- B: Accept Canvas 2D for P0 on swiftshader and verify WebGPU on the real phone only. Cost: none now, but the headless GPU proof stays missing.
- C: Also repaint c2d on the next frame after any switch, even when frozen. Cost: tiny; fixes the blank test frame only.

### D2 MEDIUM: Hero hidden when chaser drones press into it (`04-hero-braced-lock.png`, `04-hero-braced-lockc-hero.png`, `11-e02-aim-line.png`)
E-01s overlap the hero's body. In 04 the hero is a cyan ring squeezed between two drones, and at 344 px you cannot tell where the Operator is.
- **A (recommended)**: Draw the hero after the enemies, with its cyan ring always on top. Cost: a one-line draw-order change.
- B: Have the sim push drones out to hero.r + enemy.r. Cost: sim change, and it shifts the bot balance numbers.
- C: Add a dark outline or halo around the hero only while something overlaps it. Cost: small; adds visual noise.

### D3 MEDIUM: Hero vanishes on the frame it gets hit (`06-hurt-edge-flash.png`, `06-hurt-edge-flashc.png`, `12-enemy-shots.png`)
At the hurt event the invulnerability blink is in its "off" phase, so no hero is drawn, only its shadow. That is the exact moment the player looks for the Operator.
- **A (recommended)**: Blink between 100% and 35% alpha (never 0) and start in the "on" phase. Cost: tiny.
- B: Keep the full blink but always draw the cyan ring. Cost: tiny.
- C: Keep as is. Cost: none; the hero is lost for about 1 in 2 frames during i-frames.

### D4 MEDIUM-LOW: E-02 aim line is thin (`11-e02-aim-line.png`, `11-e02-aim-linec.png`)
The line is a red hairline about 1.5 CSS px wide on sand. It reads at 2x but will be weak outdoors on the 344 px screen. The E-01 (yellow) and E-03 (wedge plus three lines) tells are clear and distinct.
- **A (recommended)**: Grow the width from 1.5 to 3 px with tell01, over a thin dark under-stroke. Cost: small; also tells the player when the shot is due.
- B: Use a fixed 2.5 px line with a dark under-stroke. Cost: tiny.
- C: Keep as is.

### D5 LOW: Room floor reads as a separate lighter panel (every gameplay shot, for example `02-r01-start.png`)
The floor inside the room is pale sand with a grid. Below row 15 the sand is darker and pebbled, with a hard edge between them. The ground does continue (the contract says it should not be a panel), but the tone step makes the room read as a board on sand.
- **A (recommended)**: Use the same sand tone on both sides and mark the room bounds with a faint grid fade or thin edge line. Cost: palette tweak.
- B: Soften the edge with a 1-tile gradient. Cost: small.
- C: Keep it. It does show the room bounds clearly.

### D6 LOW: Red hurt vignette sits on the left and right columns where E-02 often stands (`12-enemy-shots.png`, `12-enemy-shotsc.png`)
For about 0.25 s, magenta shots leaving an edge-standing E-02 sit inside the red edge glow, which lowers their contrast. The shots themselves are bright and clearly visible at 2x.
- **A (recommended)**: Make the vignette thinner (inset about 24 px instead of 40/14) and fade it faster. Cost: CSS only.
- B: Shift the flash to a darker red-brown. Cost: CSS only.
- C: Keep it. EDGE_FLASH can already be switched off in the drawer.

### D7 LOW: Tuning drawer (`17-tuning-drawer.png`, `17b-tuning-drawer-bottom.png`)
The 0.97-alpha background lets drones ghost through behind the labels (for example next to "HERO"). The range inputs are 36 px tall, under the 56 px target (L-TD-4 names buttons, so this is borderline).
- **A (recommended)**: Make the background fully opaque and the slider rows 48-56 px tall. Cost: CSS; the drawer gets longer.
- B: Opaque background only. Cost: CSS only.
- C: Keep it (tester tool only).

### D8 LOW: E-01 tell shows no lunge direction (`03-e01-tell.png`, `03-e01-tellc.png`)
The whole drone turns yellow, which is clear and distinct, but nothing shows which way it will lunge.
- **A (recommended)**: Keep it; the lunge is aimed at the hero, so direction is implied. Cost: none.
- B: Add a short yellow chevron toward aimAng. Cost: small.

## Checked and fine
- HUD: stage label, Lv chip, XP bar, HP text and gear button have good contrast and no clipping at 344, 412 and the 345-px column (wide).
- Overlays cover the HUD: card screen, pause, death and tuning drawer all hide the HUD text (09, 16, 18, 17).
- The card screen shows 2 cards (CARDS_OFFERED=2) with readable names and descriptions.
- Death screen: stats and Restart are readable. The "Damage taken 1600" value comes from my heal cheat, not a bug.
- Door closed (gunmetal with red lights) and door open (dark with green chevrons) are clearly distinct (02c, 02-r01-door-open-c).
- Enemy shots are red-magenta discs drawn at 2x, clearly visible (12c, 15). The E-03 fan wedge is clear (14c).
- Hit flash makes the whole enemy shape white (05c). The lock ring is cyan segmented arcs.
- No joystick graphic or thumb ring during a live mouse-pointer drag below the room. The hero moved (22-mid-drag.png).
- Wide 1104x884: the centred portrait column plus the cover-screen note at top left look correct (19).
- The palette is consistent: sand ground, dark gunmetal machines with red sensors, cyan hero accents, thin dark outlines, hard down-right shadow offset.
- No console errors or page errors in any run.
- The toast stays within 40% width. The "Area clear" toast in 02-r01-door-open was caught mid-fade (pale), which is transient and not a defect.

## What I did NOT check
- Amber lock ring (no clear line): never captured. The seed and positions never produced a blocked lock while braced.
- Real touch events (hasTouch tap and drag): the drag used mouse-pointer events.
- Real WebGPU output on hardware, a stress mode, or performance.
- Ricochet, diagonal or multi-shot visuals after a pick: I picked card 0 (Arc Ricochet) but took no shot of it working.
- Repair pack pickup visuals: none dropped in this run.

## Test cheats used (so numbers in shots are not real)
Hero HP was topped up every frame while hunting states, and set to 1 for the death shot. `?freeze=1` was used for deterministic stepping (the 22-mid-drag shot was real time).

## Lessons to log (main session)
- QA-xxx: Test-hook freeze mode plus a GPU loss can leave a blank playfield. After any renderer switch, repaint the fallback on the next frame (D1).
- QA-xxx: Invulnerability blink must never hide the hero completely on the hit frame (D3).
- QA-xxx: Draw the hero above contact enemies; at 38 px per tile, overlaps hide the hero (D2).

## Self-review
- Went well: writing the capture script against the contract before the build landed, then switching to the live `__pv.view`/`freeze`, gave exact crops.
- Went wrong or slow: my first run hunted tells while braced, but enemies die before they tell. It took two reruns (a strafe phase first, then braced). The card pick also stalled my room walker once.
- Improvements to my role instructions (options):
  1. "Strafe first": hunt telegraphs while moving (no fire), then brace. Expected benefit: saves a rerun.
  2. "Use the test freeze hook": always look for and use a freeze/step hook before capturing. Expected benefit: deterministic shots.
  3. "One live-input shot": always include one real-time pointer-drag shot. Expected benefit: proves the no-overlay control rule.

## Status
- Done: 53 captures taken. I viewed 20 full shots and 10 close-ups (02c hero, 02c E-01, 03c, 04c-hero, 05c, 06c, 11c, 12c, 14c, door-open-c). The rest (per-enemy start crops, R02/R03 door crops, 01-boot, 10-r02-start, 13z) were not viewed. 8 defects (1 high, 3 medium/medium-low, 4 low).
- Next: the main session asks Q1-Q3, then a targeted recheck of D1-D3 only.
- Blockers: none. I did not edit any game files, install anything, use the network, or commit.

QA inspector: initial pass, M-directed (20 states, 10 close-ups viewed)
