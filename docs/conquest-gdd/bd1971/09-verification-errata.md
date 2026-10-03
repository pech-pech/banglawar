# 09 - Verification errata and consistency report for 05 (theme pack) and 06 (variant and hooks)

Status: independent verifier's report, 2026-10-03. **Nothing in 05 or 06 has been edited**; every correction below is a proposal for the spec authors and the owner.
Inputs read as data: [GDD](../GDD.md), [04-theme-architecture](../04-theme-architecture.md) (TA), [01](01-timeline-forces.md), [02](02-geography-logistics-civilian.md), [03](03-role-mapping-options.md), [04-sensitivity](04-sensitivity-comparison.md) (SC), [05](05-theme-pack-spec.md), [06](06-variant-and-hooks-spec.md), [07a](07a-verify-dates-sectors.md), [07b](07b-verify-forces-arms-funding.md), [07c](07c-verify-terms-geography.md). No `08-map-draft.md` was present.

Citation form in this file: `07a#n` = source n in 07a; `07b[n]` = source n in 07b; `07c#n` = source n in 07c. `05 §x` / `06 §x` = section of the spec under review. No new web research was done for this report: it checks 05 and 06 against 07a-07c, against the owner's decisions and against arithmetic I re-ran myself.

Verdict words: **CONTRADICTED** (07 says otherwise: must change), **PARTLY** (needs a correction or a hedge), **UPGRADE** (07 now supports something 05/06 marked weaker), **OK** (checked, no change).

---

## 0. Summary

