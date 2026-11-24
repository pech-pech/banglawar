# Solver report (Checker SOLVE, build cs-proto-1)

Solver: test/solver.test.js, written from CONTRACT.md (C1-C7, R1-R7) only. src/engine.js and tools/gen-sheets.js were not read.
Input: data/sheets.json (240 sheets, bars [h,l,c], 120 weeks each). Run: `node test/solver.test.js` (exit 1 if any type is under 99%).

## Agreement per type

| type | n | agree | % |
|---|---|---|---|
| R1 Signal | 240 | 240 | 100.00 |
| R2 Support | 120 | 120 | 100.00 |
| R2b Resistance | 120 | 120 | 100.00 |
| R3 Trend line (3-way) | 240 | 240 | 100.00 |
| R4 Vertical count | 240 | 240 | 100.00 |
| R5 RSI | 240 | 240 | 100.00 |
| R6 MACD | 240 | 240 | 100.00 |
| R7 Divergence | 240 | 240 | 100.00 |

R4 is checked on every sheet: present exactly when R1 is a buy, null otherwise (both sides agree on all 240).
Discard violations (a shipped answer that the solver would have discarded: R3 no O column, R4 signal col <= 1, R5 within 1.0 of 30/50/70, R6 small hist, R7 both): 0 in every type.

## Disagreement classes

None. No sheet differs on any reading.

## Verdict

PASS, 100% on every type against the 99% bar. Two independent implementations of the contract text agree, so the conventions as written are unambiguous enough to reproduce exactly on this data.

## Contract ambiguities (none changed any answer on shipped sheets; settle them in the text)

1. R5 RSI weeks 0-13: "first value 50, simple-average seed weeks 1-14" does not say what indices 1-13 hold. Solver holds 50 until index 14. No effect on sheets (R5 is read at W>=60; R7 references are at t-12 or later, also past index 14), but would matter for sheets under about 27 weeks.
2. R7 "both = discard": not stated whether it means both found at the same t or anywhere across t=W and t=W-1. Solver discards if a Bearish and a Bullish hit occur at any tested t. A same-t clash is impossible (needs close above the 12-week max and below the 12-week min).
3. R7 when t=W-1 and t=W disagree in direction is the only way the above can trigger; no shipped sheet hit it, so behavior is untested.
4. R3 anchor window: "last 30 columns" is read as including the current column (if it is an O column, it can be the anchor). Not stated.
5. R1 "exceeds by 1+ box" for sells read as lo <= (j-2).lo - 1. Mirror stated only implicitly.
6. R6 hist == 0 or hist == prev (exact ties) have no direction; solver treats hist>=0 as Positive and hist>prev as rising. Both are inside the discard thresholds, so harmless.
7. R2/R2b return null when no completed column of that kind exists; the contract does not say that discards the sheet (gen rule "R2 or R2b must have answers" implies it).
