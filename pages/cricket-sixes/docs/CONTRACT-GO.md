# CONTRACT-GO: Golden Over (A1 Captain's Over) in wheel match mode

Lead: plans/merges only. Helpers own the files listed for them; anything else = message lead ("contract unclear"), never guess.
Branch `claude/project-thread-hojcho` off main 3b89fce. Baseline gate: `node --test test/*.test.mjs` = 1773 / 1771 pass / 2 skip.
Frozen: ball + match vectors (test/ball-vectors*.json, determinism tests) must stay byte-identical with Golden Over unused.
Reference prototype (rule + look): /tmp/claude-0/ref/proto.html (branch claude/project-thread-sybh5v pages/golden-over-proto/index.html), mode A1.
Design docs: /mnt/project-files/games-design/cricket-sixes/2026-11-17-tap-minigame/ (HANDOFF "UPDATE 2026-11-18" ticket points 1-9, CHECK-ux.md, CHECK-systems.md).

## 1. Feature (M's spec)
- Wheel match mode only. Once per innings (innings 1 = M bowls, innings 2 = M chases) M may swap ONE over for a hand-played over: six timing taps.
- Offered on the over pick screen (before the wheel shows that over): button "Captain's Over" (56 px) next to Go/Spin. Skip = do nothing, wheel over as now.
- Tapping it locks it: that over is golden, cannot be undone; the wheel is never shown for it. Not offered once used that innings, or while Auto runs.
- Bowling side: M's bowler is chosen as for a wheel over (legal bowlers), then Captain's Over.

## 2. Rule A1 (constants ONLY in js/data/golden-over.js, export `GOLDEN`)
- Windows ms (Perfect, Good): Wide [80,170], Mid [55,120] (DEFAULT), Tight [40,90]. `WINDOW: 'Mid'`.
- Letter widens the window: mult = 0.75 + (step-1)/20 * 0.625 (step 1..21 from js/core/letters.js stepOfRaw; F- .75 ... S+ 1.375; admin default, matches proto F .75 / C 1 / S 1.375). Batting = striker's bat raw rating; bowling = M's bowler's bowl raw rating. Round to whole ms.
- Grade: |err| <= p -> 'P'; <= g -> 'G'; else 'M'. err = tapTime - crossTime - calibration offset (ms).
- Per ball ALWAYS draw exactly `ROLLS: 3` x values from the over rng (fixed consumption => earlier balls never change).
  P = best of all 3 (by value for M) then floor; G = x[0]; M = worse of x[0], x[1].
  Value for M batting: W=-6, else runs. M bowling: W=+6, else -runs.
  Floor: batting Perfect never 0 or W -> 1; bowling Perfect never 4 or 6 -> 2.
- Run-in, beat and look: copy the proto A1 timings (ball travel, 3-beat tick at 800/400/0 ms before cross).
- Calibration: 10 taps on a steady beat at first use (and from a "Recalibrate" link); median error = offset, stored in save.

## 3. Engine + store (Helper ENGINE owns)
Files: js/data/golden-over.js (new), js/core/golden-over.js (new, pure, no DOM/Math.random/clock), js/core/match.js (ONE hook only),
js/store/spins/golden.js (new), command registration where WheelOver is registered, js/store/selectors.js (goldenVM only),
js/core/save-migrate.js (VERSION 7 -> 8 + migration, never downgrade), js/report/log.js, js/report/report.js, new tests test/golden-*.test.mjs.
- match.js hook: in playOver ball loop `const x = opts && opts.pickX ? opts.pickX(pr, rng) : rng.random();` nothing else changes.
- core/golden-over.js exports: `windowFor(rawRating, wset?) -> {p,g}`, `gradeOf(errMs, win) -> 'P'|'G'|'M'`, `pickX(grade, side)` factory
  -> (pr, rng) => x (uses outcomeFromX), `previewBalls(s, grades[]) -> ball recs` (clone, unknown grades = 'G', returns first grades.length balls).
