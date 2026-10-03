# GDD part 02: Units, Combat, Turn Flow

Source: *Conquest of the New World Deluxe* manual (37 PDF pages, two printed pages per PDF page; "p.NN" is the **printed** page number). Method: text extracted with macOS PDFKit; the unit cost table (p.38-39) was also checked against a rendered page image. Tags: **MANUAL (p.NN)** stated by the manual; **INFERRED** follows from manual text but is not stated; **SILENT** the manual gives nothing. Everything SILENT gets an **ASSUMED** tunable in "Gaps". Theme-agnostic names are used in brackets where useful (Settler = founder, Explorer = scout, Leader = commander, Ship = vessel).

---

## 1. Findings

### 1.1 Units
- Seven unit types: Explorer, Settler, Leader, Infantry, Cavalry, Artillery, Ship (p.38-39). All come in Levels 1-4. MANUAL.
- Military units = Infantry, Cavalry, Artillery, Leaders. Only these may initiate attacks on land (p.40). MANUAL.
- Explorers, Settlers and **lone Leaders cannot fight**; if hostile natives catch them they are simply eliminated (p.40). MANUAL (stated for hostile natives only; extension to enemy players is INFERRED).
- Higher level = "faster or more capable" (p.26); a building's level also caps the level of unit it recruits. MANUAL. The numeric movement per level is SILENT.
- Explorers are the fastest and best at terrain (p.8, p.38 "good at avoiding hostile natives"); Settlers are the slowest (p.10). Other land units "move considerably less distance per turn than Explorers" (p.8). MANUAL.
- Ships travel only on ocean squares, not rivers or lakes. Land units cannot enter ocean or lake but may cross rivers (p.32). MANUAL.
- Units cannot board a ship that is not next to the shore, and cannot attach to a Leader or Ship at maximum capacity (p.36). Capacity exists, number SILENT. Leaders can hold only military units and Settlers (p.36). MANUAL.
- Attached units move with their carrier; units attached to a colony stay in it until detached (p.8, p.36). A Leader that disembarks takes attached units with them (p.36). MANUAL.
- Recruiting: pay the cost; the unit appears **next turn**. Explorers next to the Tavern, Settlers next to Housing, Leaders next to the Colony Center, Ships next to the Dock; military units stay housed in the Fort until detached (p.36-37). MANUAL. Recruit orders are toggles that can be cancelled before End Turn (p.24 for Settlers). MANUAL.
- Recruit limits: you may not recruit more of a type than the producing buildings support (p.37); Fort support is 4/7/9/10 military units at Fort L1-4 (p.30-31); Tavern/Housing/Colony-Center numeric support is SILENT. "Each colony can support a limited number of Leaders" (p.28), number SILENT.
- The "P" in a unit cost is People. It is paid from the recruiting colony's population: INFERRED from the cost column (p.39) and p.40 ("if militia fall, the colony's population decreases").

### 1.2 Ships and sea movement
- Ships carry units overseas (p.38). Embark and disembark only when adjacent to shore (p.4, p.36). MANUAL.
- A Ship can explore (Explore button / X) or be dragged to a destination (p.8). MANUAL.
- Built at a Dock of at least that level on a water square; only a Dock on ocean builds ships, river/lake Docks are trading posts (p.12-13). MANUAL.
- **Ship-to-ship combat** (p.46): resolved between turns, results in Messages next turn. Attacker picks **Sink** or **Board** (or cancels, p.46). Computer decides who gets the "wind gauge" (smaller ships likelier; damaged ships much less likely); the defender chooses to sink, board or flee. Successful flight ends it unscathed. Gunnery may damage or sink either ship. Damaged ships move slower and heal 1 point per turn near a Dock. Boarding is crew (Infantry, count depends on ship size) plus carried military: Infantry full strength, Cavalry half, Artillery abstain; may sink either ship or capture one. MANUAL. All odds SILENT.
- Admiral ability (and Britain) improves ship-to-ship skill; Navigator ability raises ship movement (p.24, p.56). MANUAL.

