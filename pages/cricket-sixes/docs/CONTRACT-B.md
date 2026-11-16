# CONTRACT-B: coach weekly (jobs + XP) and Clinic (task B0.1, frozen with S0)

Sources: coach SPEC (2026-11-16-coach-weekly/SPEC.md s3-s11, wins on numbers), BUILD-PLAN v4, TASK-BOARD s1/s3/s7 (s7 split wins: **T5 = jobs + XP**, **T6 = Clinic**), SEAMS-S0 (names frozen), live code at 8e7db1f plus the S0 working tree. Repo root `pages/cricket-sixes/`.
Tags: [S] from spec, [L] read from live code, [B] decided by this contract. `OPEN-n` = needs the S0 lead or M; the default after it runs until answered.

## 1. Save keys (S0 adds the defaults in `save-migrate.js` now; VERSION stays 7)
Fill rule: after the STEPS loop in `migrate()` (next to `tidyTraining`), add each key only when absent or of the wrong type; never overwrite a present valid value; idempotent; never throws. `NewGame` (`commands.js` line ~253) writes the same defaults, so a fresh game and a migrated v7 save have the same shape [B]. Readers still treat a missing key as its default (save may come from an older build that dropped them, SPEC O1).

Per coach, on each object in `s.coaches[]` (there is NO top-level `s.coach`) [L]:
| Key | Type | Default | Clamp on read |
|---|---|---|---|
| `xp` | int >= 0, XP toward next step | 0 | NaN/neg/string -> 0; >= cost of his step -> cost-1 [B]; step 21 -> 0 |
| `xpTotal` | int >= 0, report only | 0 | bad -> 0 |
| `job` | `'nets'`,`'match'`,`'study'`,`'scout'` | `'study'` | anything else (incl. `'clinic'`) -> `'study'` |
| `jobWeek` | int weekKey of `job`, or null | null | non-int -> null |
| `stepUpPending` | int >= 0, step-up cards queued | 0 | bad -> 0 |
| `stepsXp` | int >= 0, report only | 0 | bad -> 0 |
| `stepsCourse` | int >= 0, report only | 0 | bad -> 0 |
Note [L]: v<=4 coaches had an unrelated `xp`; `STEPS[4]` (`oldCoach`) already drops it, so a migrated v4 save starts at 0. A coach signed from the scout list or a trial gets the defaults (step kept, xp 0).

Top level `s.clinic` (object) [S s9]:
| Key | Type | Default |
|---|---|---|
| `week` | int weekKey of the data below; != current weekKey -> whole block read as default | `weekKey(s)` at fill time |
| `slots` | int 0-3, coach slots on the week's first day | `MAX_COACHES` (live `CO.slots` = 3, see OPEN-6) |
| `netsDone` | bool | `s.training.netsWeek === s.training.week` [B] |
| `pending` | `{slot, coachId, playerId}` or null | null |
| `spins` | array of `{slot, coachId, playerId, spinKey, spokePaid}` | `[]` |
| `boost` | `{ [playerId]: {pcts: int[], extraRun: bool} }` | `{}` |
| `stats` | `{slices:{S,M,L,JP}, boostedGain, jackpotRuns, pointsGross, netGain}` all numbers | all 0 |
Stop data (`stopT, cycle, tInCycle, sliceId, value`) lives ONLY in `wheels.stops['clinic'][spinKey]`; careful/early/late/aimed and taps in `wheels.stats.clinic` (CONTRACT-A, `wheels.*`). `sliceId` = ring index 0-9; kind = `CLINIC_SLICE_ORDER[sliceId]`.

Top level `s.scout` (EXISTING object `{n, signed, passed}` [L]; new keys merge into it, see OPEN-1):
| Key | Type | Default |
|---|---|---|
| `bonusNames` | int 0-2, names queued for the next list | 0 |
| `extraThisSeason` | int 0-2 | 0 |

Top level `s.report.jobs` (`s.report` is new; no live key collides [L]):
`{ nets:0, match:0, wins:0, study:0, scout:0, away:0, xp:{nets:0, match:0, study:0, scout:0}, scoutNames:0, courseCut:0 }` — counts are coach-weeks per job; `scoutNames`, `courseCut` added [B] for report lines s11 ("Scout names added", "Course cut by cap").

