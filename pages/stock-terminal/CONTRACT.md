# CONTRACT: stock-terminal slice (build id `st-slice-1`)
Lead: Opus (orchestrates only). Makers/checkers: Sonnet. All work in `/home/user/banglawar/pages/stock-terminal/`. Touch ONLY the files you own. No git commands (lead commits). Nobody asks questions: guess, label it `admin default` in a comment + your 5-line reply. M said: no interrupts, auto problem solve. FOLD ONLY: desktop/laptop layout NOT required (M 19:04).

## Game in one line
Masked real weekly price history, 6 stocks, 10 weekly turns, long only, P&F (2% box, 3-box reversal, high/low) + RSI14 + MACD(12,26,9) + volume. Beat equal-weight watchlist by mandate +3 pts, 10% floor. Simulation feel, broker-terminal wording (mandate, journal, call record, baseline; no game words). Look = proto (dark terminal, X blue `.x`, O orange `.o`). Min text 14 px (12 px only `.hd` labels), buttons 56 px, up/down never colour-only.

## Source layout (proto already split here by lead, line-for-line)
`src/shell.html` (markers `<!--STYLE-->`, `<!--SCRIPTS-->`), `src/style.css`, scripts in THIS load order:
`core.js` (RNG, DEFAULTS/T/tweaked, ema/rsi/macd/sma) → `data.js` → `pnf.js` → `game.js` (S, stockInfo, calls, place, advance, step, maxQty, openChart) → `bots.js` → `ui.js` (fmt/sg/$/pathOf, statusBar, panes, render) → `tweak.js` (report, tweak menu, presets) → `main.js` (BUILD, boot).
Classic `<script>` tags, shared top-level globals, `"use strict"` first line. No modules, no libraries, no network except `data/weekly.json`.
`src/inline.py` builds `../index.html` (fails loudly on a missing file). `index.html` is generated: never hand-edit.

## Globals (exact names)
- core.js: `mulberry32(seed)`, `gauss(r)`, `DEFAULTS`, `TWEAK_LABELS`, `T`, `tweaked()`, `ema, rsi, macd, sma`. DEFAULTS has `dataSrc:1` (1 real history, 0 stand-in).
- data.js: `let DATA=null;` `async function loadData()` (fetch `data/weekly.json`, decode, set DATA; on any error DATA stays null, never throws). `function dataSource()` → `"real"` if `T.dataSrc===1&&DATA` else `"standin"`. `function loadWindow(seed)` → `{codes:[6 str], bars:[6][n]{o,h,l,c,v}, hidden:[30][n]{o,h,l,c,v}, src:"real"|"standin"}`, `n=T.preWeeks+T.weeks`. Same seed + T + DATA → identical output. Keep `genSeries`, `codeFor` (stand-in path unchanged).
- pnf.js: `LB, boxOf, boxUp, priceOf, pnf(bars), pnfSignal(cols), vcount(cols)` (proto signatures) + NEW `pnfTrend(cols)`, `pnfTraps(cols)`, and `pfText(i, opt)`.
- game.js / ui.js: as proto. ui.js adds `chartFit()` → `{cols,rows}` for the current layout. Review baseline panel = `baselineHTML(S.base)` from bots.js.
- bots.js: `baseline()` → `{n, src, cash, rand, lock, signal}` (% of windows meeting mandate, integers) + `baselineHTML(b)` → HTML string.
- main.js: `const BUILD="st-slice-1";` resize → render; boot: `loadData().then(()=>newPeriod(48213))`.

## data/weekly.json format (v1) - prep-data.py writes, data.js reads
```
{"v":1,"nW":<int global week count>,"series":[{"id":"s01","k":"stock"|"etf","f":<first global week idx>,
  "c":[int...], "o":[int...], "h":[int...], "l":[int...], "v":[int...]}]}
```
- Global week index: Monday-based weeks; week 0 = week of the earliest date in any input file. No dates, tickers or names in the JSON (masking). id order = sorted ticker order, `s01..s44` stocks then `e01,e02` ETFs. id→ticker map only to `tools/prep-data.log` (NOT shipped; listed in `pages/stock-terminal/.gitignore`).
- Weekly bar: o = first Open of week, h = max High, l = min Low, c = last Close, v = sum Volume. Skip all-blank rows. Open==0 → previous Close. Raw OHLC (split-adjusted); ignore Adj Close.
- Week with no rows inside a series' life: carry forward (o=h=l=c=prev c, v=0).
- Encoding, unit u = round(ln(price)*2000): `c[0]` = u(c0) absolute, `c[i]` = u(ci)-u(c(i-1)) (delta of ROUNDED values, no drift). `o[i]=u(oi)-u(ci)`, `h[i]=u(hi)-u(ci)`, `l[i]=u(li)-u(ci)`. `v[i]=round(ln(vol+1)*100)` absolute.
- Decode: running sum of c; price = exp(units/2000). After decode h ≥ max(o,c), l ≤ min(o,c), all > 0 (clamp in prep).
- Run: `python3 -I tools/prep-data.py /mnt/project-files/games-design/stock-terminal/data/jacksoncrow-subset/ data/weekly.json` (src dir has `stocks/*.csv`, `etfs/*.csv`, header `Date,Open,High,Low,Close,Adj Close,Volume`).

