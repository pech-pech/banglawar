# Chart School fix1: M's layout report (2026-11-25, layout-issue-0345.png, phone 416x608 at DPR 3)

## Tests
- node test/engine.test.js: 6463 checks, 0 failed
- node test/bots.test.js: bots gate ok
- node test/solver.test.js: PASS, all types 100%
- node test/e2e.js: 7216/7216 checks, PASS at 344x882, 416x608 (new), 475x638, 816x568 (new, landscape inner)

## Changed
1. Empty half-charts (chart.js sizing rewritten). Cells stay square. pref(N) = height budget / rows(N), clamped to
   [minCell, 15 stock / 11 sector]. Older columns are added until N columns at pref(N) fill the width (row range
   recomputed each step; N only grows, so it settles). Then cell = width / N, so the grid meets the card's left edge.
   If every shipped column already fits, the cells grow (cap 2x: 30 / 22 px) and the chart gets taller. Hard height
   cap so the chart never passes about one screen: stock 1.15 x viewport (min 560), sector 0.8 x viewport.
   "Columns shown" (chartCols, default 24) still caps the columns unless that would break the height cap.
   When a cap stops the fill (all columns shown), the grid is centred, never left-padded. A chart with very few
   columns (a 4-column sector chart) keeps modest cells instead of becoming a tall tower.
2. Price tags: one pill per distinct box (close beats engine beats pick). The opt.pick line and pill are dropped when
   a row overlay marks the same box (this caused the three "192" pills). Pills that touch are spread as a block
   centred on their rows. Each true row gets a 4px tick and at most one short leader.
3. Pick / engine row labels: a small pill on the grid at the first run of free cells from the left edge (its own
   row, then the neighbouring row). If there is no free run, there is no label; the axis pill and the stepper still
   show the value. The dashed row stays inside the grid.
4. Trend labels: these are placed along the active line, inside the grid, at the spot with the fewest marked cells
   (support prefers below, resistance above, ties go to the latest columns). If no spot inside the grid has at most
   1 marked cell, a small key goes in the sector title row instead (or at the left of the column axis on the stock
   chart).
5. Call screen: if the charts cannot fill the width in the room left beside the controls, the call card moves to
   the top (Buy / Don't buy, horizon, Confirm all on screen) and both charts follow at full width. The mockup order
   (stock, sector, call) is kept when it fits.
6. Wide screens (min-width 700px, landscape 816): the stock and sector charts sit side by side (3:2) so each fills
   its card without growing taller than the screen (style.css).

## e2e additions
- 416x608 and 816x568 viewports.
- P&F grid left edge within 2 cells of the card's inner left edge. The only exemption is a centred chart that
  already shows every shipped column; these are counted and printed.
- No duplicate axis pills. Trend and row labels never sit over axis numbers. Call card fully on screen above the
  bar on the call view at every size.
- Shots: reading-option, reading-stepper, marked-stepper, call-viewport.

## Screenshots (deviceScaleFactor 1, full page; the fixed bar shows mid page in full-page shots)
qa/v2/fix1/{344x882,416x608,475x638,816x568}-{desk,reading-option,reading-stepper,reading-sector,marked-stepper,
marked-sector,call,call-viewport,outcome-mid,outcome-exit,summary,runend,journal}.png

## Left / known limits
- Sector charts with few columns (median 13, p10 6, some only 1 to 4) cannot fill a portrait card without being
  taller than the screen. They are centred with a gap of about 2 to 3 cells on each side at 416 to 475 wide.
  In the e2e run: 160 centred charts over 360 screens, mostly sector charts. Real fix: ship more sector history
  (GEN, data/sheets.json; out of scope here).
- Reading screens are now longer: the stock chart is about 420 to 530 px at phone widths (was 300), so the question
  card needs a scroll. The lead accepted this.
- At 344x882 the call card often moves to the top (stock charts with few columns cannot fill the width inside the
  budget left by the call card).
