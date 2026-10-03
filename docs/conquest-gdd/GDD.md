# Conquest-style 4X clone: Game Design Document (theme-agnostic)

Status: **DRAFT v1 for owner review, amended 2026-10-03 for the Unity decision (see 1.6 and the change log at the end).** No game code exists. Date: 2026-10-03.
Source of rules: *Conquest of the New World Deluxe* manual (Interplay, 1996), 37-page PDF. "p.NN" is the manual's printed page number (the PDF holds two printed pages per sheet, so some prose cites are spreads, e.g. p.14-15).
Built from five panel files in this folder, which hold the full detail and every page cite:

| File | Content |
|---|---|
| [01-economy-buildings.md](01-economy-buildings.md) | Resources, buildings (levels 1-4), population, trade, taxes, 23 gaps (G1-G23) |
| [02-units-combat-turns.md](02-units-combat-turns.md) | Units, ships, 3x4 battle, raid and capture, turn flow, 26 gaps (G1-G26) |
| [03-map-natives-ui.md](03-map-natives-ui.md) | Setup, map, fog, natives, nations, diplomacy, scoring, UI and keys |
| [04-theme-architecture.md](04-theme-architecture.md) | Ruleset / theme / settings layers, theme-pack schema, 16 theme leaks, 11 decisions |
| [05-critique.md](05-critique.md) | Review of the earlier `design.md`: 2 critical, 9 high, 17 medium findings |

Related documents (added by the Unity amendment; they are not source panels of the rules):

| File | Content |
|---|---|
| [13-unity-architecture-plan.md](13-unity-architecture-plan.md) | Unity 6 architecture and migration plan with an engine-free C# core; authority for section 1.4 (decision 1), 14.3, 17-21 and 23.1 D-13/D-14 as amended |
| [bd1971/](bd1971/) | Folder of the bd1971 theme and variant work: theme-pack spec (05), variant and hooks spec (06), map draft (08), neutral-base test plans (10), reviewer plan (11) and verification notes |

Tags used everywhere: **MANUAL (p.N)** stated by the manual; **INFERRED** follows from manual wording; **SILENT** the manual gives no number; **ASSUMED** our proposed tunable default (lives in data, never in code). Where this GDD and an earlier `design.md` differ, this GDD and the manual win.

---

## 1. Overview