## Real window rules (data.js, src "real")
r = mulberry32(seed). Stocks only (k=="stock"). Pick start week s uniformly (r) among weeks where ≥ 36 stock series fully cover [s, s+n). Shuffle covering stocks with r: first 6 = play, next 30 = hidden (if fewer than 30, fill with `genSeries` stand-ins). Per series rescale prices by `(20+r()*180)/bars[T.preWeeks-1].c`; rescale volume so series median v = `1e5*(0.5+r()*2)`. Codes from `codeFor(r,used)`. Fixed r() draw order → deterministic.

## P&F additions (pnf.js)
- `pfText(i,opt)` opt `{cols,rows}` (defaults cols 15, rows 13 if innerHeight<700 else 17). FIX proto bug: never crop a shown column. Pick the most recent K ≤ cols columns whose full box range ≤ rows; if the last column alone is taller than rows, show it alone, compressed by drawing every 2nd box (label `1:2` after axis). Price labels every 2 boxes; current-week boxes `.new`.
- `pnfTrend(cols)` → `{kind:"support"|"resist", col, box}|null`. Dorsey 45°: from the lowest O column in the last 20 cols, bullish support starts 1 box below its lo, rises 1 box/col; if a later column's lo breaks below the line, use bearish resistance from the highest X column in the last 20 (1 box above hi, falls 1 box/col). pfText draws it as `+` (class `tl`) in empty cells only.
- `pnfTraps(cols)` → `[{col, kind:"bull"|"bear"}]`: bull trap = column giving a double/triple-top buy by exactly 1 box, next column is O (reversed). Bear trap mirror. pfText adds a label row under the axis: `BT` / `bt` under that column. ui shows a "BULL TRAP"/"BEAR TRAP" chip beside the signal when the latest signal column is a trap.

## Layouts (style.css + ui.js) - FOLD ONLY
Fold cover 344x882 (main) and 475x638; inner 624x912, 704x783, 816x568 may use the proto 2-column split (≥640 px). No sideways scroll anywhere; bottom bar always reachable; safe-area insets. `chartFit()` picks cols/rows from the chart panel's real size (measure char width of the `pre` font). Watchlist header: `Watchlist · masked · real weekly history` or `· stand-in data` from `S.W.src`. Build id `BUILD` visible on watchlist footer and in Settings. No keyboard work.

## Bots (bots.js)
Locked windows: `loadWindow(1e6+w*7919)`, w = 0..T.baselineWindows-1, same `T`. Score each bot "mandate met and floor not hit":
`cash` idle; `rand` proto random-buy bot with `mulberry32(w+17)`; `lock` equal-weight copy of benchmark at start (0 excess, fails mandate); `signal` simple reader: each week close buy equal slices (cap/cash rules, fees) of stocks with a fresh `pnfSignal` buy, sell all on fresh sell.
`tools/sweep.js` (node, no deps): loads src core/data/pnf/bots via `test/_load.js`-style `vm` context with stub `localStorage`/`window`, reads `data/weekly.json` from disk into DATA, runs baseline for 200 real + 200 stand-in windows, prints a table, writes `docs/BASELINE.md`.

## PWA
`manifest.webmanifest` (name "Stock Terminal", short "Terminal", display standalone, orientation portrait, theme/bg `#0e1319`, icons 192/512/maskable 512). `sw.js`: VERSION = BUILD, NETWORK-FIRST for every GET (navigate → cached index.html fallback, others → cache fallback), precache `./`, index.html, manifest, icons, data/weekly.json. Icons from `src/mkicons.py` (PIL if present, else pure-python PNG): dark tile, blue X beside orange O. `CREDITS.md`: data = Kaggle jacksoncrow/stock-market-dataset (Oleh Onyshchak), Yahoo Finance origin via yfinance; licence not a clean grant, used as M's risk call 2026-11-22; tickers/dates masked, prices rescaled.

## Tests (node, no deps, `node test/<f>.js`, exit 1 on fail)
`test/_load.js` exports `load({data:true|false})` → vm context with core/data/pnf/bots (+game for e2e-free logic) loaded and DATA decoded from disk. `test/data.test.js`, `test/pnf.test.js`, `test/bots.test.js`. `test/e2e.js` uses `require('playwright')` (preinstalled; NEVER install), serves the folder via `test/serve.js` (node http), plays a full 10-week period at 344x882, 475x638, 624x912, 704x783, 816x568: no page errors, no horizontal scroll, bottom-bar buttons visible, P&F `pre` not wider than its panel; screenshots `qa/shots/<w>x<h>-<screen>.png` (deviceScaleFactor 1).

## File ownership
| Part | Owner | Files |
|---|---|---|
| A | maker-prep | `tools/prep-data.py`, `data/weekly.json`, `.gitignore` |
| B | maker-data | `src/data.js` |
| C | maker-pnf | `src/pnf.js` |
| D | maker-layout | `src/style.css`, `src/ui.js` |
| F | maker-bots | `src/bots.js`, `tools/sweep.js`, `docs/BASELINE.md` |
| G | maker-pwa | `src/inline.py`, `src/main.js`, `src/tweak.js`, `src/mkicons.py`, icons, `manifest.webmanifest`, `sw.js`, `CREDITS.md` |
| K1 | checker-data | `test/_load.js`, `test/data.test.js`, `test/bots.test.js` |
| K2 | checker-pnf | `test/pnf.test.js` |
| K3 | checker-e2e | `test/e2e.js`, `test/serve.js` |
Lead owns `src/core.js`, `src/game.js`, `src/shell.html`, this file. Need a change in a file you don't own: put an exact patch in your reply; integrator applies.
