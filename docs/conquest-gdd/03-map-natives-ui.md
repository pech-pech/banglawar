# GDD part 03: Exploration, Map, Natives and Diplomacy, Nations, UI and Controls

Source of truth: *Conquest of the New World Deluxe* manual (Interplay, 1996), 37 PDF pages. Cross-checked against `docs/design.md` in the `conquest-new-world-design-1dc70b` worktree (read-only). The manual wins on disagreement.

**Method note.** The PDF has a text layer, so it was extracted directly (no image rendering: `pdftoppm` is not installed and nothing was installed). Figures (screenshots) carry no text in the layer, so screen layouts drawn only in figures are marked SILENT. PDF page N (1-based) is a two-page spread: PDF page `k` holds printed pages `2(k-1)` and `2(k-1)+1` (PDF page 16 = printed pp.30-31, which matches the building table). Text order inside a spread is not reliable, so facts are cited as the spread: **pp.A-B**.

Status tags: **MANUAL** (stated, page given), **SILENT** (manual says nothing), **ASSUMED** (our proposed default, to be a tunable).

**Manual scope warning.** The manual's table of contents (p.1 of the contents page) lists no Diplomacy chapter and no map-generation chapter, although p.6-7 says "See the Diplomacy chapter". All diplomacy facts below are therefore the scattered mentions only.

---

## 1. Findings

### 1.1 Setup, players and game length

| Fact | Status | Page |
|---|---|---|
| Up to 6 players: 5 European nations (Britain, Holland, France, Portugal, Spain) plus Natives; only one player per nation or Natives | MANUAL | pp.20-21 |
| Solitaire: 0 to 5 computer opponents ("truly solitaire" with 0) | MANUAL | pp.18-19 |
| Multiplayer: 1 to 6 humans and no computers, or 2 humans with up to 4 computers; no two players share a country | MANUAL | pp.48-49 |
| Custom setup fields: Game Name, Computer Players, Max Turns, Winning Score, Indian Settlements, Land Seeds, Water Seeds, Resources, Play Time Bonus, Movement, Difficulty, World Size, Early Diplomacy | MANUAL | pp.18-21 |
| Max Turns 0 ("Unlimited") to 300; highest score at that turn wins unless someone hit the Winning Score earlier | MANUAL | p.19 |
| Winning Score 0 ("Unlimited") to 200,000; first to reach it wins | MANUAL | pp.19-20 |
| Indian Settlements: 0 to 50 | MANUAL | p.20 |
| Land Seeds / Water Seeds: counts the generator uses; more land seeds relative to water = more land and one big continent; more water seeds = more water and more islands; too much water can make the world nearly uninhabitable. Numeric ranges and defaults not given | MANUAL (ranges SILENT) | p.20 |
| Resources: scarce / normal / abundant ("general productivity of land" for Mills, Farms, Mines) | MANUAL | p.20 |
| Movement: Easy / Normal / Difficult; easier = units move farther per turn. Portugal's "one setting easier" is +50% from Normal to Easy | MANUAL (Easy and Difficult multipliers SILENT) | pp.20, 57 |
| Difficulty: Very Easy, Easy, Normal, Hard, Very Hard. Affects the availability of resources (terrain productivity modifiers) in the **computer players' colonies**, and natives are more likely to be hostile at higher levels | MANUAL | pp.20-21 |
| World Size: normally 256 x 256, reducible to 80 x 80 ("a crowded world"). Second statement: "alter the size of the land masses", 80 to 256; smaller numbers give less overall land, pushed into the right-most quadrant | MANUAL | pp.20-21, 56-57 |
| Early Diplomacy checkbox: lets all players do Diplomacy before they are Independent, but "you could make your Mother Country angry". Implies diplomacy is normally unlocked by independence | MANUAL | p.21 |
| Player Setup: Player Name, Play As (nation), 40 victory-point-bonus points to allocate, Special Abilities | MANUAL | pp.21-24 |
| Europeans start with "a few units on a Ship that has just sighted land" and must disembark, explore, found colonies. Number and kind of starting units SILENT | MANUAL (units SILENT) | p.21 |
| Europeans start on the right edge of the world, Natives on the left edge | MANUAL | pp.21-22 |
| Game year starts 1493; one turn = one year | MANUAL | pp.4-5 |
| "In most scenarios, your first settler appears on turn 6" (conflicts in spirit with the Tutorial, where the Settler starts aboard ship) | MANUAL (unclear) | p.25 |
| Player can "Edit" their player in Options to hand control to the computer or take over a computer player | MANUAL | pp.1, 6-7 |
| Scenarios: Tutorial (4 missions, England only), Island (Portugal, Spain or France claim an island), Natives (sole player, federate 15 native tribes), Survivor (Spain, France, Britain, Portugal; last survivor wins), Conquistador (new map each game, all five Europeans plus Natives), Scenario Templates (text files defining players, ship arrival, map build), Mapped Scenarios (pre-placed colonies and units, with an editor) | MANUAL | p.54-55 |
| Tutorial deadlines: 3 landmarks by turn 10, found a colony by turn 20, Colony Center L2 by turn 30, eliminate the French by turn 40 | MANUAL | pp.10-11, 16-17 |

