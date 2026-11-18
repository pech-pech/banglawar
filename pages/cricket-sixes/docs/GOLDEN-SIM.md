# Golden Over sim (minimum grid)

Real engine, whole wheel matches via store commands (tools/golden-sim.mjs), careful wheel play, Captain's Over on over 10 both innings, N = 1000 matches per setup, same seeds. Tie = 0.5. "Runs per Captain's Over" is lower-is-better for the bowl innings and higher-is-better for the chase, pooled here; compare against the wheel average over the same overs.

| Setup | Rival offset | N | Win % | Runs / Captain's Over | Wheel avg (same overs) |
|---|---|---|---|---|---|
| (a) baseline, no Captain's Over | -9 (live) | 1000 | 52.6 | - | - |
| (b) Captain's Over sd 35 ms | -9 | 1000 | 66.8 | 5.84 | 8.34 |
| (c) Captain's Over sd 110 ms | -9 | 1000 | 55.3 | 8.18 | 8.37 |
| baseline, no Captain's Over | -11 | 1000 | 50.3 | - | - |
| (b) Captain's Over sd 35 ms | -11 | 1000 | 62.2 | 6.45 | 8.49 |
| (b) + variant Perfect = best of 2 + floor (sim-local) | -9 | 1000 | 63.5 | 6.35 | 8.35 |

Passes 60% at sd35 careful -9: yes
