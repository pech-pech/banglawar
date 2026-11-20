# Endless generator proto: results (run3)

Rooms: 40 (runSeeds x depths), verifyRoom.fast, up to 8 tries (seed+1 re-roll), then fallback.

## Tier 1 (10 rooms, 14 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 70.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 0.40 / 2 |
| stitch ms mean / max | 0.07 / 0.58 |
| verify s mean / max (offline) | 10.55 / 15.26 |
| pad-zone breaks (final room; rooms affected) | 5 (5 rooms; exit (5)) |
| top fail reasons (attempt count) | window (4); jitter (3) |

## Tier 2 (10 rooms, 16 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 50.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 0.60 / 2 |
| stitch ms mean / max | 0.09 / 0.68 |
| verify s mean / max (offline) | 10.06 / 22.14 |
| pad-zone breaks (final room; rooms affected) | 15 (5 rooms; spike (8); exit (5); crumble (2)) |
| top fail reasons (attempt count) | window (5); jitter (5); unsolvable (1) |

## Tier 3 (20 rooms, 49 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 40.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 1.45 / 6 |
| stitch ms mean / max | 0.06 / 0.76 |
| verify s mean / max (offline) | 12.40 / 44.12 |
| pad-zone breaks (final room; rooms affected) | 37 (17 rooms; crumble (20); crusher (9); exit (8)) |
| top fail reasons (attempt count) | window (23); jitter (7); unsolvable (6) |

## Total (40 rooms, 79 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 50.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 0.97 / 6 |
| stitch ms mean / max | 0.07 / 0.76 |
| verify s mean / max (offline) | 11.60 / 44.12 |
| pad-zone breaks (final room; rooms affected) | 57 (27 rooms; crumble (22); exit (18); crusher (9); spike (8)) |
| top fail reasons (attempt count) | window (32); jitter (15); unsolvable (7) |

## Chunks by fail rate (attempts containing the chunk that failed; min 5 attempts)

| chunk | attempts | fails | rate |
|---|---|---|---|
| m10-gate-shelf | 8 | 8 | 100.0% |
| e3-pillar-mid | 13 | 13 | 100.0% |
| x3-spike-guard | 16 | 14 | 87.5% |
| m2-ledges | 22 | 14 | 63.6% |
| m6-crumble-stairs | 17 | 10 | 58.8% |
| m5-gate-steps | 16 | 9 | 56.3% |
| e2-pillar-right | 16 | 8 | 50.0% |
| e4-crumble-start | 14 | 7 | 50.0% |
| m7-baffle | 6 | 3 | 50.0% |
| e1-pillar-left | 12 | 6 | 50.0% |
| x1-floor | 20 | 9 | 45.0% |
| x4-crumble-roof | 20 | 9 | 45.0% |
| m4-spike-pit | 19 | 8 | 42.1% |
| e5-spike-shelf | 5 | 2 | 40.0% |
| m9-crusher-ledge | 5 | 2 | 40.0% |

## Pass bar

- 95%+ within 8 re-rolls: 100.0% -> PASS
- pad-zone overlaps (INFO only, not a pass/fail since PADRULE=off): 57
- stitch < 30 ms: mean 0.07, max 0.76 -> PASS
- verify is offline (seconds per room), reported separately above.

## Sample accepted room, tier 1 (run 4, depth 1, re-rolls 0)

Chunks: e2-pillar-right, m3-crumble, m1-pillars, x1-floor  |  solver route input count: 3

```
.............
...S.........
#####........
#####........
#####........
.............
.......~~~~..
..~~~~.......
.............
.............
.............
........##...
...##...##...
....##.......
.............
.............
.............
.............
.....E.......
#############
```

Route: "16:f1 98:f2 218:f3"

## Sample accepted room, tier 2 (run 4, depth 8, re-rolls 0)

Chunks: e8-baffle, m2-ledges, m4-spike-pit, x3-spike-guard  |  solver route input count: 3

```
.....#.......
.....#...S...
.....#..#####
.....v..#####
........#####
.............
........#####
.............
#####........
.............
.............
...^^^..#####
...###..#####
........#####
.............
.............
.............
.............
...^^^^...E..
#############
```

Route: "39:f3 89:f2 151:f1"

## Sample accepted room, tier 3 (run 4, depth 15, re-rolls 0)

Chunks: e4-crumble-start, m1-pillars, m3-crumble, x4-crumble-roof  |  solver route input count: 4

```
.............
...S.........
~~~~~........
.............
.............
.............
...##........
...##...##...
.......##....
.............
.............
..~~~~.......
.......~~~~..
.............
.............
.............
....~~~~~....
.............
.....E.......
#############
```

Route: "39:f3 94:f2 159:f1 192:D"