### 1.2 Map, terrain and generation

| Fact | Status | Page |
|---|---|---|
| Terrain types named: ocean, lake, river, grassland, forest, jungle, hills, mountains (plus "mountain ranges", "regions") | MANUAL (no master list) | pp.8-11 |
| A new world is generated at the start of every game; each is unique; not a simulation of real history | MANUAL | p.1 |
| Land units cannot enter ocean or lake squares but may cross rivers; Ships travel only on ocean squares (not up rivers, not on lakes) | MANUAL | pp.8-9, 32-33 |
| Nothing can be built on hills or mountains; Colony Center needs flat land; buildings need flat land (Docks need water) | MANUAL | pp.10-11, 24-25, 30-31 |
| "Flat" terrain list (which of grass, forest, jungle count) | SILENT | n/a |
| "Flat areas on mountains" exist and are rich for Gold and Metal (so flatness is not simply a terrain-type property) | MANUAL | pp.10-11 |
| Best terrain per building: Farm grass near water; Mill jungle or forest near river; Metal Mine and Gold Mine near mountains; Dock water; Colony Center flat land. Terrain is listed only if it enhances or is required; otherwise terrain has no effect | MANUAL | pp.30-32 |
| River proximity further enhances Mines and Mills | MANUAL | pp.10-11 |
| Productivity modifier shown in the Status Bar while placing a building; different per building and per square; range floor -100% (European Gold Mine becomes useless); Natives' Gold Mine floor -90%; a Level-1 Metal Mine always yields at least 1 Metal | MANUAL | pp.12-13, 24-27, 56-57 |
| Specialisation: the colony's most common building type gets a productivity bonus that grows with its count | MANUAL (size SILENT) | pp.26-27 |
| Special Discoveries can raise modifiers for certain buildings (footnote 3) | MANUAL | p.32 |
| Terrain movement costs, rivers as obstacles beyond "cannot cross lakes", hills/mountain slowdown | SILENT (text says units "avoid movement-slowing obstacles" over explored terrain, so costs exist) | p.35 |
| Colony site preview: press **Z** with cursor over land to highlight the squares the colony would own | MANUAL | pp.10-11 |
| Colony footprint grows "approximately one square around the perimeter" per Center level; Fort needs a 2x2 area | MANUAL | pp.12-13, 26 |
| Generation algorithm, rivers/lakes/mountain creation, land fraction defaults, coast guarantee | SILENT | n/a |

### 1.3 Exploration, fog of war and movement

| Fact | Status | Page |
|---|---|---|
| Unexplored areas are "in the dark"; VP are awarded for being first to explore previously dark areas; **no VP for exploring oceans** | MANUAL | p.22 |
| Enemy units outside "field of vision" can still trigger encounters; the Find button centres the view on them | MANUAL | p.40 |
| Fog rendering (black vs dimmed memory), vision radius per unit, whether explored terrain stays visible | SILENT | n/a |
| Explorers: fastest land unit, move farther and more easily over all terrain, "good at avoiding hostile natives", have an Explore button | MANUAL | pp.8-9, 38-39 |
| Settlers: slowest unit, no combat, carry what is needed to found a colony; no Explore button | MANUAL | pp.10-11, 32 |
| Leaders, Infantry, Cavalry, Artillery, Settlers move only by click-and-drag; far slower than Explorers; military and Settlers have no Explore | MANUAL | pp.9, 32 |
| Move a unit: select, drag to destination; it paths itself; stops when allotment runs out or terrain blocks | MANUAL | pp.8-9, 32 |
| Pathing: over explored terrain avoids movement-slowing obstacles; toward unexplored terrain it goes in a straight line | MANUAL | p.35 |
| Movement allotment shown as a red "Moves Remaining" bar that shrinks to nothing | MANUAL | pp.8-9, 34-35 |
| Persistent box: units that can Explore explore automatically every turn; for all units, lets them travel to a far destination over several turns | MANUAL | pp.8-9, 34-35 |
| Explore button (or **X** key) auto-explores; becomes **Halt**; clicking the unit also stops it | MANUAL | pp.8-9, 32 |
| Ships explore the coast the same way (drag or Explore) | MANUAL | p.9 |
| Changing destination: drag again, or CTRL+click the map while moving | MANUAL | pp.8-9, 34-35 |
| Speed-up: hold SHIFT while a unit moves (affects all units on the map) | MANUAL | pp.8-9, 34-35 |
| Next button cycles to the next unattached unit with moves left; greyed when none; F1 Next Colony, F2 Next Leader, F3 Next Ship, F4 Next Explorer; Next does not visit colonies | MANUAL | pp.6-9, 32 |
| Attached units (to Leader, colony, Ship) do not move on their own and are skipped by Next; they travel with the carrier | MANUAL | pp.9, 34-35 |
| Units board only a Ship that is next to the shore; Leaders carry only military units and Settlers; capacity limits exist (numbers SILENT) | MANUAL | pp.34-35 |
| Disembarking needs the Ship next to shore; Disembark All, or Cargo list plus Disembark, or drag out; SHIFT multi-selects | MANUAL | pp.2-3, 34-37 |
| Landmarks: rivers, mountains, mountain ranges, "great regions". Discovering one opens a naming window; first discoverer's name applies at the start of next turn; VP per major landmark; end-of-game bonus VP for the longest river, highest mountain, etc. (a later discoverer of a bigger one takes the bonus) | MANUAL | pp.9-11, 54-55 |
| Hint: follow rivers and mountain ranges to find landmarks quickly | MANUAL | p.11 |
| Special discoveries (new in Deluxe): see table 2.4 | MANUAL | pp.56-59 |
| Ship movement values, damage slowing, Cartography (+land move) and Navigator (+ship move) abilities exist | MANUAL (numbers SILENT) | pp.24-25, 46-47 |
| Ships: gunnery duel, boarding, flee; wind gauge favours smaller undamaged Ships; damaged Ships move slower and heal 1 point per turn next to a Dock; resolved after turns end; Infantry fight full strength aboard, Cavalry half, Artillery none | MANUAL | pp.46-47 |

