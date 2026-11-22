# CONTRACT ui2: Stock Terminal UI v2 + Evidence lab (build id `st-ui2-1`)
Lead: Opus (orchestrates only). Makers: Sonnet, one owner per file. Work ONLY in `/home/user/banglawar/pages/stock-terminal/`. Touch ONLY files you own. No git. Nobody asks: guess, mark `// admin default: ...`, keep going. FOLD ONLY (344x882, 624x912, 816x568), no desktop. M: no interrupts.
Older rules still hold: `CONTRACT.md` (data format, real window rules, P&F engine, bots, PWA). This file wins where they differ.

## Design inputs (read only the ones your brief names)
D=/mnt/project-files/games-design/stock-terminal/
- Look: `D/2026-11-22-ui-v2/CONTRACT-v2.md` (look rules), `pro.css` (tokens; copy verbatim into `src/pro.css`), mockups `dashboard.html`, `chart.html` (+`?sheet=1` order sheet), `week-close.html`, `review.html` (+`?tab=journal`), PNGs `<screen>-344.png/-624.png/-816.png`. Mockup numbers are fiction: show real computed values.
- Logic: `D/2026-11-22-concepts/EVIDENCE-LAB-SPEC.md` incl. addendum "Added 19:45 UTC". Method notes: `D/2026-11-22-proto/SIGNAL-STATS.md`.
- Known mockup slips, do NOT copy: MACD "0" label hidden behind value pill; dashboard 344 extra divider under last alert row; 816 empty space in equity card.

## Hard rules
Blue `--x` = X / up / buy; orange `--o` = O / down / sell; mint `--accent` ONLY primary button + OK checks; `--warn` yellow warn; `--bad` red ONLY floor breach. Colour never the only signal (▲▼, words, sign). One primary button per screen. Body 14 px, chips 12 px, labels 11-12 px. Tap targets ≥48 px. No sideways scroll at any size. Simulation wording (mandate, benchmark, journal, call record, baseline; never desk/level/score/passed/logbook). No real tickers/dates. No libraries, no web fonts, no network except `data/weekly.json`. Classic scripts, `"use strict"` first line, shared globals. No `alert/confirm/prompt` except existing Copy-report fallback.
Game rules unchanged: 10 weeks, mandate +3 pts vs equal-weight benchmark, floor -10% (warn -7%), 50% cap, fee 0.5%/side, long only, fills at week close, call right = 3 boxes the called way before 3 against. Seeded RNG; Tweak menu; Copy report; DEV badge with seed.

## Build
`python3 src/inline.py` → `index.html` (generated, never hand-edit). Script order (exact):
`core.js data.js pnf.js evcalc.js evidence.js game.js bots.js ui.js pfsvg.js panes.js dash.js chart.js order.js week.js review.js journal.js tweak.js main.js`
Styles (exact order): `pro.css base.css pf.css panes.css dash.css chart.css order.css week.css review.css journal.css tweak.css` (all in `src/`). Old `src/style.css` is deleted by integrator.
CSS class prefixes per file (avoid clashes): pf `pf-`, panes `pn-`, dash `d-`, chart `ch-`, order `od-`, week `wk-`, review `rv-`, journal `jn-`, tweak `tw-`. base.css owns un-prefixed layout classes listed below. pro.css classes usable by all: `.card .btn .btn.primary .chip .chip.fresh.buy/.sell .chip.stale .seg>button(.on) .row .bar .dev .sheet .grab .num .dim .faint .up .down .ok .warn .cap`. base.css adds `.btn.outline`.

## shell.html (owner U)
```
<body><div id="app"><header id="top"></header><main id="main"></main><nav class="bar" id="bar"></nav></div>
<div id="scrim"></div><section id="sheet" class="sheet" role="dialog"></section><div id="toast"></div>
<div class="modal" id="modal"><div class="panel" id="modalBody"></div></div><!--SCRIPTS--></body>
```
Keep markers `<!--STYLE-->` and `<!--SCRIPTS-->`, viewport-fit=cover, theme-color `#0b0e14`.

