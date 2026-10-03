# 03 - Role mapping options: Bangladesh 1971 theme pack and ruleset variant

Status: **options for the owner, nothing decided.** Date: 2026-10-03.
Scope: how the neutral roles of [GDD.md](../GDD.md) section 2.1 map onto the Bangladesh Liberation War, played **only** from the Bangladeshi side (Mujibnagar government and Bangladesh Forces / Mukti Bahini) against an AI Pakistan Eastern Command. The neutral ruleset stays untouched; everything here is a **theme pack** (`themes/bd1971/`), a **ruleset variant** (`rules/variants/bd1971.json`), a **scenario** (`scenarios/liberation-1971.json`) or, where flagged, an **engine hook** the neutral ruleset does not yet have.

How to read it: one decision per section, D-A to D-G. Each has 2-3 options, a table of what maps where, the cost, how it plays, the historical grounding, and one **RECOMMENDED** option. Each section ends with the multiple-choice question to answer.

## 0. Conventions

**Source cites.** `[Tn]` = source n in [01-timeline-forces.md](01-timeline-forces.md); `[Gn]` = source n in [02-geography-logistics-civilian.md](02-geography-logistics-civilian.md). Most are Wikipedia or news summaries (tertiary). Where the research files give ranges or say UNVERIFIED, this file keeps the range and the flag. No figure here should go into game text without the checks in section 10.

**Cost tiers** (what a choice costs in rules work):

| Tier | Meaning | Rules hash changes? |
|---|---|---|
| **T0 relabel** | Theme pack only: labels, art, text, calendar | No |
| **T1 scenario/settings** | Hand-made map, arrivals, `max_turns`, difficulty | No (game hash only) |
| **T2 variant** | Typed `replace/add/remove` ops on keys that already exist (04 §3.2) | Yes |
| **T3 engine hook** | A mechanic the neutral ruleset does not have; needs new ruleset keys (a minor version), then the variant switches it on | Yes, plus code |

