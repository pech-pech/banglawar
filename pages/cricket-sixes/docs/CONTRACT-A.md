# CONTRACT-A: shared wheel engine + 8 wheels (task A0.1, 2026-11-16)
Base `origin/main` 8e7db1f, branch `claude/project-thread-gokipd` (S0 work in tree: `js/ui/wheels/*` split, Z4/Z5 edits). Sources: TASK-BOARD 1, 2, 7 (7 wins), SEAMS-S0, wheels SPEC 2, 13, 16. Frozen when S0 posts; changes via S0 lead (T1 lead after S0 closes), messaged to all threads.
Tags: [V] exists in live code (path + name checked) · [N] new file, folder exists, name free · [P] still provisional · OPEN = needs lead call, do not guess.

## 1. Module paths (TASK-BOARD 2 [P] paths checked; section 7 file split wins)
| Path | What | Tag |
|---|---|---|
| `js/data/wheel-engine.js` | `WHEEL_ENGINE`, `WHEEL_STOP_IDS` (10 ids, sec 6) | [N] |
| `js/core/wheel-pulse.js` | `pulseW`, `pulseArc`, `tickAt`, `ARC_PER_CYCLE(P)`, `cycleOf` | [N] |
| `js/core/wheel-ring.js` | width cap 0.12 splitter, equal-neighbour check, widen clamp 0.13 | [N] |
| `js/core/wheel-wobble.js` | `wobbleKey`, `wheelWobble` | [N] |
| `js/core/wheel-stops.js` | `recordStop`, `spinKeyOf`, `statsOf`, `normWheels` (S0, with save keys) | [N] |
| `js/core/save-migrate.js` | calls `normWheels` in `migrate()` after the step loop; `VERSION` stays 7 | [V] |
| `js/ui/wheel-view.js` / `js/ui/wheel-look.js` | `openWheel(o)` [V] / look helpers [V]; T1 rewrites both | [V] |
| `css/wheel-shared.css` + one `<link>` in `index.html` after `css/training2.css` | glow, AIM, legend, tier shapes | [N] |
| `js/core/wheelmatch.js`, `js/data/wheelmatch.js`, `js/core/landtick.js` | match core; `stopBucket`/`landingPos`/`glidePos` call shapes kept | [V] |
| `js/ui/wheelmatch-view.js`, `js/ui/wheelmatch-settings.js`, `js/store/wheelmatch-store.js`, `css/wheelmatch.css` | match view | [V] |
| `js/data/wheel-slices-train.js` (T2: `SPOT_SLICES`, `COURSE_SLICES`) | replaces board's `wheel-slices-skill.js` | [N] |
| T3/T4 slice tables (`HYPE_SLICES`, `TOSS_SLICES`, `PEP_SLICES`, `FIND_SLICES`, `SCOUT_SLICES`, `FINALS_SLICES`) | board's `wheel-slices-reveal.js` is one shared file = clash. OPEN: proposed `js/data/wheels/<wheel>.js`, one per wheel | [P] |
| `js/core/find-aim.js` (T4), `js/core/wheel-perks.js` (Kind Floor T2, Warm Crowd T3; OPEN: one shared file, two threads) | | [N] |
| `js/ui/wheels/{hype,toss,pep,find,scout,finals,shared}.js`; `js/ui/wm-spins.js` = barrel | S0 A2.8, in tree, uncommitted | [V] |
| `js/core/wheels/{common,hype,find,reveal,toss,pep,scout,finals}.js`; `js/store/wheels/{common,md,hype,toss,pep,find,scout,finals}.js` | SEAMS Z1; `dialreel.js`, `wmstore.js` become barrels | [N] |
| `js/store/spin-registry.js`, `js/store/spins/{index,spin,course,hype,toss,pep,find,scout,finals,match}.js` | Z2. OPEN: `find`/`PickActivity` file name | [N] |
| `js/core/hooks.js` (Z3), `js/report/lines.js` (Z4), `js/core/clinic.js` (Z6) | note: `js/report/hooks.js` [V] already exists and is grepped by 4 tests; do not confuse | [N] |
| `js/report/wheels.js` (T8 W line), `tools/wheels-parity.mjs`, `test/wheel-bands.test.mjs`, `test/wheel-pulse.test.mjs`, `test/wheel-tick.test.mjs`, `test/e2e/wheels.mjs` | `tools/`, `test/e2e/` exist | [N] |
| View hosts: `openSpotlightWheel` in `js/ui/training-view.js`, `startCourse` in `js/ui/coaches-sheet.js` (defined there) | | [V] |
| `spinFind`/`spinScout`/`spinFinals`: DEFINED in `js/ui/wheels/{find,scout,finals}.js`; only CALLED from `activities-view.js`, `coachpick-view.js`, `result-view.js` (board said defined there) | corrected | [V] |
| `js/ui/dial-view.js` (Hype `openDial`), `js/ui/reel-view.js` (Toss/Pep/Scout/Finals `openReel`) | used today; no owner in 7b. OPEN: keep frozen until T3/T4 move to `openWheel`, T8 deletes | [V] |
| `test/fixtures/v7-save.json`, `test/_v7-fixture.mjs` (S0); `tools/make-v7-fixture.mjs` already exists | | [N]/[V] |