### 1.1 Vision
A turn-based exploration, colony-building and tactical-war game on a procedurally generated isometric world. The player lands a small expedition on an unknown coast, scouts the land, founds colonies, runs a resource economy, raises an army, and defeats rival factions in 3x4 tactical battles. Pick-up-and-play on desktop (Unity 6 with an engine-free C# core; ~~Python 3.10+ and pygame~~ superseded 2026-10-03, see 1.4 and 1.6), single player against AI, hot-seat later.

### 1.2 Design pillars
1. **Read the land.** Where you build matters (terrain modifiers, rivers, mountains, discoveries). Every placement shows its effect before you commit.
2. **Build a machine.** Six commodities, twelve building roles, four levels each. Every choice has a forecast for next turn.
3. **Win the decisive battle.** Short, readable tactical fights where preparation (Leaders, ratings, combined arms, Forts) beats numbers.

Every feature must name the pillar it serves (acceptance hook for scope control).

### 1.3 Theme-agnostic by construction
The owner will change theme and setting. So the game is three layers (see section 2): a **ruleset** of neutral roles and numbers, a **theme pack** of names, art and text, and **settings** for a match. The original colonial setting is just the first theme pack. This GDD names rules with neutral role ids and shows the original label once in brackets.

### 1.4 Locked decisions (from the owner, not re-opened here)
| # | Decision |
|---|---|
| 1 | **SUPERSEDED on 2026-10-03** by the owner's choice: Unity 6 (`6000.6.x`, C# 9, .NET Standard 2.1) with an engine-free C# core that is also built with the .NET SDK. Python and pygame are no longer the target. Original text, kept for history: ~~Python 3.10+, pygame, venv~~ (see 1.6 and [13](13-unity-architecture-plan.md) section 1) |
| 2 | MVP = exploration + colony economy + tactical combat vs one AI |
| 3 | Isometric tiles, zoom (+/-), drag-pan (same intent; implemented with a Unity Tilemap or chunk meshes, see 14.3) |
| 4 | Art drawn in code behind an assets loader with shape fallback. *Amendment note (13 section 1.2): the art method is re-opened (theme-pack spec TP §8); the renderer is method-agnostic and code-drawn glyphs stay as the guaranteed fallback.* |
| 5 | Manual's tables as-is, levels 1-4, nation bonuses stored as data |
| 6 | Win = last player standing (see decision D-1, which asks to re-open this) |
| 7 | Combat grid 3x4 (manual p.42) |
| 8 | Design first, approval, then phases: map and fog, colony, combat, AI; each playable and committed (same phases, re-planned for Unity in [13](13-unity-architecture-plan.md) section 12; see 21) |

### 1.6 Engine decision record (added 2026-10-03)
- **Date and decision:** 2026-10-03, the owner reversed locked decision 1 (Python 3.10+ and pygame) and chose **Unity 6 with an engine-free C# core**: simulation, rules, data validation and AI are plain C# with no reference to UnityEngine, compiled by Unity (assemblies with `noEngineReferences`) and by the .NET SDK for `dotnet test`. Unity draws, plays sound, reads input, loads files and drives the turn pipeline.
- **Reason:** performance headroom at 256x256 (GPU-drawn isometric tilemap instead of CPU blits and O(n) copies of frozen containers), the isometric tilemap tooling, and UI, localisation and shipping (desktop first, Web later).
- **Unchanged:** all rules, numbers, tables, role ids and ASSUMED tunables (sections 5-13 and 19); the three layers (ruleset, theme pack, settings) and every theme-architecture rule ([04](04-theme-architecture.md)); theme and variant design including the bd1971 work; the data files and the seven-step load pipeline; the resumable turn pipeline; the phase order.
- **Changed:** the language, engine and tooling, hence sections 1.1, 1.4 (decision 1), 14.3, 17, 18, 19, 20, 21 and 23.1 (D-13, D-14), each marked "Unity amendment".
- **Authority and detail:** [13-unity-architecture-plan.md](13-unity-architecture-plan.md). Where this GDD and 13 differ on engine, tooling, determinism mechanics, file locations or phase exit criteria, 13 wins; on rules and numbers, this GDD wins.

### 1.5 MVP scope and non-goals
In: world generation, fog, exploration, colonies, economy, recruiting, patron trade, 3x4 battles (field and colony), raid and capture, one AI opponent, save/load, 3 tutorial missions.
Out for the MVP (data and code hooks reserved, section 22): victory points and scores, turn limit, native tribes (NPC), diplomacy and independence, tribute, ship-to-ship combat, Leader experience, multiplayer, play-by-email, scenario editors, sound, almanac flavour text, special discoveries.

---

## 2. Theme and setting layers

Full schema, two worked themes and 16 leak fixes are in [04](04-theme-architecture.md). Summary:

| Layer | Holds | Can a theme change it? | Changes rules hash? |
|---|---|---|---|
| **Ruleset** | Every mechanic and number, keyed by neutral role id (`res.coin`, `bld.garrison`, `u.ranged`) | No | Yes |
| **Variant** | Typed overlay on the ruleset (`equal-nations`, `mvp`, `no-patron`) | No (a bundle preset may suggest one) | Yes |
| **Theme pack** | Labels and plurals, locales, name pools, calendar, palette, pictures, shape-fallback glyphs, sound, flavour text | n/a | No |
| **Match settings** | Map size, seeds, difficulty, players, scenario | No | No (stored in the save) |

Rules for the build:
1. `core/` and `ai/` import the ruleset only; they never import theme, locale or assets (boundary test).
2. State stores `turn`; the calendar (the original's year 1493) is theme data.
3. A theme file containing any ruleset key (`cost`, `output`, `move`, `effects`, ...) is **rejected** by the validator.
4. **Proof a theme is a skin:** a fixed-seed AI-vs-AI game yields identical per-turn state hashes under every theme, including an empty one (CI test).
5. Every picture, sound and string has a fallback chain ending in a shape, silence or `[key]`, so a theme with no art is still playable.
6. Default names come from a separate cosmetic random stream so a longer name pool never changes the game.
7. Original wording only: do not reuse the original title, "Colonial Gazette", "Annals of History", briefings or art.

### 2.1 Role vocabulary (neutral id, original label)
| Group | Roles |
|---|---|
| Resources | `res.basic` (Wood), `res.hard` (Metal), `res.coin` (Gold: both money **and** mined), `res.wares` (Goods), `res.food` (Crops), `res.pop` (People) |
| Buildings | `bld.core` (Colony Center), `bld.food` (Farm), `bld.basic_extractor` (Mill), `bld.hard_extractor` (Metal Mine), `bld.coin_extractor` (Gold Mine), `bld.converter` (Commerce), `bld.habitat` (Housing), `bld.attractor` (Church), `bld.scout_post` (Tavern), `bld.garrison` (Fort), `bld.port` (Dock), `bld.academy` (War College) |
| Units | `u.scout` (Explorer), `u.founder` (Settler), `u.commander` (Leader), `u.line` (Infantry), `u.shock` (Cavalry), `u.ranged` (Artillery), `u.transport` (Ship), `u.militia` (generated defenders) |
| Terrain | `t.deep` (Ocean), `t.still` (Lake), `t.river`, `t.open` (Grassland), `t.wood_a` (Forest), `t.wood_b` (Jungle), `t.rough` (Hills), `t.peak` (Mountains) |
| Factions | archetypes `arch.expedition`, `arch.indigenous`; profiles `fp.*`; theme-named slots `f1`..`f6`; `patron` (Mother Country); `npc.settlement` (native tribes) |

The six resources are fixed by the ruleset; a theme cannot add a seventh (that is a ruleset major version). `res.coin` must stay one resource (interest, mining, trade and score all touch it).

---

## 3. Core loops

**Turn loop:** scout -> choose a site -> place and upgrade buildings -> recruit -> move and order attacks -> end turn -> results (battles, economy, arrivals, messages).
**Session loop:** expand (second colony by about turn 10) -> specialise (extractors, Dock, Fort) -> mobilise (Leaders, ratings, army) -> locate and eliminate the rival.

## 4. Player goals, progression and pacing

| Horizon | Goal | Gate |
|---|---|---|
| Short | Feed the colony, place first buildings, scout | Food surplus, free labour |
| Mid | Colony Center level 2-3, second colony, Dock link to the patron | Center level caps every building level (p.12-13, 26) |
| Long | Locate and eliminate the rival | War College ratings, Leader level (attacks per turn), Fort support |

**Pacing targets (ASSUMED, checked by the headless economy simulator and AI-vs-AI soak, 64x64 map, normal difficulty):** first colony by turn 3; second colony by turn 10 +/- 3; Center L2 by turn 12 +/- 4; first battle turn 25-40; a typical game ends turn 80-150.
*Unity amendment: unchanged. The simulator becomes a `dotnet` console tool and a test that needs no Unity (13 section 1.2). Section 4 has no pygame or Python reference.*

---

## 5. World

### 5.1 Map
- Size: manual says 80-256, normal 256 (p.20-21, 56). ASSUMED default 128 (decision D-6); MVP supports 80-256, one map must stay within the frame budget (section 18). *Unity amendment: 128 stays the default; the reason is now readability and AI pacing, not Python speed, and 256 becomes a realistic frame-budget target (13 section 1.2).*
- Generation: seeded, from `land_seeds` and `water_seeds` counts (more land seeds = one big continent; more water seeds = islands, p.20). The manual gives no algorithm; the proposed one (weighted flood fill, ridges, rivers from high ground, lakes in basins) is ASSUMED, see [03 §4](03-map-natives-ui.md).
- Terrain (p.8-11, 30-32): ocean, lake, river, grassland, forest, jungle, hills, mountains. **River is a tile type** (one model, resolves a draft contradiction): land units cross it, a Dock may stand on it, it enhances nearby mills and mines.
- Passability (MANUAL p.8-9, 32): land units cannot enter ocean or lake; ships only on ocean. Nothing can be built on hills or mountains. Colony Center and buildings need flat land; the Dock needs water. "Flat areas on mountains" exist (p.10-11): each tile has a `flat` flag.
- Movement costs (SILENT, ASSUMED): grass 1, forest 2, jungle 3, hills 3, mountains 4, river 1, ship on ocean 1 (02 G2).
- Start positions (MANUAL p.21-22): expedition factions start on the **arrival edge** (original: right), the indigenous faction on the **home edge** (left). Minimum start distance 40% of map width (ASSUMED, avoids rush contact).
- Small worlds push land toward the arrival edge (p.56); ASSUMED `land_bias`.

### 5.2 Fog of war and intel
- Three states: never seen (black), seen before (dim: terrain only), in vision now (clear). Vision radius ASSUMED: scout 3, ship 3, commander 2, military 2, founder 2, colony 3 + level.
- Fog is stored as a compact immutable bitmap, never a set of tuples (performance).
- **Intel memory** (fixes a critique gap): each player keeps a record of enemy colonies last seen (position, owner, level, fort count, turn seen). The AI sees only this knowledge view, never live state; the UI draws it on dimmed tiles.
- Exploring new land earns score in the original (not oceans, p.22); with scoring out of the MVP this is a hook only.

### 5.3 Scenario arrivals (data)
Manual: first Settler appears on turn 6 in most scenarios (p.24-25); scenario templates define when ships arrive (p.54-55). The scenario file carries `arrivals: [{turn, player_filter, units}]`. Default (ASSUMED, decision D-7): turn 1 a transport with 2 scouts, 1 commander, 2 line units and the founder aboard (the founder-on-turn-6 rule is available as a preset). A second transport on turn 12 is an optional catch-up preset.

---

## 6. Turn structure

### 6.1 Simultaneous-order model (resolves critique H-1)
All players plan from the **start-of-turn snapshot**. During your turn you move units immediately and queue build, upgrade, demolish, recruit, trade and attack orders. Nothing is final until every player ends the turn (p.2, 4). An attack order records `(attacker stack, target id)` and fires only if the target is within reach from the attacker's final position; otherwise it is cancelled with a message. Attacks on colonies always resolve (colonies do not move). The AI plans from the same snapshot and a fog-limited knowledge view; movement execution alternates human-first / AI-first by turn parity.

### 6.2 Resumable phase pipeline (resolves critique C-1)
`GameState.phase` is an enum: `orders -> ai_planning -> battles(queue, index) -> economy -> done`. The pure function `advance(state)` runs until it needs outside input (a battle) or the turn ends. The **app controller** calls the AI planner, feeds AI orders through `apply_order`, and picks the driver for each battle (human UI or AI tactics). `core` never imports `ai` or `app`.

### 6.3 End-of-turn order (ASSUMED where marked)
1. Resolve queued attacks and battles (MANUAL: after all players end, before next turn, p.42).
2. Deferred actions: new buildings become functional, upgraded Center grows the area, demolitions complete, recruits appear (MANUAL p.12, 26, 36).
3. Patron arrivals and trade deliveries, colony-to-colony shipments (order ASSUMED).
4. Economy: production, consumption, population change, interest, taxes (ASSUMED order).
5. Healing (1 strength per turn, units attached to a Colony Center, p.44).
6. `turn += 1`; digest of typed events and a messages window (MANUAL p.4-5).

### 6.4 Undo and saves
Undo is limited to the manual's targeted actions: Undo Found (same turn), Halt Construction, toggling recruit/upgrade/demolish, Cancel Attack, battle move undo (p.14-15, 24-27, 40, 45). Map movement is never undoable and explored tiles are never rolled back (no fog leak). Saves happen only in the `orders` phase.

---

## 7. Units

### 7.1 Cost table (MANUAL p.38-39, image-verified; $ gold, M metal, W wood, G wares, C food, P people)
| Unit | Recruited at | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|
| `u.scout` | Tavern, levels 1..n | 20$, 1P | 50$, 1P | 100$, 1P | 200$, 1P |
| `u.commander` | Center, exactly level n | 100$, 1P | 200$, 1P | 350$, 1P | 500$, 1P |
| `u.founder` | Housing, exactly level n | 50$, 15W, 15C, 150P | 100$, 30W, 30C, 300P | 150$, 10M, 45W, 45C, 450P | 200$, 20M, 60W, 10G, 60C, 600P |
| `u.transport` | Dock, level n | 50$, 4M, 10W, 80P | 100$, 8M, 20W, 120P | 150$, 20M, 8G, 50W, 160P | 200$, 40M, 20G, 100W, 200P |
| `u.line` | Fort, levels 1..n | 5$, 1M, 10P | 10$, 2M, 15P | 15$, 5M, 1G, 20P | 20$, 10M, 2G, 25P |
| `u.shock` | Fort, levels 1..n | 10$, 2M, 10P | 20$, 5M, 15P | 30$, 10M, 2G, 20P | 40$, 16M, 5G, 25P |
| `u.ranged` | Fort, levels 1..n | 10$, 5M, 5P | 20$, 10M, 10P | 30$, 20M, 2G, 15P | 40$, 32M, 5G, 20P |

Recruit rules (p.36-37): the unit appears **next turn**; military stays housed in the Fort until detached; you may not recruit more than your buildings support. **One recruit schema everywhere:** `recruits: {role: {min, max}}` (Housing and Center: min = max = n; Tavern and Fort: min 1, max n). The People in a cost leave the colony (INFERRED).

### 7.2 Roles and behaviour (MANUAL unless tagged)
- Scout: fastest on land, can auto-explore, avoids hostile natives, cannot fight. Founder: slowest, founds a colony, cannot fight. Commander: carries military units and founders, its level limits attacks per combat turn, cannot fight alone (p.28, 36, 43). Only line, shock, ranged and commanders may initiate attacks (p.40).
- Transport: ocean only; embark/disembark only next to shore (p.36); capacity SILENT (ASSUMED slots 6/10/14/20, commanders carry 4 per level, 02 G3).
- Military support caps: Fort 4/7/9/10 at L1-4 (p.30-31). Tavern, Housing, Center commander caps are SILENT (ASSUMED 2 scouts per Tavern level, commanders per colony = Center level).
- Movement points are SILENT; ASSUMED table in [02 G1](02-units-combat-turns.md); movement setting multiplier Easy 1.5 (MANUAL via Portugal), Normal 1, Difficult 0.667.
- Attached units move with their carrier and are skipped by "next unit" (p.8-9, 34-36).
- Heal 1 strength per turn only when attached to a Colony Center (p.44). Ships heal 1 point per turn next to a Dock (p.46).

---

## 8. Colonies and economy

### 8.1 Founding and area
- A founder founds a colony on flat land (Found button, grey if illegal); Center starts at level 1 (p.24-25). `Z` previews the area. Buildings must lie wholly inside the highlighted area; the Center upgrade widens it by about one ring on the next turn (p.12-13, 26). A level-1 colony spans a 5x5 area (ASSUMED radius 2, 02/05 L-4).
- Footprint: Fort 2x2; all others 1x1 (ASSUMED; the manual states only the Fort).
- **Undo Found** only in the turn of founding.

### 8.2 Building costs (MANUAL p.30-31, image-verified; cost to reach that level from the previous one)
| Building | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| `bld.food` (Farm) | 4W | 4M, 10W | 10M, 4G, 20W | 20M, 10G, 32W |
| `bld.habitat` (Housing) | 2W | 2M, 5W | 10$, 5M, 2G, 10W | 40$, 10M, 5G, 15W |
| `bld.attractor` (Church) | 5W | 20$, 5M, 12W | 50$, 12M, 5G, 25W | 100$, 25M, 12G, 40W |
| `bld.core` (Colony Center) | 1 founder | 5M, 20W | 100$, 10M, 5G, 40W | 250$, 20M, 10G, 80W |
| `bld.port` (Dock) | 2W | 2M, 5W | 5M, 2G, 10W | 25$, 10M, 5G, 16W |
| `bld.basic_extractor` (Mill) | 3W | 3M, 7W | 10$, 7M, 3G, 15W | 50$, 15M, 7G, 25W |
| `bld.hard_extractor` (Metal Mine) | 4W | 4M, 10W | 10$, 10M, 4G, 20W | 50$, 20M, 10G, 32W |
| `bld.coin_extractor` (Gold Mine) | 8W | 8M, 20W | 20$, 20M, 8G, 40W | 100$, 40M, 20G, 64W |
| `bld.converter` (Commerce) | 3M, 2G, 3W | 7M, 5G, 7W | 20$, 15M, 10G, 15W | 60$, 25M, 16G, 25W |
| `bld.scout_post` (Tavern) | 2W | 2M, 5W | 10$, 5M, 2G, 10W | 40$, 10M, 5G, 15W |
| `bld.garrison` (Fort) | 1M, 10W | 5M, 25W | 20$, 15M, 5G, 50W | 90$, 30M, 15G, 75W |
| `bld.academy` (War College) | 20$, 15M, 5G, 50W | single level | | |

(The original's Dock L3 cost is 5M, 2G, 10W, **not** 5 Gold.)

### 8.3 Building outputs and capacity (MANUAL p.30-32)
| Building | L1 | L2 | L3 | L4 | Notes |
|---|---|---|---|---|---|
| Farm | 3 food | 9 | 21 | 36 | also houses 40 people per level |
| Housing | holds 100 | 300 | 600 | 1000 | recruits founder |
| Church | +10 people/turn | +20 | +30 | +40 | immigration |
| Center | houses as Housing of same level | | | | recruits commander; max level 4 (2 for the indigenous archetype) |
| Mill | 1 | 3 | 7 | 12 | basic material |
| Metal Mine | 1 | 3 | 7 | 12 | L1 always yields at least 1 |
| Gold Mine | 20 | 60 | 140 | 240 | a European site at -100% or worse yields nothing; indigenous floor -90% |
| Commerce | 1 | 3 | 7 | 12 | consumes 1 metal, 1 wood, 1 food **per level** (p.32 note 5) |
| Tavern | recruit scout L1 | L1-2 | L1-3 | L1-4 | |
| Fort | recruit military L1, supports 4 | L1-2, 7 | L1-3, 9 | L1-4, 10 | 2x2 |
| Dock | build transport L1 | L2 | L3 | L4 | ocean Dock builds ships; river/lake Dock is a trading post only |
| War College | improves military (single level) | | | | rating costs "increasingly larger" Gold |

Output is the normal value before modifiers (p.32 note 3).

### 8.4 Productivity (resolves critique H-2)
`output = base_by_level * (1 + modifier)`, with `modifier = clamp(terrain + river + discovery + specialisation + difficulty_offset, floor, cap)` in integer percent. The terrain term sums per-tile weights from `terrain_affinity.json` over the colony area with falloff `1/(1+d)`, normalised. Best terrain (p.30-32): Farm grass near water; Mill forest or jungle near river; Metal and Gold Mine near mountains; Dock water; river proximity enhances Mills and Mines. The affinity table, falloff and caps are ASSUMED data with two worked examples (one landing exactly on -100%) in the economy simulator fixtures. Labour shortage lowers output proportionally (ASSUMED). Specialisation: the bonus for the colony's most common production building type grows with its count (p.26-27); size ASSUMED, default 3% per extra building up to 30%. Resource setting (scarce/normal/abundant, p.20) scales terrain productivity in new colonies.

### 8.5 Population, food and housing
- People are the colony population (labour, housing load, and the P in unit costs). Maximum = housing capacity of Center + Housing + Farms.
- Food: colonists must be fed or they emigrate/starve (p.14-15, 28-29). ASSUMED: 1 food per 100 people per turn; natural growth 3%/turn up to housing; emigration/starvation 5%/turn on shortage; start population 100, start stock a small kit (01 G1-G3).
- Church immigration adds the listed amount per turn; diminishing returns for extra Churches (100%, 75%, 50%) is an ASSUMED balance fix.
- A level-1 founder costs 150 P but a level-1 colony holds 100: the colony must first grow past 150 via Farms and Housing (INFERRED). Garrisoned units count toward population by their People cost (ASSUMED).
- Labour: single Free Labor pool (population minus demand); demand per building level ASSUMED and tuned by the simulator.

### 8.6 Build, upgrade, demolish timing and refunds
Costs are deducted at order time (INFERRED from Halt Construction, p.26-27). Halt Construction or cancelling an upgrade/recruit before End Turn is a **full** refund. A new building or upgrade becomes functional next turn; no building may exceed the Center's level; the Center cannot be demolished. Demolish completes at the start of next turn, the square is blocked until then, and a "small portion" (ASSUMED 25%) is refunded.

### 8.7 Forecast rule
Colony screens show the expected next-turn value of each stock (p.15, 28). `economy.preview(colony)` **is** the function the turn uses; a property test asserts preview equals the real next turn when nothing else changes.

---

## 9. Trade

- **Patron trade** (Mother Country): needs a Dock on ocean (or river connected to ocean); takes several turns; several trades per turn; Edit/Remove before the turn ends (p.14-15). It is the **primary**, not the only, source of wares for the expedition archetype (p.14). Prices, delay and limits are SILENT: ASSUMED buy price greater than sell price (about 2:1 spread), delay 2 turns.
- **Anti-runaway rules (critique H-4, ASSUMED tunables):** each unit bought raises that commodity's price 1% (decays 20% per turn); per-colony import cap scaled by Dock level (20/40/80/160); acceptance test: a pure coin-and-trade colony reaches Center L4 no more than 25% faster than a balanced one.
- **Taxes:** the manual says expedition factions pay automated tax from coin and commodities (p.6-7); the indigenous archetype pays none (p.22). Rate SILENT. The earlier draft set 0%; this GDD keeps a tax mechanic with ASSUMED 10% of coin and 5% of other output, decision D-3.
- **Colony-to-colony transfers:** one or more turns by distance and known routes, overland slower (p.14-15).
- **Native/NPC trade, tribute, alliances, independence:** hooks only in the MVP (section 22).

---

## 10. Factions

Pre-Deluxe all expedition nations were equal (p.56); the Deluxe bonuses are data records of typed effects (verbs about roles, not themed nouns):

| Profile (original) | Effects (MANUAL p.56-57) |
|---|---|
| `fp.naval_ranged` (Britain) | naval-combat ability; ranged-unit offence and defence = 1 + academy rating |
| `fp.envoy_shock` (France) | +30 starting native relations (201-point scale); shock-unit bonus = 1 + rating |
| `fp.scout_line` (Spain) | scouts act one level higher; line-unit bonus = 1 + rating |
| `fp.mobility` (Portugal) | movement acts one setting easier (+50% from Normal) |
| `fp.banker` (Holland) | 5% interest per turn on coin stocks; patron trade one turn faster (min 1) |
| `fp.indigenous_high` (High Natives) | land units one level higher; coin-extractor floor -90% and more coin per level; shock bonus |

**Archetypes:** `arch.expedition` arrives by transport on the arrival edge, has a patron, pays tax, may field ranged, Center max 4. `arch.indigenous` starts on the home edge, no patron, no tax, cannot field ranged, Center max 2, cheaper founder/line/shock, farther scouts (p.20-23, 26). The manual contradicts itself on "larger cities" versus the level-2 cap; MVP applies the cap and expedition building costs, flagged ASSUMED.

**Balance fixes (ASSUMED, critique H-5):** the 5% interest is MANUAL but unbounded; add a flagged deviation `coin_interest_cap_per_colony` (suggest 50/turn), decision D-4. Raise rating value to about 0.05-0.08 hit chance per point so military bonuses matter. Phase 4 runs a nation-vs-nation matrix; pass band each pair wins 35-65% over N seeds. Portugal at Easy: capped at x2.0.

**Capture rule:** `cross_archetype_capture: forbidden` (p.40); the manual's own answer across that line is **raid** (section 11.6).

---

## 11. Combat

### 11.1 Glossary
Strength (1-5) is both hit points and attack strength. One **attack** = one group strike on one target square by any number of units from one or more squares. A **combat turn** is one side's turn; a **round** = attacker turn + defender turn.

### 11.2 Board (MANUAL p.42-43)
Grid **3 columns x 4 rows**, no diagonals. Units start in reserves off-board; the row next to your reserves is your home row. Square capacity: 6 slots (line 1, shock 2, ranged 2). A unit adjacent to an enemy may only move to squares not adjacent to another enemy. Attacker moves first. Flags: each side's flag is the centre of its home row (ASSUMED, 02 G10) in field and colony battles alike.

### 11.3 Actions
| Unit | Move | Attack | Reach |
|---|---|---|---|
| `u.line` | 1, or attack | once, only if it did not move | adjacent orthogonal |
| `u.shock` | up to 2, or up to 1 then attack; never move after attacking | once; charge bonus if it moved and did not panic last turn | adjacent orthogonal |
| `u.ranged` | 1, home row only | once, only if it did not move | any square in its column, stronger when closer |
| `u.commander` | not stated | its level sets attacks per combat turn | n/a |

Attacks per commander level ASSUMED 1/2/3/4, one attack without a commander (02 G6).

### 11.4 Odds (directions MANUAL, sizes ASSUMED — initial guesses, tuned by the combat harness, see 02 G7-G9)
Bonuses raise hit **probability**, not shots: flanking (more attacking squares), combined arms (more unit types), both additive; charge; ranged stronger at short range; line/shock hitting a square of only ranged do extra damage; counter-battery penalty (ranged vs ranged); "like attacks like" target weighting. ASSUMED defaults: base hit 0.30 line, 0.32 shock, 0.28 ranged; +0.05 per extra flank square; +0.05 per extra unit type; charge +0.10; clamp 0.05-0.95.

### 11.5 Morale
A damaged unit may panic and retreat one square toward reserves: more damage means likelier; own commander's **Charisma** reduces it, enemy commander's **Reputation** raises it; a blocked retreat (including from the home row) costs +1 damage and the unit stays (p.17, 44). Rolled once per damaged unit after each attack. Charisma and Reputation are integers 0-10 (critique H-3): Charisma = 2 + level + rng(0..2), Reputation starts 0, +1 per won battle, -1 per lost, clamped 0-10. Experience points are post-MVP.

### 11.6 Outcomes
- **Win** by entering the enemy flag square, eliminating all enemy units, or forcing a retreat (p.42). **Retreat**: the enemy gets one parting shot; if defending a colony the colony is lost (raid: destroyed) (p.45).
- **Attack a unit**: destroy only. **Attack a colony**: capture or raid (p.40).
- **Capture**: needs a battle win; the colony takes "some damage" (ASSUMED one random building loses one level; half of each stockpile kept).
- **Raid (MANUAL p.41, replaces the earlier "raze on win" invention):** a win is not required. From round 3 the attacker takes 10% of the remaining stockpile each round, shrinking each round. From round 5 one building level is destroyed per round and the attacker gains half its value (latest upgrade cost for a level-1 building). If defenders are eliminated or retreat the colony is destroyed; retreating defenders reappear near the old site next turn. Forts are harder to destroy (ASSUMED multiplier).
- **Colony defence** (p.41-44): militia (always level 2 line or ranged, count rises with Center level), extra ranged per Fort, all garrison military, and the **best commander in the colony** leads the best units there whether attached or not; nearby friendly natives may help. Red numbers mark generated defenders: lost militia reduce population (ASSUMED 5 people per strength point); lost Fort ranged do not.

### 11.7 Combat Demo (build first)
The manual's practice mode is the ideal combat test harness (p.45-46): point-buy 5-40 per side, line 1, shock 2, ranged 2, commander attack point 3, all units level 4; terrain choice is cosmetic. It is built **before** the AI so combat is playable and tunable with no map.

### 11.8 Ship combat (post-MVP structure)
Resolved between turns; attacker chooses Sink or Board; the "wind gauge" initiative favours smaller undamaged ships; the defender may flee; boarding uses line at full strength, shock at half, ranged not at all (p.46). Odds ASSUMED in 02 G23.

---

## 12. Victory, defeat and failure states

- **MVP win:** last faction standing (locked decision 6). **Eliminated** = no colony and no founder (ASSUMED; the manual is silent; a player with no colony for `homeless_turns_limit` = 15 turns is also eliminated).
- **Anti-stalemate (ASSUMED):** after turn 150 each player's colony positions are revealed to opponents as intel.
- **The manual's wider model (pp.19-24, 52-55):** three routes to win (Winning Score 0-200,000; highest score at Max Turns 0-300; last standing), victory points from exploring, landmarks, colonies, combat damage and diplomacy, a 40-point bonus allocation, ten special abilities at 10 points each, and a play-time bonus. Restoring it is decision D-1.
- **Failure states and warnings (each has one UI warning, tested):** starvation spiral, labour collapse after recruiting, a mine at -100%, losing the last colony, stalemate.

---

## 13. AI

- Plays by the same rules and the same fog as the human: it receives a `KnowledgeView` (own state plus intel records), never live world state; `plan(view, rng)`.
- Strategic planner: expands, builds from a data build order, scouts, scales its army to known enemy colonies. Build-order conditions are named predicates in `ai/conditions.py` referenced by name from JSON (unknown names fail at load).
- Tactical AI: uses the same battle implementation as the human UI and auto-resolve.
- Difficulty (MANUAL p.20-21): changes terrain-based productivity in the **computer's** colonies and native hostility. ASSUMED as a modifier offset (+0.10/+0.20 at Hard/Very Hard), visible in the colony preview, not a hidden multiplier.
- Debug logging of every decision for headless tuning.

---

## 14. UX

### 14.1 Flow (MANUAL pp.1, 18-25)
Game menu (New Game, Continue, Combat Demo, Options, Quit) -> scenario -> custom setup -> player setup -> game. Game screen: status bar across the top for requirement and shortfall feedback, top buttons (Mission, Next, End Turn, +, -, Menu), the map, the Auto Map overview bottom-left. Windows: Main Menu, Unit List, Messages, Colony Center (commodity strip, Upgrade, Build, Population Detail, Commodity Detail, Trade, Building List, Commission Leader), Building window, Unit window, Trade window, battle screen, digest.
The manual's pixel layouts exist only in figures (SILENT); layouts here are original.

### 14.2 Controls
| Key / action | Function | Source |
|---|---|---|
| `E` | End turn | p.2 |
| `Z` | Colony site preview | p.10-11 |
| `X` | Explore / Halt | p.8-9 |
| `C` | Send a message to a player (delivered next turn) | p.60 |
| `F1` / `F2` / `F3` / `F4` | Next colony / leader / ship / explorer | p.6-9, 32 |
| `+` `-` | Zoom (SHIFT = extremes) | p.6-7 |
| `Esc` | Close window | p.2 |
| Ctrl+click | Redirect / fast explore | p.34-35 |
| Shift | Speed up moves; multi-select | p.8-9 |
| Alt+click | Select whole combat square | p.42 |
| Right-click | Help for any element | p.3 |
| Next button | Cycle unattached units with moves left | p.6-9 |
| `N` or Tab, arrows, Ctrl+S/O | **Not in the manual**; ASSUMED additions | 03 D3, D11 |

Mouse: click selects, drag moves/attaches/detaches, double-click opens windows.

### 14.3 Rendering
~~Isometric, zoom 0.25-2.0, drag-pan. Pre-render the map in 16x16-tile chunk surfaces per zoom level, invalidated when fog changes (critique M-15). Frame budget: 16 ms at 64x64, 33 ms at 256x256.~~ (superseded by the Unity amendment below; kept for history)

**Unity amendment (2026-10-03, per 13 sections 6 and 1.2):** isometric, zoom 0.25-2.0, drag-pan, drawn on the GPU.
- Terrain: Unity isometric Tilemap in Chunk mode (flat diamonds), or 16x16-tile chunk meshes behind an `IMapLayerView` seam if the 256x256 budget fails. Zoom is a camera property, so there is no per-zoom re-render. Units, buildings, selection and previews are sprites, not tiles, sorted by their front-most tile (critique M-15).
- Fog: one R8 texture per viewing player (0 never seen, 128 seen before, 255 visible now), only changed 16x16 rectangles uploaded; fog is never conveyed by colour alone (section 16).
- Budgets (REC, measured on the reference Mac in Phase 1): frame time at 256x256 at any zoom <= 16.7 ms (99th percentile <= 25 ms); terrain plus fog draw calls <= 64; 0 B managed allocation per idle or pan frame; fog update after a unit move <= 1 ms; full map rebuild <= 500 ms; map-view process memory <= 512 MB on desktop.
- Controls (14.2): keys become a rebindable Unity Input System action map with the same defaults.

---

## 15. Onboarding
The manual's tutorial has four timed missions (landmarks by turn 10, found a colony by turn 20, Center L2 by turn 30, eliminate the rival by turn 40; p.2-18). MVP: three contextual missions on the message system (land and explore, found and feed, upgrade the Center) plus right-click help on every element. Mission completion is tested from scripted orders.

## 16. Accessibility
Colour-blind-safe owner colours plus flags or patterns (fog never by colour alone); remappable keys; UI scale 100-200%; keyboard-only play for the main loop; no time pressure (play-time bonus off); battle odds shown as numbers. A checklist item in the definition of done for every screen.

## 17. Save/load
*Unity amendment: the rules below are unchanged. New IO only: files under `Application.persistentDataPath`, written by our own canonical JSON writer (integers only); Web builds need an IndexedDB-backed `IFileStore` adapter (13 section 9). The atomic write (`.tmp`, then replace) keeps the `.bak`.*

Versioned JSON, rotating autosave (3 slots) at the start of every turn, named manual saves (Save & Exit resumes the same turn; Exit discards the turn's moves, p.4-5, 58). Saves record the ruleset id, version, variants and hash, plus theme and locale, and RNG counters. A newer-version save is never overwritten; a damaged file keeps a `.bak`. Quitting mid-battle auto-resolves remaining battles deterministically before saving. A save loads under any installed theme when the rules hash matches.

---

## 18. Architecture

**Unity amendment (2026-10-03, per 13 sections 2-4).** The Python wording below is kept for history and is superseded where it conflicts with this block.
```
data (rules/themes/settings JSON) -> Conquest.Core -> Conquest.Rules / Conquest.Ai -> Conquest.Theme -> Conquest.App -> Conquest.Unity.Presentation
```
- The same dependency graph is expressed as **assembly definitions**. `Conquest.Core`, `Conquest.Rules`, `Conquest.Ai`, `Conquest.Theme` and `Conquest.App` have `noEngineReferences: true` and no UnityEngine reference; only `Conquest.Unity.Presentation` (and the Editor and Unity test assemblies) use Unity. File and clock access in the engine-free code goes through interfaces (`IFileStore`, `IClock`). The engine-free source is an embedded local UPM package compiled a second time by a sibling .NET solution (13 section 2.2). The boundary test reads the `.asmdef` files, the assembly references and the source, instead of parsing Python imports.
- **Immutability (C#):** sealed classes with `readonly` fields and `With...` methods, `readonly struct` value objects, own small immutable containers (`ImmArray<T>`, `IdMap<T>`, sorted by integer id) and copy-on-write 16x16 chunks for map layers; the terrain `World` is still shared by reference; fog is a `ulong` bitset in chunks. No `System.Collections.Immutable` dependency.
- **Determinism in C# (critique H-8):** integer-only simulation (no `float`, `double` or `decimal` in Core, Ai or rule values) with one floor-division helper in `IMath` (C# `/` truncates toward zero, unlike Python `//`); counter-based RNG `Draw(seed, stream, turn, key)` built on the SplitMix64 finaliser, with stream codes from our own FNV-1a-64, never `string.GetHashCode()`; never enumerate a `Dictionary` or `HashSet` (state is arrays sorted by integer id; strings compared ordinally only); own canonical state hashing (own canonical JSON writer, own SHA-256 for the rules hash and saves, own 64-bit hash for per-turn state hashes over a declared field list). CI replaces the two `PYTHONHASHSEED` runs with the **multi-runtime replay test**: every golden replay runs on CoreCLR (`dotnet test`), Mono (Unity EditMode) and an IL2CPP player, and all hash lists must equal the golden file (13 sections 3 and 10).
- Frame, time and allocation budgets are in 14.3 and 13 section 4.4; the `apply_order` and `end_turn` gates below are kept as `ApplyOrder` and `EndTurn`.
- Theme boundary: `Core` and `Ai` reference no theme, locale or assets (assembly references make it impossible).

*Original Python text (superseded, kept for history):*
- ~~`core/` is pure Python: no pygame, no clock, no file IO. State in, state out. `ui/` and `app/` may import `core`; `core` never imports them. A boundary test parses real imports.~~
- **Immutability:** frozen dataclasses with tuples; copy-on-write helpers. `apply_order(state, order) -> Result` returns a new state or a typed error. The terrain `World` is shared by reference. Honest note: with plain frozen containers a copy is O(n); accept that at MVP sizes (critique M-16), keep fog as a bitmap, and gate with benchmarks: `apply_order` p95 under 2 ms and `end_turn` under 300 ms at 64x64 with 200 units.
- **Determinism (critique H-8), original Python text:** never iterate a set (always `sorted()`); counter-based randomness `draw(seed, stream, turn, key)` with separate streams (`worldgen`, `combat:<id>`, `ai:<player>`, `economy`); all rates as integer percent or per-mille with one `floor` helper; CI runs the same replay under two `PYTHONHASHSEED` values. The cosmetic stream is separate and never read by `core`. *(Stream names, integer percent and per-mille rates and the separate cosmetic stream carry over unchanged; the `PYTHONHASHSEED` test is replaced by the multi-runtime replay test above.)*
- Theme boundary (original wording): `core` and `ai` import no theme, locale or assets.

## 19. Data files and tunables
*Unity amendment: identical files and seven-step pipeline. Location `Assets/StreamingAssets/conquest/` (with a generated `index.json` listing every file and its SHA-256, since Web and Android cannot list folders); read through one async `IFileStore`. Parsing uses our own strict JSON reader (positioned DOM, exact integers, duplicate-key rejection, RFC 6901 JSON Pointer) and schemas written as C# combinators, so Unity and `dotnet test` behave identically; loading never throws for bad data and every diagnostic carries file, JSON pointer, line and column (13 section 5).*

`rules/core/*.json` (resources, terrain, buildings, units, factions, combat, economy, scoring, events, terrain_affinity), `rules/variants/*.json`, `themes/<id>/*`, `settings/*`, `scenarios/*`. Schemas validated at load with file and JSON path in every error; a seven-step pipeline (schema, integrity, variants, settings ranges, scenario vs rules, theme coverage, presentation sanity). **The assumption register lists every leaf key in `tunables`**; a test fails on any key with no register entry. Every ASSUMED value in this GDD is such a key; the gap lists G-numbers in 01 and 02 are the starting register.

## 20. Testing and acceptance
- *Unity amendment (13 section 10):* the engine-free assemblies are tested with **NUnit under `dotnet test`** (and the same test assembly in Unity EditMode); presentation uses the Unity Test Framework (EditMode and PlayMode). Coverage is measured with **coverlet** on the engine-free code with the **80% gate** kept (per-package floors as in the neutral-base test plans, 10 §13.1); Unity's Code Coverage package is optional for presentation. The determinism check is the multi-runtime replay test (18); boundary tests read `.asmdef` files, references and source scans instead of Python imports. Test names stay as in the test plans; only the harness changes.
- Unit tests for pure `core`; golden replays; fuzz invariants on random orders; deep-snapshot tests that `apply_order` never mutates.
- Preview-equals-real-turn property test; theme-swap determinism; theme coverage; boundary and no-set-iteration lint (in C#: no enumeration of `Dictionary` or `HashSet`, no culture-sensitive calls, no floats, by source scan).
- Headless economy simulator: a scripted 60-turn build order prints a pacing curve and checks section 4 targets.
- Combat harness from the Combat Demo; nation matrix (35-65%); AI-vs-AI soak finishing without exception; early-rush test (2 L1 line plus L1 commander cannot take an L1 colony).
- Coverage 80% minimum; performance gates from section 18.

## 21. Phases (each ends playable and committed; order of the locked decision kept)
*Unity amendment: the phase order and content below stay. The Unity re-plan, with rewritten exit criteria, lives in [13-unity-architecture-plan.md](13-unity-architecture-plan.md) section 12. Phase numbers that change: Phase 0 becomes "Skeleton" with the Unity project, the .NET solution, five engine-free assemblies, boundary tests, a Bengali text spike and the strict JSON reader (no venv); Phase 1 adds a render benchmark at 256x256 and a Web smoke build; Phase 2b adds replay recording and goldens; Phase 4 adds the threaded and time-sliced AI runner and the three-runtime replay including IL2CPP; a new **Phase 5 (after MVP)** holds the hooks H1-H7 and the bd1971 variant, scenario and theme. Phases 2a and 3 keep their numbers.*

| Phase | Content | Exit criteria |
|---|---|---|
| 0 | Project skeleton, venv, data loader and validators, boundary tests | Tests green, empty window opens |
| 1 | World generation, iso render, zoom/pan, fog, exploration, intel, ship and scout movement | Explore a seeded map; frame budget met |
| 2a | Found, place, produce, population, Center upgrades, economy simulator | Pacing targets met in simulator |
| 2b | Recruit, patron trade with elasticity and caps, transfers, save/load | Round-trip and migration tests |
| 3 | **Combat Demo first**, then field and colony battles, capture, raid | Combat harness playable; scripted battle tests |
| 4 | AI opponent, tutorial missions, balance matrix | Full scripted game; matrix pass band |

## 22. Deferred features and reserved hooks
Victory points and abilities (score events hook); native tribes and landmarks (`npc.settlement`, `lm.*` roles); special discoveries (`disc.*`); diplomacy, tribute, alliances, independence (`dip.*`, `sov.*`); Auto Colony (reuses AI build orders); ship combat (structure in 11.8); Leader experience; multiplayer (an order-list model keeps hot-seat or network possible); scenario templates and mapped scenarios; play-by-email; sound (event hooks only).

---

## 23. Risks and decisions for the owner

### 23.1 Decisions needed
| ID | Decision | Recommendation |
|---|---|---|
| D-1 | Keep "last standing only" or restore victory points, Max Turns and Winning Score (the manual's main model)? | Last standing for MVP; keep a `scoring` ruleset hook so VP can be added as a variant |
| D-2 | Neutral role ids (`bld.garrison`) or short colonial ids (`fort`) as internal ids? | Neutral ids |
| D-3 | Tax: none (0%), or an automated tax (rate invented)? | Keep the mechanic at the proposed 10% coin / 5% other, tunable to 0 |
| D-4 | Cap Holland's compounding 5% interest (a flagged deviation)? | Cap at 50 coin per colony per turn |
| D-5 | May a theme carry rule tweaks? | Never; use variants plus bundle presets |
| D-6 | Default world size: 128 (proposed), 64 (earlier draft) or 256 (manual normal)? | 128 for Python performance; 80-256 allowed. *Unity amendment: still 128, reason now readability and AI pacing; 256 is a realistic target (13 section 1.2).* |
| D-7 | Opening: everything aboard on turn 1, or first founder on turn 6 as in most scenarios (p.24)? | Turn 1 aboard, turn-6 preset available |
| D-8 | Include the High Natives player in the MVP? Without raid and NPC tribes it cannot get wares. | Defer until raid exists, or include with raid in Phase 3 |
| D-9 | Native "larger cities" versus Center cap of 2: which wins? | Apply the cap, flag ASSUMED |
| D-10 | Which themes ship first, and how is the indigenous side presented in the colonial theme (names, art, label for the attractor)? | Colonial plus a minimal second theme from Phase 1; invented respectful non-tribal names |
| D-11 | JSON versus TOML for data | JSON (works on Python 3.10). *Unity amendment: JSON stays; reason now "one strict reader shared by Unity and dotnet" (13 section 1.2).* |
| D-12 | Languages in scope | English plus one pseudo-locale test |
| D-13 | Dependencies: `pygame-ce` (system Python 3.14 has no pygame wheel) vs a Python 3.13 venv; `pytest`/`pytest-cov` dev only; `pydantic` or stdlib validation | **ANSWERED-BY-13 (Unity amendment, 2026-10-03): the Python list is replaced by the dependency list in [13](13-unity-architecture-plan.md) section 14 (.NET SDK, new Universal 2D Unity project, Input System, Unity Test Framework, NUnit and test adapter, coverlet, Bengali font and optional items).** 13 decides what is needed; **every item in its section 14 stays OPEN: it needs your yes before install**, and nothing has been installed. |
| D-14 | Code location: `conquest/` in the repo or a new repo | **ANSWERED-BY-13 (REC):** `conquest/` in this repo with a Unity project (`conquest/unity/`) and a .NET solution (`conquest/dotnet/`), no `pyproject.toml` (13 sections 2.2, 2.5, D-U3, D-U4). **OPEN:** 13 notes the owner may prefer a new repo, and creating the new Unity project needs the owner's yes. |
| D-15 | Your fuller manual: this PDF has no Diplomacy chapter though p.7 points to one | Supply it if you have it; otherwise diplomacy is designed from scratch |

### 23.2 Risks
Economy runaway (coin trading) and unbounded interest (section 9, 10); simultaneous-turn fairness (6.1); determinism holes (18); performance of immutable state at 256x256 (18; Unity amendment: addressed by chunked copy-on-write and the GC budgets in 13 section 4.4); manual gaps force many invented numbers (section 19 register); content sensitivity of the colonial theme's indigenous faction (D-10); ~~environment: no pygame wheel for Python 3.14~~ (moot after the Unity decision). New engine risks (two compilers drifting, hidden nondeterminism, Bengali shaping, Web without threads, IL2CPP-only failures) are listed in 13 section 13.2.

---

## 24. Appendix

### 24.1 Where the manual is silent (summary; full lists in 01 and 02)
Movement points and terrain costs; hit odds and bonus sizes; starting stock and population; food rates, growth and emigration rates; labour per building; the modifier combination formula and specialisation size; patron prices, delay and limits; tax rate; ship and commander capacity; war college rating curve; colony area per level; special-discovery magnitudes; what counts as elimination; map-generation algorithm; fog radii; diplomacy ladder and tribute. All are ASSUMED data.

### 24.2 Corrections to the earlier `design.md` (from the panel)
| Item | Correction |
|---|---|
| Page cites | 3x4 grid is p.42; native level cap p.27; Commerce note 5 p.32; "p.8/p.9" cites were PDF indexes |
| "Only" source of wares | The manual says the patron is the **primary** source; Commerce also produces wares |
| Tax 0% | The manual has automated tax for expedition factions |
| Raid | Fully specified on p.41; not "unspecified" |
| First founder | Turn 6 in most scenarios (p.24-25) |
| Victory | Three routes and a point economy, not only last standing |
| Difficulty | Terrain productivity in computer colonies plus native hostility |
| World size | Manual range 80-256, not min 40 / default 64 |
| `N` key | Not in the manual |
| Heal | Units must be attached to a Colony Center |
| Leader | Also has Leadership, Combat, Movement attributes (p.58) |
| Verified identical | Every building and unit cost, output and capacity (22 of 22 spot-checks plus all 28 unit rows), nation bonuses, Undo Found timing, the Z/X/E/F1-F4 keys, year 1493 |

### 24.3 Glossary
Strength, attack, combat turn, round, home row, reserves: section 11.1. Role id: neutral ruleset key a theme labels. Patron: the home-base trader (original: Mother Country). ASSUMED: a number we invented and stored as a tunable.

---

## Change log (Unity amendment)
Date 2026-10-03. Additive and clearly marked; no rule, number, role id or table value was changed. Authority: [13-unity-architecture-plan.md](13-unity-architecture-plan.md).
1. Status line and first-page "Built from" area: status notes the amendment; added a "Related documents" table listing 13 and the `bd1971/` folder.
2. 1.1 Vision: platform wording changed from Python and pygame (struck) to Unity 6 with an engine-free C# core.
3. 1.4 Locked decisions: decision 1 marked SUPERSEDED (old text struck); notes added to decisions 3, 4 and 8. Decision 4 now says the art method is re-opened, as 13 states (citing TP §8).
4. New 1.6 Engine decision record (date, reason, unchanged, changed, link to 13). It sits before 1.5 in file order, so the numbering reads 1.4, 1.6, 1.5.
5. Section 4: note only (no pygame or Python references exist there; pacing targets unchanged, simulator becomes a `dotnet` tool).
6. 5.1: note that 128 stays the default with a changed reason.
7. 14.3 Rendering: old text struck; Tilemap/chunk approach, fog texture, performance budgets and Input System note added.
8. 17 Save/load: note on new IO only (persistentDataPath, canonical writer, Web IndexedDB adapter); rules unchanged.
9. 18 Architecture: assembly graph, `noEngineReferences`, C# immutability, determinism in C# (integer math, SplitMix64, no Dictionary/HashSet enumeration, own hashing and canonical state hash, multi-runtime replay test replacing the `PYTHONHASHSEED` test); original Python text kept, struck or labelled superseded.
10. 19 Data: C# data loading note (StreamingAssets, `index.json`, strict JSON reader, C# schemas).
11. 20 Testing: NUnit with `dotnet test`, Unity Test Framework, coverlet, 80% gate kept; lint wording extended to C#.
12. 21 Phases: note that the Unity re-plan lives in 13 section 12 and which phase numbers change (0, 1, 2b, 4, new 5).
13. 23.1: D-6 and D-11 reasons annotated; D-13 and D-14 marked ANSWERED-BY-13 where the plan decides them, with every item that needs approval before install still OPEN; 23.2 risks updated.
14. OPEN: the GDD 14.2 key table is left as is (the Input System rebinding is only noted in 14.3); 13 lists "23 D-11" and "5.1 (D-6)" as reason-only changes, applied as annotations.