**Naming rule for the whole pack.** No real person is playable or named on a unit. Commanders, sector staff and AI officers come from fictional name pools (cosmetic stream, 04 P-9). Real institutions, places and dates may appear in briefings and an in-game encyclopedia, with sources. The opposing side is named factually ("Pakistan Army, Eastern Command"), never caricatured [G18/G19 guidance, 02 §4.2 Do-6, Don't-4].

**Point of view rule.** Every player-facing role label is what the Bangladeshi side would call its own thing. The AI's roles are labelled from the same viewpoint but in plain military terms (its "colony" is a "garrison town", its militia is "paramilitary"), never as villains.

---

## D-A. Arrival and expansion

The base game: a transport lands an expedition on the arrival edge; a founder (`u.founder`) founds colonies (`bld.core`) that grow by Center level. In 1971 the Bangladeshi forces lost the towns by mid-April, retreated across the border, trained in India, and re-entered in small groups [T6][T15]; sector HQs were near or across the border [T9]; Z Force set up the first civil administration in liberated Roumari on 27 August [T10].

### A1. Border re-entry: teams cross from the border and found base areas (RECOMMENDED)

| Role | Label | Note |
|---|---|---|
| arrival edge | the Indian border (west, north, east) | arrivals land on border **land** tiles, no transport needed |
| `u.founder` | Organising team | founds a base area |
| `bld.core` | Base area HQ (sub-sector HQ) | levels 1-4 = cell, base area, liberated area, liberated district |
| colony (word) | Base area / Liberated area | the word "colony" never appears in this theme |
| player archetype | `arch.expedition` (border start, has a patron, may field ranged) | asymmetry kept as data; see D-B for the patron |

- Cost: T0 labels; T1 scenario map with the border on three sides; **T3 small hook**: arrivals need a list of land entry tiles (today they arrive by transport on one edge, GDD §5.1, §5.3).
- Plays: first turns are a border scramble; expansion pushes inward from several edges, which matches the sector layout along the border [T9].
- Grounding: re-entry in groups of 5-10 [T4][T15][G2]; sectors and sub-sectors [T8][T9]; Roumari civil administration [T10].

### A2. Rear camps beyond the border plus forward base areas

As A1, plus the player may place **rear camps** on a strip of Indian territory along the map edge; the AI may not enter or attack that strip until the conventional-war turn (3 December [T1][T3]).

- Cost: A1 plus **T3**: a no-attack zone tied to a turn trigger.
- Plays: safe production behind the line, raids forward; the strip ends when the open war starts.
- Grounding: HQ at 8 Theatre Road, Calcutta [T8]; training camps in Indian states [T15][G2]; sector HQs such as Benapole, Hasnabad, Teldhala/Mahendraganj [T9].
- Risk: drawing Indian territory as the player's buildable land can read as Indian territory being Bangladeshi, and a sanctuary that the AI must respect simplifies real cross-border shelling and the Garibpur/Hilli battles before 3 December [T16][T17]. Needs careful text.

### A3. Liberate existing places instead of founding

The map starts with many small settlements (`npc.settlement`); the player "liberates" them by bringing a team, and they become base areas. No founding from nothing.

- Cost: **T3 large**: a new conversion order, NPC settlements switched on (they are out of the MVP), and a new rule for owning a pre-existing place.
- Plays: closest to the story (the country already existed), but the whole colony economy (founding, area rings, placing every building) becomes awkward.
- Grounding: same as A1.

**Why A1:** it keeps the founding loop and Center levels untouched, needs one small hook, and matches the documented pattern of small teams re-entering along the sector borders. A2 can be added later as a variant on top.

**Question D-A:** How does the player's presence grow? (a) A1 border re-entry, teams found base areas [recommended]; (b) A2 as A1 plus rear camps on an Indian-border strip; (c) A3 liberate existing places.

---

## D-B. The patron role and outside trade

The base patron (`patron`, "Mother Country") sells and buys with a delay, collects automated tax, sends the first founder, and is the main early source of `res.wares` (GDD §9, 04 P-3). Putting **India** in that slot would say Bangladesh was India's colony and pays it tax: false and offensive. The real chain was: the Mujibnagar government and Bangladesh Forces HQ in Calcutta [T2][T8][G3]; Indian training, arms, bases and intelligence from April-May [T3][T4][T15][G2]; refugee relief by India, Oxfam and UNHCR-led fundraising [G7][G17]; arms also bought on the Calcutta market [G2]; diplomacy through missions in New Delhi, Washington and London [G3][G32].

### B1. Patron = the player's own government in exile (Mujibnagar, Calcutta) (RECOMMENDED)

| Base mechanic | 1971 meaning |
|---|---|
| `patron` | "The Mujibnagar Government" (Bangladesh Forces HQ, Calcutta) |
| link to outside (`bld.port` on a river reaching the map edge, 04 P-2) | "Supply route across the border": a border river crossing or a border base |
| buy | Requisition from the government's stores (weapons, medicine, radios) |
| sell | Send surplus to the camps (food, materials) |
| delay (ASSUMED 2 turns) | Time to move goods through the camps and across the border |
| import cap by port level (ASSUMED 20/40/80/160) | Capacity of the crossing |
| tax | **0%** (variant `economy.tax_rate` = 0); the exile government did not tax its own forces, and no source in the files says it did (funding is UNVERIFIED [G sec 2.1]) |
| `name_after: sov.independence` | not used (independence is the goal, see D-F) |

- Indian support is named honestly in the government's text: the stores are described as "supplied with Indian help" and the encyclopedia covers Indian training, arms and bases [T15][G2], so the help is visible without making India the overlord.
- Cost: T0 labels; **T2** variant (tax 0; possibly delay and caps tuned).
- Plays: as the base game: a supply line you must protect, with a delay. Destroying a crossing hurts.
- Grounding: [T2][T8][T22][G3]; Indian support phases [T3][T4][T15].

### B2. Two outside channels: government stores plus international relief

As B1, plus a second, slower, unpriced channel: "International relief" delivers fixed food and medicine every few turns to base areas that hold a river post on the border.

- Cost: **T3**: a second patron-like source (the ruleset has one `patron`).
- Plays: relief arrives regardless of money; the player must keep crossings open.
- Grounding: Oxfam relief and Calcutta warehouse [G17]; UNHCR-led pledges of about 17 to 70 million dollars [G7] (single news source).
- Risk: the real relief served about 10 million **refugees in India** [G7][G8], not fighters. Routing relief goods into the war economy would misrepresent it. If chosen, relief must be spent only on a civilian-protection need, which the ruleset does not have (see D-D P2).

### B3. No patron (variant `no-patron`), everything made locally

Removes the outside trader; the workshop (`bld.converter`) makes supplies from level 1 without a wares cost (04 P-3).

- Cost: **T2** (the `no-patron` variant already planned in 04 §3.2, plus its required wares fix).
- Plays: a self-reliant guerrilla economy; simpler.
- Grounding: weak. It erases the exile government, Indian support and the arms purchases [T2][T15][G2], which every source treats as central. Listed only for completeness.

**Why B1:** the patron becomes the player's own legitimate government, which is the Bangladeshi point of view; tax goes to zero by variant; Indian and international help is stated in text rather than by a mechanic that would distort it.

**Sub-question (Indian armed forces from 3 December).** The ruleset has no allied AI. Options: (i) **scripted arrivals of "Joint Command" units under the player's control** from the 3 December turn (T1 scenario arrivals; the player then commands Indian units, which breaks the "Bangladeshi roles only" rule); (ii) **an off-map effect**: from that turn the AI's patron link is cut and its garrisons get a morale penalty, and the briefing names the Joint Command (T3 hook, but no foreign units under the player); (iii) leave it out (a leak, see section 8). Recommended: **(ii)**. It reflects the blockade and isolation of Eastern Command [T19][G23] without the player commanding another country's army. The joint-command date itself is contested (21 November vs 4 December [T7]).

**Question D-B:** Who is the patron? (a) B1 own government in exile, tax 0 [recommended]; (b) B2 government plus an international relief channel; (c) B3 no patron. And for December: (i) player-controlled Joint Command arrivals; (ii) off-map effect on the AI [recommended]; (iii) leave it out.

---

## D-C. Terrain, rivers and the monsoon

Facts: delta plains about 79% of the land, hills about 12% [G5]; big rivers Jamuna-Brahmaputra, Padma-Ganges, Surma-Meghna, Karnaphuli [G5]; haors in the northeast, flooded about July to November [G22]; Chittagong Hill Tracts in the southeast [G21]; Sundarbans mangroves near Mongla and Khulna [G20]; monsoon rain June to September [G5] (one source says April to October and claims about 300 extra navigable channels [G10]); more waterways than roads (opinion essay [G14]).

### Terrain relabel (common to all three options)

| Role | 1971 label | Fit |
|---|---|---|
| `t.deep` (navigable, land-impassable) | **Great river** (Padma, Jamuna, Meghna) and the Bay of Bengal | Good: big rivers block land units and need boats; they reach the map edge, so `link_to_outside` works [G5] |
| `t.still` (impassable, port = local post) | Haor / beel (seasonal wetland) | Fair [G22]; real haors are walkable in the dry season (see C2) |
| `t.river` (land crosses it, boosts extractors) | Khal / small river | Good |
| `t.open` (best food) | Paddy land | Good |
| `t.wood_a` | Village groves and bamboo | Fair |
| `t.wood_b` (slower forest) | Mangrove (Sundarbans) and sal forest | Good [G20] |
| `t.rough` (not buildable, slow) | Hills and tea-garden slopes (Sylhet, Tripura border) | Fair; Sylhet hills UNVERIFIED in the files [G22] |
| `t.peak` (not buildable, slowest) | Hill Tracts ranges | Fair; the highest point is only 986 m [G21], so "mountain" art would mislead |
| `u.transport` | Country-boat flotilla (river craft) | Good: Meghna crossing used local boats [T19] |
| `bld.port` | Ghat (river landing) | Good |

Map: the random generator makes oceans and islands, not a delta. Use a **hand-made scenario map** of East Bengal (T1), roughly 128 tiles, drawn from the gazetteer [G sec 5]. Rivers as `t.deep` cut the map into the regions the sectors followed [G12][G16].

### C1. Relabel only; monsoon is calendar text (flavour)

- Cost: T0 + T1 (map). Calendar shows month and season; no rule reads it.
- Plays: as the base game on a delta map.
- Grounding: terrain as above. The monsoon, which every source calls important [T1][G1][G10], has no effect: a leak.

### C2. Monsoon as a seasonal rule cycle (full)

A season table by turn: in the monsoon, some `t.open` and all `t.still` tiles become boat-navigable, land movement costs rise, `t.river` behaves like `t.deep`; in the dry season, haors become land.

- Cost: **T3 large**: time-varying terrain flags change map topology every season; touches pathfinding, fog-free intel, the AI and the colony-area rules (a building on a tile that floods).
- Plays: the strongest flavour; a real strategic rhythm (boats in the rains, roads in the dry).
- Grounding: [G5][G10][G22]. Risk: who the rains favoured is contested; sources say Pakistan regained momentum in the monsoon [T1][G1] while guerrillas used waterways [G10][G14]. A full model would have to take a side.

### C3. Monsoon as a light seasonal modifier (RECOMMENDED)

Terrain tiles never change. A season table (by turn, 3 seasons: pre-monsoon, monsoon, dry) applies global multipliers only: land movement cost x1.5 in the monsoon for everyone; boat movement unchanged; `bld.food` output varies by season; the AI's road-bound heavy units (`u.shock`, `u.ranged`) take the land penalty, the player's boats do not.

- Cost: **T3 small**: one `season` table in the ruleset with movement and output multipliers (same shape as the existing difficulty and movement settings); the variant switches it on. Topology never changes.
- Plays: a felt rhythm with no map churn; boats become the monsoon's mobility.
- Grounding: the effect is symmetric on land and favours whoever has boats, which follows the cited waterway accounts [G10][G14] while not claiming the monsoon decided anything. Keep the multipliers ASSUMED and tunable.

**Why C3:** it gives the monsoon a mechanical voice at low cost and without changing map topology mid-game; C2 can follow later if C3 proves fun.

**Turn length (calendar, T0).** 26 March to 16 December is about 265 days. **1 turn = 3 days** gives about 88 turns, inside the GDD pacing range of 80-150 (§4). Calendar file: start 26 March 1971, step 3 days. The rule state still stores only `turn` (04 P-7).

**Question D-C:** How is the monsoon modelled? (a) C1 flavour only; (b) C2 full flooding cycle; (c) C3 light seasonal modifiers [recommended]. (Terrain relabel and the hand-made map apply to all three.)

---

## D-D. Economy resources

The six resource roles are fixed and `res.coin` stays one resource (GDD §2.1, 04 P-6). The hard part is `res.pop`: it is labour, housing load, the "P" spent on units (10-25 P per military unit, 150-600 P per founder, GDD §7.1) and the population that militia losses reduce (GDD §11.6). Mapping it to "civilians" would make civilians a currency that is spent and lost, which the research guidance forbids [02 §4.2 Don't-1, Don't-3].

### Resource table (shared by all three options; only `res.pop` and the coin source differ)

| Role | Label | Why |
|---|---|---|
| `res.basic` | Bamboo and timber | Building material; extractor on groves and near khals |
| `res.hard` | Arms and ammunition | L1 units cost 1-5 of it (GDD §7.1), which reads naturally; early arms came from seized depots [G2] |
| `res.coin` | Funds | Money for recruitment and requisitions |
| `res.wares` | Field supplies (medicine, explosives, radios) | Level-3+ input; comes from the patron (D-B) or the workshop |
| `res.food` | Rice | Feeds the base area |
| `res.pop` | see P1-P3 | |

`bld.coin_extractor` (the base "gold mine", affinity near peaks) has no honest 1971 equivalent. Sub-options: (x) **"Support committee"** (local contributions) with the variant moving its terrain affinity from peaks to paddy land (T2); (y) **"Tea-estate funds"** keeping the hill affinity (T0), but no source in the files says the forces ran tea estates, so it would be invented; (z) remove it (T2) and get funds only from the patron. Recommended: **(x)**, flagged: village contributions are UNVERIFIED in the files [G sec 2.1] and need a source.

### P1. `res.pop` = Volunteers (people who have joined the movement) (RECOMMENDED)

- The count is the base area's fighters-to-be and support workers, not the villagers living there. Recruiting a unit moves volunteers into it; a founder (organising team) takes volunteers to the new base.
- Housing (`bld.habitat`) = "Volunteer shelter"; the attractor (`bld.attractor`) brings in new volunteers (see D-G).
- Food shortage text: "volunteers return home", never starvation (GDD §8.5 emigration and starvation are one decrease; T0 text only).
- Militia losses cost volunteers, reworded as "base guard losses" (T0).
- Cost: T0 (all labels and text). Optional T2: scale founder P costs down (150 is a big team) if playtests feel wrong.
- Grounding: the Gono Bahini were civilian volunteers, mostly young, trained and sent back [T4][T15]; strength figures vary widely (70,000 to 180,000 by different counts [T3][T7][T19][G15][G33]), so the game shows no "historical" number.

### P2. Volunteers plus a separate civilian protection track

As P1, plus a non-spendable "Safety" track per area: raised by holding areas and supplies delivered, lowered when the AI takes a base; it can never be spent, traded or turned into units.

- Cost: **T3 large**: a seventh quantity is a ruleset major version (04 §1.1), even if it is not called a resource.
- Plays: puts protection into the game loop; a candidate for scoring in D-F.
- Grounding: museum guidance stresses civilians and refugees as people [G18][G19]; research recommendation "protect and relieve, not harvest" [02 §4.2 Do-2].

### P3. Abstract "Support" (popular support index)

`res.pop` = "Support", a number with no people in it.

- Cost: T0.
- Plays: same mechanics, more abstract.
- Risk: units "cost support" and bases "lose support" when guards fall: it hides people rather than respects them, and it reads like a political score of villagers' loyalty, which no source measures.

**Why P1:** volunteers are the people who really chose to join; spending them on units is what joining meant; civilians are never the currency. P2 is the honest long-term addition but needs a ruleset version.

Other economy settings for the variant: **tax 0** (D-B); **coin interest off** for every profile (`fp.banker` effect removed, T2); the GDD's labour-shortage and specialisation rules unchanged.

**Question D-D:** What does `res.pop` represent? (a) P1 Volunteers [recommended]; (b) P2 Volunteers plus a civilian protection track (ruleset version); (c) P3 abstract Support. And the coin source: (x) support committee [recommended, needs a source]; (y) tea-estate funds; (z) none.

---

## D-E. Units, sectors and the AI faction

### E-units. The player's army (one mapping, two variants on the shock role)

| Role | Mechanics kept | Label | Grounding |
|---|---|---|---|
| `u.scout` | fastest, auto-explores, cannot fight | Guide / courier team | local knowledge of waterways [G14] (opinion essay) |
| `u.founder` | slowest, founds a base area | Organising team | civil administration in Roumari [T10] |
| `u.commander` | carries units, level = attacks per turn | Sub-sector commander (fictional name) | sub-sectors under own commanders [T8][T9] |
| `u.line` | move 1 or attack, cheap | Freedom-fighter section (Gono Bahini) | groups of 5-10 [T4][T15] |
| `u.shock` | move 2 or move 1 then attack, charge | **Option S1** Raiding party (fast hit-and-run). **Option S2** Regular company (East Bengal Regiment) | S1: ambushes and sabotage [T4][G13]; S2: five EBR battalions revolted, core of the regular army [T20] |
| `u.ranged` | home row, column fire | Mortar section | Z Force had an artillery battery [T10] |
| `u.transport` | river (`t.deep`) only, carries units | Country-boat flotilla | Meghna crossing by local boats [T19] |
| `u.militia` | generated base defenders, losses cost `res.pop` | Base guard (volunteers) | see D-D P1 |

Recommended: **S1** (Raiding party). The charge-then-stop pattern fits a hit-and-run ambush; regulars appear instead as higher **levels** of `u.line` (levels 3-4 labelled "Regular platoon"), and the named regular brigades (Z, S, K Force, formed 7 July, 1 October, active from 14 October [T10][T11]) appear as **scenario arrivals** of commander stacks on those turns (T1). Verify how the brigade letters were chosen before using them (section 10).

Naval commandos (Operation Jackpot, 15-16 August, ports Chittagong, Chandpur, Narayanganj, Mongla [T5][G10]) have no role: the ruleset's ship combat is post-MVP (GDD §11.8). Options for later: a scenario event or a special raid order (T3). Kilo Flight (formed 28 September, first strikes 3-4 December [T12]) likewise stays in the encyclopedia only.

### E-sectors. The 11-sector structure

| Option | How | Cost |
|---|---|---|
| **X1 Map regions (RECOMMENDED)** | 11 named regions drawn on the scenario map from the sector areas [T9]; each base area shows its sector; sector 10 (naval, no fixed area [T9]) is the boat flotillas' command label | T1 + T0 (regions are `lm.region` data and labels; no rule reads them) |
| X2 Sector cap | One base-area HQ of level 3+ per sector region; regions give a small supply bonus to their own bases | T3 (a region-aware building rule) |
| X3 Sectors as commanders | Each commander belongs to a sector; units outside their sector move slower | T3 |

Why X1: sector areas are well attested in outline, but HQ names, sub-sector counts and commanders vary between sources [T9][G6 vs a second list]. Using areas only, and no rule, avoids encoding a contested detail. Use areas, not HQ names, until checked (as 02 §6 advises).

### E-AI. The AI opponent's roles (labelled from the Bangladeshi viewpoint, factual)

| Role | AI label | Grounding |
|---|---|---|
| faction | Pakistan Army, Eastern Command | [T23] |
| AI archetype | `arch.expedition` (may field ranged; has a patron) | It had artillery and armour [T6]; with both sides `arch.expedition`, capture is allowed, so liberating a garrison town is a capture |
| AI patron | West Pakistan (airlift; long delay, small cap) | reinforcements by C-130 and PIA flights [G11]; 1,500 km apart, overflight ban detour [G31] (unverified) |
| `bld.core` (AI) | Garrison town / cantonment | "fortress concept" in key towns [G16] |
| `u.line` | Infantry battalion | [T23] |
| `u.shock` | Armour (light tanks) | 75 M24 Chaffee tanks at the start [T6][G11] |
| `u.ranged` | Artillery battery | |
| `u.transport` | River gunboat | navy of gunboats and armed boats [T23] |
| `u.militia` | Paramilitary (Civil Armed Forces, Razakars) | [T14][T23] |
| `u.commander` | fictional officer names only | no real officers |

Start position: the AI holds garrison towns spread across the map at turn 0 (historically most towns had fallen by mid-April [T6]). Pre-placed colonies are a scenario feature the GDD defers ("mapped scenarios", §22): **T3 small** (scenario `colonies: [...]`).

Not used: `arch.indigenous` and `npc.settlement`. Do **not** map them onto the Hill Tracts peoples, Biharis or any community; both stay switched off in this variant (the `mvp` variant already removes NPC settlements). Faction profiles: player `fp.scout_line` (scouts one level higher, line bonus: "knows the land"); AI `fp.naval_ranged` relabelled; or `equal-nations` for both (T2). Recommend `equal-nations` for v1 so the asymmetry comes only from the scenario and archetype data.

**Question D-E:** (1) Shock unit = (a) S1 raiding party [recommended] or (b) S2 regular company? (2) Sectors = (a) X1 map regions only [recommended], (b) X2 sector cap, (c) X3 sector commanders? (3) Faction profiles = (a) `equal-nations` [recommended] or (b) scout_line vs naval_ranged?

---

## D-F. Victory and defeat

Base rule: last faction standing; eliminated = no colony and no founder, or homeless 15 turns (GDD §12). History: no elimination; Eastern Command surrendered in Dhaka on 16 December after about 13 days of open war [T19][G29]; Niazi's "fortress concept" held key towns [G16]; Indian planners expected isolated forces to give up once ports and hubs fell [G16].

### F1. Last standing, relabelled

Win = every garrison town captured or destroyed. Loss = no base area and no organising team.
- Cost: T0.
- Grounding: weak; it invents an elimination that did not happen and ignores the surrender and the Joint Command.

### F2. Surrender threshold (RECOMMENDED)

Win when the AI's **surrender test** passes at the end of a turn: the player holds the Dhaka garrison town, **or** holds at least N of the K fortress towns (Jessore, Bogra, Rangpur, Comilla, Chittagong [G16]) and the AI's held towns are at most 25% of its start. Loss: the base rule (no base area and no organising team for 15 turns), worded "the movement is scattered". Optional `max_turns` (setting, T1) at the 16 December turn: at the deadline the game ends as a **draw with a debrief**, not a loss.
- Cost: **T3 small**: a typed victory predicate in the ruleset (the GDD already plans goal predicates for missions, 04 §1.6, so the predicate machinery is shared); the variant selects it.
- Plays: a clear objective (Dhaka and the fortress towns) and no grind to hunt the last garrison.
- Grounding: [G16][G19][G29]; Jessore liberated 6 December [T3]; surrender 16 December [T19].

### F3. Score at the deadline (restores the GDD's victory points, D-1)

Points for liberated areas held, crossings open, supplies delivered, volunteers returned home safely at the end; the game ends on the 16 December turn; compare with a par.
- Cost: **T3 large** (the scoring system is deferred, GDD §22).
- Risk: any score near civilians must never reward losses or count the dead (02 §4.2 Don't-1 to Don't-3); every point source needs that review.

**Why F2:** it makes the war end the way it ended (surrender of a cut-off command), uses a predicate system the GDD already needs, and never asks the player to wipe out every enemy.

**Question D-F:** How is the war won? (a) F1 last standing; (b) F2 surrender threshold, optional deadline as a draw [recommended]; (c) F3 score at the deadline.

---

## D-G. Buildings

All 12 roles keep their costs, outputs and footprints. "Mech change" says whether the 1971 meaning needs a rules change.

| Role | Base | 1971 label (Option G1, RECOMMENDED) | Mech change? |
|---|---|---|---|
| `bld.core` | Colony Center | Base area HQ (heals units attached to it: "field aid post at HQ") | No |
| `bld.food` | Farm | Paddy and granary (houses 40 per level: "volunteer billets") | No |
| `bld.basic_extractor` | Mill | Bamboo cutters | No |
| `bld.hard_extractor` | Metal Mine | Arms cache (keeps the hill affinity, read as concealment) | Flag: arms are not mined; see leak L-6 |
| `bld.coin_extractor` | Gold Mine | Support committee | **Yes, T2**: affinity from peaks to paddy land (D-D x) |
| `bld.converter` | Commerce | Field workshop (makes supplies from bamboo, arms and rice) | No |
| `bld.habitat` | Housing | Volunteer shelter (recruits the organising team) | No |
| `bld.attractor` | Church | Radio listening and leaflet centre (draws volunteers) | No; removes the religion leak (04 P-5). Grounded in the radio's role [G4][T13] |
| `bld.scout_post` | Tavern | Courier post | No |
| `bld.garrison` | Fort | Fighters' camp (training and quarters; adds defending mortars) | No; label leak L-10 (main training camps were in India [T15]) |
| `bld.port` | Dock | Ghat (river post); on a river reaching the border it opens the supply route | No |
| `bld.academy` | War College | Instructors' cadre | No |

Other labelings the owner proposed and where they fit:

| Proposed | Best role | Note |
|---|---|---|
| Training camp | `bld.garrison` (G1 calls it "Fighters' camp") or `bld.academy` | "Training camp" on Bangladeshi soil misstates where most training happened [T15][G2]; prefer "camp" |
| Field hospital | none today | Healing is a Center rule (GDD §7.2). **Option G2**: move healing to a dedicated building by re-purposing `bld.scout_post` (T3 small: a `heals_attached` flag per building) and relabel the courier role onto `bld.habitat`. Not recommended for v1 |
| Radio station | `bld.attractor` | The real Swadhin Bangla Betar Kendra was one station (Kalurghat, then Agartala [G4]); a per-base "listening centre" avoids implying many stations |
| Supply depot | `bld.converter` or Center storage | No storage cap exists in the ruleset; depot as a label for the workshop is fine |
| River post | `bld.port` | Exact fit |

Option **G3**: plain functional labels with no 1971 nouns ("Command post", "Food store", "Materials", ...). Cost T0; least risk of inaccuracy, least flavour.

**Question D-G:** Building labels: (a) G1 as tabled [recommended]; (b) G1 plus a field hospital that takes over healing (T3); (c) G3 plain functional labels.

---

## 8. Leak table: where the mapping misleads or distorts

| # | Leak | Where | Severity | Mitigation |
|---|---|---|---|---|
| L-1 | India as the patron would mean Bangladesh was its colony and paid it tax | D-B | Critical | B1: patron = own government; tax 0; Indian help named in text |
| L-2 | Leaving India out makes the Mukti Bahini win alone | D-B, D-F | High | December off-map effect (D-B ii), briefings and encyclopedia on Indian support [T15][T19] |
| L-3 | Player commanding Indian divisions breaks the Bangladeshi point of view | D-B (i) | Medium | Prefer D-B (ii) |
| L-4 | "Colony", "founding", "settlers" for one's own country | D-A | High | Theme words: base area, organising team; no "colony" string anywhere (theme coverage test can grep for it) |
| L-5 | Civilians as `res.pop` (spent on units, lost with militia) | D-D | Critical | P1 Volunteers; text "return home", never starvation |
| L-6 | Arms "mined" every turn in the hills | D-G | Medium | Encyclopedia: arms came from seized depots, India and purchase [G2]; consider making Arms mainly a patron good by tuning (T2) |
| L-7 | Gold mines; funds from terrain | D-D | Medium | Support committee (x), needs a source; or remove (z) |
| L-8 | Raid destroys a colony and takes 10% of its stock per round (GDD §11.6): looting and razing towns where people live | D-E, D-F | High | AI "colonies" are garrisons and cantonments, not towns; raid text = "sabotage of the garrison's depots and installations" [T4][G15]; never a civilian place |
| L-9 | Capture keeps half the stockpile | combat | Low | "captured stores" of a garrison, not civilian property |
| L-10 | "Training camp" inside East Bengal | D-G | Low | Label "Fighters' camp"; encyclopedia places training in India [T15] |
| L-11 | Last standing implies extermination of the enemy | D-F | High | F2 surrender threshold |
| L-12 | Monsoon decides the war, or favours one side | D-C | Medium | C3 symmetric land penalty; contested in sources [T1][G1][G10] |
| L-13 | `npc.settlement` friendly/hostile villages imply villages "hostile" to liberation, or ethnic groups as NPCs | D-E | High | Keep NPC settlements and `arch.indigenous` off |
| L-14 | Paramilitary as generated militia: locally recruited Bengalis and Biharis as a faceless enemy pool | D-E | Medium | Factual label, no ethnic wording; Bihari and other minorities never shown as enemies (02 §4.2 Do-6, Don't-6) |
| L-15 | Atrocities as mechanics (raids on bases, reprisals) | all | Critical | None in rules or events; encyclopedia only, with ranges and sources [T26][G8] |
| L-16 | Displaying force sizes or death tolls as single numbers | text | High | Show ranges with who claims what [T sec Contested][G8]; no "historical strength" numbers on units |
| L-17 | Discoveries (gold deposit, fountain of youth, ruins) | rules | Low | Disable `disc.*` in the variant (T2) |
| L-18 | A loss or an early win is counterfactual | D-F | Medium | Opening note: "a game about the war, not a record of it"; debrief compares with what happened |
| L-19 | Religious framing (attractor as a mosque or temple; Hindu/Muslim sides) | D-G | High | Radio listening centre; the movement framed as linguistic and political, as the museum states [G19] |
| L-20 | Brigade names Z, S, K tied to real commanders | D-E | Medium | Verify origin; if tied to persons, use generic brigade names |
| L-21 | AI patron airlift as a steady trade with prices | D-E | Low | Small cap, long delay; text says "airlift", no prices shown |
| L-22 | Tax mechanic on the player | D-B | Medium | Tax 0 by variant |

---

## 9. What the variant `bd1971` would contain (if the recommendations are taken)

| Item | Tier |
|---|---|
| Tax 0 for the player; coin interest removed; `equal-nations` profiles | T2 |
| Coin-extractor affinity moved to paddy land | T2 |
| `npc.settlement`, `arch.indigenous`, `disc.*` off (builds on `mvp`) | T2 |
| Land entry tiles for arrivals (A1) | T3 small |
| Pre-placed AI garrison towns in the scenario | T3 small |
| Season table: movement and food multipliers (C3) | T3 small |
| Surrender-threshold victory predicate (F2) | T3 small |
| December off-map effect: AI patron cut, garrison morale penalty (D-B ii) | T3 small |
| Hand-made East Bengal map, 11 sector regions, calendar 3 days per turn from 26 March 1971, `max_turns` ~88 | T1 + T0 |

Five small engine hooks; each is a generic rule (entry tiles, pre-placed colonies, seasons, victory predicates, a timed patron event) that other themes could reuse, so none of them names 1971 in the ruleset.

---

## 10. Facts to verify against stronger sources before shipping

Every item below is used by a recommendation above and rests on a tertiary or single source in the research files. Check against Banglapedia, the Liberation War Museum, FRUS vol. XI, Library of Congress, or academic works.

1. The 11 sector **areas** (not HQs): the two lists in the files disagree on HQs and sub-sector counts [T9][G6].
2. Dates: Osmani's appointment (4 April vs 11 July) [T4][T8]; Joint Command (21 November vs 4 December) [T7]; Z/S/K Force formation dates and battalions [T10][T11].
3. How the Z, S and K Force names were chosen (L-20); not stated in the files.
4. Roumari civil administration, 27 August 1971 [T10] (used for the founding idea).
5. Monsoon months: June-September [G5] vs April-October [G10]; the "300 extra channels" claim [G10] and "over 300 river operations" [G12].
6. Funding of the exile government and village contributions (needed for the Support committee) — UNVERIFIED [G sec 2.1, G sec 6].
7. Where arms came from (seized depots, India, Calcutta arms market; the howitzer and aircraft list is flagged doubtful) [G2].
8. Pakistan Eastern Command structure in December and its "fortress" towns [T23][G16]; tank count at the start (75 M24) [T6][G11].
9. Razakar and Al-Badr formation dates and roles [T14][T25] (used for the militia label).
10. Radio: Kalurghat start, move to Agartala on 3 April, last broadcast 6 December [G4].
11. Every number that would appear on screen (forces, refugees, deaths, ships sunk): use ranges with attribution only [T sec Contested][G sec 6].
12. Bengali terms and spellings (Gono Bahini, Niyomito, Muktijoddha, ghat, haor, khal), several marked (U) in [T glossary]; have a Bangladeshi historian and native speaker review all labels.