## 2. `WHEEL_ENGINE` (SPEC port 1), `js/data/wheel-engine.js`, `Object.freeze`
`{ W0: 36, TAU: 3.0, D: 2.0, J: 1.2, CIRC: 10, SLICE_MAX_P: 0.12, SLICE_WIDEN_MAX: 0.13, PULSE_PERIOD: 6.0, PULSE_FROM: 3.8, GLOW: [3.2, 3.8], STOP_GUARD_S: 0.35 }`
- Per-wheel J is a field of the wheel's data (Find `J: 1.5`), not a second engine key. Control (from `wheelmeta.js`, T1): Slow `W0 x (1 - 0.15 x rank)`, 0.55 at 3 ranks (also scales the ramp peak, i.e. W0 everywhere in sec 3); Steady `J x 0.85^rank`, 0.7225 at 2 ranks; Guide = draw band only.
- `ARC_PER_CYCLE` is NOT a key: computed by `ARC_PER_CYCLE(P)` (128.327 at W0 36). Never hard-code 128.3/128.4.
- Retired on all 8 wheels + match: COAST, STOP_FROM (1 s), auto-stop, skip, reduced-motion path, "Auto over", `timingBucket` 'o' / "Coasted".
- Training physics today `TRAIN2.wheelStop` = W0 24, D 1, J 0.6, COAST 6 [V] (`js/data/training.js`): Spotlight and Course move to the engine numbers (W0 36, D 2, J 1.2) in T2.

## 3. Pulse API, `js/core/wheel-pulse.js` (pure; `P` = phys `{W0, D}`, default `WHEEL_ENGINE`)
- `pulseW(t, P?) -> units/s`, t in 0..6 (cycle time): t<3.8 `W0*exp(-t/3)`; else `x=(t-3.8)/2.2, s=x*x*(3-2x), w38 + (W0-w38)*s`, `w38 = W0*exp(-3.8/3)` (0.28177 W0).
- `pulseArc(t, P?) -> units` within one cycle: t<3.8 `W0*3*(1-exp(-t/3))`; else `decay(3.8) + w38*u + (W0-w38)*2.2*(x^3 - x^4/2)`, `u=t-3.8`.
- `ARC_PER_CYCLE(P?) = W0*3*(1-exp(-3.8/3)) + 2.2*(w38 + (W0-w38)/2)`.
- `tickAt(elapsed, P?) -> units, unwrapped, monotonic`: `k=floor(elapsed/6), t=elapsed-6k`; `k*ARC_PER_CYCLE(P) + pulseArc(t,P) + pulseW(t,P)*D/3`. Landing = `phi + tickAt(stopS) + wobble`, mod ring C (J = 0 gives the tick slice: test 7).
- `cycleOf(elapsed) -> {cycle (from 1), tInCycle}`. Clock: `elapsed = (performance.now() - spinTs)/1000`; STOP time from `event.timeStamp`; never integrate frames.
- Wobble, `js/core/wheel-wobble.js`: `wobbleKey(s, wheelId, spinIndex, respin) -> string` = `` `${s.seed}|wob|${season}|${week}|${wheelId}|${spinIndex}|${respin}` ``; `wheelWobble(key, J) -> number in [-J, +J]` = `(makeRng(key).random()*2-1)*J` (fresh `makeRng` from `js/core/rng.js` [V]; never the ball rng). spinIndex: match = ball no.; match-day wheels 0-2; Clinic = slot. OPEN: `week` accessor (season = `s.season.n`, default 1 [V]).

