# Rooms beta: independent check
Checker run, read-only on src/parts. New file: src/test/rooms-audit.js.

## Repro
- Audit (about 2 min): `cd src/test && node rooms-audit.js`
- Probe + jitter with other seeds: `cd src/test && SEEDS=11,12,13,14,15 node window-probe.js <id>`; the jitter bot reseeded by shifting PL.mulberry32 by 7777 (wrapper in session scratchpad jit2.js: `OFF=7777 SEEDS=11,12,13,14,15 node jit2.js t02 ...`).

## Re-measured vs claim (my seeds; window ticks / jitter first-try clear, 200 seeds)
| id | claim win | mine | claim clear | mine | verdict |
|---|---|---|---|---|---|
| t02 | 26 | 22 | 89 | 86.5 | ok (15% under window) |
| t03 | 17 | 16 | 93 | 92.5 | ok |
| t04 | 17 | 17 | 94 | 94 | ok |
| t05 | 27 | 27 alone, 8 in multi-seed run | 93 | 80.5 (92.5 single-seed) | TOOL ARTIFACT, see below |
| t06 | 14 | 14 | 89 | 92 | ok |
| t07 | 24 | 24 | 92 | 89.5 | ok |
| t08 | 24 | 24 | 94 | 94.5 | ok |
| t09 | 31 | 31 | 97 | 95.5 | ok |
| t10 | 32 | 32 | 94 | 94.5 | ok |
| t11 | 34 | 43 | pending | 98.5 | ok |
| t12 | pending | 21 | pending | 92.5 | pending, passes |
| t13 | 14 | 13 | 88 | 89.5 | ok (band 8) |
| t15 | 16 | 14 | 89 | 87.5 | ok (12% under) |
| t16 | 43 | 43 | 93 | 93.5 | ok |
| t17 | 30 | 27 | 92 | 91 | ok |
| t18 | 24 | 24 | 97 | 95.5 | ok |
| t19 | pending | 8 | pending | 82 | pending, on the band edge (8 of 8, bot 82 of 80) |
| t20 | 18 | 18 | 95 | 94 | ok |
No template below band, none more than 20% under claim, except the t05 tool artifact.
Not re-run: tut1, t01, tut3 (not in shafts), t14 (retired).

t05 artifact (tool defect, not a game defect): `window-probe.js t05` alone gives 27 for both mirror states, but with 2 or more SEEDS the mirrored variant picks a different route (48:f0 97:f3 131:f2 237:f1, windows 8,10,25,48). Same room geometry, so the beam/probe keeps state between variants (order dependent). Repro: `SEEDS=11,12 node window-probe.js t05`. The maker's single-seed numbers hold; multi-seed crusher results may be pessimistic by the same effect.

## Static audit (300 shafts per length of 5 and 7 + 30 dailies from 2026-11-19, length 5)
Zero hard failures: no tutorial/retired room, no template twice (so none back to back), exit at least 22 from every spike, no feature or gap under 11.9 units (0 violations in jitter-bot featureIssues over all rooms).
Findings:
1. Slot tiers do not match the rule T1,T1,T2,T3,T2. The last slot (rest room) is drawn from t04, t18, t20 (tier 1) as well as t06 (tier 2): 230 of 300 5-room shafts and 243 of 300 7-room shafts end on a tier-1 room (85+88+57, 105+95+43). Likely intended ("T2r") but contradicts the stated tier rule; needs an owner call.
2. Tier 1 has exactly 4 live templates (t04, t09, t18, t20): meets "at least 4" with no spare. Tier 2: 6, tier 3: 8 (incl. pending t12, t19).
3. Template spread is very skewed (use count over 630 shafts): t17 587 (93% of shafts), t18 473, t20 449, t04 453, t06 413 versus t12 12, t11 17, t19 23, t02 26, t16 39, t13 27. The tier-3 hard slot is nearly always t17. Cause: the "after crusher / 5-input room" rule and first-crusher t03 / first-crumble t18 rules starve t11, t12, t13, t16, t19.

## Hazard presence (3750 rooms)
crusher rooms 339 (9%), crumble 499 (13%), gate 1057 (28%), spikes 3750 (100%), no-hazard rooms 0. Variety did not collapse, but crushers are rare and spikes are in every room.

## Degenerate routes and soft locks
Per live template, mirrored and not, 3 crusher phases: zero input, hold each of 4 directions (press every 6 ticks), dive spam, one lone flip at 40 start ticks x 4 directions then nothing, all for 25 s: no template wins. Random play, 30 seeds x 6 variants x 18 templates, 20 s: no run alive-and-unfinished while moving under 20 px in the last 10 s. 0 findings. Limits: "stuck" is approximated by position span, not proven by search; random play at 3%/tick.
