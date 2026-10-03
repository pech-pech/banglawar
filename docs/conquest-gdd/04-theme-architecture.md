# 04 - Theme and setting architecture

Part of the theme-agnostic GDD for the *Conquest of the New World Deluxe* clone (Python 3.10+, pygame, art drawn in code behind `assets.py` with shape fallback).
Date: 2026-10-03. Status: proposal for the owner's review.

Sources: the Deluxe manual (37-page PDF; "p.NN" below is the manual's printed page number) and the existing draft `conquest-new-world-design-1dc70b/docs/design.md` (called "the draft" here). I read the draft critically; section 9 lists what has to change in it for theming to work.

---

## 0. Summary

1. A game is built from **three separate layers** that are loaded, validated and versioned on their own:
   - **Ruleset**: every mechanic and number. It uses neutral **role ids** (`res.basic`, `bld.garrison`, `u.ranged`) and contains no display names.
   - **Theme pack**: everything the player sees or hears. That covers names, plural forms, descriptions, flavour text, name pools, the calendar, palette, pictures, shape-fallback parameters and sound. A theme contains **no numbers that the simulation reads**.
   - **Settings**: the choices for one match (map size, seeds, difficulty, turn limit, players, scenario), plus optional **ruleset variants** (data overlays that really do change the rules).
2. **The proof that a theme is only a skin.** A headless AI-vs-AI game with a fixed seed must produce the **same state hash on every turn** under every installed theme. This is a CI test, not a promise.
3. A theme binds a label to each role. It can never add, remove or retype a role. If a setting needs different mechanics (for example lasers that ignore counter-battery), that is a **ruleset variant** with its own id and hash. A *bundle preset* can pair it with a theme, but the two never merge.
4. Everything the player sees has a fallback chain, and the last step never fails: theme asset, then parent theme, then theme shape parameters, then the generic role glyph, then a magenta placeholder. Text follows the same idea: locale, then the theme's default locale, then the neutral base locale, then `[key]`. **A theme with zero pictures and zero sounds is still fully playable.**

---

## 1. Fixed mechanics versus swappable theme, concept by concept

Legend for the "Kind" column:
- **Role**: a mechanical slot with fixed behaviour. The theme supplies only the label, art and sound.
- **Structural**: part of the engine's shape (turn loop, grid, attachment). It is not a slot, and the theme can only rename the words used for it in the UI.
- **Pure theme**: presentation only. The simulation never reads it.
- **Theme + RNG**: presentation, but generated during play, so it needs the cosmetic random stream (see pitfall P-9).

### 1.1 Resources (manual p.11, p.30-32, p.38-39)

| Role id | Colonial label | Mechanical meaning (fixed) | Kind |
|---|---|---|---|
| `res.basic` | Wood | Main construction material. Produced by `bld.basic_extractor` on `t.wood_a`/`t.wood_b`, better near a river. Every building costs it. | Role |
| `res.hard` | Metal | Second-tier material for upgrades and military. Produced by `bld.hard_extractor` near peaks; a level-1 extractor always yields at least 1. | Role |
| `res.coin` | Gold | **Both currency and a mined commodity.** Recruitment, patron purchases, tax; produced by `bld.coin_extractor` near peaks (useless at a -100% modifier for expeditions, floor -90% for indigenous players); earns interest for one faction profile; counted by the "hoard" ability. | Role (must stay a single resource; see P-6) |
| `res.wares` | Goods | Manufactured input for level 3+ buildings and level 3+ units. Comes **only** from `bld.converter` (costs 1 basic, 1 hard and 1 food per level) or from the patron. Natives never sell it. | Role |
| `res.food` | Crops | Feeds the population; a shortage causes emigration or starvation. Produced by `bld.food`. | Role |
| `res.pop` | People | The colony's population. It is labour, it is spent as the "P" cost of units, and it is the housing load. | Structural (one population pool per colony) |

The set of six is **fixed by the ruleset**. A theme cannot add a seventh resource (for example "Mana"). That needs a new ruleset major version.

### 1.2 Buildings (manual p.30-31 table)

| Role id | Colonial | Fixed behaviour | Kind |
|---|---|---|---|
| `bld.core` | Colony Center | Founded by consuming a founder unit. Caps every building's level. Its upgrade widens the footprint by one ring. Houses as many people as `bld.habitat` of the same level. Commissions commanders. Cannot be demolished. Max level 4 (2 for the indigenous archetype). | Role |
| `bld.food` | Farm | Produces `res.food` (3/9/21/36). Houses 40 people per level. Best on `t.open` near water. | Role |
| `bld.basic_extractor` | Mill | Produces `res.basic` 1/3/7/12. | Role |
| `bld.hard_extractor` | Metal Mine | Produces `res.hard` 1/3/7/12, never below 1 at level 1. | Role |
| `bld.coin_extractor` | Gold Mine | Produces `res.coin` 20/60/140/240. | Role |
| `bld.converter` | Commerce | Produces `res.wares` 1/3/7/12 from the inputs above. | Role |
| `bld.habitat` | Housing | Capacity 100/300/600/1000. Recruits a founder of up to its own level. | Role |
| `bld.attractor` | Church | Immigration +10/+20/+30/+40 per turn. Boosted by `disc.remedy`. | Role (P-5) |
| `bld.scout_post` | Tavern | Recruits scouts up to its level; limits how many scouts you can support. | Role |
| `bld.garrison` | Fort | 2x2 footprint. Recruits military up to its level; supports 4/7/9/10 military units; adds defending ranged units in a siege; is harder to destroy in a raid. | Role |
| `bld.port` | Dock | Must stand on water. On deep water it builds transports and opens the patron trade link. On river or still water that connects to deep water it opens trade only. On disconnected water it is a local trading post. | Role (P-2) |
| `bld.academy` | War College | Single level. Spends `res.coin` (rising cost) on attack and defence ratings per military role. | Role |

The footprint (1x1, or 2x2 for the garrison), placement rules (flat land only, water for the port) and level caps are **ruleset**. Theme art must fit the footprint. The validator checks the declared pixel size of every picture against the footprint.

### 1.3 Units (manual p.38-39, p.40-46)

| Role id | Colonial | Fixed behaviour | Kind |
|---|---|---|---|
| `u.scout` | Explorer | Fastest land unit; can auto-explore; better at avoiding hostile settlements; cannot fight. | Role |
| `u.founder` | Settler | Slowest unit; founds a colony; cannot fight. | Role |
| `u.commander` | Leader | Carries military units and founders. Its level sets attacks per combat turn. Charisma, reputation and XP. Cannot fight alone. | Role |
| `u.line` | Infantry | Combat: move 1 **or** attack an adjacent square. Counts 1 toward square capacity. Fights at full strength when boarding. | Role |
| `u.shock` | Cavalry | Combat: move 2, or move 1 then attack. Charge bonus. Counts 2 toward square capacity. Half strength when boarding. | Role |
| `u.ranged` | Artillery | Combat: confined to its home row; fires anywhere in its column, stronger at short range. Counter-battery penalty; takes extra damage when alone. Counts 2. Does not fight when boarding. | Role (P-1) |
| `u.transport` | Ship | Moves on deep water only. Carries units. Ship combat: sink, board, or flee. | Role (P-2) |
| `u.militia` | (militia) | Spawned to defend a colony; its losses cost population. Always level 2 `u.line` or `u.ranged`. | Role (generated, not recruitable) |

The **"like attacks like"** targeting weight, **combined arms** (counted per distinct role) and **flanking** are keyed by role id, never by name.

### 1.4 Factions: nations, the patron and natives

| Concept | Role id | Fixed behaviour | Kind |
|---|---|---|---|
| Faction archetype | `arch.expedition`, `arch.indigenous` | Expedition: arrives by transport at the arrival edge, has a patron, pays tax, may build `u.ranged`, Center max level 4. Indigenous: starts at the home edge with no patron and no tax, cannot build `u.ranged`, cheaper founder/line/shock, farther scouts, can trade with distant native settlements, federates instead of declaring independence. | Role (P-4) |
| Faction profile | `fp.naval_ranged`, `fp.envoy_shock`, `fp.scout_line`, `fp.mobility`, `fp.banker`, `fp.indigenous_high` | Bundles of effects (Deluxe p.56-57): naval-combat bonus plus ranged +1; native relations +30 plus shock +1; scout effective level +1 plus line +1; movement one step easier; 5% coin interest plus patron trade one turn faster; indigenous bonuses. | Role (effect data in the ruleset; the name comes from the theme) |
| Faction identity | `faction.<slot>` | Name, adjective, flag, colour, leader-name pool, colony-name pool, voice. | Pure theme |
| Patron / home base | `patron` | Sends the first founder (turn 6 in most scenarios, p.24). Collects automated tax. Sells and buys commodities with a delay. Can be angered by early diplomacy. After independence it becomes a neutral overseas market under a new label. | Role (P-3) |
| Native settlements (NPC) | `npc.settlement` | 0-50 per map. Friendly or hostile (difficulty raises hostility). Trade everything except `res.wares`, at most one trade per turn, settled immediately. Intercept units that come too close; strength sets their battle force; may help defend a nearby friendly colony; can be federated. | Role (P-4) |
| Diplomatic statuses | `dip.*` (ordered scale, -100..+100 on a 201-point scale) | Thresholds unlock tribute, barter and trade alliances (needs better than "Understanding"). | Role, labels from the theme |
| Sovereignty change | `sov.independence`, `sov.commonwealth`, `sov.federation` | Earns victory points; changes the patron relationship. | Role |

### 1.5 Terrain and map features

| Role id | Colonial | Fixed behaviour | Kind |
|---|---|---|---|
| `t.deep` | Ocean | Navigable by transports; impassable on land; required for building transports and for the patron link. No exploration points. | Role (P-2) |
| `t.still` | Lake | Impassable for everything. A port there is a trading post. | Role |
| `t.river` | River | Land may cross it. A port is allowed. Boosts nearby extractors and farms. Can be ocean-connected. | Role |
| `t.open` | Grassland | Flat, buildable, best for food. | Role |
| `t.wood_a`, `t.wood_b` | Forest, Jungle | Flat, buildable, best for basic material; different movement cost. | Role |
| `t.rough` | Hills | Not buildable; slow. | Role |
| `t.peak` | Mountains | Not buildable; slowest; coin and hard extractors nearby do well. | Role |
| Landmarks | `lm.river`, `lm.peak`, `lm.range`, `lm.region` | Discovered and named by the first finder (p.9). Score points; record bonuses (longest, highest) are judged at game end. | Role; the **player-typed name** is stored in state; default names are Theme + RNG |
| Special discoveries | `disc.coin_deposit` (gold, silver), `disc.hard_deposit` (tin, iron), `disc.mixed_deposit` (copper), `disc.grove` (5 tree kinds), `disc.fertile` (5 crops), `disc.remedy` (herbs) | Magnitude and radius bonus to the matching building role; control passes to whoever stands adjacent (p.58). | Role. The many named sub-kinds (Oak, Teak...) are **cosmetic variants** of one role. |
| Rare discoveries | `disc.r.commanders` (Pyramid), `disc.r.coin_vein` (a legendary lost mine), `disc.r.ruin` (Ancient Ruin), `disc.r.growth` (Fountain of Youth) | Commanders +4 leadership, +2 combat, +1 move (doubled for indigenous, who also get +2 charisma); all coin extractors +25%; random bonus; population growth. | Role |
| Map generation | land seeds, water seeds, size 80-256 | Topology and terrain distribution. | Ruleset + settings |
| Combat backdrop | forest, river, grass (p.45) | "Only alters the graphics" | Pure theme |

### 1.6 Events, messages and text

| Concept | Fixed part | Theme part |
|---|---|---|
| Turn digest ("Colonial Gazette" in the original; the name must not be reused) | The list of typed events (`ev.colony_founded`, `ev.battle_result`, `ev.landmark_named`, `ev.score_table`, ...) and their payloads | Title, masthead art, template per event type |
| Flavour almanac ("Annals of History" in the original) | Nothing; it can be switched off | Optional, one entry per turn from `flavour/almanac.json`; may be empty |
| Status-bar feedback | Error codes from order validation (`err.insufficient{res}`, `err.not_flat`, `err.level_cap`) | Message templates |
| Messages window, Communiqué (C key) | Delivery next turn | UI words |
| Mission and scenario briefings | Goal predicates (`discover_landmarks >= 3 by turn 10`, `found_colony by 20`, `core_level >= 2 by 30`, `eliminate faction X by 40`) and the failure rule | Briefing and failure text (the original's "the King will have you beheaded" is theme) |
| Calendar | `turn` (an integer starting at 0) | `calendar`: start value, step, format (`1493 + turn` is colonial flavour, p.4) |
| Help text (right-click) | None | Per role and per UI key |

### 1.7 UI, art, audio, names

| Concept | Kind | Notes |
|---|---|---|
| Window layout, buttons, key map (E, N, F1-F4, +/-, Z, X, C, Esc) | Structural | Button **labels** come from the locale; bindings do not. F2 "next leader" is shown as "Next {role.u.commander}". |
| Palette, fonts, panel frames, cursors | Pure theme | Contrast is checked by the validator (section 5). |
| Unit, building, terrain, icon pictures | Pure theme | Keyed by role id plus level plus variant (section 6). |
| Music and sound cues | Pure theme | Cues are keyed by event type (`ev.*`) and UI action. |
| Colony, leader and ship default names | Theme + RNG | Player-typed names are stored as typed. |
| Score categories, special abilities | Role | 40-point allocation; 10-point abilities `ab.hoard` (Miser), `ab.populous` (Colonist), `ab.claimant` (Discoverer), `ab.peaceful` (Pacifist), `ab.land_speed` (Cartography), `ab.sea_speed` (Navigator), `ab.garrison_plus` (Conqueror), `ab.merchant` (Craftsman), `ab.naval_combat` (Admiral), `ab.envoy` (Missionary). Labels come from the theme. |
| Win condition | Ruleset + settings | Winning score (0-200,000), max turns (0-300), last player standing. The draft locks "last player standing" for the MVP; the theme only words the result screen. |

---

## 2. The theme-pack schema

### 2.1 Format choice

**JSON for everything.** The draft targets Python 3.10+, and `tomllib` only exists from 3.11. TOML would force either a dependency or a 3.11 floor (decision D-3). JSON allows no comments, so authors use `"_note"` fields, which every loader ignores.

### 2.2 Folder layout

```
conquest/
  rules/                         # RULESET layer (core imports only this)
    core/
      ruleset.json               # id, version, role index, setting ranges, archetypes
      resources.json  terrain.json  buildings.json  units.json
      factions.json              # archetypes + faction profiles (effects only, no names)
      discoveries.json  abilities.json  combat.json  economy.json  scoring.json
      events.json                # event type ids and payload schemas
    variants/                    # overlays; each changes rules and therefore the rules hash
      equal-nations.json         # the original 1996 rules: nation = flag only (p.21)
      mvp.json                   # the draft's MVP subset (no tribes, discoveries, diplomacy...)
      no-patron.json             # example: no home base for anyone
  themes/                        # THEME layer (only app/ and ui/ read it)
    colonial/
      theme.json                 # manifest
      roles.json                 # role id -> label keys + asset keys + glyph
      factions.json              # faction slot -> name, colours, flag, name pools
      calendar.json
      names/  colonies.json  leaders.json  landmarks.json  transports.json
      text/   en.json  fr.json   # locale files
      flavour/ almanac.json  briefings.json
      shapes.json                # parameters for the code-drawn fallback painters
      assets/ manifest.json  *.png
      audio/  manifest.json  *.ogg
    starfall/
      ...same files...
  settings/
    presets/  quick.json  classic.json  starfall-hardcore.json   # bundle presets
  scenarios/
    tutorial.json  island.json  natives.json  survivor.json  open-world.json
```

### 2.3 Ruleset files (role ids only)

`rules/core/ruleset.json`

```json
{
  "id": "conquest-core",
  "version": "1.0.0",
  "roles": {
    "resources": ["res.basic", "res.hard", "res.coin", "res.wares", "res.food", "res.pop"],
    "terrain":   ["t.deep", "t.still", "t.river", "t.open", "t.wood_a", "t.wood_b", "t.rough", "t.peak"],
    "buildings": ["bld.core", "bld.food", "bld.basic_extractor", "bld.hard_extractor",
                  "bld.coin_extractor", "bld.converter", "bld.habitat", "bld.attractor",
                  "bld.scout_post", "bld.garrison", "bld.port", "bld.academy"],
    "units":     ["u.scout", "u.founder", "u.commander", "u.line", "u.shock", "u.ranged",
                  "u.transport", "u.militia"],
    "archetypes": ["arch.expedition", "arch.indigenous"],
    "faction_slots": ["f1", "f2", "f3", "f4", "f5", "f6"],
    "npc": ["npc.settlement"],
    "landmarks": ["lm.river", "lm.peak", "lm.range", "lm.region"],
    "discoveries": ["disc.coin_deposit", "disc.hard_deposit", "disc.mixed_deposit",
                    "disc.grove", "disc.fertile", "disc.remedy",
                    "disc.r.commanders", "disc.r.coin_vein", "disc.r.ruin", "disc.r.growth"],
    "abilities": ["ab.hoard", "ab.populous", "ab.claimant", "ab.peaceful", "ab.land_speed",
                  "ab.sea_speed", "ab.garrison_plus", "ab.merchant", "ab.naval_combat", "ab.envoy"],
    "score_categories": ["sc.colony", "sc.exploration", "sc.combat", "sc.diplomacy"]
  },
  "setting_ranges": {
    "world_size":       {"min": 80, "max": 256, "default": 128},
    "native_settlements": {"min": 0, "max": 50, "default": 15},
    "max_turns":        {"min": 0, "max": 300, "default": 0, "_note": "0 = unlimited"},
    "winning_score":    {"min": 0, "max": 200000, "default": 0},
    "computer_players": {"min": 0, "max": 5, "default": 1},
    "difficulty":       ["very_easy", "easy", "normal", "hard", "very_hard"],
    "movement":         ["easy", "normal", "difficult"],
    "resources":        ["scarce", "normal", "abundant"],
    "play_time_bonus":  ["off", "normal", "extreme"]
  }
}
```

`rules/core/factions.json` (mechanics only. Note that slot `f1` is *not* "Britain".)

```json
{
  "archetypes": {
    "arch.expedition": {
      "start": "arrival_edge", "has_patron": true, "taxed": true,
      "max_core_level": 4, "can_field": ["u.line", "u.shock", "u.ranged"],
      "sovereignty_moves": ["sov.independence", "sov.commonwealth"]
    },
    "arch.indigenous": {
      "start": "home_edge", "has_patron": false, "taxed": false,
      "max_core_level": 2, "can_field": ["u.line", "u.shock"],
      "sovereignty_moves": ["sov.federation"],
      "effects": [{"kind": "unit_cost_mult", "unit": "u.founder", "value": 0.8, "assumed": true},
                  {"kind": "npc_trade_range_mult", "value": 2.0, "assumed": true}]
    }
  },
  "cross_archetype_capture": "forbidden",
  "profiles": {
    "fp.naval_ranged":  {"archetype": "arch.expedition", "effects": [
        {"kind": "grant_ability", "ability": "ab.naval_combat"},
        {"kind": "academy_bonus", "unit": "u.ranged", "value": 1}]},
    "fp.envoy_shock":   {"archetype": "arch.expedition", "effects": [
        {"kind": "npc_relations", "value": 30},
        {"kind": "academy_bonus", "unit": "u.shock", "value": 1}]},
    "fp.scout_line":    {"archetype": "arch.expedition", "effects": [
        {"kind": "effective_level", "unit": "u.scout", "value": 1, "stat": "move"},
        {"kind": "academy_bonus", "unit": "u.line", "value": 1}]},
    "fp.mobility":      {"archetype": "arch.expedition", "effects": [
        {"kind": "movement_setting_step", "value": -1}]},
    "fp.banker":        {"archetype": "arch.expedition", "effects": [
        {"kind": "stock_interest", "resource": "res.coin", "value": 0.05},
        {"kind": "patron_trade_delay", "value": -1, "min": 1}]},
    "fp.indigenous_high": {"archetype": "arch.indigenous", "effects": [
        {"kind": "effective_level", "unit": "*land", "value": 1, "stat": "move"},
        {"kind": "extractor_modifier_floor", "building": "bld.coin_extractor", "value": -0.9},
        {"kind": "output_mult", "building": "bld.coin_extractor", "value": 1.2, "assumed": true},
        {"kind": "academy_bonus", "unit": "u.shock", "value": 1}]}
  },
  "slots": {
    "f1": "fp.naval_ranged", "f2": "fp.envoy_shock", "f3": "fp.scout_line",
    "f4": "fp.mobility", "f5": "fp.banker", "f6": "fp.indigenous_high"
  }
}
```

Effect `kind`s are verbs about roles (`academy_bonus`, `stock_interest`, `patron_trade_delay`). None of them names a themed noun. The draft's `admiral`, `gold_interest`, `mother_trade_allowed`, `gold_mine_modifier_floor` and `explorer_level_bonus` are renamed to these.

### 2.4 Theme manifest

`themes/<id>/theme.json`

```json
{
  "id": "colonial",
  "version": "1.0.0",
  "extends": null,
  "requires_ruleset": {"id": "conquest-core", "major": 1},
  "default_locale": "en",
  "locales": ["en", "fr"],
  "display_name_key": "theme.name",
  "palette": {
    "paper": "#efe6d2", "ink": "#2b2420", "water_deep": "#2f5d7c", "water_still": "#4f7f99",
    "open": "#9cbf6a", "wood_a": "#4f7a3a", "wood_b": "#3d6b44", "rough": "#a08a5c",
    "peak": "#8c8478", "fog": "#000000", "fog_known_alpha": 0.55
  },
  "fonts": {"en": "assets/fonts/serif.ttf", "fr": "assets/fonts/serif.ttf", "_fallback": "builtin"},
  "battle_backdrops": {"t.open": "battle.bg.open", "t.wood_a": "battle.bg.wood", "t.river": "battle.bg.river"},
  "features": {"almanac": true, "digest_masthead": "ui.digest.masthead"},
  "license": {"art": "original", "text": "original", "audio": "original"}
}
```

Validator rule: the **only** keys a theme may hold are those in the theme schema. A theme file that contains `cost`, `output`, `move`, `hit`, `effects`, `level_cap` or any other ruleset key is **rejected** (it is not just ignored). This stops numbers from creeping into themes.

### 2.5 Role bindings

`themes/<id>/roles.json`. This binds every role to text keys, asset keys and a fallback glyph.

```json
{
  "res.basic":  {"name": "res.basic.name", "icon": "icon.res.basic", "glyph": "log",    "color": "wood_a"},
  "res.coin":   {"name": "res.coin.name",  "icon": "icon.res.coin",  "glyph": "coin",   "color": "#d4a72c"},
  "bld.garrison": {"name": "bld.garrison.name", "sprite": "bld.garrison", "glyph": "keep", "levels": 4},
  "u.ranged":   {"name": "u.ranged.name", "sprite": "u.ranged", "glyph": "barrel",
                 "sfx": {"attack": "sfx.ranged.fire", "die": "sfx.unit.down"}},
  "u.transport": {"name": "u.transport.name", "sprite": "u.transport", "glyph": "hull"},
  "patron":     {"name": "patron.name", "name_after": {"sov.independence": "patron.market.name"},
                 "icon": "icon.patron"},
  "t.deep":     {"name": "t.deep.name", "tile": "tile.deep", "glyph": "waves"}
}
```

`glyph` names one of the generic painters in `shapes.py` (log, coin, keep, barrel, hull, waves, figure, banner...). Painters are keyed by **shape**, not by theme. So the sci-fi theme can use `"glyph": "keep"` for its Bastion and get a recognisable fort with zero art.

### 2.6 Factions (identity only)

`themes/colonial/factions.json`

```json
{
  "f1": {"name": "faction.f1.name", "adj": "faction.f1.adj", "color": "#b8323a", "flag": "flag.f1",
         "names": {"colonies": "names/colonies.json#f1", "leaders": "names/leaders.json#f1"}},
  "f6": {"name": "faction.f6.name", "adj": "faction.f6.adj", "color": "#6a4c93", "flag": "flag.f6",
         "names": {"colonies": "names/colonies.json#f6", "leaders": "names/leaders.json#f6"}},
  "npc.settlement": {"name": "npc.settlement.name", "plural": "npc.settlement.plural",
                     "sprite": "npc.settlement", "glyph": "lodge",
                     "names": "names/settlements.json"}
}
```

### 2.7 Locale file

`themes/colonial/text/en.json`. These are flat keys, ICU-style placeholders and plural categories.

```json
{
  "theme.name": "New Shores (colonial)",
  "res.basic.name": {"one": "Wood", "other": "Wood"},
  "res.hard.name":  {"one": "Metal", "other": "Metals"},
  "res.coin.name":  {"one": "Gold", "other": "Gold"},
  "res.wares.name": {"one": "Goods", "other": "Goods"},
  "res.food.name":  {"one": "Crop", "other": "Crops"},
  "res.pop.name":   {"one": "colonist", "other": "colonists"},
  "bld.garrison.name": "Fort",
  "u.ranged.name": {"one": "Artillery", "other": "Artillery"},
  "u.transport.name": {"one": "Ship", "other": "Ships"},
  "patron.name": "the Crown",
  "patron.market.name": "the Old World markets",
  "faction.f1.name": "Britain", "faction.f1.adj": "British",
  "faction.f6.name": "{owner_choice}",
  "npc.settlement.name": "{owner_choice}",
  "ui.digest.title": "The Colony Courier",
  "ui.calendar.turn": "Year {year}",
  "err.insufficient": "Not enough {res}: need {need}, have {have}.",
  "ev.colony_founded": "{faction_adj} colonists founded {colony}.",
  "brief.tutorial.m1": "Make landfall and find three great landmarks within {turns} years.",
  "brief.tutorial.fail": "Your patron has lost patience. The expedition is recalled."
}
```

(`{owner_choice}` marks a decision that is still open, D-4. Names such as "Colonial Gazette" and "Annals of History" from the 1996 game are **not** used; see section 7.)

### 2.8 Calendar

```json
{"start": 1493, "step": 1, "format_key": "ui.calendar.turn", "value_name": "year"}
```

The simulation stores `turn` only. `year = start + turn * step` is computed in the UI.

### 2.9 Two contrasting themes on the same ruleset

The table proves coverage: every role has a label in both themes, and no mechanic changes. A third, partial fantasy column shows that the slots also stretch further.

| Role | `colonial` ("New Shores") | `starfall` (alien-world colony, sci-fi) | `ember-isles` (fantasy, sketch) |
|---|---|---|---|
| `res.basic` | Wood | Fibre | Timber |
| `res.hard` | Metal | Ore | Iron |
| `res.coin` | Gold | Iridium (mined, and it is the currency) | Gold |
| `res.wares` | Goods | Components | Wares |
| `res.food` | Crops | Rations | Grain |
| `res.pop` | colonists | colonists | settlers |
| `bld.core` | Colony Center | Habitat Hub | Keep |
| `bld.food` | Farm | Hydro Farm | Croft |
| `bld.basic_extractor` | Mill | Fibre Harvester | Sawmill |
| `bld.hard_extractor` | Metal Mine | Ore Drill | Iron Pit |
| `bld.coin_extractor` | Gold Mine | Iridium Rig | Gold Delve |
| `bld.converter` | Commerce | Fabricator | Guildhall |
| `bld.habitat` | Housing | Hab Block | Cottages |
| `bld.attractor` | Church | Beacon Array | Shrine |
| `bld.scout_post` | Tavern | Survey Lounge | Waystation |
| `bld.garrison` | Fort | Bastion | Barracks |
| `bld.port` | Dock | Hover Pad | Quay |
| `bld.academy` | War College | Tactics Lab | War Academy |
| `u.scout` | Explorer | Pathfinder | Ranger |
| `u.founder` | Settler | Colony Pod | Settler Wagon |
| `u.commander` | Leader | Captain | Warden |
| `u.line` | Infantry | Troopers | Spearmen |
| `u.shock` | Cavalry | Skimmer Lancers | Riders |
| `u.ranged` | Artillery | Mortar Crawler | Ballista |
| `u.transport` | Ship | Hover Barge | Longship |
| `t.deep` | Ocean | Brine Sea | Open Sea |
| `t.still` | Lake | Tar Lake | Mere |
| `t.river` | River | Channel | River |
| `t.open` / `t.wood_a` / `t.wood_b` | Grassland / Forest / Jungle | Plain / Spore Forest / Glass Thicket | Meadow / Pinewood / Mirewood |
| `t.rough` / `t.peak` | Hills / Mountains | Ridges / Spires | Downs / Crags |
| `patron` / after independence | the Crown / Old World markets | the Consortium / Core Worlds exchange | the Throne Across the Sea / Free Ports |
| `arch.indigenous` + `npc.settlement` | owner decision D-4 | the Veyl / Veyl warrens | the Wildkin / Wildkin holts |
| `disc.grove` variants | Redwood, Oak, Cherry, Teak, Maple | Spore Bloom, Lattice Tree, ... | Silverbark, Heartoak, ... |
| `disc.r.growth` | a legendary spring | Regen Spring | Wellspring of Ages |
| Turn digest title | The Colony Courier | Colony Bulletin | The Herald |
| Calendar | Year 1493 + n | Cycle n + 1 | Year n + 1 of the Landing |
| Battle objective marker | Standard | Beacon | Banner |
| Ship-combat initiative ("wind gauge") | weather gauge | vector advantage | the wind |

`themes/starfall/text/en.json` (excerpt; same keys as colonial):

```json
{
  "theme.name": "Starfall",
  "res.coin.name": {"one": "Iridium", "other": "Iridium"},
  "res.wares.name": {"one": "Component", "other": "Components"},
  "u.ranged.name": {"one": "Mortar Crawler", "other": "Mortar Crawlers"},
  "u.transport.name": {"one": "Hover Barge", "other": "Hover Barges"},
  "patron.name": "the Consortium",
  "patron.market.name": "the Core Worlds exchange",
  "npc.settlement.name": {"one": "Veyl warren", "other": "Veyl warrens"},
  "ui.digest.title": "Colony Bulletin",
  "ui.calendar.turn": "Cycle {cycle}",
  "brief.tutorial.m1": "Touch down and chart three major landmarks within {turns} cycles.",
  "brief.tutorial.fail": "The Consortium has cut your charter. Recall ordered."
}
```

`themes/starfall/calendar.json`: `{"start": 1, "step": 1, "format_key": "ui.calendar.turn", "value_name": "cycle"}`

### 2.10 Proof that the same ruleset runs under both (CI tests)

| Test | What it asserts |
|---|---|
| `test_theme_swap_determinism` | For seeds S1..S5, run 60 headless AI-vs-AI turns under `colonial`, `starfall` and an **empty theme** (no files besides the manifest). The per-turn `rules_state_hash` is identical across all three. |
| `test_theme_coverage[theme]` | Every role id in `ruleset.json` has a binding and a base-locale label; every faction slot is named; every `ev.*` and `err.*` key has a template. |
| `test_theme_has_no_rules[theme]` | No ruleset key appears anywhere in a theme file (schema allow-list). |
| `test_core_imports_no_theme` | The boundary test (the draft already has one) also forbids `core/` and `ai/` from importing `themes`, `assets` or the locale loader. |
| `test_save_reload_other_theme` | A save made under `colonial` loads under `starfall`; the state hash is unchanged and only the presentation differs. |

---

## 3. The settings layer and ruleset variants

### 3.1 The layers and who owns them

```
Ruleset (core@1)  +  Variants [ordered]   ->  Rules   (frozen; rules_hash)     -> core/, ai/
Match settings  +  Player setups  +  Scenario  ->  MatchConfig (validated vs Rules.setting_ranges)
Theme (+ parent)  +  Locale                     ->  Presentation (never seen by core)
Bundle preset = named pointer to {variants, theme, match defaults}  (convenience only)
```

| Layer | Examples (manual) | Changes the rules hash? | Can a theme change it? |
|---|---|---|---|
| Ruleset | Building and unit tables, combat model, faction profiles | Yes | No |
| Variant | `equal-nations` (1996 base game: country = flag only, p.21), `mvp`, `no-patron`, `abundant-ruins` | Yes (variant ids and versions are hashed) | No; a bundle may *suggest* one |
| Match settings | World size 80-256, land/water seeds, native settlements 0-50, max turns 0-300, winning score 0-200,000, early diplomacy, resources scarce/normal/abundant, movement easy/normal/difficult, difficulty x5, play-time bonus off/normal/extreme, computer players 0-5, seed | Stored in the save and part of the **game** hash, not of the rules hash | No |
| Player setup | Name, faction slot, 40 victory-bonus points across 4 categories, 10-point abilities | Part of the game hash | No |
| Scenario | Tutorial (4 timed missions), Island, Natives (federate 15), Survivor, open world, templates, mapped scenarios | Part of the game hash | No; the theme only supplies briefing text |

### 3.2 Variant format (typed overlay, not a free-form merge)

```json
{
  "id": "equal-nations",
  "version": "1.0.0",
  "applies_to": {"ruleset": "conquest-core", "major": 1},
  "ops": [
    {"op": "replace", "path": "factions.profiles.fp.naval_ranged.effects", "value": []},
    {"op": "replace", "path": "factions.profiles.fp.envoy_shock.effects", "value": []},
    {"op": "replace", "path": "factions.profiles.fp.scout_line.effects", "value": []},
    {"op": "replace", "path": "factions.profiles.fp.mobility.effects", "value": []},
    {"op": "replace", "path": "factions.profiles.fp.banker.effects", "value": []}
  ]
}
```

Only `replace`, `add` (to a list or map) and `remove` are allowed. After all ops are applied, the **full ruleset validator runs again** on the result. A variant can therefore never leave a dangling reference. Variants cannot add role ids unless the variant declares `"adds_roles": [...]`, and a variant that adds roles makes every theme without a binding for them fail coverage. That is deliberate: such a variant is effectively a new ruleset.

### 3.3 Match settings file

```json
{
  "schema": "match-settings/1",
  "ruleset": {"id": "conquest-core", "major": 1, "variants": ["mvp@1"]},
  "theme": "colonial", "locale": "en",
  "seed": 918273,
  "world": {"size": 128, "land_seeds": 12, "water_seeds": 8},
  "native_settlements": 15,
  "max_turns": 0, "winning_score": 0,
  "early_diplomacy": false,
  "resources": "normal", "movement": "normal", "difficulty": "normal",
  "play_time_bonus": "off",
  "players": [
    {"name": "Ada", "slot": "f1", "control": "human",
     "bonus_points": {"sc.colony": 20, "sc.exploration": 10, "sc.combat": 0, "sc.diplomacy": 0},
     "abilities": ["ab.land_speed"]},
    {"name": null, "slot": "f2", "control": "ai"}
  ],
  "scenario": "open-world"
}
```

`"name": null` means the theme's leader-name pool picks a name from the cosmetic stream.

### 3.4 Validation pipeline (fail fast, file + JSON path in every message)

1. **Schema** for each file, with an allow-list of keys (a stdlib dataclass loader as in the draft; D-8 covers whether to use pydantic instead).
2. **Ruleset integrity**: every referenced role exists; level arrays have length 4 where the role has 4 levels; costs only name `res.*`; `slots` cover `faction_slots` exactly once each.
3. **Variants** applied in order, then step 2 runs again.
4. **Settings against `setting_ranges`**: numbers within range; enums known; a slot used by at most one player (p.48: "No two players can play for the same country"); player count = humans + AIs ≤ 6; bonus points total ≤ 40, with each ability costing 10.
5. **Scenario against rules**: goal predicates name known roles and slots; the scenario's `requires` features (for example `npc.settlement`, `sov.federation` for the Natives scenario) are not disabled by a variant. The `mvp` variant plus the `natives` scenario is an **error**, not a silent no-op.
6. **Theme against rules** (coverage, section 2.10): missing labels are errors in the base locale and warnings in other locales; missing pictures are **warnings** (the fallback exists); unknown role ids in the theme are warnings (they may belong to another ruleset version).
7. **Presentation sanity**: palette contrast for text pairs and for adjacent terrain pairs; picture pixel size against the footprint; font glyph coverage for the locale's sample string.

Steps 1-5 block game start. Steps 6-7 block only in `--strict` (CI) mode for errors and never for warnings.

### 3.5 Saves

```json
{"save_version": 3,
 "rules": {"id": "conquest-core", "version": "1.0.0", "variants": ["mvp@1.0.0"], "hash": "sha256:..."},
 "presentation": {"theme": "colonial@1.0.0", "locale": "en"},
 "match": {...}, "state": {...}}
```

On load, if the rules hash matches, the save loads under **any** installed theme (the player may switch themes mid-campaign). If the rules hash differs, run a migration from the save-migration table or refuse with a clear message. A theme mismatch is never fatal: a missing theme falls back to the neutral base presentation.

---

## 4. Pitfalls: where the theme leaks into the rules, and how to abstract each

| # | Leak | Why it matters | Abstraction that keeps the feel |
|---|---|---|---|
| P-1 | **Gunpowder: Artillery** | The 1996 setting explains the home-row lock, column fire, the counter-battery penalty, the lone-crew weakness and "natives cannot build it" with cannons. | The mechanic is `u.ranged`: a slow, fragile-alone, column-firing role. The prohibition is an **archetype capability** (`can_field`), not "natives lack gunpowder". Each theme invents its own reason (Ballista needs a guild; Mortar Crawlers need Consortium licences). Militia "Level 2 Infantry or Artillery" become `u.line`/`u.ranged`. Garrison-spawned defenders are "+1 `u.ranged` per garrison". |
| P-2 | **Docks, ships, ocean** | The 1996 setting ties three things to the sea: transport movement, transports only from an ocean dock, and patron trade only through ocean-connected water. A space theme may want "void" instead of sea. | Terrain carries **medium flags** in the ruleset: `navigable` (`t.deep`), `port_site` (`t.deep`, `t.river`, `t.still`), `link_to_outside` (computed: water body connected to `t.deep` that touches the map edge). A theme may *call* `t.deep` "Void Lane", but it cannot change which tiles are navigable, because that would change map topology and therefore the rules. Ship combat (sink/board/flee, initiative favouring small hulls) stays; "wind gauge" becomes the `initiative` label. |
| P-3 | **Mother Country** | Tax, trade with a delay, first founder on turn 6, anger at early diplomacy, independence turning it into "Europe" (p.14). This is the strongest colonial flavour in the game. | One `patron` role with a state machine: `bound -> independent` (label switch via `name_after`). Arrival edge and delay are ruleset numbers. Themes that do not want a "home across the sea" still need *some* outside trader, because `res.wares` has no other early source. Removing the patron is the `no-patron` **variant**, which must also give every faction a wares source (for example converter at level 1 without a wares cost). This is a rules change, so it belongs in a variant and never in a theme. |
| P-4 | **European versus native asymmetry** | Two different things: the playable indigenous faction (High Natives) and the NPC settlements. The rule "natives may not capture European colonies and vice versa" (p.40) is written in ethnic terms. | **Archetypes** `arch.expedition` / `arch.indigenous` hold the asymmetry as data (start edge, patron, tax, level cap, `can_field`, sovereignty move, trade range). Capture is `cross_archetype_capture: "forbidden"`, a ruleset switch, so it can be tuned, and the draft's raze fallback (A-47) is keyed to it. NPC settlements are `npc.settlement`, with no implied ethnicity. **Sensitivity:** the colonial theme should not use real tribal names or the manual's period wording, and should depict the indigenous faction as a full civilisation (decision D-4). |
| P-5 | **Religion: Church, Missionary** | Real-world religion as a mechanic: the immigration building and the native-relations ability. | `bld.attractor` and `ab.envoy` are roles. The colonial theme may keep "Church" as a label, or choose "Meeting House" (D-4). Other themes use Beacon Array or Shrine. `disc.remedy` boosts the attractor role, not "churches". |
| P-6 | **Gold is both money and ore** | Interest (banker profile), Miser scoring, the -100% / -90% mine floors and patron purchases all touch one stock. A theme might want to split it into "Credits" (money) and "Iridium" (ore). | Forbidden in a theme. One `res.coin` that is mined **and** spent. The sci-fi label "Iridium" works because the setting treats the metal as currency. A split would be a ruleset major version. |
| P-7 | **Calendar and starting year** | `1493 + turn` (p.4) appears in the draft's `GameState.year`. | The state holds `turn`; `calendar.json` formats it. Scenario deadlines are in turns. |
| P-8 | **Geography: east and west** | Europeans start on the right edge and natives on the left (p.21); small worlds push land "into the right-most quadrant" (p.56). | Use `arrival_edge` / `home_edge` in the ruleset (defaults right/left). The theme never mentions compass directions in rules text, only in briefings. |
| P-9 | **Names generated by randomness** | If default colony or leader names are drawn from the main random stream, a theme with a longer name pool shifts every later roll, and the same seed gives a different game. | Two streams: `rng_rules` (in `GameState`, hashed) and `rng_cosmetic` (seeded from `seed ^ 0xC05`, never read by `core`). Generated names are stored in state as strings, after they are drawn, so saves are stable. Names never affect rules (no "colony named X" checks). |
| P-10 | **Score records named after geography** | "Longest river", "highest mountain" (p.9, p.53). | Landmark roles `lm.river` (measured by length) and `lm.peak` (by height); the label comes from the theme. A space theme still has rivers ("Channels"). |
| P-11 | **Ability names that encode a setting** | Cartography, Navigator, Admiral, Missionary, Conqueror. | Ability roles `ab.*` (section 1.7); themes rename them ("Survey AI", "Pilot Corps"...). |
| P-12 | **Tutorial pinned to nations** | The tutorial is fixed to England against France (p.2). | Scenarios name slots (`f1` against `f2`); the theme names the slots. |
| P-13 | **Art that encodes mechanics** | A fort drawn 1x1, or a dock drawn on land, would mislead the player. | The validator checks picture size against the ruleset footprint and the placement medium. Shape fallbacks are drawn from the ruleset footprint, so they are always right. |
| P-14 | **Text built from fragments** | "Build " + name + "s" breaks in French, German and for irregular plurals ("Artillery"). | Whole-sentence templates with placeholders and plural categories; never concatenate (section 5). |
| P-15 | **Original trademarks and wording** | The colonial theme could easily reproduce the 1996 title, "Colonial Gazette", "Annals of History", the briefings and the original layout. | Original wording only (section 7). Mechanics and historical facts (nation names, the year) are fine. |
| P-16 | **The draft's `ui/theme.py`** | The name collides with "theme" in this document (it means widget styling there). | Rename it to `ui/style.py`, which reads palette and fonts from the active theme. |

---

## 5. Localisation

- **Key space.** `role.*`-style keys are generated from role ids (`u.ranged.name`, `u.ranged.desc`, `u.ranged.help`). `ui.*`, `err.*` and `ev.*` keys are owned by the engine, and a theme may override them. `brief.*` and `flavour.*` keys belong to the theme.
- **Ownership.** The engine ships a **neutral base locale** (`engine/text/en.json`) that labels every role plainly ("Basic material", "Ranged unit"). That makes an empty theme playable and gives translators the full key list.
- **Plurals.** Values may be a string or a plural map with CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`). A small stdlib plural-rule table covers the locales actually shipped (D-9); `other` is mandatory.
- **Placeholders** are `{name}`, with optional `{n, number}`. The formatter rejects a placeholder that the event payload does not define, and the CI test renders every `ev.*` and `err.*` template with a sample payload.
- **Grammar.** Labels that need gender or case (French "la Couronne", "le Fort") get extra forms (`"bld.garrison.name": {"other": "Fort", "_gender": "m"}`). Templates choose articles through `{name, article}`, and the locale file supplies the article rule.
- **Fonts.** pygame renders only the glyphs that the TTF contains. The theme declares a font per locale; the validator renders `text/<locale>.json["_sample"]` and fails on missing glyphs. Right-to-left scripts and CJK line breaking are out of scope until requested.
- **Layout.** Buttons and panels size to their text (German runs about 30% longer). Status-bar messages wrap; no string is cut off silently.
- **Player-typed text** (colony and landmark names, communiqués) is stored as raw Unicode, trimmed to a ruleset-defined maximum length, and never translated.
- **Numbers and dates** use the locale's digit grouping; the calendar format comes from the theme.

---

## 6. Asset fallback

### 6.1 Keys

`<kind>.<role>[.L<level>][.v<variant>][.<state>]`, for example `bld.garrison.L3`, `u.ranged.L2.attack`, `tile.t.wood_b.v2`, `icon.res.coin`, `flag.f4`, `ui.panel`, `battle.bg.open`. Keys are **role ids, never labels**. The draft's `building.farm.L2` becomes `bld.food.L2`.

### 6.2 Resolution chain (`assets.py`)

```
1. themes/<active>/assets/manifest.json[key]           -> PNG (size-checked)
2. same key with level/variant/state dropped, right-most first
   (bld.garrison.L3 -> bld.garrison)                    -> PNG, with a level badge drawn by code
3. themes/<parent>/... (if theme.json "extends")        -> repeat 1-2
4. shapes.py painter for roles.json[role].glyph, with the theme palette and the ruleset footprint
5. shapes.py generic painter for the role's category (building box, unit figure, terrain diamond)
6. magenta checker + one logged warning per key
```

- Steps 4-5 can always run, because the glyph and footprint are known for every role. A theme without pictures therefore looks consistent rather than broken. This matches the draft's decision 4.
- **Audio**: `audio/manifest.json[cue]`, then the parent theme, then the engine's default cue for the cue category (if any), then silence. A missing sound is logged once and never fails.
- **Text**: active locale, then the theme's default locale, then the parent theme, then the engine neutral base, then `[key]`, with a warning.
- **Provenance**: every manifest entry records `source`, `licence` and `author`, as in the draft. The validator refuses a picture without them in `--strict` mode.
- **Caching**: by (theme id, key, size, zoom). Switching theme clears the cache.

---

## 7. Copyright and originality (applies to every theme, the colonial one included)

- Mechanics and numbers are not protected expression, and the draft already reproduces the tables.
- Do **not** ship: the original title or logo; the names "Colonial Gazette" and "Annals of History"; the briefings, help text or flavour text; the manual's screen layouts copied pixel for pixel; or any Interplay art or audio.
- Historical facts (Britain, Spain, 1493) and generic words (Farm, Fort, Ship) are fine.
- Discovery names that are real places or legends are fine as generic references, but the theme should write its own lists rather than copying the manual's.

---

## 8. Runtime shape (how the layers meet in code)

```python
# core/ sees only Rules
rules = load_rules("rules/core", variants=["mvp@1"])           # frozen, rules.hash
state = new_game(rules, match_config, rng_rules_seed)

# app/ and ui/ build the presentation once per theme or locale switch
pres = load_presentation("themes/starfall", locale="en", rules=rules)  # validates coverage
pres.label("u.ranged", count=3)          # "Mortar Crawlers"
pres.text("err.insufficient", res=pres.label("res.hard"), need=5, have=2)
pres.year(state.turn)                     # "Cycle 41"
assets.get("u.ranged.L2", size, zoom)    # PNG or shape fallback
```

`Presentation` is a frozen dataclass. Switching theme builds a new one and never touches `state`.

---

## 9. What the draft must change to support themes

| Draft location | Problem | Change |
|---|---|---|
| §5 `GameState.year` | Bakes the colonial calendar into the state | Store `turn` only; the calendar comes from the theme (P-7) |
| §5 `Stock wood, metal, gold, goods, crops` | Field names are theme nouns | Map keyed by `res.*` (the set is still fixed by the ruleset) |
| §6.8 / §7.3 effect kinds `admiral`, `gold_interest`, `mother_trade_allowed`, `gold_mine_modifier_floor`, `explorer_level_bonus`, `forbidden_unit` | Effect names embed themed nouns; a nation id doubles as identity | Role verbs (section 2.3); split nations into archetype, profile and slot, with names in the theme |
| §7.3 `"high_natives": {"native": true, "start_edge": "west"}` | The asymmetry is a boolean plus a compass direction | `arch.indigenous` with explicit capabilities; `home_edge` (P-4, P-8) |
| §7.1/7.2 ids `farm`, `mill`, `artillery`, `ship` | Colonial words used as ids; the sci-fi "Hydro Farm" would map to `farm` | Neutral role ids (D-1 if the owner prefers to keep the short ids as opaque codes) |
| §7.5 `native_start_goods` | Tunable named after the theme | `archetype_start_stock["arch.indigenous"]` |
| §7.4 difficulty | Omits the manual's "natives more hostile at higher difficulty" (p.20) | Add `npc_hostility` per difficulty (ruleset) |
| §4.3 `data/trade_prices.json` vs prices inside `tunables` | Listed in two places | One home: `rules/core/economy.json` |
| §8.2 asset keys `building.farm.L2`, `ui.icon.wood` | Label-based | Role-based keys (section 6.1) |
| §4.3 `ui/theme.py` | Name clash | `ui/style.py` (P-16) |
| §3 non-goal "Colonial Gazette's historical flavour text" | Mixes the event digest (needed for Messages) with the almanac (optional flavour) | Keep the typed event digest in the MVP (`ev.*`); defer only the almanac |
| §4.1 boundary test | Does not cover themes | Add: `core/` and `ai/` must not import themes, locale or assets |
| §12 A-40 start units, A-28 start stock | Fine as data, but missing a per-archetype split | Key them by archetype |
| No randomness split | Default names would use the rules random stream | Add `rng_cosmetic` (P-9) |
| §13 copyright risk | Names the risk but not the words to avoid | Point to section 7 |

What the draft already gets right and should keep: effects as data (§6.8), the frozen state, the assets provider with shape fallback and provenance (§8.2), the import-boundary test, and the assumption register. All of it carries over unchanged under this architecture.

---

## 10. Decisions the owner must make

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| D-1 | Internal ids | (a) neutral role ids (`bld.garrison`); (b) keep the short colonial ids (`fort`) as opaque codes | (a): ids never mislead the author of a sci-fi theme, at the cost of a lookup table while reading the data |
| D-2 | May a theme carry rule tweaks? | (a) never; themes plus **bundle presets** that point to variants; (b) themes may override tunables | (a): keeps the theme-swap determinism test meaningful |
| D-3 | Data format | (a) JSON with Python 3.10+; (b) TOML, which needs Python 3.11+ (`tomllib`) or a dependency | (a) |
| D-4 | Presentation of the indigenous side in the colonial theme | The faction name (f6), the NPC settlement name, whether "Church" or a neutral label is used, and the art direction | Invented, respectful, non-tribal names; depict the indigenous faction as a full civilisation; neutral label for the attractor |
| D-5 | Default faction rules | (a) Deluxe bonuses (core); (b) 1996 equal nations as the default variant | (a), with `equal-nations` offered in the setup screen |
| D-6 | Which themes are built first | Colonial only, or colonial plus one contrasting theme from Phase 1 | Colonial plus a **minimal** second theme (labels and palette only) from Phase 1, so the swap test guards against leaks from day one |
| D-7 | Calendar | Year 1493+ (colonial), or a neutral "Turn n" engine default | Theme-defined; the engine default is "Turn n" |
| D-8 | Validator implementation | stdlib dataclass loader (as in the draft) or pydantic (a new dependency, needs your approval) | stdlib; the schemas are small |
| D-9 | Languages in scope | English only, or English plus one more to keep the pipeline honest | English plus one test locale (pseudo-localisation: accented, +30% length), so layout and plural bugs show early |
| D-10 | Mid-campaign theme switching | Allowed (state-safe) or locked per save | Allowed; it costs nothing under this design |
| D-11 | Player-named landmarks | Keep the original's "name your discovery" prompt, or auto-name from theme pools | Keep the prompt, prefilled from the theme pool (cosmetic stream) |

---

## 11. Open questions for the other panel documents

- The exact numbers for the indigenous archetype (costs "vary somewhat", "larger cities" against a Center cap of 2, p.21 and p.26) are a rules question. This document only gives them a home (`arch.indigenous.effects`).
- Patron tax rate, trade prices and delays are unknown from the manual. They belong in `economy.json`, whatever values the rules panel picks.
- Whether the MVP keeps a patron at all (draft: yes) affects whether the `no-patron` variant is ever needed.
