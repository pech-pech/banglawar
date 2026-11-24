# Chart School cs-proto-1: integration report (2026-11-24)

## Final run (all from pages/chart-school/)
| suite | result |
|---|---|
| `python3 src/build.py` | wrote index.html, 95,366 bytes (93.1 KB) |
| `node test/engine.test.js` | PASS, 6075 checks, 0 failed (note: no R7 "both" case found in random search; guard is in code) |
| `node test/bots.test.js` | PASS, every bot under 40% on every type; 6+ of 7: random 0.006%, most-common 0.00%, first-option 0.42% (limit 1%) |
| `node test/solver.test.js` | PASS, independent solver agrees 100% on R2, R2b, R3, R4, R5, R6, R7 (240 sheets), 0 discard violations |
| `node test/e2e.js` | PASS, 970/970 checks, at 344x882 and 475x638 |

data/sheets.json: 835,425 bytes (240 sheets, under the 1.2 MB target).

## What e2e.js covers (each size)
Boot with no console errors, "cs-proto-1" and "Chart School" visible; rule card opens/closes; every reading type R1, R2, R2b, R3, R4, R5, R6, R7 answered (first option, or one stepper step) and submitted; marked view with Right/Marked; skip one reading; place a paper order on sheet 1, skip it on later sheets; 10 weeks of evidence; summary; next sheet; keeps opening sheets (through the desk after a session ends) until R4 has been seen; journal (2+ entries); tweak menu: chartCols changed through its input, DEV badge appears, preset saved ("e2e"), Plain loaded, "e2e" loaded back (chartCols restored), reportText() is JSON with build + record, Copy report button present; reload keeps record, journal and tweaks. On every screen: no horizontal overflow, every visible button >= 48 px tall, no forbidden words (level, score, quiz, lesson, streak, passed, rung), no NaN/undefined/null/Infinity in visible text. Screenshots (deviceScaleFactor 1, viewport) in qa/<size>-<screen>.png (72 files).
Submit is checked disabled before an answer only for option types; stepper types (R2, R2b, R4) start on the close box, which is a valid pick, so Submit is live there (admin default, matches SCR-B).

## Fixes made (FM integration, minimal)
- src/screens-a.js
  - `ACT['open-sheet']`: called `openSheet()` only when `S.cur` was null, so after a finished sheet (store keeps `S.cur` with `fin:true`) "Next sheet" reopened the finished sheet. Now always calls `openSheet()` (it continues an open sheet itself). Admin default: when the session is done and no sheet is open, opening a sheet resets `S.sess.done` to 0 (next session count).
  - Desk: "Continue sheet" and the code peek now use `S.cur && !S.cur.fin`.
  - Summary header: title was passed through `esc()` with `&middot;` and then escaped again by `header()`, showing a literal "&middot;". Now plain text " · ".
- src/screens-b.js
  - Selected option and selected paper order showed two ticks (inline SVG / " ✓" plus style.css `.opt.on::before` / `.seg>button.on::before`). Removed the inline ones; the CSS tick plus ring remains (not colour only).
- test/e2e.js, test/serve.js: new (integrator files).
- No changes to engine.js, chart.js, store.js, tweak.js, ui-kit.js, main.js, style.css, build.py, sw.js, manifest, GEN files.

## Coordinator notes checked
- SCR-A gap 1 (summary detail needs S.cur): store keeps S.cur (fin:true) until the next openSheet, so You/Engine rows show (see qa/475x638-summary.png). Gap 2: style.css has .mk/.n/.r/.sh. Gap 3: record() returns 0..1; screens accept both.
- ENG: callers use `CSE.disp(CSE.priceOf(box))` for boxes and `CSE.disp(price)` for prices; R1.col null guarded in screens-b; R7.ref null guarded before drawing the RSI marker.
- `CSE.explain(type, readAll(bars), given)` matches the engine signature.
- main.js and store.js both declare a global `var SCREENS` (array in store, object in main). Harmless today (store only uses it while parsing saved state, before main.js runs), but fragile.

## Known gaps (not fixed)
- P&F chart vertical scale: when the range is wide (e.g. an R4 objective far above price, or the evidence view with the objective line) boxes shrink to dots and the chart grows tall (qa/344x882-marked-R4.png, qa/344x882-evidence-w10.png). The contract asks for about 300 px tall. CHART owner should cap the row height range or clip far overlays with an edge label.
- Evidence chart column axis: "col" label overlaps the first column number ("co25") when the window starts mid-history.
- Header on order screen shows "last 172" (CSE.disp(close)) while the close marker shows the box price 171; both correct, may read as a mismatch.
- "No signal" sheets show "No signal: no history to compare" in the evidence line (sigStats only has the 4 signals); admin default, acceptable.
- Screenshots are viewport-only (what the player sees first), not full-page.
- Service worker not exercised in e2e (blocked to avoid cache effects); sw.js registration untested in a browser.
- Not committed or pushed.
