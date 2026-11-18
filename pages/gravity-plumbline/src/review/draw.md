# Review: parts/draw.js (271 lines) vs CONTRACT.md

Verdict: PASS with 2 should-fix, 3 minor, 2 nits. No blockers.

## Checks
- Buttons >= 56 px: PASS (BTN_SIZE=56, line 7; hit rects from btnRect, lines 14-19, are the same rects drawn at 246-247; copy+path in the contract shape).
- Text >= 14 px: PASS (text() clamps with Math.max(14, px), line 62; toast sets 14 at 251).
- Bottom 40% strip: PASS for the important things. HUD is all top, toast at 0.55H (250-256), complete-screen text ends at 0.3H+140 (<0.6H on 344x882 and 475x638). Only the hint line (221) and restart ring (224-227) sit in the strip, which is intended.
- predictPath uses the contract API (PL.step, PL.C.DT, state fields, events): PASS. Shallow clone with crumbleS copied and pending cleared (24-27). No flips fed. Stops on death/win/land/grounded.
- Missing fields: PASS. Guards on room, hud, frame, view, crumbleS, fx, charges, g, PL.C, PL.DIRS.

## Findings
1. SHOULD-FIX, reduced-motion, lines 191-201 (dust) and 82: draw.js never reads reduced-motion. It relies on ui.js sending an empty hud.fx. Fix: `const rm = view.reduceMotion || hud.reduceMotion; if (!rm) { ...dust loop... }`. Document that ui.js sets view.reduceMotion. The crusher drift is gameplay, so leave it.
2. SHOULD-FIX, perf, lines 21-42 and 184: predictPath runs up to 96 PL.step calls every frame, and core's step builds solids each call. That is about 96 x several allocations per frame. Fix: cap at about 48 steps by stepping each iteration twice per sample or lower the horizon, reuse one scratch state object and one points array (`PL._pp`, reset length=0), and skip recompute when state.t is unchanged since the last call.
3. MINOR, line 234: hud.teach is drawn on one line with no clip or wrap. A long teach string runs under the Copy/Path buttons (they start at x = W - 136) and off-screen on 344 px wide views. Fix: measure it, and if width > W - left - 136, truncate with an ellipsis or split into two lines. Line 232 (room name) has the same risk, but it is short.
4. MINOR, line 36: `|| s.grounded` ends the path on the first iteration when bob is standing, so a grounded player sees no dotted line. This matches "stops at landing", but the preview is useless while grounded. Fix: ignore grounded/land for k < 3.
5. MINOR, lines 82-91: per-frame closures sx and sy, plus font string concatenation in text() on every call (about 8 per frame). Not a hot loop. Optionally inline the math, or cache the font strings per size.
6. NIT, line 204: dead condition `&& false` (the leftover blink code). Remove it. A death flash could use `state.dead % 12 < 6` only when not reduced-motion.
7. NIT, line 221: the hint text sits in the strip at H - inset.b - 14. It is fine, but fade it after the first run if it clashes with the restart ring (centre W/2, 0.8H, r=36) on short views.
