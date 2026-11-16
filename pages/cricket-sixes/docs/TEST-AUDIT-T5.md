# TEST-AUDIT-T5: TEST-MAP-T5 IDs vs test/coach-*.test.mjs

Method: grep of the ID string in test/coach-*.test.mjs (plus subject check). Line numbers are the `test(` line.
Notes: the planned file coach-ui.test.mjs was never created; UI IDs live in coach-chip, coach-jobsheet, coach-xpbar, coach-stepup, coach-a11y. coach-hooks.test.mjs labels its nets/match tests T4.2/T4.4 (SPEC numbering differs from the map); matched by subject below.

| ID | Result | Note |
|---|---|---|
| T1.1 | test/coach-weekly-const.test.mjs:9 | |
| T1.2-T1.5 | OUT OF SCOPE | wheel slice constants, not coach (wheel owner) |
| T1.6 | test/coach-weekly-const.test.mjs:16 | |
| T1.7 | test/coach-weekly-const.test.mjs:27 | |
| T1.8 | OUT OF SCOPE | Clinic constants |
| T1.9 | test/coach-weekly-const.test.mjs:32 | |
| T3.1 | test/coach-jobs.test.mjs:10 | |
| T3.2 | test/coach-jobs.test.mjs:15 | |
| T3.3 | test/coach-jobs.test.mjs:20 | |
| T3.4 | test/coach-jobs.test.mjs:26 | |
| T3.5 | test/coach-jobs.test.mjs:31 | |
| T3.6 | test/coach-jobs.test.mjs:37 | |
| T3.7 | test/coach-jobs.test.mjs:43 | |
| T3.8 | test/coach-jobs.test.mjs:50 | |
| T3.9 | test/coach-jobs.test.mjs:56 | |
| T3.10 | test/coach-jobs.test.mjs:62 | |
| T3.11 | test/coach-jobs.test.mjs:68 | |
| T3.12 | test/coach-jobs.test.mjs:74 | |
| T4.1 | test/coach-xp.test.mjs:8 | also coach-hooks.test.mjs:12 (labelled T4.2) |
| T4.2 | test/coach-hooks.test.mjs:20 | jackpot pays 0 |
| T4.3 | test/coach-xp.test.mjs:20 | also coach-hooks.test.mjs:27 (labelled T4.4) |
| T4.4 | test/coach-xp.test.mjs:21 | bye pays 0 (weak: verify subject) |
| T4.5 | test/coach-steps.test.mjs:23 | |
| T4.6 | test/coach-steps.test.mjs:49 | |
| T4.7 | test/coach-xp.test.mjs:26 | |
| T4.8 | test/coach-xp.test.mjs:31 | |
| T4.9 | test/coach-xp.test.mjs:37 | |
| T4.10 | test/coach-steps.test.mjs:64 | |
| T4.11 | MISSING | new step changes Q from next run: no test |
| T4.12 | test/coach-hooks.test.mjs:45 | endWeek hook pays Study/Scout; an auto-played-week case is not separately tested |
| T4.13 | test/coach-steps.test.mjs:71 | covered although the map excluded it as Clinic |
| T4.14 | MISSING | only "double install does not double pay" (coach-hooks.test.mjs); no reload / same-event repay test |
| T4.15 | test/coach-steps.test.mjs:80 | also :88, :94 |
| T5.1 | test/coach-scout.test.mjs:9 | |
| T5.2 | test/coach-scout.test.mjs:13 | |
| T5.3 | test/coach-scout.test.mjs:18 | |
| T5.4 | test/coach-scout.test.mjs:23 | |
| T5.5 | test/coach-scout.test.mjs:30 | |
| T5.6 | test/coach-scout.test.mjs:39 | |
| T6.1 | test/coach-chip.test.mjs:10 | also coach-jobsheet.test.mjs:33 |
| T6.2 | test/coach-jobsheet.test.mjs:14 | |
| T6.3 | test/coach-jobsheet.test.mjs:21 | |
| T6.4 | MISSING | layouts for 3/2/1/0 coaches: no test |
| T6.5 | test/coach-chip.test.mjs:35 | On course chip (the ID string at :21 is the CSS 56px test) |
| T6.6 | test/coach-chip.test.mjs:21 | 56px taps; ID string sits on :29 |
| T6.7 | test/coach-store.test.mjs:24 | |
| T6.8 | test/coach-jobsheet.test.mjs:28 | |
| T6.9 | test/coach-a11y.test.mjs:23 | equivalent (no ID string): interactive classes min-height 56px |
| T6.10 | test/coach-jobsheet.test.mjs:33 | |
| T7.1 | test/coach-xpbar.test.mjs:6 | |
| T7.2 | test/coach-xpbar.test.mjs:13 | |
| T7.3 | test/coach-xpbar.test.mjs:19 | |
| T7.4 | test/coach-stepup.test.mjs:11 | |
| T7.5 | test/coach-stepup.test.mjs:22 | |
| T7.6 | test/coach-stepup.test.mjs:29 | |
| T7.7 | test/coach-stepup.test.mjs:39 | |
| T7.9 | test/coach-stepup.test.mjs:45 | |
| T11.1 | MISSING | coach constants vs section 3 only covered by T1.9 in the const file |
| T11.2 | test/coach-report.test.mjs:8 | |
| T11.3 | test/coach-report.test.mjs:17 | |
| T11.4 | MISSING | scripted-week report numbers |
| T11.5 | test/coach-report.test.mjs:29 | |
| T11.6 | OUT OF SCOPE | wheel line |
| T11.7 | MISSING | `mc` per match in the COACHES block |
| T11.8 | OUT OF SCOPE | Clinic line |

Totals (68 IDs): covered 55, MISSING 6 (T4.11, T4.14, T6.4, T11.1, T11.4, T11.7), out of scope 7 (T1.2-T1.5, T1.8, T11.6, T11.8).

Soak (T12.8): test/coach-soak.test.mjs. Finding: payXp clamps xp only when it pays, so a corrupt xp on a coach no hook pays stays corrupt until load; the soak accepts that (load-time clamp belongs to save-migrate).
