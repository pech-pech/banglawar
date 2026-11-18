# ui.js review (against CONTRACT.md ui section). ui.js not edited.
Reviewed: src/parts/ui.js (273 lines), src/shell.html. No Date/Math.random anywhere in ui.js (performance.now only for UI timing: hold, 500 ms guard, toast). PASS.

## Contract checklist
- Swipe 24 px / 1.25x lead: PASS (L133-137). See M2 for fast-flick gap.
- Tap <180 ms and <10 px: PASS (L142).
- 600 ms hold ring + restart: PASS (L158-163). See L1.
- Strip bottom 40% only: PASS (L125, y < 0.6*H). Buttons are hit-tested before the strip check, which is fine (they are top-right).
- Inputs logged with state.t at application, applied at tick start: PASS (L72-79). Queue is spliced and logged immediately before PL.step. Inputs dropped while dead/won/result are not logged, so replay stays consistent.
- pointercancel: PASS (L146). Clears g, no dive.
- Multi-touch safe: PASS but lossy (second finger ignored while g active, L125). See L2.
- Stray taps after run-complete 500 ms: PASS for new pointerdowns (L118, L150). See M3 for a leftover finger.
- Clipboard fallback: present, but see H1, it can fail on touch.
- Report completeness: seed, build, UA, viewport+dpr, avg fps, run time, attempts, 2nd-vs-1st, input log, determinism line, WebGPU line all present. Minor gaps below.
- PL_TEST getState/setSeed/inject/room: PASS (L261-271).

## High
H1 L113-119, L121-124, L214-228: Copy runs on pointerdown. For touch, pointerdown is NOT an activation-triggering event (pointerup/touchend is), so navigator.clipboard.writeText and execCommand('copy') can reject on phones, which is the main target. Fix: for button hits, record the button id in pointerdown and fire copyReport()/pathOn toggle in pointerup (check the up point is still inside the rect). Also call the textarea fallback synchronously when clipboard is missing (already so) and make it iOS-safe: ta.readOnly=true; font-size:16px; ta.setSelectionRange(0, text.length).
H2 L216-224: If both methods fail the user gets only "Copy failed" and the report is lost. Fix: on failure show a full-screen overlay <textarea readonly> with the text (select-all on focus), or window.prompt as a last resort, plus console.log(text).
H3 L192, L56-58, L248: flips double count. HUD flips = flipsTotal + state.flips (L250). After finishAttempt (death/win) flipsTotal already includes state.flips while state is still the old one, so the HUD over-counts for the whole 0.3 s respawn and the 60-tick win delay. Also buildReport "flips" (L187) omits the in-progress attempt. Fix: HUD flips = flipsTotal + (cur.result ? 0 : state.flips); report the same.

## Medium
M2 L139-144: A fast flick can produce pointerdown then pointerup with no pointermove past 24 px, which is then lost (d>=10 so no dive either). Fix: in endGesture, if !cancel && !g.fired, run the same lead test using the pointerup coordinates and qFlip. Factor the test into a helper used by pointermove and pointerup.
M3 L116-120, L96, L139: A finger still down when the complete screen appears keeps g alive. Its pointerup after newRun() queues a dive into the first tick of the new run, and its moves can queue flips into the dead queue. Fix: set g=null and ring=0 where complete is set (L96) and in newRun(); endGesture already ignores when g is null.
M4 L125: A stale g (lost pointerup, e.g. blur or alt-tab, window loses pointer) blocks all later input forever. Fix: add window blur and visibilitychange handlers that set g=null, a lostpointercapture listener that calls endGesture(e,true), and in pointerdown replace g if nowMs()-g.t0 > 3000.
M5 L238, L180: avg fps is the mean of 1/dt (biased high at low fps). Fix: accumulate frames and total seconds, avg = frames/seconds. Excluded dt>0.25 frames are fine.

## Low
L1 L161: The ring starts filling at 0 ms, so every tap flashes a ~30% ring. Fix: ring = max(0,(h-150)/450) or only report ring once h>180 ms.
L2 L109, L125: Single global gesture, so a second thumb's tap/swipe is dropped. Safe but costs inputs in two-thumb play. Optional fix: Map<pointerId,gesture> (still one hold-restart at a time).
L3 L113: Right/middle mouse buttons start a gesture. Fix: if (e.pointerType==='mouse' && e.button!==0) return.
L4 L27-29: Add window.visualViewport 'resize' listener (mobile URL bar / keyboard) so view.H, the strip and insets stay correct.
L5 L195: The 2nd-vs-1st loop is hardcoded to rooms 1..3, so use rooms.length. Also label which attempts were 'restart' or 'abandoned' vs 'death' in the delta line, since comparing a death time with a win time misleads.
L6 L264: inject() does not validate dir (0..3) or k, so a bad value reaches PL.step and is logged. Fix: ignore entries with k not in flip/dive or dir not integer 0..3.
L7 L60-63, L158-162: Hold-restart and R-key call restartRoom between ticks, not as a logged input. This is fine for determinism since the attempt ends, but the report shows 'restart' attempts with no marker input. Optional: none needed.

## Verified OK (no action)
Fixed-step accumulator max 5 steps (L241-242); dt clamp 0.25 (L237); deterministic input order (FIFO queue, same-tick inputs applied in order); win hash taken on the win tick matches replay termination assumption (L90); death -> startAttempt at dead<=0 (L94); reduced-motion skips dust (L85); touch-action none (L111) plus CSS (shell L10); safe-area probe (L14-24); canvas dpr scaling (L25, L253).