### 1.4 Native tribes (NPC settlements) and the High Natives player

| Fact | Status | Page |
|---|---|---|
| Two distinct things: **native Indian tribes/settlements** (NPCs, 0-50 per game) and **Natives** as a playable nation (High Natives) | MANUAL | pp.20-21, 56-57 |
| Tribes are friendly or hostile. Friendly: trade with your colonies, do not attack wandering units. Hostile: attack units that come too close to their settlements | MANUAL | p.20 |
| Higher difficulty makes tribes more likely to be hostile | MANUAL | pp.20-21 |
| Hostile encounter: pop-up offers Attack or Avoid. Explorers, Settlers and lone Leaders cannot fight and are eliminated if they cannot avoid. Repeatedly approaching eventually greys out Avoid, forcing the attack. A Leader with attached units may choose Attack. A Find button appears if the unit is off screen | MANUAL (retry count SILENT) | p.40 |
| You can deliberately provoke by moving close or targeting a tribe. Cancel Attack before ending the turn via double-click on the unit | MANUAL | p.40 |
| Tribe strength sets the number and quality of units it brings; bigger tribes intercept at a greater distance from home | MANUAL (formula SILENT) | p.40 |
| Friendly tribes near a Colony Center may join its defence (shown with yellow numbers) | MANUAL | pp.40-45 |
| Trade with natives (Trade window, "Trade with Natives"): everything except Goods; one trade per turn; occurs immediately; cannot be edited afterwards; only available if tribes are "close by" | MANUAL (distance SILENT) | pp.14-15 |
| Europeans must have tribes much closer to trade than Native players do | MANUAL | pp.21-22 |
| France starts with +30 on a 201-point native relations scale. Missionary ability improves native relations over time | MANUAL | pp.24-25, 56 |
| Natives scenario: sole player, "federate" 15 native tribes | MANUAL (mechanics SILENT) | p.54 |
| Natives may not capture European colonies and Europeans may not capture Native colonies | MANUAL | p.40 |
| Explorers "good at avoiding hostile natives" | MANUAL | p.38 |
| Combat victory points are earned from fighting hostile natives and players | MANUAL | p.22 |
| High Natives player: starts on left edge; Colony Center max level 2 (Europeans 4); no taxation; cannot trade with Europe (Mother Country); cheaper Settlers, Infantry, Cavalry; Explorers move farther; cannot build Artillery; larger cities; costs of buildings and upgrades "vary somewhat" (no numbers) | MANUAL | pp.21-22, 26-27 |
| High Natives bonuses: all land units move as if one level higher; Gold Mine modifier never below -90%; Gold Mines produce more Gold per level; Cavalry offence and defence bonus = 1 + the War College rating | MANUAL (Gold amount SILENT) | pp.56-57 |
| Pyramid discovery doubles Native bonuses and adds +2 Charisma to Native Leaders | MANUAL | pp.58-59 |

### 1.5 Nations

| Nation | Bonus (all MANUAL, pp.56-57) |
|---|---|
| Britain | Free Admiral special ability (stacks to a double bonus if also chosen); Artillery gets offence and defence bonus = 1 + the War College Artillery ratings |
| France | +30 starting native relations (201-point scale); Cavalry bonus = 1 + War College Cavalry ratings |
| Spain | Explorers act one level higher (move farther); Infantry bonus = 1 + War College Infantry ratings |
| Portugal | Units move as if the movement setting were one step easier (Normal acts as Easy = +50%); no military bonus |
| Holland | 5% interest per turn on Gold stockpiles in all colonies; Mother Country trades take one fewer turn (minimum one); no military bonus |
| High Natives | See 1.4 |

