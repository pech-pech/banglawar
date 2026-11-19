# Review: src/game.js + src/render.js vs CONTRACT.md (read-only review, no edits made)

| file:line | defect | concrete fix | sev |
|---|---|---|---|
| render.js:187 | Par marker drawn at `parFuel/fmax`. parFuel is fuel USED at par (game.js:113,133, efficiency = par/used), but the bar fill is fuel REMAINING, so the marker sits at the wrong end. | `pm = barX + barW * clamp((fmax - G.parFuel)/fmax, 0, 1)`. Optionally label `PAR` text as "par used". | HIGH |
| game.js:233,238 | Warp auto-off is tested once per frame, not per step. At x3 up to 24 steps (0.2 s) run per frame, so a fast craft (~200 px/s = 40 px) can enter the 45 px zone before warp drops. | Call `nearBody()` inside the while loop before each `stepOnce()` and set warpOn=false and `acc=0` on trigger. Alternatively cap to the steps that fit the margin. | MED |
| game.js:257, render.js:179 | `G.warp = warpEff` is stale outside 'run'. If warp was on when docked or failed, the "WARP x3" label stays on the result panel. warpOn also persists across sectors. | `warp: phase==='run' ? warpEff : 1`, or set `warpEff = 1` in `endAttempt`/`resetAttempt`. | LOW |
| game.js:146-150,161-162 | A tap that goes down and up between two sim steps never burns: the pointer is deleted before `curInput()` samples it. Contract says a quick tap still burns >= 80 ms. Likely on 120/240 Hz displays. | Latch a `tapPending` flag in `onDown`. In `stepOnce`, `burn = pointers.size>0 \|\| tapPending`, cleared once the event is logged. | MED |
| game.js:155,158 | The launch press also becomes a burn (the pointer is registered right after `launch()`), costing ~0.8 fuel on every sector start. | After `launch()`, `return` without registering the pointer. The player then re-presses to burn. | LOW |
| game.js:93,136 | Ghost is replayed with the current `fuelStart`, but the record was made with another fuel (fuel carry varies 45..75). If the recorded run emptied its tank, the replay diverges. saveBest does not store fuelStart. | Store `fuelStart` in the record (`saveBest(seed,idx,fuelUsed,events,fuelStart)`). Replay with `S.newState(sector, rec.fuelStart ?? fuelStart)`. | MED |
| game.js:113 | `burns` counts every event with e[1]=1, so throttle-change events during a drag count as burns. | Count rising edges: `events.filter((e,i,a)=>e[1] && !(i && a[i-1][1])).length`. | LOW |
| game.js:99,43 | Retry on the 'end' screen calls `newRun()` at once with no 1.0 s lock or press-after-appeared check. A late tap on the HUD wipes the finished run. Retry on 'docked' resets without confirm. | In `retry()`: `if (phase==='end' && now()-phaseT < RESULT_LOCK) return;` and require `b._d` after `phaseT` as `onNext` does. | LOW |
| game.js:106 | Next guard needs `b._d` (set by pointerdown only). A keyboard or AT click leaves `_d` undefined, so Next is blocked forever. | Treat a click with `e.detail===0` (keyboard) as valid once the lock has passed. | LOW |
| game.js:116-120 | Efficiency sums par and used over every docked attempt, so re-docking the same sector (Retry after dock) double-counts it. Contract text is ambiguous. | Keep the best docked attempt per sector, then sum par and used over those. | LOW |
| game.js:72-76,138 | `generateSector` runs synchronously on the main thread (~1 s desktop, up to 6 tries on failure, slower on phones). The prefetch at 300 ms freezes the docked screen and rAF. Retry on failure reruns the same seeds. | Prefetch after the Next lock, or generate in a Worker or `requestIdleCallback`. After a total failure, offer a different seed offset. | LOW |
| game.js:244-246 | DOM writes every frame: `bNext.style.display`/`opacity`, and `textContent` (replaces the text node) at 60 Hz even while hidden. | Cache the last values and write only on change. | LOW |
| game.js:229-230,242 | `fpsBuf` keeps only the last 4000 frames (~66 s) with an O(n) `shift()` per frame, so report fps is not whole-session. Pred is recomputed every 3rd frame even when `st.n` is unchanged (intro, 120 Hz) and is up to 2 frames stale versus the craft. | Use a ring buffer or histogram for fps. Recompute pred only when `st.n` changed since the last predict (`predN`). | LOW |
| game.js:133 | `sector.par.fuel` is dereferenced unguarded in the docked msg (logAttempt:113 guards it). A sector without par throws inside `endAttempt`, leaving phase 'run' stuck. | `const pf = sector.par ? sector.par.fuel : 0;` | LOW |
| game.js:141 + render.js:207 | Failed panel shows "tap to retry" twice (msg suffix plus panel line). | Drop `' \| tap to retry'` from the msg. | LOW |
| render.js:83-84, game.js:47 | Rest pad centre is `oy+H*sc+78`, radius 34. At 475x638 it ends at y=654 > 638, so it is clipped. The 56 px Next button (bottom 20) overlaps the fuel bar, FUEL text and speed readout on docked and end screens. | Pad centre `oy+H*sc+ (h-oy-H*sc)/2`. Hide the fuel text or speed while Next is shown, or move Next above the bar. | LOW |
| render.js (G.throttle) | `G.throttle` is never drawn. The only throttle feedback is flame length, so the drag gesture gives no indicator. | Draw a small throttle bar or arc, or a flame-length hint, from `G.throttle` while `st.active`. | LOW |

Verified OK (no defect found):
- Fuel carry `min(75, 45+0.4*leftover)` (game.js:84), set at sector load and reset on newRun.
- Stranded rule: includeDark, 25 s predict, repeated until `tickLeft` is 0 (game.js:189-193).
- Fixed-step loop: no off-by-one. The `acc>2*DT` reset only fires after the 8-step cap, and `last=0` on blur or visibility drops time.
- Intro only via `loadSector`; Retry skips intro.
- Ghost replay and ghostLine: burnStart is captured at the rising edge and predicted 3 s at burn end.
- Input log uses rising and falling edges plus throttle changes as `[st.n,b,tp]`, which matches `inputFromEvents`.
- 1.0 s guard on 'failed' taps and on Next; localStorage always in try/catch; visibility and blur release input.
- dpr: single scale only (`setTransform(dpr)` in game.js, none in render; `layout` dpr:1 is overridden). Layout scales are 1.0 at 475x638 and 1.012 at 344x882.
- All G fields except `throttle` are consumed by render.
- Not verifiable here: `BW.report.loadBest` field names (`fuel`, `events`) and `BW.audio.suspend/resume` exist (other files).