## State `S` (game.js, owner G). Fields others read
`S={seed,W,week,cash,pos[6],views[6] (1|-1|0|null),calls[],neutrals[],orders[],fired[],fees,eqHist[],benchHist[],sel,side(1|-1),qty,minEq,failed,report,lastMsg,base,screen,sheet,tab}`
- `S.screen` ∈ `"home"|"chart"|"review"`; `S.sheet` ∈ `null|"order"|"week"`; `S.tab` ∈ `"period"|"journal"`.
- Call record (every ±1 view at advance): `{id:"<seed>:<wk>:<k>", seed, k, s:code, wk, at, box, view:1|-1, dir:view /*alias*/, sig:"TRIPLE-TOP BUY"|null, pat:sig||"No signal" /*alias, one build*/, sigDir:1|-1|0, sigAge:int|null, fresh:bool, withSig:true|false|null, rsi:int, mh:"MACD h +"|"MACD h -", base:0..1 /*baseFor(view)*/, res:"right"|"wrong"|undefined, resWk}`. withSig = sigDir===0?null:sigDir===view.
- Neutral views (0) at advance → `S.neutrals.push({k,s,wk})` (not scored, count only).
- Orders: `{wk,s,side:"BUY"|"SELL",q,px,view:1|-1|0|null}`. `noCallCount()` = orders with `view==null`.
- `S.fired`: `{wk,k,s,name,dir:1|-1}` pushed in advance() for each signal newly fired that week.
- `S.report` (set in advance): `{wk,eq0,eq,b0,bn,rows:[{k,chg,newBoxes,dir,fired,r0,r1,h0,h1}],resolved:[call],neutrals:[this wk],open:[calls still open],end:bool}`.
- `S.base`: null until background baseline lands; then `{n,src,cash,rand,lock,signal}`.

## Global functions (owner in brackets). Exact names
- core.js (unchanged): `mulberry32 gauss DEFAULTS TWEAK_LABELS T tweaked ema rsi macd sma`.
- data.js [E2]: unchanged API + `DATA.ev` = `json.ev||null` kept after decode.
- pnf.js [C1]: unchanged API (`LB boxOf boxUp priceOf pnf pnfSignal vcount pnfTrend pnfTraps pfText`) + NEW `sigInfo(cols)` → `{name|null, buy:bool, dir:1|-1|0, col|null, age:int|null /*cols.length-1-col*/, fresh:bool /*age<=1 && !reversed*/, reversed:bool /*after a buy, a later O column's lo <= prior top box (cols[col-2].hi); mirror for sell*/, trap:"bull"|"bear"|null}` and `sigLabel(name)` ("TRIPLE-TOP BUY"→"Triple top buy", null→"No signal").
- evcalc.js [E2]: `let EV=null;` `computeEvidence(list,start)` list = array of bar arrays `[{o,h,l,c,v}]`, counts weeks i≥start (default 50) → EV object below. Must be ~O(n) per series (build P&F incrementally, never re-run pnf() per week). `evNow()` → `DATA.ev` when `dataSource()==="real"&&DATA&&DATA.ev`, else computes once per `S.seed` from `S.W.bars.concat(S.W.hidden)` sliced to `T.preWeeks` with start 14 (admin default for stand-in) and caches. Never throws; if nothing → `{src:"none",base:{bull:0.5,bear:0.5,n:0},pat:{},ind:{}}`.
  EV shape: `{v:1,src:"real"|"standin",base:{bull,bear,n}, pat:{"DOUBLE-TOP BUY":{dir:1,seen,ft,lift,lo,hi},"TRIPLE-TOP BUY",...,"DOUBLE-BOTTOM SELL","TRIPLE-BOTTOM SELL","BULL TRAP"(dir -1),"BEAR TRAP"(dir 1)}, ind:{"RSI >60"(dir1),"RSI <40"(dir-1),"MACD h +"(1),"MACD h -"(-1),"Above 10wk MA"(1),"Below 10wk MA"(-1),"RS rising"(1),"RS falling"(-1)}}`. `ft`,`lo`,`hi` = share 0..1 (Wilson 95%), `lift` = (ft - base for dir)*100 pts rounded 0.1. base.bull+base.bear = 1 exactly (same resolved set; same-week both → close vs open). Resolution rule identical to game resolveCalls (box=boxOf(close_i); right if later high ≥ box+T.reversal boxes before later low ≤ box-T.reversal).
