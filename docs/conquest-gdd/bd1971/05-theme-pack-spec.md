# 05 - Theme pack specification: `bd1971` ("1971: The Liberation War")

Status: **specification for the owner's review, nothing shipped.** Date: 2026-10-03.
Scope: the THEME PACK only (`themes/bd1971/`), following the schema in [04](../04-theme-architecture.md). The ruleset variant (`rules/variants/bd1971.json`), the scenario and the engine hooks are written by another agent; where this pack depends on them, the dependency is listed in section 1.4.

Inputs (read as data): [GDD](../GDD.md) section 2.1 (role ids), [03](03-role-mapping-options.md) (options), [04-sensitivity](04-sensitivity-comparison.md) (the 12 content rules), [01](01-timeline-forces.md) and [02](02-geography-logistics-civilian.md) (sourced history).

## 0. Conventions

- **Cites.** `[Tn]` = source n in file 01 (timeline, forces). `[Gn]` = source n in file 02 (geography, logistics, civilian). `[S-n]` = the sensitivity file's content rule n (its section 9). "SC §n" = a section of the sensitivity file (04-sensitivity-comparison). Fact corrections from the fact-check files 07a/07b/07c and the errata report 09 are applied and listed in the change log at the end of this file. Almost every source in 01 and 02 is Wikipedia or a news feature read through a summarising tool, so **every fact here is provisional** and is gated by the review list in section 10.
- **Status tags** (used in sections 4, 6, 7):
  - `VERIFIED` = stated in at least two independent source numbers in the research files, with no contradiction between them. It is still reviewer-gated, because those sources are tertiary.
  - `UNVERIFIED` = one source only, a search summary only, or contradicted. An `UNVERIFIED` item is **blocked from a release build** (validator V-17); it may appear in development builds with a visible "unchecked" mark.
  - `ASSUMED` = a design or presentation choice made in this document, not a historical claim.
- **Owner decisions applied** (final): treatment Hybrid H; D-A A1; D-B own government as patron, tax 0, December off-map effect; D-C C3 and a hand-made map, 1 turn = 3 days; D-D Volunteers and Support committee; D-E raiding party, 10 land sector regions (sector 10 is a label only) plus a sector cap rule, `equal-nations` for both sides, `arch.indigenous` and `npc.settlement` off; D-F surrender-threshold victory, draw at the deadline; D-G themed labels plus a field hospital.
- **Owner decisions of 2026-10-03 (final, applied in this revision).** (1) The two companion switches (shortage stand-down rule, personnel never change sides on capture) are dropped: the neutral shortage and capture rules apply, and the theme text makes no claim about what happens to people. (2) Loss rule: no base area for 15 turns, regardless of founders. (3) Scout (guide team) recruiting sits at the Volunteer shelter (`bld.habitat`); healing sits in the Field hospital (`bld.scout_post`). (4) Surrender test: hold the capital garrison (Dhaka) and/or 3 of the 6 fortress positions while the AI holds at or below 25% of its STARTING garrison positions. The fortress positions are at Jessore, Jhenidah, Bogura, Rangpur, Comilla and Bhoirab (display spellings chosen by the owner; "Bhoirab" is flagged for native-speaker confirmation next to the common spelling "Bhairab"). Chittagong and Sylhet are defence zones, not fortress positions. (5) Naming of the AI's starting sites (owner, second pass): they are NOT called "towns" in player-facing text, because no town was held by the Pakistan Army at the start of the war; the terms are "garrison position(s)", "fortress position(s)", "defence zone(s)" and "the capital garrison". This renaming is a PROPOSAL flagged for reviewers (10.2 #20); opaque ids are unchanged. (6) The 25% clause counts the AI's starting garrison positions only, not bases it founds later. (7) Visuals and art are fully OPEN: every asset statement below is PROVISIONAL, and the art method is undecided. The limits on what any picture may show (section 8.3) stay binding whatever the method.
- **Naming rule.** No real person is named in any game text, name pool, unit or digest line. Titles stand in ("the Prime Minister of the provisional government", "the commander of Eastern Command"). Scholars and commissions are cited by publication or body, not by name, in the game text; their names live only in the bibliography file (V-06). This is stricter than [S-9], which allows reviewed cameos. A cameo list can be added later by the owner.
- **Word rule.** The word "colony" (and "colonist", "colonial", "settler", "tax") appears in no theme *value* (V-01 to V-03). Role *ids* and *event keys* such as `bld.core` or `ev.colony_founded` are ruleset-owned neutral identifiers and are exempt, because a theme cannot rename them.
- **Point of view.** Every label is what the Bangladeshi side would call its own thing. The AI's labels are plain, factual military terms, never villainous ones.

---

## 1. Overview and pack manifest

### 1.1 What the pack is

| Item | Value |
|---|---|
| Pack id | `bd1971` |
| Display name | "1971: The Liberation War" |
| Player side | slot `f1`, "Bangladesh Forces", patron "the Mujibnagar Government" (Calcutta) [T2][T8][G3] |
| AI side | slot `f2`, "Pakistan Army, Eastern Command" [T23] |
| Slots `f3`-`f6` | present for coverage only; locked off by the scenario and labelled "Unused slot" |
| Ruleset | `conquest-core` major 1. The pack pairs with variant `bd1971` through a bundle preset (section 1.4) but never contains rules. |
| Locales | `en` for v1. `bn` (Bangla) planned and **not machine-translated**: it needs native speakers (section 10). |
| Time scale | 1 turn = 3 days from 26 March 1971; turns 0-88 (section 4) |
| Treatment | Hybrid H: no civilians in the simulation; remembrance, dated context lines and an encyclopedia carry the human story |

### 1.2 Folder layout

```
themes/bd1971/
  theme.json                 # manifest (below)
  roles.json                 # role id -> label keys, glyph, colour; per-slot overrides (1.4)
  factions.json              # f1, f2 identity, colours, flags in words, name pools
  calendar.json              # epoch, 3-day step, season LABELS only (section 4; the scenario owns season turns)
  names/
    bases.json  garrisons.json  commanders.json  flotillas.json  landmarks.json  sectors.json
    sites.json                 # opaque scenario site ids -> display names (7.5)
  text/
    en.json                  # every key (section 5)
    en.pseudo.json           # accented, +30% test locale (04 D-9)
  flavour/
    almanac.json             # DATED CONTEXT LINES (re-uses 04's optional almanac slot)
    briefings.json           # mission text keys, end-screen schedule
  encyclopedia/
    index.json  entries/*.json  figures.json  glossary.json  sources.json
  shapes.json                # fallback painter parameters (PROVISIONAL, art method undecided)
  assets/ manifest.json      # pictures (none required; section 8) (PROVISIONAL: the art method is undecided)
  audio/  manifest.json      # empty in v1 (PROVISIONAL)
```

Everything under `encyclopedia/` is a **proposed extension** to 04's folder list (04 has no encyclopedia). It is presentation-only and carries no numbers the simulation reads. See 1.4.

### 1.3 `theme.json`

```json
{
  "id": "bd1971",
  "version": "0.1.0",
  "extends": null,
  "requires_ruleset": {"id": "conquest-core", "major": 1},
  "default_locale": "en",
  "locales": ["en"],
  "display_name_key": "theme.name",
  "palette": {
    "paper": "#efe9d6", "ink": "#262321",
    "water_deep": "#4a7388", "water_still": "#7fa6a0",
    "open": "#a9c46a", "wood_a": "#5f8f45", "wood_b": "#3d6b4f",
    "rough": "#b09a6a", "peak": "#8a8272",
    "fog": "#000000", "fog_known_alpha": 0.55,
    "f1": "#1f6f4a", "f2": "#44507f",
    "_provisional": "PROVISIONAL: art and visuals are open; these colours are a suggestion, not a decision."
  },
  "fonts": {
    "en": "builtin",
    "bn": "assets/fonts/bengali.ttf",
    "_fallback": "builtin",
    "_provisional": "PROVISIONAL: font choice follows the undecided art method.",
    "_note": "Bangla needs a TTF with full Bengali-script coverage and a licence that allows bundling. A candidate is an OFL-licensed family such as Noto Sans Bengali; licence and glyph coverage are UNVERIFIED here and must be checked before 'bn' ships."
  },
  "battle_backdrops": {"t.open": "battle.bg.paddy", "t.wood_a": "battle.bg.grove", "t.river": "battle.bg.khal",
                       "_provisional": "PROVISIONAL: backdrops depend on the undecided art method."},
  "features": {
    "almanac": true,
    "almanac_label_key": "ui.context.title",
    "digest_masthead": "ui.digest.masthead",
    "encyclopedia": true,
    "remembrance_screens": true,
    "debrief": true
  },
  "license": {"art": "original", "text": "original", "audio": "none",
              "_provisional": "PROVISIONAL: the art and audio statements are open because the art method is undecided; 'original' is a provenance goal, not a decision.",
              "_note": "No anthem, no radio-station songs, no photographs, no real insignia (rule 9, SC §10 item 9). These content limits stay binding whatever the art method."}
}
```

Notes:
- **Palette** is a suggestion for the validator's contrast check (04 section 3.4 step 7); none of it is verified against the project's contrast table. Colour-vision note: `f1` green and `f2` blue-violet differ in hue, and the flags also differ in shape (section 3), so no unit is told apart by colour alone.
- `features.almanac` re-uses the optional almanac slot for the **dated context lines** (SC §8.1, 04 section 1.6), so no new engine feature is needed for them. `encyclopedia`, `remembrance_screens` and `debrief` are extensions (1.4).
- **Fonts**: English v1 uses the built-in font; the font file is not bundled. The `_sample` string for Bangla must be rendered by the validator before `bn` is listed in `locales`.

### 1.4 Dependencies on other agents and on 04 (extensions requested)

| # | Item | Owner | Why the theme needs it |
|---|---|---|---|
| X-1 | **Per-slot label override**: key lookup order becomes `key@<slot>`, then `key`. Example: `bld.core.name@f2` falls back to `bld.core.name`. | engine / 04 | One role id has two true names (player "Base area HQ", AI "Garrison HQ"). 04 allows one label per role plus `patron.name_after`. Presentation only; the theme-swap determinism test is unaffected. For events, 06 section 8 states which slot picks the `@<slot>` override; `ev.match_won` is the one exception: it has no base template, only `ev.match_won.player` and `ev.match_won.opponent`, chosen by `winner_slot` against the receiving slot (06 section 8 rule 2; section 5). |
| X-2 | `features.encyclopedia`, `features.remembrance_screens`, `features.debrief` and the `encyclopedia/` folder | engine / 04 | The Hybrid H voice. Pure presentation. |
| X-3 | **Date calendar**: `calendar.json` with `epoch` (ISO date), `step_days` and season LABELS, formatted by the template `ui.calendar.range` (one date-range format everywhere, for example "26 to 28 March 1971") | engine / 04 | 04 section 2.8 only supports `start + step` numbers. The sensitivity file already notes this gap (its section 11). |
| X-4 | Theme-readable `season_id` from the ruleset season table. The variant (06) owns the season ids (`season.pre_wet`, `season.wet`, `season.dry`) and the turn schedule; the theme maps each id to a label through `calendar.json` `season_labels` (section 4.1). | variant agent | The theme labels seasons; it does not own boundaries or turn numbers (section 4.3). |
| X-5 | Theme text for the event ids the variant (06, as amended by 09) emits: `ev.timed_effect_started` (the December cut), `ev.faction_surrendered`, `ev.match_won`, `ev.match_drawn`, `ev.faction_eliminated{slot, reason, turns}`, `ev.season_started{season}`, `ev.arrival_deferred`, `ev.arrival_cancelled`, `ev.site_taken`, and the error `err.patron_link_cut`. The older keys `ev.patron_link_cut`, `ev.victory_surrender`, `ev.deadline_draw`, `ev.defeat_scattered` and `ev.season_change` are gone. | variant agent | The ruleset event ids stay generic (06 hard rule); the theme writes text for them. Section 5 has the text; an id in `events.json` without a template fails V-11, and a template without an id is an orphan warning. 06 section 8 now provides all of these (checked 2026-10-03: distinct `ev.match_won` and `ev.match_drawn`, `turns` in the `ev.faction_eliminated` payload, `ev.season_started` from the season hook, per-sector entry groups). The shortage event and warning are `ev.pop_lost{base, amount, cause}` and `warn.food_shortage{base}` (section 5). |
| X-6 | Sector regions as `lm.region` data **inline in the scenario file** (`scenarios/liberation-1971.json`, region ids `region.r01` to `region.r09` and `region.r11`; sector 10 has no region), not in the theme | variant / scenario agent | The sector cap rule reads region data, and a theme may hold nothing the simulation reads (04 section 2.4). The theme only supplies the display names; `names/sectors.json` maps each `region.rNN` id to its `ui.sector.N` key. Section 7.2. |
| X-7 | Field hospital mechanics (below) | variant agent | See 2.2 "Mechanical changes this pack assumes". |
| X-8 | Briefing parameters: `{n}` and `{k}` in `brief.goal` are supplied by the engine's presentation layer from the scenario, not by the theme: `{n}` = the `at_least` value of the fortress predicate in the surrender predicate (3), `{k}` = `end_conditions.tag_counts.fortress` (6). | engine / scenario | A theme holds no number the simulation reads (04 section 0); presentation only. |
| X-9 | The 25% clause counts the AI's STARTING garrison positions only (the pre-placed garrison positions held at turn 0: the capital garrison, the six fortress positions, the two defence zones and the pre-placed `site.town_NN` positions); bases the AI founds later count toward neither side of the ratio. 06 H4 `base_count_pct_of_start` must be restricted to that set (06 is edited separately; 06 M5). | variant agent | Owner decision of 2026-10-03 (second pass). Validator V-27 checks the brief text. |

**Bundle preset sketch** (`settings/presets/bd1971.json`, a pointer only):

```json
{"id": "bd1971", "ruleset": {"id": "conquest-core", "major": 1, "variants": ["mvp@1", "equal-nations@1", "bd1971@0.1"]},
 "theme": "bd1971", "locale": "en", "scenario": "liberation-1971",
 "_note": "A pointer. The theme never contains a variant id."}
```

---

## 2. Role bindings

Rules for the tables: **P** = player-side label (slot `f1`), **A** = AI-side label (slot `f2`). If A is "same", no `@f2` override is needed. "Glyph" is the fallback painter hint (04 section 2.5) and is **PROVISIONAL**: the art method is undecided, so every Glyph column and `glyph`/`sprite` field in this section is a suggestion that may be replaced. The names are **suggestions**: a name not yet present in `shapes.py` falls back to the category painter (building box, unit figure, terrain diamond), so a wrong hint never breaks the game.

### 2.1 Resources

