# TEST-MAP-T5: coach weekly test IDs to planned test files

Source: /mnt/project-files/games-design/cricket-sixes/2026-11-16-coach-weekly/SPEC.md, section 12 (Tests) and section 11 (Copy report).
Scope: segments S1, S3, S4, S5, S6, S7, S11, coach / jobs / XP only. Clinic tests are excluded.

Planned test files (from the task list):
- coach-weekly-const.test.mjs
- coach-jobs.test.mjs
- coach-xp.test.mjs
- coach-steps.test.mjs
- coach-scout.test.mjs
- coach-ui.test.mjs
- coach-report.test.mjs

## S1 Constants (9 tests)

| Test | Subject | Planned file |
|---|---|---|
| T1.1 | constants load from one module | coach-weekly-const.test.mjs |
| T1.2 | slice widths sum 1 | coach-weekly-const.test.mjs |
| T1.3 | every slice <= 0.12 | coach-weekly-const.test.mjs |
| T1.4 | slice count = 10 (>= 9) | coach-weekly-const.test.mjs |
| T1.5 | circular neighbours differ | coach-weekly-const.test.mjs |
| T1.6 | `XP_PER_STEP` shape (20 entries, k 17, 60 + 14k, flat 230) | coach-weekly-const.test.mjs |
| T1.7 | job ids exactly nets, match, study, scout | coach-weekly-const.test.mjs |
| T1.8 | Clinic pcts 5/10/20 and counts 4/2/3/1 | coach-weekly-const.test.mjs |
| T1.9 | constants equal numbers parsed from section 3 | coach-weekly-const.test.mjs |

## S3 Job rules (12 tests)

| Test | Subject | Planned file |
|---|---|---|
| T3.1 | nets coach forced Nets | coach-jobs.test.mjs |
| T3.2 | idle coach on match day is Match | coach-jobs.test.mjs |
| T3.3 | others only Study or Scout | coach-jobs.test.mjs |
| T3.4 | default = last job | coach-jobs.test.mjs |
| T3.5 | illegal default falls to Study | coach-jobs.test.mjs |
| T3.6 | away = no job | coach-jobs.test.mjs |
| T3.7 | new coach defaults Study | coach-jobs.test.mjs |
| T3.8 | away coach returns, default rule | coach-jobs.test.mjs |
| T3.9 | bye week: no Match coach, 0 match XP | coach-jobs.test.mjs |
| T3.10 | only coach is nets coach: "No match coach this week" | coach-jobs.test.mjs |
| T3.11 | saved `clinic` job loads study | coach-jobs.test.mjs |
| T3.12 | 2-slot idle coach may take Tape or Scout | coach-jobs.test.mjs |

## S4 XP hooks (15 tests, 14 mapped)

| Test | Subject | Planned file |
|---|---|---|
| T4.1 | nets run pays 10 or 5, once | coach-xp.test.mjs |
| T4.2 | jackpot run pays 0 | coach-xp.test.mjs |
| T4.3 | match loss 6, win 12 | coach-xp.test.mjs |
| T4.4 | bye pays 0 | coach-xp.test.mjs |
| T4.5 | EndWeek pays Study and Scout once | coach-steps.test.mjs |
| T4.6 | away pays 0 | coach-xp.test.mjs |
| T4.7 | full bar +1 step, overflow carries | coach-xp.test.mjs |
| T4.8 | payout 500 loops steps | coach-xp.test.mjs |
| T4.9 | S+ pays 0, shows MAX | coach-xp.test.mjs |
| T4.10 | course steps come from the wheels ladder, XP unchanged | coach-steps.test.mjs |
| T4.11 | new step changes Q from next run | coach-steps.test.mjs |
| T4.12 | auto-played week still pays Study and Scout | coach-steps.test.mjs |
| T4.13 | Clinic spin leaves XP unchanged | EXCLUDED (Clinic) |
| T4.14 | (+) each job pays at its own event, no double pay on reload | coach-steps.test.mjs |
| T4.15 | (+) course cut at 19, 1 course a season | coach-steps.test.mjs |