- evidence.js [E1]: `baseFor(dir)` → evNow().base.bull|bear. `callStats(calls,nLife)` over closed calls (res set, view ±1) → `{closed,right,exp,edge,sd,band:[lo,hi]|null,verdict}`; exp = Σbase (call.base, else baseFor(view)); edge = right-exp; sd = sqrt(Σ b(1-b)); band = edge±1.96 sd only when `nLife>=30` (nLife default = closed); verdict: nLife<30 → `"too few to tell"`, else band lo>0 `"above base"`, hi<0 `"below base"`, else `"at base"`. `splitStats(calls,nLife)` → `{with,against,none}` (withSig true/false/null). `freshStats(calls,nLife)` → `{fresh,stale}` (calls with sig only). `liftCls(p)` p = EV pattern row → `"dim"|"ok"|"warn"` (ok only if Wilson band [lo,hi] excludes dir base and lift>0; warn if excludes and <0). `liftTxt(x)` → `"+3.0 pts"`/`"-1.0 pts"`/`"0 pts"`. `pctTxt(p)` 0.642→"64%". Journal (localStorage key `st.journal.v1`, try/catch, array of closed call records): `journalLoad()`, `journalAdd(call)` (dedupe by id), `journalReset()`, `journalStats()` → `{n, all, bull, bear, byPat:{name:stats}, split:{with,against,none}, fresh:{fresh,stale}}` (each stats = callStats with nLife=n).
- game.js [G]: as slice plus fields above; `newPeriod(seed)` (S.screen="home", S.sheet=null, S.tab="period"; schedules `setTimeout(()=>{S.base=baselineCached();if(typeof render==="function")render()},30)`), `vis closeNow equity bench pct stockInfo(k)` (adds `si:sigInfo(cols)`), `resolveCalls()` (journalAdd on each newly resolved), `setView(v)` (tap same view again → null), `place()` (success: S.sheet=null, S.lastMsg="Filled ..."; reject: sheet stays, S.lastMsg="Rejected: ..."), `advance()` (→ S.screen="home", S.sheet="week"), `step() maxQty()`, nav: `openChart(k)` (S.screen="chart", S.sel=k, S.qty=0), `go(screen)`, `openSheet(name)` (order: S.qty=0; side=1), `closeSheet()`, `periodEnded()` = S.failed||S.week>=T.weeks, `noCallCount()`, `periodStats()` → `callStats(S.calls, journalLoad().length)`. Every nav fn calls `render()` and `window.scrollTo(0,0)` when screen changes (guard typeof window).
- bots.js [G]: `baseline()` unchanged + `baselineCached()` (memory map + localStorage `st.base.<key>` key = JSON of T + dataSource(); try/catch) + `baselineHTML(b)` (b null → "Baseline: pending, computing…").
- ui.js [U]: `fmt sg sg2 $ pathOf esc`, `const SCREENS={}, SHEETS={}`, `render()`: `#top` ← `SCREENS[S.screen]().top`, `#main` ← `.main`, `#bar` ← `.bar`; if `S.sheet`: `#sheet` ← `SHEETS[S.sheet]().html`, add `body.sheet-on` (+ `body.sheet-<name>`) (scrim visible, sheet slid up); else remove. `#toast` shows `S.lastMsg` 2.5 s (only when msg changed). `devBadge()` → `<button class="dev num" id="devBadge" onclick="openTweaks()">DEV 48213</button>` (`DEV* ` when tweaked()). `topBar(title,sub,right)` helper → `<div class="top">…</div>`. `layout()` → `"cover"` (w<600) | `"tall"` (w≥600, portrait) | `"wide"` (landscape and w≥760). Sets `body[data-layout]` each render. Each screen fn returns `{top,main,bar}`; each sheet fn returns `{html}` (sheet holds its own buttons in a `.bar` inside it).
- pfsvg.js [C1]: `pfSVG(i,opt)` (i = stockInfo(k)) opt `{w,h,cell,tgt /*price|null*/}` → `<svg id="pf">` string exactly w×h: square cells (`cell` px, default 15 when w<600 else 14), faint grid `--grid`, X = two crossed strokes `--x` 1.8 px round caps inset 3 px, O = circle stroke `--o` 1.8 px; boxes whose `wk===lastBar` get filled bg (X/O colour at 22%) + 1 px outline; most recent columns that fit width (never crop a column vertically: choose K columns whose box range fits rows; if the last column alone is too tall, compress every 2nd box and label "1:2"); price axis RIGHT, labels every 2 boxes, tabular; current price filled pill on axis; tick every 5 columns at bottom, no dates; trend line from `pnfTrend` (support solid 1.5 px `--accent`, label "support"; resist dashed `--o`, label "resistance"; drawn only through empty cells); signal triangle at the breakout box when signal column visible; target dashed `--dim` line + right label "Target 126", or axis chip "Target 126 ▲/▼" at top/bottom edge when off scale; "trap" label under trap columns. `pfMini(i,opt)` `{w,h,cell:6}` → last 6-8 columns, no axis. `sigChip(si)` → fresh: `<span class="chip fresh buy|sell">Triple top buy · this week</span>` (age 1: "· last col"); stale: `<span class="chip stale">Double top buy · 3 cols ago</span>`; none: `<span class="chip stale">No signal</span>`; plus trap chip `<span class="chip pf-trap">Bull trap?</span>` (warn colour) when si.trap.
- panes.js [C2]: `rsiPane(i,opt) macdPane(i,opt) volPane(i,opt)` opt `{w,h,id}` → full `<div class="card" id="…">` HTML: header row "RSI 14 ··· 63" / "MACD 12,26,9 ··· +0.32" / "Volume ··· 1.4x avg"; SVG of last 26 weeks, y-scale labels on right (RSI 30/50/70, guides 70/30 dashed; MACD max/0/min with "0" label never hidden by the pill; volume none), last-value pill on the right axis, x-axis "26 wks" left / "now" right. MACD: line `--x`, signal `--o`, histogram bars `--accent` above 0 / `--faint` below, zero line. `spark(arr,{w,h})` tiny line svg; `miniBars(arr,{w,h})` tiny +/- bars. `eqChart(eh,bh,floorEq,{w,h})` equity (solid `--accent`) vs benchmark (dashed `--dim`) + floor line labelled "floor 9,000" + legend words. `intervalChart(edge,lo,hi,verdict,{w,h})` horizontal axis around 0, band bar, dot at edge, label verdict.
- dash.js [S1]: `SCREENS.home`. chart.js [S2a]: `SCREENS.chart`. order.js [S2b]: `SHEETS.order`. week.js [S3]: `SHEETS.week`. review.js [S4a]: `SCREENS.review` (calls `journalTabHTML()` when S.tab==="journal"). journal.js [S4b]: `journalTabHTML()` → HTML string; `jnResetTap()` two-tap reset.
- tweak.js [P]: `reportText() copyReport() openTweaks() readTweaks() applyTweaks() savePreset() loadPreset() delPreset() copyPreset() presets()` (esc lives in ui.js; tweak.js must not redeclare it). Modal restyled (tweak.css, `tw-` classes). Preset name via an in-modal text input (no prompt()).
- main.js [P]: `const BUILD="st-ui2-1";` resize → render; boot `loadData().then(()=>newPeriod(48213))`.

