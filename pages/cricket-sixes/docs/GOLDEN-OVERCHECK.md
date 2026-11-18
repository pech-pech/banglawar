# GOLDEN-OVERCHECK

Independent per-over check of the Captain's Over (A1, Mid window, letter-scaled) against the wheel over model, on real mid-match states.
Tool: `node tools/golden-overcheck.mjs [seeds=60]`. Does not use tools/golden-sim.mjs.

Method: wheel-mode matches built through the store (seeds `oc-1-k`), both innings, advanced by real WheelOver at random stops; every over-start is a state
(150 seeds = 2818 states: 1355 batting, 1463 bowling). For each state: (a) `wheelOverModel(...).expect` (neutral R/P, same fx/centre/pairing/rival boost);
(b) a Captain's Over by `goldenReplay` (playOver + `pickX` hook), grade per ball from err ~ N(0, sd) against that ball's striker (bat) or M's bowler (bowl)
window; `random` = uniform +-400 ms. d_ = Captain minus wheel expect, per over. value = runs - 6 wk (bat), 6 wk - runs (bowl); worse = below the wheel average.

```
BATTING (inn2, we chase)  overs=1355  wheel mean runs 8.74 wkts 0.36
tapper  runs  wkts | d_runs d_wkts | d_value(runs-6wk, +good) | P%   G%   M%  | worse-by-runs% worse-by-value%
sd35    15.53 0.05 | 6.79 -0.31 | 8.67 | 84.3 15.4 0.3 | 5.8 3.0
sd60    13.12 0.17 | 4.39 -0.19 | 5.54 | 58.6 33.4 7.9 | 17.1 14.5
sd110   9.94 0.34 | 1.20 -0.02 | 1.30 | 34.4 32.4 33.2 | 42.4 36.6
random  6.26 0.54 | -2.48 0.18 | -3.59 | 12.0 14.7 73.3 | 79.1 70.4
BOWLING (inn1, rival bats)  overs=1463  wheel mean runs 9.43 wkts 0.27
tapper  runs  wkts | d_runs d_wkts | d_value(runs-6wk, +good) | P%   G%   M%  | worse-by-runs% worse-by-value%
sd35    3.64 0.69 | -5.79 0.42 | 8.32 | 85.7 14.0 0.3 | 2.1 3.8
sd60    5.58 0.57 | -3.85 0.31 | 5.69 | 60.4 33.0 6.7 | 12.5 15.5
sd110   8.59 0.37 | -0.84 0.10 | 1.46 | 35.7 33.6 30.7 | 37.8 41.4
random  12.38 0.15 | 2.95 -0.12 | -3.66 | 12.6 14.7 72.7 | 73.7 77.4
states=2818; bowling check: rival runs per over, Captain sd35 3.64 vs wheel 9.43 -> fewer (ok)
```

Read: batting sd35 scores 15.5 runs/over against a wheel 8.7 (+6.8, wickets 0.05 vs 0.36); sd60 +4.4; sd110 +1.2 runs, wickets level; random taps lose 2.5 runs.
Bowling: sd35 concedes 3.6 against 9.4 (-5.8) and takes 0.69 wkts vs 0.27; sd110 -0.8; random concedes +3.0. Bowling side gives fewer rival runs for every tapper except random.
The Captain's Over beats the wheel average for any tapper at sd 110 or better; only random taps go below it. A sd35 tapper is worse than the wheel average in 2-6% of overs.
Numbers only; no constant changed.