### 1.3 Tactical battle
- Battles are resolved **after all players end their turns and before the next turn begins** (p.42). Solitaire and network: played on the battle screen; play-by-email: the computer plays all battles, including against natives (p.2, p.60). MANUAL.
- Grid **3x4** (p.42). Attacker moves first; each side may move any or all units each turn, but the **Leader's level limits the number of attacks** (p.42-43). End a combat turn with Done. MANUAL.
- Units start in **reserves** (off board); the row next to a side's reserves is its **home row** (p.16, p.43). MANUAL. (That each side has one home row at opposite ends is INFERRED.)
- No diagonal moves or attacks (p.42). Units move only into empty squares or squares holding friendly units (p.42). Square capacity: **6 Infantry-equivalents; Cavalry and Artillery count 2** (p.42). MANUAL.
- A unit adjacent (orthogonal) to an enemy may only move to squares not adjacent to another enemy (p.43). MANUAL.
- Per-type action rules (p.16, p.38-39, p.43): Infantry move 1 **or** attack once. Cavalry move up to 2, **or** move up to 1 and then attack once; Cavalry may not move after attacking; moving then attacking gives a **charge bonus** unless the Cavalry panicked and retreated the previous turn. Artillery move 1 (restricted to the home row) **or** fire once at any square in its own column. Infantry and Artillery may attack only if they did not move that turn. MANUAL.
- Attack reach: Infantry/Cavalry hit orthogonally adjacent squares (front, behind, side). Artillery hit any square in its column; closer is stronger (p.43). MANUAL.
- A group attack: select all attacking units, then the target square (p.17, p.44). Bonuses (p.17, p.44): **flanking** (attack from more squares), **combined arms** (more unit types in the attack); both additive and cumulative; they raise hit **probability**, not the number of shots. Artillery fire is stronger at close range. Infantry/Cavalry attacking a square containing **only Artillery** cause extra damage. Artillery are weaker against Artillery (**counter-battery**). MANUAL (all magnitudes SILENT).
- Who gets hit in a mixed square: "units are most likely to attack like units" (Infantry-Infantry, Cavalry-Cavalry, Artillery-Artillery) (p.44). Tip in manual: put Infantry into a Cavalry square to absorb hits. MANUAL.
- Strength: every battlefield unit has a number 1-5 that is both its hit points and its attack strength; damage lowers it, 0 = dead; weakened units attack proportionally less (p.17, p.44). MANUAL. How a unit's level maps to starting strength is SILENT (INFERRED: strength = level).
- No healing during battle or travel; only in a colony ("attached to a Colony Center"), 1 strength per turn (p.17, p.44). MANUAL.
- **Morale**: a damaged unit may panic and retreat one square toward its reserves; more damage = likelier; own Leader's **Charisma** reduces it; enemy Leader's **Reputation** raises it; if the retreat path is blocked it takes one extra damage and stays (p.17, p.44). MANUAL.
- **Win a battle** by: entering the enemy flag square, eliminating all enemy units on the field, or forcing the enemy to retreat (p.42). MANUAL.
- **Retreat** button: army flees, enemy gets **one parting shot**; if the army was defending a colony, the colony is lost to the attacker (raid: colony destroyed) (p.45). MANUAL.
- **Undo** in battle: takes back moves, not attacks; cannot go back past the latest attack or to an earlier turn (p.45). MANUAL.
- Number colours: white = recruited units, red = militia and Fort Artillery that arise for colony defence, yellow = friendly native allies. Damage to red militia reduces colony population; damage to red Fort Artillery does not (p.44). MANUAL.
- **Leader** (p.28, p.43): sets attacks per combat turn; affects own morale (Charisma) and enemy morale (Reputation); wins grant experience points allocatable to any attribute except Reputation; Reputation reflects all past successes and failures. Higher-level Leaders initiate more attacks and command more units. MANUAL. A special discovery lists Leader attributes as Leadership, Combat, Movement and Charisma (p.58), so Leaders have those plus Reputation. MANUAL/INFERRED.
- **War College** (p.31 fn 6, p.56-57): one level, 20$/15M/5G/50W; "improve military"; the manual implies separate offense and defense ratings per unit type (Infantry, Cavalry, Artillery) bought with "increasingly larger quantities of Gold". Pacifist gets 50% off Defensive Tactics research. MANUAL. Rating cap and cost curve SILENT.