- **Eight P0 fixes** (section F) block a build: (1) the two specs disagree on season ids and on the first wet-season turn (05: `monsoon` from turn 23; 06: `season.wet` from turn 22); (2) the theme's event keys (`ev.patron_link_cut`, `ev.victory_surrender`, `ev.deadline_draw`, `ev.defeat_scattered`, `ev.season_change`) do not match the event ids 06 actually emits, and 06's own new events and errors have no theme text, so coverage check V-11 fails; (3) the dropped switches and (4) the new loss rule must be written into both specs (06 R-11's own suggested fix would reintroduce an instant loss); (5) the fortress-town list is wrong (07a), which changes the surrender test's K and the goal text; (6) four validators in 05 (V-06, V-07, V-15, V-18) reject the pack's own correct text; (7) Z/S/K Force labels are commanders' initials (07a), which breaks the naming rule; (8) the bundle preset asks for `bd1971@1` but the variant is version `0.1.0`.
- **Calendar arithmetic is right in both specs** for turns 0, 22, 23, 62, 63, 84 and 88 and for `max_turns = 89`. It is **wrong** in 05's monsoon digest example (turn 40 is 24-26 July, not 23-25 July) and in one almanac date label (turn 12 is 1-3 May, not "late April").
- **Dropping the two switches does not break the "no civilian state" guarantee** (neither switch adds or removes civilian state), but it moves two promises from the rules to the text: "a shortage means people go home, nobody dies" and "personnel never change sides on capture". Section C gives the exact edits and a minimal, honest test that still holds.
- **Contradicted facts** in 05/06 text: the radio's move (it went to Calcutta on 25 May; 6 December is a rename), the highest point (Saka Haphong, about 1,050 m; 986 m is Keokradong), "April-October" as the monsoon, "300 extra navigable channels", a 4 April or 11 July Commander-in-Chief date, the Eastern Command 350,000-365,000 figure, Calcutta arms purchases, Chittagong as a fortress town, and the Z Force artillery battery attribution.
- **Asset statements are now provisional throughout** (owner reopened the art question). The *content* rules about what any picture may show (no civilians, no protected emblems, no real flag without review) stay binding whatever the production method.

---

## A. Fact accuracy: 05 and 06 against 07a, 07b, 07c

### A.1 Dates and chronology

| # | Where (spec, section, key) | Current text (short) | Verdict | Corrected text | Sources |
|---|---|---|---|---|---|
| A1 | 05 §10.3 F-2; 06 §7.3 row 2 ("Osmani") | Commander-in-Chief date "4 April vs 11 July" | CONTRADICTED | "The forces' commander was chosen at the Teliapara meeting on 9 April 1971, took command on 12 April, and took office as Commander-in-Chief with the provisional government on 17 April. The 11-17 July meeting was the first sector commanders' conference, which set the 11-sector structure; it was not the first appointment." No person named in game text. | 07a#8, #9, #1 |
| A2 | 05 §6.3 turn 36; §6.2 entry 9 | "mid-July ... commanders' conference" (10/11-17 July) | OK, with sharper dates | Keep "mid-July". Note for the entry: "11 to 17 July (one source says 12 to 17 July)". | 07a#1, #9, #16, #6 |
| A3 | 05 §6.3 turn 80; §6.2 entry 17; §10.3 F-3; 06 §4 timed-effect `_note`, §7.3 row 2 | Joint Command "21 November or 4 December" | PARTLY (still unresolved) | Turn 80 line: "21 November is observed in Bangladesh as Armed Forces Day, when the army, navy and air force began coordinated operations." New turn-84 line or `india` entry sentence: "Bangladeshi sources date the formal joint command of Indian and Bangladesh forces to 4 December." Status stays CONTESTED. **06:** remove "the joint-command date is contested" from the `te.link_cut` note; the effect models the open state war and blockade, anchored on 3 December (turn 84). 4 December is also turn 84, so only the 21 November reading would move anything, and it is not what the effect represents. | 07a#10, #11, #12, #27, #1 |
| A4 | 05 §6.3 turn 34, turns 63-67; §6.2 entry 7; §2.3 `u.ranged`; 06 §4 arrivals turns 34/63/67, §7.3 rows 2-3 | "The first regular brigade, Z Force, was formed"; "S Force and K Force joined Z Force" | UPGRADE for months; **names must go** | Months now VERIFIED: first brigade July (7 July single-source), second October (1 October single-source), third October (14 October partly). The letters Z, S, K are the **initials of the real commanders** (Banglapedia via search summary, Daily Star, Wikipedia). Under the naming rule (05 §0) the labels identify real people. Turn 34: "In July the first regular brigade of the Bangladesh Forces was formed." Turns 63-67: "In October two more regular brigades were formed." Brigade arrivals in 06 stay labelled "first / second / third regular brigade". The `forces.regular` entry may say, reviewer-gated, "the brigades were known by the initial of their commanders' names". | 07a#13, #14, #15, #16, #1 |
| A5 | 06 §4 arrival turn 34 uses `entry.east` | First brigade enters from the east | PARTLY | 07a gives the first brigade's HQ at Teldhala near Tura, Meghalaya, on the **northern** border. Move the turn-34 arrival to the north group. The areas of the second and third brigades are not in the 07 files; keep them PLACEHOLDER. | 07a#13 |
| A6 | 05 §2.3 `u.ranged` rationale | "A Z Force artillery battery existed [T10]" | CONTRADICTED as attributed | 07a lists a field artillery battery with **K Force** (the third brigade); 07b did not re-check the Z Force claim. Rationale: "One regular brigade had a field artillery battery (unverified detail); the label stays generic." | 07a#14, #1, #12; 07b item 2 |
| A7 | 05 §6.2 entry 15; §6.3 turn 51; §2.3 `u.founder`; §10.3 F-5; 06 §7.3 row 4 | "Z Force set up the first civil administration at Roumari, 27 August" | PARTLY | Day is 27 or 28 August; "first in a liberated area" is the brigade's own account. Text: "In August 1971, in liberated Roumari, a regular brigade and local citizens set up a civil committee, a hospital, post office, police station and customs post." Turn 51 (26-28 August) covers both days, so the turn is right; drop the day from the text and the date column. | 07a#13, #20, #30 |
| A8 | 05 §6.3 turn 0 (second line); §6.2 entry 5; V-15 | "26 March is observed as Independence Day. A declaration was also broadcast ... on 27 March." | PARTLY | 07a: the world press reported independence mainly from **26 March** Kalurghat broadcasts; a further broadcast was read on **27 March** on the leader's behalf; more followed 28-30 March. Line: "26 March is observed as Independence Day. The declaration was spread by radio from Kalurghat, near Chittagong, on 26 and 27 March." No person credited; credit wording stays reviewer-gated (politically sensitive). | 07a#19, #21, #9 |
| A9 | 05 §6.3 turn 84; §4.4; 06 timed effect | 3 December, open war | PARTLY (secondary sources only) | Keep the date. Add to `battles`/`india`: "Border fighting began earlier, in late November." Status "VERIFIED" → "PARTLY (secondary sources)". | 07a#9, #6, #24 |
| A10 | 05 §6.3 turn 88, end screens | 16 December surrender in Dhaka | OK | Victory Day. | 07a#11, #17, #27 |
| A11 | 05 §6.3 turn 5, turn 7; §6.2 entry 6 | Proclamation 10 April; oath 17 April at Baidyanathtala "in Kushtia district" | OK; one precision | Turn 7: "... at Baidyanathtala, renamed Mujibnagar, in the then Kushtia district (now Meherpur), on the Indian border." | 07a#17, #18; 07c#12 |
| A12 | 05 §6.2 entry 10; §6.3 turn 2; §2.2 `bld.attractor` rationale; §10.3 F-6 | Radio "moved to Agartala on 3 April ... until 6 December"; "one transmitter, moved once" | CONTRADICTED | Entry: "The station's first broadcasts came from Kalurghat, near Chittagong, on 26-27 March. After an air attack on 30 March it moved to Tripura, near Agartala, from 3 April (one account: 8 April), and on 25 May to Calcutta, where it broadcast for the rest of the war in Bengali, English and Urdu. It was renamed Bangladesh Betar on 6 December." Turn 2 line: "After an air attack on its first transmitter, the radio station moved across the border to Tripura." Add a **turn 20** line (25-27 May): "The radio station moved to Calcutta." Rationale in §2.2: "the real station moved twice (Kalurghat, Tripura, Calcutta)". Also note the early name "Swadhin Bangla Biplobi Betar Kendra" (07c) and that one source gives 3 April as the first organised broadcast: the start date stays reviewer-gated. | 07b[27]-[31]; 07c#13 |
| A13 | 05 §6.2 entry 13; §6.3 turn 47 | Operation Jackpot mid-August; Plassey | OK; add detail | "Training began about 21 May at Plassey; the main attacks were on the night of 14-15 August (16 August in another account)." Plassey is now two sources (file 02 and the Daily Star): upgrade the Plassey edge label to VERIFIED. | 07b[32], [33], [12] |
| A14 | 05 §6.3 turn 62; entry 14 | Kilo Flight formed 28 September at Dimapur | Not re-checked | Stays UNVERIFIED. Note: its aircraft were **donated** by Indian authorities (07b), which also kills the "bought aircraft" claim (A21). | 07b[12] |
| A15 | 05 §6.3 turns 85, 87 | Jessore first liberated 6 December; 14 December Martyred Intellectuals | Not re-checked | Stay UNVERIFIED (single source). | - |

### A.2 Sectors, places, geography

| # | Where | Current | Verdict | Corrected text | Sources |
|---|---|---|---|---|---|
| A16 | 05 §5 `ui.sector.2` | "Dhaka, Comilla, Faridpur, part of Noakhali" | PARTLY | "Sector 2: Dhaka, Comilla, Faridpur, Feni, part of Noakhali" | 07a#3, #4, #5 |
| A17 | 05 §5 `ui.sector.3`; §7.2 | "Sylhet area to Brahmanbaria" | PARTLY | "Sector 3: Sylhet to Brahmanbaria, with parts of northern Dhaka (Narsingdi, Gazipur)" | 07a#3, #4, #5 |
| A18 | 05 §5 `ui.sector.5` | "Durgapur to Dawki, eastern Sylhet" | PARTLY | "Sector 5: Durgapur to Dawki, Sunamganj and the Surma" | 07a#3, #4, #5 |
| A19 | 05 §5 `ui.sector.8`, `ui.sector.9`; §7.2 | Sector 8 "Kushtia, Jessore, Khulna, Satkhira"; sector 9 as fixed | PARTLY | "Sector 8: Kushtia, Jessore, Khulna, Satkhira, northern Faridpur". Encyclopedia `sectors`: "Sector boundaries changed during the war: the first sector 8 area (Barisal, Faridpur, Patuakhali) was later split, and sector 9 was formed from it." Sector 7 may add Naogaon, Natore, Sirajganj; sector 11: "Mymensingh, Tangail and the Jamuna" (the "parts of Rangpur and Gaibandha" wording is single-source). No HQ names, no sub-sector counts (07a: counts disagree for sectors 2, 5, 6; if a count is ever wanted, say "5 to 10"). | 07a#3, #4, #5, #6 |
| A20 | 05 §2.4 `t.peak` rationale; §6.2 entry 24 | "The highest point is 986 m" | CONTRADICTED | "The highest point, Saka Haphong in the Mowdok range, is about 1,050 m (1,052 m from SRTM; 1,063 m also published). Keokradong, about 986 m, is better known but not the highest." "High hills" stays the right label. | 07c#23, #24, #21, #22 |
| A21 | 05 §4.3; §6.2 entry 24; 06 §4 `_season_note`; 05 §10.3 F-11 | Monsoon "June-September vs April-October"; "about 300 extra navigable channels" | CONTRADICTED (April-October as the monsoon; "300 channels") | Climate monsoon June-September is VERIFIED; roughly 70-80% of annual rain. April-October is the looser rainy and flood season quoted only on the Operation Jackpot page. Onset about 10 June in the south-east, withdrawal about 20 October on average (30-year study). Entry text: "The monsoon runs from about June to September and brings roughly 70 to 80 per cent of the year's rain; the wider rainy and flood season runs roughly April to October, and the north-eastern haors stay flooded from about July to November." Delete "300 extra navigable channels" everywhere; the real "300" is a study's count of more than 300 guerrilla operations on rivers (single source). 06: delete "The alternative April-October reading gives wet = turns 2-73". | 07c#14-#19, #18, #20, #10 |
| A22 | 05 §4.3 "Dry season" label for turns 63-88 | "Dry season" 1 October-17 December | PARTLY | October-November is post-monsoon, December-February the dry winter; haors are flooded until about November. Label: "After the rains" (or keep "Dry season" with help text "a simplification: October and November are post-monsoon"). | 07c#14, #10 |
| A23 | 05 §7.3 Hilli row | "Hilli, border fort label" | PARTLY | "Hili (Hilli in war literature): border town in Dinajpur District, Rajshahi Division in 1971 (Rangpur Division today)." Not a fort. | 07c#27 |
| A24 | 05 §7.3 Bhairab row | "Bhairab / Ashuganj label (rail bridge)" | PARTLY, and now a fortress town (A27) | "Bhairab Bazar (Kishoreganj District, Dhaka Division) and Ashuganj (Brahmanbaria District) face each other across the Meghna, linked by the Bhairab rail bridge." Bhairab Bazar becomes an AI garrison site, not only a label. | 07c#28; 07a#23, #24 |
| A25 | 05 §7.3 Mujibnagar, Hardinge rows | as listed | OK with notes | Mujibnagar: "then Kushtia, now Meherpur". Hardinge Bridge: "spans the Padma between Pabna (Ishwardi) and Kushtia (Bheramara)". | 07c#12, #25 |
| A26 | 05 throughout (Dhaka, Chittagong, Comilla, Jessore, Bogra) | Present-day spellings mixed with period ones | PARTLY (owner choice) | 07c recommends period spellings (Dacca, Chittagong, Comilla, Jessore, Bogra) with today's name beside them in the encyclopedia, and says Rangpur, Sylhet, Mymensingh and Barisal **divisions** did not exist in 1971. Decide once; then fix `names/garrisons.json`, the gazetteer and `brief.goal`. Existing review item 10.2 #10 covers it. | 07c#25 |

### A.3 Eastern Command, fortress towns and the surrender test

| # | Where | Current | Verdict | Corrected text | Sources |
|---|---|---|---|---|---|
| A27 | 05 §7.3 (Chittagong "fortress town", Sylhet "AI garrison site"); §2.2 `bld.core` rationale; 06 §4 `site.fortress_1..5`, validation "tag `fortress` has exactly K = 5", §3.1 row "3 of 5", §7.3 row 8 | Fortress towns = Jessore, Bogra, Rangpur, Comilla, Chittagong | CONTRADICTED / PARTLY | Named fortresses: **Jessore, Jhenida (Jhenaidah), Bogra, Rangpur, Comilla, Bhairab Bazar** (six), plus **independent defence zones at Chittagong and Sylhet**. One other summary lists Jessore, Jhenaidah, Sylhet, Comilla, Rangpur. Jessore was the strongest. See A.3.1 for what this does to the surrender test. | 07a#23, #24 |
| A28 | 05 §6.2 entry 18 `eastern` | "HQ Dhaka; the 14th Division and later reinforcements" | PARTLY | "Five divisional formations by December: three regular divisions and two ad hoc divisional headquarters raised in mid-November without a real increase in troops; strongpoints at border towns and two defence zones." No formation numbers needed in the default view. | 07a#22, #23, #24 |
| A29 | 05 §2.3 `u.shock` AI rationale; §10.3 F-9; 06 §7.3 row 8 | "M24 light tanks at the start", count 75 | PARTLY (count NOT FOUND) | Keep "light tanks" as the AI picture of `u.shock`; never print a tank total. Scale pre-placed `u.shock` to "a handful of light-tank squadrons". | 07a#25, #22, #24, #28 |
| A30 | 05 §6.4 "Eastern Command size" | "about 91,000 regulars plus paramilitary; 350,000 to 365,000 in total; about 34,000 to 45,000 combat troops" | CONTRADICTED (the 350,000-365,000 claim) | Delete 350,000-365,000 (not a supportable east-only figure). Claims: Wikipedia war article about 91,000 regulars plus paramilitary; a Pakistani commission reported (search summary) at about 90,000 personnel of all kinds including police and civilians; one scholar (search summary) about 34,000 army, about 45,000 with paramilitary and police, about 55,000 with navy and air force. Summary range: "about 34,000 army, up to roughly 90,000 counting everyone, depending on source". | 07b[16], [17], [18] |
| A31 | 05 §2.2 `bld.attractor@f2` rationale | airlift by C-130 and PIA flights; overflight detour | Not re-checked | Stays UNVERIFIED (07a/b did not test it). | - |

#### A.3.1 What the fortress correction does to the surrender test

The owner's decision (4) says "capital town AND/OR 3 of 5 fortress towns as already specified". "As already specified" rests on a five-town list that 07a contradicts: there were **six** named fortresses, and Chittagong is a defence zone, not a fortress. The predicate in 06 §4 is unchanged in form: `any_of(holds_site capital, all_of(holds_sites_count fortress >= N, base_count_pct_of_start f2 <= 25))`. Only the tag set and N/K move. Options for the owner (decision needed, P0):

| Option | Sites tagged `fortress` | N of K | Effect | Historical fit |
|---|---|---|---|---|
| **A (recommended)** | Jessore, Jhenida, Bogra, Rangpur, Comilla, Bhairab Bazar | **3 of 6** | Keeps the owner's "3"; slightly easier than 3 of 5 (50% vs 60%), but the 25% clause still gates it | Matches 07a's list exactly |
| B | same six | 4 of 6 | Harder (67%); closest in spirit to "most fortresses" | Matches 07a |
| C | five of the six (drop Bhairab Bazar or Jhenida) | 3 of 5 | Literal decision kept | Calling five of six "the fortress towns" is a partial list; the dropped one must still exist as a garrison site |

Whatever is chosen: Chittagong and Sylhet get tag `defence_zone` (not counted), `real_place: true`, `raid_can_destroy: false`; Jhenida and Bhairab Bazar are added to `names/garrisons.json#f2` (the current pool, taken from the sector table, has neither); 06's step-5 validation reads "tag `fortress` has exactly K sites, K from the scenario's `end_conditions`" instead of a hard-coded 5; 06 §3.1 row "surrender: fortress sites needed" becomes `OWNER` with the chosen N of K; 06 H4 acceptance (b) uses the chosen N. Note: Jessore and Jhenida are about 45 km apart, roughly 13 tiles on a 128-tile map of the country; check they are not inside one base area.

### A.4 Forces, arms, funding, figures

| # | Where | Current | Verdict | Corrected text | Sources |
|---|---|---|---|---|---|
| A32 | 05 §2.1 `res.hard` rationale; §6.2 entry 12 `arms`; §10.3 F-8 | "seized depots, India and purchases [on the Calcutta market]" | PARTLY / CONTRADICTED (purchases) | "Arms came from captured Pakistani stocks, from defecting units and police stocks, from Indian supply and training (the border force from March, the Indian Army's Eastern Command from 15 May), and some local making." Delete "purchases on the Calcutta market"; the howitzer and aircraft list is NOT FOUND independently, and the aircraft were donated. Status: VERIFIED qualitatively. | 07b[7], [8], [9], [10], [11], [12] |
| A33 | 05 §2.2 `bld.coin_extractor` ("UNVERIFIED ... no source"); §10.2 #7; §10.3 F-12; 06 §7.3 row 6 | Support committee unsourced; "may need to be removed (D-D z)" | UPGRADE | Local struggle committees (Sangram Parishads) formed from March 1971; villagers sheltered and fed fighters and hid weapons (oral histories; search summaries). Label status: "supported in substance, no amounts". Keep `bld.coin_extractor.help` ("Local contributions raise funds."). 06: drop the "if unverifiable, remove the coin extractor" alternative. Funding of the exile government: India, expatriate groups, and a May 1971 directive; **no totals**, and the Tk and pound sums are search-summary only: never print them. | 07b[1]-[6] |
| A34 | 05 §6.4 "Bangladeshi force size" | 175,000; 180,000; "about 30,000 regulars and more than 100,000 guerrillas"; "about 70,000 plus 50,000 irregulars" | PARTLY | Claims as 07b gives them: 180,000 (Wikipedia infobox); about 100,000 as training output (a historian); about 70,000 regulars plus 50,000 irregulars by end November (one account); 83,000 trained and about 50,000 sent inside (Indian-side accounts); "as many as 50,000" associated with the resistance (US report, mid-1971). Summary range: "roughly 70,000 to 180,000, depending on definition and date". Drop 175,000 (not re-found). Do not show the Pakistani commander's claim of 162,000 plus 125,000 except as an attributed claim, reviewer-gated. | 07b[8], [9], [13], [14], [15] |
| A35 | 05 §6.2 entry 11 `training` | "counts disagree (30 to 84 camps; totals around 100,000 trained)" | PARTLY | "India ran about 30 training centres in May, rising to 84 by September (Indian commentary, unverified)." The 30 and 84 are two dates, not a disagreement. Move "about 100,000 trained" into the force-size figures block (A34). | 07b[15], [13] |
| A36 | 05 §6.2 entry 13; §6.4 "ships sunk" | "65 or 126"; "65 by November, 126 by December" | PARTLY | "Dozens to over a hundred vessels, by source: at least 65 sunk by the end of November (an Indian general's history); 126 sunk or damaged August-December (unattributed); participants give 45 and more than 100." Commandos: "about 160 in the first strike, about 500 trained". | 07b[12], [32], [33], [34] |
| A37 | 05 §6.4 "sabotage totals (omitted: ... one officer's memoir via an essay)" | omitted | PARTLY (better described) | Keep omitted from v1 (single source; "damage to, or destruction of"; period unstated). If ever shown: "A Pakistani officer's own account lists damage to, or destruction of, 231 bridges, 122 railway lines and 90 electric installations; a US consular report confirms effective sabotage without totals." This is a **single-figure claim**: needs a reviewer and a V-07 exception (it is one claim, not a range). | 07b[35], [36], [11] |
| A38 | 05 §6.4 `toll` block | 8 claims incl. "A study of Sarmila Bose 50,000-100,000"; "Independent researchers (as summarised) 300,000-500,000" | PARTLY | Bose: "about 100,000" per a review of her book (the 50,000-100,000 form was Wikipedia's). BMJ 2008: "about 269,000 (reported range 125,000-505,000)". Hamoodur Rahman Commission 26,000 and Government of Bangladesh 3,000,000: confirmed as the claims. Rummel 1.5 million, Gerlach about 500,000-1,000,000, mid-war US 200,000: **not re-checked**: give each claim its own `status: UNVERIFIED`. **Delete** "Independent researchers (as summarised)": it has no attributable body, which V-07's own rule requires. | 07b[17], [21], [22], [23] |
| A39 | 05 §6.2 entry 20 `refugees`; entry 26 `after` | "about 10 million"; "about 60,000 still in India by March 1972 (single source)" | OK / UPGRADE | "Nearly 10 million" is VERIFIED as the usual figure (UNHCR, Indian government, UNICEF as reported). The 60,000 in March 1972 now has a second report (Business Standard). Religious split stays unverified and out of the default view. Both numbers are single figures in body text: see V-07 fix (F.P0-6). | 07b[19], [20], [10] |
| A40 | 05 §6.2 entry 25; §6.4 "prisoners" | "about 90,000 to 93,000"; split disputed | OK | Keep the range. Do **not** set the 34,000-45,000 strength figure against the 93,000 as a prisoner split (07b: they measure different things). The 79,676 / 10,324 split is "citation needed" on its source page: UNVERIFIED. | 07b[37], [38], [17] |
| A41 | 05 §6.2 entry 19 `paramil`; §10.3 F-10 | formation dates single-source | PARTLY | "A volunteer force created by an ordinance of 2 August 1971 (one source says 1 June) and placed under the army on 7 September." Al-Badr: "recognised between May and September 1971". Al-Shams: no date. 07b also reports a tribunal judgment linking a fourth group to the Urdu-speaking community: **do not include it** (SC rule 6, 05's own "Biharis are not described as a group"). | 07b[24], [25], [26] |

### A.5 Terms, glossary, flag and slogans

| # | Where | Current | Verdict | Correction | Sources |
|---|---|---|---|---|---|
| A42 | 05 §6.2 entry 28 glossary | Mukti Bahini, Niyomito, Gono Bahini, Mitro Bahini, Muktijoddha, ghat, haor, khal, beel, Mujibnagar | Mostly UPGRADE | VERIFIED: Mukti Bahini, Niyomito Bahini, Gono Bahini, Muktijoddha, ghat, haor, beel, Mujibnagar. NOT RE-CHECKED: Mitro Bahini. NOT FOUND: khal (meaning standard, unverified). Add cautions: Gono Bahini shares its name with a later, separate post-1975 force; Muktijoddha is a legally defined term whose definition has changed several times (do not apply it to named people); ghat means a boat landing here (not the Indian bathing/cremation sense). If "Mukti Fauj" is ever added, its gloss is "early name of the regular force", **not** "trained by India". All Bengali script except a few items is general knowledge: native-speaker check. | 07c#1, #3, #4, #5, #9, #10, #11, #12 |
| A43 | 05 §3.3 base pool "Bil"; glossary "beel" | two spellings | consistency | Use one spelling (`Beel` in both, or `Bil` with "beel" as variant). | 07c#11 |
| A44 | 05 §3.3 pool count | "The pool has 15 words" | arithmetic error | 6 + 6 + 4 = **16 words**. | - |
| A45 | 05 §3.1, §10.2 #12, §8.3 rule 1 | "The 1971 flag design is not in the research files (NOT RESEARCHED)" | UPGRADE | Now researched: the 1971 flag was a green field with a red disc holding a golden map; the plain disc flag was adopted in January 1972; designer credit disputed; a 1972 order governs display and respect (penalties for disrespect), and a separate order bars use of the state emblem (which bears a water lily) for trade. Rule text: "Any flag ever drawn must be labelled as the 1971 or the current flag, shown flying properly, never torn, burned, inverted, on the ground or beneath another flag; the state emblem is never used." Keep the reviewer gate. | 07c#30, #31, #32, #33 |
| A46 | 05 §6.2 entry 28; V-14; §10.2 #11 | "Joy Bangla" excluded, associations NOT RESEARCHED | UPGRADE (reason now known) | Meaning VERIFIED ("Victory to Bengal"). Status politically contested: declared the national slogan by a High Court ruling (2020) and a 2022 gazette, stayed by the Appellate Division in December 2024; strongly tied to one party. Keep excluded; V-14 stays. | 07c#6, #7, #8, #35 |
| A47 | 05 §3.3 pool (Shapla, Doel) | nature words | note for review | Shapla (water lily) appears on the state emblem and Doel is the national bird. Fine as base-name words; never pair the word with a water-lily emblem picture. | 07c#33 |

### A.6 Single-figure numbers flagged (casualty or strength)

| Location | Number | Problem | Fix |
|---|---|---|---|
| 05 §6.4 `toll`, claims with `low == high` (26,000; 200,000; 1,500,000; 3,000,000) | point claims | Allowed inside a multi-claim block only if each is attributed; three are unverified at source | Per-claim `status`; block stays `ship: false` until each is checked |
| 05 §6.2 entry 20 | "about 10 million" in body text | Single figure outside a figures block (fails V-07 as written) | Move to a `refugees` figures block, or add the consensus exception (F.P0-6) |
| 05 §6.2 entry 26 | "about 60,000 still in India" | Single figure in body text | Same |
| 05 §6.2 entry 11 | "around 100,000 trained" | Single strength figure | Move into the force-size range (A34/A35) |
| 05 §6.2 entry 13 | "65 or 126" ships | Two figures, different definitions | Use A36's wording |
| 05 §2.3 / §10.3 F-9 | 75 tanks | Count not found | Never printed (already); remove from F-9 as a "fact" |
| 06 §7.3 row 8 | "tank count" | same | "light-tank squadrons; no count" |
| sabotage totals | 231 / 122 / 90 | One adversary officer's tally | Omitted in v1 (keep) |

No casualty or strength number appears in 05's UI strings or in any 06 rule or event payload. That holds, and 06 §5 check 5 keeps it.

---

## B. Consistency between 05 and 06, and with the decisions

### B.1 Calendar arithmetic (re-run independently)

Epoch turn 0 = 26 March 1971 (day-of-year 85); turn t covers days 3t to 3t+2 after the epoch. 1971 is not a leap year. 26 March to 16 December = 265 days = 88.3 turns.

| Turn | Dates | Used by | Spec claim | Check |
|---|---|---|---|---|
| 0 | 26-28 Mar | start, two context lines | 05, 06 | OK |
| 2 | 1-3 Apr | radio line (3 Apr) | 05 | OK |
| 5 | 10-12 Apr | proclamation | 05 | OK |
| 6 | 13-15 Apr | digest example, "mid-April" line | 05 | OK |
| 7 | 16-18 Apr | oath (17 Apr) | 05 | OK |
| 10 | 25-27 Apr | refugee line, "late Apr" | 05 | OK |
| **12** | **1-3 May** | Eastern Command links line, labelled "late Apr" | 05 §6.3 | **Wrong label**: "early May" (or move the line to turn 11) |
| 16 | 13-15 May | training camps "May" | 05 | OK |
| **20** | **25-27 May** | (new) radio to Calcutta, 25 May | A12 | add |
| 21 | 28-30 May | last pre-wet turn in 06 | 06 | OK |
| 22 | 31 May-2 Jun | contains 1 June; 06 first wet turn; 05 last pre-monsoon turn | 05 vs 06 | **conflict** (B.2 #1) |
| 23 | 3-5 Jun | 05 first monsoon turn; 05 V-16 | 05 | arithmetic OK, choice conflicts |
| 34 | 6-8 Jul | first brigade (7 Jul) | 05, 06 | OK |
| 36 | 12-14 Jul | sector conference | 05 | OK |
| **40** | **24-26 Jul** | 05 §5.1 monsoon digest says "23-25 July" | 05 | **Wrong**: "24 to 26 July 1971" |
| 47 | 14-16 Aug | Jackpot | 05 | OK |
| 51 | 26-28 Aug | Roumari (27 or 28 Aug) | 05 | OK for both days |
| 62 | 28-30 Sep | last wet/monsoon turn; Kilo Flight | 05, 06 | OK |
| 63 | 1-3 Oct | first dry turn; second brigade (1 Oct) | 05, 06 | OK |
| 67 | 13-15 Oct | third brigade (14 Oct) | 06 | OK |
| 73 | 31 Oct-2 Nov | end of the April-October alternative | 06 note | OK (but delete the alternative, A21) |
| 79-81 | 18-26 Nov | Garibpur, Hilli | 05 | OK |
| 80 | 21-23 Nov | 21 November | 05, 06 | OK |
| 84 | 3-5 Dec | timed effect, open war; also contains 4 Dec | 05, 06 | OK |
| 85 | 6-8 Dec | Jessore 6 Dec | 05 | OK |
| 86 | 9-11 Dec | Meghna crossing 9 Dec | 05 | OK |
| 87 | 12-14 Dec | 14 Dec | 05 | OK |
| 88 | 15-17 Dec | 16 Dec; final turn | 05, 06 | OK |

`max_turns = 89` (turns 0-88) is right. 06 H4 step 4 ends the match when `T + 1 >= max_turns`, that is at the end of turn 88, so turn 88 is played: consistent with 05 V-16 and 06 acceptance (c). 06 R-2's "only 5 turns" (84-88 inclusive) is right. 06 §4 derivations (1 June = day 67, 1 October = day 189, 3 December = day 252, 16 December = day 265) are right.

### B.2 Mismatches between 05 and 06

| # | Topic | 05 says | 06 says | Fix (who) | Priority |
|---|---|---|---|---|---|
| 1 | Season ids | `pre_monsoon`, `monsoon`, `dry` | `season.pre_wet`, `season.wet`, `season.dry` | Ids are the ruleset's (06). Theme maps them: `"season_labels": {"season.pre_wet": "season.pre_monsoon", "season.wet": "season.monsoon", "season.dry": "season.dry"}` (05) | P0 |
| 2 | First wet turn | 23 (3 June); last pre-monsoon 22; V-16 pins 23 | wet 22-62, pre_wet 0-21 | Choose **turn 22** (the turn containing 1 June; climate monsoon June-September, A21). 05 §4.2 table, §4.3 and V-16 ("turn 22 is the first `season.wet` turn") change; 06 unchanged. Status of the schedule: PLACEHOLDER → ASSUMED (boundary choice), since June-September is now verified. | P0 |
| 3 | Who owns season turns | 05 `calendar.json` holds `from_turn`/`to_turn` and `deadline_turn: 88` | 06 scenario holds the schedule and `max_turns` | Remove `seasons[].from_turn/to_turn` and `deadline_turn` from the theme (TA §0: a theme holds no number the simulation reads; duplicates drift). V-16 reads the scenario schedule and the variant instead. | P0 |
| 4 | Event ids | `ev.patron_link_cut`, `ev.victory_surrender`, `ev.deadline_draw`, `ev.defeat_scattered`, `ev.season_change` (05 X-5) | `ev.timed_effect_started`, `ev.faction_surrendered`, `ev.match_ended{result,reason}`, `ev.faction_eliminated{slot,reason}`; **no season event** | See B.3 | P0 |
| 5 | Events and errors 06 adds that 05 lacks | - | `ev.arrival_deferred`, `ev.arrival_cancelled`, `ev.site_taken`, `ev.faction_eliminated`, `ev.faction_surrendered`, `ev.match_ended`, `ev.timed_effect_started`, `err.patron_link_cut` | Add templates (B.3). V-11 fails without them. | P0 |
| 6 | Theme keys with no engine source | `err.not_entry_tile` (arrivals are scheduled; no player "cross here" order exists in H1); the "units fall back and reappear next turn" promise in `ev.colony_captured_against` (no hook does this) | - | Delete `err.not_entry_tile` or tie it to a real order; reword `ev.colony_captured_against` (F.P1) | P1 |
| 7 | Raid protection name | "variant switch `raid.destroy_site: false`" (§3.3) | per-site scenario flag `raid_can_destroy: false` (H2, C3) | 05 §3.3: "a site named after a real town has `raid_can_destroy: false` in the scenario (06 H2)". | P1 |
| 8 | Variant version | preset `"bd1971@1"` (§1.4) | variant `"version": "0.1.0"`; scenario requires `bd1971@0.1` | Preset: `"bd1971@0.1"` (and `equal-nations@1`, `mvp@1` as they exist). | P0 |
| 9 | Region data | `scenarios/liberation-1971/sectors.json`, ids 1..11 with boxes and `name_key` | regions inline in `scenarios/liberation-1971.json`, ids `region.r01`..`r09`, `r11` | One home: the scenario file (06). Theme `names/sectors.json` maps `region.rNN` → `ui.sector.N`. 05's box sketch becomes an authoring aid, not a shipped file. | P1 |
| 10 | Number of regions | "11 sector regions" (05 §0) | ten land regions (sector 10 has none) | 05 §0: "10 land sector regions (sector 10 is a label only)". Both specs already treat sector 10 that way. | P2 |
| 11 | Entry groups | one group per border sector: 1, 2, 3, 4, 5, 6, 7, 8, 11 (nine), labelled "Entry point, Sector n area" | three groups: `entry.west`, `entry.north`, `entry.east` | Pick one. Recommended: 06 adopts per-sector groups (`entry.s01` ... `entry.s11`), because H1 supports any number and 05's labels need them; R-3's "three groups on three borders" becomes "nine groups". | P1 |
| 12 | Start kit hospital | "The scenario starts each side with one level-1 `bld.scout_post` next to its first HQ" (§2.2) | player starts with **no base** (entry tiles); AI pre-placed building lists omit the hospital; consequence (1) "a new base heals nothing until it builds the field hospital" | 05 §2.2 "Start kit" row → "AI pre-placed bases include a level-1 `bld.scout_post` where the scenario lists one; the player's bases heal only after they build one (06 H7 consequence 1)." 06 §4: add `{"role": "bld.scout_post", "level": 1}` to the capital and fortress building lists if the AI should heal from turn 0. | P1 |
| 13 | Healing amounts | `ev.unit_healed`: "recovered **1** strength"; help "Level raises how fast" | `[1, 1, 2, 2]` | `"ev.unit_healed": "{unit} recovered {amount} strength at the {building}."`; help: "Heals units attached to this base area: 1 strength per turn, 2 from level 3." Numbers otherwise agree (05 [1,1,2,2] = 06). | P1 |
| 14 | Scout recruiting (decision 3) | `bld.habitat` recruits guide teams; help text says so | same; 06 §7.4 Q3 still open; 06 H7 prose says "couriers" | Close 06 §7.4 Q3 as decided; replace "courier(s)" in 06 H7 with "`u.scout`" (06 must not use theme words, and "courier" is not 05's label). 05 §10.4: "scout cap moved to `bld.habitat`" → OWNER. | P2 |
| 15 | Surrender goal text (decision 4) | `brief.goal`: "Hold the Dhaka garrison town, or hold enough fortress towns" | `any_of(capital, all_of(N fortresses, AI <= 25% of start))` | `"brief.goal": "Take the Dhaka garrison, or hold {n} fortress towns while Eastern Command keeps no more than a quarter of its starting garrisons. Either makes Eastern Command agree to surrender."` | P0 |
| 16 | Loss rule (decision 2) | `ev.defeat_scattered`, `end.loss.body`: "no base area and no organising team for {turns} turns" | `grace 15` + `homeless_turns_limit: null` | See C.2 | P0 |
| 17 | Citation notation | `[S-n]` = content rule n, but also "[S-10 item 8]", "[S-10 8.1]", "[S-8.1]", "[S-10 2.3]" meaning SC sections | - | Write "SC §10 item 8", "SC §8.1" etc.; keep `[S-n]` for rules only (V-21's "[S-10 8.1]" should read "[S-1], SC §8.1"). | P2 |
| 18 | Calendar format | V-16 expects "26-28 March 1971"; `ui.calendar.range` is "{from} to {to}"; digest shows "13 to 15 April 1971" | - | One format; V-16 must test the template output, not a literal. | P2 |
| 19 | Context line in digest example | Turn 40 example shows the "mid-July ... 11 sectors" line that §6.3 schedules for turn 36 | - | Change the example to turn 36 ("12 to 14 July 1971") or show the turn-40 schedule. | P2 |
| 20 | Hook ↔ validator | V-21 cross-references the 06 allow-list test | 06 §5 check 10 smoke-tests three theme labels | Consistent. After C, add to V-21: "shortage and capture templates make no claim the rules do not make" (C.3). | P1 |

Checked and consistent: role ids (all 6 `res.*`, 12 `bld.*`, 8 `u.*`, 8 `t.*` match GDD §2.1); `equal-nations` for both sides and `arch.expedition` for both; tax 0 and interest off (D-B); patron = own government, tax 0; December effect at turn 84; draw at the deadline; `arch.indigenous`, `npc.settlement`, discoveries, diplomacy, tribute and scoring off; healing moved to `bld.scout_post` with `[1,1,2,2]`; scout support 2 per level on `bld.habitat`; region cap 1 core at level >= 3 per region per faction; field hospital costs unchanged; `max_turns` 89.

### B.3 Event and error mapping (theme text for 06's generic ids)

06's hard rule keeps ruleset event ids generic, so the theme writes text for the generic ids. Proposed 05 §5 replacements:

| 05 key now | Becomes | Text |
|---|---|---|
| `ev.patron_link_cut` | `ev.timed_effect_started` | "Eastern Command's air and sea links have been cut. Its garrisons report falling morale." (bd1971 has one timed effect; if more are added, 06 adds the effect `id` to the payload and TA needs payload-keyed templates.) |
| `ev.victory_surrender` | `ev.faction_surrendered` | "Eastern Command has agreed to surrender." |
| `ev.deadline_draw` | `ev.match_ended` with `reason: "deadline"` | "The calendar reaches 16 December. The war is not decided in this game." Needs either payload-keyed templates (a TA extension, add as X-8) or distinct ids from 06 (`ev.match_drawn`, `ev.match_won`). **Recommended: 06 emits distinct ids**, which needs no TA change. |
| `ev.defeat_scattered` | `ev.faction_eliminated` | "The movement is scattered: no base area for {turns} turns." 06 must add `turns` (the limit that fired) to the payload, or the placeholder fails V-11. |
| `ev.season_change` | `ev.season_started{season}` (06 H3 must emit it at step 6 when `season(T+1) != season(T)`; public event, no state) | "{season} begins. {note}" |
| (none) | `ev.arrival_deferred` | "No entry point in the {group} area is clear. The team waits across the border." |
| (none) | `ev.arrival_cancelled` | "{unit} could not come: the supply link is cut." |
| (none) | `ev.site_taken` | "Your forces took {site}. Its stores are now yours." (`@f2`: "{site} was taken.") |
| (none) | `err.patron_link_cut` | "The supply link is cut. No orders to the government can be sent." (`@f2`: "The air bridge is cut.") |

---

## C. Impact of the four decisions just made

### C.1 Decision 1: the two companion switches are DROPPED

Exact changes in **06**:

| Location | Change |
|---|---|
| §1 table | Delete rows C1 and C2. Keep C3 (it is a per-site scenario flag inside H2). |
| §1 paragraph under the table ("C1 and C2 were not in the owner's list ...") | Replace with: "Two further switches (shortage stand-down and personnel-on-capture) were proposed and dropped by the owner on 2026-10-03. The neutral shortage and capture rules apply unchanged; section 5 states what the allow-list test proves without them." |
| §1 total | "about 1,130 lines of code and 1,520 of tests" (removes 30+60 and 20+40). |
| H0.1 first bullet | "All hook keys live in `rules/core/hooks.json`; C3 (`raid_can_destroy`) is per-site scenario data in H2." |
| §2 pipeline step 4 | `[H3, H6, C1]` → `[H3, H6]`. |
| §2 subsections "C1" and "C2" | Delete. |
| §3 ops | Delete `{"op": "replace", "path": "/economy/shortage/kind", ...}` and `{"op": "replace", "path": "/combat/capture/pop_outcome", ...}`. |
| §5 intro | "It implements SC §8.1 and SC §9 rules 1-3, and the state side of rule 4 (the label side is the theme's V-04 and V-05)." |
| §5 check 4 | "The set of `ev.*` ids reachable under bd1971 and each id's payload field names equal the allow-list. The neutral shortage outcome is exactly one event id (whatever the engine names it) and is on the list; no death-of-people, tribute, NPC, discovery or score event id is reachable." Remove `ev.pop_departed`. |
| §5 check 7 | "... every decrease of `res.pop` is matched by exactly one of: a recruit or founder cost paid that turn; a militia strength loss in a battle that turn (GDD §11.6 rate); the neutral shortage loss (rate and rounding of GDD §8.5); or a change of owner by capture, in which case the base's `res.pop` is unchanged by the capture and counts for the new owner. No other decrease exists. Faction totals move only by these causes." Add: "If capture damage (GDD §11.6, 02 G16: 'half of each stockpile kept') applies to `res.pop`, list it as its own cause; otherwise assert that capture leaves `res.pop` unchanged." Remove "the captor's received pop is 0 (C2)". |
| §5 check 8 | Delete "`economy.shortage.kind == "departure"`"; add "the shortage rate equals the neutral 5% and emits only the allow-listed event". |
| §6 | Delete G-8.5. G-11.6: delete "; `combat.capture.pop_outcome` (C2)". |
| §7.1 R-7 | Replace with: "**Captured personnel.** Under the neutral capture rule a captured base keeps its `res.pop`, which then counts for the captor; on screen the AI's 'Personnel' become the player's 'Volunteers'. Mitigation: theme text never narrates it (C.3); accounting test (check 7) proves it is the only cross-side movement; owner may restore the switch later as a ruleset minor version." |
| §7.2 | Delete row "H2 x C2". Row "C1 x H3" → "Shortage x H3: lower pre-wet food output means more shortage losses early; the simulator must show the opening base survives (first base by turn 3, GDD §4)." |
| §7.4 item 1 | Mark "Decided 2026-10-03: dropped." |

Exact changes in **05**:

| Location | Change |
|---|---|
| §5 `ev.colony_captured` | "Your forces took {site}. Its stores and quarters are now yours." (The current "The garrison withdrew" contradicts the neutral rule, under which the base's personnel count stays with it.) |
| §5 `ev.shortage_warning`, `@f2`, `ev.shortage_resolved` | Unchanged, but they are now the **only** place the stand-down meaning lives. V-04 keeps them honest in wording. |
| §6.2 entry 29 `limits` (and `debrief.different.body`) | Add: "Shortages lower volunteer numbers at a fixed rate; the game does not model hunger. When a position changes hands its staffing count stays with it; this is a game simplification, not a claim about what happened to the people there." |
| §9 V-04 note | "Shortage text must contain 'return home' or 'stood down'. Since the stand-down switch was dropped, this text is the only carrier of that meaning; it must not add any claim (for example 'nobody was harmed') that the rules cannot back." |
| §9 V-21 | Add: "capture templates make no claim about where personnel go." |

**What dropping them weakens, stated plainly (a risk, not a veto).**
- The core of Hybrid H, "**no civilian state in the simulation**, enforced by a test" (SC §8.1, rule 1), is **not** weakened: neither switch added or removed civilian state, and checks 1-3, 5, 6 and 9 are untouched.
- SC §3.1 condition 3 ("shortfall means stand-down, not death") and SC rule 4 now hold **in text only**. The neutral rule is "emigrate or starve" (GDD §8.5, TA §1 role table: "a shortage causes emigration or starvation"); the bd1971 rules cannot tell "went home" from "died", only the label does. If the neutral engine emits separate ids for emigration and starvation, or a warning id such as `warn.starvation_spiral` (GDD §12 lists a "starvation spiral" warning), check 5's forbidden-token scan (`starv`) will fail under bd1971.
- SC §3.1 condition 5 and 06's own citation of conditions 1 and 5 ("personnel never change sides") **no longer hold in the rules**: a captured AI garrison's personnel count becomes the player's volunteer count. It does not draw on civilians, but it reads as opposing troops joining the movement, which a Pakistani or Bangladeshi reviewer may question.

**Minimal wording and test that keep the guarantee honest without the switches.**
1. Restate the guarantee in 06 §5 and SC terms: "Rule-level and tested: no civilian state. Text-level and validated: stand-down on shortage; nothing said about personnel on capture."
2. Neutral naming, no behaviour change (GDD §8.5 and §12, before the engine is coded): the shortage outcome is **one** event with a death-neutral id and payload, e.g. `ev.pop_lost{base, amount, cause: "shortage"}`, and the failure warning is `warn.food_shortage` (not "starvation"). The colonial theme still labels it "emigrated or starved". This is the zero-cost replacement for C1's rules half; if the owner prefers not to touch neutral naming, check 5 needs a reviewed exception entry naming the exact neutral id.
3. Test addition (one assertion in check 4): "exactly one shortage event id is reachable, it carries no `cause` value other than `shortage`, and no event payload anywhere has a field whose name contains a forbidden token". Plus check 7 as rewritten above, which still proves there is no hidden, reprisal- or famine-like decrease of personnel.

### C.2 Decision 2: loss = no base area for 15 turns, regardless of founders

GDD §12 already has this neutral rule: `homeless_turns_limit = 15`. The trap is the **other** neutral rule: "no base **and** no founder" eliminates **at once** when `no_base_no_founder_grace_turns` is 0 (06 H4 step 1). 06 R-11's suggested fix ("set `homeless_turns_limit: 15` and grace 0") would therefore bring back an instant loss when the last organising team dies before a base exists, which contradicts "regardless of founders". Correct settings:

| 06 location | Change |
|---|---|
| §3 ops | **Delete** `{"op": "replace", "path": "/victory/homeless_turns_limit", "value": null, ...}` (the neutral 15 stays). **Keep** `{"op": "replace", "path": "/victory/no_base_no_founder_grace_turns", "value": 15, "_note": "OWNER 2026-10-03: loss = no base for 15 turns regardless of founders. Grace 15 only switches off the neutral instant elimination; the homeless clock decides, since it always reaches 15 first."}`. |
| §3.1 row "no-base-no-founder grace" | "homeless limit 15 (neutral) + grace 15 (disables the instant rule) | OWNER". |
| H4 acceptance (d) | "a player with no base for 15 consecutive checks loses even with an organising team alive; after 14 it is still in play; a player with no base and no founder is **not** eliminated before the 15th check." |
| §7.2 row "H4 x H1" | "Founder arrivals do not reset the loss clock; only holding a base does (counted in step 5a after step 3a)." |
| §7.1 R-11 | "Resolved by the owner (2026-10-03). A player with founders but no base still loses at 15; the turn-88 deadline bounds everything else." |
| §7.4 item 2 | "Decided: no base for 15 turns." |
| Optional, cleaner | Let `no_base_no_founder_grace_turns` accept `null` = "instant rule off", so the redundant 15 and the `no_base_turns` state field disappear. Schema change, P2. |

05 changes: `"ev.defeat_scattered"` (or its successor `ev.faction_eliminated`, B.3): "The movement is scattered: no base area for {turns} turns." `"end.loss.body"`: "No base area for {turns} turns. This is a game outcome, not a record. In history, the war ended with the surrender of Eastern Command in Dhaka on 16 December 1971." Pacing note: the player starts with no base, so the clock runs from turn 0; the first base must stand by the end of turn 14 (GDD §4's target is turn 3).

### C.3 Decision 3: scout recruiting moves to `bld.habitat`

Both specs already say this. Remaining edits: close 06 §7.4 item 3; replace "courier" in 06 H7 with `u.scout`; 05 §10.4 move "scout cap moved to `bld.habitat`" from ASSUMED to OWNER. The 2-per-level support value stays ASSUMED.

### C.4 Decision 4: surrender test

06 §4 and H4 already implement "capital, or N fortresses with the AI at or below 25% of its start". Edits: the K/N question from the fortress correction (A.3.1); 06 §3.1 row "fortress sites needed" → OWNER; 06 §7.4 item 4 → decided; 05 `brief.goal` (B.2 #15). Note that "AND/OR" in the decision reads as `any_of`, which is what 06 has; the 25% clause is inside the fortress branch only, as specified.

---

## D. Sensitivity audit of 05 against SC §9 (rules 1-12)

| # | Item in 05 | Rule | Problem | Action |
|---|---|---|---|---|
| D1 | Z/S/K Force names in context lines and `forces.regular` | 9, naming rule | Initials of real commanders (07a) | Generic brigade names (A4). **Cut** in game text. |
| D2 | `toll` figures, "Independent researchers (as summarised)" | 5 | Unattributed claim | **Cut** (A38). |
| D3 | `toll` `summary_range` "From about 26,000 to about 3,000,000, depending on who is counting and how." | 5, 10 | "depending on who is counting" may read as dismissive to readers for whom 3 million is settled; order of claims starts with the lowest | Reword: "Estimates range from 3 million (Government of Bangladesh) to 26,000 (a Pakistani commission of inquiry); scholars give figures between these. This game does not choose a number." List the Government of Bangladesh figure first. Reviewer-gated. |
| D4 | `terms` entry: "most UN members rejected such allegations at the time; rarely in genocide-studies textbooks" | 5, 10, 12 | Single source; recognition of the genocide is a central issue for Bangladeshi audiences; the textbook clause is a sweeping, unattributed generalisation | Cut "rarely in genocide-studies textbooks"; keep the entry `ship: false` until a Bangladeshi historian reviews it. |
| D5 | `paramil` entry and 07b's report of a group drawn from the Urdu-speaking community | 6 | Would describe a community through a group | Do not add; V-13 already keeps the names in this entry only. |
| D6 | `patron.name@f2`: "West Pakistan (air bridge)" | 6 | Political phrasing for the AI's patron; SC §3 table suggested "GHQ in the west" | "Army headquarters in the west (air bridge)". Pakistani reviewer item. |
| D7 | Context line turn 0: "For civilians in East Bengal, the war began there." | 7, 6 | "East Bengal" vs the official 1971 name "East Pakistan" is itself a stance; also places civilian harm in the same breath as the AI's opening move | Keep the remembrance meaning, review the place name; it is EXT (allowed to say "civilians"). Reviewer item. |
| D8 | `ev.colony_captured_against`: "Surviving units fell back toward the border and reappear next turn." | 11 | Promises a mechanic that does not exist; if units are in fact lost, the text hides losses | "{base} could not be held and was taken by the opposing force." |
| D9 | `debrief.history.line`: "In history there was no single decisive battle." | 5 | Unsourced historical judgement | Cut the first sentence or source it. |
| D10 | `brief.goal`: "Hold the Dhaka garrison town" | 2 | Mixes town and installation; rule 2 says town names are locations, sites are installations | "Take the Dhaka garrison ..." (B.2 #15). |
| D11 | `end.win.picture` / `surrender` entry: "signed by the commander of Eastern Command and the Indian Eastern Command's commander" | 10, 6 | Who signed and who was present is sensitive in Bangladesh (07a#27 "December 16 was not India's win") and in Pakistan | Keep "two delegations with equal dignity"; entry text reviewer-gated by both a Bangladeshi and a Pakistani reviewer; consider "signed before the joint command of Indian and Bangladesh forces". |
| D12 | `u.line` label "Freedom-fighter section" | 9 | "Freedom fighter" translates Muktijoddha, a legally defined status (07c) | Acceptable as a generic English unit name; add to the Bangla review list so the Bangla label avoids the legal term. |
| D13 | `menu.remembrance`: "In remembrance of all who died, those who fought and those who lost their homes, 1971." | 1, 10 | Inclusive by design; some Bangladeshi readers may want the genocide's victims named; others will welcome the inclusivity | Keep; already reviewer item 10.2 #1. |
| D14 | Base pool "Shapla" and any lily picture | 9 (symbols) | Water lily is on the state emblem (07c) | Word fine; no lily emblem picture (A47). |
| D15 | `ui.btn.requisition`: "Requisition from the government" | 2, 4 | "Requisition" often means seizing goods from people | "Request from the government". |
| D16 | Context line turn 10 "Large numbers of people crossed into India for safety" | 5, 8 | Fine (no figure, no composition) | Keep. |
| D17 | Glossary "Gono Bahini" | 6 (politics) | Name later used by a separate post-1975 force (07c) | Add the one-line disambiguation (A42). |

No item in 05 shows atrocity as a mechanic, a kill score, religious labels, or a named real person in UI text. The AI's labels are plain military terms. The structure of 05 follows SC §9; the items above are wording.

---

## E. Remaining unverified facts, ranked by how much game text depends on them

| Rank | Fact | Depends on it | State after 07 | What would settle it |
|---|---|---|---|---|
| 1 | Sector areas (10 land regions) | Region cap mechanics, 11 `ui.sector.*` strings, entry-point labels, digest lines, `sectors` entry | PARTLY (sectors 2, 3, 5, 8, 9, 11 need the A16-A19 wording) | Banglapedia sector entries read directly; a Bangladeshi historian |
| 2 | Fortress towns and defence zones; Eastern Command structure | Surrender predicate (K, N), site tags, garrison pool, gazetteer, `eastern` entry | PARTLY (six fortresses + two zones; one summary lists five) | Indian and Pakistani official histories (aimh.gov.pk failed TLS), Hamoodur Rahman report |
| 3 | 3 December as start of the state war | Timed effect turn 84, context line, debrief text | PARTLY (secondary sources only) | FRUS XI, Library of Congress study |
| 4 | Season boundaries | Season schedule, three labels, turn-22/23 context line, geography entry | June-September VERIFIED; turn choice is design | BMD normal onset/withdrawal dates (PDF not opened) |
| 5 | 26/27 March declaration wording and credit | Turn-0 line, `declaration` entry, prologue, V-15 | PARTLY; politically sensitive | Historian + Bangla sensitivity reader |
| 6 | Brigade formation dates (July, October, October) | Arrival turns 34, 63, 67; two context lines | Months VERIFIED; days single-source | Banglapedia brigade entries |
| 7 | Radio chronology (start date 26 March vs 3 April; Tripura phase dates) | Turn 2 and turn 20 lines, `radio` entry, `bld.attractor` rationale | Move to Calcutta 25 May VERIFIED; start and Tripura dates PARTLY | Historian; Banglapedia |
| 8 | Death-toll claims at their original publications | `toll` figures block (encyclopedia only) | 3 of 8 confirmed; Rummel, Gerlach, US mid-war unchecked | The publications themselves |
| 9 | Force sizes, prisoners and refugees | Three figures blocks | Ranges confirmed as spreads; splits unverified | Original Indian statement (POWs), UNHCR archive |
| 10 | Joint Command date | Turn 80/84 lines, `india` entry | Unresolved (21 Nov Armed Forces Day vs 4 Dec formal joint command) | Indian official history |
| 11 | Roumari day and "first" | `roumari` entry, turn 51 line | Month only | Independent neutral source |
| 12 | Arms sources and the purchase list | `arms` entry, `res.hard` rationale | Qualitative VERIFIED; purchases NOT FOUND | - (wording already safe) |
| 13 | Funding / support committees | `bld.coin_extractor` label and help | Supported in substance; no amounts | Re-read the Daily Star piece on the page before any number |
| 14 | Razakar/Al-Badr/Al-Shams dates | `paramil` entry (reviewer-gated) | PARTLY | Tribunal judgments, ordinance text |
| 15 | 14 December Day of the Martyred Intellectuals | Turn 87 line, `remembrance` | Single source | Any second source |
| 16 | Jessore first liberated 6 December | Turn 85 line | Single source | Any second source |
| 17 | Kilo Flight (date, Dimapur) | Turn 62 line, `kilo` | Single source | Any second source |
| 18 | Gazetteer items: Hardinge Bridge 13 Dec, Tangail airdrop and Poongli, Feni and Bhairab bridges, Kalurghat, Dacca airfield, Harina | Map labels | UNVERIFIED | Map author with an atlas + historian |
| 19 | Bengali script and transliterations; base-name glosses | Glossary, name pools, future `bn` locale | Mostly general knowledge | Native speaker; Bangla Academy table |
| 20 | Flag designer; flag/emblem law texts; whether Bangladeshi law restricts "distortion" of war history | Flag rule, release | Partly researched; law texts not read | Bangladeshi legal reviewer |
| 21 | Haor flood months; "Sylhet hills" | Terrain help | Haor July-November (one source) | Banglapedia |
| 22 | Mid-April towns under Pakistani control | Turn 6 line | Single source | Any second source |

### E.1 Consolidated reviewer checklist

People (unchanged from 05 §10.1 and SC §10): Bangladeshi historian (required); Bangla-speaking sensitivity reader (required); Bangladeshi Hindu community reviewer; Urdu-speaking ("Bihari") community reviewer; Pakistani reviewer; optional Indian military-history reviewer; legal check for Bangladesh and stores.

Items, merged from 05 §10.2, SC §10, 07a/07b/07c "still unverified" and this report:
1. Remembrance line, first-launch note, end-screen texts, credits dedication (EN, then BN).
2. Every figures block (toll, refugees, forces both sides, prisoners, ships, any sabotage quotation) with per-claim status.
3. Declaration wording (26/27 March), no person credited; radio start date and station name.
4. Whether any real leader is ever named (05 names none).
5. AI-side labels, `patron.name@f2` (D6), the surrender picture and `surrender` entry wording (D11), naming real towns on garrison sites.
6. Patron wording (Mujibnagar Government; Indian help text only).
7. Support committee label and help (now supported in substance).
8. Field hospital glyph or picture with no protected emblem; "Instructors' cadre", "Fighters' camp".
9. Base-name pool spellings, glosses and symbol connotations (Shapla, Doel; Bil/Beel).
10. Bengali terms and script; period vs present spellings; 1971 divisions.
11. Joy Bangla (stays excluded); Gono Bahini disambiguation; Muktijoddha legal sense; "Freedom-fighter" Bangla label.
12. Flag and colours (player green, generic banner); emblem never used.
13. Music: none; any later radio song or anthem needs sensitivity and copyright review.
14. Prologue (language movement, non-cooperation movement): body text still cannot be written from the files.
15. Season labels and the monsoon sentence.
16. `terms` and `violence` entries stay `ship: false` until the historian approves.
17. Store text, trailer and screenshots.
18. **New:** the capture simplification text in `limits` (C.1) and the guarantee restatement.
19. **New:** fortress list and K/N choice (A.3.1) by a historian and the owner.

### E.2 Assets: everything is provisional

The owner reopened the art question (the earlier "code-drawn only" is dropped). Mark as **PROVISIONAL (art method open)** in 05: §1.2 `assets/` and `audio/` lines; §1.3 `palette`, `fonts` (including the Noto Sans Bengali candidate), `battle_backdrops`, `license` note; every "Glyph" column in §2; §2.7 `sprite`/`glyph` fields; §3.1 banner shapes; all of §8 (glyph table, asset keys, the 8 art rules); V-19, V-25 (layout, not art, but tied to panel art); strings `credits.licence`, `end.win.picture`, `ui.digest.masthead` artwork; "Audio: none in v1". In 06: only the scope sentence "labels, text, art". **Not provisional:** the content limits on any picture regardless of method (no civilians, no destroyed villages, no protected emblems, no real flag or state emblem without review, no photographs or real faces, equal art quality for both sides, dignified surrender). Note: if images are ever produced with an image model, the subject (a real war within living memory) needs the same reviewer gate as the text, and generated art must not imitate photographs of real events.

---

## F. Prioritised fix list

### P0: must fix before any build

| ID | File / section | Exact change |
|---|---|---|
| P0-1 | 05 §4.1, §4.2, §4.3, V-16; 06 §4 `_season_note`, §3.1 | Seasons: 05 `calendar.json` becomes `{"epoch": "1971-03-26", "step_days": 3, "format_key": "ui.calendar.range", "value_name": "date", "season_labels": {"season.pre_wet": "season.pre_monsoon", "season.wet": "season.monsoon", "season.dry": "season.dry"}}` (no `seasons[].from_turn/to_turn`, no `deadline_turn`). 05 §4.2: turn 22 "31 May - 2 June 1971, first monsoon turn (contains 1 June)", turn 21 "28-30 May, last pre-monsoon turn"; drop the turn-23 row's "first monsoon" note. V-16: "turn 22 is the first `season.wet` turn in the scenario schedule; turn 88 contains 16 December; `max_turns` is 89". 06: delete "The alternative April-October reading gives wet = turns 2-73"; schedule status PLACEHOLDER → ASSUMED. |
| P0-2 | 05 §1.4 X-5, §5; 06 H1, H3, H4, H5 | Event and error mapping of B.3: rename the five 05 keys; add templates for `ev.arrival_deferred`, `ev.arrival_cancelled`, `ev.site_taken`, `err.patron_link_cut`; 06 H3 emits `ev.season_started{season}`; 06 H4 emits distinct `ev.match_won` / `ev.match_drawn` (or TA gets payload-keyed templates as X-8) and adds `turns` to `ev.faction_eliminated`. |
| P0-3 | 06 §1, §2 C1/C2, §3 ops, §5 checks 4/7/8, §6 G-8.5/G-11.6, §7.1 R-7, §7.2, §7.4; 05 `ev.colony_captured`, `limits`, V-04, V-21 | Drop the switches exactly as in C.1, including the restated guarantee and the one-assertion test addition. |
| P0-4 | 06 §3 ops, §3.1, H4 acceptance (d), §7.1 R-11, §7.2, §7.4; 05 `ev.defeat_scattered`/successor, `end.loss.body` | Loss rule exactly as in C.2 (delete the `homeless_turns_limit: null` op; keep grace 15 with the new note; new texts). |
| P0-5 | 05 §7.3 gazetteer, §3.3 garrison pool, `brief.goal`; 06 §4 sites and validation, §3.1, H4 acceptance (b), §7.3 row 8 | Fortress correction (A27, A.3.1): owner picks A/B/C (recommend A, 3 of 6); Chittagong and Sylhet tagged `defence_zone`; Jhenida and Bhairab Bazar added as AI garrison sites; validation reads K from the scenario. `brief.goal`: "Take the Dhaka garrison, or hold {n} fortress towns while Eastern Command keeps no more than a quarter of its starting garrisons. Either makes Eastern Command agree to surrender." |
| P0-6 | 05 §9 V-06, V-07, V-15, V-18 | **V-07**: "a number of 1,000 or more, or 'million'/'lakh', in a sentence that also contains a people, force or loss word (`people|refugee|troops|soldiers|fighters|personnel|men|killed|dead|deaths|died|casualt|martyr|victim|prisoner|strength`) outside a `figures` block"; years (`\b1[89]\d\d\b`), distances and heights with a unit (`m`, `km`) are not counted. Add `consensus: true` for a figure that at least two independent sources give the same way (refugees "nearly 10 million"), shown with attribution. **V-15**: applies only to entries and lines tagged `topic: "declaration"`, not to every string containing "26 March" (the Searchlight line and prologue say "25-26 March"). **V-18**: "fewer than 12 *generated names*" (pattern × words), so the 5-river flotilla pool and 6-bird callsign pool pass; or add rivers (Kushiyara, Teesta, Dhaleshwari, Madhumati, Pasur, Rupsha, Arial Khan) to reach 12. **V-06**: allow-list "Hamoodur Rahman Commission" or, better, show it as "a Pakistani commission of inquiry (1972-74)" per 05's own naming rule. |
| P0-7 | 05 §6.3 turns 34 and 63-67, §6.2 entry 7, §2.3 `u.ranged`; 06 §4 arrival `_note`s, §7.3 rows 2-3 | Generic brigade names (A4, A6). Turn 34: "In July the first regular brigade of the Bangladesh Forces was formed." Turns 63-67: "In October two more regular brigades were formed." |
| P0-8 | 05 §1.4 preset | `"variants": ["mvp@1", "equal-nations@1", "bd1971@0.1"]` to match 06's `"version": "0.1.0"` and the scenario's `bd1971@0.1`. |

### P1: should fix

| ID | File / section | Exact change |
|---|---|---|
| P1-1 | 05 §6.2 entry 10, §6.3 turn 2 and new turn 20, §2.2 `bld.attractor` rationale, §10.3 F-6 | Radio chronology (A12). |
| P1-2 | 05 §2.4 `t.peak`, §6.2 entry 24 | Highest point (A20): "Saka Haphong, about 1,050 m; Keokradong about 986 m is not the highest." |
| P1-3 | 05 §4.3, §6.2 entry 24, §10.3 F-11 | Monsoon wording and delete "300 extra navigable channels" (A21); dry-season label note (A22). |
| P1-4 | 05 §10.3 F-2; 06 §7.3 row 2 | Commander-in-Chief sequence (A1); remove the personal name "Osmani" from 06 (specs may name people, but 06's hard rule keeps real names out of the ruleset side; the fact list can say "the Commander-in-Chief"). |
| P1-5 | 05 §6.3 turn 80, entry 17; 06 §4 `te.link_cut` `_note`, §7.3 row 2 | Joint Command wording and decoupling (A3). |
| P1-6 | 05 §6.2 entry 15, §6.3 turn 51 | Roumari, month only (A7). |
| P1-7 | 05 §6.3 turn 0 second line, entry 5 | Declaration line (A8). |
| P1-8 | 05 `ui.sector.2`, `.3`, `.5`, `.8`, (`.7`, `.11` optional); `sectors` entry | Sector wording (A16-A19). |
| P1-9 | 05 §6.4 (both force blocks, toll, ships), entries 11, 12, 13; §2.1 `res.hard` | Figures and arms corrections (A30, A32, A34-A38). |
| P1-10 | 05 §5.1 | Turn-40 digest date: "SITUATION REPORT - 24 to 26 July 1971 - Monsoon (the rains)"; show the turn-36 line only at turn 36 (B.2 #19). |
| P1-11 | 05 §6.3 turn 12 | Date column "early May". |
| P1-12 | 05 §2.2 start kit; 06 §4 pre-placed buildings | Field hospital start kit (B.2 #12). |
| P1-13 | 05 `ev.unit_healed`, `bld.scout_post.help` | Healing amounts (B.2 #13). |
| P1-14 | 05 §3.3; 06 H2 | `raid_can_destroy` naming (B.2 #7). |
| P1-15 | 05 §7.2, §1.4 X-6; 06 §4 | One region home and id mapping (B.2 #9). |
| P1-16 | 05 §7.4; 06 §4 entry groups, §7.1 R-3, first brigade arrival | Entry groups per sector (B.2 #11); first brigade from the north (A5). |
| P1-17 | 05 §5 `err.not_entry_tile`, `ev.colony_captured_against` | Delete or tie to a real order; "{base} could not be held and was taken by the opposing force." (D8) |
| P1-18 | 05 §6.2 entries 21, 23; `patron.name@f2`; `debrief.history.line`; `ui.btn.requisition` | Sensitivity rewordings D3, D4, D6, D9, D15. |
| P1-19 | 05 §2.2 `bld.coin_extractor`, §10.2 #7, §10.3 F-12; 06 §7.3 row 6 | Support committee status upgrade; drop the "remove the coin extractor" alternative (A33). |
| P1-20 | 05 §3.1, §8.3 rule 1, §10.2 #12 | Flag facts and display rule (A45). |
| P1-21 | 05 all asset statements | Mark PROVISIONAL per E.2. |

### P2: later

| ID | File / section | Exact change |
|---|---|---|
| P2-1 | 05 §0 | "10 land sector regions (sector 10 is a label only)". |
| P2-2 | 05 citations | `[S-n]` for rules only; "SC §n" for sections (B.2 #17). |
| P2-3 | 05 §4.1, V-16, digest | One date-range format (B.2 #18). |
| P2-4 | 05 §3.3 | "16 words"; one spelling of Beel/Bil (A43, A44). |
| P2-5 | 05 §6.2 entries 13, 28; gazetteer | Plassey upgrade; glossary cautions (A13, A42); Hilli and Bhairab locations (A23, A24); Mujibnagar and Hardinge notes (A25). |
| P2-6 | 05 §6.2 entry 18 | Eastern Command structure wording (A28); tank wording (A29). |
| P2-7 | 05 §6.2 entry 19 | Razakar dates; never add the community-linked group (A41, D5). |
| P2-8 | 06 H4 schema | Allow `no_base_no_founder_grace_turns: null` = instant rule off; then drop the redundant 15 (C.2). |
| P2-9 | 06 H7 | "courier" → `u.scout`; close §7.4 item 3. |
| P2-10 | 05 period vs present spellings | Owner decision, then one pass over pools, gazetteer and strings (A26). |
| P2-11 | 05 help string "Each sector area can hold one level 3 or higher base area HQ." | Check it against V-08 ("a digit group appears in a unit/building help text"); if it is a building help text, V-08 must allow level numbers, or the text says "level three". |
