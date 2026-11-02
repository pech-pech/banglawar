# Mixer crash and respawn report (cloud, physics side)
Measured with a new read-only tool, `Sim.Probe` (/home/user/mm-unity/Sim.Probe). Mixer, Classic, skin 0, 8 levels at their own weather (Unity slice = level index 2, snow). Policies: the 12 sweep bots plus 18 "human" drivers (full gas, release on steep pitch; thresholds 0.35/0.55/0.8 rad x reaction delay 4/14/30 ticks, gas held or released during the freeze). 14 bot x 8 + 18 human x 8 runs, 120 s cap, 12 crashes max. 893 crashes, 827 respawns.

## Findings
1. Freeze: always 84 ticks = 0.70 s (crashWait 0.7), world frozen, no steps. The respawn tick also runs one step.
2. Respawn place: last checkpoint if hit, else x=5 (start). Checkpoint exists only on levels 2-8 (index>=1). cp x by level (index 1-7): 50.0, 58.1, 47.7, 52.8, 48.0, 48.5, 56.1. Spawn is always flat (angle 0, not the slope angle), P0 at groundY(sx)+1.2, velocity exactly 0 (px=x). Never inside a zone (zone within 3 m at L3, L4, L5, L6 cps only); a rock is 3.2 m ahead of the L4 cp.
3. DEFECT, snow level (index 2) cp x=58.06: the cp is the valley between two 2.5 m hills. The flat-spawned wheels start 0.16 m inside the hill flanks. The push-out throws the truck up (first-step speed 18-21 m/s, P0 rises from 1.7 m to 6.5 m over 1.3 s), it lands on the next hill and flips about 2.05 s later (x 61-65). 64 of 177 respawns on this level are followed by a crash inside 3 s (all at the cp, 2.05-2.98 s), and every cp respawn on this level does it. No other level's respawn is buried or spiky (max 6.6 m/s = normal acceleration). Level 6 cp is tilted 3.4 deg off slope but clear by 0.39 m.
4. Confirmed in the HTML, not just C#: parity/traces/mixer_L3_t0.8-none.json.gz (HTML oracle, level 3 = index 2). cp hit at tick 1552, crash 1707, reset 1791, P0.y 2.66 -> 6.52 at ticks 1800-1872 over 0.2 m ground, crashes at 1707/2037/2367/2697 (period 330 ticks = 84 freeze + 2.05 s). Same code (SIM-MAP s.8 resetTruck(true)). I did not re-run record.js (needs chromium).
5. Second pain on the snow level: the human drivers flip on the first hill at x~46-49, BEFORE the cp (58.06). That sends them to x=5 (43 m, ~8-10 s replay + the 0.7 s freeze). 125 human crashes there, 20 after the cp. Mean progress lost per crash on that level is 36 m (humans). Bots repeat the same crash site every try (deterministic), so the bot loop counts (174/827, 21%) overstate; human loops are the 20 above, all on the snow cp.
6. Gas held through the freeze: no effect. 24 paired runs (identical until the reset tick), none differ in crash timing, max-speed difference 0.1 m/s. Gas only matters once the wheels touch ground.
7. Other loops (L1 x22, L5 x20, L3 x67) are bot-only: respawn at x=5, same hazard 2.9 s later. Not a respawn defect.

## Options (all in Sim/Data/tuning.json consts, default 0 = off; v7h bit-exact, 214/214 tests pass incl. 202 parity traces)
Snow level, 30 runs (12 bots + 18 humans); "loops" = crash within 3 s of respawn.
- A. `respawnClearLift=1` (lift just enough that no wheel starts buried; no-op on flat): loops 64 -> 0, max speed 20.8 -> 6.3 m/s, crashes 188 -> 146, human passes 0 -> 2 of 18. Whole game: loops 174 -> 110 (rest are bot-only), crashes 893 -> 851. RECOMMENDED, cheapest, tiny change.
- B. `respawnFlatBack=1` (+`respawnFlatMaxBack`, `respawnFlatTol`): back to flat clean ground, never before start. At 20 m max it fixes loops (0) but passes fall to 0, and on this level the nearest flat ground is x~41, before the hill that kills humans, so it gives away the checkpoint's progress. Not recommended alone.
- C. `respawnGrace=s` (no flip/roof crash accumulation): at 1.5 s no effect; at 3.2 s loops go to 0 only because the crash is delayed past 3 s. It hides the launch, it does not fix it. Not recommended.
- D. Shorter freeze: `crashWait` already a const. 0.35 s changes nothing about loops (174 -> 174), only waiting. Optional comfort, Unity can set it itself.
- E. Zero velocity: already true. Nothing to fix.
- F. Earlier checkpoint (untested beyond one run; existing consts `cpFrom/cpTo`, level-wide): cp window 0.30-0.42 + A on the snow level: human crashes 125 -> 66, mean loss 36 -> 19 m, but cp at x=40.8 sits just before the hill, so humans re-crash within 3 s (44 loops). Needs a design decision.

## Decision for the user (question for the main session)
Which to ship in the Unity build: A only (recommended), A + F, or A + D (shorter freeze)? Cost: A one flag, no balance change off the snow level; F changes level feel; D only shortens waiting.

## Files and checks
Changed (not yet in /mnt copy; main session to sync, then also Unity Resources/MixerMadSim/tuning.json, which is a separate copy): Sim/Core/Tuning.cs, World.cs, World.Step.cs, Sim/Data/tuning.json (all in /home/user/mm-unity); new Sim.Probe/ and Sim.Tests/RespawnTests.cs (9 tests: defect pinned with flags off, each option fails with its flag off, passes on). `dotnet test`: 214 passed, 0 failed. Probe raw output: session scratchpad probe1.log / o_*.log.
Not verified: Unity view, other skins (1-3), non-mixer vehicles, record.js re-run, real human input.