### 1.4 Attack targets and outcomes
- Attack a **unit**: only outcome is destroy it (p.40). Attack a **colony**: **Capture** or **Raid** (p.40). Native tribes: destroy/raid/capture "depending on the target" (p.40). A target must be reachable this turn; attack orders are queued and can be cancelled before End Turn (p.40). MANUAL.
- **Capture**: only if you win the battle; the colony takes "some damage" (amount SILENT) (p.40). Natives may not capture European colonies and vice versa (p.40). MANUAL.
- **Raid**: success does not require winning; the objective is to prolong the battle (p.41). From every round **after the 4th** one building level is destroyed; the attacker gains half the value of that building (or its latest upgrade cost for a Level-1 building). From the **3rd round** the attacker also takes 10% of the remaining stockpile each round, a smaller amount each later round. If the raid runs until the defenders are eliminated or retreat, the **colony is destroyed**; retreating defenders reappear near the old site next turn. Forts are harder to destroy than other buildings. MANUAL ("round" is not defined).
- **Colony defence** (p.41-42): militia (always Level 2 Infantry or Artillery) whose count depends on colony level; **extra Artillery per Fort**; all military units in the colony; the **best Leader** in the colony, equipped with the best units in the colony whether attached to a Leader or to the colony; friendly tribes nearby may help. Double-clicking a Fort shows the colony's defence strength (a Fort is required to see it). MANUAL; counts SILENT.
- Hostile natives (p.12, p.40): friendly tribes trade and do not attack wanderers; hostile tribes attack units too close to their settlements; an **Avoid** button lets units escape, but repeated approaches eventually grey it out and the attack is forced. Tribe strength sets the number and quality of native units and how far from home they intercept. Hostility rises with difficulty. MANUAL.
- Combat Demo (p.45-46) is a practice mode with the exact point-buy: Infantry 1 point, Cavalry 2, Artillery 2, Leader attack point 3; 5-40 points each; all units Level 4; Natives get more points and no Artillery; terrain choice only changes graphics. MANUAL. Useful as a balance hint (unit worth 1:2:2 matches square capacity 1:2:2).

### 1.5 Turn flow
- One turn = one year; start year **1493** (p.4). MANUAL.
- During your turn: move units at once; found colonies; queue build/upgrade/demolish/recruit/trade/attack orders (p.4, p.12, p.24-27). End with the **End Turn** button or **E** (p.2). There is no going back after End Turn; "Exit" from the Main Menu abandons the turn's moves (p.4, p.58). MANUAL.
- "Nothing officially occurs until all players' turns are ended"; then the computer determines results (p.2, p.4); combat per 1.3. Order of everything else is SILENT.
- Start of next turn: Annals of History (optional), Colonial Gazette (events and all scores), Messages window if anything significant happened (p.4-5). Persistent units act at the start of each turn (p.8). MANUAL.
- Deferred effects (MANUAL): new building becomes functional next turn (p.26); upgraded Center grows the colony next turn (p.12); demolition happens at the start of next turn with a small refund (p.12, p.26); recruits appear next turn (p.36). Undo Found only in the turn of founding (p.24); Halt Construction refunds a just-placed building (p.26-27).
- Trade timing (p.14, p.58): Mother Country trades take several turns and need an ocean-reaching Dock; several per turn allowed; internal transfers take one or more turns (overland slower); native trades are immediate and limited to one per turn.
- Holland: gold stockpiles earn 5%/turn and Mother Country trade is one turn shorter (minimum 1) (p.56). Britain: Admiral bonus; Artillery +1 plus War College ratings. France: Cavalry +1 plus ratings; +30 native relations on a 201 scale. Spain: Explorers one level higher; Infantry +1 plus ratings. Portugal: movement as if one setting easier (Normal becomes Easy = +50%). High Natives: land units move as one level higher; Cavalry bonus; Gold Mine floor -90%; more Gold per level (p.56-57). Natives overall: start on the west edge, no taxes, no Europe trade, cheaper Settlers/Infantry/Cavalry, farther-moving Explorers, no Artillery, Center max level 2 (p.20-21, p.26). MANUAL.
- Setup facts: movement setting Easy/Normal/Difficult (p.20); difficulty Very Easy/Easy/Normal/Hard/Very Hard changes terrain-based productivity availability in **computer players'** colonies and native hostility (p.20-21); computer opponents 0-5 (p.19); resources scarce/normal/abundant (p.20). MANUAL.
- In most scenarios the first Settler appears on **turn 6** (p.24); the Tutorial grants a second ship later (p.10); scenario templates define when ships arrive (p.54). MANUAL.

