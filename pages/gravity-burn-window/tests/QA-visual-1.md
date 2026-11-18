# QA visual 1: Burn Window (initial pass, seed=1)

Captures: `/home/user/banglawar/pages/gravity-burn-window/tests/qa-visual-1/` (a- = 475x638, b- = 344x882, both DPR 2; r2a-/r2b- = re-run on the rebuilt index.html).
Note: the maker rebuilt index.html at 20:45 during my run. The a-/b- files are a mix of the old build (fuel 45) and the new build (fuel 18.1). Judge by r2a-/r2b-, the current build.

## Viewed vs not viewed
Viewed (full 2x screenshot, read at 2x): intro, running, mid-burn (1 s hold, throttle bar visible), after-release dashed ghost line, failed ("Lost in space"), docked, with the Next button, at both viewports. I did not make separate pixel crops. The 2x screenshots were read directly.
Not viewed: end screen ("RUN COMPLETE"). It is unreachable from the __bw hooks, because finishRun is private and my scripted bot lost sector 6. Result-screen buttons other than Next, a crash (as opposed to lost) overlay, and a Copy report round-trip were also not viewed.
Console errors: none on either viewport.
Measured touch targets: Retry 72x56, Warp 76x56, Sound 68x56, Copy report 96x56, Next 160x56. All are >= 56. Gaps between the HUD buttons are 4 px. No clipping at the edges.
Text sizes: 12 px minimum (FUEL/PAR and "dock < 90"), 13 px sector label, 14 px buttons. All are >= 12.

## Defects (ranked)

### 1. HIGH: Par marker on the fuel bar points at the wrong place
Where: `r2a-3-midburn.png`, `r2a-1-intro.png`. render.js:186-190.
The bar shows fuel remaining, draining from the right. The teal tick is drawn at par/fuelMax from the left (8.2/18.1 = 45%). That is "remaining = par", not "par burned". Par is fuel to USE. Ending with 9.9 left (par exactly) would sit to the right of the tick, and 7.9 left lands under it even though that run used more than par. The marker reads inverted, and the tick has no legend. Only "PAR 8.2" in the caption explains it.
Options:
- A (recommended): Move the tick to (fuelMax - par)/fuelMax, so staying right of the tick means "at or under par", and label it "PAR" with a tiny tick caption. Cost: a one-line change.
- B: Switch the bar to "fuel used", filling left to right, with the tick at par. It reads as an effort budget, but flips the metaphor from a fuel tank. Cost: moderate.
- C: Drop the tick and keep only the "PAR 8.2" text. Cheapest, but loses the glanceable cue.

### 2. HIGH: Next button covers the HUD and the thumb rest zone (475x638)
Where: `a-6b-docked.png` (old build, the bar was covered); `r2a-6b-docked.png` (the bar is hidden on the docked screen).
Next is fixed at bottom:20, which is y 562-618 at 638 high. The playfield ends at 542, so the 96 px rest zone is where Next sits. In the old build it covered the fuel bar and the "FUEL | PAR" text. In the current build the bar, FUEL text and speed are not drawn on the docked screen, so the effect is hidden. The faint rest-zone ring (ring at about y 560-620) is also under the button. On 344x882 there is space, and Next sits clear of the HUD at the bottom (`r2b-6b-docked.png`).
Options:
- A (recommended): Keep Next in the rest zone, since it is the thumb target, but move the fuel/speed HUD into the top of the playfield, or fade it on result screens. Cost: small layout change.
- B: Anchor Next above the rest zone (about y 500-556 at 475x638) inside the playfield. Cost: it overlaps the playfield bottom and could cover the gate.
- C: Leave as is, with the HUD hidden on result screens. Cost: no final fuel readout, and the user loses the par comparison (the DOCKED panel text still shows it).

### 3. MEDIUM: Phase overlay panel hides the action
Where: `r2a-5-failed.png`, `r2a-6b-docked.png`, `a-7-end.png`.
The panel is fixed at 42% of the playfield height, so it sits right over the craft, gate and planet area. On "failed", the dashed ghost line and the crash point are covered. The player cannot see why the run failed. On 344x882 the panel is 604x180 at 2x (about 302 CSS px), covering the middle of the field. The panel does not overlap the HUD text or the buttons. The body text is >= 13 px.
Options:
- A (recommended): On failed/docked, shrink the panel to a slim banner at the top of the playfield (under the sector label). Cost: small.
- B: Keep the panel, but dim it to about 60% opacity and move it down to the empty lower half. Cost: still covers some scenery.
- C: Keep it, and draw the craft/ghost line over the panel. Cost: visual clutter.

