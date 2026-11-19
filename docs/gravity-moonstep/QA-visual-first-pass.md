# Moonstep visual QA, first pass (initial pass, user-directed)

Viewed (2x): play-475x638, play-344x882, gameover-475x638, pause-475x638 (supplied), plus my own captures at 475x638 dpr2 seed QA1: qa-charge-arc, qa-spin, qa-crumble, qa-repel, qa-tide (all in tests/shots/).
Method note: spin/crumble/repel do not occur before 400-800 m, so in qa-spin/crumble/repel I set `kind` (and spin/rem) on bodies 1-2 of seed QA1 via window.__moon. This checks rendering only, not generator ramps. Not viewed: 344x882 overlays, tide at higher heights, medal/new-best text on game over, Copy-report textarea fallback, OFF state of toggles, reverse/cancel gestures, reduced motion. Console: 0 errors. Button sizes measured: Pause, Copy 56x56; overlay buttons 302x56 (>=56 OK). No Pause/Copy in the thumb zone.

## Questions for the main session (ask one at a time)
Per defect below, options are listed recommended first.

## Defects (ranked)

1. HIGH - Influence rings clutter play (play-475x638.png, play-344x882.png). Every body has a full-size ring (R=3.2r); with 6+ bodies on screen, 10+ thin arcs cross each other and bodies with no way to tell which ring belongs to which body, and which one is the current owner. In qa-charge-arc (only 3 bodies) it reads fine.
   - A (recommended) Draw only the rings of the owner and the aimed/landing body, brighter; others hidden or at ~30% alpha. Low cost, keeps the "plain shapes" look.
   - B Draw every ring as a short fade-out arc only on the side facing the runner. Medium cost.
   - C Keep as is, lower all ring alpha. Cheapest, clutter stays but quieter.

2. HIGH - HUD collides with bodies (play-475, play-344, qa-*). The centre HUD (height, "next Bronze 150 m | best 0", chain bar, seed) is drawn straight over the top body; "best 0" and "seed ..." are light grey text on grey body (#808797), contrast roughly 1.5-2:1, and the body's outline cuts through the text ("150 m" and "best" split in play-344). The next target is often exactly the body hidden under the HUD.
   - A (recommended) Give the HUD a dark translucent backing plate (or text shadow/outline) and keep the secondary line brighter.
   - B Reduce HUD to 2 lines (height + medal band), move seed to Pause menu. Less cover, loses at-a-glance seed.
   - C Move runner to ~50% so bodies sit lower than the HUD. Conflicts with the 45%/38% spec.

3. MED - Copy button is overlapped by a body in play-475 (body passes under the top-right button; button fill is translucent, label stays readable but the button edge merges with the body). Pause button same in play-344 (body under Pause). Same fix family as 2.
   - A (recommended) Make button fill opaque dark (#0f1424) so edges stay crisp over bodies.
   - B Bodies fade out under the top 72 px band (gradient mask). Also helps defect 2.
   - C Leave. Targets still tappable.

4. MED - Spin marker too small (qa-spin.png). The spin notch is a ~10 px yellow tick on the rim; at a glance two spin bodies look like plain still bodies, and the direction of spin is unreadable.
   - A (recommended) Make 2-3 notches, longer (about 6 px inward), plus a small chevron showing direction.
   - B Tint spin bodies slightly (blue-grey) as well as the notch. Colour-only cue, weaker for colour-blind players.
   - C Leave; the notch moves anyway. Cheapest.

5. MED - Crumble state reads weakly (qa-crumble.png). Dashed outline is visible and clear on a full body, but it is the only cue; a half-eaten body (rem 50% shown) just looks like a small body with a dashed rim, so the player cannot tell it is dying or how long it has.
   - A (recommended) Draw ghost outline at original radius (very faint) while the fill shrinks, so shrinking is obvious.
   - B Add small fragment dots drifting off. More art work, more draw cost.
   - C Leave.

6. MED - Game-over summary line is cramped (gameover-475x638.png). "8 m | best 8 m | Swallowed by the tide | jumps 0 | chain 0 | seed 6JDN" wraps with a stray "|" at the end of line 1; no medal row/visual hierarchy, height is no larger than the other stats.
   - A (recommended) Big height number, medal under it, cause as its own line, then a 2x2 stat grid (best, jumps, chain, seed).
   - B Keep a single line but break only at separators (one stat per line). Quick.
   - C Leave.

7. LOW - Overlay panel covers the Pause button and the HUD ghost shows through (pause-475x638.png: panel starts at ~35 px, over the Pause button; "8 m" and Copy peek out above/behind the panel at low contrast). Resume exists, so it is not a blocker. On gameover the dimmed HUD text is cut by the panel top.
   - A (recommended) Dim or hide HUD + top buttons while an overlay is open.
   - B Start panel below 72 px so top buttons stay clear.
   - C Leave.

8. LOW - Toggles rely on colour only (pause-475x638.png): green means ON for the Assist/Sound buttons and the selected tide speed; the text says ON/OFF so it is fine, but the tide-speed trio has no label other than the green fill. OFF state not viewed.
   - A (recommended) Add a check mark or border to the selected tide speed. Tiny cost.
   - B Leave.

9. LOW - Assist arc (qa-charge-arc.png) reads well: dotted, clear, charge ring on runner. But the arc ends with no landing marker, so with a repel body (qa-repel.png) the dots just stop mid-air near the repel ring and do not say "will land / will not land".
   - A (recommended) Draw a small ring at the predicted landing point (hollow if no landing).
   - B Fade the last 3 dots. Cheap.
   - C Leave; assist is a hint by design.

10. LOW - Repel body is the clearest kind (qa-repel.png, salmon fill and outline, red rings) but is colour-only: a salmon fill is the entire cue. Pair with a shape cue (e.g. "+" outward ticks) for colour-blind kids.
   - A (recommended) Add 4 small outward ticks on the rim. B Leave.

## Looks good (viewed)
- Runner (white r9 + tail) is crisp and never overlaps the HUD at 45%/38%.
- Tide edge: bright pink top edge on dark plum band is clearly visible (qa-tide.png, qa-charge-arc.png). The dark band itself is only slightly darker than the background; the edge carries it.
- Buttons: Pause/Copy 56x56, overlay buttons 302x56, top row never in thumb zone. Overlay text is legible (white on navy). No clipped text at 475x638 in the shots I viewed.
- No console errors.

## Lessons for the lessons file (main session to log as QA-xxx)
- HUD text over bodies needs a backing plate or outline (defect 2).
- Show rings only for relevant bodies (defect 1).
- Small single-pixel-ish markers (spin notch) need size >= 6 px and a direction cue (defect 4).

## Self-review
- Went well: all four supplied shots plus five own captures viewed at 2x; button sizes measured by DOM.
- Went wrong: I mutated body kinds instead of reaching them organically, and did not view the 344x882 overlays or OFF toggle states; contrast ratios are estimated by eye, not measured.
- Improvements: (a) Add a "contrast sample" step: measure two pixel colours per text, benefit objective ratios. (b) Provide a debug query `?kind=spin` hook so QA can reach rare bodies without mutating state. (c) Always capture overlays at the narrowest size too.

## Status
Done: first pass, 10 defects (2 high, 4 med, 4 low). Next: user picks fixes; targeted recheck. Blockers: none. Feedback: src untouched.

QA inspector: initial pass, user-directed (9 states, 9 close-ups viewed)
