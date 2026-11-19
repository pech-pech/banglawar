# rooms.js / core.js review (checker)
Tool: src/test/solve.js (`node solve.js [maxInputs=3] [stepTicks=6] [seed] [room]`). DFS over <=3 inputs (4 flips + dive), tick offsets step 6, horizon 20 s, seeds 1..5. Rooms 1-2 take ~15 s/seed, room 3 ~15 min/seed (quantised-state dedupe).

## Results (fastest solution found; flips are 'dir' 0-3)
| room | seeds 1..5 | fastest | solution (tick:input) |
|---|---|---|---|
| R1 Arc Carry | all solvable | 0.51 s | 0:flip right, 1:DIVE, 20:flip down (unmirrored; seed 2-5 identical timing) |
| R2 Charge Banking | all solvable (seed1 plain, 2-5 mirrored) | 1.89 s | 0:flip R, 37:flip D, 152:flip L -- NO dive, gate never needed |
| R3 Rhythm Press | all solvable (4,5 mirrored) | 1.28 s | 0:flip R, 55:flip D, 92:flip L -- identical on every seed, crusher phase irrelevant |

Static checks (all 15 room instances): same seed deep-equals OK; every rect inside 336x500 OK; start not overlapping any wall/crumble/gate/crusher OK; no spike overlaps start (shrunk 3 px) OK; exit not inside wall/spike OK. Room 1 <12 s with <=2 flips on all seeds: PASS (0.51 s, but see defect 1).

## Defects and concrete fixes
1. R1 is solved in 0.51 s, with a tick-1 DIVE (right then dive adds +250 across the gap) -- far from the taught "2 flips, ~1.0 s arc". Bigger issue: speed carry makes the gap trivial. Fix: widen the pit (move right block x 190 -> 215, spike [102,472,88,16] -> [102,472,113,16]) or lower the exit/landing so a plain right+dive overshoots into spikes [312,80,12,40]; re-run solve.js and require that the best solution has a flip-down between ticks ~37-55.
2. R2 gate is bypassable: a 3-flip, 0-dive solution (R, D@37, L@152, 1.89 s) reaches the exit, so "Dive-tap needed to pass the gate" is not enforced. Run `PL.replay` on that log and print the path to see where it leaks (likely falls past gate end x<100 or around the plug [88,150,12,58]; plug only 58 tall and corridor floor is the gate itself). Fix: extend the gate to the full lower span ([12..324] minus a 1-bob solid ledge), and remove any gap between plug and left wall (start ledge [12,90,90,14] to plug) so the only way down is through the gate; then re-run and require solutions to contain a 'dive'.
3. R3 crusher is decorative: best solution is identical for all seeds (phase never matters), at 1.28 s, so the "rhythm" lesson is absent. The press (y 10..130 sweep, slab y 132) is above the bob's flight line (y~119 under start ledge). Fix: move crusher to the flight corridor (e.g. r [140,100,60,20], ay amp 50, so it sweeps y 50..170 across the bob's y~119 line), then confirm solve.js times vary by seed phase (waiting inputs appear, ticks > 100) and that a non-waiting run dies.
4. Seed->phase: all crusher rooms get phase = rng()*2pi per room (consumed even for rooms with no crusher) -- fine and deterministic; mirror flag m is also drawn per room (seeds 1-3 unmirrored R1, 4-5 mirrored R3) -- OK.
5. Intended solutions in the header comments (R1 ~1.0 s, R2 ~3 s with dive, R3 4-5 s) do not match reality; update comments after fixes.
6. Build note: inline.py wraps parts in IIFEs, so the `const PL` redeclare is fine in the page; but plain `vm` concatenation of parts into one script (e.g. test harness) throws "Identifier 'PL' has already been declared" -- solve.js wraps each part in an IIFE; ui test makers must do the same.
