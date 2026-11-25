# GEN-REPORT (Chart School, cs-v2-1)
Seed 20261124. Run: `node tools/gen-sheets.js` (data from /home/user/stockdata/stocks/, engine = src/engine.js).

## Output
- data/sheets.json: 480 sheets, 2441 KB (2.38 MB, limit 2.5 MB).
- Pool: 50000 draws over 44 stocks, 37055 distinct, 14961 valid sheet candidates (40%).
- Selection: greedy joint balancing (all 9 readings at once), 8-week spacing per stock, cap 16 sheets per stock (admin default); window 84 weeks (size limit). Stocks used: 44.
- Base: up10 0.592 over 88212 weeks. upH {"3":0.549,"4":0.557,"5":0.566,"6":0.571,"7":0.579,"8":0.583,"9":0.589,"10":0.592}. Sector map: pre-2018 sectors, ETF bars aligned by ISO week, windows without full sector coverage dropped. sigStats: Double top buy n=5358 follow=0.573; Triple top buy n=648 follow=0.591; Double bottom sell n=4064 follow=0.392; Triple bottom sell n=476 follow=0.389

## Achieved class mix (shipped, vs natural mix in the valid pool)
| type | mix |
|---|---|
| R1 | Double top buy 25% (nat 51%); Triple top buy 15% (nat 7%); Double bottom sell 29% (nat 30%); Triple bottom sell 13% (nat 4%); No signal 18% (nat 8%) |
| R3 | Uptrend, 3+ boxes above support 39% (nat 65%); Uptrend, near support 25% (nat 3%); Downtrend, below resistance 37% (nat 32%) |
| R5 | Above 70 18% (nat 8%); 50 to 70 29% (nat 54%); 30 to 50 39% (nat 37%); Below 30 14% (nat 2%) |
| R6 | Positive rising 24% (nat 29%); Positive falling 24% (nat 25%); Negative rising 22% (nat 21%); Negative falling 30% (nat 24%) |
| R7 | Bearish 32% (nat 7%); Bullish 29% (nat 3%); None 39% (nat 89%) |
| S1 | Double top buy 26% (nat 59%); Triple top buy 18% (nat 9%); Double bottom sell 24% (nat 20%); Triple bottom sell 13% (nat 3%); No signal 20% (nat 9%) |
| S2 | Sector uptrend, 3+ boxes above support 39% (nat 70%); Sector uptrend, near support 25% (nat 4%); Sector downtrend, below resistance 36% (nat 26%) |
| R4 | reached 0% (nat 0%); 1-5 0% (nat 0%); 6-12 32% (nat 9%); 13+ 68% (nat 91%) |
| R2/R2b buckets | R2:0-3 15% (nat 23%); R2:4-7 14% (nat 15%); R2:8-14 11% (nat 9%); R2:15+ 8% (nat 2%); R2b:0-3 14% (nat 29%); R2b:4-7 15% (nat 14%); R2b:8-14 14% (nat 5%); R2b:15+ 9% (nat 1%) |

R4 exists on 191 sheets (buy signals only). r2key: R2 230, R2b 250.

## Discard rates (engine discards over distinct pool draws; a draw can hit several)
- R4: R1 not a buy 8107 (22%)
- R5: within 1.0 of 30/50/70 2005 (5%)
- R6: |hist| < 0.02 box 593 (2%); |hist change| < 0.005 box 592 (2%)
- R2: no completed O column 1 (0%)
- Sheet-level: columns<12 2943; sector coverage incomplete 16572; a required reading missing 2579; duplicate draw 12945; kept 14961 of 37055.

## Bot table (shipped sheets; gate: every bot under 40% per type, 3 of 3 under 10%)
| type | n | random | most common | first / lowest-highest | note |
|---|---|---|---|---|---|
| R1 | 480 | 20.0% | 29.4% | 25.2% | most common = Double bottom sell; first = Double top buy |
| R3 | 480 | 33.3% | 38.5% | 38.5% | most common = Uptrend, 3+ boxes above support; first = Uptrend, 3+ boxes above support |
| R5 | 480 | 25.0% | 39.0% | 17.7% | most common = 30 to 50; first = Above 70 |
| R6 | 480 | 25.0% | 29.6% | 24.4% | most common = Negative falling; first = Positive rising |
| R7 | 480 | 33.3% | 39.4% | 31.9% | most common = None; first = Bearish |
| S1 | 480 | 20.0% | 26.3% | 26.3% | most common = Double top buy; first = Double top buy |
| S2 | 480 | 33.3% | 38.8% | 38.8% | most common = Sector uptrend, 3+ boxes above support; first = Sector uptrend, 3+ boxes above support |
| R2/R2b pooled | 480 | 3.7% | 11.9% | 7.7% | most common offset: R2 4, R2b 4; first = lowest row for R2, highest row for R2b |
| R2 | 230 | 3.4% | 14.8% | 5.7% | offset 4 |
| R2b | 250 | 4.0% | 9.2% | 9.6% | offset 4 |
| R4 | 191 | 1.4% | 11.5% | 0.0% | most common offset = 11 boxes from close; lowest 0.0%, highest 0.0% |

Charts where a bot gets 3 of 3 picked readings right (CSE.pickReads, 20 seeds per sheet): random 1.148%, most-common 1.74%, first-option 4.42% (limit 10%).

**Verdict: PASS.** Every bot under 40% on every type; 3 of 3 under 10%.


## Not balanceable
- R4 distance bucket: objectives (3 x boxes above the column low) are almost always far above the close. Buckets reached and 1-5 hold no usable sheets in the pool (0%), so 6-12 vs 13+ is the best the data allows. Bots are still far under 40% on R4 (the answer is a box row, not a class).
- R2/R2b 15+ buckets are rare in the data (R2 2%, R2b 1% natural), limited by supply and 8-week spacing.
- The 50,000-draw pool contains about 13,000 duplicate (stock, week) draws; distinct draws are the figures above.
