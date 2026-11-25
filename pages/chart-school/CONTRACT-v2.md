# CHART SCHOOL v2 CONTRACT (build cs-v2-1, 2026-11-25). Lead writes; makers read THIS + CONTRACT.md (v1, still valid where not changed) + their slice only.
Repo /home/user/repo, branch claude/project-thread-i2ncd2 (built on PR #125 cs-proto-2). Game folder pages/chart-school/. Never touch other games.
Fold only: test 344x882 (cover) and 475x638. Data: stocks /home/user/stockdata/stocks/*.csv, ETFs /home/user/stockdata/etfs/*.csv (daily OHLC, same loader as gen-sheets.js loadStock).

## M's must-haves (verbatim, 2026-11-25; outrank everything)
V1 "include a sector chart also to help with decision making."  -> sector ETF P&F chart under the stock chart (M pick A).
V2 "limit the questions to 3."  -> exactly 3 readings per chart.
V3 "vary the question types."  -> 3 DIFFERENT types per chart, rotated across charts (below).
V4 "the hold call is not relevant"  -> no Hold anywhere.
V5 "sell should change to dont buy"  -> call options are exactly "Buy" and "Don't buy".
V6 "there should be a time horizon option too. slider between 3 and 10."  -> horizon slider 3..10 WEEKS (M pick), step 1.
V7 "the game objective should be to make the most returns in 10 trades."  -> run ends at the 10th Buy (M pick: Don't buy uses no trade), cap 20 charts per run. End screen shows total % return only (+ best run) (M pick B).
Flow per chart (M pick A): 3 readings -> marked each -> the call (Buy / Don't buy + horizon) -> outcome weeks -> next chart.

## Wording
Keep v1 wording rules (no level/score/quiz/streak/lesson). New words: "run", "trade", "call", "horizon", "return". Top line "Chart School · Trading desk". Call screen title "Your call".
Return text: signed, 1 decimal, e.g. "+4.2%" / "-3.1%".

## Sector data (GEN)
Stock -> sector ETF map (admin default; pre-2018 sectors):
XLK: AAPL ATVI GOOGL IBM INTC INTU MSFT NVDA ORCL QCOM T VZ | XLY: AMZN DIS F HD NFLX NKE SBUX | XLI: BA CAT CSX FDX GE HON MMM NSC UNP | XLV: BIIB CI GILD MRK | XLF: C USB | XLE: COP EOG OXY SLB VLO | XLP: COST KO STZ WMT | XLB: LIN
Sector names shown: XLK "Technology", XLY "Consumer discretionary", XLI "Industrials", XLV "Health care", XLF "Financials", XLE "Energy", XLP "Consumer staples", XLB "Materials". Never show ETF ticker.
Sector weekly bars aligned to the stock's weeks by ISO week key (same isoKey); drop windows without full sector coverage for all bars + fwd (ETFs start 1998-12). Sector bars normalised by the sector close at the stock's bars[0] week; 5 decimals.

## data/sheets.json changes (GEN)
build "cs-v2-1". About 480 sheets (NSHEETS env). Each sheet adds: sec:{name, bars:[[h,l,c]...] same length as bars, fwd:[[h,l,c] x10]}, ans adds S1, S2 (= CSE.readSector(secBars) answers), fwdRet:[10 numbers] = fwd[k].c / bars[last].c - 1 (5 decimals; index k = week +k+1).
Keep a sheet only when v1 keep rules hold AND S1, S2 have answers. Balance S1 (5 classes) and S2 (3 classes) too. Add base.upH:{3..10: share of all weeks whose close +h is above}. File under 2.5 MB.
Bot gate (test/bots.test.js): add S1, S2 to per-type bot checks (each bot under 40%). Replace the "6+ of 7" check with "share of charts where a bot gets 3 of 3 under 10%" using CSE.pickReads.

## engine.js additions (ENG). Existing API unchanged.
CSE.readSector(secBars) -> {S1:{answer, col}|null, S2:{answer, kind, segs}|null}. S1 = R1 logic on the sector chart, CSE.OPTIONS.S1 = same 5 texts as R1. S2 = R3 logic on the sector chart, CSE.OPTIONS.S2 = ["Sector uptrend, 3+ boxes above support","Sector uptrend, near support","Sector downtrend, below resistance"].
CSE.TYPES adds "S1","S2". CSE.NAMES: S1 "Sector signal", S2 "Sector trend". CSE.RULES.S1/S2 (same rules, "on the sector chart"). CSE.explain(type, reads, given, secReads) handles S1/S2.
CSE.KINDS = {R1:"opt",R2:"step",R2b:"step",R3:"opt",R4:"step",R5:"opt",R6:"opt",R7:"opt",S1:"opt",S2:"opt"}.
CSE.pickReads(sheet, rng, prevTypes) -> exactly 3 distinct type keys (V2, V3). Pool: R1, sheet.r2key, R3, R4 (only if ans.R4 != null), R5, R6, R7, S1, S2. Rules: avoid types in prevTypes unless pool < 3; at least one R* type; at most one stepper (R2/R2b/R4); include one of S1/S2 when rng() < 0.67; deterministic given rng (mulberry32 fn). Order: stock reads first, sector read last.

## chart.js (CHART)
drawPnf opt adds: height (px, default 300), title (small label top-left inside SVG, e.g. "Sector · Technology"), compact (smaller font, axis every 3 boxes). Sector call: drawPnf(host,{bars:sec, eng:CSE.pnf(sec), cols:T.chartCols, height:T.sectorHeight, compact:true, title:"Sector · "+name, overlays:[{k:"trend",segs}]}). Boxes stay square (cell = min(width/cols, height/rows)); 45-degree lines stay true.
New overlays: {k:"exit", col, label} marks the horizon exit column; {k:"entry", box, label} row at the call close.

## store.js + tweak.js (STORE)
Remove: order/Hold/Sell, paperOrder, sheetsPerSession, "order" screen, orderResult. Keep accuracy record (rec) and journal.
S.run = {id, seed, charts:0, trades:[{code, sheetIdx, h, ret}], skipped:0, done:false}; S.best = {ret, trades}|null. S.cur adds call:null|"Buy"|"Don't buy", h (3..10, starts T.horizonDefault), k (outcome week shown).
S.prevTypes for pickReads. openSheet(): reads = CSE.pickReads(sheet, rng(S.run.seed + S.run.charts), S.prevTypes) -> [{type, answer, given, ok, skipped}] (S1/S2 answers from sheet.ans).
nextReading(): after the 3rd -> go("call").
setCall(kind), setHorizon(h) clamp 3..10, confirmCall(): Buy -> push trade {ret: sheet.fwdRet[h-1]}, k=0, go("outcome"); Don't buy -> S.run.skipped++, k=0, go("outcome") (shows what happened, no trade).
advanceWeek() caps at h (Buy) or h (Don't buy, same horizon shown). finishSheet(): journal {code, reads, call, h, ret|null, moved}, S.run.charts++; if trades >= T.runTrades or charts >= T.runCharts -> run done, update S.best, go("runend") else go("summary").
runReturn() = product(1+ret)-1 over trades (compounded, full stake each trade, admin default). newRun(seed). reportText adds run, best, call + types per journal entry.
DEFAULTS add: horizonDefault 6, runTrades 10, runCharts 20, showSector 1, sectorHeight 150. Remove paperOrder, sheetsPerSession. Presets: "Plain", "Large chart" (chartCols 16, textSize 1.15), "Minimal" (showMacd 0, showBaseNote 0, showSector 0).
Old saved state (v1 shape) -> start a new run, keep rec + journal (never crash).

## Screens
SCR-A (screens-a.js): desk: run card first ("Trade x of 10 · chart y of 20", run return so far, best run return; primary Start run / Continue). Accuracy record card stays below, smaller. runend (renderRunEnd, NEW): big total return "+12.4%", "10 trades", best run line, list of trades (code, horizon, return). Return only, no baseline. Bar: Journal (out) + New run (primary "new-run"). summary: 3 marks + call + return or "No trade". journal: call, horizon, return.
SCR-B (screens-b.js + style.css): reading: stock P&F (300px) + sector P&F (when T.showSector) + RSI/MACD panes (tweaks) + question card; header "<CODE> · Reading i of 3". marked: same, sector overlays for S1/S2. call (renderCall, NEW): both charts compact, seg "Buy" / "Don't buy" (data-opt), horizon input type=range min 3 max 10 step 1 id "horizon" (56px touch area, label "6 weeks"), -/+ 48px buttons act "h-down"/"h-up", line "Trade x of 10". Bar: Review charts (out "back-reading") + Confirm call (primary "confirm-call", disabled until picked). outcome (renderOutcome, replaces evidence): chart = bars + fwd[0..k-1], entry row + exit column overlays; line "Week +k of h · return so far +x%" (Buy) or "Week +k of h · price moved +x% (no trade)". Bar: Copy report (out) + Advance week (primary "advance"); at k=h primary "Chart summary" ("finish").
ACT owners: SCR-A: open-sheet, journal, desk, copy-report, finish, close-modal, rule, new-run. SCR-B: opt, submit, skip, step-down, step-up, next, advance, confirm-call, h-down, h-up, back-reading.
main.js (INTEGRATOR): render() dispatch adds call, outcome, runend (remove order, evidence). BUILD "cs-v2-1".

## Icon (ICON)
New install icon (M: "change the icon for phone install"). Current XO icon reads as tic-tac-toe. New: dark bg #0b0e14, P&F motif: 3-4 short columns of blue X (#4da3ff) and orange O (#ff9f43) on a faint grid rising left to right, thin 45-degree support line under them, breakout X column top right. Reads at 48px: max 4 columns, max 5 marks per column, thick strokes. Code-drawn (SVG -> PNG), no paid art. Files: icon-192.png, icon-512.png, icon-maskable-512.png (inside 80% safe zone), src/icon.svg, tools/make-icon.*. Names unchanged.

## Visual pass (later)
Mockups: /mnt/project-files/games-design/chart-school/2026-11-25-v2/mockups/. Integrator applies their look AFTER the backend lands.

## FILES, OWNERS
| file | owner |
|---|---|
| src/engine.js, test/engine.test.js | ENG |
| tools/gen-sheets.js, data/sheets.json, docs/GEN-REPORT.md, test/bots.test.js | GEN |
| src/chart.js | CHART |
| src/store.js, src/tweak.js | STORE |
| src/screens-a.js | SCR-A |
| src/screens-b.js, src/style.css | SCR-B |
| src/icon.svg, icon-*.png, tools/make-icon.* | ICON |
| src/main.js, src/build.py, index.html, test/e2e.js, test/serve.js, test/solver.test.js, qa/, CONTRACT.md | INTEGRATOR |

## Rules for every maker
Same as CONTRACT.md "Rules for every maker". Do not stop to ask: label guesses "admin default". No Math.random, no real tickers/dates/prices in UI. Self-test; return file paths + 3 lines (works / not verified / contract gap). Do NOT git commit; lead commits.
- INTEGRATOR TODO: ui-kit.js header top line 'Reading desk' -> 'Trading desk'; main.js dispatch runend/call/outcome; check CSS classes reused by SCR-A.
- INTEGRATOR TODO: sector chart legibility: if rows in view > ~25 at sectorHeight, raise sectorHeight (admin default 180) or cut sector cols to 16; check exit label clip at right edge; screens convert sheet [h,l,c] -> {h,l,c} before CSE.pnf.
