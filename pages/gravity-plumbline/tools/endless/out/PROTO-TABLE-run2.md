# Endless generator proto: results (run2)

Rooms: 40 (runSeeds x depths), verifyRoom.fast, up to 8 tries (seed+1 re-roll), then fallback.

## Tier 1 (10 rooms, 14 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 70.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 0.40 / 2 |
| stitch ms mean / max | 0.10 / 0.29 |
| verify s mean / max (offline) | 11.94 / 18.45 |
| pad-zone breaks (final room; rooms affected) | 0 (0 rooms; none) |
| top fail reasons (attempt count) | window (4); jitter (3) |

## Tier 2 (10 rooms, 18 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 40.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 0.80 / 2 |
| stitch ms mean / max | 0.07 / 0.17 |
| verify s mean / max (offline) | 11.72 / 33.88 |
| pad-zone breaks (final room; rooms affected) | 0 (0 rooms; none) |
| top fail reasons (attempt count) | window (7); jitter (6); unsolvable (1) |

## Tier 3 (20 rooms, 54 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 25.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 1.70 / 5 |
| stitch ms mean / max | 0.07 / 0.16 |
| verify s mean / max (offline) | 13.48 / 30.83 |
| pad-zone breaks (final room; rooms affected) | 0 (0 rooms; none) |
| top fail reasons (attempt count) | window (26); jitter (13); unsolvable (8) |

## Total (40 rooms, 86 attempts)

| metric | value |
|---|---|
| solvable+ok first try | 40.0% |
| accepted within 8 tries | 100.0% (0 fallback) |
| re-rolls mean / max | 1.15 / 5 |
| stitch ms mean / max | 0.07 / 0.29 |
| verify s mean / max (offline) | 12.86 / 33.88 |
| pad-zone breaks (final room; rooms affected) | 0 (0 rooms; none) |
| top fail reasons (attempt count) | window (37); jitter (22); unsolvable (9) |

## Chunks by fail rate (attempts containing the chunk that failed; min 5 attempts)

| chunk | attempts | fails | rate |
|---|---|---|---|
| m10-gate-shelf | 14 | 14 | 100.0% |
| e5-spike-shelf | 8 | 8 | 100.0% |
| e3-pillar-mid | 11 | 11 | 100.0% |
| x7-baffle | 5 | 5 | 100.0% |
| m2-ledges | 25 | 18 | 72.0% |
| x3-spike-guard | 16 | 11 | 68.8% |
| m5-gate-steps | 12 | 8 | 66.7% |
| x2-high-ledge | 15 | 10 | 66.7% |
| m7-baffle | 6 | 4 | 66.7% |
| m4-spike-pit | 25 | 16 | 64.0% |
| x4-crumble-roof | 17 | 10 | 58.8% |
| e4-crumble-start | 19 | 11 | 57.9% |
| e1-pillar-left | 9 | 5 | 55.6% |
| m3-crumble | 33 | 12 | 36.4% |
| e2-pillar-right | 17 | 6 | 35.3% |

## Pass bar

- 95%+ within 8 re-rolls: 100.0% -> PASS
- 0 pad breaks: 0 -> PASS
- stitch < 30 ms: mean 0.07, max 0.29 -> PASS
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
.......E.....
#############
```

Route: "31:f1 108:f2 218:f3"

## Sample accepted room, tier 2 (run 4, depth 8, re-rolls 0)

Chunks: e8-baffle, m2-ledges, m4-spike-pit, x3-spike-guard  |  solver route input count: 2

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
.....#...#...
.....#.E.#...
#############
```

Route: "49:f3 75:f2"

## Sample accepted room, tier 3 (run 4, depth 15, re-rolls 0)

Chunks: e4-crumble-start, m1-pillars, m3-crumble, x4-crumble-roof  |  solver route input count: 3

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
.............
.....####....
.....#.E.....
#############
```

Route: "31:f1 108:f2 218:f3"

