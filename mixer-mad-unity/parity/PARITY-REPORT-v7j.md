# Parity report v7j: C# Sim vs mixer-mad-v7j.html (dotnet 8.0.427, Release)

Result: `dotnet test Sim.Tests -c Release` is green: 310 / 310 (298 v7j trace replays + 12 unit and respawn tests). The v7h set still passes on the archived v7h data: 205 / 205 (`MM_DATA=Sim/Data-v7h MM_TRACES=parity/traces-v7h`). Default data in `Sim/Data` is v7j.

## What was recorded (parity/traces, oracle/mixer-mad-v7j.html, skin pinned, seed 20261102)
298 traces: set A mixer x 8 levels x 6 policies (48), B five other trucks x 8 levels x 3 policies (120), C mixer skins 2-4 (24), D Daily 2026-11-02 digger (2), E Full Load mode mixer (8), F new human-style drivers `human1`/`human2` (pulsed gas with slow wobble, brake taps when fast) for 6 trucks x 8 levels (96). 74 traces are on snow levels (L3, L8) or Daily snow. The traces hold 414 crashes in total, so crash, freeze and checkpoint respawn are exercised heavily (mixer 46 of 96 traces crash).

| vehicle | traces | T1 (240 steps <= 1e-9 m) | T2 (whole run <= 0.25 m) | T3 (pass, crash count, crash x, finish time) |
|---|---|---|---|---|
| mixer | 96 | 100% | 100% | 100% |
| digger | 42 | 100% | 100% | 100% |
| dump | 40 | 100% | 100% | 100% |
| dozer | 40 | 100% | 100% | 100% |
| crane | 40 | 100% | 100% | 100% |
| roller | 40 | 100% | 100% | 100% |

Stronger than T1-T3: the per-tick FNV hash of x, y, px, py of all six points matched on every tick of all 298 runs (no first divergence anywhere); the max error in the first 240 steps is 0. The 5e-8 "maxErrAll" the test prints for later samples is only the 7-decimal rounding of the stored sparse samples, not a sim difference.

## Sweep (576 runs: 6 trucks x 8 levels x 12 policies)
`Sim.Runner` (120 s, 2.87 M steps) vs `sweep.js` on the v7j HTML (`sweep-csharp-v7j.json`, `sweep-html-v7j.json`): 576 / 576 runs identical in every field (pass, finish time, crash count and x, air time, max pitch, end time). Pass counts of 96: mixer 55, digger 75, dump 60, dozer 74, crane 84, roller 59. The v7j mixer no longer depends on the random skin (physics uses the skin 1 hull for all four), so the stock HTML sweep and the C# sweep agree without pinning.

## What changed in the port (v7h -> v7j)
- Tuning loader reads the HTML's MM_TUNING shape (drive, phys, crash, weather, props, par); `tools/extract.js` reads the blob from the HTML (and still converts v7h consts into the same shape).
- Truck profile: pull = force/mass, ground torque = torque/mass, per-truck coast/spin/link/snowRoof, prop push divided by mass; weather vmax and pull per weather on the gas branch only, gas grip falls with speed by gripCurve (neutral now), snow vmax cut 0.35, new zone grip/drag/ease/stickyPull numbers.
- Level jumps recorded {ramp, land}; zones, rocks (jumpClear 4 m) and snow props (propClear 4 m, cones that do not fit are dropped by the retry loop) use them. Zone counts and lengths from tuning.
- Flips as a skill: crash time only counts while touching ground, a mover or a prop (`airCounts` false). New PAR_T table for classic par; K formula stays for Load and Daily.
- v7i: crash() ends the step. The placement matches the JS (right after the Fell/kill/tolerance chain, before `levelT += DT`); all traces with crashes replay bit-exactly, which confirms it. startLevel refills propBudget. Both stay behind `consts.crashEarlyReturn` and `consts.resetPropBudgetOnStartLevel` (1 for v7j, 0 in Data-v7h).
- Respawn lift: the Unity option A and the HTML "v7j respawn" use the same formula (max over wheels, plus body corners only without sprite geometry, of groundY(sx + px_i) + r_i + respawnClear - py_i; velocity 0). `crash.respawnClearLift` / `respawnClear` (0.04) now come from the tuning blob. They match (bit-exact traces with checkpoint respawns); TUNING-v7j.md says it lifts 0 of 90 classic respawn points on v7j (a guard). The other respawn options (flat-back, grace) stay off by default.

## Notes
- Unity-side respawn tests (`RespawnTests`) pin the v7h defect, so they now run on `Sim/Data-v7h`.
- Test selection: `MM_DATA` and `MM_TRACES` environment variables; `record.js` takes `MM_HTML` and `MM_TRACES`.
- v7h traces archived in `parity/traces-v7h`.
