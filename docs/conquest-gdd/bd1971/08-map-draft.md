# 08 - Map draft: East Bengal 1971, scenario `liberation-1971` (SCHEMATIC)

Status: **design data for owner review, nothing decided except the owner decisions listed in the change log at the end.** Date: 2026-10-03. Draft by the map sub-agent; corrections from the fact-checks applied the same day (see "Change log (corrections applied)" at the end); no code, no art.

> **Art and asset statements are PROVISIONAL (art method undecided).** Anything below about how a cell or tile would look (the expansion rule in section 0, glyph or marker letters) describes data, not a decided picture or production method. Content limits on any picture (section 7) stay binding whatever the method.
Scope: a hand-made coarse layout (32x32 cells, each cell = a 4x4 block of the final ~128x128 tile map) for the scenario named in [03-role-mapping-options.md](03-role-mapping-options.md) (D-A1 border re-entry, D-C terrain relabel, D-E-AI garrison positions, D-F2 surrender test). Played from the Bangladeshi side only.

> **THIS IS A SCHEMATIC, NOT A SURVEY.** Rivers, coasts, borders, hills and garrison-position placements are simplified from the research files and from general geographic knowledge of the delta (marked UNVERIFIED where the files do not carry it). Nothing here is a legal or military boundary. Every sector boundary is PROVISIONAL because the sources disagree. Check against Banglapedia, the Liberation War Museum and an atlas before any shipping text relies on a position.

Conventions: `[Tn]` = source n in [01-timeline-forces.md](01-timeline-forces.md); `[Gn]` = source n in [02-geography-logistics-civilian.md](02-geography-logistics-civilian.md); "GDD" = [../GDD.md](../GDD.md). Coordinates are **(x, y)** = (column, row), 0-based, x grows east, y grows south, as printed in the rulers. Tags: **STRONG** = a research file states it; **MEDIUM** = the files imply it; **WEAK** = geography or my inference only; **PROVISIONAL** = sources disagree or I drew the line.

How the numbers below were produced: the grid in section 1 was run through a throwaway checker (not part of the repo) that verified: every river barrier is 4-connected (no diagonal leaks), every entry tile and position tile is land, every entry tile is adjacent to the outside, and it computed terrain counts, connected land blocks and movement costs. **If the grid is edited, those numbers (sections 2, 3, 6) must be recomputed.** After the 2026-10-03 corrections the terrain grid is unchanged (counts re-verified by a small script); the sector overlay changed by three cells (Feni), the marker overlay changed, and the sector table (6.2) and distance table (6.5) were recomputed.

---

## 0. Scale and assumptions (all ASSUMED, tunable)

| Item | Value | Note |
|---|---|---|
| Cell | about 15 km east-west x 20 km north-south | from latitude and longitude spans: 4.7 deg of longitude over 32 columns, 5.9 deg of latitude over 32 rows; the grid is not square on the ground |
| Tile | about 4 km x 5 km | 1 cell = 4x4 tiles |
| Turn | 3 days | [03 D-C]: 89 turns (0-88), 26 March to 16 December |
| Movement | 02 G1 (GDD): infantry 3, shock/cavalry 5, scout 8, founder 1, commander 3, ranged 2, ship 12 points per turn | ASSUMED guide only |
| Terrain cost | open 1, wood_a 2, wood_b 3, rough 3, peak 4, river 1 (GDD 5.1, ASSUMED) | great river and haor: land impassable |
| Boats | `u.transport` moves on `t.deep` only (GDD 7.2) | so every crossing of a great river needs a boat |

Expansion rule suggested for the later 128x128 map (not decided; PROVISIONAL, art method undecided): an `O` cell becomes 16 tiles of paddy with one village or grove tile; an `R` cell becomes a 1-2 tile wide khal across a block of `O`/`A` (so the real river share ends near 5%, not the 19% the coarse grid shows); `D`, `S`, `H`, `P`, `B` cells expand to mostly the same role with a ragged edge. This keeps paddy share near 55-60% of land after expansion.

---

## 1. Terrain grid (SCHEMATIC)

North at the top. West, north and east edges are the Indian border; the Bay of Bengal is the south. Tripura is the `X` notch at about x 23-25, y 14-19.

```
    0         1         2         3 
    01234567890123456789012345678901
 0  XXOOOAOXXXXXXXXXXXXXXXXXXXXXXXXX
 1  XOOOOOAORXXXXXXXXXXXXXXXXXXXXXXX
 2  XOOOOOOAROXXXXXXXXXXXXXXXXXXXXXX
 3  XXOAOOOORROXXXXXXXXXXXXXXXXXXXXX
 4  XXXOAOOOOROODXXXXXXXXXXXXXXXXXXX
 5  XXXOOAOOORRODXXXXXXXXXXXXXXXXXXX
 6  XXXXOORROORODXXXXXXXXXXXXXXXXXXX
 7  XXXXXOORRORRDOHHXXXXXXXXXXXXXXXX
 8  XXXXXOOORRORDRROOHOOOOOOOOHHHXXX
 9  XXXXAROOORRODARROAOOOSSSSOOOHHXX
10  XXXOORROOORODOAROOASSSSSRRRHOOOX
11  XXOOOORROORRDOBRRROSSSRRRAOHOOOX
12  XOAOOOOROSORDOBBBRRODDROOOBBHXXX
13  XDDDDDDOOSSODOBBBRRRDOOOOOXXXXXX
14  XXXXXXDRDDOODRRBOROOROOXXXXXXXXX
15  XXXXOOOOODDDDORAORODDOOXXXXXXXXX
16  XXXXOOOORORODDRRROODAOOXXXXXXXXX
17  XXXXXOOORAROODDDAADDOOOXXXXXXXXX
18  XXXXXXAORRROASRDDDDOOAOXXXHHHHHX
19  XXXXXXOAOROROSAROADOAOOXXXHHHHOO
20  XXXXXXOOAROORAORRRDAOOAOOOOHHHOO
21  XXXXXXXOOROOAROAODDDOOOOAOOHSHHP
22  XXXXXXXOORRDOOROODDDDOOAOHARSHPP
23  XXXXXXXOBBBDOAROADODDODODOORHHPP
24  XXXXXXXBBBBDBOORDDODDDDDDDRRHPPP
25  XXXXXXXBBBBDBBBRDDDDDDDDDDDOHPPP
26  XXXXXXXBBBBDBBORDDDDDDDDDDDOHPPP
27  XXXXXXXBBBBDBBDDDDDDDDDDDDDBHHPO
28  XXXXXXXDDDDDDDDDDDDDDDDDDDDOOHHH
29  XXXXXXXDDDDDDDDDDDDDDDDDDDDDOHHH
30  XXXXXXXDDDDDDDDDDDDDDDDDDDDDDHHX
31  XXXXXXXDDDDDDDDDDDDDDDDDDDDDDOHX
```

### 1.1 Legend

| Letter | Role id | 1971 meaning | Count (cells) | Land share |
|---|---|---|---|---|
| `D` | `t.deep` | great river (Jamuna, Padma, Meghna, Pasur) and the Bay of Bengal | 190 | n/a |
| `S` | `t.still` | haor / beel, plus Kaptai lake | 19 | 4.1% |
| `R` | `t.river` | khal / small river (land crosses; ghat allowed); also the two bridge cells | 88 | 19.2% (coarse; see expansion rule) |
| `O` | `t.open` | paddy land | 218 | 47.6% |
| `A` | `t.wood_a` | groves and bamboo (village belts; placement illustrative) | 36 | 7.9% |
| `B` | `t.wood_b` | mangrove (Sundarbans) and sal forest (Madhupur) | 38 | 8.3% |
| `H` | `t.rough` | hills (Sylhet rim, Hill Tracts foothills, Sitakunda) | 44 | 9.6% |
| `P` | `t.peak` | Hill Tracts ranges (Keokradong area) | 15 | 3.3% |
| `X` | none | outside the playable map: India, Myanmar, padding. Never buildable, never enterable | 376 | n/a |

Land = 458 cells (44.7% of the grid), about 7,300 tiles in the final map. Great-river and sea cells: 190. In the grid `S` also covers the Kaptai reservoir at (28,21)-(28,22), which existed in 1971 [UNVERIFIED in the files].

### 1.2 What the grid draws, and what it leaves out

- **Jamuna** (Brahmaputra): `D` column x=12 from (12,4) to (12,16), the border river at the north edge, then it meets the Padma at (12,15)-(12,16) [G5].
- **Padma** (Ganges): enters at the west edge (1,13), runs along the border to Bheramara, `D` through (5,13)-(11,15); **Hardinge Bridge at (7,14) is an `R` cell** that land units can cross [G30]. After the Jamuna joins it runs (12,16) to (18,18) south of the Dhaka bowl.
- **Meghna**: `D` from (21,12) down (20,13), **Bhairab-Ashuganj rail bridge at (20,14) as an `R` cell** [G34] (the west bank, Bhairab Bazar, is in Kishoreganj District, Dhaka Division; the east bank, Ashuganj, is in Brahmanbaria District, Chittagong Division [07c row 18]), then (20,15)...(18,19) to Chandpur, and on as the lower Meghna estuary (x 17-20, y 19-26). Surma-Kushiyara is drawn as an `R` channel through the haors (24,10)-(22,12), not as `D`.
- **Pasur** (Mongla): `D` x=11, y 22-27 into the Bay; the Sundarbans (`B`) straddle it [G20][G26].
- `R` channels (crossable): Teesta, Karatoya, Atrai, old Brahmaputra (Mymensingh), Dhaleshwari, Buriganga, Shitalakshya, Bhairab-Rupsa (Jessore-Khulna), Madhumati, Arial Khan, Karnaphuli [G5][G21]. All drawn simplified.
- Left out on purpose: the Chhitmahals (enclaves), Moheshkhali, Kutubdia, the Naf river, small islands. Bhola (18,23)-(18,24), Hatiya (21,23) and Sandwip (23,23) are drawn as coarse coastal bumps.
- **No Indian land is drawn** as playable. Camps, Calcutta, Agartala, Plassey and the training centres in India stay off the map [G1.3][G2].

