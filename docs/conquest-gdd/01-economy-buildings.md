# GDD 01: Economy and Buildings

Source of truth: *Conquest of the New World Deluxe* manual (Interplay, 1996), 37-page PDF. Secondary (checked, not trusted): `conquest-new-world-design-1dc70b/docs/design.md`.

Conventions
- **MANUAL (p.N)**: stated by the manual. **SILENT**: the manual gives no number or rule. **INFERRED**: follows from manual wording but is not stated.
- "p.N" is the printed page number. Text extraction interleaves facing pages, so prose rules are cited as a spread (for example p.14-15) when the exact side could not be separated. The building table (p.30-31), its footnotes (p.32) and the unit table (p.38-39) were verified against rendered page images, not only extracted text.
- Cost letters: W wood, M metal, $ gold, G goods, C crops, P people.
- Theme-agnostic naming: this file uses the manual's names. Rename later in data.

---

## 1. Findings

### 1.1 Resources (MANUAL)
- The manual names **five commodities**: Gold, Metals, Wood, Goods, Crops (colony window p.10-11; Commodity Detail p.28-29). **People** are the sixth quantity: they are the colony population and appear as `P` in unit costs (p.38-39). People are not a commodity in the manual's lists.
- Every commodity is stockpiled per colony. The colony window shows stock and expected change by next turn, "taking into account consumption, production, and trade" (p.26-27).
- Commodity Detail window (p.28-29) columns: **Producing** (current out of maximum if fully manned), **Using** (consumed in production or to feed colonists), **Net Trade** (negative = exporting, positive = importing), **Total** (net change to reserves this turn).

