# Baseline: no-read strategies vs mandate

Date: 2026-11-22. Build st-slice-1. Defaults: mandate +3 pts over equal-weight watchlist, floor 10%, cap 50%, fee 0.5% per side, 10 weeks. Locked windows seeds 1e6+w*7919.
Score = mandate met and floor not hit. Signal reader: each week close, buy equal slices on a fresh P&F buy, sell all on fresh sell. (admin default: slice = equity/6, "fresh" = signal differs from prior week's.)

| data | windows | idle cash | random buys | copy benchmark | P&F signal reader |
|---|---|---|---|---|---|
| real | 200 | 21% | 20% | 0% | 16% |
| stand-in | 200 | 28% | 19% | 0% | 22% |

## Read
On real history the simple P&F signal reader (16%) does not beat the no-read bots (best 21%).
On stand-in data it scores 22%.
