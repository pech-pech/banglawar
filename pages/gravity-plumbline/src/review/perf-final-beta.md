# Frame-time compare, old build vs final (beta)

`FLUSH=1 node src/test/perf-probe.js`, 3 alternating rounds, 300 frames per row, 475x638 at dpr 2, 4x CPU throttle.
Each timed frame ends with a 1x1 read-back, so the software raster flush is counted.
Headless software canvas: these numbers rank changes. They are NOT phone numbers.
Old = 40d415b (before the review's art, trail and lighting patches). Final = 94201d4.
Columns: size, room, quality, median ms, p95 ms, avg ms, draw errors. Round 3 ran with more machine load (both builds slower).

Result: final is faster than old in full (lab medians 99.9 / 108.0 / 112.5 vs 146.3 / 143.8 / 167.3) and lite
(62.3 / 68.7 / 70.6 vs 113.8 / 118.5 / 137.8); off is the same within spread. Gate (full at most 10% slower, lite and off not slower): pass.

Thu Nov 19 20:31:50 UTC 2026
## run 1 BASE 40d415b
| 475x638 | lab | full | 146.30 | 173.80 | 149.78 | 0 |
| 475x638 | lab | lite | 113.80 | 132.60 | 115.52 | 0 |
| 475x638 | lab | off | 49.50 | 62.40 | 50.96 | 0 |
| 475x638 | tut | full | 130.40 | 160.60 | 134.07 | 0 |
| 475x638 | tut | lite | 100.10 | 124.00 | 102.74 | 0 |
| 475x638 | tut | off | 38.00 | 45.70 | 38.81 | 0 |
## run 1 FINAL 94201d4
| 475x638 | lab | full | 99.90 | 119.80 | 102.91 | 0 |
| 475x638 | lab | lite | 62.30 | 82.00 | 64.31 | 0 |
| 475x638 | lab | off | 45.90 | 57.00 | 47.18 | 0 |
| 475x638 | tut | full | 86.40 | 107.40 | 88.98 | 0 |
| 475x638 | tut | lite | 49.20 | 58.30 | 50.03 | 0 |
| 475x638 | tut | off | 37.90 | 50.60 | 39.34 | 0 |
## run 2 BASE 40d415b
| 475x638 | lab | full | 143.80 | 175.10 | 148.47 | 0 |
| 475x638 | lab | lite | 118.50 | 147.60 | 121.84 | 0 |
| 475x638 | lab | off | 51.90 | 65.70 | 53.59 | 0 |
| 475x638 | tut | full | 137.40 | 165.50 | 140.20 | 0 |
| 475x638 | tut | lite | 104.60 | 126.00 | 106.31 | 0 |
| 475x638 | tut | off | 39.80 | 44.00 | 40.20 | 0 |
## run 2 FINAL 94201d4
| 475x638 | lab | full | 108.00 | 132.60 | 110.92 | 0 |
| 475x638 | lab | lite | 68.70 | 90.80 | 71.30 | 0 |
| 475x638 | lab | off | 52.70 | 79.20 | 55.55 | 0 |
| 475x638 | tut | full | 102.00 | 138.70 | 104.93 | 0 |
| 475x638 | tut | lite | 54.30 | 70.80 | 56.34 | 0 |
| 475x638 | tut | off | 43.20 | 55.40 | 44.41 | 0 |
## run 3 BASE 40d415b
| 475x638 | lab | full | 167.30 | 234.30 | 177.01 | 0 |
| 475x638 | lab | lite | 137.80 | 177.60 | 142.19 | 0 |
| 475x638 | lab | off | 60.00 | 88.50 | 62.95 | 0 |
| 475x638 | tut | full | 161.70 | 234.70 | 168.91 | 0 |
| 475x638 | tut | lite | 117.80 | 152.00 | 121.50 | 0 |
| 475x638 | tut | off | 46.80 | 69.90 | 49.01 | 0 |
## run 3 FINAL 94201d4
| 475x638 | lab | full | 112.50 | 145.40 | 116.03 | 0 |
| 475x638 | lab | lite | 70.60 | 96.60 | 73.49 | 0 |
| 475x638 | lab | off | 57.30 | 81.00 | 59.58 | 0 |
| 475x638 | tut | full | 102.60 | 136.80 | 105.53 | 0 |
| 475x638 | tut | lite | 54.20 | 66.30 | 55.57 | 0 |
| 475x638 | tut | off | 43.20 | 62.10 | 45.51 | 0 |
Thu Nov 19 20:49:32 UTC 2026
