# Match wheel parity, T1 (task A5.3m, 2026-11-16)

Code: branch at 831fa97 (match wheel on the pulse: no coast, no auto-over, keyed wobble). Game code was read only.

## How it was run
- Tool: `tools/wheelmatch-parity.mjs` (already on `tickAt`, pulse cycle 1, taps after the 0.35 s guard). Variant `wheel`, seed `parity`, season path league 1, centre 30, rival boost +10.9 (OFF -9 equivalent, as PR #60).
- Teams per match from `parity|teams|k`, taps from `parity|tap|<tapper>|k`. Match k is the same for every tapper and every n.
- A scratch driver (not committed) imports the tool's own `chooseStop` / `baseGame` unchanged and adds two things: an `auto` cell (`WheelOver {auto:true}`, the store's own unaimed keyed landing, the "Auto rest of innings" path from over 1) and per-over landing counts. Check: its first 200 matches give exactly the tool's `--n 200` numbers (random 40.8, careful 49.5).
- Season sim: `tools/season-bot.mjs` / `season-sweep.mjs` play classic mode only (no wheel), so the match table comes from the wheel parity tool alone.
- n: 2500 per row, the smallest round n where 1 s.e. is at most 1.0 pp on every row (0.93 to 0.99). The two halves (k 0-1249, 1250-2499) are listed so the drift can be seen. A 95% band of +-1 pp would need about 9600 per row.

## Win table (pulse engine, JS)
| Tapper | n | Win % | s.e. | Halves | Old #60 (coast) | Delta |
|---|---|---|---|---|---|---|
| random (uniform STOP time) | 2500 | 38.7 | 1.0 | 38.3 / 39.1 | 36.5 | +2.2 |
| careful (avg, sd 0.110) | 2500 | 54.6 | 1.0 | 53.9 / 55.3 | 54.5 | +0.1 |
| good (sd 0.070) | 2500 | 59.5 | 1.0 | 58.7 / 60.3 | 58.2 | +1.3 |
| full Control (Slow 3, Steady 2, Guide; sd 0.080) | 2500 | 67.4 | 0.9 | 65.8 / 69.1 | 66.5 | +0.9 |
| Auto (store unaimed landing, every over) | 2500 | 36.5 | 1.0 | 37.4 / 35.6 | 36.5 (random row) | 0.0 |

Python pulse table for reference (SPEC 2c / 16.13): 29.1 / 49.4 / 55.8 / 68.8. The SPEC's "about -2 pp on skilled rows" does not show in JS: careful, good and full Control all sit at or a little above #60.

## Careful-tap landing share (share of overs)
| Tapper | Lands on aimed slice (after wobble) | Tick on aimed slice (before wobble) | Lands at or above median value (`careful` flag) | Lands on top-value slice | Overs a match |
|---|---|---|---|---|---|
| random | 9.0% | 8.9% | 53.1% | 12.7% | 18.7 |
| careful | 26.9% | 32.1% | 58.9% | 26.0% | 16.4 |
| good | 33.0% | 48.2% | 60.7% | 29.2% | 15.8 |
| full Control | 43.3% | 60.6% | 64.0% | 33.2% | 14.9 |
| Auto | 8.8% | - | 52.1% | 12.5% | 18.7 |

Aimed slice = the tool's target (best value with width >= 0.5 unit). Random and Auto land on it at about its width.

## Auto vs aimed (paired by match k)
| Pair | Win pp | s.e. |
|---|---|---|
| Auto - random | -2.2 | 1.3 |
| careful - Auto | +18.1 | 1.3 |
| good - Auto | +23.0 | 1.3 |
| full Control - Auto | +30.9 | 1.3 |
| full Control - careful | +12.8 | 1.3 |
| good - careful | +4.9 | 1.4 |

Auto matches a random tapper within noise (it lands by width, as SPEC 2h says). It never beats an aimed tapper.

## M call needed?
No. No row moves more than 3 pp from #60 (largest: random +2.2, about 2 s.e.). Note for the lead: the skilled rows did not drop the expected ~2 pp. JS is still about 5 pp over the python pulse table on careful and 9.6 pp over on random. That gap was already there in #60 and is not new.