### 1.6 Win and lose
- Three ways to win (p.53): reach the **winning score** first; highest score when **max turns** elapse; or be the **last player standing**. Max turns 0 (unlimited) to 300; winning score 0 (unlimited) to 200,000 (p.19-20). MANUAL.
- Unlimited mode: the game "will only end for that player if he or she is eliminated" (p.1). MANUAL.
- Score sources (p.53-54, p.22): exploration and landmarks (record bonuses), founding/developing colonies, winning battles ("any damage done to enemy units"), diplomacy and status changes; per-player 40-point percentage allocation; special abilities cost 10 points each; time bonus/penalty. Point values SILENT. Locked project decision 6 drops all of this; kept here for completeness.
- **What counts as eliminated is SILENT.** The Tutorial's last mission says "prevent the French from establishing a new colony or eliminate their colony if one is already established" (p.16), suggesting colonies are what matter.

---

## 2. Tables

### 2.1 Unit costs (MANUAL p.38-39; verified on page image)
Abbrev: $ gold, M metal, W wood, G goods, C crops, P people.

| Unit | Role (MANUAL) | L1 | L2 | L3 | L4 | Recruited at |
|---|---|---|---|---|---|---|
| Explorer | fast; avoids hostile natives; cannot fight | 20$, 1P | 50$, 1P | 100$, 1P | 200$, 1P | Tavern, levels 1..n (p.30) |
| Settler | carries all needed to found a colony; no combat; slowest | 50$, 15W, 15C, 150P | 100$, 30W, 30C, 300P | 150$, 10M, 45W, 45C, 450P | 200$, 20M, 60W, 10G, 60C, 600P | Housing; table says "recruit L*n* Settler" (exact level) |
| Leader | commands military units; sets attacks per combat turn | 100$, 1P | 200$, 1P | 350$, 1P | 500$, 1P | Colony Center; "recruit L*n* Leader" (exact level) |
| Infantry | move 1 or attack once | 5$, 1M, 10P | 10$, 2M, 15P | 15$, 5M, 1G, 20P | 20$, 10M, 2G, 25P | Fort, levels 1..n |
| Cavalry | move 2, or move 1 + attack once | 10$, 2M, 10P | 20$, 5M, 15P | 30$, 10M, 2G, 20P | 40$, 16M, 5G, 25P | Fort, levels 1..n |
| Artillery | move 1 or fire once in own column | 10$, 5M, 5P | 20$, 10M, 10P | 30$, 20M, 2G, 15P | 40$, 32M, 5G, 20P | Fort, levels 1..n |
| Ship | carries units over ocean | 50$, 4M, 10W, 80P | 100$, 8M, 20W, 120P | 150$, 20M, 8G, 50W, 160P | 200$, 40M, 20G, 100W, 200P | Dock, "build L*n* Ship" |

### 2.2 Recruit and support limits (MANUAL p.30-31, p.37)

