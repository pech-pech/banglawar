# Bangladesh 1971 theme: treatment of the human cost, compared

Decision aid for the owner. Date: 2026-10-03. Status: proposal; updated 2026-10-03 for the owner's decisions recorded in the Decision record (end of file).

Compares the owner's two finalists, **Option R** ("Respectful and abstract") and **Option C** ("Combatants only"), with the dropped **civilian-impact layer** (called **Ref** here) as a reference column. Ends with a recommendation, a hybrid, content rules and a community-review list.

Inputs (read as data): `01-timeline-forces.md` (cited as [01]), `02-geography-logistics-civilian.md` (cited as [02 §n]), `../GDD.md` (cited as [GDD §n]), `../04-theme-architecture.md` (cited as [TA §n]).

Honesty notes:
- The historical research is **provisional**: mostly Wikipedia and news features read through a summarising tool [02, opening caveat]. Every fact used as an example below must be re-checked against a primary or academic source before it is printed in the game.
- Ratings such as "Low / Medium / High" are **the author's judgement**, not measurements.
- Anything not in the research files is marked **NOT RESEARCHED** and is listed for checking. Nothing here claims what a store, a reviewer or a community will actually do.

---

## 0. Summary

| | **R: Respectful and abstract** | **C: Combatants only** | Ref: civilian-impact layer |
|---|---|---|---|
| Civilians in the simulation | None | None | Yes (refugees, displacement, relief) |
| Civilians in the text | Yes: dated, sourced context lines, an encyclopedia, remembrance on menu, end screens and credits | One short remembrance note only | Yes, and they drive mechanics |
| Ruleset work | Small variant (`bd1971`) | **The same** small variant | New ruleset major version (a seventh resource or new roles; a theme cannot add them [TA §1.1]) |
| Main risk | Remembrance can feel bolted on; contested numbers | **Erasure**: a 1971 game with no civilians departs from how the war is remembered | **Trivialising**: suffering becomes something to optimise |
| Pakistan-military AI | Opponent; history text must not turn the AI into the perpetrator | Opponent; risk of a "clean war" image | Either harms civilians (a war-crime mechanic, ruled out) or does not (ahistorical) |

**Key finding.** Under this project's architecture, R and C need **the same rules**. Neither may keep civilians in the simulation, so both need the same small ruleset variant (section 3). They differ only in **theme-layer text**, which the architecture already supports (the optional "flavour almanac" slot [TA §1.6], the encyclopedia, menus). The choice is therefore cheaper and easier to reverse than it looks.

**Recommendation: the hybrid "H": C's mechanics with R's voice** (section 8). Zero civilian state in the simulation, enforced by a test (the guarantee is partly rule-level and partly text-level; see 3.1). Remembrance and sourced historical context are shown in text and are never playable. The per-turn context lines have a switch (default on); the remembrance on the menu, end screens and credits is always shown. If the owner wants a strict choice between the two finalists: **R**. C's main risk (erasure) is built into the option itself, while R's main risks can be handled with content rules.

---

## 1. The three options, defined in simulation terms

"Civilian" here means any person who is not a combatant. That covers villagers, refugees, displaced families, town residents, minorities and the dead.

| Question | R | C | Ref |
|---|---|---|---|
| Can a civilian be a unit, resource, building, NPC, target or score? | No | No | Yes (refugees, camps and relief goods are game objects) |
| Can a civilian appear in text? | Yes: remembrance, dated context lines (not affected by play), encyclopedia | Only one short remembrance note (menu or first launch) | Yes, in event text tied to player choices |
| Does the player's play change any civilian outcome? | No | No (there are none) | Yes, and this is the core of the option |
| What do map towns mean? | Place names; attackable sites are military installations. The AI's starting sites are called **garrison positions** (a proposed term, for reviewers), not towns | Same | Towns hold civilians who can be harmed or helped |

