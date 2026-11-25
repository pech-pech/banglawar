# Solver report (Checker SOLVE, build cs-proto-1, round 2: C5/R3 Dorsey BSL/BRL)

Solver: test/solver.test.js, written from CONTRACT.md (C1-C7, R1-R7) only. src/engine.js and tools/gen-sheets.js were not read.
Input: data/sheets.json (240 sheets, bars [h,l,c], 120 weeks each). Run: `node test/solver.test.js` (exit 1 if any type is under 99%).

## Agreement per type

| type | n | agree | % |
|---|---|---|---|
| R1 Signal | 240 | 240 | 100.00 |
| R2 Support | 121 | 121 | 100.00 |
| R2b Resistance | 119 | 119 | 100.00 |
| R3 Trend line (3-way) | 240 | 240 | 100.00 |
| R4 Vertical count | 240 | 240 | 100.00 |
| R5 RSI | 240 | 240 | 100.00 |
| R6 MACD | 240 | 240 | 100.00 |
| R7 Divergence | 240 | 240 | 100.00 |

R4 is checked on every sheet: present exactly when R1 is a buy, null otherwise (both sides agree on all 240).
Discard violations (a shipped answer that the solver would have discarded: R3 no O/X column, R4 signal col <= 1, R5 within 1.0 of 30/50/70, R6 small hist, R7 both): 0 in every type.

## Disagreement classes

None. No sheet differs on any reading.

## Verdict

PASS, 100% on every type against the 99% bar. Two independent implementations of the contract text agree, so the conventions as written are unambiguous enough to reproduce exactly on this data.

R3 mix on the regenerated sheets: Uptrend 3+ boxes above support 82, Uptrend near support 77, Downtrend below resistance 81. Solver implements the new C5 (whole-chart lowest O / highest X start, 1 box per column, flip on break) from the contract text only; first run after the text change gave 100% on R3 once sheets.json carried the new option texts.

## New C5 / R3 ambiguities (the solver's reading agreed with the shipped sheets, but settle them in the text)

a. "start at whichever comes first": read as the earlier column index of (lowest O column, highest X column). Not stated that it is the column index rather than the time of the extreme box.
b. "line box at that column": read as start + dir*(j - anchorCol), with the anchor column itself at the start value (1 box under the O low, or 1 above the X top). Whether the anchor column counts as step 0 is not stated.
c. "first later O column": later than the line's anchor column, not later than the previous break. Only the anchor reading was used.
d. "between the BSL anchor and the break": read as inclusive of both the anchor column and the break column. The break column is an O column so it cannot hold an X top, but the anchor column can matter when it is an X-bearing flipped column (a BRL anchor is an X column; for a BSL break the range starts at the BSL anchor, an O column). Inclusiveness at the ends is unstated.
e. "ties: latest" is stated for the flip extreme; for the initial whole-chart extreme it is "ties earliest". The asymmetry is deliberate in the text but easy to misread.
f. If no X column lies between the BSL anchor and the break (or no O column for the reverse), the text gives no start for the new line. Solver keeps the old line active; no shipped sheet hit it.
g. A chart with only X columns (or only O columns) still has a start by the text; a one-column chart is not addressed. Solver returns discard if neither exists.
h. R3 "closeBox - line" uses the line value at the current column (the last column), even when the current column is the break column itself. Read as stated.
i. R3 near-support covers closeBox - line <= 2 including zero or negative (close at or below a still-active BSL, possible because breaks are tested on column lows, not closes). Intended but not spelled out.

## Earlier contract ambiguities (unchanged; none changed any answer on shipped sheets)

1. R5 RSI weeks 0-13: "first value 50, simple-average seed weeks 1-14" does not say what indices 1-13 hold. Solver holds 50 until index 14. No effect on sheets (R5 is read at W>=60; R7 references are at t-12 or later, also past index 14), but would matter for sheets under about 27 weeks.
2. R7 "both = discard": not stated whether it means both found at the same t or anywhere across t=W and t=W-1. Solver discards if a Bearish and a Bullish hit occur at any tested t. A same-t clash is impossible (needs close above the 12-week max and below the 12-week min).
3. R7 when t=W-1 and t=W disagree in direction is the only way the above can trigger; no shipped sheet hit it, so behavior is untested.
4. (Superseded by new C5: the old 30-column anchor window no longer exists.)
5. R1 "exceeds by 1+ box" for sells read as lo <= (j-2).lo - 1. Mirror stated only implicitly.
6. R6 hist == 0 or hist == prev (exact ties) have no direction; solver treats hist>=0 as Positive and hist>prev as rising. Both are inside the discard thresholds, so harmless.
7. R2/R2b return null when no completed column of that kind exists; the contract does not say that discards the sheet (gen rule "R2 or R2b must have answers" implies it).