## S5 Scout (6 tests)

| Test | Subject | Planned file |
|---|---|---|
| T5.1 | Scout week adds 1 name at the next list | coach-scout.test.mjs |
| T5.2 | other jobs add 0 | coach-scout.test.mjs |
| T5.3 | cap 2 a season | coach-scout.test.mjs |
| T5.4 | queue empties when the list is built | coach-scout.test.mjs |
| T5.5 | season rollover resets and drops unused | coach-scout.test.mjs |
| T5.6 | added name follows grade-centre rule over 1000 seeded draws | coach-scout.test.mjs |

## S6 Chips + picker (10 tests)

| Test | Subject | Planned file |
|---|---|---|
| T6.1 | one chip per coach | coach-ui.test.mjs |
| T6.2 | picker has Study and Scout rows with XP | coach-ui.test.mjs |
| T6.3 | Nets and Match greyed with reason, tappable | coach-ui.test.mjs |
| T6.4 | layouts for 3, 2, 1, 0 coaches | coach-ui.test.mjs |
| T6.5 | away chip "On course" | coach-ui.test.mjs |
| T6.6 | tap target >= 56 px | coach-ui.test.mjs |
| T6.7 | reload keeps the choice (saved job state) | coach-jobs.test.mjs |
| T6.8 | close button | coach-ui.test.mjs |
| T6.9 | (+A) job chips at least 56 px high and wide | coach-ui.test.mjs |
| T6.10 | (+M) job picker rows and close button at least 56 px | coach-ui.test.mjs |

## S7 XP bar + step-up (8 tests, T7.8 REMOVED)

| Test | Subject | Planned file |
|---|---|---|
| T7.1 | fill = xp / cost | coach-ui.test.mjs |
| T7.2 | no digits on bar, digits on long-press | coach-ui.test.mjs |
| T7.3 | MAX at S+ | coach-ui.test.mjs |
| T7.4 | card shows once | coach-ui.test.mjs |
| T7.5 | queues behind wheel, match overs, nets scene | coach-ui.test.mjs |
| T7.6 | two step-ups queue in order | coach-ui.test.mjs |
| T7.7 | reload with card pending shows once | coach-ui.test.mjs |
| T7.9 | (+) `coach.stepUpPending` survives reload | coach-ui.test.mjs |

Note: T7.8 is marked REMOVED [M] in SPEC section 12 and has no test ID to map.

## S11 Port + report (8 tests, 6 mapped)

Only the coach lines of the copy report (section 11: Jobs, XP gained, Scout names, COACHES block `mc`) are in scope.

| Test | Subject | Planned file |
|---|---|---|
| T11.1 | constants equal section 3 (coach constants only) | coach-report.test.mjs |
| T11.2 | every coach report line in order | coach-report.test.mjs |
| T11.3 | `n/a` when not applicable | coach-report.test.mjs |
| T11.4 | coach numbers match a scripted week | coach-report.test.mjs |
| T11.5 | ids only, no names | coach-report.test.mjs |
| T11.6 | gross wheel points and net gain both print | EXCLUDED (wheel line, not coach) |
| T11.7 | `mc` per match still present (COACHES block) | coach-report.test.mjs |
| T11.8 | (+A) Clinic line format | EXCLUDED (Clinic) |

## Summary

| Segment | IDs in scope | Mapped | Excluded |
|---|---|---|---|
| S1 | 9 | 9 | 0 |
| S3 | 12 | 12 | 0 |
| S4 | 15 | 14 | T4.13 |
| S5 | 6 | 6 | 0 |
| S6 | 10 | 10 | 0 |
| S7 | 8 | 8 | 0 |
| S11 | 8 | 6 | T11.6, T11.8 |
| Total | 68 | 65 | 3 |

Open points for the owner:
- T11.1, T11.2 and T11.4 also cover Clinic lines or constants in the spec. This map keeps only the coach parts for coach-report.test.mjs.
- T6.7 is placed in coach-jobs.test.mjs because it tests saved job state, not DOM. Move it if the owner prefers coach-ui.