Pre-Deluxe: all European nations were equivalent (p.56). Flag colours are the only other distinction named (p.21).

### 1.6 Diplomacy, taxes, independence, trade

| Fact | Status | Page |
|---|---|---|
| Diplomacy button opens the Diplomacy window: send emissaries to other players, pay taxes, change relationships with other players and the Mother Country | MANUAL | p.6-7 |
| Taxes are set to "automated" and paid from colonies' Gold and commodities. Rate, schedule and consequences of non-payment | SILENT | p.7 |
| Natives pay no tax | MANUAL | p.22 |
| You can only trade with another player after encountering them (discovering one of their colonies) | MANUAL | pp.14-15 |
| Trade window options: buy from / sell to Mother Country; Trade with Natives; Transfer to Colony; give or demand tribute; barter with players; Trade Alliance. After independence the "Mother Country" option is named "Europe" | MANUAL | pp.14-15 |
| Tribute: demand or give via Trade window. Amounts, refusal, and consequences | SILENT | pp.14-15, 28-29 |
| Trade Alliance: proposed on a colony-to-colony basis; other player must agree; either may cancel any time; requires diplomatic status **better than "Understanding"**. Starts with 1 unit of each traded commodity; grows 10% per turn (rounded up) to a cap set by the size and trading capacity of both colonies | MANUAL | p.58-59 |
| Diplomatic status ladder (names and thresholds beyond "Understanding") | SILENT | n/a |
| Independence, Commonwealth (and Federation for Natives): status-changing events that give victory points; "when to declare independence or federate" is a strategic choice. Conditions and effects | SILENT | p.54-55 |
| Early Diplomacy option can anger the Mother Country | MANUAL (effect SILENT) | p.21 |
| Mother Country trades need a Dock on ocean (or a river connected to the ocean) and take several turns; several trades per turn allowed. Colony-to-colony trades take 1+ turns depending on distance and known routes; overland is much slower | MANUAL | pp.14-15 |
| Communique: press **C** while viewing the map to send a message to any player, delivered next turn | MANUAL | p.60 |
| Diplomacy gives victory points for making or breaking alliances (via Diplomacy bonus category) | MANUAL | p.22 |

### 1.7 Scoring and victory

| Fact | Status | Page |
|---|---|---|
| Three ways to win: first to the Winning Score; highest score when Max Turns ends; last player standing | MANUAL | pp.52-53 |
| Game may be set to run indefinitely (0 Max Turns, 0 Winning Score); then it ends for a player only by elimination | MANUAL | p.1 |
| Score = victory points (VP) for: exploring new areas and discovering landmarks (record bonuses), founding and developing colonies, winning battles (points for any damage done to enemy units), establishing diplomatic relations/alliances, changing diplomatic status, plus time bonus/penalty | MANUAL | pp.22, 54-55 |
| Per-event VP values | SILENT (example only: "100 points for discovering something") | p.22 |
| 40 bonus points distributed among Colony, Exploration, Combat, Diplomacy; each point = +1% on that category | MANUAL | p.22 |
| Special Abilities cost 10 bonus points each (so at most 4): Miser (VP for Gold held, measured), Colonist (VP for colonists, measured), Discoverer (cumulative bonus on landmarks), Pacifist (VP for development, penalty for initiating attacks, 50% off defensive research), Cartography (+land move), Navigator (+ship move), Conqueror (+1 military unit per Fort level), Craftsman (higher sell prices to Mother Country, players, natives), Admiral (better ship combat), Missionary (better native relations) | MANUAL | pp.22-24 |
| Cumulative bonuses are added each turn and cannot be lost; measured bonuses are recomputed from current state and fixed at game end | MANUAL | p.22 |
| Convert Surplus button (Commodity Detail window) turns surplus production into VP; benefit scales with the Colony bonus | MANUAL | pp.22, 28 |
| Play Time Bonus: off / normal / extreme; each turn starts with a preset number of seconds; a number on the Status Bar counts down (black = bonus VP if you end the turn now, red = VP deducted). The Colonial Gazette and Save & Exit stop the clock | MANUAL (seconds and VP rates SILENT) | pp.4-7, 20-21 |
| Game Scores (Menu) shows your VP breakdown; Current Standings shows all players; opponents' victory conditions are hidden | MANUAL | pp.7, 54-55 |
| End-of-game bonuses for the longest river, highest mountain, etc. go to whoever holds the discovery at the end | MANUAL | p.11 |
| Definition of "eliminated" (colonies, Settlers, units) | SILENT | n/a |

### 1.8 UI, screens, controls and save/load