- Over rng seed: `${s.seed}|gold|${stage}|${over}`. Same fx/centre/pairing/roar/rival boost as replayOver (reuse its option path).
- State in save: `s.golden = { inn1: null | {over, bowler, taps:[{e, g}], done:false}, inn2: ... }` (reset per match);
  `s.goldCal = { offset: number, n: number } | null` (kept across matches). Migration v7 -> v8 adds both as null.
- Commands: `GoldenStart {bowler?}` (locks; rejects if used/illegal/not pick phase) ; `GoldenTap {err}` (err = raw ms tap minus cross; store
  subtracts offset, grades with current striker/bowler letter, pushes tap, saves at once; on the 6th tap or innings end it commits the
  over exactly like wheelOver's tail: n.last {balls, over, bowler, golden:true, taps}, markRoar, countBook, stage changes; inn.overs[last].gold = true)
  ; `GoldenCal {offset, n}`. Each returns the new state; reload mid-over resumes at the next tap with the same results (no re-roll).
- goldenVM(s): {available, active, side, over, taps:[{g, ball}], win:{p,g}, offset, calibrated, needCal, wheelAvg (model expect xr)}.
- Log + report: one line per Golden Over e.g. `Captain's Over inn2 ov7: P P G M P P | runs 14 wk 0 | wheel avg 7.3 | offset +12 ms | win 55/120`.
  Copy report gets a "Captain's Over" block (taps, mean |err|, grade counts per over, offset).

## 4. View (Helper UI owns)
Files: js/ui/golden-over-view.js (new), css/golden-over.css (new + link in index.html), img/golden/* (sprites), js/ui/wheelmatch-view.js
(button + hand-off only), js/ui/over-panel.js + any over-history circle renderer (gold ring), sw.js cache list, e2e test/e2e/golden-over.mjs.
- Canvas top-down pitch in S1 pixel art: ground R2-D-ground.png + cut-r3 sprites (one scale for all figures; never mix R2/R3 sprites);
  sprite band, trail, shadows, run frames as proto. Convert to webp, total img/golden <= 400 KB.
- Layout per M: NO reserved text row ("Ball 1 of 6" and tap-result lines gone); play area takes that height. Six result circles only,
  current ball = ring on the next empty circle. Per-ball result (grade word + runs) and the over summary float over the field.
- Input: pointerdown on the pad, `touch-action:none`, grade by event.timeStamp vs frame-synced cross time. 56 px targets, 14 px min text.
- Feedback: grade word, small early/late tick on the lane, flash; Perfect 40 ms hit-stop + navigator.vibrate(15) where present; Web Audio beat.
- Reduced motion: keep linear ball travel, drop shake/flash/hit-stop.
- Summary: "Taps 10 of 12. Runs 11, wheel average 7.3". Then hand back to the normal over panel flow (over panel shows the six balls).
- M's mark: once the Captain's Over is done, its six circles get a SECOND RING in gold #D2B357 around each ball, and keep it in the over
  history for the rest of the match (read inn.overs[i].gold / n.last.golden).
- Reads only goldenVM + dispatch(GoldenStart/GoldenTap/GoldenCal). No engine imports.

## 5. Sim (Helper SIM owns): tools/golden-sim.mjs + docs/GOLDEN-SIM.md
Real engine, 1000 matches a setup, seeded. Tapper model: err ~ N(bias, sd); sd 35 (M), 60, 110, random tap. Setups: careful, full Control,
random wheel play; rival offset -9 (live), -10, -11. Report win %, runs per Captain's Over vs wheel avg. If wins > ~60% at sd 35 careful,
also run prize variant "Perfect = best of 2 with floor" and report. Numbers only, no constant change without M.

## 6. Done when
Unit gate green (new tests count added), vectors unchanged, e2e golden-over.mjs passes at 475x638, Visual QA pass at 344x882, 475x638,
624x912, 704x783, 704x823, 816x568 (new screen), Copy report shows the block, reload mid-over = same balls.