| Building level | Recruits | Supports |
|---|---|---|
| Housing 1/2/3/4 | L1/L2/L3/L4 Settler | not given |
| Tavern 1/2/3/4 | Explorer L1 / L1-2 / L1-3 / L1-4 | not given |
| Colony Center 1/2/3/4 | L1/L2/L3/L4 Leader | "limited" Leaders per colony |
| Fort 1/2/3/4 | military L1 / L1-2 / L1-3 / L1-4 | 4 / 7 / 9 / 10 military units |
| Dock 1/2/3/4 | L1/L2/L3/L4 Ship | not given |
| War College (single level) | improves military | n/a |
Conqueror ability: +1 supported unit per Fort level (p.24). MANUAL.

### 2.3 Battle action rules (MANUAL p.16, 38-39, 42-43)

| Unit | Moves per combat turn | Attack | Reach | Slots in a square |
|---|---|---|---|---|
| Infantry | 1 square | once, only if it did not move | adjacent orthogonal squares | 1 |
| Cavalry | up to 2, or up to 1 then attack; never move after attacking | once; charge bonus if it moved first and did not panic last turn | adjacent orthogonal squares | 2 |
| Artillery | 1 square, home row only | once, only if it did not move | any square in its column; stronger when closer | 2 |
| Leader | not stated | sets number of group attacks per combat turn | n/a | not stated |

Square capacity 6 slots; no mixed-owner squares; no diagonals.

### 2.4 Bonuses and modifiers (directions MANUAL, sizes SILENT)

| Effect | Direction | Page |
|---|---|---|
| Flanking (more attacking squares) | + hit probability | p.17, 44 |
| Combined arms (more unit types) | + hit probability | p.17, 44 |
| Flank and combined arms | additive | p.17, 44 |
| Cavalry charge (moved, no panic last turn) | + attack | p.16, 43 |
| Artillery range | stronger when closer | p.17, 43 |
| Lone Artillery square hit by Infantry/Cavalry | + damage | p.17, 44 |
| Artillery vs Artillery | - effectiveness (counter-battery) | p.44 |
| Like attacks like (target weighting) | Infantry>Infantry, Cavalry>Cavalry, Artillery>Artillery | p.44 |
| Own Leader Charisma | - panic chance | p.17, 44 |
| Enemy Leader Reputation | + panic chance | p.17, 44 |
| Damage taken | + panic chance | p.17, 44 |
| Blocked retreat | +1 damage, stay put | p.17, 44 |
| War College / nation bonus | + offense and defense per unit type | p.31, 56-57 |

### 2.5 Attack outcomes

| Target | Options | Result (MANUAL) |
|---|---|---|
| Unit (any player) | Destroy | Unit destroyed if you win |
| Colony | Capture | Needs a battle win; colony takes some damage; forbidden between Natives and Europeans |
| Colony | Raid | No win needed; building levels destroyed after round 4; 50% building value as spoils; 10% of stockpile per round from round 3 (diminishing); colony destroyed if defenders eliminated or retreat |
| Native tribe | destroy / raid / capture "depending on target" | details SILENT |
| Ship | Sink / Board / Cancel | resolved between turns; see 1.2 |

### 2.6 Turn sequence

| Phase | Content | Source |
|---|---|---|
| 1 Player turn | Move, found, queue build/upgrade/demolish/recruit/trade/attacks; E to end | MANUAL p.2 |
| 2 All players ended | Computer determines results | MANUAL p.2, 4 |
| 3 Combat | All queued attacks resolved before next turn | MANUAL p.42 |
| 4 Deferred actions | Buildings, upgrades, demolition, recruits take effect "next turn" | MANUAL p.12, 26, 36 |
| 5 Economy, trade arrival, healing, growth | order vs combat SILENT | SILENT |
| 6 Year +1; Annals, Gazette, Messages | start of next turn | MANUAL p.4-5 |

---

## 3. Disagreements with design.md

Manual wins. Items 1-6 need a design change; the rest are citations, omissions and clarifications.

