# Rooms beta: status (interim, written on the coordinator's expedite request)
Admin default used for every choice. REVIEW-MERGE.md was not found at the given path; rows were taken from parts/review-levels.md. Window = contiguous winning ticks when ONE input of the loosest centred route is shifted alone (tools: src/test/window-probe.js). 120 ticks/s: 12 = 100 ms, 8 = 67 ms. Band: 12 (tier 1-2), 8 (tier 3).

## Per-template status
| id | tier (new) | status | old tool (fastest route) | loosest before | loosest now | change |
|---|---|---|---|---|---|---|
| tut1 Flip | tutorial | done | n/a | n/a | 43 | new room, 2 free flips |
| t01 Arc Carry (tut 2) | tutorial | done | 15 | 25 | 25 | none |
| tut3 Dive Gate | tutorial | done | n/a | n/a | 61 | new room, one Dive |
| t02 | 2 | done | 1 | 1 | 26 | corridor ceiling +20, wide crumble ledge, strip removed, wall spike shortened, gate 12 thick |
| t03 | 2 | done (crusher solo) | 11 | 13 | 17 (worst of 10 variants) | safe stub, lane 30 px, plate x142, 3 free inputs |
| t04 | 1 | done | 5 | 12 | 17 | block +17 px left, wall spikes shortened |
| t05 | 2 | done | 1 | 6 | 27 | ceiling spikes only x150-324 |
| t06 | 2 | done | 2 | 14 | 14 | none |
| t07 | 2 | done | 2 | 4 | 24 | right ledge +28 px, wall spikes shortened (exit clear of spikes) |
| t08 | 3 | done | 3 | 24 | 24 | renamed "Under the Baffle" |
| t09 | 1 | done | 6 | 26 | 31 | gate 12 thick, exit x300 |
| t10 | 2 | done | 4 | 22 | 32 | gate and wall 12 thick, spikes moved off the exit |
| t11 | 3 | done, unchanged | 1 | 61 | 34 | none |
| t12 | 3 | IN WORK (probe running) | 8 | 61 | pending | none |
| t13 | 3 (was 2) | done | 9 | 15 | 14 | retier only |
| t14 | retired | done | 1 | 1 | 4 | one fix attempt missed jitter gate (35-60% clear); retired |
| t15 | 3 | done | 5 | 15 | 16 | renamed "Under the Divider" |
| t16 | 3 | done | 20 | 55 | 43 | none |
| t17 | 3 (was 2) | done | 2 | 39 | 30 | retier, gate 12 thick |
| t18 | 1 (was 2) | done | 1 | 5 | 24 | crumble 2 widened to the wall, exit x290 |
| t19 | 3 | IN WORK (probe running) | 1 | pending | pending | retire if it misses 8 |
| t20 | 1 (was 2) | done | 8 | 18 | 18 | retier only |

Not started in tpl2.js: none. Every tpl2 template (t13-t20) has been probed; only t19 awaits its result.

## Jitter bot (200 seeds, +-40 ms, 3% wrong key after the first input; first-try clear)
tut1 97, t01 96, tut3 100, t02 89, t03 93, t04 94, t05 93, t06 89, t07 92, t08 94, t09 97, t10 94, t11 pending recheck, t13 88, t14 35 (retired), t15 89, t16 93, t17 92, t18 97, t20 95. No-plan (+-80 ms) is in the tool output, reported only (lowest: t06 57, t04 64).

## Done in code
tutorials out of shafts, never mirrored; buildShaft slot table (5: T1,T1,T2,T3*,T2r; 7: T1,T1,T2,T2,T3,T3*,T2r), seeded, family and mirror alternate, first crusher t03, first crumble t18, exit clear of spikes; features >= 11.9 units checked. Tests: sim, shaft (12), slice-core, core-fix, meta, audio pass.

## Still to do
t12 and t19 results, shaft-check shaft run, medal bands table, full per-room spec text, self-review.
