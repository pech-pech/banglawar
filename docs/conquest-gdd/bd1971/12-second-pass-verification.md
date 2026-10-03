# 12 - Second-pass verification of 05, 06 and 08 (after the errata edits)

Status: independent second-pass check, 2026-10-03. **Nothing in 05, 06 or 08 was edited**; every item below is a proposed fix for the spec authors and the owner.
Files checked: [05-theme-pack-spec.md](05-theme-pack-spec.md) (05), [06-variant-and-hooks-spec.md](06-variant-and-hooks-spec.md) (06; its section 8 "Event and key table" is the authority for event ids, payload fields and keys), [08-map-draft.md](08-map-draft.md) (08). Reference: [09-verification-errata.md](09-verification-errata.md) (09), 07a/07b/07c, 10, 11, [../GDD.md](../GDD.md), [../04-theme-architecture.md](../04-theme-architecture.md), [04-sensitivity-comparison.md](04-sensitivity-comparison.md) (SC).
Method: full read of 05, 06, 08 and 09; Python scripts (session scratchpad, not in the repo) that (a) parse every fenced JSON block in 05 and 06, (b) grep the three files for the leftover terms of the brief, (c) recompute the calendar from 26 March 1971 with 3-day turns, (d) re-count 08's terrain grid, sector overlay and marker overlay. Line numbers are those of the files as read on 2026-10-03.

Severity: **P0** = breaks a stated CI check (V-11 coverage or sample-payload rendering) or shows the player a false outcome; **P1** = contradicts an owner decision, the naming rule or another spec, fix before review; **P2** = wording, consistency or housekeeping.

---

## 0. Verdicts and minimal fix lists