Ref is described only so the owner can compare. The research advises against its central element: "avoid a 'refugees' commodity entirely" and "do not treat civilians, refugees or the dead as a resource" [02 §4.2 Don't 1].

---

## 2. What the player sees and does: concrete examples

The labels are **illustrative**. Final names belong to the theme and the reviewers. Calendar: one turn per week from 26 March 1971 (an engine-side question about date formatting and pacing is in section 11).

### 2.1 Turn digest (the typed-event summary [TA §1.6])

**R**
```
WEEK 8 - 13 to 19 May 1971
  Sector base "Harina": recruitment centre intake +20 personnel (camp 280/300).
  Supply: rations 46 (forecast 42 next week).
  Engagement near a river crossing: your raiding group damaged 2 enemy river craft;
    your group lost 2 strength and withdrew in good order.
  Allied support: 1 equipment delivery arrives in 2 weeks.
  ---
  Historical context (does not change with play):
    By May 1971 about 100,000 people a day were reported crossing into India.
    [Encyclopedia: Refugees, sources]
```
(The context line is sourced to [02 §3.1, source 7]; it must be re-verified.)

**C**
```
WEEK 8
  Sector base "Harina": recruitment centre intake +20 personnel (camp 280/300).
  Supply: rations 46 (forecast 42 next week).
  Engagement near a river crossing: your raiding group damaged 2 enemy river craft;
    your group lost 2 strength and withdrew in good order.
  Allied support: 1 equipment delivery arrives in 2 weeks.
```

**Ref**
```
WEEK 8
  Relief: camps in Tripura at 80% shelter; medicine short (need 12, have 7).
  Displacement in Kushtia district rose; morale -5.
  ...military lines as above...
```
Ref turns a humanitarian disaster into a supply puzzle with percentages. This is exactly the "harvest" pattern the research warns against [02 §4.2 Do 2, Don't 1].

### 2.2 District / base screen (the colony screen [GDD §14.1])

**R and C (identical)**
```
SECTOR BASE: Harina          Level 2 HQ          Sector 1 area
  Personnel 240 / 300   Rations 46   Stores 31   Arms 12   Equipment 4   Funds 180
  Buildings: Sector HQ L2 | Training camp L2 | Recruitment centre L1 | Ration depot L1
             | Workshop L1 | Defensive position L1 | River landing L1
  Forecast next week: Personnel +6 (intake), Rations -4
  [Upgrade] [Build] [Personnel detail] [Trade with allied supply] [Commission commander]
```
In R, a small "About this area" link opens an encyclopedia page (sector area and geography, sourced [01 sector table]). C has no link.

**Ref** adds a "Civilians sheltered: 1,200" row and a "Relief" building. Any figure there makes people a stock.

### 2.3 Battle result (3x4 battle [GDD §11])

**R and C**
```
ENGAGEMENT RESULT - near the river crossing (game event)
  Your force: 2 line, 1 ranged, commander L2      Enemy: 3 line (Eastern Command)
  Outcome: enemy position withdrew. Parting shot: 1 strength lost.
  Your losses: 3 strength      Enemy losses: 5 strength, 1 unit surrendered
```
Losses are shown as **strength points**, never as body counts (rule 3). Battle reports never use a real named battle as their title. Real battles (Kamalpur, Hilli, Garibpur [01]) appear only in the encyclopedia, so the game never rewrites a real engagement with a fictional result.

**Ref** would add something like "Civilian harm nearby: moderate", which ties civilian harm to the player's tactical choices.

### 2.4 Losing a base and losing the game

**Losing a base, R and C:** "Base 'X' could not be held. Surviving units fell back toward the border (they reappear next week)." This uses the raid and retreat rule [GDD §11.6]. No burning-village art; the picture shows a dismantled camp.

**Losing the game:**
- **R:** "Campaign ended: your forces could no longer hold a base. This is a game outcome. In history, Eastern Command surrendered on 16 December 1971 [01]. [Try again] [Remembrance]"
- **C:** "Defeat: all sector bases lost. [Try again]"
- **Ref:** has to say what happens to the refugees in the counterfactual, which invents suffering that never happened. Avoid.

### 2.5 End screens (win)

- **R:** "Eastern Command has laid down its arms." The picture shows two delegations at a table with equal dignity, with no trampled flags. Below it, a dedication line, then "In remembrance of all who died, those who fought and those who lost their homes, 1971." [Sources] [Learn more: Liberation War Museum, Banglapedia].
- **C:** "Victory: Eastern Command has surrendered." One dedication line.
- **Ref:** "Refugees returned: 84%" turns return into a score. Avoid.

### 2.6 Main menu and first launch

- **R:** title and subtitle ("1971 - The Liberation War"), a one-line remembrance under the title, menu items New Game / Continue / Combat Practice / **Remembrance and Sources** / Options / Quit. A content note on first launch: "This game depicts military operations in the 1971 war. It does not depict violence against civilians. Historical notes with sources are included and can be shown or hidden."
- **C:** title, the same items without Remembrance and Sources, and the one short remembrance note on first launch.
- **Ref:** needs a stronger content warning, and probably an age rating question that is NOT RESEARCHED here.

### 2.7 Credits

- **R:** dedication; source list (verified sources only); "Historical review by ..." (named only with consent); thanks to institutions **only if they agreed**, and never worded as an endorsement.
- **C:** dedication line and team credits.
- **Ref:** the same as R plus humanitarian-history sources.

---

## 3. Neutral-ruleset mechanics that must change

A theme cannot change rules [TA §0, §2.4]. Everything that must behave differently goes in one ruleset variant, here called `bd1971`, with its own rules hash. **R and C use the same variant.** Ref needs a new ruleset major version, because it adds resources or roles [TA §1.1, §3.2].

| Mechanic (neutral rule) | Problem in this setting | R and C (same rule) | Ref | Variant change? |
|---|---|---|---|---|
| `res.pop`: labour, housing load and the "P" cost of units [GDD §8.5] | Read as "people", every recruit spends civilians | Reframe as **Personnel**: members of the movement (volunteers who joined) for one side, troops for the other. Never "people", "villagers" or "population". | Splits into civilians plus personnel, which is the dangerous part | Labels only, **if** the conditions in 3.1 hold (some of them in text only) |
| Natural growth 3%/turn [GDD §8.5] | "Breeding" a population | Volunteer intake by word of mouth (Bangladeshi side) or troop rotation (Pakistani side) | Civilian growth in camps | No (label) |
| `bld.attractor` (Church) immigration [GDD §8.3] | A religious building as a mechanic; religion is a minefield here [02 §4.2 Don't 6] | **Recruitment centre** (Bangladeshi side); **Reinforcement airhead** (Pakistani side, matching the airlift [02 §2.2]). No religious labels anywhere. | "Relief centre" attracting refugees | No (label); drop the `disc.remedy` boost or relabel it as a medical post |
| Starvation / emigration failure state, 5%/turn [GDD §8.5, §12] | "Starvation" is a civilian-suffering image | **Supply shortfall: volunteers go home; nobody dies.** The warning reads "Rations short: 5% of personnel will stand down next week." The rule side is only a death-neutral naming of the neutral shortage outcome (one event, e.g. `ev.pop_lost{cause: "shortage"}`, and `warn.food_shortage`); the rules cannot tell "went home" from "died", so the meaning lives in the theme text. The stand-down switch was dropped by the owner on 2026-10-03. | Famine in camps as a failure state | **Text only**; the rate is unchanged |
| `u.founder` (150 P) founds a colony | "Settling" a land that is the player's own country | **Sector group** deploys to set up a base | Same | No (label) |
| Colony = town? | Raiding or razing a town depicts destroying a town | Every attackable site is a **military installation** (base, cantonment, depot, river landing). Town names are map names only; the AI's starting sites are **garrison positions** (proposed term). | Towns hold civilians | **Yes**: a theme-and-scenario rule that sites are installations, plus rule 2 (below) |
| Raid: stockpile seizure from round 3, building loss from round 5, colony destroyed if defenders gone [GDD §11.6] | Looting and razing | Reads as **sabotage of military stores and positions**. This fits the record: bridges, rail and power were the guerrilla targets [02 §2.1]. A destroyed site becomes "position abandoned / dismantled". | Raid harms civilians | No for installations. **Yes** if any site carries a real town name: the per-site scenario flag `raid_can_destroy: false` for those sites (capture only). |
| Capture: colony "takes some damage" [GDD §11.6] | Damage to a town; and the neutral rule leaves the base's personnel count with it | "Position taken; installation damaged." Under the neutral capture rule the captured garrison's personnel count stays with the base and counts for the captor (on screen, the AI's "Personnel" become the player's "Volunteers"); the owner dropped the "personnel never change sides" switch on 2026-10-03, and theme text never narrates the transfer. In R, an optional context line can mention liberated-zone administration (Roumari, 27 Aug 1971 [01]) as history, not as an outcome of play. | Liberated civilians as a reward | No (switch dropped; text-level mitigation) |
| Militia: lost militia cost 5 population per strength point [GDD §11.6] | Civilians conscripted and killed | Bangladeshi side: **local defence volunteers** (combatants; the Gono Bahini were civilians who trained as fighters [01]); the loss shows as "−10 personnel (casualties in defence)". Pakistani side: **garrison reserve**, never named Razakar, Al-Badr or Al-Shams (rule 6). | Village militia drawn from civilians | No (label); the loss cost is acceptable because these are combatants |
| Immigration-to-housing (Farms house 40/level) | Cosmetic oddity only | Ration depots carry camp capacity | n/a | No |
| Tax: automated, 10% coin / 5% other [GDD §9, D-3] | Taxing whom? Implies levies on villagers; the exile government's funding is **unverified** [02 §2.1] | **Tax 0%** for both sides (D-3 already allows tunable to 0) | Same | **Yes** (`tax.rate = 0`) |
| Tribute (`dip.*`, deferred) [GDD §22] | Extracting from neutral settlements | **Disabled** | Same | **Yes** (hook stays off) |
| NPC settlements (`npc.settlement`) [TA §1.4] | The only "neutral locals" are civilians | **0 per map** (a match setting) | Villages as relation-bearing NPCs | Settings (0), locked by the scenario |
| Victory points for combat damage (deferred, D-1) [GDD §12] | Score rises with killing | If points are restored: points for ground held, sabotage and time; **none for damage dealt** | Points for civilians protected (prices lives) | **Yes**, when scoring is added |
| Elimination = no colony and no founder [GDD §12] | Annihilation of the opponent | Shown as **surrender**; the mechanic is unchanged | Same | No (text) |
| Patron (Mother Country) [TA P-3] | Who is the patron? | Bangladeshi side: Mujibnagar government and allied (Indian) support [02 §2.1]. Pakistani side: GHQ in the west, with the airlift over a long detour [02 §2.2]. | Same | No (labels); archetype fit is a rules question outside this document |

### 3.1 Can "population" be reframed without treating civilians as a resource?

**Partly by rule, partly in text.** The reframing holds only while every condition below holds. Since the owner dropped two rule-level switches on 2026-10-03 (stand-down on food shortage; personnel never change sides on capture), the five conditions no longer all hold in the rules. The table says which is which.

| # | Condition | Where it holds |
|---|---|---|
| 1 | **No conversion from a civilian pool.** Personnel enter only through recruitment-centre intake and growth rates, never by being "drawn from" a district's inhabitants. No district stat for "people available to recruit". | **Rule-level, tested.** No civilian state fields, events or resources (allow-list test and forbidden-token scan [06 §5]). |
| 2 | **Losses only from fighting or the shortage rate.** No event reduces personnel because of reprisals, famine or displacement. | **Rule-level, tested** for the possible causes of a decrease (accounting check [06 §5, check 7]). What the shortage loss *means* is condition 3. |
| 3 | **Shortfall means volunteers go home, not death.** | **Text-level only.** The neutral rule is "emigrate or starve"; the rules cannot tell the two apart. Held by the theme's shortage wording (V-04) and the death-neutral event naming. |
| 4 | **Labels never say people, villagers, population or refugees.** "Personnel", "volunteers", "troops" only. | **Text-level, validated** by the theme validators (V-04, V-05). |
| 5 | **Both sides use the same treatment; personnel never change sides.** Nobody on either side draws on civilians. | **Partly text-level.** Both sides use the same neutral rules, but on capture the base's personnel count stays with it, so captured AI personnel become the player's volunteers. The rules no longer prevent this; theme text never narrates it (V-21). |

**Residual risk (a risk, not a veto).** The "no civilian state" core and conditions 1 and 2 are enforced by rule and test. Conditions 3 and 5 depend on text. A reviewer can fairly say the rules alone do not exclude "volunteers who died of hunger" or "opposing troops who joined the movement". So "civilians are never spent or lost as a resource" holds by rule for state and events, and by wording for what shortage and capture mean. Text can drift: a careless edit (for example "nobody was harmed") would promise something the rules cannot back. The mitigation needs review by a Bangladeshi historian (Decision record).

One unavoidable honesty point: real recruits came from the civilian population [01, Gono Bahini]. The encyclopedia (R) can say so. The simulation should not model it, because modelling it is the step that makes civilians a resource.

---

## 4. Risks and which option mitigates which

Ratings are judgement (L = low, M = medium, H = high). "Mitigation" names the rule numbers in section 9.

| Risk | R | C | Ref | Notes and mitigation |
|---|---|---|---|---|
| **Trivialising suffering** (suffering as numbers, puzzles or rewards) | L | L | **H** | R and C keep suffering out of play. R's context lines must stay plain, sourced and non-graphic (rules 5, 7, 10). Ref cannot avoid the problem: a relief economy prices lives. |
| **Erasure** (omitting the human story) | L-M | **H** | L | The memorial framing puts civilians and refugees beside the fighters (section 5). C leaves them out entirely. R carries them in text; the risk is that text next to gameplay feels "bolted on" (mitigation: few, short, dated lines; strong end screen; switch for per-turn lines only). |
| **Inaccurate framing: numbers** | M | L | H | The death toll ranges from 26,000 to 3,000,000 by source [02 §3.2]. R shows attributed ranges in the encyclopedia only (rule 5). Note: a range can itself offend readers for whom 3 million is settled [02 §3.2: "embedded in Bangladeshi culture"]. This needs a community reviewer, not a rule. |
| **Inaccurate framing: religion** | M | L | H | 80-90% of refugees were reported as Hindu [02 §3.1], but the museum frames the movement as linguistic and political with a secular outlook [02 §4.2 Don't 6]. R must not reduce the war to a religious conflict (rule 8). Ref almost forces it (refugee composition). |
| **Inaccurate framing: politics inside Bangladesh** | M | M | M | The declaration date and credit (26 March vs Major Zia's 27 March broadcast [01]) is listed as contested; who is credited is **politically sensitive in Bangladesh** (NOT RESEARCHED here, general knowledge; needs a reviewer). The Mujib Bahini's role is contested [01]. Affects every option, R most because it has more text. |
| **Inaccurate framing: India's role** | L-M | L-M | M | Research says to make Indian support visible [02 §4.2 Do 5]; showing it as decisive or as marginal could each offend. Patron labels and the encyclopedia need review. |
| **Offending Bangladeshi audiences** | L-M | **M-H** | M-H | C: perceived sanitising. Ref: suffering as game material. R: wording of numbers and political credit. |
| **Offending Pakistani audiences** | M | L-M | **H** | R's history text describes the Pakistani military's actions (Operation Searchlight [01]); it must be attributed and sourced, and it must separate command decisions from individual soldiers [02 §4.2 Do 6]. Ref would have the AI harm civilians or be sanitised (section 6). The Hamoodur Rahman Commission's 26,000 figure [02 §3.2] shows that official accounts diverge widely. |
| **Offending minorities** (Hindu community; Urdu-speaking "Bihari" community) | L-M | L | H | Al-Badr is described as linked to Biharis [01]; never generalise from that to a community. Bengali minorities and Pakistani civilians are never enemies [02 §4.2 Do 6] (rule 6). |
| **Reviewer reaction** (press and players) | M | M | H | Judgement only: an operational wargame without civilians is a common, accepted form, but for a war remembered chiefly as a genocide [02 §3.3] a reviewer may call C evasive. R gives the reviewer something to point to. Ref invites "atrocity tycoon" headlines. |
| **Platform and store reaction** | L | L | M | NOT RESEARCHED: current store content policies and age-rating questionnaires. Historical war games are common; a civilian-suffering mechanic is the element most likely to raise flags. Check before submission. |
| **Legal (Bangladesh)** | ? | ? | ? | NOT RESEARCHED: whether Bangladeshi law restricts "distortion" of Liberation War history. Ask a Bangladeshi legal reviewer before release in Bangladesh. |

---

## 5. Historical integrity: how memorial institutions present the war

From the research file only [02 §3.3, §4.1]. **Only the Liberation War Museum (Dhaka) was researched**; other memorials and Pakistani or Indian institutions were not.

- **Founding and form:** a citizens' initiative founded 22 March 1996 with crowd-funded donations; new building 2017; about 21,000 objects [02 §3.3].
- **What the galleries cover, in order:** early history, the Bengali Language Movement, the March 1971 non-cooperation movement, the genocide and resistance, the declaration of independence, **refugees**, and the Mukti Bahini [02 §3.3]. Civilians and fighters are presented together, and the story starts before the shooting war.
- **Mission:** dedicated to freedom-loving people and to victims of atrocities "committed in the name of religion, ethnicity and sovereignty" (museum mission statement, via [02 §3.3]); it links history to present human rights and remembrance across religious and ethnic lines [02 §3.3].
- **Teaching:** school programmes and travelling exhibits across 64 districts; it teaches opposing atrocity everywhere, not only commemorating one side [02 §3.3, §4.1].
- **Its own framing:** "the worst genocide since the Second World War" (the museum's framing, not settled scholarship); it exhibits excavated remains [02 §3.3]. 14 December is the Day of the Martyred Intellectuals [02 §3.3].
- **What respected sources emphasise** (research synthesis [02 §4.1]): dignity of victims across religious and ethnic lines; language-movement roots; the sacrifice of civilians **and** fighters; the refugee experience; the international humanitarian response; honest uncertainty, with sources stated.

What this means for the options:
- **C departs most** from the institutional framing. The museum treats the refugees and the genocide as central, and C treats them as absent. A remembrance note mitigates this only a little.
- **R matches the framing in its text layer**: it can include the language movement, the non-cooperation movement, refugees and the international response as dated, sourced context, and it can follow the museum's habit of stating sources.
- **Ref matches the subject matter but not the form.** A museum shows; a mechanic makes the player *manage*. Nothing in the research suggests that memorial institutions endorse interactive management of victims.
- The research supports **opening chapters** on the language movement and the March non-cooperation movement [02 §4.2 Do 7]. That is a natural R or hybrid item (a short prologue in the encyclopedia or the tutorial).

---

## 6. Effect on the Pakistan-military AI side

Shared principle: the AI is a **professional military opponent**, not a villain. War crimes are never a mechanic, an AI behaviour or an AI "event".

| Aspect | R | C | Ref |
|---|---|---|---|
| What the AI can do | Military actions only (move, attack installations, raid stores, hold positions) | Same | Either it affects civilians (forbidden: an atrocity mechanic) or it never does (ahistorical, given the research [01, 02 §3]) |
| Main risk | Players read history text ("Operation Searchlight began on 25-26 March" [01]) as describing the AI's own conduct, so the AI becomes the perpetrator in the player's mind | A "clean war": the opponent looks like any army, which some will read as laundering | No acceptable design exists |
| Mitigation | History text lives in the encyclopedia and dated context lines, attributed to the historical command with sources, never written as "the enemy did X this turn". AI turn reports use neutral military language. | Rely on the one remembrance note, and accept the residual risk | n/a |

Humanising without whitewashing (all options):
- **Doctrine as AI personality.** The AI can play the documented doctrine: "the defence of the east lies in the west", then Niazi's "fortress concept" of holding key cities with fallback lines (September-October 1971) [02 §1.5]. A coherent professional strategy humanises the side better than any flavour text.
- **Same mechanics as the player.** Morale, panic and retreat [GDD §11.5], healing and surrender apply to the AI exactly as to the player. Its units get the same art quality.
- **Surrender, not annihilation.** The end state is surrender; about 90,000 to 93,000 prisoners are recorded [01] (the split between military and civilian is disputed [02 §6]). Nothing depicts mistreatment of prisoners.
- **Names.** Use regular formation and branch names (infantry, armour, the M24 Chaffee tanks, river gunboats [01]). Composite fictional commanders; real officers (Niazi) only as an accurate cameo, if at all [02 §4.2 Don't 8]. **Razakar, Al-Badr and Al-Shams are never playable or generated units**; the research describes them as taking part in massacres and political killings [01]. They appear only in the encyclopedia, factually.
- **Logistics as the AI's story.** Isolation by distance, the overflight detour, the naval blockade [02 §2.2] are honest, non-moral reasons for the AI's late-game weakness.

---

## 7. Replayability and fun, honestly

- **R and C play identically.** Same rules, same AI, same maps. Neither changes replayability. Replay value comes from seeds, AI difficulty and scenario variety.
- **R costs a little pace.** The context lines add one or two lines per turn. With a switch for the per-turn lines (default on), players who want pure operations lose nothing.
- **R adds meaning, not mechanics.** The encyclopedia and dated context give the campaign an arc (language movement, then the March crackdown, then the monsoon guerrilla war, then December). Players who care about history will value it; the rest can ignore it.
- **Ref adds real decision depth** (fight or protect, relief logistics). Honestly, that is the most "gamey" option. But every trade-off between military gain and civilian welfare **sets a price on lives**, and players optimise prices. That is why the extra depth is not worth having here.
- **The bigger fun risk is not sensitivity.** The base ruleset is a colonial settlement economy [GDD §1.1]. Founding colonies, mining gold and building churches map awkwardly onto a liberation war of guerrillas, sabotage and river operations [02 §1.5, §2.1]. The labels in section 3 make it workable. Whether it is *fun* depends on scenario design (river raids, monsoon timing, the December offensive), not on R versus C.

---

## 8. Recommendation

### 8.1 Hybrid "H": C's mechanics with R's voice (recommended)

- **Simulation (from C, made strict):** zero civilian state. No role, resource, NPC, event payload or score refers to civilians. A CI test enforces this with an allow-list over the `bd1971` ruleset and event schemas, in the same spirit as the existing "theme has no rules" test [TA §2.10]. This is the rule-level part of the guarantee. Two promises are **not** rule-level (owner decision, 2026-10-03): that a shortage means volunteers go home (nobody dies), and that personnel never change sides on capture. They hold in the theme text (3.1).
- **Presentation (from R):**
  - always on: the first-launch content note, the remembrance line on the menu, the dignified end screens, and credits with sources;
  - default on, can be switched off: dated historical context lines in the digest (the existing optional almanac slot [TA §1.6], so no rules change), each linking to a sourced encyclopedia entry;
  - always available: the encyclopedia, including the language movement and non-cooperation prologue, refugees and international relief, and the contested ranges with who claims what.

**Why:** the mechanical part of the guarantee (no civilian state) removes the trivialising risk by construction, and a test can prove it; the text-level part leaves the residual risk stated in 3.1, which review must cover. The text layer removes the main weakness of C (erasure) and matches how the Liberation War Museum presents the war (section 5). The two layers are separate in the architecture, so reviewers can change the wording without touching the rules or the balance.

### 8.2 If the choice must be strictly R or C

**R.** Its risks (contested numbers, political wording, text feeling bolted on) are manageable with rules and review. C's main risk, erasure, is built into C, and nothing can mitigate it except adding text, which turns C into R.

### 8.3 When C would be the better pick

If the owner cannot get a Bangladeshi historical reviewer before release (section 10), C is **safer than an unreviewed R**: less text means fewer chances to get a contested fact or a political credit wrong. In that case ship C with the one remembrance note, and add R's text layer in an update after review. The architecture allows that without touching saves or rules [TA §3.5].

---

## 9. Content rules for the chosen option (written for H; they apply to R and C as well)

1. **Zero civilian state.** The ruleset, the events and the scores contain nothing that represents civilians. A CI allow-list test fails on any new role, resource, NPC type or event payload field that is not on the list.
2. **Only installations are targets.** Every attackable site is a military installation (base, cantonment, depot, river landing, bridge). Town names are locations, not targets. A site named after a real town can be captured but never destroyed (per-site flag `raid_can_destroy: false`). The AI's starting sites are called garrison positions (proposed term). Raid text always reads as sabotage of military stores.
3. **No body counts and no kill scores.** Losses are shown as strength points or units. No score, achievement, sound or effect rewards damage or kills. If victory points return, they come from ground held, sabotage and time.
4. **Personnel, not people.** `res.pop` is labelled Personnel / volunteers / troops on both sides. Intake comes only from recruitment centres and growth. Since 2026-10-03 (owner's choice) this rule is partly rule-level and partly text-level. By rule: no civilian state, no civilian pool, no reprisal- or famine-like decrease (conditions 1 and 2 in 3.1). In text: a shortage means volunteers go home and nobody dies, shortage wording adds no claim the rules cannot back (no "nobody was harmed"), and capture text says nothing about where personnel go (conditions 3 to 5 in 3.1). Residual risk: the rules cannot tell "went home" from "died", and captured AI personnel become the player's volunteers. The wording is validated (V-04, V-05, V-21) and reviewed by a Bangladeshi historian.
5. **Numbers are attributed ranges.** Contested figures (deaths, refugees, force sizes, ships sunk) appear only in the encyclopedia, as ranges with who claims what [02 §3.2, §6]. They never appear as one number in the game interface. Every printed fact is checked against a non-Wikipedia source before release, and the source list ships with the game.
6. **The opponent is human.** Regular military names, the same art quality, the same morale and surrender rules as the player. No slurs, caricature or ethnic or religious stereotypes. Razakar, Al-Badr and Al-Shams appear only in factual encyclopedia text. Pakistani civilians, Urdu-speaking communities and Bengali minorities are never shown as enemies.
7. **Atrocity is history, never play.** Atrocities, massacres and sexual violence are never a mechanic, event card, AI action, achievement or digest event. They are mentioned only in remembrance and encyclopedia text: plain, non-graphic, sourced and attributed to the historical command. Sexual violence is not depicted at all; at most the contested range is named in the encyclopedia [02 §3.2].
8. **No religious framing.** No religious labels on buildings, units or factions. The war is framed as a linguistic and political movement, as the museum frames it [02 §4.2 Don't 6]. Refugee composition is stated only in the encyclopedia, with its source.
9. **Real people.** Commanders are composite and fictional. Real leaders appear only in accurate, respectful cameos checked by a reviewer. No real victims' names, faces or photographs [02 §4.2 Don't 7, 8].
10. **Tone.** No jokes, gore, loot boxes, monetisation or celebratory effects around death. The win screen shows a dignified surrender with no humiliation. Music and sound are restrained.
11. **Defeat is a game outcome.** Loss screens never narrate counterfactual suffering. R and H add a factual note on the historical outcome.
12. **Point to the source, never claim endorsement.** A "learn more" link goes to the Liberation War Museum and Banglapedia. No institution is named as a partner or endorser without written agreement.

---

## 10. Items that need review by someone from the community before release

Reviewers wanted (at least the first two):
- a **Bangladeshi historian** of the Liberation War;
- a **Bangla-speaking sensitivity reader** (language and political wording);
- a reviewer from the **Bangladeshi Hindu community** (refugee framing);
- a reviewer from the **Urdu-speaking ("Bihari") community** in Bangladesh;
- a **Pakistani** reviewer (portrayal of soldiers and the command);
- optionally an **Indian military-history** reviewer (allied-support framing);
- a **legal** check for release in Bangladesh (NOT RESEARCHED).

Items to review:
0. The text-level mitigation for shortage and capture (3.1, content rule 4): shortage warning and resolution wording, capture templates, and the encyclopedia limits entry. Reviewer: a Bangladeshi historian (first in the list above).
1. The remembrance line, the first-launch content note and the end-screen dedication (exact wording, in English and Bangla).
2. Every encyclopedia entry with a contested figure: the death-toll ranges, refugee numbers and religious composition, sexual-violence wording, prisoner counts [02 §3.2, §6].
3. How the declaration of independence is described and credited (26 March vs the 27 March broadcast [01]); this is politically sensitive (NOT RESEARCHED in depth).
4. Real leaders shown or named (Sheikh Mujibur Rahman, Tajuddin Ahmad, Osmani, Ziaur Rahman, Niazi, Aurora [01, 02 §2.1]), if any.
5. Names and portrayal of the Pakistani side: unit labels, the AI's turn-report wording, the surrender picture.
6. The patron and allied-support wording (Mujibnagar government and India).
7. Place names: period spellings vs present-day ones (Dacca/Dhaka, Chittagong/Chattogram [02 §5]) and transliteration of Bengali terms in the glossary [01].
8. Slogans and symbols: the use of "Joy Bangla" (marked unconfirmed in [01]; its present-day political associations are NOT RESEARCHED); the 1971 flag design versus today's (NOT RESEARCHED; verify before drawing any flag).
9. Music: any use of Swadhin Bangla Betar Kendra songs or the national anthem (sensitivity and copyright; NOT RESEARCHED).
10. The prologue chapters (language movement, March non-cooperation movement) and the dated context lines, checked line by line for accuracy.
11. Art: base, camp and surrender pictures; confirm that nothing shows civilians, destroyed villages or victims.
12. Store descriptions, trailer and screenshots (marketing text is where trivialising language most often slips in).

---

## 11. Open questions (not sensitivity decisions, but they affect it)

- **Calendar and pacing:** one week per turn gives about 38 turns from 26 March to 16 December, but the neutral pacing targets assume a game of 80-150 turns [GDD §4]. Half-week turns or a scenario-specific pacing are both possible. The theme calendar format currently supports only `start + step` numbers [TA §2.8]; showing dates needs a presentation-only extension.
- **Archetypes:** which archetype each side uses is a rules question outside this file. One example: the indigenous archetype cannot field ranged units [TA §2.3], yet Z Force had an artillery battery [01].
- **Indian forces after 3 December** [01]: are they a patron, scripted arrivals or a third faction? A third faction is a large change in scope and in sensitivity.
- **Sources:** before any text ships, replace the Wikipedia-based facts with Banglapedia, the Liberation War Museum, FRUS volume XI or academic works, as both research files ask [01, 02].

---

## Decision record

- **2026-10-03, owner's choice: Hybrid H stands** (C's mechanics with R's voice; section 8.1).
- **2026-10-03, owner's choice: two rule-level switches dropped:** stand-down on food shortage, and personnel never change sides on capture. The neutral shortage and capture rules apply unchanged. "Civilians are never spent or lost as a resource" holds partly by rule (no civilian state fields, events or resources, enforced by the allow-list test) and partly in text (shortage means volunteers go home, nobody dies; captured personnel become the player's volunteers under the neutral capture rule). The residual risk is stated in 3.1 as a risk, not a veto. The owner may restore either switch later as a ruleset minor version [06 R-7].
- **2026-10-03, owner's choice: rename.** The AI's starting sites are no longer called "towns" in this project; the term **garrison positions** is used (a proposed term, for reviewers to confirm). Real town names remain place names.
- **Reviewer item:** the text-level mitigation (shortage wording, capture wording, the `limits` encyclopedia entry) needs review by a **Bangladeshi historian** before release (section 10, item 0).

## Change log (second pass)

Applied:
1. Header status line; section 0 recommendation (guarantee is partly rule-level, partly text-level).
2. Section 1 table row on towns: AI starting sites are "garrison positions".
3. Section 3 table: reframing row, shortage row (death-neutral naming only, meaning in text), site row, raid row (per-site `raid_can_destroy: false` replaces the old switch name, per 09 S8), capture row (personnel count stays with the base).
4. Section 3.1 rewritten: the "all five conditions hold" claim replaced by a per-condition table (rule-level or text-level) and a plain residual-risk paragraph.
5. Section 8.1 and its "Why" line; content rule 2 (flag name, garrison positions); content rule 4 rewritten (no longer says all five conditions hold).
6. Section 10: new item 0 (Bangladeshi historian reviews the text-level mitigation).
7. Added the Decision record and this change log.

Not applied, and why:
- Section 2 worked examples: they contain no shortage or capture text and no AI "towns", so nothing depended on the dropped switches.
- Sections 4, 6, 7: no statement relied on the switches; remaining uses of "town" are real places or history and were kept as place names.
- I read only the relevant parts of 12 and 09 (notes S8 and section C.1); section references to 06 are written as "06 §5" per the errata, since 06 is being edited in parallel and its numbering was not rechecked.