| # | design.md says | Manual says | Action |
|---|---|---|---|
| 1 | Win = last player standing, no victory points, no turn limit (decision 6, 3, 6.7) | Three win routes: winning score, highest score at max turns, last standing (p.53) | Deliberate scope cut; record it as a variant switch, not a fact about the original |
| 2 | Raiding is post-MVP; A-47 razes a colony when capture is forbidden | Raid has explicit rules (p.41) and is the manual's own alternative to capture, always available (no win needed) | Replace A-47 by the manual's raid rules, or keep as a documented simplification |
| 3 | Start units include a Settler on turn 0 (A-40, 7.6) | First Settler arrives turn 6 in most scenarios (p.24); player starts "with a few units on a Ship" (p.20) | Make arrival turn a scenario field |
| 4 | Difficulty = AI production multiplier (7.4) | Difficulty changes terrain-based productivity availability in computer colonies and native hostility (p.20-21) | Keep the multiplier as an ASSUMED stand-in; label it |
| 5 | Leader = level, charisma, reputation; XP omitted (section 5) | Leader attributes also include Leadership, Combat, Movement (p.58 via Pyramid); XP is spent on any attribute except Reputation (p.43) | Add attributes to the data model even if XP is deferred |
| 6 | Heal "garrisoned units" in a colony (6.3) | Units must be "attached to a Colony Center" to heal (p.44) | Define: attached to colony, not merely standing in it (open question Q5) |
| 7 | 3x4 board "manual p.43" | The sentence is on p.42 | Citation fix |
| 8 | Support caps cited to "p.37, p.44" | Support rules p.37 and p.30-31 table; p.44 has nothing on support | Citation fix |
| 9 | "Explorers, Settlers and lone Leaders caught by hostiles are simply removed" (6.6) | Stated only for hostile natives (p.40); attacking any unit "only option is destroy" | Treat as extension to enemy-player units (INFERRED) |
| 10 | Colony defenders: militia, Fort Artillery, garrison, best Leader (6.6) | Also: best Leader gets the best units in the colony regardless of attachment; red vs white; Fort Artillery deaths do not cut population (p.41-44) | Add these rules |
| 11 | Combat resolved first, before shipments and economy (6.3 step 2) | Only "after all players end, before next turn" (p.42); relative order SILENT | Fine, but mark the order ASSUMED |
| 12 | Elimination = no colony and no Settler (6.7, A-44) | SILENT; Tutorial hints colonies matter (p.16) | Keep, mark ASSUMED |
| 13 | Ship-to-ship combat post-MVP, Ship has hp | Manual defines Sink/Board/flight, wind gauge, boarding strengths, repair 1/turn at Dock (p.46) | Add the structure to this GDD (done in 1.2); odds ASSUMED |
| 14 | Each unit-type attack "weight 3 for same type" model (A-30/32) | Matches "like attacks like"; no weights given | OK as ASSUMED |
| 15 | Combat demo / point-buy not mentioned | 1/2/2/3-point buy at Level 4, 5-40 points (p.45-46) | Optional skirmish mode; also a balance anchor |
| 16 | Taxes assumed 0% (A-29) | Taxes exist, automated, paid from colony Gold and commodities (p.5); natives exempt | Rate SILENT; keep 0 as ASSUMED |

Unit cost tables in design.md section 7.2 match the manual exactly (all 28 rows checked).

---

## 4. Gaps where the manual is silent (ASSUMED defaults, all tunable)