| Fact | Status | Page |
|---|---|---|
| Flow: Game Menu screen (New Game, Continue saved game, Combat Demo, Options, Quit; multiplayer entries: Create New Game, Join New Game, Continue Existing Multiplayer Game, Delete; scenario create/edit buttons) -> Scenario screen (Tutorial, Custom, others) -> Custom Game Setup -> Player Setup -> Begin Game | MANUAL | pp.1, 18-25, 48-49 |
| Options: sound effects on/off, animations on/off, maximum zoom-in level (turning off final zoom helps on 8 MB machines), textures on/off, Colonial Gazette on/off, Network setup, Edit player | MANUAL | pp.1, 6 |
| Game screen: Status Bar across the top (feedback on limits and requirements; building/upgrade shortfalls; productivity modifiers), top buttons (Mission, Next, End Turn, +, -, Menu at top right), timer number at the right of the Status Bar | MANUAL | pp.2-9 |
| Main Menu window (Menu button): End Turn, Save & Exit, Save As, Exit, Unit List, Diplomacy, Messages, Game Scores, Auto Map, Options. (Exact button order and layout shown only in Figure 1) | MANUAL (layout SILENT) | pp.2-7, 54-59 |
| Mission button re-displays current objectives | MANUAL | p.2 |
| Windows: close with the top-left Close box or ESC; some have no Close box (choose an option); Gazette closes by clicking it; windows drag by any non-button area | MANUAL | p.2 |
| Right-click any unit, button or item for help | MANUAL | p.3 |
| Zoom: +/- buttons or +/- keys; SHIFT+click for closest/farthest; zooming too far out hides some items | MANUAL | pp.6-7 |
| Auto Map: small zoomed-out world map at bottom-left; colonies and native settlements appear as clumps of red dots; white box = current view (resizes with zoom); click to centre there, drag to scroll both map and view | MANUAL | pp.6-7 |
| Unit List: all units and colonies with attached units indented below carriers; four category check boxes (Ships, colonies, military, civilians); Find centres the view; Detach by button or by dragging to the map; SHIFT multi-select; drag within the list to attach/reorganise (same location only) | MANUAL | pp.4-5, 36-37 |
| Unit window: opens by double-click; Persistent, Explore/Halt, Attack/Cancel Attack, Cargo, Disembark, Disembark All, Units Attached, Detach, Detach All | MANUAL | multiple |
| Colony Center window (double-click): commodity stock and next-turn expectation, Upgrade, Build Building, Population Detail, Colony Contents, Commodity Detail (Producing / Using / Net Trade / Total, Convert Surplus), Trade, Undo Found, Auto Colony (click twice for persistent), Building List (sorted by type and level, X = demolishing, triangle = upgrading, click highlights it in the colony), Commission Leader | MANUAL (pixel layout SILENT) | pp.12-15, 26-29, 58 |
| Building window (double-click a building): Demolish, Upgrade, Halt Construction, recruit boxes (Infantry/Cavalry/Artillery in Fort; Recruit Settlers in Housing; Explorers in Tavern; Ships via Dock Construct Ship) | MANUAL | pp.12-13, 26-27, 36-37 |
| Placement: Build Building then a building cursor over highlighted legal squares; cursor blinks when illegal; Status Bar says why | MANUAL | pp.12-13, 24-27 |
| Keyboard: **E** end turn; **Z** colony preview; **X** explore; **C** communique; **F1** Next Colony, **F2** Next Leader, **F3** Next Ship, **F4** Next Explorer; **+ / -** zoom; **ESC** close window; **CTRL** (+click) redirect/fast explore; **SHIFT** speed-up, multi-select, zoom extremes; **ALT** (+click empty part of a combat square) selects the whole square; **SHIFT+ESC** emergency exit in multiplayer (no save). Arrow keys scroll only in the Mapped Scenario editor. **No "N" key is documented** | MANUAL | pp.2, 6-9, 32, 42, 56, 60, 64 |
| Mouse: left-click selects; drag moves/attaches/detaches; double-click opens windows; right-click help; CTRL+click or SHIFT modifiers as above | MANUAL | multiple |
| Messages button lists significant events of the previous turn; a Messages window opens automatically when something significant happened; closes by clicking its centre | MANUAL | p.7 |
| Turn end: End Turn (button in Main Menu or top bar, or E). When all players have ended, results are computed; solitaire/network combat is then played on the tactical grid; e-mail games auto-resolve. After that: Annals of History (skippable), then Colonial Gazette (events and scores; the only safe pause point). No undo after End Turn | MANUAL | pp.2-5 |
| Save & Exit: saves and returns to Game Menu; you resume on the same turn (turn not completed); Save As (solitaire only) copies under a new name and continues; Exit discards the current turn's moves; neither Save As nor Exit exist in multiplayer. Saves can be continued from the Game Menu | MANUAL | pp.4-5, 58-59 |
| Combat flow and the 3x4 grid | Out of scope here (see combat part); noted only for the Combat Demo | pp.16-19, 40-47 |
| Multiplayer: network (IPX, serial, modem), same-machine hot seat up to six, turn buttons per player on a Multiplayer Game window (grey = computer or taken), players sign on to fight their battles; synchronization code makes all machines compute identical results | MANUAL | pp.48-53, 60-64 |
| Play by E-mail: .PBM file passed player to player; combat auto-resolved (including against natives and AI); two-player games take two turns in a row; larger games rotate who goes twice | MANUAL | pp.60-65 |
| Combat Demo: choose location (forest, river, grass; cosmetic only), 5 to 40 points per side to buy units (Infantry 1, Cavalry 2, Artillery 2, Leader attack point 3; all Level 4; Natives cannot buy Artillery and get more points) | MANUAL | pp.44-47 |

