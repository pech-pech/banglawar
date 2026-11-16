# PARITY-T5: coach curve (B6.2)

Tool: `node tools/coach-curve.mjs [careers] [--variants]`. Run for this file: `node tools/coach-curve.mjs 200`.
Target: coach-weekly SPEC s3a (mean step of coaches on staff at season end, +-0.3 step) and the S+ share of careers.
Seeds: 200 careers x 12 seasons, seeds 4242..4441.

## Rule in force

- A coach at step 19+ may take the club's one course a season (M decision, 2026-11-16). The result is cut at 19 (`courseCap`, `COURSE_MAX_STEP` = 19), so a course taken at 19+ can be wasted.
- This replaces the earlier rule in the previous version of this file, where a coach at 19+ could not start a course. `canStartCourse` in `js/core/coach-steps.js` now returns ok for any coach.

## Current rows (tool output, 200 careers)

| Season | target | sim mean | SE | diff | in +-0.3 | S+ target | S+ sim |
|---|---|---|---|---|---|---|---|
| 1 | 6.5 | 6.40 | 0.08 | -0.10 | yes | 0% | 0% |
| 2 | 8.3 | 8.32 | 0.08 | +0.02 | yes | 0% | 0% |
| 3 | 9.9 | 9.83 | 0.09 | -0.07 | yes | 0% | 0% |
| 4 | 11.7 | 11.80 | 0.09 | +0.10 | yes | 0% | 0% |
| 5 | 13.0 | 13.00 | 0.09 | -0.00 | yes | 0% | 0% |
| 6 | 14.1 | 14.16 | 0.08 | +0.06 | yes | 0% | 1% |
| 7 | 14.4 | 14.33 | 0.05 | -0.07 | yes | 1% | 1% |
| 8 | 14.9 | 14.88 | 0.03 | -0.02 | yes | 8% | 7% |
| 9 | 15.8 | 15.67 | 0.04 | -0.13 | yes | 25% | 19% |
| 10 | 17.2 | 17.03 | 0.05 | -0.17 | yes | 43% | 40% |
| 11 | 17.8 | 17.57 | 0.04 | -0.23 | yes | (64%) | 61% |
| 12 | 18.6 | 18.12 | 0.04 | -0.48 | NO | (81%) | 79% |

Rows in +-0.3: 11 of 12. The S+ targets for s11 and s12 are not SPEC rows (64% and 81% from 01 s3).

## Verdict

- 11 of 12 rows are inside +-0.3. The only miss is s12: sim 18.12 vs target 18.6 (-0.48).
- S+ share is close to target: every season is within 6 points (worst is s9, 19% vs 25%).
- s12 mark: **retune is M's call, not changed.** No constant was changed for this run.

## Open gaps from the earlier report

These were measured under the earlier rule and were not re-run in this pass.
- Live coach slots are 3 every season (`TRAIN2.coach.slots` = 3, `MAX_COACHES` = 3). SPEC says 2 until about season 6. The sim uses 2 then 3, so the live slot rule is not the SPEC rule.
- Scout names only queue for the next list and are dropped at season end. The sim lets a name join the list at once, so mid-season names do not reach a list live.
