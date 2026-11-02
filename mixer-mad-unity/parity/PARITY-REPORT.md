# Parity report: C# Sim vs mixer-mad-v7h.html (dotnet 8.0.427, Release)

Run: `dotnet test Sim.Tests -c Release` : 205 / 205 passed (202 trace replays + 3 unit tests), 45 s.
Each trace is replayed from its recorded per-tick input string through `World.Step()`.

| vehicle | traces | T1 (first 240 steps <= 1e-9 m) | T2 (whole run <= 0.25 m) | T3 (pass, crashes, crash x +-0.5, finish time +-1%) |
|---|---|---|---|---|
| mixer (incl. skins 2-4, Full Load mode) | all mixer_* | 100% | 100% | 100% |
| digger (incl. Daily 2026-11-02) | all digger_* | 100% | 100% | 100% |
| dump | all dump_* | 100% | 100% | 100% |
| dozer | all dozer_* | 100% | 100% | 100% |
| crane | all crane_* | 100% | 100% | 100% |
| roller | all roller_* | 100% | 100% | 100% |

Stronger than required: for all 202 traces the max position error is 0 (max over the first 240 steps printed as `maxErr240=0`) and the per-tick FNV-1a hash of x,y,px,py of the 6 points matched on every tick of every run (no first divergence anywhere). So the port is bit-identical to V8 here, including the built level geometry (.NET sin/cos gave the same doubles; `MM_USE_ORACLE_LEVELS=1` was not needed).

## Sweep (Sim.Runner vs sweep.js on the same v7h HTML)
576 runs (6 vehicles x 8 levels x 12 policies), C# `Sim.Runner` (118 s, 3.18 M steps) vs `sweep.js` run on the oracle HTML (files `sweep-csharp.json`, `sweep-html.json`).
- digger, dump, dozer, crane, roller: 480 / 480 runs identical (pass, finish time, crash count, crash x, air time, max pitch, end time).
- mixer: the stock sweep picks `combo3.skin` at random (HTML Math.random), so it differs from skin 1 in 82 runs (HTML 33/96 pass, C# skin 1 28/96). With the HTML pinned to skin 1 (`sweep-html-mixer-skin1.json`) the mixer matches 96 / 96 runs exactly.
- Pass counts (C#): mixer(skin1) 28, digger 59, dump 34, dozer 69, crane 58, roller 53 of 96 each.
- Note for balance sweeps: the HTML mixer numbers depend on the random skin; the C# runner uses skin 1 (add a skin option if you need the others; skins 2-4 are covered by parity traces).

## Behaviour flags (tuning.json `consts`)
- `crashEarlyReturn` (0 = v7h): 1 makes StepCore return right after a crash (v7i).
- `resetPropBudgetOnStartLevel` (0 = v7h): 1 resets propBudget in StartLevel (v7i).
The exact v7i placement of the early return is a guess (right after the crash checks, before `levelT += DT`); check against v7i traces.