### 1.9 Special discoveries (map content)

| Item | Effect | Status |
|---|---|---|
| Metal deposits (Gold, Silver; Tin, Iron; Copper) | Gold/Silver raise Gold Mines; Tin/Iron raise Metal Mines; Copper raises both | MANUAL pp.58-59 |
| Special forests (Redwood, Oak, Cherry, Teak, Maple) | Raise Mills | MANUAL |
| Agriculture (Rice, Wheat, Corn, Potatoes, Alfalfa) | Raise Farm Crops | MANUAL |
| Medicinal Herbs | Raise nearby Churches' immigration | MANUAL |
| Fountain of Youth (rare, unique) | Higher population growth in all of the controller's colonies | MANUAL |
| Pyramid (rare) | All of the controller's Leaders: +4 Leadership, +2 Combat, +1 Movement; doubled and +2 Charisma for Natives | MANUAL |
| Lost Dutchman Mine (rare) | +25% Gold from all of the controller's Gold Mines | MANUAL |
| Ancient Ruin (rare) | "May give you one of several special bonuses" | MANUAL (list SILENT) |
| Rules | Each has a magnitude and a radius; bonus falls with distance to zero at the radius. Click to see the radius; double-click for the list. Finder controls it; another player takes control by standing a unit **adjacent** for as long as it stays. Buildings in range show the bonus in brackets | MANUAL pp.58-59 |
| Frequency, placement, magnitudes, radii | | SILENT |

---

## 2. Tables for the data files

### 2.1 Nations (data-only; theme-swappable)

| id | Start edge | Effects | Page |
|---|---|---|---|
| nation_a (Britain) | right | `admiral`; `war_college_bonus{artillery,+1}` | pp.56-57 |
| nation_b (France) | right | `native_relations_start +30 of 201`; `war_college_bonus{cavalry,+1}` | pp.56-57 |
| nation_c (Spain) | right | `explorer_effective_level +1`; `war_college_bonus{infantry,+1}` | p.57 |
| nation_d (Portugal) | right | `movement_setting_step +1` | p.57 |
| nation_e (Holland) | right | `gold_interest 0.05`; `mother_trade_turn_delta -1 (min 1)` | p.57 |
| natives (High Natives) | left | `land_move_effective_level +1`; `war_college_bonus{cavalry,+1}`; `gold_mine_modifier_floor -0.9`; `gold_mine_output_bonus (value SILENT)`; `max_colony_level 2`; `no_tax`; `no_mother_trade`; `forbid_unit artillery`; `cheaper settler/infantry/cavalry (value SILENT)`; `explorer_range_bonus (value SILENT)`; `native_trade_distance_bonus` | pp.21-22, 26, 56-57 |

### 2.2 Setup parameters

| Parameter | Range / options | Default (MANUAL?) | Page |
|---|---|---|---|
| Computer players | 0-5 | SILENT | p.19 |
| Max Turns | 0 (unlimited) - 300 | SILENT | p.19 |
| Winning Score | 0 (unlimited) - 200,000 | SILENT | pp.19-20 |
| Indian Settlements | 0-50 | SILENT | p.20 |
| World size | 80-256 | 256 | pp.20-21, 56 |
| Land seeds, Water seeds | counts, ranges SILENT | SILENT | p.20 |
| Resources | scarce / normal / abundant | SILENT | p.20 |
| Play Time Bonus | off / normal / extreme | SILENT | p.20 |
| Movement | easy / normal / difficult | SILENT | p.20 |
| Difficulty | very easy / easy / normal / hard / very hard | SILENT | p.20 |
| Early Diplomacy | on / off | SILENT | p.21 |
| VP bonus points | 40 total over 4 categories; 10 per special ability | 40 | pp.21-24 |

### 2.3 Victory point sources (qualitative only; values SILENT)

| Category | Earned by | Page |
|---|---|---|
| Exploration | first to explore dark land (not ocean); first to discover landmarks; record landmarks at game end | pp.9-11, 22 |
| Colony | founding, developing, upgrading; Convert Surplus | pp.22, 28 |
| Combat | damage dealt to enemy units, hostile natives and players | p.22 |
| Diplomacy | making or breaking alliances; independence / commonwealth / federation | pp.22, 54 |
| Time | seconds left (+) or overrun (-) when ending turn | pp.6-7 |

---

## 3. Disagreements with `docs/design.md`

