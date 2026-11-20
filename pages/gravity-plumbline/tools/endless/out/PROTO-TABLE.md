# Endless generator proto: results

Rooms: 200 (runSeeds x depths), verifyRoom.fast, up to 8 tries (seed+1 re-roll), then fallback.

## Tier 1 (50 rooms, 146 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 40.0% |
| accepted within 8 tries | 98.0% (1 fallback) |
| re-rolls mean / max | 1.94 / 8 |
| stitch ms mean / max | 0.04 / 0.81 |
| verify s mean / max (offline) | 8.93 / 24.40 |
| pad-zone breaks (final room; rooms affected) | 61 (35 rooms; exit (24); start (20); crumble (17)) |
| top fail reasons (attempt count) | window (96); jitter (96); unsolvable (1) |

## Tier 2 (50 rooms, 101 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 42.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 1.02 / 5 |
| stitch ms mean / max | 0.06 / 0.81 |
| verify s mean / max (offline) | 10.44 / 27.78 |
| pad-zone breaks (final room; rooms affected) | 157 (50 rooms; start (52); spike (38); exit (34); crumble (29); gate (4)) |
| top fail reasons (attempt count) | window (47); jitter (42); unsolvable (4) |

## Tier 3 (100 rooms, 210 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 52.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 1.10 / 7 |
| stitch ms mean / max | 0.05 / 0.83 |
| verify s mean / max (offline) | 18.39 / 59.22 |
| pad-zone breaks (final room; rooms affected) | 338 (100 rooms; spike (83); exit (81); crusher (64); start (58); crumble (31); gate (21)) |
| top fail reasons (attempt count) | window (100); jitter (72); unsolvable (10) |

## Total (200 rooms, 457 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 46.5% |
| accepted within 8 tries | 99.5% (1 fallback) |
| re-rolls mean / max | 1.29 / 8 |
| stitch ms mean / max | 0.05 / 0.83 |
| verify s mean / max (offline) | 13.61 / 59.22 |
| pad-zone breaks (final room; rooms affected) | 556 (185 rooms; exit (139); start (130); spike (121); crumble (77); crusher (64); gate (25)) |
| top fail reasons (attempt count) | window (243); jitter (210); unsolvable (15) |

## Chunks by fail rate (attempts containing the chunk that failed; min 5 attempts)

| chunk | attempts | fails | rate |
|---|---|---|---|
| x3-spike-guard | 48 | 41 | 85.4% |
| m2-ledges | 175 | 146 | 83.4% |
| m7-baffle | 60 | 44 | 73.3% |
| x5-gate-roof | 26 | 18 | 69.2% |
| x4-crumble-roof | 33 | 22 | 66.7% |
| x1-floor | 130 | 85 | 65.4% |
| e1-pillar-left | 126 | 80 | 63.5% |
| e4-crumble-start | 47 | 29 | 61.7% |
| e8-baffle | 39 | 24 | 61.5% |
| m11-zigzag | 13 | 8 | 61.5% |
| e3-pillar-mid | 83 | 51 | 61.4% |
| e2-pillar-right | 76 | 46 | 60.5% |
| m3-crumble | 152 | 88 | 57.9% |
| x7-baffle | 28 | 16 | 57.1% |
| m6-crumble-stairs | 73 | 40 | 54.8% |

## Pass bar

- 95%+ within 8 re-rolls: 99.5% -> PASS
- 0 pad breaks: 556 -> FAIL
- stitch < 30 ms: mean 0.05, max 0.83 -> PASS
- verify is offline (seconds per room), reported separately above.

## Sample accepted room, tier 1 (run 4, depth 1, re-rolls 1)

Chunks: e1-pillar-left, m3-crumble, m1-pillars, x2-high-ledge  |  solver route input count: 3

```
.............
...........S.
.........####
.........####
.........####
.............
.......~~~~..
.............
..~~~~.......
.............
.............
........##...
...##...##...
....##.......
.............
.............
.....#####...
.............
.......E.....
#############
```

Route: "36:f3 80:f2 190:f1"

## Sample accepted room, tier 2 (run 4, depth 8, re-rolls 0)

Chunks: e8-baffle, m2-ledges, m4-spike-pit, x3-spike-guard  |  solver route input count: 3

```
......#......
......#....S.
......#..####
......v..####
.........####
.............
........#####
.............
#####........
.............
.............
.............
........#####
...^^^..#####
...###..#####
.............
.............
.............
....^.E.^....
#############
```

Route: "37:f3 92:f2 175:f3"

## Sample accepted room, tier 3 (run 4, depth 15, re-rolls 4)

Chunks: e1-pillar-left, m6-crumble-stairs, m6-crumble-stairs, x1-floor  |  solver route input count: 3

```
.............
.S...........
####.........
####.........
####.........
.............
~~~..........
.....~~~.....
.........~~~.
.............
.............
~~~..........
.....~~~.....
.........~~~.
.............
.............
.............
.............
......E......
#############
```

Route: "41:f1 76:f2 222:f3"

