# 05 - Independent design review of the draft design document

Reviewer role: senior game-design reviewer, independent of the draft's author.
Reviewed: `conquest-new-world-design-1dc70b/docs/design.md` (663 lines, draft dated 2026-10-03).
Source checked against: *Conquest of the New World Deluxe* manual, 37-page PDF. Every page was rendered to an image and its text extracted. Pages below are the manual's **printed** page numbers, the same convention the draft uses.
Date: 2026-10-03.

Severity scale: **CRITICAL** = blocks a correct or shippable build, or invalidates the deliverable. **HIGH** = a real bug, contradiction or balance hole that will cost rework if left. **MEDIUM** = ambiguity that two engineers would implement differently. **LOW** = citation or wording slip.

---

## 0. Verdict in one paragraph

The draft is unusually strong on **data fidelity**. All 22 table values I spot-checked match the manual exactly, and the assumption register is honest. Its weak points are elsewhere. (1) The **turn pipeline is architecturally impossible as written**: a pure `end_turn` cannot stop halfway for an interactive battle, and `core` would have to import `ai`. (2) **Simultaneous-turn rules are undefined**: who moves when, what a queued attack does if its target moved, and what the AI may see. (3) Several formulas use **inputs that do not exist yet**: terrain affinity, Leader Charisma and Reputation, the flag square in field battles. (4) The **economy has two manual-sanctioned runaway loops**: gold-to-trade conversion and Holland's compounding interest. (5) It is a technical design document, not a GDD: it has no core loop, no pacing targets, no UX flows, no tutorial, no accessibility section and no measurable acceptance criteria. It is also **not theme-agnostic**, which the GDD goal requires. None of this needs the locked decisions re-opened. All fixes fit inside them.

---

## 1. Spot-check of numeric claims against the manual

