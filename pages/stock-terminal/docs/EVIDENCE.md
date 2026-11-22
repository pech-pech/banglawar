# EVIDENCE (build st-ui2-1)

`data/weekly.json` carries a top-level `ev` key written by `node tools/evidence.js` (stock series only, 44 stocks, weeks with index >= 50, src "real"). `src/evcalc.js` holds the same maths (`computeEvidence`) and `evNow()`; with real data the game reads `DATA.ev`, otherwise it computes a stand-in from the visible window (start week 14).

## Method
- A call at week i: box = boxOf(close). Right if a later week's high reaches box+3 boxes before its low reaches box-3 (bull; mirror for bear). Same week both: that week's close vs open. Same rule as the game's resolveCalls.
- Base = share of every stock-week resolved up first (bull) / down first (bear). bull + bear = 1.
- Pattern fires the week a column first exceeds the prior same-direction column; triple when the two prior tops/bottoms match. Traps: 1-box breakout column followed by a reversal column, labelled when the reversal forms (bull trap judged as a bear call, bear trap as a bull call).
- Indicator rows: hit share of the called direction over every week in that state (RSI 14 above 60 / below 40, MACD histogram sign, close vs 10 week average, 4 week return above/below the equal-weight mean of all stocks).
- ft = hit share, lo/hi = 95% Wilson band, lift = (ft - same-direction base) in points.

## Numbers (this data set, raw split-adjusted OHLC)
Base bull 62.5%, bear 37.5%, n 86,391.

| Pattern | seen | hit | band | lift |
|---|---|---|---|---|
| Double-top buy | 5218 | 60.5% | 59.2-61.8 | -2.0 |
| Triple-top buy | 652 | 63.5% | 59.7-67.1 | +1.0 |
| Double-bottom sell | 4033 | 40.0% | 38.5-41.5 | +2.5 |
| Triple-bottom sell | 448 | 39.7% | 35.3-44.3 | +2.2 |
| Bull trap | 1077 | 39.0% | 36.1-41.9 | +1.5 |
| Bear trap | 899 | 58.4% | 55.1-61.5 | -4.1 |

Indicator states sit within about 1 point of base (RSI >60 +0.7, RSI <40 +0.5, MACD h + -0.3, MACD h - -0.4, above/below 10 wk average 0.0, RS rising/falling -0.4). Read: direction drift is the story; buy signals do not beat the bull base, sell patterns beat the bear base by a few points while staying under a coin flip.

The offline study in `SIGNAL-STATS.md` used Adj Close bars and got base 64.2% / 35.8%; the shipped file uses raw OHLC, so counts and base differ by about 2 points. Patterns match in direction and size.

## Known limits
- Survivor set: 44 large stocks that exist today, data ends early 2020. Winners in hindsight inflate the bull base and flatter every bull call.
- Overlap: weekly calls overlap and signals cluster, so calls are not independent. The Wilson bands are too narrow; a band that excludes base is weak evidence.
- Lab reports, not promises: these are hit shares of a simple rule in a simulation, not a forecast or advice.
- Window rescaling changes box alignment slightly, so a 10 week period's own base can differ a little from the table.