| File | Verdict | Minimal fixes (ids below) |
|---|---|---|
| 05 | **PASS WITH FIXES** | P0: X1, X2, X3, X4. P1: X5, X6, X7, X8, X9, S1, S2, S3. P2 as convenient. |
| 06 | **PASS WITH FIXES** (small) | P1: M1 (Jhenidah spelling), X3b (`@slot` resolution rule in section 8), M5 (what the 25% clause counts). P2: Y1-Y4. |
| 08 | **PASS WITH FIXES** | P1: M2 (Bogra to Bogura), L1 (Z Force and "first ... 27 August"), L2 (personal name), M3 (entry-group ids), M5 (close Q5/Q13 against 06's predicate). P2: M4, M6-M10. |

What is right and needs no change: all owner decisions are reflected in substance in all three files (switches dropped; loss = no base for 15 turns regardless of founders, with the grace-15 trick explained correctly; scouts at `bld.habitat`, healing at `bld.scout_post`; capital or 3 of 6 fortresses with the AI at or below 25%; Chittagong and Sylhet as defence zones; assets PROVISIONAL; Hybrid H). Season ids, the variant version `bd1971@0.1`, region ids, entry-group ids, `max_turns` 89 and every calendar date match across 05 and 06. Every JSON block parses. 08's grid counts reproduce exactly.

---

## 1. Cross-spec consistency, 05 against 06

### 1.1 Ids and keys that match (checked)

| Item | 05 | 06 | Result |
|---|---|---|---|
| Season ids and labels | `calendar.json` `season_labels` maps `season.pre_wet/wet/dry` (05 L325-329) | section 8 season table (06 L759-763) | match |
| Season schedule | 05 4.3: 0-21, 22-62, 63-88; theme holds no turn numbers (L330, L352) | 06 L579-583, L765 | match |
| Variant version | preset `bd1971@0.1` (05 L127) | `"version": "0.1.0"`, `bd1971@0.1` (06 L372, L442, L482) | match |
| Region ids | `region.r01`-`r09`, `r11`; sector 10 label only (05 X-6, 7.2) | 06 L564-576 | match |
| Entry groups | `entry.s01` ... `entry.s11`, nine groups (05 7.4) | 06 L502-513 | match (but see X9 and M3) |
| Hook keys used by the theme | `raid_can_destroy` per site (05 L307), healing `[1, 1, 2, 2]` (05 L174) | 06 H2, H7, variant op L403-404 | match |
| Event ids with templates | 05 L528-535, L545-546, L515, L556 | 06 section 8 | 12 of 14 ids have a template (see X4) |
| Old ids | 05 L120 says the five old ids are gone; no template uses them | 06 L748-752 | match |
| Payload field name for sites | `{site}` (05 L523-524) | `site` in payload, `site_id` in state (06 L147, L746) | match |

### 1.2 Findings

| Id | Sev | Where | Problem | Exact fix |
|---|---|---|---|---|
| **X1** | P0 | 05 L535 `ev.arrival_cancelled` | Template uses `{unit}`; 06 section 8 (L745) says the payload is `slot`, `arrival_index`, `reason` and explicitly "no unit placeholder". V-11's sample-payload render fails. Also: the only `via_patron` arrival in the scenario is the AI's (06 L534), and the event goes to the owner slot only, so the text the AI side would see is the relevant one. | `"ev.arrival_cancelled": "A scheduled arrival could not come: the supply link is cut."` and `"ev.arrival_cancelled@f2": "A scheduled airlift could not come: the air bridge is cut."` |
| **X2** | P0 | 05 L528 `ev.season_started` | Uses `{note}`; the payload is `season` only (06 L747, L187). V-11 render fails. | `"ev.season_started": "{season} begins."` If a per-season sentence is wanted, add theme keys `season.pre_monsoon.note`, `season.monsoon.note`, `season.dry.note` and declare a theme-side lookup in 05 1.4 (new X-8), not a payload field. |
| **X3** | P0 | 05 L531 `ev.match_won`; 06 H4 step 3 (L239) | `ev.match_won{winner, reason}` also fires when **f2** wins (`reason: "last_standing"`, the player eliminated after 15 turns without a base). 05's only template says "Eastern Command has agreed to surrender. The war is won in this game." The player would read a victory on a loss. | 05: base text neutral to the cause, plus a per-winner variant: `"ev.match_won": "The war is won in this game."`, `"ev.match_won@f2": "Eastern Command holds the field. The war is not won in this game."` (the surrender sentence already comes from `ev.faction_surrendered`, which fires first, so the duplicate also goes). **X3b (06, P1):** add one line to section 8: "For `ev.match_won` the `@<slot>` override (05 X-1) is chosen by `winner`; for `ev.faction_eliminated` and `ev.faction_surrendered` by `slot`; for every other event by the receiving slot." Without that rule X-1 is undefined for events. Optionally add `ev.faction_eliminated@f2` ("Eastern Command has no garrison left.") for coverage, although under bd1971 f2 surrenders before it can be eliminated. |
| **X4** | P0 | 05 section 5 (no key), V-11 list (L976); 06 L631, L754-755 | 06 makes `ev.pop_lost{base, amount, cause}` the single shortage event (check 4) and `warn.food_shortage{base}` the warning, and section 8 says the theme writes one template per id. 05 has neither; it keeps `ev.shortage_warning` / `ev.shortage_resolved` with an `{n}` placeholder that no 06 payload defines. 06 L755 allows the 05 ids only "if the neutral engine keeps" them, so today the theme is uncovered for the primary ids. | Add to 05 section 5: `"ev.pop_lost": "Rice ran short at {base}: {amount} volunteers return home."`, `"ev.pop_lost@f2": "Rations ran short at {base}: {amount} personnel were stood down."`, `"warn.food_shortage": "Rice is short at {base}. Volunteers will return home next turn unless it is restocked."`, `"warn.food_shortage@f2": "Rations are short at {base}."`. Keep the two old keys only as the 06-sanctioned fallback and mark them so. Add `ev.pop_lost`, `warn.food_shortage`, `ev.unit_healed`, `err.region_cap` to the V-11 enumeration (L976) so it lists all 14 ids of 06 section 8. Wording keeps "return home" / "stood down" for V-04. |
| **X5** | P1 | 05 1.2 folder layout (L48), section 5 | No file maps the scenario's opaque site ids (`site.capital`, `site.fortress_1..6`, `site.zone_1..2`, `site.town_NN`, `site.camp_NN`) to display names. `names/garrisons.json#f2` is a name **generator** pool, but `{site}` in `ev.site_taken`, `ev.raid_result` and `ev.colony_captured` must render fixed real names, and 06 L614 says "which number is which town is the theme's mapping". | Add `names/sites.json` to 1.2 with the explicit map, e.g. `{"site.capital": "Dhaka garrison", "site.fortress_1": "Jessore garrison", ..., "site.fortress_6": "Bhoirab garrison", "site.zone_1": "Chittagong garrison", "site.zone_2": "Sylhet garrison"}`; V-11 checks every `site.*` in the scenario has an entry. |
| **X6** | P1 | 05 L534 `ev.arrival_deferred`; 7.4 (L911) | `{group}` renders through a name map for `entry.sNN`, but no theme file holds that map (`names/sectors.json` maps `region.*` only). If the label is "Entry point, Sector 8 area" as 7.4 says, the template renders "No entry point in the Entry point, Sector 8 area area is clear". | Add an `entry` section to `names/sectors.json` (`"entry.s08": "Sector 8"`) and keep the template, or keep the long label and change the template to `"No entry point at {group} is clear. The team waits across the border."` |
| **X7** | P1 | 05 L120 (X-5 "Open dependency on 06"), L911 ("depends on 06 adopting per-sector entry groups"), change log L1089-1090 | Stale: 06 now emits `ev.match_won`/`ev.match_drawn`, `turns`, `ev.season_started`, per-sector groups and the AI hospital (06 change log rows 2, 10, 12). | Replace the X-5 last sentence with "06 section 8 now provides all of these (2026-10-03)."; delete the 7.4 parenthesis; in the change log mark those "not applied" items as done in 06. |
| **X8** | P1 | 05 V-16 (L981) | "`max_turns` in the variant is not 89": `max_turns` lives in the **scenario** (06 L491, L607, L765), not the variant. | "`max_turns` in the scenario (`settings.max_turns` and `end_conditions.deadline.max_turns`) is not 89, or the two differ". |
| **X9** | P1 | 05 L618 `brief.goal` `{n}`, `{k}` | The theme holds no numbers; the values must come from the scenario (N = `at_least` in the fortress predicate, K = `end_conditions.tag_counts.fortress`). No dependency says who supplies them. | Add to 1.4: "X-9 Briefing parameters `{n}`, `{k}` are read from the scenario's surrender predicate and `tag_counts` by the engine (presentation only)." |
| X10 | P2 | 05 L532 `ev.match_drawn` | Text assumes `reason: "deadline"`; 06 also defines `reason: "all_out"`. Under bd1971 all-out is unreachable (f2 surrenders when the capital falls), so this is a note. | Add `"_ev.match_drawn.note": "bd1971 can only draw at the deadline; all_out is unreachable while f2 surrenders on losing the capital."` |
| X11 | P2 | 05 L174 ("`heals_attached` flag"), L175 (`{min:1,max:n}`) | 06 names the mechanism `/hooks/healing/sources` and the op value `{"min": 1, "max": "level"}`. | Use 06's names in both rows. |
| X12 | P2 | 05 L521 `ev.colony_captured` uses `{site}`; 06 section 8 does not list neutral events | The neutral capture event's payload name (likely `base`) is not fixed anywhere. | Leave until the engine's `events.json` exists; V-11 will catch it. Note it in 05 section 5 intro. |

---

## 2. 08 against 06 and 05

| Id | Sev | Where (08) | Problem | Exact fix |
|---|---|---|---|---|
| **M1** | P1 | 06 L614, L797 | 06 spells the fortress town **Jhenaidah** and calls that "the owner's spelling"; the owner chose **Jhenidah** (05 L16, L307; 08 throughout). | 06 L614: "(Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; 07a)" and "Jessore and Jhenidah are about 45 km apart"; L797: "(Jhenidah, Bogura, Bhoirab)". |
| **M2** | P1 | 08 L147, L168, L261, L269-270, L285, L287, L386, L415, L429, L439, L489 (13 lines; L250 has "Bogura (Bogra)" once) | Owner chose the display spelling **Bogura**; 08 still prints **Bogra** in the fortress table, distances and concerns. 05 and 06 already use Bogura. | Replace "Bogra" with "Bogura" everywhere except where a source's own wording is quoted (e.g. a "[T23]" area list) and in the 4.4 spelling note; the 4.1 table row becomes "Bogura (Bogra) | (9, 10) | Fortress town". |
| **M3** | P1 | 08 section 3 table (L221-238) | 08's 16 entry tiles E01-E16 are not tied to 06's opaque group ids. The mapping is unambiguous from the overlay: `entry.s01` E16; `entry.s02` E14, E15; `entry.s03` E13; `entry.s04` E12; `entry.s05` E10, E11; `entry.s06` E01, E02; `entry.s07` E03, E04; `entry.s08` E05, E06, E07; `entry.s11` E08, E09 (verified against the sector overlay by script). | Add a "Group (06)" column with those ids, and one note: "06 opens at `entry.s08` and `entry.s02` on turn 0; `entry.s02` contains E14, which is 4 tiles from Comilla (concern 3, Q6)." |
| M4 | P2 | 08 L250 | Sentence lists the alternative five-fortress summary as "Jessore, Jhenaidah, Sylhet, Comilla, Rangpur" | Fine as a quotation of 07a; keep, but write "Jhenaidah [as in 07a]" so the spelling is not mistaken for the display form. |
| **M5** | P1 | 08 L268, Q5 (L467), Q13 (L475); 06 H4 `base_count_pct_of_start` (L220), scenario L558-561 | 08 says whether the two defence zones count toward the 25% clause "is not decided". 06's predicate counts **every** f2 base (no tag filter), so in the spec as written the zones count, and so would any optional `site.camp_NN` outposts (06 L560-561) and any base the AI founds later. The owner's wording is "25% of its starting **towns**". With 08's 20 towns and no camps, 06 gives "f2 holds 5 or fewer" (5 × 100 <= 25 × 20). | Owner choice; recommended: (a) zones count (they are garrison towns, and 06 already counts them), (b) drop `site.camp_NN` from the scenario skeleton, or exclude them by giving `base_count_pct_of_start` an optional `tags_any` argument (and `start_base_count` per tag set). Then close 08 Q5/Q13 with "per 06 H4: 25% of 20 = 5" and add the same sentence to 06 section 3.1 row "surrender: AI held bases at most". |
| M6 | P2 | 08 L260, Q15 (L477); 05 L868, L889; 06 L614 | Jessore-Jhenidah separation: 05 and 06 say "roughly 13 tiles on a 128-tile map"; 08 places them about 9 tiles apart ((8,19) to (7,17): 4 by 8 tiles) at its own scale of about 4 x 5 km per tile, where 45 km is about 10-11 tiles. | Use one statement in all three: "about 45 km, about 9-11 tiles at 08's scale; the map author keeps them in different base areas". |
| M7 | P2 | 08 L22 | "about 88 turns" | "89 turns (0-88), 26 March to 16 December". |
| M8 | P2 | 08 L314 | "06 H2 currently has PLACEHOLDER core levels of 4 ... 3 ... 2" | 06 gives concrete core levels (4 / 3 / 3 / 2 / 1 for camps); anchors and contents are PLACEHOLDER; the levels are ASSUMED. Reword accordingly. |
| M9 | P2 | 08 L225 `[07c#13]`, L92, L264, L285 `[07c#18]`, L478 `[07c #28, #30]` | 08 cites 07c **table row** numbers with the `#n` form that 09 uses for **source** numbers (07c source 13 is the radio page, 18 Operation Jackpot, 28 Bhairab Upazila, 30 the flag). | Write "07c row 13" (Hili; source #27), "07c row 18" (Bhairab; source #28), "07c rows 28 and 30" (Harina, airfield); or switch to source numbers. |
| M10 | P2 | 08 L266 vs 05 L736 | Sylhet battle "7-15 Dec" (08) vs "7-16 Dec" (05). Both single-source. | Pick one after checking [T18]; until then write "7 to 15 or 16 December (single source)". |

Checked and consistent: 08 has exactly six `F` (Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab), two `z` (Chittagong, Sylhet), one `@` (Dhaka) and eleven `g`, total 20; K = 6 and N = 3 everywhere; 25% of 20 = 5; Chittagong is nowhere a fortress (each hit of "Chittagong ... fortress" says "not a fortress" or "defence zone"); the 25% clause sits inside the fortress branch only, as in 06; the region-cap note (Dhaka, Comilla and Bhoirab all in sector 2; Jessore and Jhenidah in sector 8) is right on the overlay; 08 uses no ruleset ids that differ from 06. Script re-count of 08: terrain O 218, D 190, R 88, H 44, B 38, A 36, S 19, P 15, X 376, land 458; sector cells 1:75, 2:53, 3:9, 4:25, 5:23, 6:51, 7:56, 8:62, 9:48, 11:56; every land cell has a sector; every entry and town marker sits on `O`; land blocks 224 and 213. All as printed in 08.

---

## 3. Leftovers of dropped or corrected decisions

Hits that are correct uses (a rule saying the opposite, a forbidden-word list, a change-log line, a neutral GDD key such as `homeless_turns_limit`, or the word "colony" inside a ruleset id or the 04 schema key `names.colonies`) are not listed. Remaining items:

| Id | Sev | File and line | Text | Fix |
|---|---|---|---|---|
| **L1** | P1 | 08 L243; 08 L334 | "Roumari, where **Z Force** set up **the first** civil administration on **27 August**"; "Z Force civil administration 27 Aug" | Naming rule (09 P0-7) and A7: "Roumari, where a regular brigade and local citizens set up a civil committee in August 1971 [T10] (the brigade's own account says it was the first)" and "civil administration, August 1971". |
| **L2** | P1 | 08 L258 | "HQ Dhaka under **Niazi** [T23]" | "Eastern Command HQ [T23]". 08 feeds landmark text; no personal names. |
| L3 | P2 | 08 L248, L292, L314, L491 ("pre-placed colonies"); L434 ("settler speed"); L362 ("enemy towns") | Neutral-template vocabulary in a design doc that will be copied into scenario notes | "pre-placed bases", "founder speed", "AI garrison towns". (Not theme values, so V-01/V-02/V-10 do not fire; this is hygiene.) |
| L4 | P2 | 05 L815 | "The earlier '350,000 to 365,000' is deleted" sits inside the Eastern Command figures bullet | Move the remark to the change log so the deleted figure cannot be copied into `figures.json`. |
| L5 | P2 | 05 L744 | "(The 'about 300 extra navigable channels' claim is deleted; the real '300' is one study's count ...)" inside the entry outline | Same: move to the change log or a `_note`. |

Searched with no leftover found: "stand-down" or "never change sides" claimed as a rule (only stated as dropped); "no organising team" in any loss text (05 `end.loss.body` L627 and `ev.faction_eliminated` L533 say "No base area for {turns} turns"); "courier" (06 H7 now `u.scout`; only change-log mentions); "Osmani" (none); "tax" in any theme value (none; V-03 holds); "starv" in any theme value (none; only in V-04's ban list and 06's forbidden-token list); "3 of 5", `fortress_5` as last site, `K = 5` as current (none); season start at turn 23 (none); "April-October" as the monsoon (05 L357, L744 and 06 now say "wider rainy and flood season", correct per 07c); "986 m" as the highest point (05 L204, L744 now correct, Saka Haphong about 1,050 m); "Agartala until 6 December" (none; 05 L730 has Tripura from 3 April, Calcutta from 25 May, rename 6 December); "Calcutta market", "bought", "purchases" claimed (none; 05 L143, L732 say "no purchases are claimed"); `bd1971@1` (only in 06's warning that it does not exist); `ev.match_ended`, `entry.west/north/east` (only in 06's change log).

---

## 4. Calendar arithmetic (recomputed)

Epoch 26 March 1971, turn t = days 3t to 3t+2; 1971 not a leap year.

| Date | Turn | Turn range | Spec claim | Check |
|---|---|---|---|---|
| 26 Mar | 0 | 26-28 Mar | 05 4.2, 6.3 | OK |
| 3 Apr | 2 | 1-3 Apr | 05 turn 2 line | OK |
| 10 Apr | 5 | 10-12 Apr | 05 turn 5 | OK |
| 13-15 Apr | 6 | 13-15 Apr | 05 5.1 digest | OK |
| 17 Apr | 7 | 16-18 Apr | 05 turn 7 | OK |
| 25-27 Apr | 10 | 25-27 Apr | 05 turn 10 | OK |
| 1 May | 12 | 1-3 May | 05 turn 12 "early May (1-3 May)" | OK (fixed) |
| mid May | 16 | 13-15 May | 05 turn 16 | OK |
| 25 May | 20 | 25-27 May | 05 turn 20 (radio to Calcutta) | OK |
| last pre-wet | 21 | 28-30 May | 05 4.2, 06 | OK |
| 1 Jun | 22 | 31 May - 2 Jun | 05 4.2/4.3/6.3, 06 3.1/4/8, first wet turn | OK |
| 7 Jul | 34 | 6-8 Jul | first brigade | OK |
| 12-14 Jul | 36 | 12-14 Jul | conference line, 5.1 digest | OK (11 July falls in turn 35; "mid-July" at 36 is fine) |
| 24-26 Jul | 40 | 24-26 Jul | 05 L688 | OK (fixed) |
| 14-16 Aug | 47 | 14-16 Aug | Jackpot | OK |
| 27/28 Aug | 51 | 26-28 Aug | Roumari | OK for both days |
| 28 Sep | 62 | 28-30 Sep | Kilo Flight, last wet turn | OK |
| 1 Oct | 63 | 1-3 Oct | first dry turn, second brigade | OK |
| 14 Oct | 67 | 13-15 Oct | third brigade | OK |
| 20-24 Nov | 79-81 | 18-26 Nov | Garibpur 20-21 (79-80), Hilli 22-24 (80-81) | OK |
| 21 Nov | 80 | 21-23 Nov | Armed Forces Day line | OK |
| 3 and 4 Dec | 84 | 3-5 Dec | timed effect, joint-command line | OK |
| 6 Dec | 85 | 6-8 Dec | Jessore line | OK |
| 9 Dec | 86 | 9-11 Dec | Meghna crossing | OK |
| 14 Dec | 87 | 12-14 Dec | remembrance line | OK |
| 16 Dec | 88 | 15-17 Dec | deadline, final turn | OK |

Day offsets in 06 L475 (1 June = 67, 1 October = 189, 3 December = 252, 16 December = 265) are right; `max_turns = 89` (turns 0-88) is right; 06's `ev.season_started` test "at the end of turns 21 and 62" is right; 05 4.3 date spans (26 Mar - 30 May, 31 May - 30 Sep, 1 Oct - 17 Dec) are right. Not in any spec but useful: Jackpot training start "about 21 May" is turn 18.

---

## 5. JSON validity

| File | Blocks | Result |
|---|---|---|
| 05 | 8 fenced `json` blocks (L66, L126, L242, L276, L319, L376, L788, L850) | all parse as complete JSON documents |
| 06 | 15 fenced `json` blocks | the variant (L369) and the scenario skeleton (L477) parse as complete documents; the 13 key snippets (L79, L89, L118, L126, L164, L175, L200, L228, L254, L262, L294, L306, L329) parse when wrapped in `{}` and are schematic fragments by design (each shows one key of a larger file). The scenario skeleton uses strings such as `"PLACEHOLDER"` in place of arrays, which is valid JSON and is rejected by `--strict` as 06 L616 says. |
| 08 | no JSON blocks | n/a |

One cosmetic point: 06 L534 joins two array elements on one line (`...not in the 07 files)."},    {"turn": 12, ...`). Valid; reflow for readability.

---

## 6. Sensitivity scan of 05 (against SC section 9, rules 1-12)

| Id | Sev | Where (05) | Rule | Problem | Fix |
|---|---|---|---|---|---|
| **S1** | P1 | L794-798 `toll` block `by` fields | naming rule (05 L17), V-06, [S-9] | The data carries personal names ("R. J. Rummel", "A 2018 study of Christian Gerlach", "A study of Sarmila Bose"). L809 says shipped text shows publications only, but V-06 scans **all** text including `encyclopedia/`, so this block as written fails V-06 the day it is set `ship: true`. | Put descriptors in `by` ("A 1990s political-science study", "A 2018 historical study", "A 2011 book-length study") and keep the names in `sources.json` via a per-claim `source_id`. |
| **S2** | P1 | L745 entry 25 `surrender` | [S-5], V-07 | Body text "prisoners 'about 90,000 to 93,000'" puts a 1,000+ number next to "prisoner" outside a figures block: V-07 as rewritten will fail it, and SC rule 5 wants attributed ranges in a block. | "Prisoner numbers are given as attributed ranges in the `prisoners` figures block; the military/civilian split is disputed." |
| **S3** | P1 | L712 (6.1), L972 (V-07 `consensus`) | [S-5] | 6.1's first sentence says contested figures are "never in the interface" and then allows a `consensus` exception without saying where. SC rule 5 has no consensus exception at all. | 6.1: "... except that a figure marked `consensus: true` may appear, attributed, **in the encyclopedia body**; never in UI, events or digests." Record the exception as an SC rule 5 amendment for the historian (review list 10.2 #2). |
| S4 | P2 | L733 entry 13 | [S-5] | "Commandos: about 160 in the first strike, about 500 trained" in body text duplicates the `ships` block (L818). Below V-07's 1,000 threshold, but force sizes are a contested-figure class. | Body: "Commando numbers are in the figures block." |
| S5 | P2 | L577 `ui.btn.send_surplus` "Send surplus to the camps" | [S-4], SC 02 Don't-1 | "the camps" can read as refugee camps. | "Send surplus to the training camps" or "Send surplus to the government's stores". Reviewer item. |
| S6 | P2 | L738 entry 18 | owner spelling | Fortress list says "Bhairab Bazar" while the display spelling is Bhoirab. | "Bhoirab (Bhairab Bazar)". |
| S7 | info | L724, L758 ("East Bengal"), L745 and L622/L625 (who signed), L602 (remembrance line), L612 (7 March speech, unnamed) | rules 6, 10 | Already reviewer-gated (09 D7, D11, D13; 05 change log L1092-1094). | No change; keep in 10.2. |
| S8 | info | SC L277 (rule 4) and SC 3.1 conditions 3 and 5 | rule 4 | SC rule 4 still says "A shortfall means stand-down, never death or starvation. All five conditions in 3.1 hold." With the switches dropped, conditions 3 and 5 hold in text only (06 R-7, R-14 say so honestly). SC itself was not in this editing round. | Owner/author of SC: add a dated note under rule 4: "Since 2026-10-03, conditions 3 and 5 are text-level (theme wording, V-04, V-21), not rule-level; see 06 section 5." Also SC rule 2 still names the old `raid.destroy_s...` switch; it is now the per-site `raid_can_destroy` flag. |

Checked and clean: no casualty or strength number in any UI string, event template or digest example (digest numbers are game strength values); no real personal name in `en.json`, name pools or context lines; titles stand in for people; Razakar/Al-Badr/Al-Shams only in `paramil` and the glossary (V-13); no religious label in UI; "opposing force" wording, no "enemy" in any value; atrocity never a mechanic or event; loss screen is a game outcome with the historical note (rule 11); "learn more" claims no endorsement (rule 12); flag and emblem handling follows 07c (labelled 1971 or current, flown properly, state emblem never used, reviewer gate, V-19 deny-list `flag.bd`, `flag.pk`, `emblem`, `crest`, protected red cross/crescent/crystal); the `toll` block lists the Government of Bangladesh figure first, every claim is attributed with a per-claim status, "Independent researchers (as summarised)" is gone, the block is `ship: false`; `terms` lost its textbook generalisation and is `ship: false`; `violence` is `ship: false`; Joy Bangla stays excluded (V-14); Shapla never paired with a lily emblem; field hospital has no protected emblem.

---

## 7. Residual risks and what is still undecided

### 7.1 Residual risks, ranked

1. **Event text that misstates the outcome** (X3): until `ev.match_won` gets a per-winner template and 06 section 8 defines how `@slot` resolves for events, a player loss can be announced as a win. Highest because it is visible and contradicts rule 11's "defeat is a game outcome".
2. **Coverage gaps the CI would catch late** (X1, X2, X4, X5, X6): V-11 fails today on two placeholders and two missing ids, and two name maps (`site.*`, `entry.*`) do not exist.
3. **The Hybrid H guarantee is now partly text-level** (06 R-7, R-14; S8): capture turns the AI's personnel into the player's volunteers, and the rules cannot distinguish "went home" from "died". Honest in 06, but SC rule 4 still claims all five conditions hold. It also depends on the neutral engine adopting `ev.pop_lost` and `warn.food_shortage` (06 G-8.5, G-12) before it is coded; otherwise check 5 fails by design.
4. **The 25% clause base** (M5): undecided between "all f2 bases" (06 as written) and "starting towns" (owner wording, 08). Changes when the AI surrenders.
5. **Spellings** (M1, M2, S6; 11 L152, L189 still use Bogra/Jhenida): display spelling is now the owner's for six towns only; period vs present spelling for everything else is open, and "Bhoirab" awaits a native speaker.
6. **Playability of 08's map** (08 concerns 1-4, 6): two land blocks joined only by boats, a founder at 1 point per turn, three entries in contact on turn 0 (06's turn-0 opening at `entry.s02` includes E14, 4 tiles from Comilla), and N = 3 achievable inside the west block alone.
7. **Thin facts behind mechanics**: the December effect turn 84 (secondary sources only), brigade arrival turns (days single-source), fortress list (one summary lists five).
8. **Naming leakage from design docs**: 08 still carries a personal name, brigade letters and "colony/settler" vocabulary (L1-L3) that could be copied into landmark or scenario notes.

### 7.2 Still undecided or PLACEHOLDER (owner or later work)

| Rank | Item | Where |
|---|---|---|
| 1 | Art and visuals method: every asset statement PROVISIONAL (palette, fonts, glyphs, banners, section 8 of 05, the "no audio" line) | 05 1.2-1.3, 2, 3.1, 8; 06 scope; 08 header |
| 2 | Does the 25% base include defence zones, outposts and AI-founded bases | 06 H4/3.1; 08 Q5, Q13 |
| 3 | Map: all anchors, `tiles_rle`, entry tile lists, garrison contents, stock, pop, `site.town_NN` count | 06 section 4 |
| 4 | River crossings (ford cells or boats only), bridge destruction, map size and founder speed, contact rule for E06/E11/E14 | 08 Q1-Q3, Q6 |
| 5 | Neutral engine naming `ev.pop_lost`, `warn.food_shortage` | 06 G-8.5, G-12, R-14 |
| 6 | Engine/04 extensions X-1 to X-7 (per-slot override, encyclopedia, date calendar, season id, regions, hospital) plus the new X-8/X-9 above | 05 1.4 |
| 7 | Period vs present spellings; "Bhoirab" confirmation | 05 10.2 #10; 08 Q14 |
| 8 | December effect turn (84, PARTLY); Joint Command date (CONTESTED); brigade 2 and 3 entry areas | 06 3.1, 4, 7.3; 05 6.3 |
| 9 | Reviewer-gated wording: declaration credit, toll and terms entries, surrender entry and picture, "East Bengal", `patron.name@f2`, remembrance line, Freedom-fighter Bangla label | 05 10.2; 09 D-items |
| 10 | Sector areas (all PROVISIONAL), Feni split, sector 10 marker | 05 7.2; 08 2.2, Q8, Q17 |
| 11 | ASSUMED tunables: season multipliers, healing per level, region bonus +5, panic +100 per mille, intel seed, `in_flight` | 06 3.1 |
| 12 | N = 3 vs 4 (offered in 09 as option B) and the west-block tilt | 08 Q5 |

### 7.3 Small 06 items (P2, Y-series)

| Id | Where (06) | Fix |
|---|---|---|
| Y1 | H4 step 1 (L237) | When the homeless limit and the grace counter both reach 15 on the same check, state the reason: "`homeless_limit` takes precedence". |
| Y2 | L536 turn-12 f2 arrival `_note` "arrives at its port site, neutral rule" | The neutral rule (GDD 5.3) is transport arrival at a map edge; say "arrives by the neutral transport rule (map edge)" or give it an `entry` group of f2. |
| Y3 | 05 L174 vs 06 H7 | (Same as X11) one name for the healing mechanism. |
| Y4 | L632 check 5 token `execut` | May collide with neutral identifiers such as an order-execution key; keep, but pre-register the expected neutral exceptions when `events.json` exists. |
