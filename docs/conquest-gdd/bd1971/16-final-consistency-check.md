# 16 - Final consistency check after the second fix pass (04, 05, 06, 08, 10, 11, 13)

Status: independent check, 2026-10-03. **No file was edited.** Every row below is a proposed fix for the file's owner.
Files read in full: [04](04-sensitivity-comparison.md), [05](05-theme-pack-spec.md), [06](06-variant-and-hooks-spec.md), [08](08-map-draft.md), [10](10-test-plans-neutral-base.md), [11](11-reviewer-plan.md), [12](12-second-pass-verification.md) (the issue list), [13](../13-unity-architecture-plan.md). [09](09-verification-errata.md) and [GDD](../GDD.md) were only searched for ids (the GDD's engine edits were ignored).
Method: full read, plus two scratchpad scripts (not in the repo): (a) a grep of all files for stale ids, spellings and leftover words; (b) a parse of every fenced JSON block in 05 and 06 and a render check of every 05 template against the 06 section 8 payload table. Line numbers are as read on 2026-10-03.
Severity as in 12: **P0** = breaks a stated CI check or shows the player a false outcome; **P1** = contradicts an owner decision, another spec or a test; **P2** = wording or housekeeping.

**Results in one paragraph.** Of the 42 items in 12 (counting X3b, the JSON reflow and 11's spellings), 37 are resolved (three of them expose a new defect), 4 are partly resolved (X6, M2, M5 on the 05 side, M10) and 1 is open (11's spellings). All JSON blocks parse (05: 10 complete documents; 06: 2 complete documents plus 13 key snippets that parse when wrapped in `{}`, by design). All 14 event and error ids of 06 section 8 have a template in 05, and every placeholder is a payload field. The edits did introduce or expose **2 P0s** (N-1 the `ev.pop_lost` text fails V-04; N-2 `ev.site_taken` tells a losing player "Your forces took ..."), **9 P1s** and about 20 P2s, listed in section 2.

---

## 1. Re-verification of every item in 12

| Id | Status | Evidence (file, line) | Remaining fix |
|---|---|---|---|
| X1 | resolved | 05 L546-547 (no `{unit}`; `@f2` variant) | none |
| X2 | resolved | 05 L536 `"{season} begins."` | none |
| X3 | resolved (another route) | 06 L775-779 rule 2; 05 L539-541 `ev.match_won.player` / `.opponent`, no base key; 13 L485 agrees | P2: 05 L541 `_ev.match_won.note` says "Payload winner_slot." twice; delete one |
| X3b | resolved (another route) | 06 L776: the receiving slot chooses `@<slot>` for every event; `winner` renamed `winner_slot` (L248, L692, L790) | none |
| X4 | resolved, new defect | 05 L514-521, V-11 L1030 lists all 14 ids | see **N-1** (P0) |
| X5 | resolved, new defect | 05 1.2 L49, 7.5 L927-953 | see **N-3** (P1): 05's names for the 11 positions are not 08's |
| X6 | partly | 05 L545, L600, L955-963 now avoid "area area" | see **N-4** (P1): 05 now breaks 06's display-name rule |
| X7 | resolved | 05 X-5 L121, 7.4 L925 | see N-5 (a new stale line in X-9) |
| X8 | resolved | 05 V-16 L1035 | P2: 05 L351 still says "`max_turns` for the variant"; write "for the scenario" |
| X9 | resolved | 05 X-8 L124, `_brief.goal.note` L632 | none |
| X10 | resolved | 05 L543 | none |
| X11 / Y3 | resolved | 05 L177-178; 06 L337, L48 | none |
| X12 | resolved | 05 L376 | none |
| M1 | resolved | 06 L646 (Jhenidah); "Jhenaidah" only in change logs and as a 07a quote | none |
| M2 | partly | 08 "Bogra" only in L251, L262 (allowed) and the change log | P2: 08 L313 reads "Bogura / **Bogura**"; write "Bogra / Bogura" (08's own change-log row S3 says this was kept, but it is not on disk). 11 L152 and L189 not edited (see N-8) |
| M3 | resolved | 08 L221-241 "Group (06)" column; 06 L627-642 table; both give the same 16-tile mapping | see N-19 (cells vs tiles) |
| M4 | resolved | 08 L251 "Jhenaidah [as in 07a]" | none |
| M5 | resolved in 06/08, partly in 05 | 06 L222, L227-232 new predicate `initial_sites_held_at_most_pct` with `tags_any`; 08 L269, Q5 L468, Q13 L476 closed | see **N-5** (05 still names the old predicate); P2: 08 L269 "`site.camp_NN` outposts must not be added as AI start positions" contradicts 06 L572-573, which keeps `site.camp_01` and excludes it with `tags_any`: write "outposts, if any, are excluded by the predicate's `tags_any` (06 H4)" |
| M6 | resolved | 05 L882, L903; 06 L646; 08 L261, L478 all say "about 45 km, about 9-11 tiles" | none |
| M7 | resolved | 08 L22 | P2: 08 L436 "a third of the 88-turn game"; write "89-turn" |
| M8 | resolved | 08 L315, Q7 L470 | none |
| M9 | resolved | 08 L92, L225, L265, L286, L479 use "07c row n" | P2: 08 L301 still has `[07c#25, A26]`; write "[07c row 25, A26]" |
| M10 | partly | 08 L267 "7 to 15 or 16 December (single source)" | P2: 05 L750 (entry 16) and L909 (gazetteer Sylhet row) still say "7-16 Dec"; write "7 to 15 or 16 Dec (single source)" in both |
| L1 | resolved in 08 | 08 L244, L335 | new hit outside 08: 04 L157 "(Roumari, 27 Aug 1971 [01])"; write "(Roumari, August 1971 [01])" |
| L2 | resolved | 08 L259 "Eastern Command HQ [T23]" | none |
| L3 | resolved | 08 change-log S1; remaining hits are change-log history only | none |
| L4, L5 | resolved | 05 change log L1178; entries 18 and 24 clean | none |
| S1 | resolved | 05 L807-823 publication descriptors + `source_ref` | none |
| S2 | resolved | 05 L759 | none |
| S3 | resolved | 05 L726, V-07 L1026 restate rule 5 with no exception | P2: 04 rule 5 L282 does not mention `consensus`; add "A figure that two independent sources give the same way may show low = high inside its figures block (05 6.1); it never appears outside the block." |
| S4, S5, S6 | resolved | 05 L747, L589, L752 | none |
| S7 | info, unchanged | reviewer-gated | none |
| S8 | resolved, new defect | 04 3.1 L169-179, rule 2 L279, rule 4 L281 | see **N-6** (P1): 04 and 11 still promise "nobody dies" |
| Y1, Y2, Y4 | resolved | 06 L246, L548, L664 | none |
| 12 §5 cosmetic | resolved | 06 L546 on its own line | none |
| 12 §7.1 risk 5 (11 spellings) | open | 11 L152, L189 | see N-8 |

---

## 2. New findings (N-series), with the exact fix

### 2.1 P0

| Id | Where | Problem | Exact fix |
|---|---|---|---|
| **N-1** | 05 L514 `ev.pop_lost` | "volunteers **returned** home" does not contain the phrase V-04 requires ("return home" or "stood down"; the substring "return home" is not in "returned home"). The primary shortage event fails V-04 the day it is checked. | `"ev.pop_lost": "Rice ran short at {base}: {amount} volunteers had to return home."` |
| **N-2** | 05 L531-532 `ev.site_taken`; 06 L786 and L776 | 06 sends `ev.site_taken{site, from, to, via}` to **both** `from` and `to`, and the template is chosen by the receiving slot only. When f2 raids a real-place site that f1 captured earlier (the raid becomes a capture, H2), f1 is the `from` slot, gets the base key and reads "Your forces took {site}". This is the X3 defect again for a different event. | 06 section 8: extend rule 2 to `ev.site_taken`: "no base template; the theme writes `ev.site_taken.gained` (when `to` equals the receiving slot) and `ev.site_taken.lost` (otherwise)", and change the table row's "Theme key name". 05: replace L531-532 with `"ev.site_taken.gained": "Your forces took {site}. Its stores are now yours."`, `"ev.site_taken.lost": "{site} could not be held and was taken by the opposing force."`; in V-11 (L1030) list `ev.site_taken.gained` and `.lost` in place of `ev.site_taken`. 13 L485: add `ev.site_taken` beside `ev.match_won` in the key-mapping sentence. |

### 2.2 P1

| Id | Where | Problem | Exact fix |
|---|---|---|---|
| **N-3** | 05 7.5 L944-949 (`names/sites.json`); 05 3.3 L310 (pool) | The 11 `site.town_NN` names are Faridpur, Noakhali, Brahmanbaria, Habiganj, Dinajpur, Rajshahi, Pabna, Kushtia, Khulna, Barisal, Mymensingh. 08 already fixes the 11 positions (4.2-4.3): Khulna, Mymensingh, Brahmanbaria, Chandpur, Hilli, Kushtia, Rajshahi, Tangail, Mongla, Narayanganj, Feni; and 08 L297 says Dinajpur, Pabna, Barisal and Noakhali are **not** placed. Six names disagree; five of 08's places (Chandpur, Hilli, Mongla, Narayanganj, Feni) are missing from the name pool. | 05 7.5: `"site.town_01": "Khulna garrison", "site.town_02": "Mymensingh garrison", "site.town_03": "Brahmanbaria garrison", "site.town_04": "Chandpur garrison", "site.town_05": "Hili garrison", "site.town_06": "Kushtia garrison", "site.town_07": "Rajshahi garrison", "site.town_08": "Tangail garrison", "site.town_09": "Mongla garrison", "site.town_10": "Narayanganj garrison", "site.town_11": "Feni garrison"` (the Hili/Hilli display spelling is the owner's; see 4.1 rank 4), and change the L931 lead-in to "the 11 positions of 08 sections 4.2-4.3, in that order (PROVISIONAL until the final map)". 05 L310: add Chandpur, Hili, Mongla, Narayanganj and Feni to the pool. |
| **N-4** | 06 L644 vs 05 L545, L600, L955 | 06's display-name rule says a template "must not add its own 'area' or 'point' word" around `{group}`. 05 deliberately does (`"No entry point in the {group} area is clear"`, `"Entry point, {group} area"`) with plain names ("Sector 8"). Both files cannot pass the same coverage check. 05's version is coherent and reads well. | 06 L644: replace "so the template must not add its own 'area' or 'point' word around it" with "a template may wrap it in fixed words (for example 'the {group} area'), provided the display name itself does not repeat them; the theme states the pairing once (05 7.5)". |
| **N-5** | 05 X-9 L125; change log L1161 | Still says "06 H4 `base_count_pct_of_start` must be restricted to that set (06 is edited separately; 06 M5)". 06 has replaced it with `initial_sites_held_at_most_pct{slot, at_most_pct, tags_any}`, computed once at scenario load. | L125: "06 H4 implements this as `initial_sites_held_at_most_pct` with `tags_any: [capital, fortress, defence_zone, garrison_town]`; the starting count is fixed at scenario load (20 per 08), and positions founded later count on neither side (06 L227-232)." Leave L1161 as history, or append "(done in 06 second pass)". |
| **N-6** | 04 L153 ("volunteers go home; nobody dies"), L258 ("(nobody dies)"), L281 ("a shortage means volunteers go home and nobody dies"), L333 ("nobody dies"); 11 L117 ("the simulation models nobody dying of hunger") | These promise exactly what 06 R-14, 05 V-04 and 04 rule 4 itself forbid text to claim (the rules cannot tell going home from dying). 04 rule 4 contradicts itself in one sentence. | 04 L153: "**Supply shortfall: shown as volunteers going home.** The text makes no claim about death either way." L258: "that a shortage is shown as volunteers going home". L281: "In text: a shortage is shown as volunteers going home or standing down; the wording adds no claim the rules cannot back (no 'nobody dies', no 'nobody was harmed')". L333: "shortage is shown as volunteers going home". 11 L117: "A supply shortage is shown as personnel standing down and going home. Caveat to disclose: the rules cannot tell going home from dying; the meaning is in the wording only (SC 3.1, 06 R-14)." |
| **N-7** | 10 L399; 10 L417 | (a) L399 lists `start_base_count` as a new state field: 06 removed it (L250, change-log row 3); `initial_site_count` is scenario-load data, not state. (b) L417 "`H4 x H1` arrivals reset the clock" asserts the opposite of 06 L738 ("Founder arrivals do not reset the loss clock; only holding a base does"). A test written from 10 would pin the wrong rule. | (a) "New state fields (`site_id`, `no_base_turns`) ...; `initial_site_count` is computed at scenario load and is never state (06 H4)." (b) "`H4 x H1`: a founder arrival resets only the grace counter `no_base_turns`, never the homeless counter (06 7.2)." |
| **N-8** | 11 L125, L152, L189; 11 4.3, A.5, section 5 | (a) L125 says "N fortress towns ... N/K still open per 09 A.3.1": the owner set K = 6 and N = 3 (only 3 vs 4 is still offered, 08 Q5). (b) L152 lists "Jhenida, Bogra, ... Bhairab Bazar" and "fortress towns". (c) 4.3 does not disclose the capture side (captured AI personnel count as the player's volunteers, 06 R-7). (d) No questionnaire item for the text-level mitigation that 04 section 10 item 0 assigns to a Bangladeshi historian, and none for the "garrison position" terms and the 25% reading (05 10.2 #20). | (a) "surrender win test (the capital garrison, or 3 of the 6 fortress positions while the opponent holds at most a quarter of its 20 starting garrison positions; owner set K = 6 and N = 3; 4 of 6 is still offered, 08 Q5)". (b) "The fortress positions (owner's display spellings: Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; 07a writes Jhenaidah, Bhairab Bazar) ..."; L189: add "owner's current display choices: Bogura, Jhenidah, Bhoirab". (c) Add a 4.3 bullet: "**Capture.** A captured position keeps its staffing count, so the opponent's personnel are counted as the player's volunteers; the text never narrates this (06 R-7)." (d) Add A.8 to Questionnaire A: "Text-level mitigation (SC 3.1 and rule 4, item 0 of SC section 10): shortage templates, capture templates, the `limits` entry and `debrief.different.body`. Is the wording honest without promising what the rules cannot back?" and add to A.5: "'garrison position', 'fortress position', 'defence zone', 'capital garrison' instead of 'town'; is 'a quarter of its starting garrison positions' a fair reading (05 10.2 #20)?" |
| **N-9** | 13 L67 (section 1.3) | "Every test name in TP10; only the harness changes" is not true: several 10 names are Python-only (`test_no_conditional_pygame_import_anywhere_in_core`, `test_core_has_no_pygame`, `test_core_dataclasses_are_frozen`, `test_core_math_names_are_integer_safe` (`math.isqrt`...), `test_no_unordered_iteration` (`SetIterGuard`), `test_replay_identical_under_two_hash_seeds`, `test_hash_seed_runner_really_varies_hash`, `test_hash_stable_across_python_versions`). 13 L526 admits some of this. | 13 L67: "Every test name in TP10 except the Python-specific ones, which are renamed as follows: pygame bans -> `UnityEngine` reference ban (10.4); frozen dataclasses -> sealed/readonly scan; `math` names -> float/`/`/`%` scan; set iteration -> `Dictionary`/`HashSet` enumeration scan; two hash seeds -> three-runtime replay and the `tr-TR` sanity check (3.5); Python versions -> LangVersion 9 parity between Unity and dotnet (2.2)." |
| **N-10** | 13 L544 (10.5 `Bd1971NoCivilianState`) | The state-field snapshot is said to use "the reflected `GameState` field paths (declared field lists, 3.4)". 3.4's declared list is the **hash** field list, which deliberately leaves out bookkeeping fields. A civilian field that is not hashed would slip past check 3 of 06 section 5. | "the full set of `GameState` field paths enumerated by reflection in the test assembly (every field, hashed or not; reflection is allowed in tests, never in Core)". |
| **N-11** | 10 (whole file), 06 section 5 and H4, 05 L139 | No bd1971 spec carries a note that the engine is now Unity with an engine-free C# core; Python names are written as the plan (list in 3.2 below). | Add one dated tooling note at the top of 10, 06 and 05 (text in 3.2). |

### 2.3 P2

| Id | Where | Fix |
|---|---|---|
| N-12 | 13 L244-245 (3.4 canonical form) | State the three hash rules the other specs fix: `_note` and every `_`-prefixed key stripped (10 6.3 `test_rules_hash_independent_of_note_keys`); the ruleset version string not hashed (06 H0.1, 10 `test_rules_hash_independent_of_version_string`); the variant stack (ids and versions, in order) hashed beside the merged document (10 `test_variant_ids_and_versions_are_in_the_hash`). Also: "null omitted" only where null is the declared default (06 H0.1), not for every null. |
| N-13 | 13 L544 "two planted-violation self-tests" | 10 7.3 specifies 14 plants plus the 4c plants of 7.4; write "the planted-violation table of TP10 7.3-7.4". |
| N-14 | 13 L176 `rules/variants/*.allow.json` under `StreamingAssets` | That ships test allow-lists in every player build. Put them in `dotnet/Conquest.Tests/allowlists/` (matches 06 L654 `tests/allowlists/`) and settle 10 Q2 that way. |
| N-15 | 13 L486 (opaque ids in payloads) and 06 L773 | 13 omits `winner_slot` (06 lists it). Neither file says how `{unit}` in `ev.unit_healed` renders (06's opaque list has no `unit`). Add to 06 L773: "`unit` renders as the unit's generated name or, if none, its role label". |
| N-16 | 05 V-24 L1043 | Names a `starfall` theme that 10 and 13 never use (they use `colonial`, `second`, `__empty__`). Write "between `bd1971`, `colonial`, the minimal `second` theme and the empty theme (10 4.1)". |
| N-17 | 05 L16, L1114; 08 L269, L468 | "capital garrison **and/or** 3 of the 6 ..." reads as if the 25% clause could attach to the capital branch. 06's predicate is `any_of(capital, all_of(3 fortresses, 25%))`. Write "the capital garrison, **or** 3 of the 6 fortress positions while ...". |
| N-18 | 05 L1114 | "the extension list X-1 to X-7" -> "X-1 to X-9". |
| N-19 | 05 7.4 L925; 06 L627; 08 section 3 | 05 says "Groups of 3-5 land entry tiles"; 08's E01-E16 are **cells** of its 32x32 grid (1 cell = 4x4 tiles), with 1-3 cells per group; 06 says each group's `tiles` will list "the scenario coordinates of its E-tiles". Add one rule to 06 L627 (and mirror in 05 7.4): "each 08 entry cell becomes the land tiles of that 4x4 block that touch the map edge, in north-to-south then west-to-east order; groups then hold about 3-12 tiles". |
| N-20 | 05 L1030 (V-11) vs 06 L572 | The skeleton keeps `site.camp_01`; 05 `names/sites.json` has only a `_pattern_camp` note, so V-11 ("every `site.*` id has an entry") fails while the camp stays. Either drop `site.camp_01` from 06's skeleton (08 places none) or let V-11 accept the `_pattern_camp` rule for `site.camp_NN`. |
| N-21 | 05 V-04 L1023 | Scope "shortage text" catches `ev.shortage_resolved` (L520, "Volunteers stay."), which has neither phrase. Write "every value under `ev.pop_lost*`, `warn.food_shortage*` and `ev.shortage_warning*` must contain ...". 10 L511's example `key_glob: "ev.shortage*"` should read `ev.pop_lost*` and `warn.food_shortage*`. |
| N-22 | 05 end-screen keys L641 | `end.loss.body` uses `{turns}` but no line says who supplies it; add to X-8: "`{turns}` in `end.loss.body` comes from the `turns` field of the `ev.faction_eliminated` that ended the game". |
| N-23 | 04 section 2 (L49-140), section 11 L323, L164, L160, L152 | Section 2 still uses weekly turns ("WEEK 8"), "enemy river craft" (banned by V-10), a sector base named "Harina" (in India, 08 Q16) and "Recruitment centre"; section 11 says "one week per turn gives about 38 turns". Add one line under the section 2 heading: "Illustrations written before the decisions; superseded by 05 section 5.1 (3-day turns, 89 turns, 'opposing force')". Section 11 bullet 1: "Decided: 3-day turns, 89 turns (0-88), date calendar per 05 X-3." L164 "Elimination ... Shown as surrender; the mechanic is unchanged" -> "bd1971: the player loses after 15 turns with no base area regardless of founders (06 H4); the AI leaves play by the surrender predicate". L160 `tax.rate = 0` -> "`/economy/tax/coin_pct` and `/other_pct` = 0 (06 variant)". |
| N-24 | 10 L10, L11, L437 | V2 "perhaps `null`" (grace stays 15; P2-8 not applied in 06); V3 "may change K of N" (K = 6 from `tag_counts`, N = 3); check 6 "flag name per ER B.2 #7 [VOLATILE]" (settled: `raid_can_destroy`). Mark all three as settled. |
| N-25 | 10 L656 (frame budget 33 ms at 256x256) | 13 L48 and 6.1 tighten it to 16.7 ms; add "(13 6.1 tightens this to 16.7 ms for the Unity renderer)". |
| N-26 | 08 L436, L313, L301 | covered in section 1 (M7, M2, M9). |
| N-27 | GDD L318 (neutral elimination text); no `ev.pop_lost` / `warn.food_shortage` / `winner_slot` in the GDD yet | Not an error (06 G-8.5, G-12 are proposals and the GDD is being amended), but 06 R-14 and check 5 depend on it; the GDD editor should adopt G-8.5 and G-12 before the event table is coded. |

---

## 3. Cross-file consistency (item 2) and the Unity plan against the specs (item 3)

### 3.1 Cross-file table

| Topic | 05 | 06 | 08 | 10 | 11 | 13 | Result |
|---|---|---|---|---|---|---|---|
| Event, error, warning ids and payloads | 14 ids, all placeholders are payload fields (script) | section 8 authority | n/a | via `events.json` lookup | n/a | L485-487 agree | consistent, except N-2 (`ev.site_taken`) and N-4 (display-name rule) |
| `@<slot>` rule | X-1 L117 | L776-779 | n/a | n/a | n/a | L485 | consistent |
| Season ids | `season.pre_wet/wet/dry` -> labels (L328-332) | L801-803 | n/a | n/a | n/a | n/a | consistent |
| Turn arithmetic (26 Mar + 3 days; turn 22 first wet; 3-5 Dec = 84; 16 Dec = 88; `max_turns` 89) | 4.2, 4.3, 6.3 | L486, L592-596, L620 | L22 | soak uses `max_turns` | L125 "89 turns" | L544 "89-turn" | consistent, except 04 section 11 (weekly, N-23) and 08 L436 ("88-turn") |
| 25% clause (20 positions, 1+6+2+11, 25% = 5, K = 6, N = 3, 2 defence zones counted) | brief.goal, X-9 (stale name, N-5) | L232, L471, L615-622 | L251, L269, Q5, Q13 | n/a | stale (N-8) | L339 `initial_site_count` | consistent in 06/08; 05 and 11 need N-5, N-8 |
| Entry ids and E01-E16 | 9 groups `entry.s01..s08, s11` (L959-961) | table L629-640 | column L221-238 | n/a | n/a | n/a | identical mapping in 06 and 08; cells-vs-tiles gap N-19 |
| Fortress and defence-zone names | Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; Chittagong, Sylhet | L646 | L251-267 | n/a | old spellings (N-8) | n/a | consistent in 05/06/08 |
| "garrison position" not "town" | V-27, 7.5, 10.2 #20; remaining "town" hits are real-place history lines (allowed) | L8 | S1 | n/a | L152 "fortress towns" (N-8) | n/a | consistent except 11 |
| "colony", "settler", "tax" in game text | none in any value (only keys such as `ev.colony_founded`, `names.colonies`, exempt by L18) | n/a | change-log history only | n/a | n/a | n/a | consistent |
| Healing and the scout/habitat/hospital split | `[1, 1, 2, 2]`, help text "2 from level three", scouts at habitat | H7 L357-361, variant L414-419 | n/a | n/a | n/a | n/a | consistent |
| Loss rule (no base area for 15 turns, founders ignored) | `ev.faction_eliminated`, `end.loss.body` | H4 step 1, grace 15 note, R-11 | n/a | L417 wrong (N-7) | L125 | n/a | consistent except 10 and 04 L164 |
| Preset `bd1971@0.1` | L130 | L453, L493 | n/a | n/a | n/a | n/a | consistent |

### 3.2 Unity plan (13) against rule keys, hooks, hash rules, JSON Pointers and tests

What agrees: JSON Pointer ops and the `add`/`replace` distinction (13 5.4) fit every op in 06's variant (L387-448); default elision (13 3.4) matches 06 H0.1; the predicate grammar, `tag_counts` and `initial_site_count` are in 13's validator step 5 (L339); combat clamp 50..950 per mille equals 10's 5-95%; the `@slot` rule and `ev.match_won.player/opponent` (13 8.3) match 06 section 8; coverage floors (13 10.6) match 10 13.1; the forbidden-token list and the ten checks are carried over (13 10.5).

Contradictions or gaps: N-9 (test names), N-10 (state-field snapshot), N-12 (hash rules), N-13 (self-tests), N-14 (allow-lists shipped), N-15 (opaque ids). The PYTHONHASHSEED text of 10 3.3 is **replaced**, not contradicted, by 13 3.5's three-runtime replay; 10 needs a pointer to it (below).

Places that still say Python, pytest or pygame and need the tooling note:
- **10:** L24 (default `pytest` run), L28-52 (`conftest.py`, `.py` layout), L76-87 (`@pytest.mark.parametrize`), L95 (`hashseed` mark), all of section 2 (L110-168: `ast` import graph, stdlib allow-list, pygame bans, frozen dataclasses, `SetIterGuard`), section 3.3 (L207-216, `PYTHONHASHSEED`), L235 and L479 (`python -m conquest.tools...`), L328-336 (pygame dummy driver, `fontTools`), L394 (`test_hash_stable_across_python_versions`), L507 (Python `re`), L566 (`hypothesis`), L666 (`cProfile`), section 12 L672-693 (every stage command), L700-703 (`pytest --cov`, `# pragma: no cover`), Q4 L751, Q12 L759.
- **06:** L38 ("Python lines" size estimates), L26 (H0.2 "`sorted()` order"), L193 and L694 (`core.movement.step_cost`), L214 and L696 (`core/predicates.py`), L654 (`tests/test_bd1971_no_civilian_state.py`), L662 ("nested dataclass"), L671 ("monkeypatched schema").
- **05:** L139 ("`shapes.py`").
- Suggested note (one paragraph at the top of each): "Tooling note (2026-10-03): the engine is now Unity with an engine-free C# core (13). Module paths, test files and tools named here in Python form map to 13: `core/x.py` -> `Conquest.Core` type `X`; pytest/NUnit per 13 10.1; `PYTHONHASHSEED` runs -> 13 3.5 three-runtime replay; `ast` checks -> 13 10.4 asmdef, reflection and source scans; pygame/fontTools font checks -> 13 8.4; `sorted()` -> ordinal sort with explicit tie-breaks (13 3.3). Rules, ids, payloads and test intent are unchanged."

---

## 4. Hybrid H (item 4)

| Check | Result |
|---|---|
| 04 3.1 conditions against 06's checks | match: conditions 1-2 rule-level = 06 section 5 checks 1-3, 5, 6, 9 and the accounting check 7; condition 3 text-level = 06 R-14 and 05 V-04; condition 4 = V-04, V-05; condition 5 partly text-level = 06 R-7 and 05 V-21 |
| 04 rule 4 against 05 V-04 / V-05 | match in structure; **wording conflict**: 04 L153, L258, L281, L333 promise "nobody dies" (N-6) |
| Residual risk stated the same way | yes in 04 L179, 06 L656, R-7, R-14, 05 L376, V-04, 10.2 #18, 10 7.4 ("partly in text only"); 11 4.3 lacks the capture half (N-8c) and over-claims on shortage (N-6) |
| Reviewer item in 11 | **partly**: 04 section 10 item 0 assigns it to a Bangladeshi historian; 11 has a related R3 question (5.3 item 5, "personnel stand down" wording) but no R1 item and no capture disclosure (N-8d) |
| 05 text that carries the meaning | `ev.pop_lost` fails V-04 (N-1); `debrief.different.body` and `limits` make no claim (good) |

---

## 5. Remaining placeholders, UNVERIFIED items and undecided choices, ranked by what blocks building

### 5.1 Ranking

| Rank | Item | Blocks | Where |
|---|---|---|---|
| 1 | Owner approvals for the engine: .NET SDK, new Unity project from the Universal 2D template, NUnit/coverlet, D-U1 to D-U5 | **all code** (Phase 0 cannot start) | 13 sections 13-14 |
| 2 | Neutral names `ev.pop_lost`, `warn.food_shortage`, `winner_slot` and the H4 outcome events adopted in the GDD | the engine's event table (Phase 2a) and 06 check 5 | 06 G-8.5, G-12, R-14; GDD L318 (N-27) |
| 3 | Final map: cell-to-tile rule for entry groups (N-19), anchors, `tiles_rle`, garrison contents, stock, pop, `garrison_town` = 11 confirmed; owner questions on river crossings, bridges, map size and founder speed, contact rule | the bd1971 scenario under `--strict` (Phase 5) | 06 section 4 PLACEHOLDERs; 08 Q1-Q3, Q6, Q15, Q17 |
| 4 | Spelling policy: period vs present, "Bhoirab" vs "Bhairab", "Hili" vs "Hilli", the 11 garrison-position names (N-3) | final `names/sites.json`, name pool, reviewer packs; not code | 05 10.2 #10; 08 Q14, 4.4; 11 B.3 |
| 5 | N = 3 vs 4 of 6, and the west-block tilt | surrender tuning and briefing text | 08 Q5, concern 6; 06 R-15 |
| 6 | Surrender wording: signatories and `surrender` entry (09 D11), `end.win.picture`, "agreed to surrender" wording, both-side reviewer gate | release text only | 05 10.2; 11 5.4 item 3 |
| 7 | Art method (and with it palette, fonts, glyph names, banners, audio) | asset production only; Phases 0-2 use code-drawn glyphs | 05 section 8; 13 D-U12 |
| 8 | Thin facts behind mechanics: December effect turn 84 (PARTLY), brigade days (single source), brigades 2 and 3 entry groups (PLACEHOLDER), fortress list (one summary lists five), sector areas (all PROVISIONAL) | `--strict` release gate; numbers may move | 06 3.1, 4, 7.3; 05 10.3 F-1, F-4, F-9 |
| 9 | ASSUMED tunables (season multipliers, healing per level, region bonus, panic, intel seed, `in_flight`) | balance only, tuned by soak | 06 3.1 |
| 10 | Reviewer-gated wording (declaration credit, toll and terms entries, "East Bengal", remembrance line, garrison-position terms) | release only | 05 10.2; 11 |
| 11 | Bengali shaping and font licence | the `bn` locale only | 13 8.4; 05 V-26 |

### 5.2 Ready to build?

| Doc | Verdict | Reason |
|---|---|---|
| 04 | READY WITH PLACEHOLDERS | Decision record and 3.1 are current; fix the four "nobody dies" lines (N-6) and mark section 2 and 11 as pre-decision (N-23) before it goes into reviewer packs. |
| 05 | READY WITH PLACEHOLDERS | Coverage of 06's ids is complete and every placeholder renders; two one-line P0 string fixes (N-1, N-2) and the site names (N-3) first; assets PROVISIONAL by owner choice. |
| 06 | READY WITH PLACEHOLDERS | Rules, hooks, predicate and event table are complete and consistent; scenario coordinates are PLACEHOLDER by design; needs the `ev.site_taken` rule (N-2), the display-name sentence (N-4) and a tooling note. |
| 08 | READY WITH PLACEHOLDERS | Schematic grid and counts are sound (12 re-count stands); the final 128x128 map, cell-to-tile entry rule and owner questions Q1-Q3, Q5, Q6 are still open. |
| 10 | NOT READY | Written for pytest and pygame throughout, and two assertions contradict 06 (N-7); it needs the tooling note and 13's renames before tests are written from it. |
| 11 | READY WITH PLACEHOLDERS | A plan with nothing sent; it states the surrender test and spellings wrongly and lacks the Hybrid H text-level review item (N-8), all to fix before packs are built. |
| 13 | READY WITH PLACEHOLDERS | Consistent with 06 and 10 in substance; needs the owner's install approvals and small fixes (N-9, N-10, N-12 to N-15) before Phase 0. |