Resets: EndWeek clears `clinic.spins/boost/pending/netsDone` and sets `clinic.week` to the new weekKey (T6 listener). Season close sets `scout.extraThisSeason = 0`, `scout.bonusNames = 0` (T5 listener). New run = fresh NewGame defaults; `carryCoach` keeps coach fields (Z6), T5 clamps on read (OPEN-7).

## 2. weekKey [S s3, L]
`weekKey(s) = s.season.n * 100 + s.training.week`; `weekKeyOf(season, week)` same math. Exported from `js/core/save-migrate.js` (S0, B1.2). `training.week` is run-cumulative, never reset per season [L] (v7 fixture: season 2, week 18 -> 218); keys still rise strictly within a run, so no collision. Across runs keys repeat, but a new run starts with a fresh `clinic` block.

## 3. Job API — T5, `js/core/coach-jobs.js` (pure, no DOM, no rng)
- `normJob(v) -> job` (unknown -> `'study'`).
- `jobOf(s, coachId) -> 'nets'|'match'|'study'|'scout'|'away'` (away = `c.away > 0`; Nets forced for `planOf(s).coachId`, else last week's nets coach on match day, as `idleCoaches` [L]).
- `legalJobs(s, coachId) -> [{job, ok, why}]` (why = row reason text for the picker).
- `defaultJob(s, coachId)` (last week's job if legal, else `'study'`; bye week -> `'study'`).
- `setJob(s, coachId, job) -> s'` (pure, returns same `s` when illegal; sets `job`, `jobWeek = weekKey(s)`).
- `jobsThisWeek(s) -> [{coachId, slot, job, locked, why}]` in `coachList` order.
- Store command `SetJob {coachId, job}` -> `setJob` (dispatch seam: OPEN-3).

## 4. XP API — T5, `js/core/coach-xp.js` (pay) and `js/core/coach-steps.js` (steps)
- Constants in `js/data/coach-weekly.js` (T5, B1.1): `COACH_JOBS`, `XP_NETS 10`, `XP_NETS_WEAK 5`, `XP_MATCH 6`, `XP_WIN_MULT 2`, `XP_STUDY 12`, `XP_SCOUT 8`, `XP_PER_STEP` (20: 74..298 step +14, then 230 x3), `XP_MAX_STEP 21`, `COURSE_MAX_STEP 19`, `COURSES_PER_SEASON 1`, `SCOUT_NAMES_PER_JOB 1`, `SCOUT_NAMES_MAX_SEASON 2`, plus the Clinic constants of s6 (OPEN-2).
- `xpToNext(step) -> int|null` (`XP_PER_STEP[step-1]`, null at 21).
- `netsXp(s, coachId) -> 10|5|0`; `matchXp(won) -> 6|12`.
- `payXp(n, coachId, amount, job)` mutates the draft: `xp`, `xpTotal`, `report.jobs.xp[job]`, then `stepLoop(c)`.
- `stepLoop(c) -> stepsGained` (while xp >= cost: step+1, `stepsXp`+1, `stepUpPending`+1; at 21 xp = 0).
- `courseCap(step, gain) -> {to, cut}` (to = min(step+gain, 19)); applied by the Course owner (OPEN-5).
- `coachWeekly(c) -> {xp, xpNeed, job, max}` read helper for VMs and slots.

## 5. Clinic — T6
- `js/core/clinic.js`: S0 stub `export function clinicReadyCount(s) { return 0; }` (int 0-3). T6 replaces the body only: count of coaches in `coachList(s)` with slot < `clinic.slots`, not away, coachId and slot not in `clinic.spins`, nets not run, >= 1 pickable player; clamp 0-3. Home dot (T7) reads only this, hidden at 0.
- Also in `clinic.js` (T6): `clinicOf(s)` (block or defaults, week-checked), `canClinic(s, slot) -> {ok, why}`, `pickable(s) -> [{playerId, ok, why}]`, `clinicSpinKey(s, slot)`. Boost + jackpot in `js/core/clinic-boost.js`: `applyBoost(n, lines)`, `jackpotRun(n)`.
- `spinKey = \`${weekKey}:${slot}\`` string, e.g. `"218:0"` [B]; `slot` = 0-based index in `coachList(s)` at spin time (OPEN-4).
- Wobble key `hash(saveSeed, season, week, 'clinic', slot, 0)` via `wheelWobble(key, J)` (CONTRACT-A).
- Boost rounding and jackpot rng: own stream `makeRng(\`${seed}|clinic|${weekKey}|${playerId}\`)` [B]; never draws from `TRAIN_RNG` (keeps nets draws and frozen vectors unchanged).
- `CLINIC_SLICES` (kinds; width = fraction, x10 into rim units on load):
  `S {label 'Small', value 5, width 0.11, count 4, tier 'bottom'}`, `M {'Medium', 10, 0.12, 2, 'middle'}`, `L {'Large', 20, 0.09, 3, 'top'}`, `JP {'Jackpot', value OPEN-8, 0.05, 1, 'top', gold true}`. Sum 1.00 (tol 1e-9), none above `SLICE_MAX_P` 0.12 (imported).
- `CLINIC_SLICE_ORDER` (rim, clockwise, index 0 = ring index 0): `['JP','S','L','S','L','M','S','L','S','M']`. Ring rows = CONTRACT-A row `{id, w, value, label, tier, gold}`.
- `CLINIC_PCT {S:5, M:10, L:20}`, `ODDS_EASY {okay:80, good:18, great:2}` + week Q, `CLINIC_SPOKES_PER_SPIN 1`.
- Store: spin via Z2 registry, file `js/store/spins/clinic.js` registering `'ClinicSpin'` (+ `ClinicPick`, `ClinicLater`; OPEN-3); STOP writes `recordStop('clinic', spinKey, rec)` + the `clinic.spins` entry + Spoke in one synchronous save.
- **PR A dependency**: the wheel screen `js/ui/wheels/clinic.js` calls T1's `openWheel(opts)` with the ring rows, pulse engine (`WHEEL_ENGINE`), `wheelWobble`, `recordStop` — all per CONTRACT-A. T6 codes against CONTRACT-A, merges main once after T1, merges after T1 and T5.

## 6. Hooks (`js/core/hooks.js`, `onHook(name, fn)`, fn(n, info) mutates draft `n`, register order)
| Event | Fired | `info` (S0 must pass) | T5 listens | T6 listens |
|---|---|---|---|---|
| `netsRun` | `runNets`, after the roll loop, before return | `{week, weekKey, plan:{focus,effort,coachId}, q, lines, trainIds, shortIds, skippedIds}` [B] | Nets XP to `plan.coachId`, `report.jobs.nets` | `netsDone = true`; boost on `lines` gains (room/cap clamp); jackpot run; `clinic.stats` |
| `matchEnd` | after `finishMatch` | `{won}` [SEAMS]; optional `mcId` [B] | Match XP to the Match coach (`mcId` else `matchCoachOf(n)`), `report.jobs.match/wins` | none |
| `endWeek` | `endWeek()` | `{week, weekKey}` of the CLOSING week [B] (listeners never read `n.training.week`) | Study/Scout XP, `bonusNames`, `report.jobs` study/scout/away, `jobWeek` | reset the clinic block |
| `seasonClose` | `closeSeason`, before carry | `{season}` [B] | reset `scout.*` | none |
Listener modules register at import: T5 `js/core/coach-hooks.js`, T6 `js/core/clinic-hooks.js` (who imports them: OPEN-3).
Gap [B]: "boosted player trains first when TP is short" needs a roster seam inside `runNets`; no hook gives it (OPEN-9).

## 7. Report lines (`js/report/lines.js`, `addReportLines(section, fn)`)
- T5 `js/report/coach.js` -> `COACHES`: `Jobs: ...`, `XP gained: ... Course cut by cap yes|no.`, `Scout names added from job: k (list / extra).`
- T6 `js/report/clinic.js` [B new file] -> `CLINIC`: `Clinic: n spun. Careful c / early e / late l. Pulse at tap: cycle k, t s.` (wheels per-wheel format; put in CLINIC, not WHEELS, because WHEELS only prints when wheel-match rows exist [L]), `Coach line, Clinic extras: ...`, `Wheel points: gross g, net gain h.`, per-spin lines. Ids only, `n/a` when not applicable.
- `fn(s)` gets `env.save` = `saveOf(state)` from `js/report/z.js`, a SUMMARY without these keys [L] (OPEN-10).

## 8. UI slots (fenced, `/* SLOT:<Name> start|end */`)
| Slot | Files | Owner | Contract |
|---|---|---|---|
| `slotJobChip(vm, coach)` | `training-view.js`, `coaches-sheet.js` | T5 | chip >= 56 px; returns `''` when `!coach \|\| !coach.id` |
| `slotXpBar(vm, coach)` | both | T5 | segmented bar, no digits; `''` when no `coach.id` |
| `slotClinicBtn(vm, coach)` | both | T6 | states ready/used+prize/nets done/on course, >= 56 px; `''` when no `coach.id` |
| `slotSpotlight`, `slotCourse` | — | T2 | not B |
Live call sites pass `vm = null` and the VM coach row (OPEN-11).

## 9. File owners
| Owner | Files |
|---|---|
| S0 | `save-migrate.js` (defaults, `weekKey`), `commands.js` (NewGame defaults, hook fire, dispatch seam), `hooks.js`, `lines.js`, `clinic.js` stub, slot fences, `normCoach`/`carryCoach` keep fields, `test/fixtures/v7-save.json` |
| T5 | `js/data/coach-weekly.js`, `js/core/coach-{jobs,xp,steps,scout,hooks}.js`, `js/ui/{coach-job-chip,job-sheet,coach-xp-bar,stepup-card}.js`, `css/coach-weekly.css`, `js/report/coach.js`, JobChip + XpBar slot bodies, `test/coach-*.test.mjs`, coach-curve parity |
| T6 | `js/core/clinic.js` (body), `js/core/clinic-{boost,hooks}.js`, `js/store/spins/clinic.js`, `js/ui/wheels/clinic.js`, `js/ui/{clinic-pick-sheet,boost-chip}.js`, `nets-scene.js` (`lineHtml`), `squad-view.js`, `css/clinic.css` [B], `js/report/clinic.js`, ClinicBtn slot bodies, `tools/clinic-parity.mjs`, `test/clinic-*.test.mjs` |
| not B | `runCourse` cap (T2), `selectors.js`/`app.js`/`index.html` (T7), `report.js` golden + `z.js` (T8), `wheels.*`, `openWheel` (T1, CONTRACT-A) |

## 10. Kept test hooks (must stay green)
- `test/s0-seams-ui.test.mjs`: each slot called `({}, {})` returns `''`; `reportLines` registry semantics; `_clearReportLines`.
- `test/wa1-train.test.mjs`: exactly 3 `class="ct-slot` per strip (new classes must not start with `ct-slot`; use `cw-` T5, `cl-` is taken by trial-card -> T6 uses `cn-`); `.ct-pick`, `.ct-course`, `.ct-all, .ct-scout` keep `min-height: 56px`; `data-ct="scout"` text.
- `test/a11y-train.test.mjs`: `.t2-cb { min-height: 56px`. `test/wa1-nets.test.mjs`: `arg && arg.scout) { openScout(` in coaches-sheet.
- `test/coach2.test.mjs`: `scoutList` deterministic and `[]` after sign/pass; `runCourse` cap 21 today. `test/v7-fixture.test.mjs`: VERSION 7, `from 7`.
- No key, string or report line contains `perk` or `bond`. No network call. Frozen vector md5s (docs/BASELINE-S0.txt) unchanged.

## 11. OPEN
1. `scout.*` merges into the live `s.scout {n, signed, passed}`, which `signCoach`/`passScout` overwrite whole [L]: S0 must change them to spread (`{...s.scout, n, signed, passed}`), else use top-level `s.scoutJob`. Also design: the list is once a season, so a name queued after sign/pass is dropped at season end.
2. `CLINIC_*` constants sit in T5's `coach-weekly.js` (B1.1) though T6 uses them: default T5 lands that file first; alternative `js/data/clinic.js` owned by T6.
3. No seam for non-spin commands (`SetJob`, `ClinicPick`, `ClinicLater`), for who imports the hook and report-line modules, for `SHEETS` in `app.js`, or for slot click handlers in `training-view.js`. Default ask: S0 adds `js/core/hooks-install.js` and a `commands.js` default case that tries `spinHandler(a.type)`.
4. Slot identity: `s.coaches` is an array and release shifts indices [L]. Default: slot = index at spin time, a used slot index or coachId cannot spin again that week.
5. Course cap 19, 1 course club-wide (SPEC) vs live 21 and 1 per coach + Licence [L]: T2 changes `runCourse`, T5 gives `courseCap`; who writes `stepsCourse` and `report.jobs.courseCut` (default T2 calls a T5 helper).
6. `COACH_SLOTS` "stadium rule, 2 then 3" is not in live code; live `CO.slots` = 3 flat [L]. Default reads `MAX_COACHES`.
7. Does XP carry into a new run (`carryCoach` caps step at 10)? Default keep xp clamped below the new step's cost, job -> `'study'`, `stepUpPending` 0.
8. Numeric `value` of the JP slice for the strict-median careful rule (must be > 10). Default 30.
9. Boosted player first in TP order needs a change inside `runNets` roster order (training.js, not B).
10. `reportLines(section, env.save)` gets the `saveOf()` summary; `z.js` must pass through `coaches`, `clinic`, `scout`, `report` (owner T8 / S0).
11. Slots get `vm = null`; the coach VM row (from `selectors.js`, T7) carries no job/xp/clinic data. Default: S0 passes the strip VM; T7 adds `coachWeekly(c)` fields to coach rows.
12. Default migration fill changes `deepEqual` round trips (`save.test.mjs` 24/124, `v5.test.mjs` 68-69, `r9-econ.test.mjs` 107): S0 updates those expectations or fills lazily on read.
13. 2-slot week where the idle coach takes Study: the +3% match boost must switch off, which lives in match code (`matchCoachOf` returns a default coach today [L]); not B-owned.

## 12. Lead calls (S0 lead, 2026-11-16, settles OPEN 1-13; FROZEN)
1. S0 changes `signCoach` / `passScout` to spread (`{...s.scout, n, signed, passed}`). `scout.*` new keys live in `s.scout`.
2. `CLINIC_*` constants go in `js/data/clinic.js`, owner T6. `coach-weekly.js` (T5) holds coach-only constants.
3. S0 adds: (a) `js/install.js`, imported once by `js/main.js`, with fenced import lines `/* INSTALL:T5 */` and `/* INSTALL:T6 */` for listener and command modules; (b) the registry is generic: `commands.js` default case runs `spinHandler(a.type)` if one is registered, so T5 registers `SetJob` in `js/store/spins/coach-job.js`, T6 `ClinicSpin`/`ClinicPick`/`ClinicLater` in `js/store/spins/clinic.js`, both imported from `install.js` (not `spins/index.js`); (c) fenced `SHEETS` entries in `js/ui/app.js` (`/* SHEETS:T5 */`, `/* SHEETS:T6 */`); (d) fenced click slot `slotClick(e, ctx)` returning false in `training-view.js` and `coaches-sheet.js` (`/* SLOT:Click:T5 */`, `/* SLOT:Click:T6 */`).
4. Clinic `spinKey = \`${weekKey}:${coachId}\``, keyed by coachId, not slot index. A coachId spins once a week; release does not shift keys.
5. Default accepted: T2 changes `runCourse`, calls T5's `courseCap(s, coach)` (T5 exports it in its first wave, T2 stubs until then).
6. Default accepted: read `MAX_COACHES`.
7. Default accepted (xp clamped under the new step cost, job `'study'`, `stepUpPending` 0).
8. Default accepted: JP slice value 30.
9. S0 adds `pipeHook(name, value, n, info)` to `js/core/hooks.js` (returns value unchanged with no listeners), fired as `netsOrder` on the trainee id list inside `runNets`. T6 adds the listener.
10. Done in S0: `reportLines(section, env.state)` gets the full state.
11. Done in S0: slots get `(vm, coach)`. T7 adds coach-weekly fields to coach VM rows (message T7 for the field list).
12. Migration fills defaults on load, and `NewGame` writes the same defaults (S0). Round-trip tests get their expectations updated to include the defaults, not weakened.
13. Match-boost switch-off is match code: T5 messages T1.
