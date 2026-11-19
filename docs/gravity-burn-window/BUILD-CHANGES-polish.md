# Build changes: Burn Window polish (bw-0.2)
Live after merge: https://pech-pech.github.io/banglawar/gravity-burn-window/  (reopen the app twice after merge)
Code: pages/gravity-burn-window/. Mockups, QA and balance notes: games-design/gravity/2026-11-19-burn-window-polish/ (look/, ui/, qa/, balance-results.md).

## What is in
1. Feel + juice (game.js, audio.js): burn flame particles scaled by throttle, craft trail, screen shake (crash 6 px, 1 px rumble at full burn), dock flash and spark burst, crash debris, retry dust, haptics (dock 12 ms, crash 30 ms), tap holds burn at least 90 ms. Audio synth richer (ignition thump, throttle whoosh, speed hum with near-body beat, dock chime, crash boom, low-fuel beeps, medal arpeggio), voice cap 12, suspend/resume methods. Reduced motion: no shake, particles, flash, trail, vibrate.
2. Look A "Brass chart" (render.js): shaded banded planets with halos, thin orbit rings, grid and tick bezel into the side margins, gate with dashed outer ring, engine glow, dotted path with closest-approach tick, fuel bar amber under 25% and pulsing red under 10% with LOW FUEL label, HOLD rest zone, THRUST bar outside the chart. Free, code-drawn, no paid art.
3. Full UI (ui.js, 8 screens): Title, How to play (first run), HUD (icon Pause, sector pips, Warp), Pause (Resume, Retry sector, Warp, Sound, Settings, Copy report, Quit), docked and failed panels below the chart, Run end with medal and used/par rows, Settings (sound, reduced motion, haptics, throttle drag, warp button, daily/custom seed, reset saves with confirm, copy report), Best times with ghost toggle. Retry moved into Pause (`__bw.retry()` hook added).
4. Content + balance (gen.js): generator throw rate 3.9% to 0% (root cause: launch aimed at the main planet, about 68% crashed within 5 s). New sector types binary, ring, slingshot (8 sectors now open, open, binary, dark, corridor, ring, slingshot, gauntlet). Par search 5 adjustments. Beginner dock rate 7.4% to 12.8%, beginner fuel/par 1.84 to 2.17, skilled 100%.
5. Saves: keys versioned bw:best2:/ghost2:/par2: (old ghosts invalid with new sectors); Reset saves removes old and new. SW cache and report version bw-0.2.

## Admin defaults (my calls, M can change any)
Look A (M picked on card). Retry moved into Pause. Docked/failed panels in the band under the chart. First-run how-to shown once. Fuel stays max(14, 2.2x par) (M, no change). Moving gate not done. Throttle ring not done. Pause/Warp top inset is safe-area only (no fixed 12 px).

## Checks
physics 9/9, audio pass (peak est 0.755), bots: idle 0%, naive 0%, skilled 100%, beginner 12.8% docks, expert uses under half beginner fuel; e2e 10/10 at 475x638 and 344x882, 3 runs all green (test 7 hidden-tab race fixed in the test). Checkers: game, audio, render, UI each reviewed, defects fixed. Visual QA: first pass 6 defects, recommended fixes applied; recheck 5 minor items, R2 R3 R4 R5 fixed, R1 partial.
WebGPU output: NOT seen (Canvas2D only). Sound: not heard by ear. Not tested on a real Fold.

## Known gaps / proposals for M
Fuel floor 14 is what sets fuel on almost every sector now (par about 3-5): proposal floor 8 (bot sweep incomplete, M said no change). Slingshot (69%) and gauntlet (74%) are the hardest for the human-like bot. Gen about 0.9-2 s per sector. Cross-device determinism uses Math.sin/cos.

Lessons applied: CHECKLIST 1-7, 8 (look locked by card before render), 11 (one QA pass + one recheck), 13, 14, 15, 16, 18, 19, 23 (fast makers, 2 per split: maker + checker).
COST: 0 art credits. About 22 Sonnet sub-agents (4 mockups, 3 UI mockups, feel, audio, render, UI implementer, 5 checkers, test engineers x3, 2 QA inspectors) plus 1 Opus (balance, about 28 min). Lead on Sonnet 5.5.