### 1.3 Marker overlay (positions, ports, bridges, entries)

A separate layer, so the terrain grid stays clean. `@` capital garrison, `F` fortress position (6), `z` defence zone (a garrison position tagged `defence_zone`, not a fortress candidate), `g` garrison position (AI), `p` port or ghat candidate that is not a garrison position, `=` bridge cell, `>` border entry tile. If a cell is both a garrison and a port, `g` wins and section 5 lists it.

```
    0         1         2         3 
    01234567890123456789012345678901
 0  ................................
 1  .......>........................
 2  .>..............................
 3  ................................
 4  ................................
 5  ........F.......................
 6  ...........p....................
 7  .....>g......>..................
 8  ................>..>...p.>......
 9  ..........................z.....
10  .........F......g.............>.
11  ................................
12  .>..g...........................
13  ...........p.g..................
14  .......=...........F=...........
15  ....>..g.....p..@....g>.........
16  ...........p.....gp.............
17  .......F.............F>.........
18  ................................
19  ......>.F..........g............
20  .......................g>......>
21  ..........g.....p...............
22  .......>........................
23  ............g............pz.....
24  ................................
25  ................................
26  ................................
27  ................................
28  ...........................p....
29  ................................
30  ................................
31  ................................
```

---

## 2. How the rivers cut the map into regions

### 2.1 Physical regions (what the water does)

| Region | Rough box (x, y) | Bounded by | What follows from it |
|---|---|---|---|
| North-west (Rangpur, Dinajpur, Bogura, Rajshahi, Pabna) | x 1-11, y 0-14 | Indian border W and N; Jamuna E; Padma S; Hardinge bridge links it south | Sectors 6 and 7 [T9]. Isolated from Dhaka by the Jamuna: boats needed |
| South-west and south-central (Kushtia, Jessore, Khulna, Faridpur, Barisal, Sundarbans) | x 4-17, y 15-27 | Padma N; Pasur and Madhumati `R` inside; Meghna estuary E; Bay S | Sectors 8 and 9 [T9]. Crossable inside (only `R`); joined to the north-west by the Hardinge bridge (7,14) |
| Dhaka bowl and Mymensingh-Tangail | x 13-20, y 7-18 | Jamuna W; Padma S; Meghna E; Garo hills border N | Sector 11 (east of Jamuna) and 2. Madhupur sal forest (`B`) at x 14-16, y 11-14 north of Dhaka |
| East of the Meghna (Brahmanbaria, Comilla, Noakhali, Feni) | x 19-24, y 13-23 | Meghna W (one bridge); Tripura border E; Bay S | Sectors 3, 2, 1 [T9]. Joined to Dhaka only by the bridge cell (20,14) |
| Sylhet haor basin | x 18-30, y 8-13 | Meghalaya N; Assam E; Tripura S; Meghna and haors W | Sectors 5, 4, 3. Reached by land only from Brahmanbaria-Habiganj [G22] |
| Chittagong and Hill Tracts | x 22-31, y 18-31 | Tripura wedge and Mizoram N and E; Bay W and S | Sector 1 (Feni itself is sector 2, see 2.2). The Feni gap (x 22-26, y 20-22) is its only land link to Dhaka; the coast strip runs south to Cox's Bazar |

**Two land blocks, joined only by water.** The checker finds exactly two large land blocks: a **west block** of 224 cells (north-west plus south-west and south-central, linked by Hardinge) and an **east block** of 213 cells (Dhaka bowl, Mymensingh, Sylhet, Comilla, Noakhali, Chittagong, linked by the Bhairab bridge cell). They share no land border. Every move between them needs a boat across the Jamuna or Padma. That follows the Indian draft plan, which cut the country along the Padma, Jamuna and Meghna [G16] and the "Dhaka Bowl" idea [G16], but it is also the biggest playability concern (section 6.5).

### 2.2 The 11 sector AREAS (separable table: replace it as one block)

Source for the areas: the sector list in [01 "The 11 sectors"] (Wikipedia sector table [T9]), corrected by the date and sector check (07a item 1, errata A16-A19). Areas only. **HQ names are kept out everywhere in this file**: they are missing or disputed for sectors 2, 3 and 9 (and given in two forms for 4 and 11), and sub-sector counts disagree between lists for sectors 2 (6 vs 7), 5 (6 vs 7) and 6 (5 vs 6) [07a]; if a count is ever wanted, say "5 to 10". Boxes are my rectangles over the grid (they match the overlay below); **every row is PROVISIONAL**. The table and the overlay are one separable block. Counts include only cells assigned to the sector. Districts the sources add that the coarse overlay does not draw (sector 3 Narsingdi and Gazipur; sector 7 Naogaon, Natore, Sirajganj; sector 8 northern Faridpur) are named in the Status column only. Sector boundaries also changed during the war: the first sector 8 area (Barisal, Faridpur, Patuakhali) was later split and sector 9 was formed from it [07a]; the table shows the later layout.