## Report JSON (tweak.js reportText) must contain
`build, src, seed, week, tweaked, tweaks, equity, ret, bench, excess, failed, fees, feePts /*fees % of start*/, orders, noCall, calls:[{s,wk,view,d,sig,pat,sigDir,sigAge,fresh,withSig,base,res:"right"|"wrong"|"open"}], neutrals, record:callStats(period), split:splitStats(period), journal:{n,edge,verdict}, ev:{src,bull,bear,n}, baseline: S.base||"pending"` (never null).

## DOM ids (e2e relies on these; exact)
Home: `#card-0..#card-5` (whole card is a `<button>`, opens chart), `#btnJournal`, `#btnAdvance` (primary; at period end replaced by `#btnReview` primary "Period review"), `#noteDismiss` (first-run note, localStorage `st.note1`), `#buildId` text contains BUILD.
Chart: `#btnBack`, `#btnPrev`, `#btnNext`, `#pfCard` (contains svg `#pf`), `#rsiCard`, `#macdCard`, `#volCard`, `#evLine`, `#btnHome` (outline), `#btnTrade` (primary).
Order sheet: `#sideBuy #sideSell #viewBull #viewBear #viewNeut #qtyMinus #qtyVal #qtyPlus #qty25 #qty50 #qtyMax #baseLine #noViewLine #capCheck #floorCheck #orderMsg #btnCancel #btnPlace`.
Week sheet: `#wkTitle`, `#btnCopy`, `#btnContinue` (primary; at end of period label "Period review" and goes to review).
Review: `#tabPeriod #tabJournal`; period ended: `#btnRerun #btnCopy #btnNextPeriod` (primary); mid-period bar = `#btnHome` (primary) + `#btnCopy`. Journal tab: `#btnResetJournal` (two-tap confirm, label changes to "Tap again to reset").
Global: `#devBadge`, modal `#modal.on`, Settings shows BUILD.

## Layout (base.css, owner U)
`#app` padding 12 px sides + safe-area insets; `#main` flex column gap 10 px. `.bar` sticky bottom, buttons flex:1, height 52. Sheet: fixed bottom full width, max-height 92dvh, scroll inside, slide-up 180 ms (prefers-reduced-motion: none); `#scrim` fixed dim 55%; hidden unless `body.sheet-on`. `body[data-layout=wide].sheet-order`: sheet becomes right panel (fixed right, top 0, width 360, full height, no scrim), `#app` gets padding-right 372 so chart stays visible left. Week sheet at wide: centred panel max-width 560, scrim on. `.grid2`/`.grid3` utilities. `.modal` full-screen dim + centred scrolling panel, shown with `.on`. `#toast` fixed above bar, pill, `.on` shows. `.btn.outline`. `.top` flex row: h1 18 px + `.sub` dim 12 px + dev badge right.

