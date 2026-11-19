# Build changes: Burn Window review fixes (bw-0.2.1)
Live after merge: https://pech-pech.github.io/banglawar/gravity-burn-window/  (reopen the app twice after merge)
Review: games-design/gravity-burn-window/REVIEW.md. Fixes for items 1-5 and 9; items 6-8 (difficulty, medals, pace) left for M.

## What changed
1. "New run" button hidden whenever a menu is open (game.js frame()).
2. Docked panel "New best" chip moved to the panel top edge, no overlap with Next at 344 (ui.js).
3. sw.js caches only ok + basic responses; cache/report version bw-0.2.1.
4. Safe-area top inset: chart top, Pause/Warp and sector pips all respect it (game.js safeTop, render.js layout).
5. Math.hypot replaced by sqrt(x*x+y*y) in sim.js and gen.js. Par and checksum unchanged (1a 587ba043). sin/cos still engine-dependent.
9. Ghost save validated on load (report.js validEvents), sim ignores malformed events.

## Checks
physics ALL PASSED, audio pass, bots unchanged (mean 2.52, expert under half of beginner fuel YES), e2e 21 PASS x 3 runs (475x638, 344x882). Checker reviewed diff: all OK. Visual recheck at 475x638, 344x882, 624x912: New run hidden on Title and Best times, chip clear of Next, buttons >= 56x56, 44 px inset: no overlap (work/fix-recheck.md).
WebGPU output: NOT seen (Canvas2D only). Sound not heard by ear. Not tested on a real Fold.
Known low: speed readout 5 px from fuel bar at 344; chip 3 px into playfield at 475; ~240 px dead space at 344x882.

Lessons applied: CHECKLIST 1, 5, 6, 11, 13, 14, 15, 18, 19, 23.
COST: 0 art credits. 3 Sonnet makers, 2 Sonnet checkers/QA, lead Sonnet 5.5.