| # | design.md says | Manual says | Verdict |
|---|---|---|---|
| D1 | Locked decision 6 and section 3: win = last player standing; no victory points, no turn limit | Three win paths: Winning Score (0-200,000), Max Turns (0-300) with highest score, or last standing; a full VP economy with 40 bonus points and 10 special abilities (pp.19-24, 52-55) | Manual is much broader. Keep design's MVP cut as an explicit, labelled reduction; the GDD should list VP as a full feature. |
| D2 | A-01: default 64 x 64, min 40, max 256 | World Size 80-256, normal 256 (pp.20-21, 56) | Design's minimum and default are outside the manual's range. Reasoned deviation for a 2-player MVP, but record it. |
| D3 | 8.3: **N** key = next unit, cited as p.2-3 | Only the Next **button**; documented keys are E, X, Z, C, F1-F4, +/-, ESC (pp.2, 6-9, 32). No N key | N is invented, not from the manual. Mark ASSUMED. |
| D4 | 6.8/7.4: difficulty = AI production multiplier only; "the AI does not see through fog" | Difficulty changes terrain productivity modifiers in computer colonies **and** makes natives more hostile (pp.20-21) | Design omits the native-hostility effect; its production multiplier is a substitution for the terrain-modifier change. |
| D5 | A-29: tax 0% for everyone (Europeans too) | Europeans pay taxes automatically from Gold and commodities; Natives pay none (pp.6-7, 22) | Design removes a European mechanic; rate itself is SILENT. |
| D6 | 8.3: NewGame has "seed" and "world size" | Setup has no RNG seed; it has Land Seeds and Water Seeds (counts) (p.20) | A single RNG seed is our addition; Land/Water Seeds are generator parameters and are missing from the design. |
| D7 | Section 11 defers natives tribes, special discoveries, diplomacy, independence, tribute; non-goals | All are in the shipped game (pp.14-15, 20, 40, 54-59). Setup includes Indian Settlements 0-50 and Early Diplomacy | Fine as MVP cut; GDD must still specify them. |
| D8 | Section 2: "Native players ... Colony Center max level 2" flagged as odd | Manual says both: Natives "can build larger cities" (p.22) and Center max "two for Native players" (p.26) | Not a design error; the manual is internally ambiguous. Keep as open question Q4. |
| D9 | 6.2 / 7.5: Europeans-only start-edge language matches; but Europeans each start with Ship, 2 Explorers, Settler, Leader, 2 Infantry (A-40) | Only "a few units on a Ship" (p.21); Tutorial gives units aboard | Consistent (assumed); not a conflict. |
| D10 | 6.4: "Immigration = Church bonuses + natural growth" | Church gives "+N people / turn" (p.31); natural growth never mentioned | Natural growth is design-only. Outside this part's scope, noted. |
| D11 | 8.1 pan: drag-pan, edge scroll optional | Manual scrolling: click or drag in the Auto Map only; arrow keys documented only in the scenario editor (pp.6-7, 56) | Design adds map-view panning not in manual. Fine for the clone, label ASSUMED. |
| D12 | Table 7.3 France "scale: 201" with value 30 | Same (p.56) | Agrees. |
| D13 | Design omits Special Abilities, Trade Alliances, Convert Surplus, Auto Colony, Communique, Play Time Bonus, scenarios | All in manual | Gaps in design; this document covers them. |
| D14 | Design says Tavern/Housing share costs "by coincidence" | Table agrees (p.30-31) | Agrees. |

Everything else in section 6.2 and 7.3 of design.md that concerns this part (nation bonuses, Undo Found timing, land/ocean passability, Docks on rivers and lakes, Z preview, Explorers fastest, Settlers slowest, F1-F4, X explore, E end turn, year 1493) was verified against the manual and matches.

---

## 4. Gaps where the manual is silent (proposed tunable defaults, all ASSUMED)

All values live in data files (`tunables`), not code.