### 1.2 Production and consumption
- Producers: Farm (Crops), Mill (Wood), Metal Mine (Metal), Gold Mine (Gold), Commerce (Goods). Base outputs per level are in Table T1 (MANUAL p.30-31).
- Table outputs are "the normal value"; terrain modifiers raise or lower them, labour shortage lowers them, specialisation raises them, special discoveries raise them (MANUAL p.32 note 3). **No formula is given** for combining these (SILENT).
- **Commerce consumes 1 Metal + 1 Wood + 1 Crop per building level** to produce its Goods (MANUAL p.32 note 5). What happens when an input is short is SILENT (design.md assumes proportional output).
- No other producer is stated to consume inputs (Mill, Mine, Farm tables list no inputs; INFERRED none). Crops are also consumed to feed colonists (MANUAL p.14-15, p.28-29); the **rate is SILENT**.
- **Terrain modifiers**: visible per candidate square while placing a Farm, Mill, Mine or Commerce; they differ by building and by square (MANUAL p.24-27). Range floor for European Gold Mines is -100% (a site at or below -100% is "useless", status bar warns) (MANUAL p.12-13). Metal Mines "normally yield at least one Metal per turn for a Level 1 building regardless" of site (MANUAL p.12-13). High Natives' Gold Mine modifier is always at least -90% and they produce more Gold per level (MANUAL p.56-57). Modifier values per terrain are SILENT.
- **Best terrain** (MANUAL p.30-32 note 1): Farm: grass near water. Mill: jungle or forest near river. Metal Mine and Gold Mine: near mountains. Colony Center: flat land. Dock: water. Proximity to a river also enhances Mills and Mines (MANUAL p.10-11). "Near" radius is SILENT.
- **Specialisation** (MANUAL p.26-27): "the more Mills or Farms you build, the more productive all your Mills or Farms will be." The bonus is shown in the production modifier of the colony's most common building type. Size is SILENT. Note 3 on p.32 says specialisation "in any of these areas" (Farms, Mills, Mines), so it is not obviously limited to one single building type.
- **Resources setting** (scarce / normal / abundant) changes the productivity of Mills, Farms and Mines in new colonies (MANUAL p.20-21). Magnitude SILENT. Difficulty changes terrain-based productivity in **computer** players' colonies (MANUAL p.20-21).
- **Special discoveries** (MANUAL p.58-59): deposits raise Gold Mine and/or Metal Mine output (Gold, Silver: Gold; Tin, Iron: Metal; Copper: both); special forests raise Mill output; special fields raise Farm output; Medicinal Herbs raise nearby Church immigration; Lost Dutchman Mine +25% Gold from all of the controlling player's Gold Mines (rare); Fountain of Youth raises population growth of all controlling player's colonies (rare). Each has a magnitude and radius; bonus falls with distance to zero at the radius (values SILENT). An enemy unit adjacent to a discovery takes control of it while it stays.
- **Special abilities** that touch the economy (MANUAL p.22-25; each costs 10 of the player's 40 bonus points): Craftsman (more income when selling to Mother Country, players, natives; amount SILENT), Conqueror (+1 military unit supported per Fort level), Pacifist (50% discount on Defensive Tactics research at the War College, p.32 note 6), Miser and Colonist (victory points only).
- **Convert Surplus** button (Commodity Detail, p.28-29) converts surplus production into victory points; rate SILENT. Out of economy scope unless victory points are kept.

### 1.3 Population, housing, farms, taverns
- Base (current) population, units in the colony, total population and maximum population ("based on current Housing") are shown in Population Detail; expected next-turn change is shown in parentheses (MANUAL p.14-15, p.26-29). That total includes units is INFERRED from the window's layout, not stated as a rule.
- **Housing capacity** (MANUAL p.32 note 4 and table): Housing L1-L4 holds 100 / 300 / 600 / 1000. **Farms house 40 people per level.** **The Colony Center provides as much living space as Housing of the same level.**
- **Labour**: each industry has a Labor Demand; Free Labor = people minus demand, negative means shortage; shortage makes industries "not optimally productive" (MANUAL p.14-15, p.28-29). Labour per building or level is SILENT. Whether unhoused or unfed people leave: "if there is insufficient Housing or food, people will leave the colony or starve to death" (MANUAL p.28-29); "you must have enough Crops ... or they will start emigrating" (MANUAL p.14-15). Rates SILENT.
- **Immigration**: each Church adds +10 / +20 / +30 / +40 people per turn at L1-L4 (MANUAL p.30). Natural growth is not described (SILENT). Fountain of Youth special discovery raises growth (MANUAL p.58-59).
- **Taverns** house nobody. They recruit Explorers: L1 recruits L1, L2 recruits L1-2, L3 L1-3, L4 L1-4 (MANUAL p.31). Support limit: "you cannot recruit more Explorers than all your Taverns (taking into account their levels) indicate they can support" (MANUAL p.37), the per-level number is SILENT.
- **Forts** support military units: 4 / 7 / 9 / 10 at L1-L4 (MANUAL p.31). Conqueror ability adds +1 per Fort level.
- Recruitment spends **People** as part of the unit cost (Table T3); that the people leave the colony population is INFERRED. Note the Level-1 Settler costs 150 P while a Level-1 colony holds 100 (Colony Center L1 = Housing L1): the colony must first grow beyond 150 through Farm housing or more Housing (INFERRED from MANUAL p.32 note 4 and p.38-39).
- Each colony "can support a limited number of Leaders" (MANUAL p.28-29); the number is SILENT.

### 1.4 Colony founding
- A Settler founds a colony on **flat land** with the Found button (grayed out if illegal) (MANUAL p.24-25). The Colony Center is Level 1; its cost is the Settler itself (MANUAL p.30 table: "1 Settler").
- "In most scenarios, your first settler appears on turn 6" (MANUAL p.24-25). Tutorial deadlines are turns 10 / 20 / 30 / 40 for missions 1-4 (MANUAL p.2-17, tutorial only).
- After Found, a highlighted area appears around the Settler; **buildings must be placed entirely within the highlighted area** (MANUAL p.10-11, p.24-25). Colony names may be accepted by default.
- **Undo Found** returns the Settler; allowed only in the turn of founding (MANUAL p.14-15, p.24-25, p.28-29).
- Later colonies need a new Settler: tick "Recruit Settlers" on a Housing building (cost per T3); the Settler appears **next game turn**; untick before end of turn to cancel (MANUAL p.24-25).
- The `Z` key previews the area for a candidate site (MANUAL p.10-11).
- Site advice (MANUAL p.10-13): grassland near river for Farms, ocean access for a Dock, forest or jungle for Mills, mountains for Gold and Metal, hills and mountains cannot be built on, leave a 2x2 flat square for a future Fort.

### 1.5 Building and upgrading rules (MANUAL p.12-13, p.26-27)
- All buildings and the Colony Center start at Level 1; maximum **Level 4** (Level 2 for Native players' Colony Center).
- **No building may exceed the Colony Center's level.** The Colony Center must be upgraded first. The Upgrade box is grayed when the building equals the Center's level or resources are short. The status bar reports the shortfall.
- Colony Center upgrade: size grows by "approximately one square around the perimeter" on the next game turn, giving new building land (MANUAL p.12-13, p.26-27). Colony Center cannot be demolished (MANUAL p.26-27).
- Higher levels produce more and recruit higher-level units (MANUAL p.26-27). Recruited military units are at most the level of the recruiting building (MANUAL p.36-37).
- **Construction time**: "The new Level 1 building will become functional on the following game turn" (MANUAL p.26-27). Colony Center upgrade takes effect "on the next game turn" (MANUAL p.12-13). Time to complete a non-center **upgrade** is not stated (SILENT; the building list marks a building being upgraded with a triangle, p.28-29, which implies it is pending until turn end). Recruited units appear the following turn (MANUAL p.36-37). There is no construction duration longer than one turn.
- **Costs are checked at order time**: buttons gray out without enough materials, hover shows the cost in the status bar (MANUAL p.10-13, p.24-27). Whether the cost is deducted at order time or at turn end is SILENT (Halt Construction returning "the resources allocated to its construction" to the stockpile, p.26-27, implies deduction at order time).
- **Halt Construction** (same turn, newly placed building): building removed, **resources placed back** in stockpile (MANUAL p.26-27). Upgrade and demolish orders can also be undone before turn end (MANUAL p.12-13, p.26-27).
- **Demolish** (not Colony Center): executes at the start of next turn; the square cannot be reused until then; a "small portion" of the materials is returned (MANUAL p.12-13, p.26-27). Percentage SILENT.
- **Footprint**: Fort needs a 2x2 area (MANUAL p.12-13). Other building sizes are not stated (SILENT; the manual only says "square"; design.md assumes 1x1).
- **Docks**: placed on water squares in the colony area. Ocean Dock builds Ships; Dock on river or lake is a trading post and builds none; a river or lake without ocean access cannot trade with the Mother Country (MANUAL p.10-13). A Dock is required for overseas trade (MANUAL p.28-29) and each new colony should have one (MANUAL p.12-13).
- **Auto Colony** button: computer decides build, demolish, upgrade, trade, recruit for this turn (double click makes it persistent) (MANUAL p.16-17, p.28-29). Logic SILENT.
- **War College**: single level, 20$ 15M 5G 50W, "improve military" (rating upgrades cost "increasingly larger quantities of Gold") (MANUAL p.31-32 note 6). Rating ladder and costs are SILENT. Nation bonuses add 1 to War College ratings for some unit types (MANUAL p.56-57).

### 1.6 Mother Country trade, taxes, shipping and supply
- Trade window options (MANUAL p.14-15): buy from / sell to Mother Country ("Europe" after independence); trade with natives; give or demand tribute; barter with players; **transfer supplies between your colonies**; create Trade Alliances.
- **Mother Country trade** requires a Dock on ocean or on a river with ocean access and "take[s] several turns to complete" (MANUAL p.14-15). **Number of turns, prices, quantities and limits are SILENT.** You may make **several trades per turn** with the Mother Country (MANUAL p.14-15).
- Mother Country trade is "the primary way European players can buy the Goods needed to build a Commerce building ... and to make later upgrades"; selling is the way to get Gold for upgrades, Leaders and Settlers (MANUAL p.14-15). (Primary, not stated as the only way: Commerce produces Goods.)
- **Native tribe trade**: everything except Goods; one trade per turn; resolves immediately; cannot be edited (MANUAL p.14-15). Native players reach farther tribes than Europeans (MANUAL p.22-23). Tribes are a separate system; listed here for completeness.
- **Colony-to-colony transfer**: takes one or more turns depending on distance "and known trade routes"; overland takes significantly longer than ocean (MANUAL p.14-15). Numbers SILENT. En-route shipments can be checked in the Trade window (MANUAL p.28-29). Edit and Remove buttons change or retract a pending Mother Country or colony trade (MANUAL p.14-15).
- **Trade Alliance** (MANUAL p.58-59): needs diplomatic status better than "Understanding"; either side can cancel; starts at 1 unit of each commodity and grows **10% per turn, rounded up**, to a cap set by the colonies' size and trading capacity (cap formula SILENT).
- **Taxes** (MANUAL p.6-7, p.22-23): European players pay taxes to the Mother Country via the Diplomacy window; default "automated", paid from the colonies' Gold and commodities. **Rate, schedule and what happens on default are SILENT.** Native players pay **no** tax and cannot trade with Europe. Independence ("Europe" becomes the trade name) is a diplomacy topic covered elsewhere.
- **Holland**: Gold stockpiles in all colonies earn **5% interest per turn**; Mother Country trades take one turn fewer, minimum one turn (MANUAL p.56-57).
- **Shipping**: Ships (Table T3) carry units overseas; only ocean squares; capacity is SILENT. A damaged Ship near its Dock heals 1 point per turn (MANUAL p.46-47). Ships appear next turn beside the Dock that built them (MANUAL p.36-37).
- **Native Players** (MANUAL p.22-23): start on the left edge; building and upgrade costs "vary somewhat" (**numbers SILENT**); can build larger cities (yet Colony Center max is Level 2, p.26-27: internally inconsistent in the manual); no tax; no Europe trade; cheaper Settlers, Infantry, Cavalry; farther-moving Explorers; no Artillery.

---

## 2. Tables

### T1. Building costs and outputs (MANUAL p.30-31, image-verified)
Level columns give "cost to build or upgrade to that level". Every row is exactly as printed.

| Building | Terrain note | L1 cost | L2 cost | L3 cost | L4 cost |
|---|---|---|---|---|---|
| Farm | grass near water | 4W | 4M, 10W | 10M, 4G, 20W | 20M, 10G, 32W |
| Housing | none | 2W | 2M, 5W | 10$, 5M, 2G, 10W | 40$, 10M, 5G, 15W |
| Church | none | 5W | 20$, 5M, 12W | 50$, 12M, 5G, 25W | 100$, 25M, 12G, 40W |
| Colony Center | flat land | 1 Settler | 5M, 20W | 100$, 10M, 5G, 40W | 250$, 20M, 10G, 80W |
| Dock | water | 2W | 2M, 5W | 5M, 2G, 10W | 25$, 10M, 5G, 16W |
| Mill | jungle or forest near river | 3W | 3M, 7W | 10$, 7M, 3G, 15W | 50$, 15M, 7G, 25W |
| Metal Mine | near mountains | 4W | 4M, 10W | 10$, 10M, 4G, 20W | 50$, 20M, 10G, 32W |
| Gold Mine | near mountains | 8W | 8M, 20W | 20$, 20M, 8G, 40W | 100$, 40M, 20G, 64W |
| Commerce | none | 3M, 2G, 3W | 7M, 5G, 7W | 20$, 15M, 10G, 15W | 60$, 25M, 16G, 25W |
| Tavern | none | 2W | 2M, 5W | 10$, 5M, 2G, 10W | 40$, 10M, 5G, 15W |
| Fort | none (needs 2x2) | 1M, 10W | 5M, 25W | 20$, 15M, 5G, 50W | 90$, 30M, 15G, 75W |
| War College | none | 20$, 15M, 5G, 50W | no levels | no levels | no levels |

Costs are shown in the manual as the cost to reach that level from the previous one (it is called "Construction & Upgrade Costs"); cumulative cost is the sum.

### T2. Building output, capacity and function (MANUAL p.30-32)

| Building | L1 | L2 | L3 | L4 | Notes |
|---|---|---|---|---|---|
| Farm | 3 Crops | 9 Crops | 21 Crops | 36 Crops | also houses 40 people per level |
| Housing | holds 100, recruit L1 Settler | holds 300, recruit L2 Settler | holds 600, recruit L3 Settler | holds 1000, recruit L4 Settler | |
| Church | +10 people/turn | +20 | +30 | +40 | immigration |
| Colony Center | recruit L1 Leader | recruit L2 Leader, build L2 buildings | recruit L3 Leader, build L3 buildings | recruit L4 Leader, build L4 buildings | houses as Housing of same level; max L2 for Natives |
| Dock | build L1 Ship | build L2 Ship | build L3 Ship | build L4 Ship | ocean Dock builds Ships; river or lake Dock is a trading post |
| Mill | 1 Wood | 3 Wood | 7 Wood | 12 Wood | |
| Metal Mine | 1 Metal | 3 Metals | 7 Metals | 12 Metals | L1 yields at least 1 anywhere |
| Gold Mine | 20 Gold | 60 Gold | 140 Gold | 240 Gold | European site at -100% or worse yields nothing |
| Commerce | 1 Goods | 3 Goods | 7 Goods | 12 Goods | consumes 1 Metal + 1 Wood + 1 Crop per level |
| Tavern | recruit L1 Explorer | recruit L1-2 | recruit L1-3 | recruit L1-4 | |
| Fort | recruit L1 military; supports 4 | recruit L1-2; supports 7 | recruit L1-3; supports 9 | recruit L1-4; supports 10 | Conqueror: +1 supported per level |
| War College | improve military (single level) | | | | Pacifist: 50% off Defensive Tactics research |

Output "per turn" is the normal value before terrain, labour, specialisation and discovery modifiers (MANUAL p.32 note 3).

### T3. Unit recruitment costs (MANUAL p.38-39, image-verified)

| Unit | Recruited at | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|
| Explorer | Tavern | 20$, 1P | 50$, 1P | 100$, 1P | 200$, 1P |
| Leader | Colony Center | 100$, 1P | 200$, 1P | 350$, 1P | 500$, 1P |
| Settler | Housing | 50$, 15W, 15C, 150P | 100$, 30W, 30C, 300P | 150$, 10M, 45W, 45C, 450P | 200$, 20M, 60W, 10G, 60C, 600P |
| Ship | Dock | 50$, 4M, 10W, 80P | 100$, 8M, 20W, 120P | 150$, 20M, 8G, 50W, 160P | 200$, 40M, 20G, 100W, 200P |
| Infantry | Fort | 5$, 1M, 10P | 10$, 2M, 15P | 15$, 5M, 1G, 20P | 20$, 10M, 2G, 25P |
| Cavalry | Fort | 10$, 2M, 10P | 20$, 5M, 15P | 30$, 10M, 2G, 20P | 40$, 16M, 5G, 25P |
| Artillery | Fort | 10$, 5M, 5P | 20$, 10M, 10P | 30$, 20M, 2G, 15P | 40$, 32M, 5G, 20P |

Recruiting rules (MANUAL p.36-37): military recruit level cannot exceed the Fort's level; the unit appears the **next turn**; Explorers appear by the Tavern, Settlers by the Housing, Leaders by the Colony Center, Ships by the Dock; **military units stay housed in the Fort** until detached. Support limits apply (Fort 4/7/9/10; Tavern and Leader numbers SILENT).

### T4. Economy-relevant nation and mode modifiers (MANUAL p.20-23, p.56-57)

| Nation or mode | Effect | Number |
|---|---|---|
| Holland | interest on Gold stockpiles, all colonies | 5% per turn |
| Holland | Mother Country trade duration | one fewer turn, min 1 |
| Portugal | movement as one setting easier (Normal to Easy) | +50% distance |
| Spain | Explorers move as one level higher | +1 effective level |
| High Natives | land units move as one level higher; Gold Mine floor | floor -90%, more Gold per level (amount SILENT) |
| Natives (all) | Colony Center max level 2; no tax; no Europe trade; no Artillery; cheaper Settlers, Infantry, Cavalry; farther Explorers | discount and range amounts SILENT |
| Britain, France | no economic effect (military, Admiral, native relations) | n/a |

---

## 3. Disagreements with design.md

Verified identical to the manual: all ten building cost tables and outputs in design.md section 7.1 (Farm, Housing, Church, Mill, Metal Mine, Gold Mine, Commerce, Tavern, Fort, Dock, War College, Colony Center), all unit costs in 7.2, Holland, Portugal, Spain, the corrected Dock L3 and L4 costs, Farm 40 housing per level, Colony Center housing equals Housing, Commerce inputs per level, Church immigration values, Fort support values. The following differ or are overstated:

| # | design.md says | Manual says | Verdict |
|---|---|---|---|
| D1 | Page cites p.8 (Center upgrade adds a ring) and p.9 (emigration) | Those facts are on printed p.12-13 / p.26 and p.14-15 / p.28. "p.8" and "p.9" are PDF page indexes (PDF pp.8 and 9 hold printed p.12-15) | design.md mixes PDF-page and printed-page numbers. Re-cite by printed page. |
| D2 | 6.4: Mother-Country trade "is the only way to get the Goods that Commerce and Level-3+ buildings require" | "the primary way European players can buy the Goods needed to build a Commerce building ... and to make later upgrades" (p.14-15). Commerce itself produces Goods | Overstated: "primary", not "only". Natives get Goods only from Commerce (tribes do not sell Goods). |
| D3 | 6.4 / A-29: tax fixed at 0% for the MVP | European players pay taxes via the Diplomacy window, automated from colonies' Gold and commodities (p.6-7); only Natives pay none (p.22-23) | A deviation from the manual baseline, chosen on purpose. The rate is SILENT, so any rate is an assumption, but 0% removes a mechanic. Needs an explicit decision. |
| D4 | 6.4: Commerce with a missing input "produces proportionally less" (not tagged assumed) | Not stated (p.32 note 5 only says it consumes the inputs "in order to produce") | Unflagged assumption. Add to the assumption register. |
| D5 | 6.4: specialisation applies "for the colony's most common production kind only" | p.26-27 says the bonus shows in the modifier of the most common building type; note 3 (p.32) says specialisation in "any of these areas" boosts productivity | Ambiguous in the manual; design.md picks one reading without flagging it. |
| D6 | 7.1 Housing: `"recruits": {"settler": 1..4}` (a count) beside Tavern `explorer: [1, n]` (a level range) | Table says "recruit L1 / L2 / L3 / L4 Settler" (a level, not a count, and no "L1-2" range, unlike Tavern and Fort) | Semantics unclear. Probably the highest Settler level available, but the manual does not say a Level-2 Housing may recruit a Level-1 Settler. |
| D7 | 6.3 / HaltConstruction: no refund rule except demolish refund A-24 (25%) | Halt Construction puts "the resources allocated to its construction" back in the stockpile (full refund, same turn) (p.26-27) | design.md should state a full refund for Halt Construction and keep the "small portion" refund only for Demolish. |
| D8 | 6.4: demolish refund is a share "A-24"; "queued demolitions complete" before construction | Demolish occurs at the start of the next turn and the square is unusable until then (p.12-13, p.26-27) | Consistent in effect; design.md should state the square is blocked for one turn. |
| D9 | 6.4 "Units garrisoned in the colony count toward total population (p.15)" | Population Detail lists base population, units in colony, total population, maximum population (p.14-15); no sentence states units count toward the cap | INFERRED not MANUAL; tag it as inferred. |
| D10 | Special abilities (Craftsman, Conqueror, Pacifist) not modelled; nations only | Abilities change sell income, Fort support (+1 per level) and tactics research cost (p.25, p.32) | Omission; design.md section 3 may treat them as out of scope but should say so. |
| D11 | Native building costs: "European costs, Center max level 2" (A-45, flagged) | "costs ... vary somewhat" and natives "can build larger cities" yet Center max is Level 2 | Already flagged by design.md; confirmed that the manual itself is inconsistent. |
| D12 | Settler L1 150P cost vs start population 100 (A-20) | Not addressed | Not a disagreement but a consequence: a Level-1 colony cannot recruit any Settler until population exceeds 150 (see Open question Q1). |

---

## 4. Gaps where the manual is silent (all are design decisions)

| ID | Missing item | Notes |
|---|---|---|
| G1 | Starting stock and starting population of a new colony | Not stated; tutorial says only that you start with the Settler. |
| G2 | Crops eaten per person per turn; whether units eat | Only that colonists must be fed. |
| G3 | Natural population growth rate, emigration rate, starvation loss | Only direction (p.14-15, p.28-29). |
| G4 | Labour required per building or level | Only that shortage lowers output. |
| G5 | Combination formula for terrain modifier, labour, specialisation, discovery | Only that all four exist. Also modifier values per terrain and the range of "near". |
| G6 | Specialisation bonus size and cap | |
| G7 | Resource-setting (scarce / abundant) and difficulty magnitudes | |
| G8 | Demolish refund percentage | "small portion". |
| G9 | Colony area size per level and exact shape | "approximately one square around the perimeter" per upgrade. Starting radius SILENT. |
| G10 | Footprint of every building except Fort (2x2) | |
| G11 | Mother Country prices, trip duration, shipment limits, allowed commodities | Only "several turns". |
| G12 | Colony-to-colony transfer duration and route rule | Only "one or more turns", ocean faster. |
| G13 | Tax rate, schedule, penalty | |
| G14 | Ship cargo capacity, Leader command capacity | "Limited". |
| G15 | Tavern Explorer support per level; Leaders supported per colony | Only that limits exist. |
| G16 | War College ratings count, costs per rating, effect size | "increasingly larger quantities of Gold". |
| G17 | Non-center upgrade completion time (assumed next turn); when costs are deducted | |
| G18 | Trade Alliance cap | |
| G19 | Special discovery magnitudes and radii | |
| G20 | Craftsman sell bonus; High Natives Gold bonus amount; Native cost discount; Native Explorer range | |
| G21 | Whether People spent on recruits come out of colony population | INFERRED yes. |
| G22 | Convert Surplus conversion rate | Victory points. |
| G23 | Any limit on the number of buildings per colony, or of a single type | None stated; footprint and area are the only limits. |

---

## 5. Open questions

1. **Settler recruitment vs housing**: a Level-1 Settler costs 150 P but Colony Center L1 plus Housing L1 hold 100 each and Farms add 40 per level. Is the intended path to grow past 150 with Farms and Housing first? Does the cost deduct from population, and may population fall below what Housing allows?
2. **Housing recruit rule (D6)**: can Housing L2 recruit a L1 Settler (as Fort L2 may recruit L1 military), or only L2?
3. **Cost timing**: are all costs deducted at order time and refunded in full by Halt/undo, with the colony stockpile unable to go negative? Confirm for upgrades.
4. **Upgrade timing**: does a non-center upgrade complete at the same turn boundary as a new building (assumed yes)? Can a building be upgraded again the turn after?
5. **Natives**: keep the manual's Center cap of Level 2 and "larger cities" contradiction? Which wins? What are the native cost differences?
6. **Tax**: keep taxes (any rate) or follow design.md A-29 (0%)? Decide before any Gold balance work, because it shifts the whole income curve.
7. **Labour model**: single pool "Free Labor" (as the window suggests) vs per-building demand. Labour numbers must be invented; the balance harness should tune them.
8. **Mother Country price model**: fixed table vs fluctuating? Manual implies a quote screen ("buy from / sell to") but gives no numbers; define buy price greater than sell price per commodity.
9. **Special abilities and victory points**: keep Craftsman, Conqueror, Pacifist, Miser, Colonist and Convert Surplus, or drop them with victory points (design.md locked decision 6 is "last player standing")?
10. **Commerce input shortage (D4)**: all-or-nothing, proportional, or priority by input?
