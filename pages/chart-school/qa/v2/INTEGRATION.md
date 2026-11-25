# Chart School v2 integration (build cs-v2-1, 2026-11-25)

## Tests
- `node test/engine.test.js`: 6463 checks, 0 failed
- `node test/bots.test.js`: PASS (every bot under 40% per type incl. S1/S2; 3 of 3 under 10%)
- `node test/solver.test.js`: PASS, 10 types at 100% (R1..R7, R2b, plus new S1/S2 = R1/R3 logic on the sector chart), 480 sheets
- `node test/e2e.js`: 3008/3008 checks, PASS at 344x882 and 475x638

e2e now covers: v1 saved state migrates (record + journal kept, new run, v1 journal entry renders); full Buy run (3 readings per chart, 3 distinct types, at least one stock type, header "Reading i of 3", rule card, Review charts back and forth, -/+ clamped 3..10, range input set like a drag, Buy, trade ret = fwdRet[h-1], advance exactly h weeks, outcome text with final return, run ends at the 10th Buy, runend shows the total return and "10 trades", best run stored as an int); a Don't buy run that ends at chart 20 with "+0.0%" and 0 trades and does not overwrite the best run; New run; tweak menu, presets, report JSON (9 record rows); reload keeps state. Every screen: no Hold, no sideways overflow, no svg outside the viewport, no NaN/undefined, no forbidden words, controls >= 48px, sector chart cells >= 3px, no console errors.

## Fixed
- main.js: BUILD cs-v2-1; dispatch desk, reading, marked, call, outcome, summary, journal, runend (order/evidence removed). Renamed its map to SCREEN_FN: it clashed with store.js's global `SCREENS` list. Boot uses store validation; `newRun` replaces old `savedValid`/`newSession`.
- ui-kit.js: top line "Chart School · Trading desk". style.css: top line no longer wraps (ellipsis) with a long build stamp.
- Hold wording: removed "holds" from the call note and the R7 rule text ("If neither is true").
- Return text: store `retTxt` never prints "-0.0%"; screens-a and screens-b now use it, so every screen shows the same figure.
- screens-a: best line reads `S.best.trades` as an int; desk after a finished run shows a fresh run (Start run) not "Trade 11"; runend trade list one line per trade; return colours (.good/.bad) had no CSS; summary call/return card spanned half the width.
- chart.js: negative SVG radius/width console errors on tiny cells; legibility floor (opt.minCell, opt.maxHeight: chart grows taller instead of shrinking cells), cap on "spare width shows more columns" (more columns meant more rows and tinier cells), older columns fill spare width only when they need no new rows. `data-cell`/`data-rows` on the svg for tests.
- Sector chart: max 16 columns, sectorHeight default 150 -> 180 (admin default), minCell 6, grows to 260 px. Over all 480 sheets at 344 wide: sector cell median 6 px, p10 5.6, min 3.2 (was median ~4.5, p90 rows 43 at 150 px). Stock chart: minCell 7, grows to 420 px.
- Call screen: Buy / Don't buy and the horizon slider moved above the sector chart so they sit above the fold at 344x882.
- Exit label at the right edge: right-anchored, checked in outcome screenshots, no clipping.
- All sheet bars go through `toBars` ([h,l,c] -> {h,l,c}) before CSE.pnf (stock, sector, fwd).
- solver.test.js: S1/S2 added.

## Checked, no change
- sw.js / shared PWA core: network first, build-keyed cache, sheets.json (2.4 MB) precached with allSettled; no change needed.

## Not verified
- Real phone touch drag on the range slider (e2e sets the value and fires `input`).
- Offline/SW update path (e2e blocks service workers).
- Mockup visual pass (later step).

## Screenshots (deviceScaleFactor 1, full page; the fixed bottom bar shows mid page in full-page shots)
qa/v2/344x882-desk.png, -reading-sector.png, -marked-sector.png, -call.png, -outcome-mid.png, -outcome-exit.png, -summary.png, -runend.png, -journal.png (same set at 475x638).
