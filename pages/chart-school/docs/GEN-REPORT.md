# GEN-REPORT (Chart School, cs-proto-1)
Seed 20261124. Run: `node tools/gen-sheets.js` (data from /home/user/stockdata/stocks/, engine = src/engine.js).

## Output
- data/sheets.json: 240 sheets, 816 KB (0.80 MB, limit 1.2 MB).
- Pool: 50000 draws over 44 stocks, 37055 distinct, 30731 valid sheet candidates (83%).
- Selection: greedy joint balancing (all 7 readings at once), 8-week spacing per stock, cap 12 sheets per stock (admin default). Stocks used: 44.
- Base: up10 0.592 over 88212 weeks. sigStats: Double top buy n=5358 follow=0.573; Triple top buy n=648 follow=0.591; Double bottom sell n=4064 follow=0.392; Triple bottom sell n=476 follow=0.389

## Achieved class mix (shipped, vs natural mix in the valid pool)
| type | mix |
|---|---|
| R1 | Double top buy 20% (nat 52%); Triple top buy 20% (nat 7%); Double bottom sell 20% (nat 30%); Triple bottom sell 20% (nat 4%); No signal 20% (nat 7%) |
| R3 | Above by 3+ boxes 34% (nat 61%); Within 2 boxes above 33% (nat 8%); On or below 33% (nat 31%) |
| R5 | Above 70 25% (nat 9%); 50 to 70 25% (nat 54%); 30 to 50 25% (nat 36%); Below 30 25% (nat 1%) |
| R6 | Positive rising 25% (nat 29%); Positive falling 25% (nat 25%); Negative rising 25% (nat 21%); Negative falling 25% (nat 25%) |
| R7 | Bearish 33% (nat 8%); Bullish 33% (nat 3%); None 34% (nat 89%) |
| R4 | reached 0% (nat 0%); 1-5 0% (nat 0%); 6-12 26% (nat 9%); 13+ 74% (nat 91%) |
| R2/R2b buckets | R2:0-3 13% (nat 23%); R2:4-7 13% (nat 15%); R2:8-14 13% (nat 9%); R2:15+ 13% (nat 2%); R2b:0-3 13% (nat 29%); R2b:4-7 13% (nat 15%); R2b:8-14 13% (nat 5%); R2b:15+ 13% (nat 1%) |

R4 exists on 97 sheets (buy signals only). r2key: R2 120, R2b 120.

## Discard rates (engine discards over distinct pool draws; a draw can hit several)
- R4: R1 not a buy 14997 (40%)
- R5: within 1.0 of 30/50/70 3687 (10%)
- R6: |hist| < 0.02 box 1038 (3%); |hist change| < 0.005 box 983 (3%)
- Sheet-level: a required reading missing 5336; columns<12 988; duplicate draw 12945; kept 30731 of 37055.

## Bot table (shipped sheets; gate: every bot under 40%, 6+ of 7 under 1%)
| type | n | random | most common | first / lowest-highest | note |
|---|---|---|---|---|---|
| R1 | 240 | 20.0% | 20.4% | 20.4% | most common = Double top buy; first = Double top buy |
| R3 | 240 | 33.3% | 33.8% | 33.8% | most common = Above by 3+ boxes; first = Above by 3+ boxes |
| R5 | 240 | 25.0% | 25.4% | 25.0% | most common = 30 to 50; first = Above 70 |
| R6 | 240 | 25.0% | 25.0% | 25.0% | most common = Negative falling; first = Positive rising |
| R7 | 240 | 33.3% | 33.8% | 33.3% | most common = None; first = Bearish |
| R2/R2b pooled | 240 | 3.3% | 11.3% | 10.0% | most common offset: R2 3, R2b 4; first = lowest row for R2, highest row for R2b |
| R2 | 120 | 3.2% | 9.2% | 7.5% | offset 3 |
| R2b | 120 | 3.4% | 13.3% | 12.5% | offset 4 |
| R4 | 97 | 1.4% | 9.3% | 0.0% | most common offset = 11 boxes from close; lowest 0.0%, highest 0.0% |

Sheets where a bot gets 6+ of 7 readings right: random 0.006%, most-common 0.00%, first-option 0.42% (limit 1%).

**Verdict: PASS.** Every bot under 40% on every type; 6+ of 7 under 1%.


## Not balanceable
- R4 distance bucket: objectives (3 x boxes above the column low) are almost always far above the close. Buckets reached and 1-5 hold no usable sheets in the pool (0%), so 6-12 vs 13+ is the best the data allows. Bots are still far under 40% on R4 (the answer is a box row, not a class).
- R2/R2b 15+ buckets are rare in the data (R2 2%, R2b 1% natural), limited by supply and 8-week spacing.
- The 50,000-draw pool contains about 13,000 duplicate (stock, week) draws; distinct draws are the figures above.