| Role | P label (singular / plural) | A label | Glyph | Rationale |
|---|---|---|---|---|
| `res.basic` | Bamboo and timber / (mass noun) | same | `log` | Village-grove and bamboo material; extractor sits on groves and near khals ([03] D-D). |
| `res.hard` | Arms and ammunition / (mass noun) | same | `crate` | L1 units cost 1-5 of it, which reads naturally. Arms came from captured Pakistani stocks, from defecting units and police stocks, from Indian supply and training (the border force from March, the Indian Army's Eastern Command from 15 May) and some local making (VERIFIED qualitatively, 07b); no purchases are claimed. "Mined" arms is leak L-6, handled by text (section 6, entry "Where arms came from"). |
| `res.coin` | Fund / Funds | Pay and funds | `coin` | One resource, money only; no gold, no tax. `Funds` is neutral and fits both sides. |
| `res.wares` | Field supplies / (mass noun) | Field stores | `bundle` | Medicine, explosives, radios [03]; the level 3+ input, from the patron or the workshop. |
| `res.food` | Rice / (mass noun) | Rations | `sheaf` | Rice for the movement; rations for the AI's garrisons. |
| `res.pop` | Volunteer / Volunteers | Personnel / (plural noun) | `figure` | [D-D] Volunteers are people who joined; civilians are never spent or lost. The AI reads "Personnel" because "Volunteers" would be wrong for it; both obey [S-4] (text never says people, villagers, population). |

### 2.2 Buildings

Level ladders apply to `bld.core` only (labels per level: `bld.core.name.L1`..`L4`); other buildings keep one name.

| Role | P label | A label | Glyph | Rationale |
|---|---|---|---|---|
| `bld.core` | Base area HQ (L1 Cell, L2 Base area, L3 Liberated area, L4 Liberated district) | Garrison HQ (L1 Garrison post, L2 Garrison, L3 Cantonment, L4 Fortified garrison) | `keep` | A1/D-A: the word for the founded place is "base area". Level names are `ASSUMED` ([03] A1 suggests the ladder). The AI ladder echoes the "fortress concept" in six named fortress positions (at Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab) beside two defence zones (Chittagong, Sylhet) [G16] (07a). |
| `bld.food` | Paddy and granary | Ration depot | `sheaf` | Rice. Houses 40 per level is shown as "volunteer billets" in help text. |
| `bld.basic_extractor` | Bamboo cutters | Timber yard | `log` | Fits the grove and bamboo terrain. |
| `bld.hard_extractor` | Arms cache | Ordnance depot | `crate` | See L-6 note above. Keeps the hill affinity, read as concealment; the variant agent may tune arms to come mainly through the patron. |
| `bld.coin_extractor` | Support committee | Pay office | `coin` | D-D(x). The committee label is supported in substance (07b): local struggle committees (Sangram Parishads) formed from March 1971, and villagers sheltered and fed fighters and hid weapons; no amounts are claimed. The flag stays in the review list and the building help text says only "local contributions". Funding of the exile government is never given as a total. |
| `bld.converter` | Field workshop | Ordnance workshop | `anvil` | Makes field supplies from bamboo, arms and rice. |
| `bld.habitat` | Volunteer shelter | Barracks block | `hut` | Housing for volunteers; **also recruits guide teams** (OWNER 2026-10-03; see below). |
| `bld.attractor` | Radio listening and leaflet centre | Reinforcement airhead | `antenna` | No religious label anywhere [S-8]. P: grounded in the radio's role [G4][T13]; one per base is a "listening centre", not a station (the real station moved twice: Kalurghat, then Tripura, then Calcutta; 07b). A: matches an airlift over a long detour (UNVERIFIED detail, not re-checked in 07a/07b) [G11]. |
| `bld.scout_post` | **Field hospital** | Military hospital | `stretcher` | D-G. Takes over healing from the base HQ; no protected Red Cross/Crescent/Crystal emblem on any glyph or picture (flagged for review, section 10). |
| `bld.garrison` | Fighters' camp | Strongpoint | `tent` | "Camp", not "training camp": most training was in India [T15][G2] (L-10). Adds defending mortars as in the base rule. |
| `bld.port` | Ghat (river post) | River jetty | `jetty` | Exact fit for a river landing; on a river that reaches the border it opens the supply route. Help text explains "ghat". |
| `bld.academy` | Instructors' cadre | Staff school | `book` | Single level; ratings per unit role. |

**Mechanical changes this pack assumes (D-G reasoned choice, to be written into the variant by the other agent).**

The owner asked for a field hospital that takes over healing from the base HQ. The clean way to do it with existing roles is to relabel `bld.scout_post` and give the old scout-recruiting job to another role:

| Change | Detail | Tier |
|---|---|---|
| Healing moves | The base rule heals 1 strength per turn only for units attached to the Colony Center (`bld.core`; GDD 6.3 step 5, 7.2). In `bd1971`, `bld.core` heals nothing; units attached to a base area with a `bld.scout_post` (Field hospital) heal. Heal rate per level is a ruleset number (`ASSUMED`: 1 at L1-L2, 2 at L3-L4, the same `[1, 1, 2, 2]` as 06). Ship healing near a port is unchanged. | T3 small: the `/hooks/healing/sources` entry on a building role (06 H7) |
| Scouts move | OWNER 2026-10-03: scout recruiting sits at the Volunteer shelter. `bld.scout_post` no longer recruits `u.scout` or caps the scout count. `bld.habitat` recruits `u.scout` up to its level (`recruits: {u.scout: {"min": 1, "max": "level"}}` added next to the founder entry, as in 06) and carries the scout support cap (2 per level, `ASSUMED`, same value as today). | T2 variant ops on existing keys |
| Start kit | AI pre-placed bases include a level-1 `bld.scout_post` where the scenario lists one. The player starts with no base, so the player's bases heal only after they build a Field hospital (06 H7, consequence 1). | scenario |
| Why `bld.habitat` | Guide teams are local volunteers, so recruiting them from the volunteer shelter is the least surprising place. The alternatives were rejected: `bld.academy` (single level, no level scaling), `bld.attractor` (already carries immigration and the `disc.remedy` boost). | reasoning |
| Side effect | The field hospital keeps its old costs (2W, then 2M+5W, ...) so the cost table does not change. The AI gets the same change (symmetry, `equal-nations`). | no new numbers |

### 2.3 Units

| Role | P label (singular / plural) | A label | Glyph | Rationale |
|---|---|---|---|---|
| `u.scout` | Guide team / Guide teams | Reconnaissance patrol / patrols | `figure` | Local knowledge of waterways [G14] (opinion essay, so help text says "local knowledge", no claim of effect). |
| `u.founder` | Organising team / Organising teams | Garrison engineering detachment / detachments | `figure_tools` | D-A: crosses the border and founds a base area; the Roumari civil committee of August 1971 [T10] (month only; no day on the label). |
| `u.commander` | Sub-sector commander / commanders | Field commander / commanders | `banner` | Sub-sectors had their own commanders [T8][T9]. Names come from callsign pools (section 3.3). |
| `u.line` | Freedom-fighter section / sections | Infantry company / companies | `figure_rifle` | Groups of 5-10 [T4][T15]. Levels 3-4 are labelled "Regular platoon" (P) per [03] E-units. |
| `u.shock` | Raiding party / Raiding parties | Armoured troop / troops | `dash` | D-E: shock = raiding party (ambush and sabotage [T4][G13]). AI: light tanks [T6][G11]; no tank count is ever printed (the count was not found), and the scenario pre-places only "a handful of light-tank squadrons". |
| `u.ranged` | Mortar section / sections | Artillery battery / batteries | `barrel` | One regular brigade had a field artillery battery (unverified detail; 07a attributes it to a different brigade than [T10] does); the label stays generic. |
| `u.transport` | Country-boat flotilla / flotillas | River gunboat / gunboats | `hull` | The Meghna crossing used local boats [T19]; gunboats and armed boats on the other side [T23]. |
| `u.militia` | Base guard / base guards | Garrison reserve / reserves | `figure_shield` | Generated defenders. P: volunteers, losses read "base guard strength lost" ([03] D-D P1). A: **not** named Razakar, Al-Badr or Al-Shams anywhere in units or events ([S-6]; [03] suggests "Paramilitary", this pack chooses "Garrison reserve" because it avoids both ethnic wording and a label for a group the sources describe as taking part in killings [T14][T25]). Flag for review. |

### 2.4 Terrain (shared by both sides)

| Role | Label | Glyph | Rationale |
|---|---|---|---|
| `t.deep` | Great river (Padma, Jamuna, Meghna) and Bay of Bengal | `waves` | The navigable water; blocks land units; reaches the map edge [G5]. |
| `t.still` | Haor and beel (seasonal wetland) | `reeds` | Impassable in the rules even though real haors are walkable in the dry season [G22]; help text says so. |
| `t.river` | Khal and small river | `ripple` | Land may cross it. |
| `t.open` | Paddy land | `paddy` | Best for rice. |
| `t.wood_a` | Village grove and bamboo | `grove` | Fair fit. |
| `t.wood_b` | Mangrove and sal forest | `mangrove` | Sundarbans [G20]. |
| `t.rough` | Hills and tea-garden slopes | `hills` | The tea-garden claim has no source in the files; label as "Hills" in v1, add the slopes wording after review. |
| `t.peak` | High hills | `hills_high` | The highest point, Saka Haphong in the Mowdok range, is about 1,050 m (1,052 m from SRTM; 1,063 m also published); Keokradong, about 986 m, is better known but not the highest (07c). Either way "Mountains" would mislead. |

### 2.5 Archetypes, factions, patron

| Role | P label | A label | Rationale |
|---|---|---|---|
| `arch.expedition` | Border re-entry movement | Eastern Command | Both sides use this archetype (border or edge start, a patron, may field ranged). The label appears only in setup help. |
| `arch.indigenous` | (off) "Not used in this scenario" | same | D-E: stays off. No community is mapped onto it. |
| `fp.*` (6 profiles) | "Standard training" for every profile | same | `equal-nations` empties their effects; the names exist for coverage. |
| `faction.f1` | Bangladesh Forces (adjective: Bangladeshi) | - | The player. |
| `faction.f2` | - | Pakistan Army, Eastern Command (adjective: Eastern Command) | Factual, [T23]. Exact string pinned by V-12. |
| `faction.f3`..`f6` | Unused slot | Unused slot | Locked by the scenario. |
| `patron` | The Mujibnagar Government | Army headquarters in the west (air bridge) | D-B: own government in exile at Calcutta [T2][T8][G3]; tax 0. AI patron: reinforcements by airlift over a long detour [G11][G31 unverified]. `patron.name_after` is **not used** (independence is the goal; D-F). |
| `npc.settlement` | (off) | same | D-E. |

### 2.6 Abilities, landmarks, score categories

Abilities are scoring hooks (deferred in the MVP) but must be bound for coverage. Labels avoid war-score language.

| Role | P label | Glyph | Note |
|---|---|---|---|
| `ab.hoard` | Careful stores | `coin` | Was "Miser". |
| `ab.populous` | Wide volunteer network | `figure` | Was "Colonist". Never "population". |
| `ab.claimant` | Mapmaker | `compass` | Was "Discoverer". |
| `ab.peaceful` | Disciplined conduct | `banner` | Was "Pacifist". |
| `ab.land_speed` | Local guides | `figure` | Was "Cartography". |
| `ab.sea_speed` | River pilots | `hull` | Was "Navigator". |
| `ab.garrison_plus` | Strongpoint builders | `tent` | Was "Conqueror". |
| `ab.merchant` | Workshop skills | `anvil` | Was "Craftsman". |
| `ab.naval_combat` | River raiders | `hull` | Was "Admiral". Operation Jackpot stays encyclopedia-only [T5]. |
| `ab.envoy` | Broadcast and diplomacy | `antenna` | Was "Missionary"; removes the religion leak (04 P-5). Grounded in radio and missions abroad [G4][G3]. |

Other roles with a neutral placeholder label ("Not used in this scenario") because the variant switches them off: `disc.*` (all 10; discoveries disabled, L-17), `dip.*` (diplomacy deferred), `sov.*` (independence is the goal, not a move), `sc.*` (score categories deferred; text must follow [S-3] if scoring returns). Landmark roles are bound for display: `lm.river` "River", `lm.peak` "Hill", `lm.range` "Hill range", `lm.region` "Region" (sector regions use this; section 7). The "name your discovery" prompt (D-11) is **off**: landmarks come pre-named from the map (`names/landmarks.json`).

### 2.7 `roles.json` excerpt (shows the override mechanism, X-1)

(The `sprite` and `glyph` fields below are PROVISIONAL: the art method is undecided.)

```json
{
  "res.pop":  {"name": "res.pop.name", "icon": "icon.res.pop", "glyph": "figure", "color": "ink"},
  "bld.core": {"name": "bld.core.name", "levels": 4, "sprite": "bld.core", "glyph": "keep",
               "overrides": {"f2": {"name": "bld.core.name@f2"}}},
  "bld.scout_post": {"name": "bld.scout_post.name", "sprite": "bld.scout_post", "glyph": "stretcher",
               "_note": "Field hospital. No red cross, red crescent or red crystal."},
  "bld.attractor": {"name": "bld.attractor.name", "sprite": "bld.attractor", "glyph": "antenna",
               "overrides": {"f2": {"name": "bld.attractor.name@f2"}}},
  "u.shock":  {"name": "u.shock.name", "sprite": "u.shock", "glyph": "dash",
               "overrides": {"f2": {"name": "u.shock.name@f2", "glyph": "tank_light"}}},
  "u.transport": {"name": "u.transport.name", "sprite": "u.transport", "glyph": "hull"},
  "patron":   {"name": "patron.name", "icon": "icon.patron", "overrides": {"f2": {"name": "patron.name@f2"}}},
  "t.deep":   {"name": "t.deep.name", "tile": "tile.deep", "glyph": "waves"}
}
```

---

## 3. Faction identity

### 3.1 Colours and flags (in words only)

| | `f1` Bangladesh Forces | `f2` Pakistan Army, Eastern Command |
|---|---|---|
| Colour | deep green `#1f6f4a` | blue-violet `#44507f` |
| Banner (shape fallback, PROVISIONAL: art method undecided) | A swallow-tailed pennant in the player colour with one plain white ring in the centre. | A rectangular pennant in the AI colour with one plain white diagonal bar. |
| Rule | **Not** any real flag, emblem, seal or crest, unless a reviewer approves it. Facts now researched (07c): the 1971 flag was a green field with a red disc holding a golden map; the plain disc flag was adopted in January 1972; the designer credit is disputed; a 1972 order governs display and respect (penalties for disrespect), and a separate order bars use of the state emblem (which bears a water lily) for trade. Any flag ever drawn must be labelled as the 1971 or the current flag, shown flying properly, never torn, burned, inverted, on the ground or beneath another flag; the state emblem is never used. The reviewer gate stays. The AI banner avoids the green-and-white of the opposing national flag. | |
| Text colour | white on `f1`/`f2` fills; the validator checks the contrast of every text pair (04 section 3.4). | |

Why the player green is acceptable despite the national flag containing green: the colour reads as "Bengal landscape" and the banner shape and ring are generic. A reviewer should confirm (section 10, item 12).

### 3.2 `factions.json`

```json
{
  "f1": {"name": "faction.f1.name", "adj": "faction.f1.adj", "color": "#1f6f4a", "flag": "flag.f1",
         "names": {"colonies": "names/bases.json#f1", "leaders": "names/commanders.json#f1",
                   "transports": "names/flotillas.json#f1"}},
  "f2": {"name": "faction.f2.name", "adj": "faction.f2.adj", "color": "#44507f", "flag": "flag.f2",
         "names": {"colonies": "names/garrisons.json#f2", "leaders": "names/commanders.json#f2",
                   "transports": "names/flotillas.json#f2"}},
  "f3": {"name": "faction.unused.name", "adj": "faction.unused.adj", "color": "#8a8272", "flag": "flag.unused", "names": null},
  "npc.settlement": {"name": "role.unused.name", "plural": "role.unused.name", "sprite": null, "glyph": "lodge", "names": null}
}
```

(`f4`-`f6` repeat `f3`. The `names.colonies` key is the schema's neutral id from 04 section 2.6; it holds *base area* names here. It is a key, not display text, so V-01 exempts it.)

### 3.3 Name pools (fictional patterns only)

**All patterns are invented.** None names a real person. Real place names appear only where a map place is meant (section 7).

**Player base areas** (`names/bases.json#f1`): pattern `"{nature} base"`, with collision suffix `" {n}"` (second use: "Shapla base 2"). Always carries the word "base" so a name can never be mistaken for a real village.

| Pool | Words (transliterated Bengali nature words) | Gloss (general knowledge, `UNVERIFIED`) |
|---|---|---|
| Flowers and plants | Shapla, Bakul, Kash, Shimul, Hijol, Kadam | water lily, bakul flower, pampas grass, silk-cotton tree, hijal tree, kadam tree |
| Birds | Shalik, Doel, Machranga, Chil, Ghughu, Bok | myna, magpie-robin, kingfisher, kite, dove, heron |
| River words | Kheya, Char, Dhara, Beel | ferry crossing, river-island, stream, wetland |

The pool has 16 words (6 + 6 + 4); with the numeric suffix the generator never runs dry in a 90-turn game. The spelling is "Beel" here and in the glossary (one spelling everywhere). Spellings and glosses go to the native-speaker review (section 10). "Shapla" (water lily) appears on the state emblem and "Doel" is the national bird: both are fine as base-name words, but the word is never paired with a water-lily emblem picture. Because these are common nouns, some may coincide with real village names; the suffix "base" and the cosmetic RNG stream (04 P-9) keep this harmless.

**Player commanders** (`names/commanders.json#f1`): callsign pattern `"Commander {bird}-{nn}"`, `nn` = 01-99 (example: "Commander Doel-07"). No personal name is used at all, which satisfies "no real personal names" by construction.

**AI garrison sites** (`names/garrisons.json#f2`): pattern `"{place} garrison"` where `{place}` is a real district centre from the sector table [T9], used as the name of a garrison position: Dhaka, Chittagong, Comilla, Faridpur, Noakhali, Sylhet, Brahmanbaria, Habiganj, Rangpur, Dinajpur, Rajshahi, Pabna, Bogura, Kushtia, Jessore, Jhenidah, Bhoirab, Khulna, Satkhira, Barisal, Patuakhali, Mymensingh, Tangail, Gaibandha. The six fortress positions are at Jessore, Jhenidah, Bogura, Rangpur, Comilla and Bhoirab (spellings chosen by the owner on 2026-10-03; "Bhoirab" is flagged for native-speaker confirmation next to the common "Bhairab"; the place is Bhairab Bazar in Kishoreganj District). Chittagong and Sylhet are defence zones, not fortress positions. The capital garrison is the one at Dhaka. None of these is called a "town" in player-facing text (7.5). Jhenidah and Bhoirab are added to this pool because the earlier pool, taken from the sector table, had neither. Real places are fine here (they are map places). Rule [S-2]: a site named after a real place can be captured but never destroyed (the scenario sets `raid_can_destroy: false` on every site with `real_place: true`, 06 H2); the site is the military installation, not the place. Spelling of other towns (period names such as Dacca against today's Dhaka) is an open owner choice (review item 10.2 #10).

**AI commanders**: pattern `"Commander of Group {nn}"`, `nn` = 01-60 (fictional numbering, no personal names, no real formation numbers). Real division numbers [T23] are not used, so a fictional commander is never tied to a real formation.

**Flotillas**: P pattern `"{river} flotilla {n}"` and A pattern `"{river} gunboat group {n}"`, `{river}` from Padma, Jamuna, Meghna, Karnaphuli, Surma, Kushiyara, Teesta, Dhaleshwari, Madhumati, Pasur, Rupsha, Arial Khan (real river names, section 7; 12 entries so V-18 passes).

---

## 4. Calendar

### 4.1 `calendar.json`

```json
{
  "epoch": "1971-03-26",
  "step_days": 3,
  "format_key": "ui.calendar.range",
  "value_name": "date",
  "season_labels": {
    "season.pre_wet": "season.pre_monsoon",
    "season.wet": "season.monsoon",
    "season.dry": "season.dry"
  },
  "_note": "The season ids are the variant's (06): season.pre_wet, season.wet, season.dry. This file only maps each id to a label key. It holds no from_turn, to_turn or deadline_turn: the scenario owns the season schedule and max_turns (a theme holds no number the simulation reads, 04 section 0). Dates format as a range: turn n shows epoch+3n to epoch+3n+2."
}
```

### 4.2 Turn dates (checked arithmetic)

26 March to 16 December 1971 is 265 days (day-of-year 85 to 350, non-leap year), about 88.3 turns.

| Turn | Dates shown | Note |
|---|---|---|
| 0 | 26-28 March 1971 | start |
| 21 | 28-30 May 1971 | last pre-monsoon turn |
| 22 | 31 May - 2 June 1971 | first monsoon turn (contains 1 June) |
| 62 | 28-30 September 1971 | last monsoon turn |
| 63 | 1-3 October 1971 | first dry-season turn |
| 84 | 3-5 December 1971 | the day open war begins [T1][T3] (3 December) |
| 88 | 15-17 December 1971 | contains 16 December, the surrender date [T19]; **final turn / deadline** |

`max_turns` for the variant is therefore **89** (turns 0-88), `ASSUMED`; the scenario owns the number and the variant agent confirms. The calendar arithmetic above was re-run independently in 09 and is right.

### 4.3 Season mapping and flags

The turn ranges are the scenario's (06 `season_schedule`: `season.pre_wet` turns 0-21, `season.wet` 22-62, `season.dry` 63-88); this table only explains the labels. Schedule status: ASSUMED (the boundary choice is design; the climate fact June-September is VERIFIED).

| Season id (06) | Label key | Turns | Dates | Basis | Status |
|---|---|---|---|---|---|
| `season.pre_wet` | Pre-monsoon | 0-21 | 26 March - 30 May | The monsoon runs from about June to September (07c). | ASSUMED boundary |
| `season.wet` | Monsoon (the rains) | 22-62 | 31 May - 30 September | The monsoon runs from about June to September and brings roughly 70 to 80 per cent of the year's rain (07c; onset about 10 June in the south-east, withdrawal about 20 October on average). The wider rainy and flood season runs roughly April to October, and the north-eastern haors stay flooded from about July to November. | ASSUMED boundary (turn 22 is the turn containing 1 June); the label says only "the rains" |
| `season.dry` | After the rains | 63-88 | 1 October - 17 December | October and November are post-monsoon and December to February is the dry winter; haors stay flooded until about November [G22]. "Dry season" is a simplification, so the label reads "After the rains" (help text: a simplification). | ASSUMED |

Text rule: no season label says who the rains favoured. Accounts differ [T1][G1][G10][G14]; the encyclopedia states that.

### 4.4 Scheduled off-map event dates (coordination)

| Turn | Event | Basis |
|---|---|---|
| 84 | `ev.timed_effect_started`: the AI's patron link is cut and its garrisons' morale drops (D-B ii; scenario effect `te.link_cut`). The effect models the open state war and the blockade anchored on 3 December; it does not depend on the contested Joint Command date | 3 December [T1][T3] (PARTLY VERIFIED, secondary sources only; border fighting began earlier, in late November); Eastern Command's isolation and the blockade [T19][G23] |
| 88 | Deadline: `ev.match_drawn` (reason: deadline) unless the surrender test passed (`ev.faction_surrendered` then `ev.match_won`) | 16 December [T19] |

---

## 5. Locale strings (`text/en.json`)

Conventions: values are a string or a plural map (`one`, `other`); placeholders in `{braces}`; keys beginning with `_` are notes the loader ignores. **The list of `ev.*` and `err.*` keys is the neutral engine's `events.json`/`errors`**: the GDD names only a few (`ev.colony_founded`, `ev.battle_result`, `ev.landmark_named`, `ev.score_table`, `err.insufficient`, `err.not_flat`, `err.level_cap`; see 04 section 1.6), so this sample also covers the events and errors that the GDD's systems imply. The coverage test (V-11) reports any engine key this sample misses; those must be added, not guessed. `@f2` keys are AI-side variants (X-1). All text follows [S-1] to [S-12]: strength points, never body counts; "opposing force", never "enemy". Shortage text says volunteers "return home" or are "stood down", but since the stand-down rule was dropped (OWNER 2026-10-03) the rules apply the neutral shortage loss: the wording is text only and must add no claim the rules cannot back (V-04). Capture text makes no claim about where personnel go. **Event ids follow the variant (06 section 8 is the authority for ids, payload fields and keys)**: the theme writes text for its generic ids (X-5), using only the payload fields 06 lists. The payload field name of the neutral capture events (`ev.colony_captured`, `ev.colony_captured_against`) is not fixed in 06; V-11 will catch a mismatch once the engine's `events.json` exists.
Art and audio statements in this file are PROVISIONAL; the art method is undecided.

```json
{
  "_sample": "1971: The Liberation War. Rice, bamboo and river boats.",
  "_provisional": "PROVISIONAL (art method undecided): credits.licence, end.win.picture, the artwork behind ui.digest.masthead, and any 'no audio in v1' statement. The content limits on what a picture may show (section 8.3) stay binding.",

  "theme.name": "1971: The Liberation War",
  "theme.tagline": "A strategy game about the war, not a record of it.",

  "res.basic.name": "Bamboo and timber",
  "res.hard.name": "Arms and ammunition",
  "res.coin.name": {"one": "Fund", "other": "Funds"},
  "res.coin.name@f2": "Pay and funds",
  "res.wares.name": "Field supplies",
  "res.wares.name@f2": "Field stores",
  "res.food.name": "Rice",
  "res.food.name@f2": "Rations",
  "res.pop.name": {"one": "Volunteer", "other": "Volunteers"},
  "res.pop.name@f2": {"one": "Personnel", "other": "Personnel"},

  "bld.core.name.L1": "Cell",
  "bld.core.name.L2": "Base area",
  "bld.core.name.L3": "Liberated area",
  "bld.core.name.L4": "Liberated district",
  "bld.core.name": "Base area HQ",
  "bld.core.name.L1@f2": "Garrison post",
  "bld.core.name.L2@f2": "Garrison",
  "bld.core.name.L3@f2": "Cantonment",
  "bld.core.name.L4@f2": "Fortified garrison",
  "bld.core.name@f2": "Garrison HQ",
  "bld.food.name": "Paddy and granary",
  "bld.food.name@f2": "Ration depot",
  "bld.basic_extractor.name": "Bamboo cutters",
  "bld.basic_extractor.name@f2": "Timber yard",
  "bld.hard_extractor.name": "Arms cache",
  "bld.hard_extractor.name@f2": "Ordnance depot",
  "bld.coin_extractor.name": "Support committee",
  "bld.coin_extractor.name@f2": "Pay office",
  "bld.converter.name": "Field workshop",
  "bld.converter.name@f2": "Ordnance workshop",
  "bld.habitat.name": "Volunteer shelter",
  "bld.habitat.name@f2": "Barracks block",
  "bld.attractor.name": "Radio listening and leaflet centre",
  "bld.attractor.name@f2": "Reinforcement airhead",
  "bld.scout_post.name": "Field hospital",
  "bld.scout_post.name@f2": "Military hospital",
  "bld.garrison.name": "Fighters' camp",
  "bld.garrison.name@f2": "Strongpoint",
  "bld.port.name": "Ghat (river post)",
  "bld.port.name@f2": "River jetty",
  "bld.academy.name": "Instructors' cadre",
  "bld.academy.name@f2": "Staff school",
  "bld.coin_extractor.help": "Local contributions raise funds. Needs paddy land nearby.",
  "bld.scout_post.help": "Heals units attached to this base area: 1 strength per turn, 2 from level three.",
  "bld.habitat.help": "Shelter for volunteers. Also where guide teams and organising teams join.",
  "bld.attractor.help": "Radio and leaflets bring new volunteers to this base area.",
  "bld.port.help": "A ghat is a river landing. On a river that reaches the border it opens the supply route.",

  "u.scout.name": {"one": "Guide team", "other": "Guide teams"},
  "u.scout.name@f2": {"one": "Reconnaissance patrol", "other": "Reconnaissance patrols"},
  "u.founder.name": {"one": "Organising team", "other": "Organising teams"},
  "u.founder.name@f2": {"one": "Garrison engineering detachment", "other": "Garrison engineering detachments"},
  "u.commander.name": {"one": "Sub-sector commander", "other": "Sub-sector commanders"},
  "u.commander.name@f2": {"one": "Field commander", "other": "Field commanders"},
  "u.line.name": {"one": "Freedom-fighter section", "other": "Freedom-fighter sections"},
  "u.line.name.L3": {"one": "Regular platoon", "other": "Regular platoons"},
  "u.line.name@f2": {"one": "Infantry company", "other": "Infantry companies"},
  "u.shock.name": {"one": "Raiding party", "other": "Raiding parties"},
  "u.shock.name@f2": {"one": "Armoured troop", "other": "Armoured troops"},
  "u.ranged.name": {"one": "Mortar section", "other": "Mortar sections"},
  "u.ranged.name@f2": {"one": "Artillery battery", "other": "Artillery batteries"},
  "u.transport.name": {"one": "Country-boat flotilla", "other": "Country-boat flotillas"},
  "u.transport.name@f2": {"one": "River gunboat", "other": "River gunboats"},
  "u.militia.name": {"one": "Base guard", "other": "Base guards"},
  "u.militia.name@f2": {"one": "Garrison reserve", "other": "Garrison reserves"},

  "t.deep.name": "Great river",
  "t.still.name": "Haor (seasonal wetland)",
  "t.river.name": "Khal (small river)",
  "t.open.name": "Paddy land",
  "t.wood_a.name": "Village grove and bamboo",
  "t.wood_b.name": "Mangrove and sal forest",
  "t.rough.name": "Hills",
  "t.peak.name": "High hills",

  "arch.expedition.name": "Border re-entry movement",
  "arch.expedition.name@f2": "Eastern Command",
  "arch.indigenous.name": "Not used in this scenario",
  "faction.f1.name": "Bangladesh Forces",
  "faction.f1.adj": "Bangladeshi",
  "faction.f2.name": "Pakistan Army, Eastern Command",
  "faction.f2.adj": "Eastern Command",
  "faction.unused.name": "Unused slot",
  "faction.unused.adj": "Unused",
  "patron.name": "the Mujibnagar Government",
  "patron.name@f2": "Army headquarters in the west (air bridge)",
  "patron.help": "Your own government in exile at Calcutta. It sends supplies across the border. Indian help is described in the encyclopedia.",
  "patron.help@f2": "Reinforcements arrive by air over a long route. The airlift is small and slow.",
  "role.unused.name": "Not used in this scenario",

  "ab.hoard.name": "Careful stores",
  "ab.populous.name": "Wide volunteer network",
  "ab.claimant.name": "Mapmaker",
  "ab.peaceful.name": "Disciplined conduct",
  "ab.land_speed.name": "Local guides",
  "ab.sea_speed.name": "River pilots",
  "ab.garrison_plus.name": "Strongpoint builders",
  "ab.merchant.name": "Workshop skills",
  "ab.naval_combat.name": "River raiders",
  "ab.envoy.name": "Broadcast and diplomacy",

  "lm.river.name": "River",
  "lm.peak.name": "Hill",
  "lm.range.name": "Hill range",
  "lm.region.name": "Region",

  "season.pre_monsoon": "Pre-monsoon",
  "season.monsoon": "Monsoon (the rains)",
  "season.dry": "After the rains",
  "season.dry.help": "A simplification: October and November are post-monsoon and the haors stay flooded until about November.",
  "ui.calendar.range": "{from} to {to}",
  "ui.calendar.turn": "Turn {turn}",

  "ev.colony_founded": "An organising team founded {base} in the {sector} area.",
  "ev.colony_founded@f2": "A garrison detachment established {base}.",
  "ev.building_complete": "{building} at {base} is ready.",
  "ev.building_upgraded": "{building} at {base} is now level {level}.",
  "ev.building_demolished": "{building} at {base} was taken down.",
  "ev.unit_recruited": {
    "one": "{n} {unit} joined at {base}.",
    "other": "{n} {unit} joined at {base}."
  },
  "ev.unit_arrived": "A {unit} reached {place} from across the border.",
  "ev.unit_arrived@f2": "A {unit} arrived by air at {place}.",
  "ev.trade_delivered": "The government's stores delivered {amount} {res} to {base}.",
  "ev.trade_delivered@f2": "The air bridge delivered {amount} {res} to {base}.",
  "ev.pop_lost": "Rice ran short at {base}: {amount} volunteers returned home.",
  "ev.pop_lost@f2": "Rations ran short at {base}: {amount} personnel were stood down.",
  "warn.food_shortage": "Rice is short at {base}. Volunteers will return home next turn unless it is restocked.",
  "warn.food_shortage@f2": "Rations are short at {base}. Personnel will be stood down next turn unless stores are restocked.",
  "ev.shortage_warning": "Rice is short at {base}. Volunteers will return home next turn unless it is restocked.",
  "ev.shortage_warning@f2": "Rations are short at {base}. Personnel will be stood down next turn unless stores are restocked.",
  "ev.shortage_resolved": "Rice is back in stock at {base}. Volunteers stay.",
  "_ev.shortage.note": "ev.shortage_warning and ev.shortage_resolved are kept only as the fallback allowed by 06 section 8 if the neutral engine keeps those ids; ev.pop_lost and warn.food_shortage are the primary ids. All are death-neutral (V-04).",
  "ev.labour_short": "{base} has too few volunteers for its buildings. Output is reduced.",
  "ev.unit_healed": "{unit} recovered {amount} strength at the {building}.",
  "ev.battle_result": "Engagement on {terrain} in the {sector} area: {winner} held the field. Your force lost {lost} strength; the opposing force lost {their_lost}.",
  "ev.battle_surrender": "{n} opposing units laid down their arms.",
  "ev.battle_retreat": "{unit} withdrew in good order after a parting shot.",
  "ev.raid_result": "Sabotage raid on {site}: {levels} installation levels put out of action; {stores} of stores seized.",
  "ev.raid_against": "{base} was raided. Stores lost: {stores}. The base held.",
  "ev.colony_captured": "Your forces took {site}. Its stores and quarters are now yours.",
  "ev.colony_captured_against": "{base} could not be held and was taken by the opposing force.",
  "ev.site_taken": "Your forces took {site}. Its stores are now yours.",
  "ev.site_taken@f2": "{site} was taken.",
  "ev.base_dismantled": "{base} was dismantled. The position is empty.",
  "ev.landmark_named": "{place} is now marked on your map.",
  "ev.score_table": "Standing at {date}: {bases} bases held, {routes} supply routes open.",
  "ev.season_started": "{season} begins.",
  "ev.timed_effect_started": "Eastern Command's air and sea links have been cut. Its garrisons report falling morale.",
  "ev.faction_surrendered": "Eastern Command has agreed to surrender.",
  "ev.match_won.player": "Eastern Command has agreed to surrender. The war is won in this game.",
  "ev.match_won.opponent": "The movement is scattered and Eastern Command holds the field. The war is not won in this game.",
  "_ev.match_won.note": "Payload winner_slot. Payload winner_slot (06 section 8). There is deliberately no base ev.match_won template: the engine uses ev.match_won.player when winner_slot equals the receiving slot and ev.match_won.opponent otherwise, then applies any @<slot> override to that key. A surrender sentence is never shown when the opponent wins: surrender text comes only from ev.faction_surrendered (slot f2) and ev.match_won.player.",
  "ev.match_drawn": "The calendar reaches 16 December. The war is not decided in this game.",
  "_ev.match_drawn.note": "bd1971 can only draw at the deadline; reason all_out is unreachable while f2 surrenders on losing the capital garrison.",
  "ev.faction_eliminated": "The movement is scattered: no base area for {turns} turns.",
  "ev.arrival_deferred": "No entry point in the {group} area is clear. The team waits across the border.",
  "ev.arrival_cancelled": "A scheduled arrival could not come: the supply link is cut.",
  "ev.arrival_cancelled@f2": "A scheduled airlift could not come: the air bridge is cut.",
  "ev.mission_complete": "Mission complete: {mission}.",
  "ev.mission_failed": "Mission not met in time: {mission}.",

  "err.insufficient": "Not enough {res}: need {need}, have {have}.",
  "err.not_flat": "{building} needs flat, dry ground. This tile will not take it.",
  "err.level_cap": "{building} cannot go above the base area HQ level ({cap}).",
  "err.out_of_area": "That tile is outside the area of your base area HQ.",
  "err.occupied": "That tile is already in use.",
  "err.water_only": "A ghat must stand at the water's edge, on a river or wetland tile.",
  "err.patron_link_cut": "The supply link is cut. No orders to the government can be sent.",
  "err.patron_link_cut@f2": "The air bridge is cut.",
  "err.no_founder": "An organising team is needed to found a base area here.",
  "err.too_close": "Too close to another base area to found a new one.",
  "err.housing_full": "No room: more volunteer shelter is needed first.",
  "err.recruit_cap": "Your buildings cannot support more units of this kind.",
  "err.not_reachable": "The target is out of reach this turn. The order was cancelled.",
  "err.cannot_attack": "This unit cannot start an attack.",
  "err.no_supply_route": "No supply route: a ghat on a river that reaches the border is needed.",
  "err.already_queued": "That order is already waiting for the end of the turn.",
  "err.not_your_unit": "That unit belongs to the opposing force.",
  "err.region_cap": "This sector area already has a level 3 base area HQ. Only one is allowed per sector.",

  "ui.digest.title": "Situation report",
  "ui.digest.masthead": "SITUATION REPORT - {date} - {season}",
  "ui.digest.context": "Historical context (does not change with play):",
  "ui.digest.nothing": "Nothing to report.",
  "ui.context.title": "Historical context",
  "ui.context.more": "Encyclopedia: {topic}",
  "ui.context.switch": "Show historical context lines",
  "ui.btn.next_unit": "Next {role.u.commander}",
  "ui.btn.end_turn": "End turn",
  "ui.btn.menu": "Menu",
  "ui.btn.mission": "Mission",
  "ui.btn.messages": "Messages",
  "ui.btn.found": "Found base area",
  "ui.btn.undo_found": "Undo founding",
  "ui.btn.build": "Build",
  "ui.btn.upgrade": "Upgrade",
  "ui.btn.demolish": "Take down",
  "ui.btn.recruit": "Recruit",
  "ui.btn.requisition": "Request from the government",
  "ui.btn.send_surplus": "Send surplus to the government's stores",
  "ui.btn.commission": "Appoint a sub-sector commander",
  "ui.btn.attack_take": "Take position",
  "ui.btn.attack_raid": "Sabotage raid",
  "ui.btn.halt": "Halt construction",
  "ui.btn.cancel_attack": "Cancel attack",
  "ui.btn.retreat": "Withdraw",
  "ui.btn.encyclopedia": "Encyclopedia",
  "ui.status.volunteers": "Volunteers",
  "ui.status.sector": "Sector {n}: {area}",
  "ui.status.paused": "Paused",
  "ui.entry.label": "Entry point, {group} area",
  "ui.sector.1": "Sector 1: Chittagong, the Hill Tracts, eastern Noakhali",
  "ui.sector.2": "Sector 2: Dhaka, Comilla, Faridpur, Feni, part of Noakhali",
  "ui.sector.3": "Sector 3: Sylhet to Brahmanbaria, with parts of northern Dhaka (Narsingdi, Gazipur)",
  "ui.sector.4": "Sector 4: Habiganj to Kanaighat",
  "ui.sector.5": "Sector 5: Durgapur to Dawki, Sunamganj and the Surma",
  "ui.sector.6": "Sector 6: Rangpur, part of Dinajpur",
  "ui.sector.7": "Sector 7: Rajshahi, Pabna, Bogura, Naogaon, Natore, Sirajganj, part of Dinajpur",
  "ui.sector.8": "Sector 8: Kushtia, Jessore, Khulna, Satkhira, northern Faridpur",
  "ui.sector.9": "Sector 9: Barisal, Patuakhali, parts of Khulna and Faridpur",
  "ui.sector.10": "Sector 10: the rivers and the Bay of Bengal (naval and special forces)",
  "ui.sector.11": "Sector 11: Mymensingh, Tangail and the Jamuna",

  "menu.title": "1971: The Liberation War",
  "menu.subtitle": "A strategy game of the Bangladesh Liberation War",
  "menu.remembrance": "In remembrance of all who died, those who fought and those who lost their homes, 1971.",
  "menu.new": "New campaign",
  "menu.continue": "Continue",
  "menu.practice": "Combat practice",
  "menu.remembrance_sources": "Remembrance and sources",
  "menu.options": "Options",
  "menu.quit": "Quit",
  "firstlaunch.note": "This game shows military operations in the 1971 Liberation War of Bangladesh. It does not show violence against civilians. Historical notes with sources are included and can be shown or hidden. It is a game about the war, not a record of it.",
  "firstlaunch.ok": "Continue",
  "prologue.title": "Before 26 March",
  "prologue.body": "On 1 March 1971 the national assembly session was postponed. On 7 March a speech declared that the struggle was for independence. On the night of 25 to 26 March the Pakistan Army began Operation Searchlight. Open the encyclopedia for the language movement and the non-cooperation movement that came before.",

  "brief.m1": "Cross the border and found your first base area within {turns} turns.",
  "brief.m2": "Keep {base} supplied with rice and volunteers for {turns} turns.",
  "brief.m3": "Raise a base area HQ to level 2 within {turns} turns.",
  "brief.fail": "The movement could not establish a base in time. Try again with a different entry point.",
  "brief.goal": "Take the capital garrison at Dhaka, or hold {n} of the {k} fortress positions while Eastern Command keeps no more than a quarter of its starting garrison positions. Either makes Eastern Command agree to surrender.",
  "_brief.goal.note": "{n} and {k} come from the scenario (X-8): {n} = the at_least value of the fortress predicate, {k} = end_conditions.tag_counts.fortress. The quarter counts the starting garrison positions only (X-9); positions founded or added later do not count.",
  "brief.fortress_list": "The fortress positions are at Jessore, Jhenidah, Bogura, Rangpur, Comilla and Bhoirab. Chittagong and Sylhet are defence zones and do not count.",

  "end.win.title": "Eastern Command has agreed to surrender",
  "end.win.body": "In this game your forces held the key positions and the surrender test was met. In history, the commander of Eastern Command signed the instrument of surrender in Dhaka on 16 December 1971.",
  "end.win.picture": "Two delegations at a table, with equal dignity.",
  "end.draw.title": "The calendar reaches 16 December",
  "end.draw.body": "The war is not decided in this game. This is a draw, not a loss. In history, the commander of Eastern Command signed the instrument of surrender in Dhaka on 16 December 1971.",
  "end.loss.title": "The movement is scattered",
  "end.loss.body": "No base area for {turns} turns. This is a game outcome, not a record. In history, the war ended with the surrender of Eastern Command in Dhaka on 16 December 1971.",
  "end.remembrance": "In remembrance of all who died, those who fought and those who lost their homes, 1971.",
  "end.learn_more": "Learn more: the Liberation War Museum, Dhaka, and Banglapedia. (Listed as sources only; neither takes part in or endorses this game.)",
  "end.retry": "Try again",
  "end.sources": "Sources",

  "debrief.title": "Debrief",
  "debrief.you": "Your campaign",
  "debrief.stat.bases": "Base areas held at the end: {n}",
  "debrief.stat.regions": "Sector areas with a base: {n} of {total}",
  "debrief.stat.routes": "Supply routes open at the end: {n}",
  "debrief.stat.turns": "Turns played: {n}",
  "debrief.history": "What happened",
  "debrief.history.line": "Open war began on 3 December 1971 and Eastern Command surrendered in Dhaka on 16 December. See the encyclopedia for the months before.",
  "debrief.different": "How this game differs from history",
  "debrief.different.body": "The game has no civilians, scaled-down forces, an AI that follows a fixed plan, and 3-day turns. Shortages lower volunteer numbers at a fixed rate; the game does not model what happens to individual people. When a position changes hands its staffing count stays with it; this is a game simplification, not a claim about what happened to the people there. It shows operations, not the full human story. The encyclopedia covers what the game cannot.",

  "credits.title": "Credits",
  "credits.dedication": "Dedicated to everyone who lived through 1971, and to the memory of those who did not.",
  "credits.sources": "Sources: see Remembrance and sources. Contested figures are shown as ranges with who claims what.",
  "credits.review": "Historical review: {reviewers}",
  "credits.thanks": "Thanks to the institutions that agreed to be named: {institutions}",
  "credits.licence": "All pictures and text are original to this project. No photographs, anthems or insignia are used.",
  "_credits.licence.note": "PROVISIONAL: the picture part of this line depends on the undecided art method; the no-photographs, no-anthem and no-insignia part is a binding content limit."
}
```

### 5.1 Turn-digest examples

**Early game, turn 6 (the date is 13-15 April 1971, pre-monsoon):**

```
SITUATION REPORT - 13 to 15 April 1971 - Pre-monsoon
  An organising team founded Shapla base in the Sector 8 area.
  Rice is short at Shapla base. Volunteers will return home next turn unless it is restocked.
  Engagement on paddy land in the Sector 8 area: Bangladesh Forces held the field.
    Your force lost 2 strength; the opposing force lost 3.
  The government's stores delivered 6 Field supplies to Shapla base.
  ---
  Historical context (does not change with play):
    By mid-April most major towns were under Pakistan Army control, and
    Bengali units, police and Ansar fighters fell back toward the border.
    [Encyclopedia: The first weeks]
```

(Digest numbers are game values. The context line carries no figures [S-5]. This line is `UNVERIFIED`: single source [T6].)

**Monsoon, turn 36 (12-14 July 1971):**

```
SITUATION REPORT - 12 to 14 July 1971 - Monsoon (the rains)
  Sabotage raid on Jessore garrison: 1 installation level put out of action;
    3 of stores seized.
  Raiding party reached the Karnaphuli bank from across the border.
  Field hospital at Hijol base is now level 2.
  ---
  Historical context (does not change with play):
    In mid-July the Bangladesh Forces were organised into 11 sectors at a
    commanders' conference. [Encyclopedia: The sectors]
```

(At turn 40, 24 to 26 July 1971, the same report would carry no sector line, because that line is scheduled for turn 36 only.)

**December, turn 84 (3-5 December 1971):**

```
SITUATION REPORT - 3 to 5 December 1971 - After the rains
  Eastern Command's air and sea links have been cut. Its garrisons report falling morale.
  Doel base could not be held and was taken by the opposing force.
  ---
  Historical context (does not change with play):
    On 3 December Pakistan launched air strikes on Indian airfields and India
    declared war. Open war began. [Encyclopedia: December]
```

---

## 6. Encyclopedia and remembrance content plan

### 6.1 Format and rules

- Location: `encyclopedia/entries/<id>.json`; each entry has `title`, `summary`, `body` (short paragraphs), `source_ids`, `status`, `ship` (true/false) and, where it holds figures, a `figures` block (6.4).
- Default view: **short** (two to five sentences), with "Sources" on every entry. Every claim carries a source id; every entry is reviewer-gated.
- Voice: plain, non-graphic, attributed to the historical command, never written as "the enemy did X this turn" ([S-6], [S-7]).
- **No photographs, no victims' names, no portraits.** No personal names (0).
- **Never in the interface**: contested figures (deaths, refugees, force sizes, ships sunk). They appear only in the encyclopedia as attributed ranges (6.4), as sensitivity content rule 5 requires. The `consensus` flag (V-07) widens nothing beyond that: a figure that two or more independent sources give the same way is still shown only inside the `figures` block of its encyclopedia entry (never in an entry's body text or summary, never in the interface, events, digests, briefings, end screens or the almanac), as an attributed list of who reports it, and the block still needs at least two attributed claims; the flag only lifts the requirement that each claim's low and high values differ. This restates rule 5 and adds no exception to it; the owner and the historian reviewer confirm it (10.2 #2).
- The per-turn context lines can be switched off ([S-8.1]); the first-launch note, the menu remembrance line, the end screens and the credits cannot.

### 6.2 Entry outline

`Status` per section 0: VERIFIED = two or more independent source numbers in the files; UNVERIFIED = single, summary-only or contradicted.

| # | Entry id | Topic | What it says | Sources needed | Status |
|---|---|---|---|---|---|
| 1 | `before.language` | The language movement (prologue) | The Bengali Language Movement is the first gallery in the Liberation War Museum and the roots of the war. **Body text cannot be written from the files**: they say only that the museum covers it. | [G9][G18] mention it only; needs Banglapedia/museum | UNVERIFIED |
| 2 | `before.noncoop` | The March 1971 non-cooperation movement | Same: named as a gallery topic only. | [G9][G18] | UNVERIFIED |
| 3 | `before.march` | 1 March - 7 March | The National Assembly session was postponed on 1 March; on 7 March a speech included the line that this struggle was a struggle for independence. | [T1][T3] | VERIFIED |
| 4 | `searchlight` | Operation Searchlight | The Pakistan Army launched it on the night of 25-26 March; troops moved out from about 11:30 pm; resistance at Pilkhana and Rajarbagh was overwhelmed overnight; for civilians in East Bengal the war began there (place name for reviewer, 09 D7). Attributed to the army command. | [T3][T6][G11] | VERIFIED (arrest time differs: 1:15 am in one source, so no clock time in text) |
| 5 | `declaration` | Declaration of independence | 26 March is observed as Independence Day; the declaration was spread by radio from Kalurghat, near Chittagong, on 26 and 27 March (the world press reported independence mainly from 26 March; more broadcasts followed 28-30 March); the Proclamation of Independence was issued 10 April. **Who is credited is politically sensitive** and is left to the reviewer; the entry names no person. | [T1][T2][T3][T13][G4] | VERIFIED (dates); credit wording gated |
| 6 | `government` | The Mujibnagar Government | Provisional government formed 10 April, oath on 17 April at Baidyanathtala (renamed Mujibnagar, then in Kushtia district, now Meherpur, on the Indian border), operated from Calcutta, coordinated the forces, dissolved 12 January 1972. Titles only. | [T2][T22][G3] | VERIFIED |
| 7 | `forces.regular` | Regular forces | Niyomito Bahini from the East Bengal Regiment, East Pakistan Rifles and police; five EBR battalions revolted; the first regular brigade was formed in July and two more in October 1971 (months VERIFIED, 07a; days single-source). The brigades are not named in game text: the letters used for them in some sources are the initials of real commanders, so the naming rule applies; the entry may say, reviewer-gated, that the brigades were known by the initial of their commanders' names. The commander was chosen at the Teliapara meeting on 9 April 1971, took command on 12 April and took office as Commander-in-Chief with the provisional government on 17 April; the July conference was the first sector commanders' conference, not the first appointment (no person named). | [T4][T20] ; brigade dates [T10][T11] | EBR VERIFIED; brigade months VERIFIED, days UNVERIFIED |
| 8 | `forces.irregular` | Irregular forces | Gono Bahini: mostly young civilians trained in Indian camps and sent back in groups of five to ten. Explains honestly that real recruits came from the civilian population, which the game does not model [S-3.1]. | [T4][T15][G2] | VERIFIED |
| 9 | `sectors` | The 11 sectors | Organised at a commanders' conference in mid-July (11 to 17 July; one source says 12 to 17 July); the areas; sector 10 was naval. Sector boundaries changed during the war: the first sector 8 area (Barisal, Faridpur, Patuakhali) was later split, and sector 9 was formed from it. **Areas only, no HQ names, no sub-sector counts** (counts disagree; if ever wanted, say "5 to 10"). | [T8][T9][G2][G6] | PARTLY VERIFIED (areas in outline; sectors 2, 3, 5, 8, 9, 11 use the 07a wording); HQ names UNVERIFIED |
| 10 | `radio` | Swadhin Bangla Betar Kendra | The station's first broadcasts came from Kalurghat, near Chittagong, on 26-27 March. After an air attack on 30 March it moved to Tripura, near Agartala, from 3 April (one account: 8 April), and on 25 May to Calcutta, where it broadcast for the rest of the war in Bengali, English and Urdu. It was renamed Bangladesh Betar on 6 December. Early name: Swadhin Bangla Biplobi Betar Kendra. One source gives 3 April as the first organised broadcast, so the start date stays reviewer-gated. No songs or anthem reproduced. | [G4][T13] | move to Calcutta 25 May VERIFIED; start and Tripura dates PARTLY |
| 11 | `training` | Training in India | From May, camps in several Indian states: India ran about 30 training centres in May, rising to 84 by September (Indian commentary, unverified). Training totals go into the force-size figures block (6.4), not into body text. | [T3][T15][G2][G33] | VERIFIED qualitatively; numbers CONTESTED |
| 12 | `arms` | Where arms came from | Arms came from captured Pakistani stocks, from defecting units and police stocks, from Indian supply and training (the border force from March, the Indian Army's Eastern Command from 15 May), and some local making. No purchases are claimed. The howitzer/aircraft list is not independently found and is not used; the aircraft of the air flight were donated by Indian authorities. | [G2] | VERIFIED qualitatively |
| 13 | `jackpot` | Operation Jackpot | Naval commandos trained at Plassey (training began about 21 May); the main attacks on Chittagong, Chandpur, Narayanganj and Mongla were on the night of 14-15 August (16 August in another account); the name was also used for the training operation. Ship and commando numbers are in the figures block (6.4). | [T5][G10][G12][G33] | dates VERIFIED with 15/16 Aug note; Plassey now VERIFIED (two sources); totals CONTESTED |
| 14 | `kilo` | Kilo Flight | Formed 28 September at Dimapur; first strikes 3-4 December; its aircraft were donated by Indian authorities. | [T12] | UNVERIFIED (single) |
| 15 | `roumari` | Civil administration in a liberated area | In August 1971, in liberated Roumari, a regular brigade and local citizens set up a civil committee, a hospital, post office, police station and customs post (the brigade's own account of being first; the day is 27 or 28 August, so no day is printed). | [T10] | UNVERIFIED (single) |
| 16 | `battles` | Border battles and the December war | Garibpur (20-21 Nov), Hilli (22-24 Nov, 10-11 Dec), Sylhet (7-16 Dec), the Meghna crossing (9 Dec), the Tangail airdrop (11-12 Dec). **Encyclopedia only; never a game event title.** | [T16][T17][T18][T19][G23][G24][G25][G28] | border battles VERIFIED; Sylhet, Tangail UNVERIFIED (single) |
| 17 | `india` | Indian support | Phases: shelter from March-April; Calcutta HQ and camps from May; arms, training, bases; direct entry from 3 December. Authorised in April per one source. Joint Command: 21 November is observed in Bangladesh as Armed Forces Day, when the army, navy and air force began coordinated operations; Bangladeshi sources date the formal joint command of Indian and Bangladesh forces to 4 December. Border fighting began earlier, in late November. Soviet and US positions in two neutral sentences. | [T3][T4][T7][T15][T27][G2] | VERIFIED (phases); Joint Command date CONTESTED |
| 18 | `eastern` | Pakistan Army, Eastern Command | Factual: HQ Dhaka; five divisional formations by December (three regular divisions and two ad hoc divisional headquarters raised in mid-November without a real increase in troops); strongpoints at border positions and two defence zones; "defence of the east lies in the west"; the "fortress concept": six named fortress positions (at Jessore, Jhenidah, Bogura, Rangpur, Comilla and Bhoirab (Bhairab Bazar)) and independent defence zones at Chittagong and Sylhet (one other summary lists five positions; Jessore was the strongest); isolation by distance, the overflight detour and the blockade. Light tanks, with no count. Human, not villainous ([S-6]). | [T6][T23][T24][G11][G16][G31] | structure PARTLY VERIFIED (07a); flight detour UNVERIFIED |
| 19 | `paramil` | Paramilitary forces and militias | Factual only: Civil Armed Forces; Razakar (a volunteer force created by an ordinance of 2 August 1971, one source says 1 June, and placed under the army on 7 September); Al-Badr (recognised between May and September 1971); Al-Shams (no date). No group linked to the Urdu-speaking community is added (SC rule 6). States that they took part in massacres and political killings **as the sources say**, attributed; never generalises to any community; Biharis are not described as a group ([S-6]). | [T14][T23][T25] | UNVERIFIED (single sources); reviewer-gated |
| 20 | `refugees` | Refugees and relief | Nearly 10 million fled to India (the usual figure; carried in a `refugees` figures block with the `consensus` flag, never in body text); inflows by May; relief by India, Oxfam and UNHCR-led pledges; repatriation January-March 1972. Camp counts are single-source. Composition is **omitted from the default view**; if shown, a range with attribution, reviewer-gated ([S-8]). | [T26][G7][G8][G17] | "about 10 million" VERIFIED as the usual figure; the rest CONTESTED/UNVERIFIED |
| 21 | `toll` | How the toll of the dead is stated | Table of claims (6.4). Explains why numbers differ and says the figure of 3 million is part of Bangladeshi remembrance and disputed by some scholars, as the source says. **Never one number.** | [G8][T26][T1] | CONTESTED (ranges VERIFIED as the sources list them; original publications unchecked) |
| 22 | `violence` | Violence against women | One plain, non-graphic paragraph: it occurred and is recorded; estimates are contested and challenged by some scholars; **not depicted anywhere in the game**. Omitted entirely unless the community reviewers approve it. | [G8] | UNVERIFIED; default `ship: false` |
| 23 | `terms` | The word "genocide" | Used in major Bangladeshi publications and by US diplomats in a cable; most UN members rejected such allegations at the time. Attributed. The unattributed generalisation about genocide-studies textbooks is cut (09 D4). `ship: false` until a Bangladeshi historian reviews it. | [G8] | UNVERIFIED (single) |
| 24 | `geography` | Rivers, monsoon, haors, Sundarbans, Hill Tracts | The delta and the great rivers (about 79% delta plains; about 12% hills in the southeast); the monsoon runs from about June to September and brings roughly 70 to 80 per cent of the year's rain, while the wider rainy and flood season runs roughly April to October; the north-eastern haors stay flooded from about July to November; the Sundarbans; the Hill Tracts (the highest point, Saka Haphong in the Mowdok range, is about 1,050 m; Keokradong, about 986 m, is better known but not the highest). **Says accounts differ on who the rains favoured.** The Hill Tracts entry is geography only; no community is mentioned as a party to the war. | [G5][G10][G14][G20][G21][G22] | geography VERIFIED; monsoon effect CONTESTED |
| 25 | `surrender` | The surrender | 16 December at Ramna Race Course, Dhaka, signed by the commander of Eastern Command and the Indian Eastern Command's commander; prisoner numbers are given as attributed ranges in the `prisoners` figures block, and the military/civilian split is disputed. Dignified: no humiliation. | [T1][T3][T19][G29] | VERIFIED (date, place); prisoner split CONTESTED |
| 26 | `after` | Afterwards | Provisional government dissolved 12 January 1972; large returns January-March 1972; a small number still in India by March 1972 (the figure of about 60,000 now has two reports and sits in the `refugees` figures block, not in body text). | [T2][G7] | dissolution VERIFIED; repatriation UNVERIFIED |
| 27 | `remembrance` | Remembrance | 14 December is observed as the Day of the Martyred Intellectuals; the Liberation War Museum (founded 1996 by citizens, new building 2017) as a place to learn more. Listed as a source; **no claim of partnership**. | [G8][G9][G18][G19] | museum facts VERIFIED; 14 December UNVERIFIED (single) |
| 28 | `glossary` | Glossary | Mukti Bahini, Niyomito, Gono Bahini, Mitro Bahini, Muktijoddha, ghat, haor, khal, beel, Mujibnagar. VERIFIED (07c): Mukti Bahini, Niyomito Bahini, Gono Bahini, Muktijoddha, ghat, haor, beel, Mujibnagar; not re-checked: Mitro Bahini; not found: khal (meaning standard, unverified). Cautions: Gono Bahini shares its name with a later, separate post-1975 force; Muktijoddha is a legally defined term whose definition has changed several times (never applied to named people); ghat means a boat landing here (not the Indian bathing or cremation sense). Bengali script and transliterations need a native-speaker check. **"Joy Bangla" is excluded** until a reviewer approves its use: its meaning ("Victory to Bengal") is verified, but its status is politically contested (declared the national slogan by a High Court ruling in 2020 and a 2022 gazette, stayed by the Appellate Division in December 2024, and strongly tied to one party) (SC §10 item 8). | [T glossary] | partly UNVERIFIED |
| 29 | `limits` | How this game differs from history | No civilians in play, scaled forces, a simplified AI, 3-day turns, no atrocities as mechanics [S-1 to S-3, S-7]. Shortages lower volunteer numbers at a fixed rate; the game does not model what happens to individual people. When a position changes hands its staffing count stays with it; this is a game simplification, not a claim about what happened to the people there. The encyclopedia covers what the game cannot. | - | n/a |
| 30 | `sources` | Sources and uncertainty | The bibliography (6.5) and the statement that most research sources were tertiary. | all | n/a |

### 6.3 Dated context lines (`flavour/almanac.json`)

The schedule maps a turn to a `ctx.*` key; text lives in `en.json`. None contains a casualty figure. Turn numbers use the calendar arithmetic of section 4.2.

| Turn | Date | Line (en) | Sources | Status |
|---|---|---|---|---|
| 0 | 26 Mar | "On the night of 25-26 March the Pakistan Army's command launched Operation Searchlight. For civilians in East Bengal, the war began there." | [T3][T6][G11] | VERIFIED; the place name "East Bengal" is a reviewer item (09 D7) |
| 0 | 26-27 Mar | "26 March is observed as Independence Day. The declaration was spread by radio from Kalurghat, near Chittagong, on 26 and 27 March." (No person credited; topic tag `declaration`.) | [T1][T3][T13] | PARTLY VERIFIED; credit wording gated |
| 2 | 3 Apr | "After an air attack on its first transmitter, the radio station moved across the border to Tripura." | [G4] | PARTLY (date one account says 8 April) |
| 5 | 10 Apr | "A Proclamation of Independence was issued and a provisional government formed." | [T1][T2] | VERIFIED |
| 6 | mid Apr | "By mid-April most major towns were under Pakistan Army control, and Bengali units, police and Ansar fighters fell back toward the border." | [T6] | UNVERIFIED |
| 7 | 17 Apr | "The provisional government's cabinet took its oath at Baidyanathtala, renamed Mujibnagar, in the then Kushtia district (now Meherpur), on the Indian border." | [T2][G3] | VERIFIED |
| 10 | 25-27 Apr | "Large numbers of people crossed into India for safety. Camps and relief were organised in West Bengal, Assam, Meghalaya and Tripura. [Encyclopedia: Refugees]" | [G7][G8][G17] | VERIFIED (no figures) |
| 12 | early May (1-3 May) | "Eastern Command depended on air and sea links to West Pakistan, with Indian territory in between." | [T19][G11] | VERIFIED |
| 16 | May | "From May, India opened training camps for Bengali fighters in several Indian states." | [T3][T15][G2] | VERIFIED |
| 20 | 25-27 May | "The radio station moved to Calcutta." | [G4] | VERIFIED (25 May, 07b) |
| 22 | 1 Jun (31 May-2 Jun) | "The monsoon rains begin. Rivers and flooded fields change how people and supplies move. Accounts differ on who the rains favoured." | [G5][G10][T1] | VERIFIED (June-September monsoon); turn choice ASSUMED |
| 34 | 6-8 Jul | "In July the first regular brigade of the Bangladesh Forces was formed." (No brigade name.) | [T10] | month VERIFIED, day single-source (7 July) |
| 36 | mid Jul | "In mid-July the Bangladesh Forces were organised into 11 sectors at a commanders' conference." | [T8][T9][G2][G6] | VERIFIED (11 to 17 July; one source says 12 to 17 July; so 'mid-July') |
| 47 | mid Aug | "In mid-August naval commandos attacked shipping at the ports of Chittagong, Chandpur, Narayanganj and Mongla." | [T5][G10] | VERIFIED (15/16 Aug) |
| 51 | 26-28 Aug | "In August 1971, in liberated Roumari, a regular brigade and local citizens set up a civil committee, a hospital, post office, police station and customs post." | [T10] | UNVERIFIED (month only; the day is 27 or 28 August) |
| 62 | 28 Sep | "The Bangladesh Air Force's first flight, Kilo Flight, was formed at Dimapur." | [T12] | UNVERIFIED |
| 63-67 | Oct | "In October two more regular brigades were formed." (No brigade names.) | [T11] | months VERIFIED (1 and 14 October single-source) |
| 79-81 | 20-24 Nov | "Fighting broke out along the border at Garibpur and Hilli, before the formal declaration of war." | [T16][T17] | VERIFIED |
| 80 | 21-23 Nov | "21 November is observed in Bangladesh as Armed Forces Day, when the army, navy and air force began coordinated operations." | [T7] | VERIFIED as an observance |
| 84 | 3 Dec | "Pakistan launched air strikes on Indian airfields and India declared war. Open war began. Border fighting had begun earlier, in late November." | [T1][T3][T19] | PARTLY VERIFIED (secondary sources only) |
| 84 | 3-5 Dec | "Bangladeshi sources date the formal joint command of Indian and Bangladesh forces to 4 December." | [T7] | CONTESTED (unresolved) |
| 85 | 6 Dec | "Jessore was the first district town to be liberated." | [T3] | UNVERIFIED |
| 86 | 9 Dec | "Indian and Bangladeshi forces crossed the Meghna using local boats and helicopters." | [T19][G23] | VERIFIED |
| 87 | 14 Dec | "14 December is observed in Bangladesh as the Day of the Martyred Intellectuals." | [G8] | UNVERIFIED |
| 88 | 16 Dec | "The commander of Eastern Command signed the instrument of surrender in Dhaka." | [T1][T3][T19][G29] | VERIFIED |

### 6.4 Contested figures: the `figures` block

Format (V-07 enforces it): **at least two claims, each with an attributed body, a low and a high value, and a retrieval note**. A single figure is never accepted. Values below are as the research files list them; they are **tertiary** and must be re-checked against the original publications before release.

```json
{
  "id": "toll",
  "label": "Civilian deaths, 1971",
  "claims": [
    {"by": "Government of Bangladesh", "source_ref": "toll.c1", "low": 3000000, "high": 3000000, "status": "VERIFIED as the claim"},
    {"by": "A 1990s political-science study", "source_ref": "toll.c2", "low": 1500000, "high": 1500000, "status": "UNVERIFIED (not re-checked)"},
    {"by": "A 2018 historical study", "source_ref": "toll.c3", "low": 500000, "high": 1000000, "status": "UNVERIFIED (not re-checked)"},
    {"by": "A 2008 BMJ-linked study", "source_ref": "toll.c4", "low": 125000, "high": 505000, "status": "VERIFIED (reported range; central estimate about 269,000)"},
    {"by": "A mid-war US government estimate", "source_ref": "toll.c5", "low": 200000, "high": 200000, "status": "UNVERIFIED (not re-checked)"},
    {"by": "A 2011 book-length study", "source_ref": "toll.c6", "low": 50000, "high": 100000, "status": "PARTLY (a review of the book gives about 100,000; the 50,000 to 100,000 form is Wikipedia's)"},
    {"by": "A Pakistani commission of inquiry (1972-74)", "source_ref": "toll.c7", "low": 26000, "high": 26000, "status": "VERIFIED as the claim"}
  ],
  "summary_range": "Estimates range from 3 million (Government of Bangladesh) to 26,000 (a Pakistani commission of inquiry); scholars give figures between these. This game does not choose a number.",
  "note": "The figure of 3 million is part of Bangladeshi remembrance and is disputed by some scholars. This game does not choose a number.",
  "source_ids": ["G8", "T26"],
  "status": "UNVERIFIED",
  "ship": false
}
```

(Each claim's `by` field is a descriptor of the publication, never a personal name. The author behind each `source_ref` (`toll.c1` to `toll.c7`) is recorded only in the bibliography file `encyclopedia/sources.json`, the one file V-06 does not scan for personal names; no game text, figures block or encyclopedia body names an author. If the owner prefers authors' names in the entry, V-06 needs an exception list.)

The block above has the per-claim `status` field (09 A38); "Independent researchers (as summarised)" was deleted because it has no attributable body, and the block stays `ship: false` until each claim is checked. A claim by a scholar or a commission is shown in shipped text only as a publication descriptor (the naming rule).

Other figures blocks (each with at least two claims; summary ranges as in 07b):
- **Bangladeshi force size**: 180,000 (an encyclopedia infobox); about 100,000 as training output (a historian); about 70,000 regulars plus 50,000 irregulars by end November (one account); 83,000 trained and about 50,000 sent inside (Indian-side accounts); "as many as 50,000" associated with the resistance (a US report, mid-1971). Summary range: roughly 70,000 to 180,000, depending on definition and date. The figure 175,000 is dropped (not re-found). The Pakistani commander's claim of 162,000 plus 125,000 is shown only as an attributed claim, reviewer-gated. [T3][T19][T7][G33]
- **Eastern Command size**: about 91,000 regulars plus paramilitary (an encyclopedia war article); about 90,000 personnel of all kinds including police and civilians (a Pakistani commission, search summary); about 34,000 army, about 45,000 with paramilitary and police, about 55,000 with navy and air force (one scholar, search summary). Summary range: about 34,000 army, up to roughly 90,000 counting everyone, depending on source. [T3][T19]
- **refugees**: nearly 10 million (the usual figure, each of UNHCR, the Indian government and UNICEF as reported, listed as separate attributed claims; `consensus: true`); about 60,000 still in India by March 1972 (two reports); camp counts single-source. [G7][G8]
- **prisoners**: 90,000 to 93,000, with the military/civilian split disputed; never set the 34,000 to 45,000 strength figure against the prisoner figure as a split (they measure different things); the 79,676 / 10,324 split is UNVERIFIED. [T19][G29]
- **ships**: dozens to over a hundred vessels, by source: at least 65 sunk by the end of November (an Indian general's history); 126 sunk or damaged August-December (unattributed); participants give 45 and more than 100. Commandos: about 160 in the first strike, about 500 trained. [G10][G12]
- **sabotage totals**: omitted from v1 (one adversary officer's tally of "damage to, or destruction of" 231 bridges, 122 railway lines and 90 electric installations; single source, period unstated). If ever shown it is a single-figure claim and needs a reviewer and a V-07 exception. [G15]

### 6.5 Bibliography (`sources.json`)

Contents: the numbered sources of 01 and 02, with a **grade** per source (`primary`, `institutional`, `tertiary`, `opinion`, `search summary`), and "replace before release" flags on every tertiary or summary source. The preferred replacements the files ask for are Banglapedia, the Liberation War Museum, FRUS Vol. XI, the Library of Congress country study and academic works. No source is marked VERIFIED merely by appearing here.

---

## 7. Map content

The hand-made map is a scenario asset (T1); this section gives the theme side (names, labels, landmarks) and a data sketch for the other agent. **All coordinates are illustrative, in percent of map width/height with the origin at top-left and north up**, to be redrawn from an atlas. Map size is the default 128x128 (D-C).

### 7.1 Regions of the map

| Region | Rough position | Terrain feel | Note |
|---|---|---|---|
| Border strip (west, north, east) | edges | `t.open`/`t.wood_a` | Arrivals land on marked entry tiles here (A1). The southern edge is the Bay of Bengal (`t.deep`). |
| Northwest plains | x 5-45, y 0-48 | paddy, groves | Rajshahi, Pabna, Bogura, Dinajpur, Rangpur districts [T9]. |
| Jamuna-Brahmaputra | x 40-48, y 8-60, flowing south | `t.deep` | A great river [G5]. |
| Padma-Ganges | x 5-48, y 55-62, flowing east to join | `t.deep` | [G5]. |
| Surma-Meghna | x 62-70, y 5-68, flowing south | `t.deep` | The longest river [G5]; the Meghna crossing, 9-12 December [T19]. |
| Central delta | x 45-75, y 40-70 | paddy, khals | Dhaka, Faridpur, Comilla [T9]. |
| Northeast haor basin | x 62-90, y 8-35 | `t.still` + hills | Sunamganj/Sylhet haors, flooded roughly July-November [G22]; Meghalaya hills to the north. |
| Southwest and the Sundarbans | x 5-45, y 70-100 | mangrove, `t.wood_b` | Khulna, Satkhira, Mongla [G20][G26]. |
| South delta and coast | x 45-75, y 72-98 | khals, paddy | Barisal, Patuakhali. |
| Southeast hills and coast | x 78-100, y 58-100 | `t.rough`, `t.peak` (high hills) | Chittagong, Hill Tracts, Karnaphuli [G21]. |

### 7.2 The 10 land sector regions: an authoring aid, not a shipped file

**Where the data lives.** The regions are **inline in the scenario file** `scenarios/liberation-1971.json` (06 owns it), with ids `region.r01` to `region.r09` and `region.r11`; sector 10 has no region (it is a label only). The sector cap rule reads that data (X-6). The theme supplies display names only: `names/sectors.json` maps each `region.rNN` id to its `ui.sector.N` key (section 5). The sketch below is an **authoring aid**, not a shipped file. Source lists disagree on headquarters and sub-sector counts [T9 vs G6], so **HQ names and sub-sector counts are deliberately left out**, and the sketch carries `"status": "UNVERIFIED"` until checked against Banglapedia or a historian. Sector boundaries changed during the war (the first sector 8 area was later split and sector 9 formed from it); the sketch shows one reading.

```json
{
  "schema": "sector-regions/1",
  "status": "UNVERIFIED",
  "source_note": "Areas from [T9] as corrected by 07a; HQ names and sub-sector counts omitted because lists disagree [G6]. Replace this sketch, not the rules, when corrected.",
  "regions": [
    {"region_id": "region.r01", "name_key": "ui.sector.1",  "box": [0.78, 0.58, 1.00, 1.00], "districts": ["Chittagong", "Hill Tracts", "eastern Noakhali"]},
    {"region_id": "region.r02", "name_key": "ui.sector.2",  "box": [0.48, 0.42, 0.76, 0.70], "districts": ["Dhaka", "Comilla", "Faridpur", "Feni", "part of Noakhali"]},
    {"region_id": "region.r03", "name_key": "ui.sector.3",  "box": [0.64, 0.30, 0.86, 0.46], "districts": ["Sylhet", "Brahmanbaria", "Narsingdi", "Gazipur"]},
    {"region_id": "region.r04", "name_key": "ui.sector.4",  "box": [0.74, 0.18, 0.92, 0.34], "districts": ["Habiganj", "Kanaighat"]},
    {"region_id": "region.r05", "name_key": "ui.sector.5",  "box": [0.60, 0.05, 0.82, 0.22], "districts": ["Durgapur", "Dawki", "Sunamganj", "the Surma"]},
    {"region_id": "region.r06", "name_key": "ui.sector.6",  "box": [0.24, 0.00, 0.50, 0.22], "districts": ["Rangpur", "part of Dinajpur"]},
    {"region_id": "region.r07", "name_key": "ui.sector.7",  "box": [0.05, 0.18, 0.42, 0.50], "districts": ["Rajshahi", "Pabna", "Bogura", "Naogaon", "Natore", "Sirajganj", "part of Dinajpur"]},
    {"region_id": "region.r08", "name_key": "ui.sector.8",  "box": [0.05, 0.50, 0.42, 0.86], "districts": ["Kushtia", "Jessore", "Khulna", "Satkhira", "northern Faridpur"]},
    {"region_id": "region.r09", "name_key": "ui.sector.9",  "box": [0.40, 0.66, 0.72, 0.94], "districts": ["Barisal", "Patuakhali", "parts of Khulna and Faridpur"]},
    {"id": 10, "name_key": "ui.sector.10", "region": null, "note": "Naval and special forces; no fixed area [T9]. Used only as a label for boats on t.deep. No sector cap region."},
    {"region_id": "region.r11", "name_key": "ui.sector.11", "box": [0.40, 0.06, 0.64, 0.40], "districts": ["Mymensingh", "Tangail", "the Jamuna"]}
  ],
  "_note": "Boxes are illustrative and may overlap; the map author assigns each land tile to exactly one region from an atlas. Check that the two neighbouring fortress positions at Jessore and Jhenidah (about 45 km apart, about 9 to 11 tiles at the map's scale) are not inside one base area."
}
```

**Sector cap rule (theme side).** The rule (one level-3+ base area HQ per sector region, a small supply bonus to own bases in the region) is the variant's; the theme provides the explaining text: `err.region_cap` (section 5), the status-bar line `ui.status.sector`, and a help string "Each sector area can hold one level three or higher base area HQ." (the digit is spelled out so a building help text passes V-08). A base outside every region (the border strip) shows no sector.

### 7.3 Gazetteer landmarks to place

Landmarks are fixed names on the map (`names/landmarks.json`), not discoveries. Coordinates are rough, `ASSUMED`. Indian-side places are **edge labels only** (not tiles, not buildable) so the map does not draw Indian land as the player's.

| Place | Kind | Rough (x, y) % | Why it is on the map | Src | Status |
|---|---|---|---|---|---|
| Dhaka | capital garrison position (AI garrison site, tag `capital`) | 62, 52 | Capital; the capital garrison is the surrender test position (taking it wins); surrender 16 Dec | [G1][G29] | VERIFIED |
| Chittagong | port / AI garrison site (tag `defence_zone`, not counted as a fortress position) | 88, 82 | Main seaport on the Karnaphuli; an independent defence zone, not a fortress position; `real_place: true`, `raid_can_destroy: false` | [G3][G16] | VERIFIED (defence zone, 07a) |
| Kalurghat | label (radio site) | 86, 80 | First transmitter | [G4] | UNVERIFIED |
| Mongla | port | 28, 92 | Second port; Pasur River; mined by naval commandos | [G5][G10][G12][G26] | VERIFIED |
| Chandpur | river port | 66, 64 | Attacked by commandos 15-16 Aug | [G7][G10] | VERIFIED |
| Narayanganj | river port | 62, 54 | Attacked by commandos | [G8][G10] | VERIFIED |
| Mujibnagar (Baidyanathtala) | label | 6, 58 | Oath of the provisional government, 17 Apr; then Kushtia district, now Meherpur | [G9][G3] | VERIFIED |
| Kushtia and Hardinge Bridge | town / bridge | 18, 52 | Railway bridge spanning the Padma between Pabna (Ishwardi) and Kushtia (Bheramara); bombed 13 Dec | [G10][G30] | bridge UNVERIFIED |
| Jessore | fortress position (AI garrison site, tag `fortress`) | 14, 68 | Fortress position (the strongest); HQ of a division | [G11][G16] | VERIFIED |
| Jhenidah | fortress position (AI garrison site, tag `fortress`) | 18, 62 | Fortress position; about 45 km from Jessore (about 9 to 11 tiles at the map's scale; check it is not inside the same base area); coordinates ASSUMED | [G16] (07a) | VERIFIED (07a) |
| Boyra / Garibpur | border label | 8, 66 | Air battle 22 Nov | [G12][G25] | VERIFIED |
| Hili (Hilli in war literature) | border town label | 14, 26 | Border town in Dinajpur District, Rajshahi Division in 1971 (Rangpur Division today); not a fort. Battles 22-24 Nov and 10-11 Dec | [G13][G24] | VERIFIED |
| Bogura | fortress position (AI garrison site, tag `fortress`) | 26, 30 | Fortress position | [G14][G16] | VERIFIED |
| Rangpur | fortress position (AI garrison site, tag `fortress`) | 34, 8 | Fortress position | [G15][G16] | VERIFIED |
| Comilla | fortress position (AI garrison site, tag `fortress`) | 72, 58 | Fortress position | [G16] | VERIFIED |
| Sylhet | AI garrison site (tag `defence_zone`, not counted as a fortress position) | 78, 20 | Independent defence zone; battle 7-16 Dec; haor and hill borderland | [G17][G22] | VERIFIED (defence zone, 07a) |
| Bhoirab (Bhairab Bazar; "Bhoirab" is the owner's display spelling, flagged for native-speaker confirmation) and Ashuganj | fortress position (AI garrison site, tag `fortress`) plus label (rail bridge) | 66, 44 | Bhairab Bazar (Kishoreganj District, Dhaka Division) and Ashuganj (Brahmanbaria District) face each other across the Meghna, linked by the Bhairab rail bridge. Bhairab Bazar is a fortress position and an AI garrison site, not only a label | [G34] (07c, 07a) | position VERIFIED (07a); bridge UNVERIFIED |
| Meghna crossing | river crossing label | 66, 50 | Crossing 9-12 Dec | [G23][G19] | VERIFIED |
| Tangail / Poongli Bridge | label | 52, 38 | Airdrop 11-12 Dec | [G28] | UNVERIFIED |
| Feni rail bridge | label | 80, 72 | Rail link; reported destroyed | [G15] | UNVERIFIED |
| Sundarbans | forest region | 24, 94 | Mangrove | [G20] | VERIFIED |
| Chittagong Hill Tracts | hill region | 92, 72 | Hills bordering Tripura and Mizoram; geography only | [G21] | VERIFIED |
| Sunamganj haor basin | wetland region | 72, 16 | Seasonal inland sea | [G22] | VERIFIED |
| Karnaphuli river | river label | 90, 76 | Port river; hill-to-sea route | [G5][G21] | VERIFIED |
| Calcutta (Kolkata), Agartala, Plassey | edge labels (India) | west / east edge | Exile government; radio (Tripura near Agartala from April, Calcutta from 25 May); naval commando camp | [G3][G4][G10] | VERIFIED (Plassey now two sources) |

The fortress positions for the surrender test are exactly the six tagged `fortress` (at Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab); the test is "hold 3 of the 6" (OWNER 2026-10-03) with the AI at or below 25% of its STARTING garrison positions (OWNER 2026-10-03, second pass: positions founded or added later are not counted), or take the capital garrison. Whether 3 of 6 is the right N is the owner's decision (a 4 of 6 variant was offered in 09).
Rules: place text never states a casualty figure for any place; Pilkhana, Dhaka University and similar sites of March 1971 appear in the encyclopedia only, never as map markers.

### 7.4 Entry tiles (A1)

Groups of 3-5 land entry tiles along the western, northern and eastern border, one group per sector region that touches the border (sectors 1, 2, 3, 4, 5, 6, 7, 8, 11: nine groups). The group ids follow the per-sector scheme `entry.s01` ... `entry.s11` (06 now uses them). Names of border crossings are **not** used (HQ locations are contested). Each group is shown on the map as "Entry point, Sector 8 area" (`ui.entry.label` with the plain name "Sector 8" from `names/sectors.json`, 7.5), and event text uses the plain name. The first regular brigade of July arrives from the north group (its headquarters was near Tura on the northern border); the areas of the later brigades are PLACEHOLDER. There is no player "cross here" order: arrivals are scheduled by the scenario, so the earlier `err.not_entry_tile` is deleted.

### 7.5 Display names for opaque scenario ids

The scenario (06) uses opaque ids; the theme renders them. Two map files carry the names. Both are text only: no rule reads them. V-11 checks that every `site.*` id in the scenario has an entry in `names/sites.json` and every `entry.*` and `region.*` id has an entry in `names/sectors.json`.

`names/sites.json` (the town positions below are PROVISIONAL until the map author fixes the 11 pre-placed positions, 08; the name pool is `names/garrisons.json#f2`):

```json
{
  "site.capital": "Dhaka garrison",
  "site.fortress_1": "Jessore garrison",
  "site.fortress_2": "Jhenidah garrison",
  "site.fortress_3": "Bogura garrison",
  "site.fortress_4": "Rangpur garrison",
  "site.fortress_5": "Comilla garrison",
  "site.fortress_6": "Bhoirab garrison",
  "site.zone_1": "Chittagong garrison",
  "site.zone_2": "Sylhet garrison",
  "site.town_01": "Faridpur garrison", "site.town_02": "Noakhali garrison",
  "site.town_03": "Brahmanbaria garrison", "site.town_04": "Habiganj garrison",
  "site.town_05": "Dinajpur garrison", "site.town_06": "Rajshahi garrison",
  "site.town_07": "Pabna garrison", "site.town_08": "Kushtia garrison",
  "site.town_09": "Khulna garrison", "site.town_10": "Barisal garrison",
  "site.town_11": "Mymensingh garrison",
  "_pattern_camp": "site.camp_NN -> \"Outpost NN\" (only if the scenario keeps outposts)",
  "_note": "PROVISIONAL. The ids keep the word 'town' because ids are opaque; the displayed names are garrison positions. site.fortress_1..6 follow the order in 06 (Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab), site.zone_1..2 are Chittagong and Sylhet."
}
```

`names/sectors.json` also holds the entry-group names used by `{group}` in `ev.arrival_deferred` (the template adds the word "area", so the plain name carries none):

```json
{
  "entry.s01": "Sector 1", "entry.s02": "Sector 2", "entry.s03": "Sector 3",
  "entry.s04": "Sector 4", "entry.s05": "Sector 5", "entry.s06": "Sector 6",
  "entry.s07": "Sector 7", "entry.s08": "Sector 8", "entry.s11": "Sector 11"
}
```

Player-facing words for the AI's starting sites (owner decision, second pass; a PROPOSAL for reviewers, 10.2 #20): "garrison position", "fortress position", "defence zone", "the capital garrison". The words "town" and "towns" are not used for these sites in any text value. Real places may still be named (Jessore, Dhaka); historical context lines may say "district town" of the places themselves.

---

## 8. Asset plan (PROVISIONAL: the art method is undecided)

**Everything in this section is PROVISIONAL.** The owner has reopened the art question (2026-10-03): the earlier "code-drawn only" assumption is dropped, and the way pictures are made is undecided. The glyph table, the asset keys and the art rules below are a plan that may change. What does **not** change are the limits on what any picture may show (rules 1 to 4 of 8.3, the equal-quality rule and the content part of rule 7), whatever the production method. If images are ever produced with an image model, the subject (a real war within living memory) needs the same reviewer gate as the text, and generated art must not imitate photographs of real events.

All pictures are optional. With no pictures at all the pack is fully playable through the fallback chain (04 section 6.2). Keys follow `<kind>.<role>[.L<level>][.v<variant>][.<state>]`.

### 8.1 Fallback glyph per role (PROVISIONAL)

| Group | Role | Glyph | Colour |
|---|---|---|---|
| Resources | `res.basic` `res.hard` `res.coin` `res.wares` `res.food` `res.pop` | log, crate, coin, bundle, sheaf, figure | `wood_a`, `ink`, `#c9a227`, `rough`, `open`, `ink` |
| Buildings | `bld.core` | keep (1x1) | `f1` / `f2` |
| | `bld.food` `bld.basic_extractor` `bld.hard_extractor` `bld.coin_extractor` `bld.converter` | sheaf, log, crate, coin, anvil | owner colour |
| | `bld.habitat` `bld.attractor` `bld.scout_post` | hut, antenna, stretcher | owner colour |
| | `bld.garrison` | tent (2x2, the ruleset footprint) | owner colour |
| | `bld.port` `bld.academy` | jetty, book | owner colour |
| Units | `u.scout` `u.founder` `u.commander` | figure, figure_tools, banner | owner colour |
| | `u.line` `u.shock` `u.ranged` | figure_rifle, dash (A: tank_light), barrel | owner colour |
| | `u.transport` `u.militia` | hull, figure_shield | owner colour |
| Terrain | `t.deep` `t.still` `t.river` | waves, reeds, ripple | `water_deep`, `water_still`, `water_deep` |
| | `t.open` `t.wood_a` `t.wood_b` `t.rough` `t.peak` | paddy, grove, mangrove, hills, hills_high | palette |

### 8.2 Asset keys (if pictures are made later; PROVISIONAL)

- Terrain tiles: `tile.t.deep`, `tile.t.open.v1..v3`, ...
- Buildings: `bld.core.L1`..`L4` (cell, base area, liberated area, liberated district; the AI set shows a camp, a fortified post, a cantonment gate), others single-level.
- Units: `u.line.L1`..; animation states `idle`, `attack`, `down`.
- UI: `ui.panel`, `ui.digest.masthead` (a plain banner, no photograph), `icon.res.*`, `icon.patron`, `flag.f1`, `flag.f2`, `flag.unused`.
- Battle backdrops: `battle.bg.paddy`, `battle.bg.grove`, `battle.bg.khal`.

### 8.3 Art rules

Binding content limits (hold for any art method): rules 1 to 4, the equal-quality half of rule 6, and the content half of rule 7. Provisional (method-dependent): the rest.

1. **No real insignia, flags, seals or crests unless a reviewer approves them.** `flag.f1` and `flag.f2` follow section 3.1; a real flag, if ever drawn, follows the display rule there (labelled 1971 or current, shown flying properly, never torn, burned, inverted or on the ground; the state emblem is never used). **No red cross, red crescent or red crystal** on the field hospital or on any picture (protected emblems; legal detail NOT RESEARCHED, flag for review).
2. **No photographs**, no portraits, no real victims' faces ([S-9]). Units are faceless silhouettes with the owner colour (the silhouette style is PROVISIONAL).
3. **No civilians in any picture** and no destroyed villages ([S-9] item 11). A lost base is shown as a dismantled camp.
4. The **surrender picture**: two delegations at a table with equal dignity, no flags trampled, no humiliation (SC §10 item 2.5). Both a Bangladeshi and a Pakistani reviewer gate it.
5. PROVISIONAL: provenance and licence are recorded per picture (04 section 6.1 / `--strict`); the goal is `original` art, but the method that produces it is undecided.
6. PROVISIONAL: palette from section 1.3 only; both sides use the same art quality ([S-6], binding).
7. PROVISIONAL: **Audio**: none in v1 (manifest empty). No anthem or radio songs (SC §10 item 9, binding). If sound is added: restrained, no celebratory cue on a kill (SC §10).
8. PROVISIONAL: `shapes.json` holds painter parameters (line weight, corner radius, glyph scale) only; no gameplay numbers.

---

## 9. Validator tests specific to this pack

All run against `themes/bd1971/` in `--strict` mode and block CI. "Value" means a text string or name-pool entry; **keys and role/event ids are exempt** (they are neutral ruleset identifiers). Scope names: UI = `text/en.json` outside `ctx.*`, `enc.*`, `end.*`, `debrief.history*`, `debrief.different*`, `firstlaunch.*`, `prologue.*`; EXT = `flavour/`, `encyclopedia/`, `end.*`, `debrief.history*`, `debrief.different*`, `firstlaunch.*`, `prologue.*` (the remembrance voice may say "civilians" in plain, non-graphic sentences; role labels and event text may not).

| ID | Check | Scope | Fails when |
|---|---|---|---|
| V-01 | No "colony" words | all values | case-insensitive `colon(y|ies|ist|ial)` appears |
| V-02 | No "settler" words | all values | `settl(er|ers|ed|ement)` appears |
| V-03 | No "tax" text | all values | `\btax(es|ed|ation)?\b` appears (also `tribute`) |
| V-04 | No starvation words | all values | `starv|famine|hunger|perish` appears; shortage text must contain "return home" or "stood down". Since the stand-down switch was dropped (OWNER 2026-10-03), this text is the only carrier of that meaning; it must not add any claim (for example "nobody was harmed") that the rules cannot back |
| V-05 | Role labels never say people | UI role labels (`*.name*`) | `people|villager|population|refugee|civilian` appears |
| V-06 | No real personal names | all text | any token on the deny-list (every personal name that appears in the research files, e.g. leaders, officers, scholars, broadcasters, plus common variants) appears; allow-list holds only institutions and places whose names contain a person's name (`Mujibnagar`). A commission is shown as "a Pakistani commission of inquiry (1972-74)" rather than by its eponymous name, per the naming rule, or its name is added to the allow-list. Names live only in `encyclopedia/sources.json`, the one file this check does not scan (the bibliography); a `figures` claim's `by` field is a publication descriptor and may not hold a name (its `source_ref` points into `sources.json`). Pattern/manual review also required, since a deny-list cannot prove a negative. |
| V-07 | No single-figure casualty numbers | all values | a number of 1,000 or more, or "million" / "lakh", appears in a sentence that also contains a people, force or loss word (`people|refugee|troops|soldiers|fighters|personnel|men|killed|dead|deaths|died|casualt\w+|martyr|victim|prisoner|strength|massacred`) outside a `figures` block; years (`\b1[89]\d\d\b`) and distances or heights with a unit (`m`, `km`) are not counted. Each `figures` block needs at least 2 claims, each with `by`, `low`, `high`, a per-claim `status`, and a `summary_range` showing a range. A figure that at least two independent sources give the same way (refugees, "nearly 10 million") may be marked `consensus: true`; the flag only lifts the "low differs from high" requirement. Such a figure appears only inside the `figures` block of its encyclopedia entry, attributed claim by claim, never in body text, summaries or any UI, event, digest, briefing or end-screen text (sensitivity content rule 5; 6.1). A prisoner, refugee or force figure of 1,000 or more in an entry's body text fails this check. |
| V-08 | No force sizes on units | UI | a digit group appears in a unit/building help text (placeholders excluded) |
| V-09 | No religious labels | UI | `mosque|temple|church|prayer|hindu|muslim|christian|jihad|crusade` appears; EXT allows the words only in `refugees` and `terms`, and only if the entry is marked `reviewed: true` |
| V-10 | No loaded words for the opposing side | UI + EXT | `enemy|invader|occupier|oppressor|terror|barbar|butcher|savage|horde|vermin|slaughter` appears; "opposing force" is the required wording |
| V-11 | Coverage | all | any role id in `ruleset.json` lacks a base-locale label; any `ev.*`/`err.*` in `events.json` lacks a template (this includes every event and error the variant (06) adds: `ev.arrival_deferred`, `ev.arrival_cancelled`, `ev.site_taken`, `ev.faction_eliminated`, `ev.faction_surrendered`, `ev.match_won.player` and `ev.match_won.opponent` (in place of a base `ev.match_won`, per 06 section 8 rule 2), `ev.match_drawn`, `ev.timed_effect_started`, `ev.season_started`, `ev.unit_healed`, `ev.pop_lost`, `warn.food_shortage`, `err.patron_link_cut`, `err.region_cap`: all 14 event and error ids of 06 section 8); every `site.*` id in the scenario has an entry in `names/sites.json`, and every `entry.*` and `region.*` id one in `names/sectors.json` (7.5); any `@f2` key lacks its base key; every key renders with a sample payload built from exactly the payload fields 06 section 8 lists (04 section 2.10), so a placeholder the payload does not carry fails |
| V-12 | AI naming pin | `faction.f2.name` | the value is not exactly `Pakistan Army, Eastern Command` |
| V-13 | Named paramilitary groups are encyclopedia-only | all | `Razakar|Al-Badr|Al-Shams|Mujahid` appears outside `encyclopedia/entries/paramil.json` and the glossary |
| V-14 | No unapproved slogans | all | `Joy Bangla` appears while `reviewed.slogan` is false |
| V-15 | Declaration wording pin | EXT lines and entries tagged `topic: "declaration"` only (not every string that contains "26 March": the Searchlight line and the prologue say "25-26 March") | `26 March` appears without `27 March` (or the reverse) in the same tagged entry, or the wording credits a person |
| V-16 | Dates and calendar | `calendar.json` plus the scenario schedule | the template output for turn 0 is not "26 to 28 March 1971" (the check tests the formatted output of `ui.calendar.range`, not a literal); turn 22 is not the first `season.wet` turn in the scenario's season schedule; turn 88 does not contain 16 December; `max_turns` in the scenario (`settings.max_turns` and `end_conditions.deadline.max_turns`) is not 89, or the two differ; every season id in the schedule has an entry in `season_labels` |
| V-17 | Release gate on status | `flavour/`, `encyclopedia/` | with `--release`: any entry with `status: UNVERIFIED` has `ship: true`; any entry lacks `source_ids` |
| V-18 | Name pools | `names/` | an entry fails its pattern; a duplicate exists; a pool has fewer than 12 generated names (pattern times words, so the 6-bird callsign pool and the 12-river flotilla pool pass); any entry matches a real personal name (V-06) |
| V-19 | No real insignia assets (the limit is binding; the manifest and asset keys are PROVISIONAL, art method undecided) | `assets/manifest.json` | an asset key contains `flag.bd`, `flag.pk`, `emblem`, `seal`, `crest`, `redcross`, `crescent`; a photo file type is listed |
| V-20 | Casualty vocabulary in battle text | `ev.battle_*`, `ev.raid_*` | a battle template lacks `strength` wording or contains a body-count word (`killed`, `dead`, `casualties`) |
| V-21 | No civilian state in the pack | all | `civilian` appears in a UI value or in an event payload placeholder name (`{civilians}`, `{villagers}`); the ruleset-side civilian-state allow-list test (SC §8.1, [S-1], and 06 section 5) is cross-referenced here. Shortage and capture templates make no claim the rules do not make: capture templates make no claim about where personnel go, and shortage templates say only that volunteers return home or are stood down (V-04) |
| V-22 | Event titles | UI | an `ev.battle_*` template contains a real battle name (`Garibpur|Hilli|Kamalpur|Boyra|Sylhet|Ghashipur`) SC §10 2.3 |
| V-23 | Theme has no rules | all | any ruleset key appears (04 section 2.10) |
| V-24 | Theme-swap determinism | CI | per-turn rules hash differs between `bd1971`, `colonial`, `starfall` and an empty theme (04 section 2.10) |
| V-25 | Pseudo-locale (layout; the panel art it is tested against is PROVISIONAL) | `en.pseudo.json` | a string overflows its panel at +30% length, or a placeholder is lost |
| V-26 | Bangla readiness (when `bn` is added) | `text/bn.json` | glyph coverage of `_sample` fails, or a key is machine-translated (flag `"mt": true` is rejected) |
| V-27 | Starting-positions wording (owner decisions of 2026-10-03, second pass) | UI + EXT | `brief.goal` does not contain "starting garrison positions"; any value uses the word `town` or `towns` for one of the AI's starting sites (the capital garrison, fortress positions, defence zones; real place names and historical context lines about the places are exempt); the scenario's 25% predicate counts bases other than the AI's pre-placed garrison positions (cross-check with 06; X-9) |

---

## 10. Items needing community or native-speaker review, and facts still to verify

### 10.1 Reviewers wanted (from the sensitivity file, [S-10])

1. A **Bangladeshi historian** of the Liberation War (required).
2. A **Bangla-speaking sensitivity reader** (language and political wording) (required).
3. A reviewer from the **Bangladeshi Hindu community** (refugee framing, `refugees` entry).
4. A reviewer from the **Urdu-speaking ("Bihari") community** in Bangladesh (`paramil` entry, "Garrison reserve" label).
5. A **Pakistani** reviewer (the AI's labels, the `eastern` entry, the surrender picture).
6. Optionally an **Indian military-history** reviewer (the `india` entry and the patron wording).
7. A **legal** check for release in Bangladesh and on stores (NOT RESEARCHED), including protected emblems.

### 10.2 Wording and design items to review

| # | Item | Why |
|---|---|---|
| 1 | The remembrance line, first-launch note, end-screen dedications and credits dedication (English; Bangla wording to be written by speakers) | SC §10 item 1 |
| 2 | Every encyclopedia entry with a contested figure (`toll`, forces, refugees, prisoners, ships) | Ranges and attribution [S-5] |
| 3 | The `declaration` entry: 26 vs 27 March, and **no person credited** | Politically sensitive in Bangladesh (NOT RESEARCHED in depth) |
| 4 | Whether real leaders should ever be named (this pack names none) | The owner chose generic/fictional names; reviewers may want cameos |
| 5 | The AI-side labels: "Garrison reserve" (instead of "Paramilitary"), "Pay office", "Strongpoint", the cantonment ladder, and whether naming real places as garrison positions is acceptable | [S-2], [S-6] |
| 6 | The patron wording: "the Mujibnagar Government" and Indian help as text only | SC §10 item 6 |
| 7 | The "Support committee" label and help text ("local contributions") | Now supported in substance (local struggle committees from March 1971; 07b), with no amounts; reviewer check of the wording only. The alternative of removing the building is dropped. |
| 8 | The field hospital icon (no protected emblem), "Instructors' cadre", "Fighters' camp" | Accuracy and sensitivity |
| 9 | The nature-word base pool: spellings, glosses, connotations | General-knowledge glosses are `UNVERIFIED` |
| 10 | Bengali terms and spellings (Gono Bahini, Niyomito, Muktijoddha, ghat, haor, khal, beel, Mujibnagar) and period vs present-day place spellings (Dacca/Dhaka, Chittagong/Chattogram); the owner's fortress-position place spellings Bogura, Jhenidah and **Bhoirab** (confirm "Bhoirab" against the common "Bhairab" with a native speaker); 1971 divisions did not include today's Rangpur, Sylhet, Mymensingh or Barisal divisions | Marked (U) in [T glossary]; [G5] gazetteer; 07c |
| 11 | "Joy Bangla": excluded until a reviewer approves | Meaning verified; status politically contested (2020 ruling, 2022 gazette, stayed December 2024) |
| 12 | Flag and colour design: the player green and the generic banner; any real 1971 flag drawn only after review, with the display rule of section 3.1 | Researched in 07c; reviewer gate stays (PROVISIONAL with the art method) |
| 18 | The capture and shortage simplification text (`limits`, `debrief.different.body`) and the restated guarantee: rule-level and tested = no civilian state; text-level and validated = shortage wording; nothing said about personnel on capture | OWNER dropped the two switches 2026-10-03 |
| 19 | The fortress list (Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; Chittagong and Sylhet as defence zones) and the 3-of-6 choice, by a historian and the owner | 07a; one other summary lists five positions |
| 20 | PROPOSAL (owner, second pass): the AI's starting sites are "garrison positions", "fortress positions", "defence zones" and "the capital garrison", never "towns", because no town was held by the Pakistan Army at the start of the war; and the 25% clause counts starting positions only. Reviewers confirm the terms and that the 25% reading matches the history they know | Owner decisions 5 and 6 (section 0); 7.5; V-27 |
| 13 | Music: none used. Any later use of radio songs or the anthem needs sensitivity and copyright review | NOT RESEARCHED |
| 14 | The prologue (language movement, non-cooperation movement): body text cannot be written from the files | SC §10 item 10 |
| 15 | The season labels and the monsoon sentence "accounts differ on who the rains favoured" | [T1][G1][G10][G14] |
| 16 | Naming `Dhaka garrison` etc.: whether reviewers consider a place name on a military installation acceptable, versus a neutral "Cantonment, Dhaka" | [S-2] |
| 17 | Store descriptions, trailer and screenshots | SC §10 item 12 |

### 10.3 Facts still to verify (each used in this pack)

| # | Fact | Where used | Problem in the files |
|---|---|---|---|
| F-1 | The 11 sector **areas** (not HQs) | `sectors.json`, `ui.sector.*` | Two lists disagree on HQs and sub-sector counts [T9][G6] |
| F-2 | Commander-in-Chief sequence (chosen at the Teliapara meeting on 9 April, took command 12 April, took office 17 April; the July conference was the first sector commanders' conference, 11 to 17 July, one source 12 to 17 July) | `sectors` entry, `forces.regular`, context line turn 36 | Resolved by 07a; the earlier "4 April vs 11 July" is wrong. No person named. |
| F-3 | Joint Command date: 21 November (Armed Forces Day, coordinated operations began) vs 4 December (formal joint command in Bangladeshi sources) | `india` entry, context lines turns 80 and 84 | Still unresolved [T7]; shown as an observance and as a dated source claim, both attributed |
| F-4 | Regular brigade formation dates (July, October, October); the letters used for the brigades are the initials of real commanders and are not used | `forces.regular`, context lines turns 34 and 63-67 | Months VERIFIED; days single-source (7 July, 1 and 14 October) [T10][T11] |
| F-5 | Roumari civil committee (August 1971; 27 or 28 August) | `roumari`, context line turn 51 | Single source [T10]; "first" is the brigade's own account |
| F-6 | Radio: Kalurghat (26-27 March), Tripura near Agartala from 3 April (one account 8 April), Calcutta from 25 May, renamed Bangladesh Betar on 6 December | `radio`, context lines turns 2 and 20 | Calcutta move VERIFIED; start and Tripura dates PARTLY [G4] |
| F-7 | Training camp counts and totals; "Operation Jackpot" used for two things | `training`, `jackpot` | [T15][G33][G2]; 30 in May and 84 by September are two dates, not a disagreement |
| F-8 | Where arms came from | `arms` | VERIFIED qualitatively (captured stocks, defecting units, Indian supply and training, local making); no purchases found [G2] |
| F-9 | Eastern Command structure and the six fortress positions plus two defence zones; the light-tank count (NOT FOUND, never printed) | `eastern` | [T23][T6][G11][G16]; 07a |
| F-10 | Razakar / Al-Badr / Al-Shams formation dates and roles | `paramil` | PARTLY (ordinance of 2 August, one source 1 June; under the army 7 September; Al-Badr May to September; Al-Shams no date) [T14][T25] |
| F-11 | Monsoon months (June-September VERIFIED; April-October is the wider rainy and flood season); "over 300 river operations" (single source) | seasons, `geography` | [G5][G10][G12]; 07c |
| F-12 | Funding of the exile government (no totals are printed); local struggle committees (supported in substance) | "Support committee" | 07b |
| F-13 | Refugee figures (about 10 million; camp counts; religious split 60-90%) | `refugees` | Single sources, contested [G7][G8][T26] |
| F-14 | Death-toll claims against the original publications | `toll` | Wikipedia summary only [G8][T26] |
| F-15 | Prisoner totals and the military/civilian split | `surrender` | [G29] vs [G23] |
| F-16 | Hardinge Bridge bombing (13 December), Tangail airdrop, Feni bridge, Bhairab bridge | landmarks | Search summaries only [G30][G28][G15][G34] |
| F-17 | 14 December as the Day of the Martyred Intellectuals | context line 87, `remembrance` | Single source [G8] |
| F-18 | Haor flooding months; "Sylhet hills" | terrain help | [G22]; Sylhet hills not separately verified |
| F-19 | Jessore liberated 6 December; Sylhet heliborne landing 7 December | context lines | Single sources [T3][T18] |
| F-20 | Kilo Flight details | `kilo`, context line 62 | Single source [T12] |

### 10.4 Assumptions made in this pack (ASSUMED, to be confirmed by the owner or the variant agent)

Season boundaries (section 4.3; the turn-22 first wet turn is a design choice owned by the scenario); `max_turns` = 89; base area HQ level names; the callsign name scheme; heal rate per field hospital level; the 2-per-level scout support value; the extension list X-1 to X-7; and the decision to omit all personal names, including scholars', from game text. Moved to OWNER (2026-10-03): the scout cap and recruiting at `bld.habitat`; healing at `bld.scout_post`; the surrender test form (capital garrison and/or 3 of the 6 fortress positions, AI at or below 25% of its starting garrison positions); the loss rule (no base area for 15 turns); the two dropped switches. PROVISIONAL (art method undecided): palette values, glyph painter names, fonts, backdrops, banner shapes and the asset plan. The earlier assumption of a level-1 field hospital in every start kit is replaced by AI-only pre-placement.

---

## Change log (errata applied)

Source: 09-verification-errata.md (2026-10-03) plus the owner's final decisions of 2026-10-03. Only this file was edited. Ids are the errata's P0-n / P1-n / P2-n; "A", "B.2" and "D" ids are its supporting rows.

### Owner decisions applied
- **Decision 1 (switches dropped):** removed the claim that shortage means stand-down and that capture sends personnel home (09 section C.1, 05 side). `ev.colony_captured` no longer says the garrison withdrew; `limits` and `debrief.different.body` carry the simplification text (without the word "hunger", which V-04 bans); V-04 and V-21 reworded; section 5 intro and 10.2 #18 added. (P0-3)
- **Decision 2 (loss rule):** `ev.defeat_scattered` replaced by `ev.faction_eliminated` ("no base area for {turns} turns"); `end.loss.body` drops "no organising team". (P0-4)
- **Decision 3 (scouts and healing):** recorded as OWNER in 2.2 and 10.4; healing amounts `[1, 1, 2, 2]` aligned with 06; `ev.unit_healed` now takes `{amount}`; `bld.scout_post.help` states the numbers with the digit-free "level three" form. (P1-13, 09 B.2 #13, #14)
- **Decision 4 (surrender test):** `brief.goal` rewritten with the 25% clause and `{n}` of the `{k}` fortress towns, plus `brief.fortress_list`; fortress towns Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; Chittagong and Sylhet are defence zones (tags in the gazetteer); garrison pool gains Jhenidah and Bhoirab; "Bhoirab" flagged for native-speaker confirmation (10.2 #10, 3.3, 7.3). (P0-5, A27, B.2 #15)
- **Decision 5 (art open):** PROVISIONAL marks on the file layout, palette, fonts, backdrops, license note, all Glyph columns and `sprite`/`glyph` fields, banner shapes, all of section 8, V-19, V-25, `credits.licence`, `end.win.picture`, the masthead artwork and the audio statement; section 8 opens with a sentence that the art method is undecided; binding content limits are kept and named. (P1-21, 09 E.2)

### P0
- P0-1 (seasons): `calendar.json` now holds only `season_labels` (`season.pre_wet`/`wet`/`dry` mapped to label keys); `seasons[].from_turn/to_turn` and `deadline_turn` removed; turn 22 is the first monsoon turn (4.2, 4.3); V-16 reads the scenario schedule and the formatted output; label for `season.dry` becomes "After the rains" (A22).
- P0-2 (events): the five old keys renamed and templates added for `ev.timed_effect_started`, `ev.faction_surrendered`, `ev.match_won`, `ev.match_drawn`, `ev.faction_eliminated`, `ev.season_started`, `ev.arrival_deferred`, `ev.arrival_cancelled`, `ev.site_taken`, `err.patron_link_cut`; X-5 and V-11 updated; `err.not_entry_tile` deleted (P1-17, B.2 #6).
- P0-5: also `bld.core` rationale, gazetteer rows, 7.3 fortress paragraph. The N-of-K choice follows the owner's "3 of the 6" (option A); option B (4 of 6) is noted as the owner's alternative.
- P0-6 (validators): V-07 rewritten with the people/force/loss-word rule, year and unit exemptions and `consensus`; V-15 scoped to the `declaration` topic tag; V-18 counts generated names and the flotilla river pool grows to 12; V-06 commission wording.
- P0-7 (brigade names): turns 34 and 63-67, entries 7 and `u.ranged` use generic wording; no letter names remain in game text.
- P0-8: preset now `bd1971@0.1`.

### P1
- P1-1 radio chronology (entry 10, turns 2 and 20, `bld.attractor`, F-6). P1-2 highest point (`t.peak`, entry 24). P1-3 monsoon wording, "300 extra channels" deleted, dry-season label. P1-5 Joint Command wording (entry 17, turns 80 and 84; the 05 side only). P1-6 Roumari month only. P1-7 declaration line. P1-8 sector strings 2, 3, 5, 7, 8, 11 and the sketch. P1-9 figures and arms (all figures blocks; `res.hard`; entries 11, 12, 13). P1-10 digest example moved to turn 36 (12-14 July) with a turn-40 note, the turn-84 example reworded. P1-11 turn 12 now "early May". P1-12 start-kit row replaced by AI-only pre-placement (05 side). P1-14 `raid_can_destroy` naming (3.3). P1-15 sectors are inline in the scenario file with `region.rNN` ids (X-6, 7.2). P1-16 entry groups per sector, `entry.s01` to `entry.s11` (7.4), first brigade from the north (05 side). P1-17 `ev.colony_captured_against` reworded. P1-18 sensitivity rewordings D3 (toll summary), D4 (`terms`), D6 (`patron.name@f2`), D9 (`debrief.history.line`), D15 (`ui.btn.requisition`). P1-19 support committee status upgraded, removal alternative dropped. P1-20 flag facts and display rule (3.1, 8.3, 10.2 #12).
- Also: toll block reordered with per-claim `status`, "Independent researchers" deleted; Bose, BMJ-linked and Hamoodur claims reworded (A38); Eastern Command, force, refugee, prisoner, ship and sabotage blocks per A30, A34-A37, A39, A40; paramilitary dates (A41); glossary cautions and Joy Bangla reason (A42, A46); Hili, Bhairab, Mujibnagar, Hardinge rows (A23-A25); sector 7 and 11 optional wording used.

### P2 applied
- P2-1 (10 land regions), P2-2 (`SC §n` for sections; `[S-n]` kept for rules), P2-3 (one date-range format), P2-4 (16 words; "Beel"), P2-5 (Plassey upgrade; glossary cautions; Hilli and Bhairab; Mujibnagar and Hardinge notes), P2-6 (Eastern Command structure; tank wording), P2-7 (Razakar dates; no community-linked group), P2-11 ("level three" in the sector help string).

### Errata items NOT applied, and why
- **06-side edits** (P0-2 emit-side changes to H1/H3/H4/H5, P0-3 and P0-4 edits to 06 sections 1, 2, 3, 5, 6, 7, P1-4 the personal name in 06 row 7.3, P1-5 `te.link_cut` note, P1-12 pre-placed building lists, P1-14 H2 naming, P1-15 and P1-16 06 entry groups and brigade arrival, P2-8 `null` grace, P2-9 H7 "courier"): out of scope, this task edits 05 only. 05 now depends on 06 for `ev.match_won`/`ev.match_drawn` as distinct ids, `turns` in the `ev.faction_eliminated` payload, `ev.season_started`, and per-sector entry groups.
- **B.2 #12** (AI start-kit hospital): only the 05 half is done; the building list is 06's.
- **A26 / P2-10** (period against present-day spellings): the owner chose display spellings only for the six fortress towns; the wider decision on Dacca/Dhaka, Chittagong and others stays open (10.2 #10). The one-pass rewrite of pools, gazetteer and strings is not done.
- **D7** ("East Bengal" in the turn-0 line): kept as is, flagged for the reviewer (entry 4 and the context row).
- **D11** (`surrender` entry wording "signed by the commander of Eastern Command and the Indian Eastern Command's commander", and the `end.win.picture` string): left unchanged except that the picture rule now names both a Bangladeshi and a Pakistani reviewer; reworded text such as "before the joint command of Indian and Bangladesh forces" is proposed in 09 and not adopted without the reviewers.
- **D12-D14** ("Freedom-fighter section" Bangla label, remembrance line, Shapla emblem): D14 applied in 3.3; D12 and D13 are reviewer items already covered by 10.2 #1 and #10 and were not given new rows.
- **A1/A3 in the `india` text beyond the lines listed**: the status of the Joint Command date stays CONTESTED, as 09 says.
- **Section 10.1 reviewer list, [S-n] rule citations inside quoted source rows, the `res.pop` "Personnel" label discussion**: unchanged (not touched by the errata).


## Change log (second pass)

Source: 12-second-pass-verification.md (12) and the owner decisions of 2026-10-03 (second pass). Only this file was edited. Joint contract with the editor of 06: `ev.match_won` carries `winner_slot`; the theme provides `ev.match_won.player` and `ev.match_won.opponent`; 06 section 8 states how the `@slot` override selects them.

### Owner decisions applied
- **Naming of the AI's starting sites:** "town(s)" replaced in player-facing text and labels by "garrison position(s)", "fortress position(s)", "defence zone(s)" and "the capital garrison" (section 0 decision 5, `bld.core` rationale, 3.3, `brief.goal`, `brief.fortress_list`, `end.win.body`, entry 18, 7.3 gazetteer, 10.2, F-9). Opaque ids unchanged (`site.town_NN` stays). Flagged as a PROPOSAL (10.2 #20, validator V-27). Historical context lines about real places keep "district town" where the history says so.
- **25% clause counts starting garrison positions only:** `brief.goal` wording, new X-9, V-27, 7.3 closing paragraph, section 0 decision 6. 06 H4 `base_count_pct_of_start` must be restricted to the pre-placed set (06 M5); not edited here.

### P0
- X1: `ev.arrival_cancelled` no longer uses `{unit}`; new text plus an `@f2` variant.
- X2: `ev.season_started` no longer uses `{note}`.
- X3: `ev.match_won` replaced by `ev.match_won.player` and `ev.match_won.opponent`, selected by `winner_slot` against the receiving slot as 06 section 8 rule 2 now states (no base key, conformed to what is on disk); the surrender sentence is never shown when the opponent wins and is no longer repeated in the win text for the opponent case (it comes from `ev.faction_surrendered`).
- X4: added `ev.pop_lost{base, amount, cause}` and `warn.food_shortage{base}` with `@f2` variants, death-neutral (no "starv"); `ev.shortage_warning` and `ev.shortage_resolved` kept only as the fallback 06 section 8 allows, their undefined `{n}` removed; V-11 now lists all 14 ids of 06 section 8; digest example updated.

### P1
- X5: new 7.5 and `names/sites.json` (folder layout); every `site.*` id has a display name; the 11 `site.town_NN` names are PROVISIONAL.
- X6: `{group}` renders a plain name ("Sector 8"); `ui.entry.label` composes "Entry point, Sector 8 area" for the map; "area" is no longer printed twice. 06 section 8 (re-read at the end) says each `entry.*` id maps to one display name, which is the plain name used here.
- X7: stale "open dependency on 06" notes replaced in X-5 and 7.4; the older change-log lines that call those items "not applied" are history, superseded by this entry.
- X8: V-16 now looks for `max_turns` in the scenario (both places) and checks they agree.
- X9: new X-8 says where `{n}` and `{k}` in `brief.goal` come from.
- S1: toll `by` fields are publication descriptors, each with a `source_ref`; author names live only in `sources.json`, which V-06 does not scan.
- S2: `surrender` entry no longer prints the prisoner range in body text; it points to the `prisoners` figures block.
- S3: 6.1 and V-07 narrowed: a `consensus` figure appears only inside the encyclopedia `figures` block, attributed claim by claim, never in body text or the interface; this restates sensitivity content rule 5 and is added to review item 10.2 #2.
- Moved here ("deleted figure" remarks, L4 and L5): the earlier Eastern Command figure of "350,000 to 365,000" was deleted as not a supportable east-only figure; the "about 300 extra navigable channels" claim was deleted (the real "300" is one study's count of more than 300 guerrilla operations on rivers, single source; the `geography` entry and F-11 no longer mention the deleted claim).

### P2
- S4 (commando numbers moved out of entry 13 body text), S5 (`ui.btn.send_surplus`), S6 ("Bhoirab (Bhairab Bazar)" in entry 18), X10 (`_ev.match_drawn.note`), X11 (06 names for the healing mechanism and the scout recruit value), X12 (note in the section 5 intro), M6 (Jessore to Jhenidah distance: "about 45 km, about 9 to 11 tiles at the map's scale" in 7.2 and 7.3).

### Not applied, and why
- X3 optional `ev.faction_eliminated@f2`: unreachable under bd1971 (f2 surrenders first); omitted.
- M1-M5, M7-M10, Y1-Y4 and the 06 half of X3b, X7: belong to 06 or 08; not edited.
- M10 (Sylhet battle end date, 15 or 16 December): the two values stay as in the files (entry 16 says 7-16 Dec); left for the source check.
- S7 and S8: informational, no change in 05.