| Gap | Proposed default (ASSUMED) |
|---|---|
| Terrain list and flatness | ocean, lake, river, grass, forest, jungle, hills, mountains. Flat = grass, forest, jungle, plus a per-tile `flat` flag so a mountain tile can contain flat patches ("flat areas on mountains") at 10% of mountain tiles |
| Terrain move cost | grass 1, forest 2, jungle 3, hills 3, mountains 4, river crossing free, ocean ships 1 |
| Map generator | Seeded: place `land_seeds` and `water_seeds` points, grow by weighted flood fill until the target land fraction; then ridge lines for mountains/hills, rivers flow from high ground to ocean or lake, lakes in basins. Default `land_seeds = 8` and `water_seeds = 8` per 100x100 area; land fraction about 45% |
| World size default | 128 x 128 (min 80, max 256) for performance in Python; 256 allowed |
| Land bias | Smaller worlds push land to the right-most quadrant (manual p.56): `land_bias_right = 0.35` at 80, 0 at 256 |
| Coast guarantee | Every land mass of 12+ tiles has an ocean-connected coast; each start edge has ocean within 6 tiles |
| Fog and vision | Black = never seen, dim = seen before (terrain only, no units), clear = in vision now. Radius: Explorer 3, Ship 3, Leader 2, military 2, Settler 2, colony 3 + level |
| Landmarks | Named features: each river, each connected mountain range, each lake, and 6-10 regions per world. "Longest river" and "highest mountain" tracked by tile count and elevation |
| Special discoveries | About 1 per 500 land tiles; common kinds weighted 12:1 over rare ones; each rare kind at most once per world. Magnitude +10% to +50%, radius 2 to 6, linear falloff |
| Discovery control | Controller = finder; changes to any other player that keeps a unit adjacent at the end of a turn |
| Native tribe strength | Tribe size 1-5; units on battlefield = size x 2 at Level 2-3; interception radius = 2 + size tiles |
| Native relation scale | -100 to +100 (201 points); France start +30; baseline by difficulty: very easy +40, easy +20, normal 0, hard -20, very hard -40; hostile when below 0 |
| Native encounter | Triggers within 2 tiles of a hostile settlement; Avoid allowed 3 times per unit per turn then forced |
| Native trade | Max distance 2 tiles for Europeans, 5 for Natives; one trade per turn; price = Mother Country sell price x 1.0; Craftsman +20% |
| Native relations change | +2 per trade, -10 per attack on them, +1 per turn per Missionary |
| Diplomatic status ladder | War, Hostile, Wary, Neutral, Understanding, Friendly, Allied. Trade Alliance requires better than Understanding |
| Tribute | A demand succeeds if demander strength >= target strength x 0.8; amount 10% of target Gold; refusal drops status one step |
| Taxes | Before independence: Europeans pay 10% of each colony's Gold and 5% of other output per turn automatically; Natives 0%; independence ends it |
| Independence conditions | Need 3 colonies of level 2+ and 200 Gold in total; Mother Country then becomes hostile. Commonwealth and Federation are post-MVP |
| VP values | Explore 1 per new land tile, landmark 100, record landmark 300 (at game end), found colony 50, each Center level 25, each building level 2, 1 per strength point of damage dealt, alliance 25, breaking one -25, independence 200 |
| Time bonus | Default off; if on: normal 120 s per turn, +1 VP per 10 s remaining, -1 VP per 10 s over; extreme: 60 s, 2 VP per 10 s |
| Max Turns / Winning Score default | 0 (unlimited) / 0 for MVP; scenario presets 200 turns / 5,000 VP |
| Eliminated | A player with no colonies and no Settlers (Ships and Explorers alone cannot rebuild) |
| Hotkeys not in manual | N or Tab = Next unit; arrow keys pan the map; Space = End Turn confirmation; Ctrl+S save; Ctrl+O load |
| Save/load | JSON, versioned, one autosave per end of turn and named manual saves; "Exit" discards; Save As allowed in solitaire; hot-seat only multiplayer |
| Multiplayer | MVP: hot-seat up to 6 humans; deterministic order list per turn so network or PBEM can be added later |
| Colony window layout | Left: commodity strip with current / net per turn; centre: isometric colony grid with highlighted buildable tiles; right: button column (Upgrade, Build, Population, Contents, Commodities, Trade, Auto Colony, Building List, Leader, Undo Found); Status Bar at the top. Positions are original |
| Main Menu window | The ten functions listed in 1.8, vertical list |
| Landing Settler timing | Ignore the "first settler on turn 6" sentence; start with the Settler aboard the starting Ship |

---

## 5. Open questions

| # | Question |
|---|---|
| Q1 | The manual's contents list has no Diplomacy chapter even though p.7 points to one. Is the user supplying a fuller manual, or should diplomacy (statuses, emissaries, tribute, independence) be designed from scratch with the defaults above? |
| Q2 | Should the clone reinstate victory points, Max Turns and Winning Score (the manual's main victory model) or keep the locked "last standing only" cut? This changes the Player Setup screen, the 40-point allocation and the special abilities (which mostly depend on VP). |
| Q3 | What is the default world size and are Land/Water Seeds exposed as user options or derived from a single "land amount" slider? (Manual exposes both counts; ranges unknown.) |
| Q4 | Native Colony Center cap of level 2 conflicts with "larger cities": which is wanted (cap, or larger housing per level)? |
| Q5 | Does "Pacifist", "Conqueror" and the other abilities belong in the MVP, or only the nation bonuses (locked decision 5)? |
| Q6 | Do native tribes ship in the MVP (they drive trade without a Mother Country for Natives, who have no source of Goods)? Without them the High Natives cannot get Goods (see design risk table). |
| Q7 | Should the Auto Map, Unit List and Next/F1-F4 cycling be built in the first map phase, or after the colony phase? |
| Q8 | Is the "first settler appears turn 6" sentence (p.25) a scenario-template feature (ships arrive on a set turn)? If so, should the Scenario Template mechanism be part of the data format from the start? |
| Q9 | Is the clone's theme going to rename the nations? The nation table above uses neutral ids; flag/colour distinctions and the "Mother Country" concept need a theme-neutral name. |
| Q10 | Hot-seat only for multiplayer, or should the order-list model be built now for later network play? |