| # | Claim in draft | Manual | Result |
|---|---|---|---|
| 1 | Farm L1-L4 costs 4W / 4M+10W / 10M+4G+20W / 20M+10G+32W; 3/9/21/36 Crops | p.30 | Match |
| 2 | Housing L3 10$+5M+2G+10W, holds 600 | p.30 | Match |
| 3 | Church L4 100$+25M+12G+40W, +40 people/turn | p.30 | Match |
| 4 | Colony Center L2 5M+20W; L3 100$+10M+5G+40W; L4 250$+20M+10G+80W | p.30 | Match |
| 5 | Dock L3 5M+2G+10W; L4 25$+10M+5G+16W | p.30 | Match (the draft's correction of the brief is right) |
| 6 | Mill L3 10$+7M+3G+15W makes 7 Wood; L4 50$+15M+7G+25W makes 12 | p.31 | Match |
| 7 | Metal Mine L3 10$+10M+4G+20W makes 7 | p.31 | Match |
| 8 | Gold Mine L1 8W makes 20 Gold; L4 100$+40M+20G+64W makes 240 | p.31 | Match |
| 9 | Commerce L1 3M+2G+3W makes 1; L2 7M+5G+7W makes 3 | p.31 | Match |
| 10 | Fort L2 5M+25W supports 7; L4 90$+30M+15G+75W supports 10 | p.31 | Match |
| 11 | War College 20$+15M+5G+50W, single level | p.31 | Match |
| 12 | Tavern L2 2M+5W recruits L1-2 Explorer | p.31 | Match |
| 13 | Settler L3 150$+10M+45W+45C+450P; L4 adds 10G, 600P | p.39 | Match |
| 14 | Ship L3 150$+20M+8G+50W+160P; L4 200$+40M+20G+100W+200P | p.39 | Match |
| 15 | Leader 100/200/350/500 Gold + 1P | p.39 | Match |
| 16 | Cavalry L4 40$+16M+5G+25P; Artillery L3 30$+20M+2G+15P | p.39 | Match |
| 17 | Infantry L3 15$+5M+1G+20P | p.39 | Match |
| 18 | Square holds 6 Infantry; Cavalry and Artillery count 2 | p.43 | Match |
| 19 | Heal +1 strength per turn, only in a colony | p.44 | Match |
| 20 | Holland 5% interest per turn; Mother-Country trade one turn faster, minimum 1 | p.57 | Match |
| 21 | France +30 relations on a 201-point scale | p.56-57 | Match |
| 22 | High Natives Gold Mine floor -90% | p.57 | Match |
| 23 | Combat grid 3x4 "p.43" | **p.42** (left column, Figure 6) | Citation slip |
| 24 | Native Colony Center cap "p.26" | **p.27** ("The Colony Center's Options") | Citation slip |
| 25 | Commerce consumption "p.30 note 5" | Note 5 is printed on **p.32** | Citation slip |
| 26 | Start units include a Settler on turn 1 (A-40) | p.24: in most scenarios the first Settler **appears on turn 6** | **Divergence** (see H-9) |
| 27 | Raiding is post-MVP for lack of rules | p.41 gives concrete raid rules (see H-6) | **Factual mis-framing** |
| 28 | Housing `recruits: {"settler": n}`, Tavern `[1, n]` | p.30-31: Housing recruits exactly an Ln Settler, Taverns L1..Ln, Colony Center exactly an Ln Leader | **Schema ambiguity** (see M-3) |

Result: 22 of 22 table values match. 3 page citations are off by one or two pages. 3 rules are mis-stated or missing.

---

## 2. Findings by severity

### CRITICAL

**C-1. `end_turn` cannot be both pure and single-call while human battles happen inside it.**
Section 6.3, step 2, plays human-involved battles on the battle screen *inside* `end_turn(state) -> TurnResult`. A pure function cannot stop to wait for mouse input. Section 6.3, step 1 also has the AI planning inside `core/turn.py`, which makes `core` import `ai`. That breaks the dependency rule in section 4.1 (`ai` imports `core`, never the reverse). Auto-resolved battles run "by two AIs" (section 6.6), which drags `ai/tactics.py` into `core` as well.
*Fix:* Make the turn a **resumable pipeline**. `GameState.phase` becomes an enum: `orders | ai_planning | battles(queue, index) | economy | done`. `core.turn.advance(state) -> state` runs until it reaches a battle or the end of the turn. `core.battle.apply(battle, battle_order)` advances one battle. The **app controller** orchestrates: it calls `ai.planner.plan(view)` itself and feeds the resulting orders through `apply_order`, and for each battle it chooses the driver (human UI or `ai.tactics`). It passes battle orders back into `core`. `core` never imports `ai` or `app`. Add this layout to section 4 and a boundary test for it.

**C-2. The GDD is not theme-agnostic, and the stated goal requires that.**
Every rule is written in historical vocabulary: Mother Country, Natives/High Natives, Britain/France/Spain/Portugal/Holland, year 1493, Colonial Gazette. Representing indigenous peoples as a conquerable "High Natives" faction also carries content risk that a theme layer would remove.
*Fix:* Split the document into a **mechanics layer** (neutral terms) and a **theme pack** (a name table). Suggested neutral terms: *Patron* (Mother Country), *Faction archetypes* (Sea Power, Cavalry Power, Infantry Power, Movement Power, Merchant Power, Rooted Power), *Wanderer settlements* (native tribes), *turn* (not year, with the start year in the theme pack). Rules, data keys and code use only neutral ids. `theme/default.json` maps them to display names. A test fails if a theme word appears in `core/` or `data/` keys.

### HIGH

**H-1. Simultaneous-turn semantics are undefined, and the current wording gives the AI an information advantage.**
Human units "move at once" during the human's turn. The AI then plans at End Turn, after those moves are already in the state. It therefore reacts to this turn's human moves, but the human never reacts to the AI's moves. Nothing says what a queued `AttackUnit` does if its target moves away before resolution. Nothing says whether the attacker moves onto the target tile or stays put.
*Fix:* Pick one model and state it. **Recommended (closest to the manual, p.2-3 and p.42):** every player plans from the **start-of-turn snapshot**. Order of movement execution: human first, then AI (or alternate by turn parity to be fair). An attack order records `(attacker_stack, target_id)`. At resolution it fires only if the target is within the attacker's remaining reach from the attacker's final position. Otherwise it is cancelled and a message says so. Attacks against colonies always resolve, because colonies do not move. Write a test where the AI's plan is identical whatever the human did this turn.

**H-2. The terrain productivity formula cannot be implemented: its main input is missing.**
Section 6.4 uses `terrain_affinity[b.kind][tile]` "normalised", but no affinity table exists in section 7 and "normalised" is not defined. That formula is the heart of colony placement, the Z-key preview, the AI's site scoring and the -100% Gold Mine rule.
*Fix:* Add `data/terrain_affinity.json`, holding a per building-kind weight for each terrain within radius R. Define the modifier explicitly, for example: `modifier = clamp(sum(w[t] * falloff(d)) / sum(falloff(d)) + river + resources + difficulty, floor, cap)` with `falloff(d) = 1/(1+d)`. Give two worked examples, one of them a Gold Mine landing exactly on -100%. Keep values as integer percent (see H-8). Register it as A-25a.

**H-3. Leader Charisma and Reputation drive panic (A-34), but they have no range, starting value or update rule.**
Without these, the panic formula cannot be computed, and Leader commissioning has no defined outcome.
*Fix:* Define them as integers 0-10. Commissioning: Charisma = 2 + level + rng(0..2), Reputation = 0. Reputation +1 per won battle and -1 per lost battle, clamped 0-10 (p.43 says Reputation comes from combat record). Experience points stay post-MVP. Register as A-48.

**H-4. Gold is a runaway currency.**
A Level-1 Gold Mine costs 8 Wood and makes 20 Gold a turn. A Level-2 one makes 60. At the assumed buy prices (Metal 6, Wood 3, Goods 10), one L2 Gold Mine buys 10 Metal a turn, more than three L2 Metal Mines. Several Mother-Country trades are allowed per turn (p.14), so `max_shipment: 200` is not a cap. The dominant strategy becomes Gold Mine + Dock, buying everything else. The AI and the balance harness will both find it.
*Fix (tunables only, so locked decision 5 is respected):* (a) per-commodity **price elasticity**: each unit bought this turn raises the price 1% and the effect decays 20% a turn; (b) a **per-turn import cap** per colony, scaled by Dock level, for example 20/40/80/160 units; (c) sell prices well under buy prices (keep the 2:1 spread). Add a Phase 2 acceptance test: "a pure Gold+trade colony does not reach Center L4 faster than a balanced colony by more than 25%".

**H-5. Holland's 5% compounding interest is exponential and has no ceiling.**
This is from the manual (p.57). A stock of 1,000 Gold grows about 11.5x in 50 turns and about 130x in 100 turns. With no turn limit (locked decision 6), Holland's best play is to hoard. Meanwhile the military nation bonuses are tiny: +1 War College rating = +0.02 hit chance (A-41). The nations are badly unbalanced.
*Fix:* Keep 5% as the manual value. Add an *explicitly flagged deviation* tunable `gold_interest_cap_per_colony` (suggest 50 Gold a turn) and ask the user to decide. Separately, raise `hit_prob_per_rating` so one rating point is worth about one charge bonus (0.05-0.08), or make the nation bonus +1 *strength-equivalent*. Run a headless nation-vs-nation matrix in Phase 4 with a pass band (each nation wins 35-65% against each other nation over N seeds).

**H-6. Raiding is wrongly treated as unspecified, and the invented "raze on win" (A-47) replaces a rule the manual does give.**
p.41 specifies raids. From round 3 on, the attacker takes 10% of the remaining stockpile each round, a shrinking amount. From round 5 on, one building level is destroyed each round, and the attacker gains half its value. If the defenders are eliminated or retreat, the colony is destroyed. Forts are harder to destroy. Retreated defenders reappear nearby next turn. Natives and Europeans may not capture each other's colonies (p.40), so raiding is the manual's way to eliminate across that line.
*Fix:* Either (a) implement raid in Phase 3 from p.41, with only "Forts harder to destroy" as a new assumption, and delete A-47; or (b) make the MVP default scenario European vs European and block High Natives in the MVP NewGame screen until raid exists. (a) is better: the rule is small and fully specified.

**H-7. The AI has no memory of what it has seen, but its plan depends on it.**
`Player` holds only `explored` and `visible`. The AI "scales its army to enemy colonies it knows about" and attacks colonies whose defence it estimates. Once an enemy colony leaves vision, nothing records it. The human UI also needs last-known colonies drawn on dimmed tiles.
*Fix:* Add `Player.intel: FrozenMap[ColonyId, ColonySighting(pos, owner, level, fort_count, turn_seen)]`, updated in the fog step. `KnowledgeView` exposes intel, not live state. Make the planner's signature `plan(view: KnowledgeView, rng)`, not `plan(state, ...)`, so fog fairness is enforced by type and not by convention.

**H-8. The determinism plan has holes.**
(a) Python's `hash()` of `str` changes with `PYTHONHASHSEED`, so iterating any `set` or `frozenset` that holds strings (nation ids, building kinds) changes order between runs. (b) One shared `random.Random` stream means any change to AI logic shifts every later combat roll, so golden tests break for unrelated reasons. (c) Floats in the economy (`1 + modifier`, `0.667`) are deterministic on one machine but fragile across refactors at `floor()` boundaries.
*Fix:* (a) Rule: never iterate a set; always `sorted()`. Add a lint test that greps `core/` for `for .* in .*frozenset`, and run CI with two different `PYTHONHASHSEED` values on the same replay. (b) Use **counter-based randomness**: `draw(seed, stream, turn, key) -> int` via a hash such as SplitMix64 or `hashlib.blake2b`. Streams are `worldgen`, `combat:<battle_id>`, `ai:<player>` and `economy`, so one subsystem's draws never shift another's. (c) Hold all rates as integer percent or per-mille. Movement 3/2 and 2/3 become a rational pair. `floor` happens once, in one helper.

**H-9. The opening does not match the manual, and scheduled arrivals from the Patron are missing.**
The manual: the first Settler appears on turn 6 in most scenarios (p.24). The tutorial sends a new Ship later (p.10). Scenario templates define when ships arrive (p.55). The draft gives everyone a full kit on turn 1 and no further arrivals. That changes early pacing and removes a natural catch-up and tension mechanic.
*Fix:* Add `scenario.arrivals: [{turn, player_filter, units}]` to the scenario JSON. Default: Ship + 2 Explorers + Leader on turn 1, Settler (with 2 Infantry) on turn 6, a second Ship on turn 12. Make it a data decision for the user. Keep A-40 as the alternative "fast start" preset.

### MEDIUM

**M-1. River is both a tile type and an edge flag.** Section 4.2 says `World` has "river flags". Section 6.2 says "river tile 1 (crossing is free)". `terrain.json` has `river` as a non-flat tile. These model different maps: a river tile blocks building on it, a river edge does not. *Fix:* choose river **tiles** (simpler for iso drawing and Docks), drop "crossing is free", and give river tiles land cost 1 and `water_for_dock: true`. Update the worldgen tests.

**M-2. "An attack" is not defined, but Leader level limits attacks per turn.** p.42-43: one attack = selecting any number of units in one or more squares and striking one target square. *Fix:* define `Attack(target_square, participants)`. Each participant may join at most one attack per side-turn. The number of attacks per side-turn = `attacks_per_leader_level[level]`. A-33 then measures something real.

**M-3. Recruit-level schema is inconsistent.** Housing `{"settler": 1}` reads as a count, Tavern `[1, n]` as a range, and the Colony Center uses `recruits_leader: n`. The manual makes Housing and Colony Center recruit exactly level n, and Taverns and Forts recruit levels 1..n (p.30-31, p.37). *Fix:* one shape everywhere, `"recruits": {"settler": {"min": n, "max": n}}`, with a table-driven test per building.

**M-4. When costs are paid and refunded is not stated.** p.26-27: Halt Construction returns *all* allocated resources, and cancelling an Upgrade box before End Turn undoes it. Demolition returns "a small portion" next turn. *Fix:* state that costs are deducted at order time, refunded in full by Halt/Cancel in the same turn, refunded at `demolish_refund` on completion. For Mother-Country trade: sold goods leave at order time and Gold arrives after the delay, and the reverse for buying. Cancelling before End Turn is a full refund (p.15 "Remove").

**M-5. The general undo stack leaks fog.** Section 4.2 offers a whole-state undo for the current turn. A player could move an Explorer, see the map, then undo the move. The manual offers only targeted undos: Undo Found, Halt Construction, toggles, Cancel Attack, battle-move undo. *Fix:* limit undo to those actions. Map movement is never undoable, and explored tiles are never rolled back.

**M-6. Panic timing and retreat edges are undefined.** When is panic rolled: per hit, per attack, or at the end of the side-turn? What happens to a unit that panics on its home row: does it leave the field, or is that a blocked retreat? *Fix:* roll once per damaged unit after each attack resolves. Retreat from the home row counts as **blocked** (+1 damage, stays). Units never re-enter reserves except through a voluntary `Retreat`.

**M-7. Field battles have no flag or board layout.** The flag goal (p.42) is described for colonies. *Fix:* in field battles both sides have a flag on their home-row centre square (`flag_col 1`). Say explicitly which row is each side's home row on the 3-wide by 4-deep board, and draw a diagram.

**M-8. How garrisoned units count toward population is unclear.** p.15 counts units in the population total, but as 1 head or as their People cost? This also affects militia deaths "reducing population" by an unknown amount. *Fix:* a garrisoned unit counts as its People cost toward housing. Each militia strength point lost removes 5 people (assumed, A-49).

**M-9. High Natives may be double-buffed on movement.** p.22 (base Native trait: Explorers move farther) and p.57 (High Natives: all land units move as one level higher) may describe the same effect. The draft applies both (`land_move_level_bonus` and `explorer_move_multiplier 1.25`). *Fix:* apply only the level bonus and keep the multiplier at 1.0 behind a flag until playtest.

**M-10. Portugal at the easiest setting is undefined.** "One setting easier" has no meaning at Easy. *Fix:* at Easy, Portugal gets x1.5 again (2.25 total), or capped at 2.0. Pick one and register it.

**M-11. No stalemate protection, and no turn limit is locked in.** A player down to one Settler can sail forever. Two players on a fogged map may never meet. *Fix (does not add a turn limit):* a player with no colony is eliminated after `homeless_turns_limit` turns (suggest 15). After turn 150, each player's colony positions are revealed to every opponent as intel. Both values are tunables.

**M-12. Save/load during a battle and autosave are not specified.** *Fix:* saves happen only in the `orders` phase. Autosave at the start of every turn into rotating slots (3). Quitting mid-battle auto-resolves the remaining battles from the battle's current state (deterministic) before saving.

**M-13. The AI build-order "condition" language is a hidden interpreter.** "JSON list of (condition, building)" needs a DSL. *Fix:* conditions are named Python predicates in `ai/conditions.py`. The JSON references them by name plus parameters, and loading fails on unknown names.

**M-14. Start positions put both Europeans on the same (east) edge.** In a two-European default, that means contact very early and rush-heavy games. *Fix:* a `min_start_distance` (suggest 40% of the map width) along the edge, or put player 2 at the opposite end of the east edge. Test it in worldgen.

**M-15. Rendering at low zoom on large maps.** At zoom 0.25 on 256x256, "culling" still draws about 15k tiles a frame in pygame. *Fix:* pre-render the map in **16x16-tile chunk surfaces per zoom level**, invalidated only when fog changes. Set a frame budget (16 ms at 64x64, 33 ms at 256x256) in the Phase 1 exit criteria. Iso draw order for the 2x2 Fort: draw at its front-most tile.

**M-16. FrozenMap and frozenset copies are not structural sharing.** `with_()` on a dict copy is O(n). Adding tiles to a `frozenset` of explored tiles copies it every step (65k entries at 256x256). The claim "undo costs nothing extra" is false. *Fix:* store fog as an immutable `bytes` bitmap (8 KB at 256x256), with one bulk copy per unit move and not per tile. Accept O(n) map copies at MVP sizes. Add a benchmark gate: `apply_order` p95 under 2 ms and `end_turn` under 300 ms at 64x64 with 200 units.

**M-17. Some assumed values are missing from the register.** Missing are `explorers_per_tavern_level`, `leaders_per_center_level`, the difficulty multipliers, `crops_per_100_people` (listed only by way of A-21), Commerce partial output, the removal of lone non-combatants by enemy players (the manual says this only for hostile natives, p.40), and ship-capacity units (slots of what?). A-44 is out of order. *Fix:* the register must list every leaf key in `tunables.json`. Add a test that loads `tunables.json` and fails on any key with no register id.

### LOW

- **L-1.** Page citations: 3x4 grid is p.42, Native level cap p.27, Commerce note 5 p.32.
- **L-2.** A-30 says the combat odds are already "tuned", but no code or simulation exists. Change it to "initial guess, to be tuned by the Phase 3 combat-demo harness".
- **L-3.** The AI attack estimate "levels x hit points" counts strength twice (hp equals level). Use the sum of strength times expected hit chance.
- **L-4.** The colony radius has no stated base. `radius_base 1 + radius_per_level 1` gives radius 2 at level 1. Say "a Level-1 colony spans a 5x5 area" in words.
- **L-5.** "Year" is theme. Use `turn` in `core` and derive the year in the theme pack (ties into C-2).
- **L-6.** Auto Colony (p.16, p.28-29) is not mentioned. It reuses `ai/build_orders.py` at almost no cost. List it in section 11 as post-MVP with that hook.
- **L-7.** The manual's Combat Demo (p.45: point-buy, all units Level 4, Infantry 1 point, Cavalry and Artillery 2, Leader attack 3, 5-40 points per side) is not used. It is the best ready-made combat acceptance harness (see section 4).

---

## 3. Balance and pacing risks, with quick numbers

| Risk | Evidence from the draft's numbers | Mitigation |
|---|---|---|
| Gold-and-trade dominance | One L2 Gold Mine (60/turn) buys 10 Metal/turn at price 6. An L2 Metal Mine makes 3. | H-4 elasticity and import cap |
| Holland snowball | 1.05^50 is about 11.5 | H-5 cap (flagged deviation) |
| Weak military nations | War College +1 = +0.02 hit | Raise to 0.05-0.08 per rating |
| Church spam | Each L1 Church (5 Wood) adds +10 people/turn, no stacking limit. Housing L1 is 2 Wood per 100 places. | Diminishing returns per extra Church (100%, 75%, 50%...) or tie immigration to free housing. Assumption, flagged. |
| Second-colony timing | A Settler costs 150 people. Start pop 100 and growth about 3/turn + 10 per Church means a second Settler around turn 8-10, and the colony loses most of its labor when it is spent. | Target in the pacing table (section 5): second colony by turn 10±3 |
| Early rush | A start army of 2 L1 Infantry + L1 Leader against L1 colony militia (2 x L2 Infantry): 2 shots at 0.30 against 4 shots | Early capture is near impossible. Good. Make it an explicit acceptance test. |
| Too few attacks without a Leader | `attacks_without_leader 1` means one target square per side-turn | Fine as a design lever. Document it as intended. |
| AI fairness | Production multiplier at Hard/Very Hard. The manual ties difficulty to terrain modifiers in the computer's colonies (p.20). | Apply difficulty as a modifier offset (+0.10/+0.20), closer to the manual and visible in the colony preview |

---

## 4. Scope and phase-ordering risks (inside locked decision 8)

1. **Phase 2 is too big.** It holds all 10 buildings, the economy, population, recruiting, trade and save/load, and its exit test depends on untuned guesses. *Fix:* split it into 2a (found, place, produce, population, Center upgrades) and 2b (recruit, Patron trade, transfers, save/load). Each ends playable.
2. **The balance harness arrives last (Phase 4), after every number was picked.** *Fix:* in Phase 2a, add a headless **economy simulator** that runs a scripted build order for 60 turns and prints a pacing curve. Phase 2's exit test checks the pacing table in section 5. This is a test fixture, not the AI, so the order of the locked phases is unchanged.
3. **Phase 3 needs an opponent before the AI exists.** *Fix:* build the Combat Demo screen first (L-7). Combat is then playable and testable on its own, with no map, and the same screen becomes the tuning tool.
4. **High Natives depend on raid (H-6) and are thin without wanderer tribes.** Keep them out of the MVP NewGame list until raid lands.
5. **The dependency questions block Phase 0** (pytest-cov, pygame-ce versus locked "pygame"). The draft already raises them. Answer them before Phase 0 starts.

---

## 5. Missing GDD sections (with what each should contain)

| Section | Missing content | Acceptance hook |
|---|---|---|
| Vision and player fantasy | One paragraph plus three design pillars (for example *Read the land*, *Build a machine*, *Win the decisive battle*) | Every feature names the pillar it serves |
| Core loop | Turn loop (scout → place → produce → recruit → strike → resolve) and session loop (expand → specialise → mobilise → eliminate) as diagrams | — |
| Player goals and progression | Short-term (feed the colony), mid-term (Center L2-L3, second colony), long-term (eliminate). The progression gates are Center levels and War College ratings. | Pacing table |
| **Pacing targets** | For example: first colony by turn 3, Center L2 by turn 12±4, second colony by turn 10±3, first battle by turn 25-40, a typical game ends by turn 80-150 at 64x64 | Checked by the economy simulator and AI-vs-AI soak |
| UX flows and wireframes | Map HUD, colony window (build, Population Detail and Commodity Detail with next-turn forecasts), trade window, unit list, battle screen, messages, game over. Every status-bar error string. | Each flow has a headless smoke test |
| Forecast rule | Colony screens show next-turn values (p.15, p.28), so `economy.preview(colony)` **must be the same function** the turn uses | Property test: preview equals the actual next turn when nothing else changes |
| Failure states | Starvation spiral, labor collapse after recruiting, Gold Mine at -100%, lost last colony, stalemate (M-11) — and how the UI warns before each | One warning per state, tested |
| Tutorial / onboarding | The manual has a 4-mission tutorial (p.2-18). Plan an MVP of 3 contextual missions (land and explore, found and feed, upgrade the Center) built on the message system, plus right-click help on every element | Mission completion tests from scripted orders |
| Accessibility | Colour-blind-safe owner colours plus patterns or flags; fog not shown by colour alone; remappable keys; UI scale 100-200%; keyboard-only play (Next, F1-F4, end turn); no time pressure (no play-time bonus); readable battle odds shown as numbers | A checklist in the definition of done for every screen |
| Save/load | Slots, autosave, versioning and migration, what is saved (RNG counters, phase), corruption handling (keep a `.bak`, never overwrite a newer version) | Round-trip and migration tests (the draft has them, keep them) |
| Audio | Explicitly none in MVP (already a non-goal); reserve event hooks | — |
| Theme layer | C-2 | Lint test |
| Testing and acceptance criteria | Turn vague exits into numbers: "reasonable win-rate spread" becomes 35-65% for each nation pair over 50 seeds; "playable" becomes a scripted full game finishing with no exception; add performance budgets (M-15, M-16) | CI gates |
| Telemetry for balance | Per-turn CSV from the headless runs: stock, population, army value, colonies | Used by the pacing table |
| Glossary | Strength vs level vs hit points, attack vs shot, side-turn vs round vs game turn | — |

---

## 6. What to keep (do not lose these in the rewrite)

1. **The verified data tables (section 7.1-7.2)**: 22 of 22 spot-checks match. Move them to JSON exactly as they are.
2. **The assumption register** and the rule that every assumed number lives in data. Extend it (M-17), do not replace it.
3. **A pure `core`** with frozen state, `apply_order` returning a result or a typed error, and an import-boundary test.
4. **One battle implementation** for human, AI and auto-resolve.
5. **`KnowledgeView` fog fairness**, strengthened by type (H-7).
6. **Nation effects as typed data records** read by `modifiers.py`. "Effective level" capped at 5 is a neat fit for strength 1-5.
7. **Pure, round-trip-tested `iso.py`.**
8. **The non-goals list and section 11 hooks** as the scope contract.
9. **The corrections table (section 2)**, including the honest flag on the Native level-cap contradiction (A-45).
10. **The environment risk catch** (no pygame wheel for Python 3.14).

---

## 7. Recommended GDD table of contents

1. **Overview** — vision, pillars, player fantasy, target platform, MVP scope and non-goals (scope contract)
2. **Theme layer** — neutral vocabulary, theme-pack format, default display names, content and sensitivity notes
3. **Core loops** — turn loop, session loop, diagrams
4. **Player goals and progression** — goals by horizon, progression gates, pacing targets table
5. **World** — generation, terrain (one river model), start positions, scheduled arrivals, fog, vision, intel memory
6. **Turn structure** — phases, simultaneous-order model, order of execution, attack resolution rules, the resumable pipeline
7. **Units** — table, movement, attach/embark, recruiting (one schema), support caps, healing
8. **Colonies and economy** — founding, footprint, placement, productivity formula with affinity table and worked examples, labor, food, population, immigration, specialisation, upgrades, costs and refunds timeline, forecast rule
9. **Trade** — Patron trade (escrow, delay, elasticity, caps), colony transfers
10. **Factions** — archetype effects as data, Rooted-faction differences, faction balance targets
11. **Combat** — board diagram, glossary, attacks and shots, odds formula, panic and retreat edges, field vs colony battles, defenders and militia, capture, raid (p.41), Combat Demo mode
12. **Victory, defeat and failure states** — elimination, homeless limit, stalemate reveal, warnings
13. **AI** — knowledge model, strategic planner, build-order predicates, tactical AI, difficulty as modifier offset, debug logging
14. **UX** — screen flows, wireframes, HUD, status-bar messages, key map, right-click help
15. **Onboarding** — tutorial missions, contextual help
16. **Accessibility** — colour, input, scale, readable odds
17. **Save/load** — slots, autosave, versioning, migration, corruption policy
18. **Architecture** — layers and dependency rule, immutability strategy, deterministic RNG streams, integer math, performance budgets
19. **Data files and tunables** — schemas, validation, full assumption register (test-enforced)
20. **Testing and acceptance** — per-phase measurable exit criteria, golden replays, fuzz invariants, balance matrix, performance gates
21. **Phases and milestones** — 0, 1, 2a, 2b, 3 (Combat Demo first), 4
22. **Deferred features and reserved hooks**
23. **Risks and open decisions** — every item that needs the user's call (interest cap, arrivals schedule, High Natives in MVP, Church diminishing returns)
24. **Appendix** — manual page index for every rule, glossary