### 4. MEDIUM: Dotted preview is faint at its tail and tiny on small screens
Where: `r2a-3-midburn.png`, `r2b-3-midburn.png`.
The dots are radius 2 CSS px, teal at alpha 0.25 on the dark teal background. The last dots near the planet are hard to see. The closest-approach tick (brass, 7 px) is small and almost invisible next to the planet glow. The dotted path does read as a path to the first third.
Options:
- A (recommended): Raise the fade floor from 0.25 to 0.45, and make the closest-approach tick 10 px with 3 px stroke. Cost: tiny.
- B: Make the dots radius 2.5, and add a halo to the dots near the closest approach. Cost: small, more busy.
- C: Leave it, since it reads at 2x.

### 5. MEDIUM: Craft is small (16 px long, 8 px half width at scale 1)
Where: all running shots.
The craft is `size = max(7, 8*sc)`, so about 14-16 CSS px in length. Next to the gate (44 px across) and bodies (31-41 px across) it is the smallest object, and the flame/glow competes with it. It is under the 20 px-ish minimum that I would want for a thumb-covered screen, since the thumb is at the bottom but the eyes track a tiny arrow. Bodies and the gate are fine (>= 31 px).
Options:
- A (recommended): Raise craft size to 11 (about 22 px long). Cost: the hitbox is unchanged, so it looks bigger than the sim hitbox, which is a fairness note.
- B: Add a faint 12 px halo ring around the craft only. Cost: tiny.
- C: Leave, since heading is readable at 2x.

### 6. LOW: Speed readout colour meaning is unlabeled
Where: `r2a-3-midburn.png`. Speed turns brass at >= 90 (not dockable), teal below. The caption "dock < 90" helps but is dim grey (#7d8a86 on #0a1214, about 5.2:1, passes AA, but small at 12 px). Fine to keep.
Options:
- A (recommended): Make "dock < 90" the same colour as the speed number, so colour = status. Cost: tiny.
- B: Leave.

### 7. LOW: Fuel start changed between builds, bar full at launch hides slack
Where: intro, `r2a-1-intro.png` shows FUEL 18.1 and PAR 8.2. The bar is full and the marker is at 45%. This is a design observation, not a bug. With the tight budget, a mid-burn of 1 s costs about 10 units (45% of the bar) and the player fails at the first sector tap (my 1 s hold-to-test used 10.2 of 18.1). Check the intro hint text: "hold = burn, release = coast" says nothing about fuel being tight or that tapping is cheaper.
Options:
- A (recommended): Add a third intro line: "short taps save fuel". Cost: tiny.
- B: Leave.

### 8. LOW: "Lost in space" panel repeats "tap to retry"
Fixed in the current build (r2a-5-failed.png shows it once). In the old build a-5-failed.png showed it twice. Log as a resolved lesson.

## Other checks (OK)
- Overlay vs HUD text: panel does not overlap the HUD buttons or the sector label.
- Thumb rest zone: free of controls while running (only the faint ring). It is occupied by Next on result screens (see defect 2).
- Contrast: brass on dark and cream text are good. The dim grey is the lowest, at about 5:1 (OK).
- Aspect/clipping: layout holds at 475x638 (scale 1.0) and 344x882. At 344 the playfield fills the width with no side margin, and the border and "SECTOR 1/8" sit about 16 px from the edge. Nothing is cropped. At 344 there is a large empty gap below the HUD (y about 600-880), which is fine for the thumb zone.
- Reads right: burn shows a flame and glow, the ghost line shows after release, and the docked craft sits inside the gate at 33 px/s.

## Lessons for the lessons file (for the main session to log)
- QA-xxx: A bar that shows "remaining" must put its par marker at remaining-at-par, not at par.
- QA-xxx: Result-screen buttons must not cover HUD text. Check Next against the fuel/speed HUD at the smallest viewport.
- QA-xxx: Overlay panels must not cover the craft or the crash point.

## Self-review
Went well: both viewports and every reachable phase viewed at 2x. Slowed me: the build changed under my run, so a few captures are from the old build. A fixed 8-sector bot run was too slow (about 6 min), and the end screen stayed unreachable. Improvements: (1) "Freeze check": ask the maker to stop editing during a QA pass, expected benefit: consistent captures. (2) "End-screen hook": ask for a `__bw.finish()` test hook, benefit: the end screen can be checked. (3) "Fast-forward hook": a `__bw.skipTo(n)` hook, benefit: the pass is quicker.

## Status
Done. Next: main session asks the user about defects 1-3 as choice cards (recommended options are marked A). Blockers: end screen not viewed. Feedback: the game files were edited mid-run (index.html 20:45, game.js and render.js 20:43).

QA inspector: initial pass, user-directed (7 states, 9 close-ups viewed)
