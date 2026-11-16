# Trace format (format 1)

Files: `traces/<vehicle>_L<level 1-8>_<policy>[_load][_skinN].json.gz` (gzip of one JSON object) and `traces/INDEX.json`. Produced by `record.js` from the unmodified `oracle/mixer-mad-v7h.html`.

All numbers are JSON doubles written by `JSON.stringify` (shortest round-trip form), so parsing them in C# with `double.Parse` (invariant culture) gives the exact V8 bit pattern.

```
{
  meta:    { format, game, vehicle, level (0-based), mode, weather, policy, seed, prngSource, skin, dt, iter, gravity,
             dailyKey, flagX, edgeX, minY, cpX, zones[[kind,x0,x1]], propBudget0, geoBody, inputFields, inputEncoding, chkDef, sampleSchedule, ... },
  input:   "0123...",     // ONE char per tick, every tick: bit0 = gas, bit1 = brake. The bot's decision for that tick (0 while crashed/stopping).
  chk:     "a1b2c3d4...", // 8 hex chars per tick, taken AFTER the tick: FNV-1a/32 over the lo then hi 32-bit word of x,y,px,py of points 0..5.
  samples: [ { k, state, chk, pts:[6 x [x,y,px,py,contact(0|1),cnx,cny,cpen,im]], b:{...body state}, props:[[idx,x,y,px,py,alive,rot],...] } ],
  events:  [ {type:'state'|'crash'|'finish'|'checkpoint'|'stepcount', k, ...} ],
  outcome: { pass, steps, endState, crashes, finishStep, finishSimT, finishRunT, parkedStep, parkedSimT, ... }
}
```

## Time base
`k` = number of `tick(DT)` calls completed (DT = 1/120 exactly). Sample `k=0` is the state right after `startLevel()`. During `crashed` (0.7 s freeze) ticks happen but `step()` does not run (see SIM-MAP section 4); `outcome.stepCalls` counts `step()` invocations; the `stepcount` event list must be empty (it flags any tick where step() ran a different number of times than expected). Unity should run one `Step()` per tick in every state except `crashed`, and decrement `crashWait` per tick.

## Which samples exist
Precision: samples with k <= 240 carry exact doubles. Samples with k > 240 round the point/prop numbers to 1e-7 (file size; T2 tolerance is 0.05 m). The per-tick `chk` is always exact.

Every `k` in 1..240, every `k % 12 == 0` after that, k=0, and the final tick. T1 (first 240 steps, 1e-9) uses the per-tick samples; T2 uses the sparse ones; the per-tick `chk` string gives a cheap first-divergence finder for ALL ticks (compute the same FNV hash of your doubles' bit patterns, `BitConverter.DoubleToInt64Bits`, low word first).

## Sample fields
- `pts[i]` (i = 0 rear-bottom, 1 front-bottom, 2 front-top, 3 rear-top, 4 rear wheel, 5 front wheel): `x,y` current, `px,py` previous, `contact` = `p.c != null` after the step's last collision pass, `cnx,cny,cpen` = the stored contact (0 if none), `im` = inverse mass.
- `b` (body/world state): `crashT, finishT, levelT, snow, airT, landT, wheelie, wheelT, roofHit, bodyHit, load, runT (run.t), crashes (run.crashes), propBudget, crashWait, acc, wheelAng[2], cpHit (-1 = no checkpoint), cpLoad, rocks` (bit string of `L.rocks[i].hit`), `flagX`.
- `props`: sparse delta. Sample 0 lists all props `[index, x, y, px, py, alive, rot]`; later samples list only those whose 6 values changed since the previous sample (so a missing index = unchanged).

## Events
- `state`: `{k, from, to, simT, runT, x}` on every change of the global `state` (drive -> stopping -> parked, drive -> crashed, crashed -> drive).
- `crash`: `{k, x (truck centre x = (P0.x+P1.x)/2), px0, y, reason, simT, runCrashes}`.
- `finish`: first tick with `state=='stopping'` (flag crossed): `{k, simT = k*DT, runT = run.t}`.
- `checkpoint`: `{k, x, load}`.

## Outcome
- `pass`: state left {drive, stopping, crashed} within the cap (same rule as sweep.js).
- `finishStep` / `finishSimT`: flag crossing (`stopping`), sim clock including crash freezes. `finishRunT`: `run.t` at that moment (the player's par-timer time, which excludes crash freezes). `parkedStep`/`parkedSimT`: `onParked()` tick (= the `ft` sweep.js reports).
- `crashes`: crash count in the run; the oracle stops at 8 crashes or 120 sim seconds, like sweep.js.
- T3 suggestion: compare `pass`, `finishRunT` (+-1%), `crashes`, and each `crash` event's `x` (+-0.5 m).

## Randomness and seeds
`Math.random` is replaced before page load by mulberry32(seed) (`meta.seed`, `meta.prngSource` has the exact code). The sim path does not consume it (cosmetics only), but `combo3.skin` would, so the recorder pins `meta.skin` (0 = `mixer_skin1`; traces `_skin2.._skin4` cover the other three). `meta.dailyKey` is set only for `mode:'daily'` traces.

## Replay
`node record.js --replay traces/<file>` re-drives the game from the stored `input` string only (no policy) and checks that `chk`, all samples and all events are identical. The C# port should do the same with the same `input`.