| ID | Gap | ASSUMED default |
|---|---|---|
| G1 | Movement points per unit/level | Table: Explorer 8/10/12/14, Cavalry 5/6/7/8, Leader 3/3/4/4, Infantry 3, Artillery 2/2/3/3, Settler 1/1/1/2, Ship 12/14/16/18; multiplier Easy 1.5, Normal 1, Difficult 0.667 (the 1.5 is MANUAL via Portugal) |
| G2 | Terrain movement costs | grass 1, forest 2, jungle 3, hills 3, mountain 4, river crossing 1; always allow one step |
| G3 | Ship, Leader, colony capacities | Ship slots 6/10/14/20; Leader commands 4 units per level; Leaders per colony = Center level |
| G4 | Tavern/Housing support numbers | 2 Explorers per Tavern level; Settler recruits limited by Housing level only |
| G5 | Battle start strength | strength = unit level (militia 2); cap 5 after bonuses |
| G6 | Attacks per Leader level; attacks with no Leader | 1/2/3/4; 1 without Leader (one "attack" = one group strike on one target square) |
| G7 | Hit probability and bonus sizes | base 0.30 Inf, 0.32 Cav, 0.28 Art; flank +0.05 per extra square; combined +0.05 per extra type; charge +0.10; lone-Artillery +0.15; counter-battery -0.10; range -0.05 per row; clamp 0.05-0.95 |
| G8 | Shots and damage | one shot per strength point, 1 damage each; like-type weight 3 |
| G9 | Panic | 0.05 + 0.6 x fraction lost - 0.02 x Charisma + 0.02 x enemy Reputation; max 0.9 |
| G10 | Flag position and orientation | 3 columns x 4 rows; flag in middle column of each end row |
| G11 | Entering from reserves | Reserves unlimited in size; entering the home row costs the unit's move; capacity rule applies |
| G12 | Round definition and cap | round = attacker turn + defender turn; cap 20, defender holds at cap |
| G13 | Artillery firing over intervening units | Allowed; range penalty by distance |
| G14 | Retreat parting shot | One free attack by the remaining side, no bonuses |
| G15 | Militia count and Fort Artillery | 2 x Center level Level-2 militia; 1 Level-2 Artillery per Fort level |
| G16 | Capture damage | One random building loses one level; half of each stockpile kept |
| G17 | Raid constants | Use manual rules; round = G12; spoils exact as p.41; diminishing factor 0.8 per round |
| G18 | Where retreated units land after a lost field fight | Adjacent land tile; retreated colony defenders appear at old site next turn (MANUAL) |
| G19 | Order of end-of-turn steps after combat | Combat, shipments, deferred buildings, economy, healing, year +1 |
| G20 | Starting units and ships | Level-2 Ship carrying 2 Explorers, 1 Leader, 2 Infantry; Settler on turn 6; field `settler_turn` |
| G21 | Elimination | No colony and no Settler (variant: also no units) |
| G22 | War College | cost 50 x 1.6^rating, cap 5, +0.02 hit/defence per rating, per unit type and per offense/defense |
| G23 | Ship-to-ship odds | Wind gauge chance 0.5 adjusted -0.1 per ship level and -0.2 if damaged; sink duel 3 shots each at 0.3; ship hp = 2 x level; repair 1/turn at Dock |
| G24 | Difficulty magnitudes | AI productivity x0.7/0.85/1/1.15/1.3 plus native hostility +/-; keep movement setting independent |
| G25 | Auto-resolve for AI-only battles | Same engine run by two AIs |
| G26 | Native tribes, special discoveries, diplomacy | Out of scope for this part; hooks only |

---

## 5. Open questions

1. Q1. Does a "group attack" or each participating unit count against the Leader's attack limit? Demo text (p.46) suggests per attack action; confirm by design.
2. Q2. Is the Leader's Level the same quantity as the Leader's attacks per turn, or is it a separate stat grown by experience points (p.43)?
3. Q3. Where exactly are the flags and the home rows in a 3x4 grid, and does the reserve count as a retreat destination?
4. Q4. Do mixed-owner squares ever exist (no) and can Artillery fire across enemy-occupied intermediate squares?
5. Q5. Does a unit merely standing in a colony heal, or only units attached to its Center?
6. Q6. What is a "round" for raid timing: a full both-sides turn?
7. Q7. Elimination: should a lone Settler or Ship keep a player alive?
8. Q8. Keep Leader/Settler "exact level" recruitment (as the table reads) or allow lower levels like Tavern and Fort do?
9. Q9. Do you want the victory-point layer restored as a selectable win condition, or stay with last-standing only (decision 6)?
10. Q10. Do Leaders count against Fort military support, and do Ship crews?