## 4. `openWheel(o)` -> `close()` (`js/ui/wheel-view.js`, T1)
Kept options [V today]: `title, sub?, cardHtml, pending, onSpin(stop), onTick?, getPending(), describe(p), onCollect(), collectLabel?, onClose?, phys?{W0,J,SD}, zone?, chime?, guide?, tokens?, getTokens?(), onToken(kind), spokeGain?(), labels?, aims?, plainResult?, jpText?, tokName?, outcome?(kind,before,after), look?, golds?`.
New: `wheelId` (one of sec 6 ids), `spinKey` (from `spinKeyOf`), `ring: SliceRow[]` (sec 5; replaces `slices/jackpotIndex/widths/plus`, which stay accepted until T2/T4 move off, then T8 drops them), `J` (wheel J before Steady), `wobKey` (from `wobbleKey`), `stored?` (the `wheels.stops` entry: opens on its result, never re-spins), `legend?: [{ch, text}]` (under-7% letters).
- `onSpin(stop)` stays the one STOP callback (name grepped). `stop = {t, phi, e, stopT, cycle, tInCycle, sliceId, respin}`; t s since SPIN, stopT ms, e = `wheelWobble(wobKey, J*steady)`. Host dispatches it synchronously; the spin handler calls `recordStop` before the view starts the result animation.
- Dropped: `timing` (glow is always on), reduced-motion branch, game tap at COAST. STOP ignored for 0.35 s after each SPIN; SPIN/STOP double tap = one.