## Size targets
344x882: chart shows P&F + RSI + MACD without scroll (budget: top 44, header 56, chip row 30, pf card ≤300, RSI ≤104, MACD ≤104, bar 72); order sheet shows every row and both buttons (compact rows ~40 px). 816x568: dashboard shows all 6 cards without scroll (account card left column, cards 3x2 right is fine). More P&F columns on wider screens.

## Tests (node, no deps; owners)
- [E2] `test/evcalc.test.js`: base.bull+base.bear==1 (±1e-9) from DATA.ev and from computeEvidence on stand-in; DATA.ev has all 6 pattern + 8 ind keys; always-bullish bot over 200 windows (loadWindow(1e6+w*7919), bullish call on each stock each week of the period, resolve with game rule, base from evNow) |edge|/closed < 0.03; coin-flip bot same; ft in 0..1, lift = (ft-base)*100.
- [E1] `test/evidence.test.js`: exp sum, edge, band only at nLife≥30, "too few to tell" under 30, neutral excluded, base read from evNow (stub EV), splitStats rows sum to totals, freshStats, journal add/dedupe/reset with stub localStorage, liftCls rules.
- [K2] `test/game.test.js` + owns `test/_load.js` (ORDER add evcalc.js, evidence.js after pnf.js; sandbox stubs `render=()=>{}`, `BUILD="test"`; option to also load tweak.js for reportText): counter-signal call → withSig=false; sigAge counts columns; `pat` alias equals sig||"No signal"; order with no view counted in noCallCount; reportText baseline never null at weeks 0..10; stale signal shows age (sigChip text "cols ago" for age≥2, needs pfsvg.js loaded); journal split rows sum to totals; seed determinism.
- Existing must still pass: `test/data.test.js`, `test/bots.test.js`, `test/pnf.test.js`.
- [K3] `test/e2e.js` (rewrite; playwright preinstalled, never install; serve via test/serve.js) at 344x882, 624x912, 816x568, deviceScaleFactor 1: no page errors; no hscroll on every screen/sheet; bar buttons in viewport; home → `#card-0` → chart: `#pf` inside `#pfCard`; at 344 `#pfCard,#rsiCard,#macdCard` bottoms ≤ bar top; Trade → order sheet: every listed id inside viewport (buttons must be visible without scrolling at 344); set Bullish, qty +, Place → pos>0; reopen, Sell, qty +, Place → pos decreased; Advance ×10 with `#btnContinue` each week → review; `#tabJournal` shows journal; Rerun same seed + same scripted actions → identical `S.eqHist` and calls; Settings modal shows `st-ui2-1`. Shots `qa/shots/<w>x<h>-<screen>.png` for home, chart, order, week, review, journal.

## File ownership
| Maker | Files |
|---|---|
| E1 | `src/evidence.js`, `test/evidence.test.js` |
| E2 | `src/evcalc.js`, `src/data.js`, `tools/evidence.js`, `data/weekly.json` (adds `ev` only), `test/evcalc.test.js`, `docs/EVIDENCE.md` |
| G | `src/game.js`, `src/bots.js` |
| C1 | `src/pnf.js`, `src/pfsvg.js`, `src/pf.css` |
| C2 | `src/panes.js`, `src/panes.css` |
| U | `src/shell.html`, `src/ui.js`, `src/base.css`, `src/pro.css` |
| S1 | `src/dash.js`, `src/dash.css` |
| S2a | `src/chart.js`, `src/chart.css` |
| S2b | `src/order.js`, `src/order.css` |
| S3 | `src/week.js`, `src/week.css` |
| S4a | `src/review.js`, `src/review.css` |
| S4b | `src/journal.js`, `src/journal.css` |
| P | `src/tweak.js`, `src/tweak.css`, `src/main.js`, `src/inline.py`, `sw.js`, `manifest.webmanifest` |
| K2 | `test/_load.js`, `test/game.test.js` |
| K3 | `test/e2e.js`, `test/serve.js` |
| Integrator | anything, after all makers: build, delete `src/style.css`, run all tests, fix glue. Fast-maker code wins conflicts unless it breaks a test. |
Need a change in a file you don't own: put the exact patch in your reply; integrator applies.

## Maker reply format
Self-test your own file(s) (`node --check`, small vm load, or quick playwright render of a stub). Reply ≤3 lines + path(s): what works, what is an admin-default guess, any patch needed in another file.