| Sector | Area as stated [T9] | Rough box (x0-x1, y0-y1) | Bounded by (grid) | Status | Cells |
|---|---|---|---|---|---|
| 1 | Chittagong district, Hill Tracts, whole eastern part of Noakhali [07a#1, VERIFIED] | 22-31, 18-31 (Feni cells (22-24, 20) excluded) | Tripura wedge and Mizoram N/E; Bay S/W; W edge at the Feni gap line x 22-24 | PROVISIONAL: the Feni / Noakhali split follows "eastern Noakhali" only; Feni now belongs to sector 2 | 75 |
| 2 | Dhaka, Comilla, Faridpur, **Feni**, part of Noakhali, with the Meghna and Padma [07a#2, A16] | 11-24, 14-23 | Jamuna W; Padma S of Dhaka; **straddles the Meghna** (Dhaka W bank, Comilla E bank); Tripura E; takes the three cells (22-24, 20) at Feni | PROVISIONAL: Faridpur is shared with sector 9; boundary at y 17/18 is mine; sub-sector count disputed (6 vs 7), HQ not given by two of three lists | 53 |
| 3 | Sylhet to Brahmanbaria (Churaman Kathi in the north to Singerbil in the south), **plus parts of northern Dhaka district, Narsingdi and Gazipur** [07a#3, A17] | 20-24, 13-15 (the Narsingdi / Gazipur part is not drawn) | Meghna W (bridge (20,14)); Tripura border E and S; haor channel N | PROVISIONAL: very thin; the added northern-Dhaka districts fall in cells the overlay gives to sectors 2 and 11, so the drawn sector 3 understates the real area; no HQ in any source | 9 |
| 4 | Habiganj to Kanaighat (long Sylhet border) | 22-30, 9-13 | Assam border E; Tripura notch S; haors W; Surma `R` N | PROVISIONAL: Sylhet itself falls here by my choice | 25 |
| 5 | Durgapur to Dawki / Tamabil and up to the eastern border, **including Sunamganj and the Surma** [07a#5, A18] | 18-28, 8-11 | Meghalaya border N; Sunamganj haors S (x 21-24, y 9-11) | PROVISIONAL: the line to sector 11 at x 18 is mine; sub-sector count disputed (6 vs 7) | 23 |
| 6 | Rangpur, part of Dinajpur | 1-10, 0-6 | Indian border N and W; Jamuna E (y 4-6); line to sector 7 at y 6/7 | PROVISIONAL: the Dinajpur split is mine; sub-sector count disputed (5 vs 6) | 51 |
| 7 | Rajshahi, Pabna, Bogura, part of Dinajpur, **plus Naogaon, Natore, Sirajganj**, bounded by the Padma [07a#7] | 1-11, 7-14 | Padma S; Jamuna E; Indian border W | PROVISIONAL: same Dinajpur line | 56 |
| 8 | Kushtia, Jessore, Khulna, Satkhira, **northern Faridpur** [07a#8, A19] | 4-11, 15-27 | Padma N; Indian border W; Pasur `D` at x 11 E (inside the Sundarbans) | PROVISIONAL: east edge at x 10-11 stands in for the Madhumati line; **area changed during the war** (first Barisal, Faridpur, Patuakhali; later split, Barisal and Patuakhali going to sector 9), the box shows the later layout | 62 |
| 9 | Barisal, Patuakhali, parts of Khulna and Faridpur | 11-18, 18-27 | Madhumati / Pasur W; Meghna estuary E; Bay S; Faridpur shared at y 17/18 | PROVISIONAL: Bagerhat-Pirojpur (E Khulna) assignment is a guess from "parts of Khulna"; **formed from the original sector 8 area, not present from the first organisation** [07a#9]; no HQ in two of three lists | 48 |
| 10 | Bay of Bengal, naval and special forces, **no fixed area** [T9] | none | not a region: label for the boat flotillas; the `D` cells and ports carry no sector | PROVISIONAL: stand-up date unresolved (August raids vs a December museum timeline) [07a#10] | 0 |
| 11 | Mymensingh (Sherpur, Netrokona), Tangail and the Jamuna [07a#11, A19]; "parts of Rangpur and Gaibandha" is single-source | 13-20, 7-13 plus a slice at 10-11, 4-8 | Jamuna W; Meghalaya N; Dhaka bowl S at y 13/14; haors E at x 20/21 | PROVISIONAL: the west-of-Jamuna slice (Kurigram-Gaibandha) rests on that single source and is a guess; the slice may be dropped | 56 |

#### Sector overlay grid (replaceable layer)

Digits are sector numbers, `b` = sector 11, `.` = water, outside, or sector 10 (no area). It is data on top of the terrain grid and is not read by any rule (option X1 in [03 D-E]). Changed on 2026-10-03: the three cells (22,20)-(24,20) at Feni moved from sector 1 to sector 2 (07a: sector 2 includes Feni).

```
    0         1         2         3 
    01234567890123456789012345678901
 0  ..66666.........................
 1  .66666666.......................
 2  .666666666......................
 3  ..666666666.....................
 4  ...6666666bb....................
 5  ...6666666bb....................
 6  ....666666bb....................
 7  .....77777bb.bbb................
 8  .....77777bb.bbbbb55555555555...
 9  ....77777777.bbbbbbbb555544444..
10  ...777777777.bbbbbbbb5555444444.
11  ..7777777777.bbbbbbbb5555444444.
12  .77777777777.bbbbbbb..4444444...
13  .......77777.bbbbbbb.33334......
14  .......7..77.2222222333.........
15  ....88888....222222..33.........
16  ....88888888..22222.222.........
17  .....88888822...22..222.........
18  ......888889922....2222...11111.
19  ......888889999999.2222...111111
20  ......888889999999.2222221111111
21  .......8888999999...222211111111
22  .......8888.99999....22211111111
23  .......8888.99999.9..2.2.1111111
24  .......8888.9999..9.......111111
25  .......8888.9999...........11111
26  .......8888.9999...........11111
27  .......8888.99.............11111
28  ...........................11111
29  ............................1111
30  .............................11.
31  .............................11.
```

---

## 3. Border entry points (16 entry cells)

All are land tiles of type `O` adjacent to the outside; none is adjacent to `D`. They are re-entry points for organising teams (`u.founder`, option D-A1), not camps and not refugee shelters. Source numbers: sector areas [T9] as corrected in 2.2; refugee and training states [G2][G7]; others as listed. **HQ names are no longer cited** (missing or disputed for sectors 2, 3 and 9, and given in two forms for others): the evidence column uses sector areas and crossing places only.

| ID | Cell (x, y) | Crossing area (bordering Indian state) | Sector (my box) | Evidence | Status | Group (06) |
|---|---|---|---|---|---|---|
| E01 | (1, 2) | Panchagarh-Thakurgaon, north-west tip (West Bengal) | 6 | Sector 6 covers part of Dinajpur [T9]; camps in West Bengal [G2][G7] | MEDIUM, tile PROVISIONAL | entry.s06 (ASSUMED) |
| E02 | (7, 1) | Lalmonirhat-Burimari (West Bengal / Assam side) | 6 | Lalmonirhat-Burimari lies in the sector 6 area (Rangpur) [T9]; the border crossing area, not an HQ | MEDIUM | entry.s06 (ASSUMED) |
| E03 | (5, 7) | Hili-Dinajpur south (West Bengal) | 7 | Hili border town and the Hilli battles [G24][T16] (Dinajpur District; Rajshahi Division in 1971, Rangpur Division today [07c row 13]); sector 7 area [T9] | MEDIUM | entry.s07 (ASSUMED) |
| E04 | (1, 12) | Chapai Nawabganj-Rajshahi, Padma border (West Bengal) | 7 | Sector 7 covers Rajshahi [T9] | MEDIUM, tile PROVISIONAL | entry.s07 (ASSUMED) |
| E05 | (4, 15) | Meherpur-Mujibnagar (West Bengal) | 8 | Government oath 17 April at Baidyanathtala [G3]; sector 8 covers Kushtia [T9] | STRONG for the place, MEDIUM for use as an entry | entry.s08 (ASSUMED) |
| E06 | (6, 19) | Benapole-Jessore (West Bengal, Bongaon side) | 8 | Benapole-Jessore border crossing, sector 8 area (Jessore) [T9]; Bongaon gathering point [G17] | MEDIUM | entry.s08 (ASSUMED) |
| E07 | (7, 22) | Satkhira (West Bengal) | 8 (boats to 9) | Satkhira is in the sector 8 area [T9]; sector 9 (Barisal) is reached through the Sundarbans waters [G20] | WEAK for the exact tile | entry.s08 (ASSUMED) |
| E08 | (13, 7) | Jamalpur-Sherpur / Garo hills (Meghalaya) | 11 | Sherpur is in the sector 11 area [T9][07a#11]; the first regular brigade's base was near Tura, Meghalaya [T10][07a#4] | MEDIUM | entry.s11 (ASSUMED) |
| E09 | (16, 8) | Haluaghat-Mymensingh (Meghalaya, Tura side) | 11 | Mymensingh area is sector 11 [T9]; first regular brigade near Tura [T10] | MEDIUM | entry.s11 (ASSUMED) |
| E10 | (19, 8) | Durgapur-Netrokona (Meghalaya) | 5 | Sector 5 starts at Durgapur [T9] | MEDIUM | entry.s05 (ASSUMED) |
| E11 | (25, 8) | Tahirpur / Dawki foot (Meghalaya) | 5 | "Durgapur to Dawki" [T9]; Dawki itself is hill `H` at (27,8) | MEDIUM | entry.s05 (ASSUMED) |
| E12 | (30, 10) | Kanaighat-Zakiganj (Assam, Karimganj side) | 4 | Habiganj to Kanaighat along the Assam border [T9][07a#4] | MEDIUM | entry.s04 (ASSUMED) |
| E13 | (22, 15) | Akhaura-Brahmanbaria (Tripura, Agartala side) | 3 | Sector 3 reaches Brahmanbaria (Singerbil) [T9][07a#3]; Agartala as radio and camp base [G4][G7] | STRONG for Tripura, MEDIUM for tile | entry.s03 (ASSUMED) |
| E14 | (22, 17) | Comilla south-east (Tripura) | 2 | Comilla is in the sector 2 area [T9][07a#2]; Comilla fortress [G16] | MEDIUM | entry.s02 (ASSUMED) |
| E15 | (24, 20) | Feni (Tripura, Sabroom side) | 2 (moved from 1) | Sector 2 includes Feni [07a#2, A16]; sector 1 starts in eastern Noakhali [07a#1]; Feni rail bridge [G15] | WEAK for the tile | entry.s02 (ASSUMED) |
| E16 | (31, 20) | Hill Tracts, Mizoram side | 1 | Hill Tracts border Tripura and Mizoram [G21]; training camps in Mizoram [G2] | MEDIUM | entry.s01 (ASSUMED) |

Notes:
- **Cells, not tiles (16 N-19):** every (x, y) in this table, and in sections 4 and 5, is a **cell** of the 32x32 grid (1 cell = 4x4 tiles, section 0), not a tile of the later 128x128 map. Rule for the final map (to be mirrored in 06 and 05): each entry cell becomes the land tiles of its 4x4 block that touch the map edge, listed north to south, then west to east, so an entry group holds about 3-12 tiles (06's `entry.sNN` groups hold 1-3 cells each; the 06 table and this one give the same mapping). 06 and 05 still say "tiles"; they are edited separately.
- **Group (06) column:** the mapping of the 16 tiles to 06's opaque `entry.sNN` group ids is the second-pass verifier's (12, M3), derived from the sector overlay and checked by script; it is ASSUMED, not sourced. `entry.s09` and `entry.s10` do not exist. 06 opens at `entry.s08` and `entry.s02` on turn 0; `entry.s02` contains E14, which is 4 tiles from Comilla (concern 3, Q6).
- Teams per entry (scenario arrivals) are a T1 setting and are **not** specified here. Sector 10 (naval) has no entry tile.
- **No entry on the Myanmar border** (south of x=29): no source in the files places any organising there.
- Roumari, where a regular brigade and local citizens set up a civil committee in August 1971 [T10] (the brigade's own account says it was the first; month only, no day, per 07a item 4), is on the Brahmaputra bank around (11,6) [UNVERIFIED position]. It is listed as a river post candidate in section 5, not as an entry.
- Spread: 7 west (E01-E07, West Bengal), 4 north (E08-E11, Meghalaya), 5 east (E12-E16, Assam, Tripura, Mizoram), matching the three border sides in [03 D-A1]. Two entries sit beside an AI fortress (E06 by Jessore, E14 by Comilla) and, now that Sylhet is a defence zone at (26,9), E11 at (25,8) sits one cell (about 6 tiles) from it; see 6.5 for the contact problem. E15 is now tagged to sector 2 (Feni).

---

## 4. Garrison, fortress and defence-zone positions for the AI (20 pre-placed bases)

Owner decision of 2026-10-03 (applied): the fortress positions are **Jessore, Jhenidah, Bogura (Bogra), Rangpur, Comilla and Bhoirab** (the owner's display spellings; Bhoirab is "Bhairab Bazar" in common use, see Q14); **Chittagong and Sylhet are defence zones** (still garrison positions, tagged `defence_zone`, not fortress candidates) [07a item 5, errata A27]. One other summary lists five fortresses (Jessore, Jhenaidah [as in 07a], Sylhet, Comilla, Rangpur), so the list stays PROVISIONAL and historian-gated. Count: 1 capital garrison + 6 fortress + 2 defence zone + 11 other garrison positions = 20.

The AI is "Pakistan Army, Eastern Command" (E-AI table in [03]). `bld.core` = **garrison position / cantonment**, never "enemy city" or "enemy village" (leaks L-8, L-14). Capturing one takes the military installation, not the people; see section 7.

### 4.1 Capital garrison, the six fortress positions (surrender-test candidates) and the two defence zones

| Position | Tile | Role | Evidence | Surrender test |
|---|---|---|---|---|
| Dhaka | (16, 15) | **Capital garrison**, Eastern Command HQ, centre of the "Dhaka Bowl" | Eastern Command HQ [T23]; surrender at Ramna Race Course 16 Dec [G29][G16] | **Candidate: "hold Dhaka"** |
| Jessore | (8, 19) | **Fortress position** (and 9th Division HQ); the strongest fortress [07a#5] | fortress concept [G16][07a]; HQ 9th Div [T23]; first district liberated 6 Dec [T3] | Candidate (one of K) |
| Jhenidah (07a writes Jhenaidah) | (7, 17) | **Fortress position** (added 2026-10-03) | named fortress in 07a item 5 (two of two lists that name fortresses by name); tile is my placement, about 9-11 tiles from Jessore at this scale (about 45 km; see Q15) | Candidate (one of K) |
| Bogura (Bogra) | (9, 10) | **Fortress position** | fortress concept [G16]; 16th Div area [T23]; Hilli is the gate [T16] | Candidate (one of K) |
| Rangpur | (8, 5) | **Fortress position** | fortress concept [G16]; 16th Div area [T23] | Candidate (one of K) |
| Comilla | (21, 17) | **Fortress position** | fortress concept [G16]; 39th ad hoc Div area [T23] | Candidate (one of K) |
| Bhoirab (Bhairab Bazar) | (19, 14) | **Fortress position** (moved up from garrison position); west bank of the Meghna bridge | named fortress in 07a item 5; Bhairab Bazar is in Kishoreganj District, Dhaka Division [07c row 18]; bridge opened 1937 [G34]; Meghna crossing 9-12 Dec [T19] | Candidate (one of K) |
| Chittagong | (26, 23) | **Defence zone** (tag `defence_zone`) and seaport | independent defence zone [07a#5]; port on the Karnaphuli [G27]; Operation Jackpot target [T5] | Not counted by the fortress clause |
| Sylhet | (26, 9) | **Defence zone** (tag `defence_zone`) | independent defence zone [07a#5]; battle 7 to 15 or 16 December (single source), heliborne landing, local surrender [T18]; haor and hill borderland [G22] | Not counted by the fortress clause |

K = 6 (the six named fortresses; the earlier K = 5 list was contradicted by 07a). **N = 3** (owner decision, 2026-10-03). Surrender test, as the owner set it: the AI agrees to surrender when the player holds the **capital garrison (Dhaka)**, **or** holds **3 of the 6 fortress positions** while the AI holds **at or below 25% of its starting garrison positions**. The predicate form in [06 H4] is `any_of(holds capital, all_of(holds >= 3 fortress sites, AI garrison positions <= 25% of start))`; the 25% clause sits inside the fortress branch only. **Decided (owner, 2026-10-03): the 25% base is the AI's STARTING garrison positions only.** There are 20 at scenario start (1 capital garrison + 6 fortress + 2 defence zone + 11 other), so 25% is **5 positions** (06: `held * 100 <= 25 * 20`, i.e. the AI holds 5 or fewer). The two defence-zone positions are among the 20. Positions the AI founds later never count toward the base. Spec consequence for 06 (not edited here): the predicate must use the fixed start count, outposts, if any, are excluded by the predicate's `tags_any` (06 H4), so they cannot change the base, and later-founded AI bases must not raise or lower the test. **Terminology (proposal for reviewers):** no town was held by the Pakistan Army at the start of the war, so this file calls the AI's starting sites "garrison positions", "fortress positions", "defence zones" and the "capital garrison" (Dhaka); opaque ids and grid coordinates are unchanged. The term is a proposal, not decided wording.

Geography of the six: **west block** Rangpur, Bogura, Jessore, Jhenidah (four); **east block** Comilla and Bhoirab (two), plus Dhaka. So N = 3 can be met entirely inside the west block (Jessore and Jhenidah are 4 infantry turns apart, Bogura 12 more by land via Hardinge), which was not true of the earlier 3-of-5 list (3 west, 2 east); see 6.5 concern 6. Bhoirab is only 5.3 infantry turns from Dhaka by land, so one fortress sits beside the capital.

### 4.2 Required garrison positions (Sylhet moved to 4.1 as a defence zone)

| Position | Tile | Role | Evidence | Strength of support |
|---|---|---|---|---|
| Khulna | (10, 21) | Garrison position, 9th Division area; river port | 9th Div area (Khulna, Jessore, Kushtia, Faridpur, Barisal, Patuakhali) [T23]; Mongla is 48 km south [G26] | MEDIUM (no 1971 event in the files) |
| Mymensingh | (16, 10) | Garrison position, 36th ad hoc Division area | 36th ad hoc Division (Dhaka, Tangail, Mymensingh) [T23] | WEAK (area only) |

### 4.3 Other garrison positions from the gazetteer (9, plus an optional Ashuganj label)

| Position | Tile | Role | Evidence | Strength |
|---|---|---|---|---|
| Brahmanbaria | (21, 15) | Garrison position, 14th Division HQ | HQ Brahmanbaria [T23]; sector 3 area [T9] | MEDIUM |
| Chandpur | (19, 19) | Garrison position and river port, 39th ad hoc Div HQ | HQ Chandpur [T23]; commando attack 15-16 Aug [T5][G10] | MEDIUM-STRONG |
| Hilli | (6, 7) | Border-town garrison position, gate towards Bogura; **not labelled a fort** [07c row 13, A23]. Hili / Hilli, Dinajpur District, Rajshahi Division in 1971 (Rangpur Division today) | battles 22-24 Nov and 10-11 Dec [G24][T16] | STRONG for the battles |
| Kushtia | (7, 15) | Garrison position at the Hardinge bridgehead | battle 28-31 March [T28]; Hardinge bridge bombed 13 Dec [G30] | MEDIUM |
| Rajshahi | (4, 12) | Garrison position, 16th Division area | 16th Div (Rajshahi, Bogura, Dinajpur, Rangpur, Pabna) [T23] | WEAK (area only) |
| Tangail | (13, 13) | Garrison position; Poongli bridge area | 93rd Brigade retreat blocked by the 11-12 Dec airdrop [G28] | MEDIUM |
| Mongla | (12, 23) | Port garrison | second port [G26]; mined by commandos Aug and Nov [G10][G12] | MEDIUM-STRONG |
| Narayanganj | (17, 16) | River port garrison near Dhaka | commando target [T5][G10] | MEDIUM |
| Feni | (23, 20) | Garrison position at the Feni gap and rail bridge | rail bridge reported destroyed [G15] | WEAK-MEDIUM |
| Ashuganj | (21, 14) | Optional bridgehead label on the east bank (Brahmanbaria District) | the other end of the Meghna bridge [G34][07c row 18]; not a separate position in the count of 20 | WEAK |

(Bhairab / Ashuganj at (19, 14) moved to 4.1 as the fortress position Bhoirab.)

**Not placed** (no support in the files, or inappropriate): any garrison in the Hill Tracts, Sundarbans or haors; Dinajpur, Pabna, Barisal, Noakhali and Cox's Bazar as garrisons (the gazetteer and orders of battle name only areas); Dhaka University and Kalurghat radio as map objects (see section 7); the **Dhaka airfield** (07c row 30: "Dacca airfield" is vague, Tejgaon and Kurmitola were both used; the name and position are **UNVERIFIED**, so no airfield tile is placed and any later one must name the field specifically); **Harina** (the sector 1 camp area in India: its location is UNVERIFIED, and India is not drawn anyway).

### 4.5 The 11 other garrison positions: names for 05 to conform to (16 N-3)

08 owns the positions. 05 `names/sites.json` (`site.town_01..11`) must use these names, in this order, with the Hili/Hilli display spelling as the owner's choice. All 20 positions, with the tag counts 06 uses (`tag_counts` 1 + 6 + 2 + 11 = 20):

| Id (05/06) | Position | Cell (x, y) | Tags | Section |
|---|---|---|---|---|
| `site.town_01` | Khulna | (10, 21) | `garrison_town` | 4.2 |
| `site.town_02` | Mymensingh | (16, 10) | `garrison_town` | 4.2 |
| `site.town_03` | Brahmanbaria | (21, 15) | `garrison_town` | 4.3 |
| `site.town_04` | Chandpur | (19, 19) | `garrison_town` | 4.3 |
| `site.town_05` | Hilli (Hili) | (6, 7) | `garrison_town` | 4.3 |
| `site.town_06` | Kushtia | (7, 15) | `garrison_town` | 4.3 |
| `site.town_07` | Rajshahi | (4, 12) | `garrison_town` | 4.3 |
| `site.town_08` | Tangail | (13, 13) | `garrison_town` | 4.3 |
| `site.town_09` | Mongla | (12, 23) | `garrison_town` | 4.3 |
| `site.town_10` | Narayanganj | (17, 16) | `garrison_town` | 4.3 |
| `site.town_11` | Feni | (23, 20) | `garrison_town` | 4.3 |

The other nine: `site.capital` = Dhaka (16, 15), tag `capital`; `site.fortress_1..6` = Jessore (8, 19), Jhenidah (7, 17), Bogura (9, 10), Rangpur (8, 5), Comilla (21, 17), Bhoirab (19, 14), tag `fortress`; `site.zone_1..2` = Chittagong (26, 23), Sylhet (26, 9), tag `defence_zone`. The id order for fortresses and zones follows the order of the 4.1 table. **Dinajpur, Pabna, Barisal and Noakhali are NOT placed** (see "Not placed" above); 05's current pool names for them (and Faridpur, Habiganj, which 08 does not place either) must be dropped from the 11 positions, and Chandpur, Hilli, Mongla, Narayanganj and Feni added to its name pool. Ashuganj is only an optional label, not a position.

### 4.4 Division names (gazetteer note)

Only four divisions existed in 1971 (Dacca, Chittagong, Khulna, Rajshahi); Rangpur (2010), Sylhet (1996), Mymensingh (2015) and Barisal (1993) divisions did not [07c row 25, A26]. Whenever the map text names a division, use "1971 / today":

| Place | 1971 | Today |
|---|---|---|
| Hilli (Hili), Dinajpur District | Rajshahi Division | Rangpur Division |
| Bhoirab (Bhairab Bazar), Kishoreganj District | Dacca Division | Dhaka Division |
| Ashuganj, Brahmanbaria District | Chittagong Division | Chittagong Division |
| Rangpur | Rajshahi Division | Rangpur Division |
| Sylhet | Chittagong Division | Sylhet Division |
| Hardinge Bridge (cell (7,14)) | spans Ishwardi (Pabna, Rajshahi Division) to Bheramara (Kushtia, Khulna Division) | same districts, same two divisions |
| Mujibnagar (not on the map) | Kushtia district, Khulna Division | Meherpur District |

Spelling choice (period vs present: Dacca / Dhaka, Jessore / Jashore, Bogra / Bogura, Comilla / Cumilla) is an owner decision still open (errata A26); this file uses the owner's display spellings for the fortress list and the common spellings elsewhere.

Start rule suggestion (T3 small, [03 E-AI]): all 20 bases exist at turn 0. The variant spec [06 H2] gives concrete core levels of 4 for the capital garrison, 3 for fortress and defence-zone positions, 2 for other garrison positions and 1 for camps; the levels are ASSUMED, and the anchors and contents are PLACEHOLDER (the earlier 2/2/1 suggestion here is superseded). Under the region cap [06, region cap section], pre-placed bases may exceed it at turn 0, so Dhaka, Comilla and Bhoirab (all in the sector 2 region) and Jessore and Jhenidah (both in the sector 8 region) may each hold a level-3-or-higher core at the start; the cap only blocks further qualifying upgrades there.

---

## 5. Ports and river-crossing candidates (ghats)

A ghat is `bld.port`. Only a ghat next to `t.deep` can build and load `u.transport`; a ghat on `R` or `S` is a trading / local post only (GDD 8.3, [03 D-C]). The "link to outside" (D-B) needs a `D` river that reaches the map edge: the **Jamuna** (north edge (12,4)) and the **Padma** (west edge (1,13)) do; the Bay is the sea edge. Which edges count is an open question (section 8, Q4).

| # | Place | Position tile | Ghat tile / water | Type | Support |
|---|---|---|---|---|---|
| 1 | Chittagong | (26, 23) | (25, 23), next to `D` at (24,23) and (25,24) | sea port, Karnaphuli mouth | **STRONG** [G27][T5][G16] |
| 2 | Mongla | (12, 23) | the position tile is next to `D` Pasur (11,23) | sea port | **STRONG** [G26][T5][G12] |
| 3 | Chandpur | (19, 19) | the position tile is next to `D` (18,19) | river port, Padma-Meghna meeting | **STRONG** [T5][G10] |
| 4 | Narayanganj | (17, 16) | (18, 16), next to `D` (19,16) and (18,17) | river port near Dhaka | **STRONG** [T5][G10] |
| 5 | Bhoirab (Bhairab Bazar, Kishoreganj, Dhaka Division) / Ashuganj (Brahmanbaria) | (19, 14), (21, 14) | `D` at (20,13) and (20,15); bridge `R` at (20,14) marks the Kishoreganj / Brahmanbaria link | Meghna rail crossing; the west end is now a fortress position | MEDIUM [G34][T19][07c row 18] |
| 6 | Hardinge Bridge | (7, 14) | the `R` bridge cell itself | land crossing of the Padma, **not a port** | **STRONG** [G30] |
| 7 | Khulna | (10, 21) | (10,22) on `R`, then `D` Pasur at (11,22) | river port; a trading post only (its own water is `R`) | MEDIUM-WEAK [G26] |
| 8 | Barisal area | (16, 21) | the position is next to `D` at (17,21) | river port, estuary | **WEAK**: sector 9 area [T9]; no 1971 port event in the files |
| 9 | Goalundo / Aricha | (11, 16), (13, 15) | `D` at (12,16) and (12,15) | ferry ghats at the Jamuna-Padma meeting | **WEAK / UNVERIFIED**: geography only, but this is the main west-to-Dhaka crossing |
| 10 | Sirajganj-side bank | (11, 13) | `D` at (12,13) | Jamuna ghat for the north-west | WEAK |
| 11 | Roumari / Chilmari | (11, 6) | `D` at (12,6) | Jamuna ghat; civil administration, August 1971 [T10] | MEDIUM for the place, WEAK for the tile |
| 12 | Sunamganj | (23, 8) | `S` haor at (23,9) | local post on `t.still` | MEDIUM-WEAK [G22]; haor operations UNVERIFIED [G sec 6] |
| 13 | Cox's Bazar coast | (27, 28) | `D` Bay at (26,28) | sea landing | WEAK |
| 14 | Rajshahi bank | (4, 12) | `D` Padma at (4,13) | Padma ghat | WEAK |

Operation Jackpot's four targets (Chittagong, Chandpur, Narayanganj, Mongla [T5]) all have a ghat tile on `D`: the grid supports the naval-raid story if it is ever added as a scenario event. The Meghna crossing of 9-12 December used local boats and helicopters to bypass destroyed bridges [T19]; the grid's only land crossings of a great river are the two bridge cells.

---

## 6. Balance notes

### 6.1 Terrain counts

| Terrain | Cells | Approx. tiles (x16) | Share of land |
|---|---|---|---|
| `O` paddy | 218 | 3,488 | 47.6% |
| `R` river | 88 | 1,408 (coarse) | 19.2% (about 5% after expansion) |
| `H` hills | 44 | 704 | 9.6% |
| `B` mangrove / sal | 38 | 608 | 8.3% |
| `A` groves | 36 | 576 | 7.9% |
| `S` haor / beel / lake | 19 | 304 | 4.1% |
| `P` peaks | 15 | 240 | 3.3% |
| Land total | 458 | 7,328 | 100% |
| `D` great river and sea | 190 | 3,040 | n/a |
| `X` outside | 376 | 6,016 | n/a |

### 6.2 Paddy tiles for farms and the support committee, by sector

A base area at Center level 1 covers a 5x5 area (25 tiles, GDD 8.1); a level-4 Center covers 11x11 (121). "Level-1 sites" = paddy tiles / 25, an upper bound that ignores overlap, rivers and AI garrison positions (real count roughly half). The support committee (D-D option x) has its terrain affinity moved to paddy land, so it wants the same tiles as farms; there is no competing "peak" tile role for it.

| Sector | O cells | O tiles | A | B | H+P | S | R | Level-1 sites (upper bound) | Reading |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 37 | 592 | 6 | 0 | 0 | 0 | 8 | 23 | rich paddy, flat |
| 7 | 34 | 544 | 2 | 0 | 0 | 3 | 17 | 21 | rich paddy; Chalan beel `S` and many `R` |
| 11 | 20 | 320 | 4 | 7 | 3 | 4 | 18 | 12 | forest and rivers; sal forest north of Dhaka |
| 5 | 8 | 128 | 0 | 0 | 3 | 8 | 4 | 5 | haor basin: little buildable land, island-like |
| 4 | 14 | 224 | 1 | 2 | 5 | 0 | 3 | 8 | tea hills and paddy |
| 3 | 8 | 128 | 0 | 0 | 0 | 0 | 1 | 5 | thin corridor |
| 2 | 33 | 528 | 9 | 1 | 0 | 1 | 9 | 21 | core of the economy; the Dhaka bowl (now includes the three Feni cells) |
| 8 | 27 | 432 | 4 | 19 | 0 | 0 | 12 | 17 | half the sector is Sundarbans: slow, hard to build in |
| 9 | 19 | 304 | 8 | 8 | 0 | 1 | 12 | 12 | delta with groves |
| 1 | 18 | 288 | 2 | 1 | 48 | 2 | 4 | 11 | hills dominate (33 `H`, 15 `P`); paddy on coast and valleys (Feni cells moved to sector 2) |

Totals: paddy is richest in the north-west (1,136 tiles in sectors 6 and 7) and weakest in the Sylhet haors and the Hill Tracts. 120 of the 218 `O` cells are next to an `R` or `D` cell, so river-affinity bonuses for farms and mills are common. Only 288 paddy tiles for the Chittagong and Hill Tracts front mean the south-east is a "hold and raid" front, not a farming one.

### 6.3 Defence and slowing terrain

The base ruleset has **no terrain defence bonus** in the 3x4 battle (terrain is cosmetic there, GDD 11.7), so terrain helps only through movement cost, buildability and the walls of water:
- Hill Tracts (`H` 3, `P` 4, not buildable): 15 peak cells and 33 hill cells. They slow a column by a factor 3-4, so an infantry stack needs about 3-4 times the turns per cell. Good for the player's hold-out; there is no AI garrison there.
- Sundarbans (`B` cost 3, x 7-13, y 23-27): slows the approach to Mongla from the land side; Mongla is best reached by boat on the Pasur `D`.
- Madhupur sal forest (`B` at x 14-16, y 11-14) sits between Mymensingh and Dhaka and slows the north road into Dhaka.
- Haors (`S`, impassable): they wall Sunamganj and Kishoreganj-Netrokona from the south; Sylhet can only be approached from Habiganj-Moulvibazar.
- Great rivers (`D`) are the real defence: the AI's western fortress positions (Jessore, Jhenidah, Bogura, Rangpur) can only be reached from Dhaka by boat.

### 6.4 Chokepoints (all PROVISIONAL widths)

| # | Chokepoint | Tiles | Width | Why it matters |
|---|---|---|---|---|
| C1 | **Bhairab-Ashuganj bridge** | (20,14) | 1 cell | the only land link between the Dhaka bowl and everything east (Brahmanbaria, Comilla, Sylhet, Chittagong) [G34][T19] |
| C2 | **Hardinge bridge** | (7,14) | 1 cell | the only land link between the north-west and the south-west [G30]; also the retreat route in the Dec fighting |
| C3 | **Feni gap** | x 22-26, y 20-22 (3 cells at x=24: (24,20), (24,21), (24,22)) | 3 cells (12 tiles) | the only land link between Chittagong and the rest, squeezed between the Tripura wedge and the Bay; Feni rail bridge [G15] |
| C4 | **Chittagong coast strip** | (27,25)-(27,27) | 1 `O` cell wide, hills inland | the only fast road from Chittagong to Cox's Bazar |
| C5 | **Brahmanbaria-Ashuganj corridor** | x 21-22, y 14 | 2 cells | the only land way into the Sylhet basin from the south-west; haors close it on the north |
| C6 | **Jamuna / Padma crossings** | (12,13)-(12,16), (13,16) | boats only | every west-block unit going to Dhaka crosses here; ghat candidates in section 5 |
| C7 | Meghna estuary | x 17-20, y 19-26 | water | splits the Barisal delta from Noakhali; reachable only by boat |

### 6.5 Distances and playability (movement from 02 G1, ASSUMED)

Cost per cell = 4 tiles x terrain cost; infantry 3 points per turn (3 days). "Land only" uses the two bridge cells; "with boats" lets `D` cells cost 1 point each (a 4-tile hop at ship speed, no embark cost, boats always free): a **lower bound**.

Recomputed on 2026-10-03 with a small script (scratchpad, not in the repo) over the terrain grid in section 1: 4-connected moves, each cell entered costs 4 tiles x terrain cost, the two bridge `R` cells are land, `D` cells cost 1 point each only in the "boats" columns, 3 points per infantry turn, straight-line distance is Euclidean between cell origins in tiles (rounded). The "turns to nearest" column allows boats (the lower bound used by the earlier table); a land-only figure is given where it differs. The nearest target is the nearest of the capital garrison and the six fortress positions; defence zones are listed below the table.

| Entry | Nearest capital or fortress (straight line, tiles) | Infantry turns to it (boats allowed) | Same, land only | To Dhaka, land only | To Dhaka, with boats |
|---|---|---|---|---|---|
| E01 (1,2) | Rangpur 30 | 13.3 | 13.3 | impossible | 25.7 |
| E02 (7,1) | Rangpur 16 | 6.7 | 6.7 | impossible | 19.0 |
| E03 (5,7) | Rangpur 14 | 6.7 | 6.7 | impossible | 16.7 |
| E04 (1,12) | Jhenidah 31 | 7.7 | 16.0 (via Hardinge) | impossible | 11.3 |
| E05 (4,15) | Jhenidah 14 | 6.7 | 6.7 | impossible | 12.0 |
| E06 (6,19) | Jessore 8 | 4.0 | 4.0 | impossible | 16.0 |
| E07 (7,22) | Jessore 13 | 6.7 | 6.7 | impossible | 17.3 |
| E08 (13,7) | Bogura 20 (by boat) | 5.3 | no land path | 17.3 | 8.7 |
| E09 (16,8) | Bhoirab 27 | 12.0 | 12.0 | 12.0 | 12.0 |
| E10 (19,8) | Bhoirab 24 | 12.0 | 12.0 | 14.7 | 14.7 |
| E11 (25,8) | Bhoirab 34 | 13.0 | 16.0 | 21.3 | 16.3 |
| E12 (30,10) | Comilla 46 | 22.3 | 24.0 | 28.0 | 23.0 |
| E13 (22,15) | Comilla 9 | 4.0 | 4.0 | 10.7 | 6.0 |
| E14 (22,17) | Comilla 4 | 1.3 | 1.3 | 13.3 | 7.7 |
| E15 (24,20) | Comilla 17 | 9.3 | 9.3 | 21.3 | 13.7 |
| E16 (31,20) | Comilla 42 | 26.7 | 26.7 | 38.7 | 31.0 |

What changed against the earlier table: the nearest target moved for E04, E05 (Jhenidah), E09 to E11 (Bhoirab, which is nearer than Dhaka or Comilla) and E15, E16 (Chittagong is a defence zone, so Comilla is now the nearest fortress); two earlier boats-allowed values (E04 10.0, E15 7.0) belonged to the old targets and are replaced; one-tile differences in straight-line distances (E02, E10) come from rounding. Dhaka columns are unchanged because the grid is unchanged.

Defence zones (infantry turns, boats allowed; land only if different): E10 to Sylhet 28 tiles, 10.7; **E11 to Sylhet 6 tiles, 2.7**; E12 to Sylhet 16 tiles, 9.3; E15 to Chittagong 14 tiles, 7.0 (land 8.0); E16 to Chittagong 23 tiles, 20.0.

Between positions (infantry turns, land only, with boats in brackets): Dhaka-Comilla 12.0 (6.3); Dhaka-Bhoirab 5.3 (4.3); Comilla-Bhoirab 6.7 (3.7); Bogura-Rangpur 8.0 (8.0); Jessore-Jhenidah 4.0 (4.0); Jessore-Bogura 16.0 (12.3, via Hardinge by land); Jhenidah-Bogura 12.0 (11.0); Jessore-Rangpur 21.3 (15.3); Jhenidah-Rangpur 17.3 (14.0). Dhaka to Jessore, Jhenidah, Bogura or Rangpur is impossible on land; with boats 12.3, 11.0, 10.3 and 13.3. Defence zones: Dhaka-Chittagong 29.3 (11.3); Comilla-Chittagong 17.3 (9.3); Dhaka-Sylhet 21.3 (16.3); Bhoirab-Sylhet 16.0 by land.

Other unit speeds scale these figures: shock x0.6 (5 points), scout x0.375 (8 points), ranged x1.5 (2 points), **founder x3 (1 point)**. The monsoon variant (C3) multiplies land cost by 1.5 for everyone.

Concerns:
1. **The founder crawls.** At 1 point per turn a founder takes 4 turns to cross one `O` cell, 8 on groves, 12 in mangrove. Founding near the entry tile works; walking a founder 10 cells inland takes about 40 turns. The founder speed is a GDD tunable, and the Easy setting x1.5 is the only relief; the owner may want a faster `u.founder` in this variant.
2. **The whole map is slow for infantry.** The longest realistic march (E16 to Chittagong through the Hill Tracts) is 20 turns; Dhaka to Chittagong by land is 29 turns, a third of the 89-turn game (turns 0-88; turn 88 is 16 December), 29 of 89 turns = 33%. The pacing target "first battle turn 25-40" (GDD 4) fits the far entries but not E06, E13 and E14, which sit near an AI garrison position almost at once.
3. **Three entries start in contact.** E14 is 4 tiles from Comilla (about one infantry turn); E06 is 8 tiles from Jessore; E11 is about 6 tiles from the Sylhet defence zone (2.7 turns). A level-1 base area is 5x5 tiles. Suggested rule (T1): no AI garrison position within 8 tiles of any entry may attack before turn N, or move those entries one cell away. This is a historically honest border (Comilla and Jessore are near the border), so the cost is a rule, not a map change.
4. **Boats are required to reach the centre.** Without `u.transport` on the Jamuna and Padma, the west block can never reach Dhaka, and the AI's western garrisons are bypassed or isolated. The AI has `u.transport` ("river gunboat") but it must be able to use ghat tiles; the AI must be tested on this map. A fast transport (12 points) makes the rivers the fastest roads, which matches the waterway accounts [G14][G10].
5. **Only two bridge cells.** If a rule can destroy a bridge cell (the sabotage story [G15][G30]), C1 or C2 becomes a decisive move. No such rule exists (open question Q2).
6. **The surrender test (D-F2) is geographically uneven.** "Hold Dhaka" is 6 to 25 turns from every entry. The east block holds Dhaka, Comilla and Bhoirab (Chittagong and Sylhet are defence zones and do not count); the west block holds four of the six fortress positions (Jessore, Jhenidah, Bogura, Rangpur). With K = 6 and N = 3, the player can meet the fortress branch entirely inside the west block (Jessore and Jhenidah are 4 turns apart), while the east block has only two fortress positions, so a player in the east must also cross to the west or take Dhaka itself. Whether this tilt is acceptable is an open question (Q5).
7. **Sector 3 is tiny** (9 cells) and sector 5 is mostly water: if sector areas ever carry a rule (X2 / X3 in [03]) they would be unequal. Keep X1 (labels only).
8. **The Hill Tracts front has no garrison and little paddy** (288 tiles): the 75 sector-1 cells are mostly hills, and Chittagong and Sylhet are now defence zones rather than fortress positions (the Chittagong garrison is a defence zone, not a surrender-test target). As drawn the south-east is a slow, low-value front; the player is unlikely to expand there unless entry E16 and the Chittagong front are rewarded.

---

## 7. What the map must not imply

1. **No Indian territory as buildable or enterable land.** `X` is permanent; there is no strip, no rear camp, no base in India (option A2 in [03 D-A] is not drawn; if the owner wants it, it is a separate layer with its own review). Calcutta, Agartala, Plassey, Tura and the training centres are text only.
2. **Entries are not refugee camps.** Do not label them camps; do not draw refugees, camp counts (825 [G7]) or the "10 million" as map objects, units or resources [02 §4.2 Don't-1].
3. **No atrocity sites.** Dhaka University (attacked 26 March [G sec 5, #2]), killing fields and similar places are not map objects, objectives or markers [03 L-15]. They belong in the encyclopedia with sources.
4. **Garrison positions are installations, not populations.** Label "garrison position", not "enemy city"; no town of civilians is razed or looted (leak L-8). Bengali and Bihari minorities and Pakistan's civilians are not "the enemy" [02 §4.2 Do-6].
5. **The Hill Tracts are not an NPC territory.** No `arch.indigenous`, no `npc.settlement`, no peoples drawn there [03 L-13]. The `H`/`P` cells are relief only.
6. **Sector areas are not borders or authorities.** The overlay is a label layer, PROVISIONAL, with no HQ names and no commander names; do not print it as fact.
7. **The monsoon does not decide the war.** The grid carries no flood layer; haors stay `S` (impassable) year-round, although real haors are walkable in the dry season [G22] (C2 would model that; C3 does not).
8. **The surrender test is not a historical re-enactment.** Holding Dhaka is the game's win, not a claim about how many positions fell when [03 L-18].
9. **No West Pakistan, no off-map Pakistani territory, no Indian divisions drawn.** The December Joint Command is an off-map effect (D-B ii), not units on this map.
10. **Not a survey.** Do not use the grid for navigation, for border claims, or as the "real" Bangladesh outline. It is a game board.
11. **Fortress and defence-zone tags are a verified-but-partial list, not a historical claim about which positions held.** One summary names five fortresses, another six plus two zones; the tags are labels for the surrender test and must not be printed as "the" fortress positions without a historian's check.

---

## 8. Open questions for the owner

1. **Crossing the great rivers.** Keep the two land blocks as drawn (boats mandatory), or add one or two ferry-ford `R` cells (candidates: Aricha-Nagarbari (12,15) and Goalundo (12,16)) so the west block meets Dhaka without boats? Dropping the barrier removes the main playability risk but erases the "Dhaka Bowl" isolation [G16].
2. **Bridges.** Do you want destructible bridge cells at (7,14) and (20,14) (needs a T3 hook: a cell that changes from `R` to `D`)? Or are they permanent crossings?
3. **Map size and speed.** Keep 128x128 (4 tiles per cell, about 5 km per tile) with the 02 G1 speeds, or shrink to 96x96 (3 tiles per cell, distances x0.75), or raise movement for this variant? Founder speed in particular (concern 1, section 6.5).
4. **"Link to outside".** Which edges count as the supply route: the Jamuna north edge (12,4) and the Padma west edge (1,13) only, or any entry tile too? The Bay edge is the AI patron's airlift path.
5. **Surrender test.** *Decided 2026-10-03:* K = 6 fortress positions, N = 3, the capital garrison, or 3 of 6 fortress positions with the AI at or below 25% of its STARTING garrison positions (20 at scenario start, 25% = 5; positions founded later never count); Chittagong and Sylhet are defence zones among the 20. *Closed:* the 25% base. *Still open:* is the west-block tilt of 3 of 6 acceptable (6.5 concern 6), or should N be 4?
6. **Contact rule.** For E06, E11 and E14 (AI garrison position 4-8 tiles from the entry; E11 is next to the Sylhet defence zone): move the entry, delay AI aggression, or accept immediate contact?
7. **Pre-placed AI strength.** Start levels for the 20 garrison positions (06 gives ASSUMED levels 4 / 3 / 3 / 2 / 1, anchors PLACEHOLDER), and whether the AI's patron (airlift) can reach them at all across the Bay.
8. **Sector areas.** Replace the section 2.2 table and overlay once the 11 areas are checked against Banglapedia, the Liberation War Museum and a sector commander's memoir [03 §10]; decide whether sector 10 gets any marker on the map.
9. **Entry tiles.** Which of the 16 start active, and when (the sectors formed 11-17 July [T1], the naval raids ran in August [T5])? Is it a single turn-1 arrival or a phased calendar?
10. **Hills and haors.** Confirm "Sylhet hills" and the Kaptai lake: the haor source places the basin against the Meghalaya and Tripura hills [G22]; the lake's date is not in the files. Keep, move or drop?
11. **Islands.** Bhola, Hatiya and Sandwip are coastal bumps in this grid. Keep them as part of the coast, make them true islands (boat-only, better ghat gameplay), or drop them?
12. **Dock rule on `R`.** Per GDD 8.3 a Dock on a river is a trading post only. Is that right for the Khulna and Barisal ghats, or should the variant let some `R` ghats build `u.transport`?
13. **Defence-zone garrisons and the 25% clause.** CLOSED 2026-10-03 (owner): the base is the AI's 20 STARTING garrison positions, the two defence zones included; 25% = 5; later-founded positions never count. See Q5.
14. **"Bhoirab" or "Bhairab".** The owner's display spelling is Bhoirab; common English sources write Bhairab (Bhairab Bazar, Bhairab Bridge). A native Bengali speaker should confirm which to print, and whether the bridge keeps the common name. This file uses Bhoirab for the fortress position and Bhairab-Ashuganj for the bridge. (New.)
15. **Jhenidah tile.** (7,17) is my placement, about 9 tiles from Jessore on the grid; Jessore and Jhenidah are about 45 km apart, about 9-11 tiles at 08's scale, and the map author keeps them in different base areas. Check that the two fortresses are not inside one base area and that the sector 8 region cap (both may start at level 3) plays acceptably. (New.)
16. **Dhaka airfield and Harina.** Neither is on the map. The Dhaka airfield (Tejgaon or Kurmitola) and Harina's location in India are UNVERIFIED [07c rows 28 and 30]; decide whether either is ever shown, and name the airfield specifically if so. (New.)
17. **Feni and sector 2.** Feni is drawn in sector 2 (three cells moved) following 07a; the Feni gap, the Feni garrison position at (23,20) and entry E15 now sit in sector 2 while the rest of the gap lies in sector 1. Keep that split, or move the whole gap to one sector? (New.)

---

## Change log (corrections applied)

Date: 2026-10-03. Sources: `09` = 09-verification-errata (A = fact table, B/C = consistency, F = fix list); `07a`, `07c` = the verification files; `06` = variant and hooks spec. Numbers were recomputed with a small Python script kept in the session scratchpad (not in the repo): terrain counts, the two land blocks (224 and 213 cells), the 120 paddy cells next to water, sector cell and terrain counts, and every row of the 6.5 distance table.

| # | Change | Source |
|---|---|---|
| 1 | Fortress towns set to Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab (owner's display spellings); K = 6, N = 3; surrender test restated as capital-town and/or 3 of 6 fortress towns with the AI at or below 25% of its starting towns (5 of 20). Section 4 title, 4.1 tables, K/N paragraph, start rule and Q5/Q7 updated. | Owner decision 1; 09 A27, A.3.1 option A, P0-5; 07a item 5; 06 H4 |
| 2 | Chittagong and Sylhet re-tagged as defence zones (garrison towns, not fortress candidates); Sylhet moved from 4.2 to 4.1; marker letter `z` added and the marker overlay redrawn (Sylhet, Chittagong `z`; Jhenidah `F` at (7,17); Bhoirab `F` at (19,14)). | Owner decision 1; 09 A27; 07a item 5 |
| 3 | Colony count 19 to 20 (1 capital + 6 fortress + 2 zones + 11 other); "Bhairab / Ashuganj" garrison removed from 4.3 and replaced by an optional Ashuganj label; Jhenidah added; core-level suggestion replaced by the 06 placeholders (4 / 3 / 3 / 2) and a note that pre-placed bases may exceed the region cap. | 09 A27; 06 H2 and region-cap semantics |
| 4 | Sector rows corrected: sector 2 adds Feni (and three overlay cells (22-24, 20) moved from sector 1 to 2; box 11-24; cells 50 to 53 and 78 to 75); sector 3 adds Narsingdi and Gazipur (named, not drawn); sector 5 adds Sunamganj and the Surma; sector 7 adds Naogaon, Natore, Sirajganj; sector 8 adds northern Faridpur and notes the area changed during the war; sector 9 notes it was formed from the original sector 8 area; sector 10 stand-up date unresolved; sector 11 says "Mymensingh, Tangail and the Jamuna" with the Rangpur / Gaibandha slice marked single-source. All rows stay PROVISIONAL and the table plus overlay stay one separable block. | Owner decision 2; 09 A16-A19, P1-8; 07a items 1 and 5 |
| 5 | Sub-sector count conflicts (sectors 2, 5, 6) recorded as disputed, no counts printed; HQ names removed from the entry table evidence (E02, E06, E07, E08, E09, E12, E14, E15) and the intro; a statement that HQs are kept out added to 2.2. | Owner decision 2; 07a item 1 and its HQ note |
| 6 | Entry E15 (Feni) re-tagged to sector 2; contact note extended to E11 beside the Sylhet defence zone (about 6 tiles); 6.5 concern 3 changed from two to three entries in contact. | 07a item 1 row 2; recomputed distances |
| 7 | Hilli: relabelled a border-town garrison position, "not a fort"; Dinajpur District, Rajshahi Division in 1971, Rangpur Division today (4.3 row, E03 evidence, new 4.4 table). | Owner decision 3; 09 A23; 07c #13 |
| 8 | Bhairab: fortress town named Bhoirab at (19,14) on the west bank; ports row 5, rivers bullet and 4.4 table say Bhairab Bazar is in Kishoreganj District, Dhaka Division and Ashuganj in Brahmanbaria; the bridge cell (20,14) is marked as the Kishoreganj / Brahmanbaria link. "Bhoirab" versus common "Bhairab" flagged for native-speaker confirmation (Q14). | Owner decision 3; 09 A24; 07c #18 |
| 9 | Harina: not placed; location UNVERIFIED (noted in the "Not placed" list and Q16). Dhaka airfield: no tile placed, Tejgaon or Kurmitola UNVERIFIED, must be named specifically if ever used. 4.4 adds the 1971 / today division note (Rangpur, Sylhet, Mymensingh, Barisal divisions did not exist in 1971; Hardinge Bridge crosses two divisions; Mujibnagar then Kushtia now Meherpur). | Owner decision 3; 07c #28, #30, #25; 09 A25, A26 |
| 10 | 6.2 sector table rows 1 and 2 recomputed (sector 1: O 18, 288 tiles, A 2, sites 11; sector 2: O 33, 528 tiles, A 9, sites 21); the 320-tile statement changed to 288; the 6.3 western-fortress list gained Jhenidah. | Owner decision 4 |
| 11 | 6.5 distance table rebuilt for the new target set (capital plus six fortresses), with a land-only column added; nearest targets moved for E04, E05, E09-E11, E15, E16; defence-zone distances and the between-town figures recomputed; concerns 6 and 8 rewritten (N = 3 can now be met inside the west block). The terrain grid, terrain counts, land blocks and section 6.1 are unchanged (re-verified). | Owner decision 4 |
| 12 | Art and asset statements marked PROVISIONAL (art method undecided): note at the top and on the expansion rule; content limits in section 7 stay binding. A new "must not imply" item 11 (fortress and defence-zone tags are a partial list). | Owner decision 6; 09 E.2 |
| 13 | New open questions Q13-Q17 (defence-zone garrisons and the 25% clause, Bhoirab spelling, Jhenidah tile and base-area overlap, Dhaka airfield and Harina, the Feni sector split); Q5, Q6, Q7 updated. Section 7 items 1-10 and all earlier open questions kept. | Owner decision 5 |

**Not applied, and why**
- **Feni gap sector split.** The Feni gap (x 22-26, y 20-22) is only partly in sector 2 after the three-cell change; 07a gives only "Feni" for sector 2 and "eastern Noakhali" for sector 1, so a full redraw would be invented detail. Left as Q17.
- **Sector 3 and 7 additional districts, sector 8 northern Faridpur.** Named in the Status column; the coarse 32x32 overlay cannot draw them without inventing cell assignments. Not drawn.
- **Bhoirab tile.** I kept the tile (19,14) of the old Bhairab / Ashuganj garrison (west bank). The owner gave no position; it is my placement.
- **Jhenidah tile.** (7,17) is my placement (about 9 tiles from Jessore); not sourced beyond "Jhenidah is a fortress town". Q15.
- **Spelling policy (period vs present).** Not decided by the owner (09 A26); this file uses the owner's display spellings for the six fortress towns and common spellings elsewhere.
- **The earlier "turns to that fortress" column was boats-allowed, which its header did not say.** The script reproduced the old figures for E04 and E15 (10.0 and 7.0) only with boats; land only they were 14.7 and 8.0 for the old targets. The rebuilt table prints both columns and says so. The old straight-line distances for E02 and E10 differ from the script by one tile (rounding); the script values are used.
- **Debatable fact: Chittagong as the Operation Jackpot target** and similar evidence cells are unchanged; no errata item touches them.

---

## Change log (second pass)

Date: 2026-10-03. Authority: 12 = 12-second-pass-verification (ids M, L, X as printed there), 06 = variant and hooks spec, 07a = verify dates and sectors. Only this file was edited. Counts re-checked by a script in the session scratchpad: the marker overlay still holds 1 `@`, 6 `F`, 2 `z`, 11 `g` = 20 starting garrison positions, 25% = 5 (5 x 100 <= 25 x 20); the terrain grid, sector overlay and all tables of numbers are untouched, so no other count changed.

| # | Change | Report id / source |
|---|---|---|
| S1 | Owner decision 1: the AI's starting sites are no longer called "towns". Prose, tables, headings and the section 4 title now say garrison position(s), fortress position(s), defence zone(s) and capital garrison (Dhaka); "colonies" became "bases", "settler speed" "founder speed", "enemy towns" "AI garrison positions". Opaque ids and grid coordinates unchanged. The new terminology is flagged in 4.1 as a proposal for reviewers. Kept on purpose: "enemy city" in the forbidden-label list, "border town" for Hilli/Hili and Sylhet as a place name. The earlier change-log rows above are left in their original wording as history. | Owner decision 1; 12 L3 |
| S2 | Owner decision 2: 25% base = the AI's STARTING garrison positions only (20, so 25% = 5; later-founded positions never count; defence zones are among the 20). 4.1 surrender text rewritten; the "excluding the zones gives 18 / 4" alternative removed; Q5 narrowed to the N = 3 versus 4 question and Q13 marked CLOSED. Consequence for 06 recorded in 4.1 (06 not edited): fixed start count, no `site.camp_NN` start positions, later bases do not move the test. | Owner decision 2; 12 M5 |
| S3 | Spelling: "Bogra" became "Bogura" everywhere, including distance tables, concerns and the earlier change-log rows; kept "Bogura (Bogra)" in the 4.1 table row and "Bogura / Bogra" in the 4.4 spelling note. "Jhenaidah" kept only as a quotation of 07a (`[as in 07a]`, "07a writes Jhenaidah"). "Bhoirab" retained, with the Q14 note that it needs native-speaker confirmation against common "Bhairab". | Owner decision 3; 12 M2, M4 |
| S4 | Z Force "first ... 27 August" removed from the entry notes and ports row 11; now "a regular brigade and local citizens set up a civil committee in August 1971 [T10] (the brigade's own account says it was the first)" and "civil administration, August 1971" (month only, per 07a item 4). | 12 L1 |
| S5 | Personal name removed from the Dhaka evidence cell: "Eastern Command HQ [T23]". | 12 L2 |
| S6 | Section 3 table: new column "Group (06)" mapping E01-E16 to `entry.s06` (E01, E02), `entry.s07` (E03, E04), `entry.s08` (E05-E07), `entry.s11` (E08, E09), `entry.s05` (E10, E11), `entry.s04` (E12), `entry.s03` (E13), `entry.s02` (E14, E15), `entry.s01` (E16). Marked ASSUMED because the mapping is the verifier's (12 M3), derived from the overlay; a note records that 06 opens at `entry.s08` and `entry.s02` on turn 0 and that `entry.s02` contains E14, 4 tiles from Comilla. | 12 M3; 06 entry groups |
| S7 | Jessore-Jhenidah separation stated once as "about 45 km, about 9-11 tiles at 08's scale; the map author keeps them in different base areas" (4.1 row and Q15). | 12 M6 |
| S8 | "about 88 turns" became "89 turns (0-88), 26 March to 16 December". | 12 M7 |
| S9 | Start-rule text: 06 H2 gives concrete core levels 4 / 3 / 3 / 2 / 1 (ASSUMED), anchors and contents PLACEHOLDER (4.4 closing paragraph and Q7). | 12 M8 |
| S10 | Citations: "07c#n" table-row references became "07c row n" (rows 13, 18, 30; "rows 28 and 30" in Q16). | 12 M9 |
| S11 | Sylhet battle dates: "7 to 15 or 16 December (single source)" pending a check of [T18]. | 12 M10 |

**Not applied, and why**
- **Other M9 references in the earlier change log** (`07c #13`, `07c #18`, `07c #25`, `#28`, `#30`): left as written there because those rows are history, and `07c #25` in 4.4 is not listed in the report.
- **Pre-existing change-log wording** ("towns", "Colony count", "Bogra" aside): left, see S1.
- **X-series and 05/06 items** (X6, X7, M1 and others): they touch other files, outside this task.
- **Bhoirab versus Bhairab and the Jhenidah tile**: still need a native speaker and a map author; unchanged.

---

## Change log (third pass)

Date: 2026-10-03. Authority: 16 = 16-final-consistency-check, 06 = variant and hooks spec. Only this file was edited. Checked by a script in the session scratchpad (`fix08.py`): every replaced string occurred exactly once; the 11 position rows plus the 9 others make 20 (1 + 6 + 2 + 11).

| # | Change | Report id |
|---|---|---|
| T1 | 6.5 concern 2: "the 88-turn game" became "the 89-turn game (turns 0-88; turn 88 is 16 December)"; 29 of 89 turns = 33%, still "a third". | 16 M7 / N-26 |
| T2 | 4.4 spelling note: "Bogura / Bogura" became "Bogra / Bogura" (period spelling / owner's display spelling). | 16 M2 / N-26 |
| T3 | 4.4 intro: `[07c#25, A26]` became `[07c row 25, A26]`. | 16 M9 / N-26 |
| T4 | 4.1 K/N paragraph: "`site.camp_NN` outposts must not be added..." replaced by "outposts, if any, are excluded by the predicate's `tags_any` (06 H4)"; 06 keeps `site.camp_01` and excludes it. | 16 M5 |
| T5 | "and/or" became "or" in 4.1 and open question 5, so the 25% clause cannot be read as attaching to the capital branch. | 16 N-17 |
| T6 | Section 3: heading "16 entry cells", column "Cell (x, y)", and a note that these coordinates (also in sections 4 and 5) are cells of the 32x32 grid, 1 cell = 4x4 tiles, with the rule for the final map (edge-touching tiles of each 4x4 block, north to south then west to east, about 3-12 tiles per group). | 16 N-19 |
| T7 | New 4.5: table of the 11 `site.town_NN` positions with coordinates and tags (plus the other 9), as the names 05 should conform to; states that Dinajpur, Pabna, Barisal and Noakhali are NOT placed, and which of 05's names to drop and add. 08's positions are unchanged. | 16 N-3 |

**Not applied, and why**
- **Edits to 05, 06, 04, 11** in the same report (N-3 in 05, N-5, N-8, N-19 in 06 and 05, N-20, N-23, M10 in 05, L1 in 04): other files, outside this task.
- **`site.town_NN` order**: 4.5 follows the order proposed in the report (Khulna, Mymensingh, Brahmanbaria, Chandpur, Hilli, Kushtia, Rajshahi, Tangail, Mongla, Narayanganj, Feni); that order is the report's, not a map fact.
- **Tag names** (`garrison_town`, `capital`, `fortress`, `defence_zone`) are from the report and 06's tag counts; if 06 spells a tag differently, 06 wins.