## 5. Slice row `{id, w, value, label, tier, gold}` (every ring, all 8 wheels + Clinic)
`id` int ring index = `sliceId` · `w` rim units (% / 10; ring sums 10.000 +-0.001; Clinic 0.11 fractions x10 on load) · `value` number (one per slice; Spotlight multiplier, Course steps, Hype points, Toss %, Pep %, Scout cards, Finals coin-eq / paid; Find 1 FIND, 0 CHEER) · `label` printed text (w < 0.7: exactly one char or signed number, e.g. "F", "M", "+2", "1.2") · `tier` `'top'|'mid'|'low'` (top > wheel median of sec 13 table, low = wheel's lowest value; Find FIND top, CHEER mid) · `gold` bool. Extra keys allowed; the engine reads only these six.

## 6. Save keys (SPEC 13). S0 adds via `normWheels(s)` in `save-migrate.js` `migrate()` and new-run creation. No VERSION bump, never throws, old fields byte-equal.
| Key | Type | Default written | Read default |
|---|---|---|---|
| `wheels` | object | `{stops:{}, pepRingOffset:{}, pepSlot:{}, scoutCards:{}, stats:{}}` (any missing/non-object sub-key filled, present ones untouched) | same |
| `wheels.stops[wheelId][spinKey]` | `{stops:StopRec[], kept, spent}` | none | absent = unspun |
| StopRec | `{stopT:int ms, cycle:int>=1, tInCycle:number s, sliceId:int, value:number, paid?:number (Finals), auto:bool, respin:0/1}` | | |
| `.kept` / `.spent` | int index into `stops` (OPEN: SPEC gives no type) / bool, `true` written at once on Spin Again / Pick Two press | | 0 / false |
| `wheels.pepRingOffset[matchDayId]` | int 0-5 | none | 0 |
| `wheels.pepSlot[matchDayId]` | int 1-6, never a player id | none | none (unspun) |
| `wheels.scoutCards[seasonId]` | `[{grade, surname, focus}]` | none | regenerated from season seed |
| `wheels.stats[wheelId]` | `{n, careful, early, late, taps:[{cycle, tInCycle}]}`, taps last 200 | none | `{n:0,careful:0,early:0,late:0,taps:[]}` via `statsOf` |
| `wheelMeta.tokUsed` / `wheelMeta.matchTokUsed` | existing [V], NOT top-level as SPEC implies: `{[wheelId]:int}` / `{key:'', n:0}`; Hype cap reads `tokUsed.hype` | unchanged | `{}` / `{key:'',n:0}` |
`wheelId` in `WHEEL_STOP_IDS` = spot, course, find, hype, toss, pep, scout, finals, match, clinic (`WHEEL_IDS` [V] in `js/data/wheelmeta.js` keeps its 8, token use). v7 pre-drawn Toss/Pep results honoured; Pep stored as player id read as that player. OPEN: `emptyWheelMeta()` [V] lacks `tokUsed`/`matchTokUsed` that `freshMeta` has; S0 leaves it (vectors).

## 7. `recordStop` (`js/core/wheel-stops.js`, S0)
- Correction: board's `recordStop(wheelId, spinKey, rec)` has no state. Contract: `recordStop(n, wheelId, spinKey, rec) -> n`, mutates the reducer draft `n` in place (same rule as Z3 hooks), called inside the spin handler in the same `dispatch` as STOP.
- `rec = StopRec` (sec 6) plus optional `{kept?, spent?}`: appends to `.stops`, sets `kept` (Spin Again keeps higher value, tie keeps first), bumps `wheels.stats[wheelId]` (n always; careful/early/late skipped when `auto`; taps capped 200). Careful = `value > median` (Find: FIND block); early t<3.2, late t>3.8, cycle from 1.
- `spinKeyOf(s, wheelId, ctx) -> string`: match `matchKeyOf(s)` [V wheelmeta.js] + `|` + ball; toss/pep/hype matchDayId; scout/finals seasonId; spot/course/find occasion id; clinic weekKey+slot. OPEN: matchDayId, seasonId and Spot/Course/Find occasion accessors (none found by name).

## 8. `WHEEL_MATCH` alias (`js/data/wheelmatch.js` [V], one build, then dropped)
`WHEEL_MATCH = Object.freeze({ ...MATCH_ONLY, ...WHEEL_ENGINE })`: shared keys (W0, TAU, D, J, CIRC, SLICE_MAX_P, GLOW) read from `WHEEL_ENGINE`; `GLOW_LO/GLOW_HI` kept = `GLOW[0]/GLOW[1]`; match-only keys kept (K_SEG, MIN_P, RESERVE_MIN, N_SAMP, HIGH_TAIL_Q, WK_VAL_*, GLOW_BEAT(S), SD_*, SLOW_PER_RANK, SLOW_FULL, STEADY_FULL, STEADY_CAP); `COAST` and `STOP_FROM` removed. OPEN: lead to confirm superset (a strict `=== WHEEL_ENGINE` alias would drop K_SEG etc. and break the match core).

## 9. File owners (a thread writes only its rows; else message the owner)
| Thread | Writes |
|---|---|
| S0 | 3 contracts; `save-migrate.js`, `wheel-stops.js`, v7 fixture + `_v7-fixture.mjs`, `docs/BASELINE-A.txt`; `wm-spins.js` + `js/ui/wheels/*` split; Z1 `dialreel.js`, `wmstore.js`, `js/core/wheels/*`, `js/store/wheels/*`; Z2 `commands.js`, `spin-registry.js`, `js/store/spins/*`; Z3 `hooks.js`, `training.js`, `run.js`; Z4 `report.js`, `lines.js`; Z5 `training-view.js`, `coaches-sheet.js` (slot fences); Z6 `clinic.js`. After S0 the per-wheel files pass to their wheel thread. |
| T1 | `wheel-engine.js`, `wheel-pulse.js`, `wheel-ring.js`, `wheel-wobble.js`, `wheel-view.js`, `wheel-look.js`, `css/wheel-shared.css` + its link, `wheelmeta.js` (Control values only), `wheelmatch*.js` (core, data, view, settings, store), `landtick.js`, `css/wheelmatch.css`, `spins/match.js`, `js/core/wheels/reveal.js` + `common.js` (frozen, change by message), `tools/wheels-parity.mjs`, pulse/tick/bands tests |
| T2 | `training.js` (wheel functions only), `data/training.js`, `wheel-slices-train.js`, `slotSpotlight` (training-view), `slotCourse` (coaches-sheet), `spins/{spin,course}.js`, Kind Floor in `wheel-perks.js` |
| T3 | `js/core/wheels/{hype,toss,pep}.js`, `js/store/wheels/{hype,toss,pep,md}.js`, `js/ui/wheels/{hype,toss,pep}.js`, `spins/{hype,toss,pep}.js`, `matchday-view.js`, own slice data, Warm Crowd |
| T4 | `js/core/wheels/{find,scout,finals}.js`, `js/store/wheels/{find,scout,finals}.js`, `js/ui/wheels/{find,scout,finals}.js`, `spins/{find,scout,finals}.js`, `find-aim.js`, `activities-view.js`, `coachpick-view.js`, `result-view.js`, own slice data |
| T5 | `coach-*.js`, `data/coach-weekly.js`, `slotJobChip`/`slotXpBar` in both views, `js/report/coach.js` |
| T6 | `clinic*.js` (body of `clinicReadyCount`), `js/ui/wheels/clinic.js`, `clinic-pick-sheet.js`, `boost-chip.js`, `nets-scene.js`, `squad-view.js`, `slotClinicBtn` |
| T7 | `hub-view.js`, `hub.css`, `ground-canvas.js`, `week-sheet.js`, `selectors.js` (home VMs), `app.js` |
| T8 | `wheelmeta.js` + `data/wheelmeta.js` tokens, `wmstore.js` tokens (`tokSrc`, `canWmToken`, `wmTokens`, `wmUseToken`), `report.js` golden, `js/report/{wheels,wmatch}.js`, `build.js`, `test/e2e/wheels.mjs`, delete `dial-view.js`/`reel-view.js` |
OPEN: `shared.js` (`js/ui/wheels/`), `dial-view.js`, `reel-view.js`, `css/dialreel.css`, `css/training2.css` (holds `.wh-go.is-window`) have no named owner after S0; proposed T1.

## 10. Test hooks that tests grep (keep the string or edit the test in the same PR)
KEEP: `test/tick.test.mjs`: `tickKind(` in wheel-view, reel-view, dial-view; `wh-tk`; `[TICK.PLAIN_PX / 2 + 1, '#fff'], [TICK.PLAIN_PX / 2, 'rgb(' + pal.out`; `speed > 8 && !isG(i)` and `speed > 8 && !GD.includes(i)`; "The tick shows where it will land." in wheel-view, wheels/find, training-view, coaches-sheet. `test/wm-fix2.test.mjs`: exports `goldNearPointer`, `chimeEnters`; `releaseInert(app)` in wheel-view, dial-view, tierup-card, workshop-view, nets-scene, sheet; `afterResult(n, 'spot'|'course', result, WM_RNG(..), { wheel })` in commands.js (Z2 move must keep or repoint). `test/a11y-train.test.mjs`: wheel-view `setAttribute('aria-modal', 'true')`, `e.key === 'Escape'`, `e.key === 'Tab'`, `aria-live="polite"`, `o.onSpin(`; no bare `ico(`. `test/wm-ui.test.mjs`: `tk !== 'none' && state === 'spin'`, `guide: !!o.guide`, `o.phys`, `LK = normLook(o.look)`. `test/wa2-timing.test.mjs`: `go.classList.toggle('is-window', inW)`, `go.classList.remove('is-window')`, css `.wh-ov .wh-go.is-window { outline: 4px solid var(--gold)` (= STOP glow, keep), no `timing:` in wheels/find. `test/wm-w2-fix.test.mjs`: strings 'Toss the coin.', 'Who gets the pep talk?', 'Stop on a gold block to find Coins, a player or a coach.', 'What do the scouts bring?', 'Spin for your prize.' across `js/ui/wheels/*`; 'Find chance about', 'Good timing helps' in activities-view. `test/wa1-reel.test.mjs`: `tokText: (p) => scoutWords(p).short` (wheels/scout), `tokText: finalsWords` (wheels/finals). `test/a11y-wheelmatch.test.mjs`: `data-wm="stop-auto"><span>Stop auto</span>`, `aria-label', 'Stop the wheel'`, glyph/stars/`'Ball ' + (i + 1)` lines, css `.wm [hidden] { display: none !important`. `test/wheelmatch-ui.test.mjs`: exports `ballDelay, ballTimes, glowPhase, labelPlan, autoPace, autoStopWhy, glidePlan, wrapHalf, endMark, overWords, labelText, sliceText, landedText`; `glowPhase` body has no `segs|tone|seg`. Classes: `wh-ov wh-go wh-tk wh-cv wh-lab is-jp wh-res wh-tok wh-tim`, `t2-ov`, `wm`, `wm-auto`.
RETIRE (SPEC removes; owner edits test in same PR): wa2-timing `TIMING_WIN, timingBucket, TIMING_LINE` import, `const TIMING = !!o.timing`, `stop(WS.COAST, true)`, `function stop(t, coasted)`, `openWheel({ timing: true,` (T1+T2); a11y-train `prefers-reduced-motion: reduce` in wheel-view (T1); wm-ui `carefulTapTime(WO, ph, 1 - Math.random(), ...)` reduced-motion tap (T1); a11y-wheelmatch `aria-label="Skip to the end of the over"` and `data-wm="auto-over"` "Auto over" (T1); `coast ${...}` in `js/report/wmatch.js` `wheelLine` and `report.js` W line (T8). `coastCount` not found in live code (nothing to remove). Tests touching COAST/reduced: wheelmatch-core, -parity, -report, r9-wheel, r9-uimd, wm-dialreel-ui, beats, book-p6, econ-ui (each owner checks).
Gate: `node --test test/*.test.mjs` = 997 / 996 pass / 1 skip after S0; frozen ball and match vectors md5 unchanged in every thread.

## Lead calls (S0 lead, 2026-11-16, settles every OPEN above; FROZEN)
1. Slice tables: one file per wheel, `js/data/wheels/<wheel>.js` (spot, course, hype, toss, pep, find, scout, finals). Owner = that wheel's thread. No shared `wheel-slices-*.js`.
2. Perks: no shared `wheel-perks.js`. Kind Floor = `js/core/perks/kind-floor.js` (T2), Warm Crowd = `js/core/perks/warm-crowd.js` (T3), widening ceiling stays in `js/core/wheel-ring.js` (T1).
3. Spin files as built by Z2: `js/store/spins/{index,spot,course,hype,toss,pep,scout,finals,find,match}.js`. `Spin` = `spot.js`, `PickActivity` find part = `find.js`. `index.js` owner S0 then T1 (adding a type = message T1).
4. `dial-view.js`, `reel-view.js`, `css/dialreel.css`: frozen, kept working until T3/T4 move to `openWheel`; T8 deletes. `js/ui/wheels/shared.js`, `css/training2.css`: owner T1; T2-T4 message T1 for changes.
5. Key accessors: new `js/core/spin-keys.js` (owner T1, written in T1's first wave, pure): `seasonOf(s)` = `s.season.n` default 1, `weekOf(s)`, `matchDayIdOf(s)`, `seasonIdOf(s)`, `occasionIdOf(s, wheelId)`. `weekKey(s)` lives in `js/core/week-key.js` (S0, CONTRACT-B). Until T1 lands, T2-T4 import them by name and stub in tests.
6. `.kept`: int index into `stops`, default 0, as in the table. `.spent` bool.
7. `emptyWheelMeta()` stays as is (vectors). `tokUsed` / `matchTokUsed` stay under `wheelMeta`.
8. `WHEEL_MATCH` = SUPERSET as written (`{ ...MATCH_ONLY, ...WHEEL_ENGINE }`, COAST and STOP_FROM gone). Confirmed.
9. `recordStop(n, wheelId, spinKey, rec)` (draft first) accepted.
10. Tests that grep strings the SPEC removes are edited by the owner of that change in the same PR, never weakened.
11. `js/core/hooks.js` (game events, Z3) is not `js/report/hooks.js` (report wiring). Do not merge or rename either.
12. `normWheels(s)` lives in `js/core/save-migrate.js` (S0). T1 creates `js/core/wheel-stops.js` and re-exports it from there; do not move it.
