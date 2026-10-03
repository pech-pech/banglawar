# 06 - Ruleset variant `bd1971` and generic engine hooks: specification

Status: **spec for the owner's review. No code exists.** Date: 2026-10-03.
Inputs (read as data): [GDD.md](../GDD.md) (cited GDD §n), [04-theme-architecture.md](../04-theme-architecture.md) (TA §n), [01-economy-buildings.md](../01-economy-buildings.md), [02-units-combat-turns.md](../02-units-combat-turns.md), [03-role-mapping-options.md](03-role-mapping-options.md) (RM §n), [04-sensitivity-comparison.md](04-sensitivity-comparison.md) (SC §n).

Scope: the owner's final decisions (Hybrid H; D-A A1; D-B B1 + December effect (ii); D-C C3; D-D P1 + coin source (x); D-E S1 + X2 sector cap + `equal-nations`; D-F F2; D-G G2 field hospital; pre-placed AI garrison positions; hand-made map). Owner decisions of 2026-10-03 are applied (companion switches dropped; loss = no base area for 15 turns regardless of founders; scout recruiting and cap at `bld.habitat`, healing at `bld.scout_post`; surrender = capital garrison site, or 3 of the 6 fortress positions with the AI holding at most 25% of its **starting** garrison positions (20 in 08, so at most 5); seasons and turn bounds per 09). The theme pack (labels, text and art; **every art and asset statement is PROVISIONAL: the art method is undecided**) is written by another agent and is **not** in this file.

**Terms (PROPOSED, for reviewers).** In this file's prose the AI's starting sites are **not** called "towns": they are "garrison positions" (generic), "fortress positions" (tag `fortress`), "defence zones" (tag `defence_zone`) and the "capital garrison" (tag `capital`). Opaque ids and tags are unchanged (`site.town_NN`, tag `garrison_town`). The theme decides the display words; this is a proposed term for the reviewers, not a theme string.

Hard rule for every hook below: the **ruleset** (core files and hook keys) is generic. No ruleset key, id, enum value, error code or event id names 1971, Bangladesh, a real place, a real formation or a real person. Real-world meaning lives only in the theme pack and, as opaque ids with `_note` fields, in the scenario file.

Tags as in the GDD: **ASSUMED** = invented tunable (lives in data and in the assumption register, GDD §19); **OWNER** = set by the owner's decision; **PLACEHOLDER** = waits for a fact check (section 7.3).

---

## 0. Cross-cutting rules for all hooks (H0)

These apply to every hook in section 2; each hook section only states what is specific to it.

**H0.1 Default elision (neutral hashes stay unchanged).**
- All hook keys live in `rules/core/hooks.json`; C3 (`raid_can_destroy`) is per-site scenario data in H2. Every key has a **declared default** in the schema that reproduces today's neutral behaviour exactly.
- The canonical form used for `rules_hash` **omits every key whose value equals its declared default** (recursively; an object whose members are all default is omitted). So the neutral ruleset 1.1.0 with all hooks at default hashes byte-for-byte the same as 1.0.0. The version string is recorded in saves (TA §3.5) but is **not** an input to `rules_hash`.
- New **state** fields introduced by hooks (`site_id`, `no_base_turns`, ...) follow the same rule in `rules_state_hash`: absent or default = omitted. With all hooks off the per-turn golden replay hashes do not move.
- Declared defaults of hook keys are **frozen for ruleset major 1** (changing a default would silently change neutral behaviour without changing the hash). A test pins them (`test_hook_defaults_frozen`).

**H0.2 Determinism (GDD §18).** All rates are integer percent or per-mille with the one `floor` helper; never a float. Every list in hook data is processed in its stored order or in `sorted()` order of a stable id; never iterate a set or a dict whose order came from hashing. Hooks draw **no** random numbers except where stated (none of the seven needs one). Tie-breaks are by list index, then slot id (`f1` < `f2` ...), then tile `(y, x)`.

**H0.3 Gating.** Each hook has `enabled: false` (or an equivalent neutral value) by default. A scenario that uses a hook's scenario fields while the merged rules have it off is a **load error at validation step 5** (TA §3.4), never a silent no-op.

**H0.4 Variant path format.** Role ids contain dots (`fp.banker`), so the dotted `path` strings in TA §3.2 are ambiguous. This spec writes paths as **JSON Pointer (RFC 6901)** over the merged rules document, whose top-level members are the core file stems: `/ruleset`, `/economy`, `/factions`, `/buildings`, `/units`, `/combat`, `/terrain_affinity`, `/hooks`, `/features`, `/victory`. The validator rejects a pointer that does not resolve (for `replace`/`remove`) or whose parent does not exist (for `add`). See section 6, change TA-1.

**H0.5 Purity and placement.** Every hook is a pure function of `(rules, scenario, state)` inside `core/`. None imports `ai/`, `app/`, theme or locale (boundary test, GDD §18).

---

## 1. Summary of hooks

T-tiers as in RM §0. Size = rough estimate of `core/` code plus tests, Python lines (ASSUMED, for planning only).

| # | Hook id | Name | Generic purpose (no theme) | Tier | Needed by | Size (code + tests) |
|---|---|---|---|---|---|---|
| H1 | `arrival_entry_tiles` | Land entry tiles for arrivals | A scenario arrival lands on a listed group of land tiles instead of by transport at one map edge (reinforcements over land borders, portals, drop zones) | T3 small | D-A A1 | ~120 + ~180 |
| H2 | `pre_placed_bases` | Pre-placed bases with site ids | A scenario starts with fully specified bases (core level, buildings, stock, garrison) carrying stable `site_id`s and tags that predicates can name; per-site "cannot be destroyed by raid" | T3 small | pre-placed garrison positions, D-F F2, SC rule 2 | ~250 + ~300 |
| H3 | `seasons` | Season table | Integer multipliers by turn range on land movement cost and food output; terrain never changes | T3 small | D-C C3 | ~110 + ~180 |
| H4 | `end_conditions` | Typed end conditions | Per-faction surrender predicates (shared grammar with mission goals), a deadline with a chosen result (draw), and an elimination grace period | T3 small-medium | D-F F2 | ~260 + ~320 |
| H5 | `timed_effects` | Timed faction effects | From turn X (optionally until Y), a listed faction's patron link is cut and/or its units get a panic modifier in battle | T3 small | D-B (ii) December effect | ~150 + ~200 |
| H6 | `region_rules` | Region cap and region bonus | Named map regions (scenario data); at most N core buildings of level >= L per faction per region; a small productivity bonus for a faction's bases in a region where it holds such a core | T3 small | D-E X2 | ~180 + ~220 |
| H7 | `healing.sources` | Healing sources per building role (`/hooks/healing/sources`) | Which building role heals units attached to a base, and by how much per level; moves healing from the core to any role | T3 tiny | D-G G2 | ~60 + ~120 |
| C3 | site flag `raid_can_destroy` | Raid may not destroy a site | Part of H2: a raid that would destroy such a site ends as a capture instead | (in H2) | SC rule 2 | (in H2) |

Two further switches (shortage stand-down and personnel-on-capture) were proposed and dropped by the owner on 2026-10-03. The neutral shortage and capture rules apply unchanged; section 5 states what the allow-list test proves without them.

Total: about 1,130 lines of code and 1,520 of tests (ASSUMED estimate), as a ruleset **minor** version (`conquest-core` 1.1.0). No new resource and no new role id, so no major version (TA §1.1).

---

## 2. Hook specifications

Turn pipeline reference (GDD §6.2, §6.3), with the new steps marked **new**:

```
orders phase (turn T)          movement uses season(T)                         [H3]
                               order validation: region cap, patron link       [H6, H5]
ai_planning                    KnowledgeView gains public hook data            [H1-H6]
end of turn T:
 1  battles                    panic modifier active(T)                         [H5]
 2  deferred actions           (unchanged)
 3  patron deliveries/shipments  link cut at T -> cancel+refund                 [H5]
 3a scenario arrivals for T+1  placed on entry tiles                     new    [H1]
 4  economy                    food x season(T); region bonus in modifier       [H3, H6]
 5  healing                    healing.sources                                  [H7]
 5a end-condition check        homeless/grace counters, surrender, deadline new [H4]
 6  turn += 1, digest          ev.season_started if season(T+1) != season(T)   [H3]
```

New game: `new_game` places pre-placed bases (H2), seeds intel (H2), places `turn: 0` arrivals (H1), and only then computes the turn-0 state hash.

### H1 `arrival_entry_tiles`: land entry tiles for arrivals

**Ruleset keys** (`rules/core/hooks.json`):
```json
"arrival_entry_tiles": {
  "enabled": false,
  "max_defer_turns": null,
  "_note": "null = a blocked arrival waits indefinitely; an integer = after that many deferrals it lands on the nearest free tile of ANY group of the same slot"
}
```
and in `factions.json`, archetype `start` gains the enum value `"scenario"` (neutral archetypes keep `"arrival_edge"` / `"home_edge"`).

**Scenario keys:**
```json
"entry_groups": {"<group_id>": {"slot": "f1", "tiles": [[12, 40], [12, 41]]}},
"players": [{"slot": "f1", "start": {"mode": "entry_tiles"}}],
"arrivals": [{"turn": 0, "slot": "f1", "entry": {"group": "<group_id>"},
              "units": [{"role": "u.founder", "level": 1, "count": 1}],
              "attach_to_first_commander": true, "via_patron": false}]
```
Schema: `tiles` non-empty, unique, inside the map; `entry` is either `{"group": id}` (H1) or absent (neutral transport-at-edge behaviour, GDD §5.3). `via_patron: true` marks a delivery that depends on the slot's patron link (used by H5).

**Semantics.**
- An arrival for turn `T+1` is placed in pipeline step **3a** at the end of turn T (so the units exist and can move at the start of T+1); `turn: 0` arrivals are placed in `new_game`.
- Arrivals are processed in scenario list order (stable); for equal list order the slot order applies.
- The landing tile is the **first tile in the group's list order** that is (a) land-passable for every unit in the arrival, (b) holds no enemy unit, (c) is not inside an enemy base's footprint. All units of one arrival land as one stack on that tile; if the arrival contains a commander and `attach_to_first_commander` is true, the other units that a commander may carry attach to it (capacity rules apply; overflow stands unattached on the same tile).
- If no tile in the group is free, the arrival is **deferred** one turn (`ev.arrival_deferred{slot, group, arrival_index}`) and retried in the next step 3a. With `max_defer_turns: null` it never disappears. Units are never lost to a blocked entry.
- If `via_patron` is true and the slot's patron link is cut (H5) at the arrival turn, the arrival is suppressed (`ev.arrival_cancelled{slot, arrival_index, reason: "patron_link_cut"}`, sent to that slot only); it is not deferred.
- Arrivals are free (no cost is deducted).

**Determinism.** List order and the fixed tie-break; no randomness.
**Neutral default.** `enabled: false`; scenario `entry` absent; archetype start unchanged. Existing transport arrivals untouched.
**Undo / fog / KnowledgeView.** Not undoable (pipeline step). The landing tile and vision radius are revealed to the owner like any unit move; nothing is revealed to opponents except by their own vision. The AI `KnowledgeView` includes **its own** future arrivals and entry groups only; it never receives another slot's entry groups or arrival schedule (no knowledge leak of where the player re-enters).
**Tests.**
- Unit: lands on the first free tile; skips enemy-occupied and enemy-footprint tiles; defers when all blocked and lands the next turn when freed; commander attachment and overflow; `via_patron` suppression; `turn: 0` placement in `new_game`.
- Property: over random blockers, the multiset of units that eventually arrive equals the scheduled multiset (no loss, no duplication) when `max_defer_turns` is null; landing tile is always in the arrival's own group.
- Validation: a scenario with `entry` while the hook is off fails step 5 with file and JSON path; a group tile on `t.deep`/`t.still` fails.
**Acceptance.** Golden replay of the neutral scenarios unchanged; a fixed-seed bd1971 run places every scheduled player arrival on its group's tiles; the AI's view object contains no `entry_groups` of other slots (asserted).

### H2 `pre_placed_bases`: pre-placed bases, site ids and tags

**Ruleset keys:**
```json
"pre_placed_bases": {
  "enabled": false,
  "intel_seed_default": "owner_only",
  "_note": "intel_seed values: owner_only | all_position_only | all_full"
}
```
**Scenario keys:**
```json
"pre_placed_bases": [{
  "site_id": "site.capital",
  "owner": "f2",
  "anchor": [40, 60],
  "core_level": 4,
  "buildings": [{"role": "bld.garrison", "level": 3, "at": [41, 60]}],
  "stock": {"res.basic": 0, "res.hard": 0, "res.coin": 0, "res.wares": 0, "res.food": 0},
  "pop": 0,
  "garrison": [{"role": "u.line", "level": 2, "count": 2}],
  "commander": {"level": 2},
  "tags": ["capital"],
  "real_place": true,
  "raid_can_destroy": false,
  "intel_seed": "all_position_only"
}]
```
**Semantics.**
- In `new_game`, bases are created in list order with the **same legality rules as play**: core on flat land; each building wholly inside the area of a core of `core_level` (GDD §8.1), on legal terrain, footprint respected (garrison 2x2), `level <= core_level`, level within the role's max; garrison within the garrison's support cap; stock non-negative; `pop <= housing capacity`. Any violation is a **validation error with the JSON path**, never a silent clamp.
- `site_id` is stored on the base (state field, elided when null). It **survives capture** (a captured site keeps its id; ownership changes). It is removed when the base is destroyed.
- `tags` are free scenario strings used by predicates (H4); the engine attaches no meaning to any tag.
- **`raid_can_destroy: false` (C3):** in a raid on this base, building-level losses and stock seizure per round happen as in GDD §11.6, but when the raid would destroy the base (defenders eliminated or retreating), the result is converted to a **capture** by the raider (if capture is legal between the two archetypes) with the normal capture damage; if capture is illegal, the base survives at core level 1 with its owner unchanged. Event: `ev.site_taken{site, from, to, via: "raid"}` (`site` = the opaque `site_id`; the theme maps it to a display name). Required `false` for every site with `real_place: true` (scenario lint).
- `intel_seed` (default from the ruleset key): `owner_only` = nothing seeded; `all_position_only` = every other slot gets an intel record `{position, owner, level: null, fort_count: null, turn_seen: -1}`; `all_full` = the record includes the real level and garrison-building count. GDD §5.2's intel record must accept `null` for unknown fields (section 6, change G-5.2).
- Garrison units are created attached to the base (military housed in the garrison building, GDD §7.1); the `commander` (optional) is created attached to the core.

**Determinism.** List order; no randomness (default names for pre-placed commanders come from the cosmetic stream and are stored as strings, TA P-9).
**Neutral default.** `enabled: false`; no scenario field; `site_id` null everywhere (elided).
**Undo / fog / KnowledgeView.** Nothing to undo (created before turn 0). Fog per `intel_seed`. The AI view holds full data for its own sites and only the seeded intel for others, updated by vision afterwards as for any base.
**Tests.**
- Unit: each legality rule rejects with the right JSON path; `site_id` survives capture and disappears on destruction; raid on `raid_can_destroy: false` becomes a capture (and stays with the owner at core L1 when capture is illegal); intel seeding per mode; `null` level renders as "unknown" in intel.
- Property: a scenario's pre-placed bases, saved and reloaded, give the identical turn-0 hash; random raids never destroy a non-destructible site.
**Acceptance.** All neutral golden replays unchanged; the bd1971 scenario loads with zero errors and every `real_place` site has `raid_can_destroy: false` (lint).

### H3 `seasons`: season table with global multipliers

The ruleset holds the season **definitions** (the rules: what a season does); the scenario holds the **schedule** (which turns), because turn ranges depend on the scenario's calendar. Both are hashed (rules hash and game hash respectively).

**Ruleset keys:**
```json
"seasons": {
  "enabled": false,
  "definitions": {},
  "bounds": {"move_cost_pct": [50, 300], "food_output_pct": [50, 200]},
  "_note": "definition shape: {\"move_cost_pct_by_class\": {\"land\": 150, \"water\": 100}, \"move_cost_pct_by_unit\": {}, \"food_output_pct\": 100}"
}
```
`move_class` is a new per-unit-role field in `units.json`: `"land"` for every land role, `"water"` for `u.transport`; default derived (`u.transport` = water, everything else land), so it is elided in the neutral data.

**Scenario keys:**
```json
"season_schedule": [{"from_turn": 0, "to_turn": 21, "season": "season.pre_wet"}]
```
Ranges are inclusive, sorted, non-overlapping, and every `season` id exists in the merged rules. Turns covered by no range use the **neutral season** (all multipliers 100).

**Semantics.**
- `season(T)` is a pure lookup by integer turn (binary search over the sorted schedule).
- **Movement** (orders phase of turn T): per step, `step_cost = terrain_cost(tile) * pct`, where `pct = move_cost_pct_by_unit[role]` if present, else `move_cost_pct_by_class[move_class(role)]`, else 100. Movement budgets are kept in hundredths: `budget = movement_points * setting_pct * profile_pct` (each integer percent, normalised by one `floor` at the end of the product). A unit may always take one step (GDD 02 G2 rule kept). A carried unit pays nothing; the carrier's class applies (a boat carrying land units moves at the water rate).
- **Food output** (economy step 4 of turn T): `food_out = floor(base * (100 + modifier) * food_output_pct / 10000)`, applied to `bld.food` only, after the productivity modifier clamp (GDD §8.4). Housing from farms is unaffected.
- The colony preview uses `season(T)`, the same value step 4 uses, so preview equals the real turn (GDD §8.7 property test holds).
- Terrain, passability, placement and `link_to_outside` **never** read the season.
- The effect is the same for every faction (symmetric by construction; RM L-12).
- **Season change event.** In pipeline step 6, when `season(T+1) != season(T)`, the engine emits `ev.season_started{season}` (the season id of `T+1`; the neutral season is reported as `season.neutral`) to **all** players. It is a public event derived from the schedule; no state field is stored. No event is emitted at turn 0 (the calendar shows the opening season).

**Determinism.** Integer arithmetic, one floor per product; schedule lookup by integer.
**Neutral default.** `enabled: false`, empty `definitions`; `season(T)` returns the neutral season, and the code path multiplies by nothing (the 100 branch is skipped, so not even rounding changes).
**Undo / fog / KnowledgeView.** Nothing undoable. The schedule is **public** (shown on the calendar): the AI view contains the full schedule and `season(T)`. The AI's path planner must use the same cost function (`core.movement.step_cost`, imported by `ai/`) or its routes overrun.
**Tests.**
- Unit: lookup at range edges; neutral fallback; per-unit override beats class; boat with passengers pays the water rate; one-step rule; food floor rounding; preview equals real with a season active; `ev.season_started` emitted exactly at the end of turns 21 and 62 in bd1971 (seasons change at turns 22 and 63) and never otherwise.
- Property: with every multiplier 100 the full state hash equals the hook-off hash for random seeds (proves the neutral path); movement under any season never lets a unit spend more than its budget.
**Acceptance.** Neutral replays unchanged; in bd1971 an AI heavy land unit reaches fewer tiles per turn in `season.wet` than in `season.dry` on the same route, and a `u.transport` reaches the same number.

### H4 `end_conditions`: surrender predicates, deadline result, grace period

**Ruleset keys** (`victory` section; neutral values shown, all default):
```json
"victory": {
  "mode": "last_standing",
  "scenario_conditions": false,
  "deadline_result": "none",
  "homeless_turns_limit": 15,
  "no_base_no_founder_grace_turns": 0,
  "predicate_limits": {"max_depth": 4, "max_nodes": 32}
}
```
`homeless_turns_limit` already exists (GDD §12); it is moved under `victory` with the same value. `deadline_result`: `none` (neutral: `max_turns` must be 0 unless scoring exists) or `draw`. `no_base_no_founder_grace_turns`: 0 = neutral (a faction with no base and no founder is eliminated at once); N > 0 = eliminated only after N consecutive end-of-turn checks with no base **and** no founder.

**Predicate grammar** (shared with tutorial/mission goals, TA §1.6; one evaluator, `core/predicates.py`):

| Kind | Arguments | True when |
|---|---|---|
| `all_of` / `any_of` | list of predicates | all / any child is true |
| `not` | predicate | child is false |
| `holds_site` | `slot`, `site` | a base with that `site_id` exists and is owned by `slot` |
| `holds_sites_count` | `slot`, `tag`, `at_least` | number of existing bases owned by `slot` whose site has `tag` >= `at_least` |
| `initial_sites_held_at_most_pct` | `slot`, `at_most_pct`, optional `tags_any` | `held_initial * 100 <= at_most_pct * initial_site_count[slot]` (integer); see the definition below the table |
| `base_count` | `slot`, `at_least` or `at_most` | count of bases owned by `slot` |
| `turn_at_least` | `turn` | `T >= turn` |
| `has_base` / `has_unit_role` | `slot` (+ `role`) | as named |

**`initial_sites_held_at_most_pct` (exact definition; OWNER 2026-10-03: the clause counts the slot's starting garrison positions only).**
- `initial_sites[slot]` = the `site_id`s of the scenario's `pre_placed_bases` whose `owner` is `slot` and (if `tags_any` is given) that carry at least one tag in `tags_any`. It is computed **once, at scenario load** (validation step 5), from scenario data only, and stored on the loaded scenario object with `initial_site_count[slot] = len(initial_sites[slot])`. It is a fixed number: it never changes during play, it is not a game-state field (so it adds nothing to `rules_state_hash`; the scenario is already in the game hash), and it does not depend on turn-0 arrivals.
- `held_initial` = the number of bases that exist now, are owned by `slot`, and whose `site_id` is in `initial_sites[slot]`.
- Bases founded during play (no `site_id`, or a `site_id` not in the initial set) count in **neither** the numerator nor the denominator. An initial position that the slot loses and later retakes counts again while it holds it.
- `initial_site_count[slot] == 0` is a load error when a predicate names that slot (no division by an empty start).
- bd1971 numbers: 20 starting garrison positions for f2 (08: 1 capital garrison, 6 fortress positions, 2 defence zones, 11 garrison positions; checked by `tag_counts`), so `at_most_pct: 25` is true when f2 holds **5 or fewer** of them (5 x 100 <= 25 x 20) and false at 6. Defence zones are starting garrison positions and count here; they do not count among the 6 fortress positions.

Unknown kinds, unknown `slot`/`site`/`tag` references, depth or node count over the limits are **load errors** (validation step 5). Predicates are pure, draw no randomness and are evaluated in full (no reliance on short-circuit side effects).

**Scenario keys:**
```json
"end_conditions": {
  "surrender": [{"slot": "f2", "when": {"any_of": [{"holds_site": {"slot": "f1", "site": "site.capital"}}]}}],
  "deadline": {"max_turns": 89, "result": "draw"},
  "tag_counts": {"<tag>": 6}
}
```
`tag_counts` (optional) declares how many pre-placed sites carry each objective tag; validation step 5 asserts that exactly that many sites carry it (so K is scenario data, never a hard-coded number).
**Semantics** (new pipeline step **5a**, after healing, before `turn += 1`):
1. For each slot in slot order: update `no_base_turns[slot]` (+1 if the slot has no base and no founder, else reset to 0) and the existing homeless counter. Eliminate a slot when `no_base_no_founder_grace_turns > 0` and its counter reaches it, or (neutral) when it has no base and no founder and the grace is 0, or when `homeless_turns_limit` is non-null and reached. The homeless counter counts consecutive checks with no base, whether or not a founder is alive; only holding a base resets it. Event `ev.faction_eliminated{slot, reason, turns}`, where `reason` is `"homeless_limit"` or `"no_base_no_founder"` and `turns` is the limit that fired (0 for the neutral instant rule). If both rules fire on the same check (homeless counter and grace counter both reach their limit), `reason` is `"homeless_limit"`: **`homeless_limit` takes precedence** (12 Y1).
2. For each `surrender` entry in list order whose slot is still in play: evaluate `when` on the state after steps 1-5 of this turn. If true, the slot **surrenders**: it leaves play (its units and bases stop acting; bases stay on the map for the end screen) and `ev.faction_surrendered{slot, turn}` is emitted.
3. If exactly one slot remains in play, it wins (`ev.match_won{winner_slot, reason}`, `reason` = `"surrender"` if the last opponent surrendered this turn, else `"last_standing"`); if none remains, the match is a draw (`ev.match_drawn{reason: "all_out"}`).
4. Else, if `deadline.max_turns > 0` and `T + 1 >= max_turns`, the match ends with `deadline.result` (for `draw`: `ev.match_drawn{reason: "deadline"}`); the debrief is theme text. Distinct ids (not one `ev.match_ended` with a `result` field) let the theme write one template per outcome without payload-keyed templates.
`initial_site_count[slot]` is recorded once, at scenario load (see the predicate definition above), and never changes. (It replaces the earlier `start_base_count`, which counted every base at the end of `new_game` and would have let bases founded later, or outposts, move the threshold; 12 M5.)

**Determinism.** Fixed order: elimination, then surrender in list order, then winner, then deadline. Integer percent comparison.
**Neutral default.** `scenario_conditions: false`, `deadline_result: "none"`, grace 0, homeless limit 15: exactly GDD §12. `no_base_turns` is elided (not stored) unless the grace rule needs it; `initial_site_count` is scenario-load data, never game state.
**Undo / fog / KnowledgeView.** Not undoable (pipeline). Predicates read **live state** inside `core` (they decide the game, not a player's plan). The AI view includes its **own** surrender predicate and the public objective sites (the briefing shows them to the player too), so the AI can defend what decides the war; it does not get live ownership of sites it cannot see beyond its intel.
**Tests.**
- Unit: each predicate kind true/false at boundaries (`initial_sites_held_at_most_pct` with 20 starting garrison positions: 5 held passes, 6 fails); a base founded by f2 during play changes neither count (f2 holding 5 initial positions plus 3 new bases still passes); an initial position lost and retaken counts again; `tags_any` excludes untagged or outpost sites; `initial_site_count` is the same before and after any turn (fixed at load); a slot with no initial sites named by the predicate is a load error; both elimination rules firing on one check report `"homeless_limit"`; nested depth limit; unknown references rejected; grace counter resets on a founder arrival but the homeless counter does not; `tag_counts` mismatch rejected; surrender order; deadline at `T + 1 == max_turns`; both-out draw.
- Property: the predicate evaluator is pure (same state, same answer, state unchanged; deep-snapshot test, GDD §20); a match always ends at or before `max_turns` when `max_turns > 0`.
**Acceptance.** Neutral replays unchanged; scripted bd1971 games: (a) capturing `site.capital` ends with a win at that turn's end; (b) holding 3 of the 6 fortress positions while the AI still holds 6 or more of its 20 starting garrison positions does not; dropping it to 5 does, however many new bases the AI has founded; (c) no outcome by turn 88 gives a draw; (d) a player with no base for 15 consecutive checks loses even with an organising team alive; after 14 it is still in play; a player with no base and no founder is **not** eliminated before the 15th check.

### H5 `timed_effects`: timed faction effects (patron link cut, panic modifier)

**Ruleset keys:**
```json
"timed_effects": {
  "enabled": false,
  "kinds_allowed": ["patron_link_cut", "panic_modifier"],
  "bounds": {"panic_permille": [-300, 300]}
}
```
**Scenario keys:**
```json
"timed_effects": [{
  "id": "te.link_cut",
  "from_turn": 84, "to_turn": null,
  "target_slot": "f2",
  "effects": [
    {"kind": "patron_link_cut", "in_flight": "cancel_refund"},
    {"kind": "panic_modifier", "scope": "defending_base", "permille": 100}
  ],
  "announce": true
}]
```
**Semantics.**
- `active(T)` is a pure function of the scenario and the turn: an entry is active when `from_turn <= T` and (`to_turn` is null or `T <= to_turn`). **No state field is stored**, so nothing is added to the hash.
- `patron_link_cut` (target slot): (a) **orders phase**: new patron buy/sell orders of that slot are refused with `err.patron_link_cut`; (b) **step 3**: any patron delivery of that slot due at a turn when the link is cut is handled by `in_flight`: `cancel_refund` refunds what the slot paid (coin for a buy, the goods for a sell) to the ordering base, `deliver` lets it arrive; (c) **step 3a**: arrivals of that slot with `via_patron: true` are suppressed (H1). Tax to the patron (if any) also stops.
- `panic_modifier` (target slot): in step 1 battles of turn T, the panic chance of each unit of the target slot gains `permille / 1000` (added inside the existing formula, GDD 02 G9, before its cap). `scope: "defending_base"` applies only when the slot defends one of its bases (militia included); `"all_battles"` applies everywhere.
- `announce: true` emits `ev.timed_effect_started{id, target_slot}` to **all** players at the start of `from_turn` (public event; the theme writes the briefing).
- No effect kind can grant units or control of another faction's units to anyone (the "player never gets allied units" rule is structural; see section 5 check 9).

**Determinism.** Pure function of integers; panic still uses the existing combat stream; the modifier is an integer per-mille.
**Neutral default.** `enabled: false`, no scenario entries: every check short-circuits.
**Undo / fog / KnowledgeView.** An order refused for a cut link is never queued, so there is nothing to undo; orders placed in turn T-1 that deliver at T are handled by `in_flight`. Announced effects are public: both the human and the AI view see them; unannounced effects are visible only to the target slot (its own state).
**Tests.**
- Unit: active window edges; order refusal; `cancel_refund` refunds exactly what was paid; `deliver` keeps it; `via_patron` arrivals suppressed; panic modifier applied only in scope; bounds rejected at load.
- Property: with a `panic_modifier` of 0 and `in_flight: deliver`, every state hash equals the hook-off run (the hook adds no hidden side effect).
**Acceptance.** In a fixed-seed bd1971 run, after turn 84 the AI slot has no patron delivery and no patron arrival; the combat harness shows a higher defender panic rate for that slot at equal forces (direction only; the size is tuned).

### H6 `region_rules`: region cap and region bonus

Regions are **scenario data** (map-specific), the rules that read them are ruleset data.

**Ruleset keys:**
```json
"region_rules": {
  "enabled": false,
  "cap": {"building": "bld.core", "min_level": 3, "max_per_region": 1, "scope": "per_faction"},
  "bonus": {"kind": "modifier_pct", "value": 0, "applies_to": ["bld.food", "bld.basic_extractor",
            "bld.hard_extractor", "bld.coin_extractor", "bld.converter"],
            "condition": "faction_holds_capped_core_in_region"}
}
```
(Default values are the shape only; with `enabled: false` neither is read.)

**Scenario keys:**
```json
"regions": [{"id": "region.r01", "tiles_rle": "<run-length rows>"}],
"region_cap_slots": ["f1", "f2"]
```
Every tile belongs to at most one region; a tile in no region is unregioned. A base's region is the region of its **core anchor tile**.

**Semantics.**
- **Cap (order validation, orders phase).** An order that upgrades `cap.building` to a level `>= cap.min_level` in region R is refused with `err.region_cap{region}` if the ordering slot is in `region_cap_slots` and already **owns, or has a pending order to upgrade**, `max_per_region` cores at or above `min_level` in R. Cancelling such a pending order frees the slot in the same turn (undo-consistent). Unregioned bases are never capped.
- **Ownership is never revoked by the cap.** Pre-placed bases may exceed it at turn 0; a capture may push a slot over it. Over-cap only blocks further qualifying upgrades in that region. (Rationale: a cap that destroyed or downgraded captured bases would be a punishment for winning.)
- **Bonus (economy step 4 and the preview).** For each base of slot S in region R, if S owns at least one core of level `>= min_level` in R, the bonus `value` (integer percentage points) is **added to the productivity modifier sum before the clamp** (GDD §8.4) for every building in `applies_to`. It is shown as its own line in the colony preview.
- Symmetric: the same rule binds every slot listed in `region_cap_slots`.

**Determinism.** Region lookup is an array index per tile; counts are integers; regions iterate in list order.
**Neutral default.** `enabled: false`; scenario `regions` absent (or present only as `lm.region` labels, which no rule reads).
**Undo / fog / KnowledgeView.** Upgrade and cancel follow GDD §6.4 (toggle). Region outlines are public map data in every view. The AI must check the cap before proposing an upgrade; rejected AI orders are logged (GDD §13).
**Tests.**
- Unit: second qualifying upgrade in the same region refused, in another region allowed; pending order counts; cancel frees; capture over the cap allowed and blocks later upgrades; bonus applied before clamp and visible in preview; unregioned bases unaffected.
- Property: the number of qualifying cores a slot **reaches by upgrade** in a region never exceeds `max_per_region`; preview equals real with bonuses.
**Acceptance.** Neutral replays unchanged; bd1971 scripted test: the player cannot hold two level-3 base HQs built by upgrade in one region; a base in a region with the player's level-3 HQ shows `+value%` in its forecast.

### H7 `healing.sources`: healing sources per building role

One name for the mechanism everywhere: the ruleset key `/hooks/healing/sources` (a list of `{building, per_turn_by_level}`); the earlier informal name "`heals_attached` flag" is retired (12 Y3/X11). The habitat's scout recruiting op value is `{"min": 1, "max": "level"}`.

**Ruleset keys:**
```json
"healing": {
  "sources": [{"building": "bld.core", "per_turn_by_level": [1, 1, 1, 1]}],
  "max_strength": 5
}
```
This default reproduces GDD §6.3 step 5 and §7.2 exactly (1 strength per turn, units attached to the core). Ship healing next to a port (GDD §7.2) is a separate rule and is unchanged.

**Semantics** (pipeline step 5).
- A unit **attached to a base** (the same attachment as today: attached to its core) heals `h` strength, capped at its maximum, where `h` is the **highest** `per_turn_by_level[level - 1]` among the base's **functional** buildings listed in `sources` (sources do not stack; a building ordered this turn is not yet functional, GDD §8.6). If no source exists in the base, the unit does not heal. Each heal emits `ev.unit_healed{unit, amount, building}` to the owner (`building` = the role id of the source that supplied `h`).
- Bases are processed in stable id order; units in stable id order. No randomness.
- A building may be listed only once; `per_turn_by_level` has one entry per level of that role (length 1 for single-level roles).

**What moves where for bd1971 (owner decision D-G G2):**

| Function | Neutral home | bd1971 home | Op |
|---|---|---|---|
| Healing of attached units | `bld.core` (1/turn) | **`bld.scout_post`** (theme: field hospital), `per_turn_by_level` [1, 1, 2, 2] ASSUMED | replace `/hooks/healing/sources` |
| Recruiting `u.scout` (levels 1..n) | `bld.scout_post` | **`bld.habitat`** (theme: volunteer shelter); OWNER 2026-10-03 | remove from scout_post, add to habitat |
| Scout support cap (ASSUMED 2 per level, GDD §7.2) | `bld.scout_post` | **`bld.habitat`**, same 2 per level (placement OWNER, value ASSUMED) | remove/add |
| Recruiting `u.founder` (exact level n) | `bld.habitat` | `bld.habitat` (unchanged) | none |
| Base HQ (`bld.core`) | heals; recruits commanders | recruits commanders only; **no longer heals** | (by the replace above) |

Why `bld.scout_post` carries healing: it is the only role whose sole function is recruiting a non-combat unit, so taking that function away removes nothing else; its costs (2W / 2M 5W / 10$ 5M 2G 10W / 40$ 10M 5G 15W) are **identical** to `bld.habitat`'s, so moving scout recruiting to the habitat changes no price, only which square the player must spend. Why the habitat takes scouts: every base builds one early (it houses volunteers and recruits the organising team), so `u.scout` stays available without a dedicated building; the alternative, the core, would make scouts free of any building and was not chosen (owner confirmed the habitat on 2026-10-03). The theme relabels `bld.scout_post` (field hospital) and adds the `u.scout` recruiting line to the shelter's text.

Consequences the owner should know: (1) a new base heals nothing until it builds the field hospital (one more building per front-line base); (2) losing the hospital in a raid or capture damage stops healing there; (3) the AI's build orders that use `bld.scout_post` for scouts must be data-driven (section 7.1, risk R-6).

**Neutral default.** As shown; elided from the hash.
**Undo / fog / KnowledgeView.** Building and halting the hospital follow GDD §8.6. Healing is own-state only; enemy hospitals are not shown in intel (intel records only level and garrison-building count, GDD §5.2).
**Tests.**
- Unit: core heals by default; with the bd1971 sources the core does not heal and a base with a level-3 hospital heals 2; not stacking; non-functional (just ordered) building does not heal; cap at max strength; habitat recruits scouts 1..n and enforces 2 per level; scout_post recruits nothing in bd1971.
- Property: total healing per turn never exceeds `max(per_turn) * attached units`; neutral sources give identical hashes to the pre-hook build.
**Acceptance.** Neutral replays unchanged; bd1971 scripted test: a damaged unit attached to a base with no hospital stays damaged; after the hospital is functional it heals by its level.

---

## 3. The variant file `rules/variants/bd1971.json`

Self-contained: it repeats the `equal-nations` ops instead of depending on variant order (a test asserts it is a superset of `equal-nations`, section 7.1 R-9). Paths follow H0.4. Paths into files the ruleset author has not yet written (`/economy/tax/...`, `/features/...`, `/buildings/.../supports`) are this spec's proposed names; the validator rejects any pointer that does not resolve, so a naming mismatch fails loudly at load (section 7.1 R-10).

```json
{
  "id": "bd1971",
  "version": "0.1.0",
  "applies_to": {"ruleset": "conquest-core", "major": 1, "min_minor": 1},
  "_note": "Ruleset variant for the theme pack themes/bd1971. Generic ops only; no real names. Values marked ASSUMED are in the assumption register.",
  "ops": [
    {"op": "replace", "path": "/economy/tax/coin_pct", "value": 0, "_note": "OWNER D-B: tax 0"},
    {"op": "replace", "path": "/economy/tax/other_pct", "value": 0, "_note": "OWNER D-B: tax 0"},
    {"op": "replace", "path": "/factions/archetypes/arch.expedition/taxed", "value": false},
    {"op": "replace", "path": "/economy/coin_interest_cap_per_colony", "value": 0, "_note": "OWNER: interest off (belt and braces; profiles are emptied below)"},

    {"op": "replace", "path": "/factions/profiles/fp.naval_ranged/effects", "value": []},
    {"op": "replace", "path": "/factions/profiles/fp.envoy_shock/effects", "value": []},
    {"op": "replace", "path": "/factions/profiles/fp.scout_line/effects", "value": []},
    {"op": "replace", "path": "/factions/profiles/fp.mobility/effects", "value": []},
    {"op": "replace", "path": "/factions/profiles/fp.banker/effects", "value": [], "_note": "removes stock_interest and the faster patron"},
    {"op": "replace", "path": "/factions/profiles/fp.indigenous_high/effects", "value": []},

    {"op": "replace", "path": "/factions/archetypes/arch.expedition/start", "value": "scenario", "_note": "H1/H2: each scenario player declares entry_tiles or pre_placed"},

    {"op": "replace", "path": "/features/npc.settlement", "value": false},
    {"op": "replace", "path": "/features/arch.indigenous", "value": false},
    {"op": "replace", "path": "/features/disc", "value": false},
    {"op": "replace", "path": "/features/dip", "value": false},
    {"op": "replace", "path": "/features/tribute", "value": false},
    {"op": "replace", "path": "/features/scoring", "value": false, "_note": "no victory points; if scoring is ever enabled, sc.combat must stay 0 (section 5)"},
    {"op": "replace", "path": "/ruleset/setting_ranges/native_settlements", "value": {"min": 0, "max": 0, "default": 0}},

    {"op": "replace", "path": "/terrain_affinity/bld.coin_extractor", "value": {
        "t.open": 100, "t.river": 60, "t.wood_a": 30, "t.wood_b": 10,
        "t.rough": 0, "t.peak": 0, "t.still": 20, "t.deep": 0,
        "_note": "ASSUMED weights (integer per-cent, same falloff as core). OWNER D-D (x): moved from peaks to open (paddy) land"}},

    {"op": "replace", "path": "/hooks/healing/sources", "value": [
        {"building": "bld.scout_post", "per_turn_by_level": [1, 1, 2, 2], "_note": "ASSUMED; OWNER D-G G2"}]},
    {"op": "remove", "path": "/buildings/bld.scout_post/recruits/u.scout"},
    {"op": "remove", "path": "/buildings/bld.scout_post/supports/u.scout"},
    {"op": "add", "path": "/buildings/bld.habitat/recruits/u.scout", "value": {"min": 1, "max": "level"}},
    {"op": "add", "path": "/buildings/bld.habitat/supports/u.scout", "value": {"per_level": 2, "_note": "ASSUMED, unchanged from core"}},

    {"op": "replace", "path": "/hooks/arrival_entry_tiles/enabled", "value": true},
    {"op": "replace", "path": "/hooks/pre_placed_bases/enabled", "value": true},
    {"op": "replace", "path": "/hooks/pre_placed_bases/intel_seed_default", "value": "all_position_only"},

    {"op": "replace", "path": "/hooks/seasons", "value": {
        "enabled": true,
        "definitions": {
          "season.pre_wet": {"move_cost_pct_by_class": {"land": 100, "water": 100}, "food_output_pct": 90},
          "season.wet":     {"move_cost_pct_by_class": {"land": 150, "water": 100}, "food_output_pct": 100},
          "season.dry":     {"move_cost_pct_by_class": {"land": 100, "water": 100}, "food_output_pct": 115}
        },
        "bounds": {"move_cost_pct": [50, 300], "food_output_pct": [50, 200]},
        "_note": "ASSUMED multipliers. Symmetric for all factions. Boats unaffected. Theme labels the seasons."}},

    {"op": "replace", "path": "/victory/scenario_conditions", "value": true},
    {"op": "replace", "path": "/victory/deadline_result", "value": "draw"},
    {"op": "replace", "path": "/victory/no_base_no_founder_grace_turns", "value": 15, "_note": "OWNER 2026-10-03: loss = no base for 15 turns regardless of founders. Grace 15 only switches off the neutral instant elimination; the homeless clock decides, since it always reaches 15 first."},

    {"op": "replace", "path": "/hooks/timed_effects/enabled", "value": true},

    {"op": "replace", "path": "/hooks/region_rules", "value": {
        "enabled": true,
        "cap": {"building": "bld.core", "min_level": 3, "max_per_region": 1, "scope": "per_faction"},
        "bonus": {"kind": "modifier_pct", "value": 5,
                  "applies_to": ["bld.food", "bld.basic_extractor", "bld.hard_extractor", "bld.coin_extractor", "bld.converter"],
                  "condition": "faction_holds_capped_core_in_region",
                  "_note": "value ASSUMED (+5 percentage points)"},
        "_note": "OWNER D-E X2"}}
  ]
}
```

**Version reference.** The variant's version is `0.1.0`; scenarios and bundle presets reference it as `bd1971@0.1` (major.minor). The theme pack's preset must read `"variants": ["mvp@1", "equal-nations@1", "bd1971@0.1"]`; `bd1971@1` does not exist (09 P0-8).

What the variant deliberately does **not** do: no per-faction patron delay or cap (the AI patron "long delay, small cap" of RM §E-AI would break `equal-nations`; text only, RM L-21); no change to unit costs, combat odds, raid constants or founder people costs (RM P1 optional T2 left for playtests); no new role ids (`adds_roles` absent).

### 3.1 ASSUMED tunables introduced or changed by this variant and its scenario

Every row goes into the assumption register (GDD §19) with this file as its source.

| Key | Initial value | Basis | Tuned by |
|---|---|---|---|
| `/terrain_affinity/bld.coin_extractor` weights | open 100, river 60, wood_a 30, still 20, wood_b 10, rough/peak/deep 0 | OWNER direction (paddy land); numbers ASSUMED | economy simulator: a bd1971 base reaches the same coin per turn band as a neutral peak-adjacent mine (+/- 20%) |
| season land move pct (wet) | 150 | RM C3 proposal, ASSUMED | AI-vs-AI soak; player boat routes |
| season food pct pre_wet / wet / dry | 90 / 100 / 115 | ASSUMED (no historical claim) | simulator: schedule-weighted average 98-104 |
| `healing.sources` per level | 1, 1, 2, 2 | ASSUMED | combat harness: recovery time of a level-2 unit |
| habitat scout support | 2 per level | GDD §7.2 ASSUMED, moved | unchanged |
| region bonus | +5 percentage points | ASSUMED ("small", OWNER) | simulator: never more than the specialisation cap (30) |
| region cap | 1 core at level >= 3 per region per faction | OWNER | none |
| surrender: fortress positions needed N of K | 3 of 6 (K = 6 from `end_conditions.tag_counts`) | OWNER 2026-10-03 (09 option A; six named fortresses, 07a) | AI-vs-AI soak checks pacing only; N and K are not tuned |
| surrender: AI held starting garrison positions at most | 25% of its **starting** garrison positions (`initial_sites_held_at_most_pct`, H4): 20 in 08, so at most 5. Positions founded later do not count; defence zones do | OWNER 2026-10-03 | none |
| no-base-no-founder grace | homeless limit 15 (neutral) + grace 15 (disables the instant rule) | OWNER | none |
| panic modifier on the cut slot | +100 per mille, defending bases | ASSUMED | combat harness |
| `in_flight` on link cut | `cancel_refund` | ASSUMED | none |
| intel seed of garrison sites | position and owner only | ASSUMED | playtest |
| `max_turns` | 89 (turns 0-88) | Calendar arithmetic re-checked (09 B.1); 16 December verified (07a) | none |
| December effect `from_turn` | 84 | PLACEHOLDER: 3 December, PARTLY (secondary sources only, 07a; 09 A9) | fact check item 2 |
| season schedule turn ranges | pre_wet 0-21, wet 22-62, dry 63-88 | ASSUMED (boundary choice: turn 22 is the turn containing 1 June; the June-September monsoon is VERIFIED, 07c; 09 B.2 #2) | none (design choice) |
| tax coin / other | 0 / 0 | OWNER | none |
| interest | off | OWNER | none |

---

## 4. Scenario skeleton `scenarios/liberation-1971.json`

The scenario is part of the **game** hash, not the rules hash, so real-world ids are allowed here, but this file still uses **opaque ids** (`site.*`, `region.*`, `entry.*`) and leaves every display name to the theme. Calendar (theme, RM D-C): turn 0 = 26 March, 3 days per turn; turn `t` covers days `3t .. 3t+2` after 26 March. Derived: 1 June = day 67 (turn 22); 1 October = day 189 (turn 63); 3 December = day 252 (turn 84); 16 December = day 265 (turn 88). These derivations are arithmetic and should be re-checked once by hand when the calendar file is written.

```json
{
  "schema": "scenario/1",
  "id": "liberation-1971",
  "version": "0.1.0",
  "requires": {"ruleset": "conquest-core", "major": 1, "min_minor": 1, "variants": ["bd1971@0.1"]},
  "theme_hint": "bd1971",
  "_note": "Opaque ids only. The theme maps site.*, region.*, entry.* and season.* to labels. Every PLACEHOLDER waits for the fact list in 06 section 7.3.",

  "settings": {
    "map": "maps/liberation-1971.map.json",
    "_map_note": "Hand-made map (T1), about 128 x 128 PLACEHOLDER; great rivers as t.deep reaching the map edge; border on three sides.",
    "world_size": 128,
    "native_settlements": 0,
    "max_turns": 89,
    "resources": "normal", "movement": "normal", "difficulty": "normal",
    "play_time_bonus": "off",
    "computer_players": 1
  },

  "players": [
    {"slot": "f1", "control": "human", "start": {"mode": "entry_tiles"}},
    {"slot": "f2", "control": "ai",    "start": {"mode": "pre_placed"}}
  ],

  "entry_groups": {
    "entry.s01": {"slot": "f1", "tiles": "PLACEHOLDER [[x,y], ...] land tiles on the border of the sector 1 area"},
    "entry.s02": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s03": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s04": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s05": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s06": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s07": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s08": {"slot": "f1", "tiles": "PLACEHOLDER"},
    "entry.s11": {"slot": "f1", "tiles": "PLACEHOLDER"}
  },
  "_entry_note": "One group per border sector area (nine; sectors 9 and 10 have none). Group-to-tile mapping from 08's entry tiles E01-E16: see the table after this block (ASSUMED, verifier's mapping). Display names come from the theme's name map, never from this file. Which group each arrival uses is ASSUMED unless its _note says otherwise.",

  "arrivals": [
    {"turn": 0, "slot": "f1", "entry": {"group": "entry.s08"},
     "units": [{"role": "u.founder", "level": 1, "count": 1}, {"role": "u.scout", "level": 1, "count": 1},
               {"role": "u.commander", "level": 1, "count": 1}, {"role": "u.line", "level": 1, "count": 2}],
     "attach_to_first_commander": true, "_note": "ASSUMED opening team (west border)"},
    {"turn": 0, "slot": "f1", "entry": {"group": "entry.s02"},
     "units": [{"role": "u.founder", "level": 1, "count": 1}, {"role": "u.line", "level": 1, "count": 1}],
     "_note": "ASSUMED (east border)"},
    {"turn": 6, "slot": "f1", "entry": {"group": "entry.s06"},
     "units": [{"role": "u.founder", "level": 1, "count": 1}, {"role": "u.scout", "level": 1, "count": 1}],
     "_note": "ASSUMED (north border); mirrors the neutral turn-6 founder preset"},
    {"turn": 34, "slot": "f1", "entry": {"group": "entry.s11"},
     "units": [{"role": "u.commander", "level": 2, "count": 1}, {"role": "u.line", "level": 3, "count": 3}],
     "_note": "First regular brigade, formed July (month VERIFIED, 7 July single-source; 07a). Enters from the north: its HQ was near Tura on the northern border (07a), which faces the sector 11 area; the group choice is PLACEHOLDER until the map exists. Theme label is generic ('first regular brigade'); no commander's initial."},
    {"turn": 63, "slot": "f1", "entry": {"group": "entry.s02"},
     "units": [{"role": "u.commander", "level": 2, "count": 1}, {"role": "u.line", "level": 3, "count": 3}],
     "_note": "Second regular brigade, formed October (1 October single-source). Entry area PLACEHOLDER (not in the 07 files)."},
    {"turn": 67, "slot": "f1", "entry": {"group": "entry.s05"},
     "units": [{"role": "u.commander", "level": 2, "count": 1}, {"role": "u.line", "level": 3, "count": 3}],
     "_note": "Third regular brigade, formed October (14 October, partly verified). Kept on the northern border as before; entry area PLACEHOLDER (not in the 07 files)."},
    {"turn": 12, "slot": "f2", "via_patron": true,
     "units": [{"role": "u.line", "level": 2, "count": 2}],
     "_note": "ASSUMED AI reinforcement by its patron link. No entry group: it arrives by the neutral transport rule (GDD 5.3, transport arrival at a map edge). Suppressed after the link cut (ev.arrival_cancelled to f2 only)."}
  ],

  "pre_placed_bases": [
    {"site_id": "site.capital", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 4,
     "buildings": [{"role": "bld.scout_post", "level": 1, "at": "PLACEHOLDER"}, "PLACEHOLDER (garrison L3-4, port, food, habitat)"],
     "stock": "PLACEHOLDER", "pop": "PLACEHOLDER",
     "garrison": "PLACEHOLDER", "commander": {"level": 3},
     "tags": ["capital"], "real_place": true, "raid_can_destroy": false,
     "_note": "Field hospital L1 so the AI heals from turn 0 (09 B.2 #12); the player's bases heal only after they build one."},
    {"site_id": "site.fortress_1", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3,
     "buildings": [{"role": "bld.scout_post", "level": 1, "at": "PLACEHOLDER"}, "PLACEHOLDER"],
     "garrison": "PLACEHOLDER", "tags": ["fortress"], "real_place": true, "raid_can_destroy": false,
     "_note": "Every fortress site gets the same level-1 field hospital; omitted below for brevity."},
    {"site_id": "site.fortress_2", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["fortress"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.fortress_3", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["fortress"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.fortress_4", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["fortress"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.fortress_5", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["fortress"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.fortress_6", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["fortress"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.zone_1", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["defence_zone"], "real_place": true, "raid_can_destroy": false,
     "_note": "Independent defence zone (07a). Not one of the 6 fortress positions; it IS one of the 20 starting garrison positions counted by the 25% clause."},
    {"site_id": "site.zone_2", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 3, "tags": ["defence_zone"], "real_place": true, "raid_can_destroy": false},
    {"site_id": "site.town_01", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 2, "tags": ["garrison_town"], "real_place": true, "raid_can_destroy": false,
     "_note": "Garrison position. Repeat site.town_02 .. site.town_11 (11 per 08; PLACEHOLDER until the map is final). The starting garrison positions (capital, fortress, defence_zone, garrison_town tags; 20 in 08) set the 25% threshold."},
    {"site_id": "site.camp_01", "owner": "f2", "anchor": "PLACEHOLDER", "core_level": 1, "tags": ["outpost"], "real_place": false, "raid_can_destroy": true,
     "_note": "Optional unnamed outposts (bridges, depots); may be destroyed by raid. Excluded from the 25% clause by its tags_any filter. 08 places none."}
  ],

  "regions": [
    {"id": "region.r01", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r02", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r03", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r04", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r05", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r06", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r07", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r08", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r09", "tiles_rle": "PLACEHOLDER"},
    {"id": "region.r11", "tiles_rle": "PLACEHOLDER"}
  ],
  "_regions_note": "Ten land regions from the sector areas (fact item 1). The tenth sector had no fixed land area (RM E-sectors); it is a theme label only, not a region. This file is the single home of region data; the theme's names/sectors.json maps region.rNN to ui.sector.N and ships no boxes or outlines.",
  "region_cap_slots": ["f1", "f2"],

  "season_schedule": [
    {"from_turn": 0,  "to_turn": 21, "season": "season.pre_wet"},
    {"from_turn": 22, "to_turn": 62, "season": "season.wet"},
    {"from_turn": 63, "to_turn": 88, "season": "season.dry"}
  ],
  "_season_note": "ASSUMED boundary choice on a VERIFIED basis: the climate monsoon runs June-September (07c). Turn 22 (31 May - 2 June) is the first season.wet turn because it contains 1 June; turn 62 (28-30 September) is the last; turn 63 (1-3 October) is the first season.dry turn. The theme's calendar.json holds labels only (no turn numbers).",

  "timed_effects": [{
    "id": "te.link_cut", "from_turn": 84, "to_turn": null, "target_slot": "f2",
    "effects": [
      {"kind": "patron_link_cut", "in_flight": "cancel_refund"},
      {"kind": "panic_modifier", "scope": "defending_base", "permille": 100}
    ],
    "announce": true,
    "_note": "PLACEHOLDER turn: models the open state war and blockade, anchored on 3 December = turn 84 (secondary sources only, fact item 2). It does not model the joint command. No units are granted to f1."
  }],

  "end_conditions": {
    "surrender": [{
      "slot": "f2",
      "when": {"any_of": [
        {"holds_site": {"slot": "f1", "site": "site.capital"}},
        {"all_of": [
          {"holds_sites_count": {"slot": "f1", "tag": "fortress", "at_least": 3}},
          {"initial_sites_held_at_most_pct": {"slot": "f2", "at_most_pct": 25,
            "tags_any": ["capital", "fortress", "defence_zone", "garrison_town"]}}
        ]}
      ]}
    }],
    "deadline": {"max_turns": 89, "result": "draw"},
    "tag_counts": {"capital": 1, "fortress": 6, "defence_zone": 2, "garrison_town": 11},
    "_note": "OWNER 2026-10-03: capital garrison site, or 3 of the 6 fortress positions while f2 holds at most 25% of its STARTING garrison positions (initial count fixed at scenario load: 1 + 6 + 2 + 11 = 20 per 08, so at most 5). Positions founded later never count. defence_zone sites are not fortress positions but are starting garrison positions. garrison_town = 11 is PLACEHOLDER until the map is final."
  }
}
```

**Entry groups and 08's entry tiles.** The 16 entry tiles of [08-map-draft.md](08-map-draft.md) section 3 (E01-E16) belong to the nine groups as follows. **ASSUMED: this mapping is the second-pass verifier's (12 M3), derived by script from 08's sector overlay; it is not yet in 08 or confirmed by the map author.** When the map is final, each group's `tiles` lists the scenario coordinates of its E-tiles in this order (list order decides the landing tile, H1).

| Group id | 08 entry tiles | Count |
|---|---|---|
| `entry.s01` | E16 | 1 |
| `entry.s02` | E14, E15 | 2 |
| `entry.s03` | E13 | 1 |
| `entry.s04` | E12 | 1 |
| `entry.s05` | E10, E11 | 2 |
| `entry.s06` | E01, E02 | 2 |
| `entry.s07` | E03, E04 | 2 |
| `entry.s08` | E05, E06, E07 | 3 |
| `entry.s11` | E08, E09 | 2 |
| total | | 16 |

Note: the turn-0 openings use `entry.s08` and `entry.s02`; `entry.s02` contains E14, about 4 tiles from the Comilla fortress position (08 concern 3, Q6), so the opening may be in contact on turn 0.

**Display names (rule).** The theme owns every display name. The ruleset and this scenario carry opaque ids only (`site.*`, `entry.*`, `region.*`, `season.*`, `te.*`). For each `site.*` and each `entry.*` id in the scenario, the theme provides exactly one display name in its name maps (05 names the files); a template placeholder that carries such an id (`{site}`, `{group}`) renders that display name verbatim, so the template must not add its own "area" or "point" word around it. A `site.*` or `entry.*` id with no display name fails the theme's coverage check (V-11); a display name for an id the scenario does not contain is an orphan warning.

For the reviewer only (not in the scenario file): `site.fortress_1..6` are meant to be the six fortress positions (at Jessore, Jhenidah, Bogura, Rangpur, Comilla, Bhoirab; 07a), and `site.zone_1..2` the two independent defence zones (Chittagong, Sylhet). Which number is which place is the theme's mapping. Jessore and Jhenidah are about 45 km apart, about 9-11 tiles at 08's scale: the map author keeps them in different base areas.

Validation of this file (step 5): every `site.*` referenced by a predicate exists; for every tag in `end_conditions.tag_counts`, exactly that many sites carry it (here `fortress` = 6, so K = 6; with `capital` 1, `defence_zone` 2 and `garrison_town` 11 the starting garrison positions total 20); `initial_site_count` for every slot named by an `initial_sites_held_at_most_pct` predicate is computed here and is non-zero; every `real_place` site has `raid_can_destroy: false`; every entry tile is passable land on the map; regions do not overlap; season ranges are sorted, non-overlapping and inside `max_turns`; `timed_effects.from_turn < max_turns`; no `f1` arrival after `from_turn` of the link cut that the scenario lint flags as an allied unit (section 5, check 9). Strings marked PLACEHOLDER are rejected by `--strict` (CI), so the scenario cannot ship unfinished.

---

## 5. CI allow-list test: "no civilian state"

File: `tests/test_bd1971_no_civilian_state.py`; allow-list data: `tests/allowlists/bd1971_state.json`; review log: `tests/allowlists/bd1971_review.json`. It runs in the normal test suite (not only in a release job). It implements SC §8.1 and SC §9 rules 1-3, and the state side of rule 4 (the label side is the theme's V-04 and V-05).

**What is guaranteed, and where (restated after the owner dropped the two companion switches, 2026-10-03).** The Hybrid H guarantee now holds **partly in the rules and partly in text only**. Rule-level and tested: **no civilian state** in the simulation (checks 1-3, 5, 6 and 9 are unchanged by the drop), and the shortage outcome uses death-neutral ids (`ev.pop_lost{base, amount, cause}`, `warn.food_shortage{base}`: no id or payload field names death, starvation or harm). Text-level only, validated by the theme: **stand-down on shortage** (the rules cannot tell "went home" from "died"; only the label does); and **nothing is said about personnel on capture** (under the neutral rule a captured base keeps its `res.pop`, which then counts for the captor). The test below proves the state side; it does not prove the two text-level promises.

It asserts, under the merged rules `conquest-core` + `bd1971` and the scenario `liberation-1971`:

1. **Closed role sets.** The merged rules' role lists equal exactly: the six `res.*`, the twelve `bld.*`, the eight `u.*`, archetypes in play `{arch.expedition}`, `features["npc.settlement"] == false`, `features["arch.indigenous"] == false`, `features.disc == false`, `features.dip == false`, `features.tribute == false`, `features.scoring == false`, `native_settlements.max == 0`. Any added role id fails.
2. **Key-path snapshot.** The set of all JSON key paths in the merged rules (wildcarding only role-id segments) equals the allow-list snapshot. A new key fails until it is added to the allow-list **and** a review entry `{path, reviewer, date, reason}` exists in the review log (a test checks every allow-list entry has one).
3. **State-field snapshot.** The set of field paths of `GameState` and every nested dataclass, as produced in a bd1971 game, equals the allow-list. A new field fails the same way.
4. **Events.** The set of `ev.*` ids reachable under bd1971 and each id's payload field names equal the allow-list (the event table at the end of this file lists the hook-emitted ones). The neutral shortage outcome is exactly one event id, the death-neutral `ev.pop_lost{base, amount, cause}` (proposed neutral name, section 6 G-8.5), and it is on the list; no death-of-people, tribute, NPC, discovery or score event id is reachable. **Added assertion (keeps the Hybrid H guarantee honest without the switches):** exactly one shortage event id is reachable, it carries no `cause` value other than `"shortage"`, and no event payload anywhere has a field whose name contains a forbidden token of check 5.
5. **Forbidden-token scan (a second net the allow-list cannot override).** Case-insensitive scan of every rules key, state field name, event id, payload field, error code, effect kind, predicate kind, order kind and attack-target kind for: `civilian`, `villag`, `refugee`, `resident`, `inhabitant`, `citizen`, `townsfolk`, `starv`, `famine`, `massacre`, `reprisal`, `atrocit`, `loot`, `plunder`, `hostage`, `prisoner`, `execut`, `tribute`, `kill_count`, `body_count`, `death_toll`. Exceptions need a review entry naming the exact string (none expected). The token `execut` is kept although it may collide with neutral engine identifiers (for example an order-execution key): when the neutral `events.json` and order kinds exist, the expected neutral exceptions are pre-registered in the review log, each naming the exact string (12 Y4). This scan passes only if the neutral engine uses the death-neutral shortage names of G-8.5 and G-12 (`ev.pop_lost`, `warn.food_shortage`); if the neutral engine keeps separate emigration and starvation ids or a `warn.starvation_spiral` warning, this check fails under bd1971 by design (R-14).
6. **Target kinds.** The set of attack target kinds is exactly `{unit, base}`; the set of raid outcomes is `{stock_seized, building_level_lost, site_taken, base_destroyed}`; every `real_place` site in the scenario has `raid_can_destroy == false`.
7. **Personnel accounting (property, soak).** 20 fixed seeds x 89 turns AI-vs-AI (both slots driven by the AI): for every base and every end of turn, every decrease of `res.pop` is matched by exactly one of: a recruit or founder cost paid that turn; a militia strength loss in a battle that turn (GDD §11.6 rate); the neutral shortage loss (rate and rounding of GDD §8.5, reported by `ev.pop_lost{cause: "shortage"}`); or a change of owner by capture, in which case the base's `res.pop` is unchanged by the capture and counts for the new owner. No other decrease exists. Faction totals move only by these causes. If capture damage (GDD §11.6, 02 G16: "half of each stockpile kept") applies to `res.pop`, it is listed as its own cause; otherwise the test asserts that capture leaves `res.pop` unchanged.
8. **Runtime features.** In the same soak: zero `npc.settlement` entities, zero `disc.*` on the map, zero tribute or diplomacy orders accepted, no score fields in state; the shortage rate equals the neutral 5% and emits only the allow-listed event.
9. **No allied units.** Every scenario arrival for `f1` contains only roles in `arch.expedition.can_field` plus `u.scout`, `u.founder`, `u.commander`; no timed-effect kind can create or transfer units (the kind list equals `{patron_link_cut, panic_modifier}`); in the soak, every unit owned by `f1` was created by its own recruit order or by an `f1` scenario arrival (unit provenance field checked).
10. **Theme side (smoke only; the full theme checks belong to the theme agent).** The bd1971 base-locale labels for `res.pop`, `u.militia` and `bld.core` contain none of the forbidden tokens, and no label contains "colony" (RM L-4).

Pass = all ten. The test must also **fail on purpose** in a mutation check: adding a dummy `civilians` field to a state dataclass in a scratch copy, or a dummy `ev.village_burned` event, must turn it red (kept as two parametrised self-tests with a monkeypatched schema).

---

## 6. Impact on the neutral GDD and on 04 (additive change list)

Nothing below changes a neutral number or behaviour; every item adds a key with a neutral default, a sentence, or a test.

| Id | Where | Change |
|---|---|---|
| G-2 | GDD §2 table and rules list | Add: hook keys follow default elision; a ruleset minor version may add hooks without changing the neutral `rules_hash` (H0.1). |
| G-5.1 | GDD §5.1 Start positions | Add: an archetype `start` may be `"scenario"`, letting a scenario declare per slot `entry_tiles` or `pre_placed`. |
| G-5.2 | GDD §5.2 Intel memory | Add: intel record fields `level` and `fort_count` may be `null` (unknown); seeded records have `turn_seen: -1`. |
| G-5.3 | GDD §5.3 Scenario arrivals | Add the optional `entry: {group}` and `via_patron` fields and the deferral rule (H1). |
| G-6.3 | GDD §6.3 | Insert step 3a (arrivals placed for next turn) and step 5a (end-condition check); note that season, region bonus and timed effects are read in steps 1, 3 and 4 (pipeline in section 2). |
| G-7.2 | GDD §7.2, §6.3 step 5 | Replace "attached to a Colony Center" by "attached to a base that has a functional healing source (`hooks.healing.sources`; default the core, 1 per turn)". Same behaviour by default. |
| G-8.4 | GDD §8.4 | Add two optional terms: region bonus inside the modifier sum (before clamp); season food multiplier after the clamp. |
| G-8.5 | GDD §8.5 | Naming only, no behaviour change (before the engine is coded): the shortage outcome is **one** event with a death-neutral id and payload, `ev.pop_lost{base, amount, cause: "shortage"}`. The colonial theme still labels it "emigrated or starved"; bd1971 labels it as a stand-down. (Replaces the dropped `economy.shortage.kind` switch.) |
| G-9 | GDD §9 | Add: a timed effect may cut a faction's patron link (orders refused, in-flight per `in_flight`). |
| G-11.5 | GDD §11.5 | Add a `panic_modifier` per-mille term from active timed effects. |
| G-11.6 | GDD §11.6 | Add: per-site `raid_can_destroy: false` converts a destroying raid into a capture (`ev.site_taken`). |
| G-12 | GDD §12 | Add typed end conditions (surrender predicates, `deadline_result`, `no_base_no_founder_grace_turns`, scenario `tag_counts`); "last standing" becomes "last faction neither eliminated nor surrendered" (identical when no predicate exists). Outcome events: `ev.faction_eliminated{slot, reason, turns}`, `ev.faction_surrendered{slot, turn}`, `ev.match_won{winner_slot, reason}`, `ev.match_drawn{reason}`; predicate `initial_sites_held_at_most_pct` (initial count fixed at scenario load). Naming only: the food-failure warning is `warn.food_shortage` (not "starvation"). |
| G-6.3b | GDD §6.3 step 6 | Add `ev.season_started{season}` when the season changes (H3). |
| G-13 | GDD §13 | Add the KnowledgeView fields: season schedule, region outlines and own cap status, own arrivals and entry groups, own surrender predicate and public objective sites, announced timed effects. The AI imports `core.movement.step_cost` for planning. |
| G-17 | GDD §17 | Add the hook state fields (`site_id`, `no_base_turns`) to the save; all elided when default. (`initial_site_count` is derived from the scenario at load and is not saved.) |
| G-18 | GDD §18 | Add `core/predicates.py` (shared with missions) and `rules/core/hooks.json`. |
| G-19 | GDD §19 | Register every hook key and every row of section 3.1 in the assumption register. |
| G-20 | GDD §20 | Add: `test_hook_defaults_frozen`, hook-off hash equality, and the bd1971 allow-list test (section 5). |
| G-22 | GDD §22 | "Mapped scenarios" is partly delivered: pre-placed bases, entry tiles, regions, seasons. Scoring stays deferred. |
| TA-1 | TA §3.2 | Variant `path` is a JSON Pointer (RFC 6901); dotted paths are ambiguous with dotted role ids. Add optional `applies_to.min_minor`. |
| TA-2 | TA §3.4 step 5 | Add the scenario checks of section 4 (sites, tags, entry tiles, regions, schedules, PLACEHOLDER rejected in `--strict`). |
| TA-3 | TA §2.10 | Add `test_hook_defaults_frozen` and the per-variant allow-list pattern. |

---

## 7. Risks, interactions and facts to verify

### 7.1 Risks

| Id | Risk | Mitigation |
|---|---|---|
| R-1 | **Default elision hides a changed default.** If someone edits a hook default, neutral behaviour changes but the hash does not. | Defaults frozen per major version; `test_hook_defaults_frozen` pins them. |
| R-2 | **Pacing after the December effect.** The link cut is at turn 84 and the deadline at 88: only 5 turns. If the surrender test is rarely reachable before 84, most games end in a draw. | Balance target (ASSUMED): in the AI-vs-scripted-player soak, median win turn between 70 and 88, and fewer than 30% draws at normal difficulty. Tune garrison sizes and the panic modifier, not the dates; N of K and the 25% clause are OWNER values (report to the owner, do not tune). |
| R-3 | **AI camps entry tiles.** If the AI learns a group's tiles from intel it can block arrivals indefinitely. | Nine groups, one per border sector area, on three borders; deferral never loses units; optional `max_defer_turns` fallback to any group. Soak metric: no arrival deferred more than 3 turns in 95% of runs. |
| R-4 | **Hospital cost shift.** A base no longer heals until it builds `bld.scout_post`; early raids feel harsher. | Cheap (2W at L1). If playtests object, list `bld.core` as a second source with [1,0,0,0] (or [1,1,1,1]); sources do not stack, so this is a one-line data change. |
| R-5 | **Season shock to AI routes.** An AI that plans with the neutral cost overruns. | AI imports the same `step_cost`; unit test that AI plans under `season.wet` never exceed budgets. |
| R-6 | **AI build orders hard-code `bld.scout_post` for scouts.** | AI asks the rules `recruiters_of("u.scout")`; boundary test greps `ai/` for building ids tied to recruit roles. |
| R-7 | **Captured personnel.** Under the neutral capture rule a captured base keeps its `res.pop`, which then counts for the captor: **capture turns the AI's captured personnel into the player's volunteers** (on screen, "Personnel" become "Volunteers"). It draws on no civilians, but it reads as opposing troops joining the movement, which a Pakistani or Bangladeshi reviewer may question. SC §3.1 condition 5 ("personnel never change sides") no longer holds in the rules. | **The Hybrid H guarantee now holds partly in text only:** the rules guarantee no civilian state, but not that personnel never change sides. **This is a text-level, not a rule-level, mitigation:** theme text never narrates the transfer (capture templates make no claim about where personnel go; the `limits` entry calls it a game simplification); the accounting test (section 5 check 7) proves capture is the only cross-side movement of `res.pop`. The owner may restore a capture switch later as a ruleset minor version. |
| R-8 | **Region cap vs capture.** Capturing the capital (level 4) in a region where the player already has a level-3 HQ blocks further qualifying upgrades there. | Intended and documented in the briefing; the cap never revokes ownership. |
| R-9 | **Variant drift from `equal-nations`.** bd1971 repeats its ops; if `equal-nations` later changes, they diverge. | Test: the set of `equal-nations` ops is a subset of bd1971's ops. |
| R-10 | **Unresolved pointers.** Paths like `/economy/tax/coin_pct` and `/features/*` are this spec's proposals; the core files do not exist yet. | Validator rejects unresolved pointers at load; the ruleset author either adopts these names or updates this variant in the same change. |
| R-11 | **Loss clock vs a hidden founder.** | Resolved by the owner (2026-10-03): no base area for 15 turns loses, regardless of founders. Settings: neutral `homeless_turns_limit: 15` kept; `no_base_no_founder_grace_turns: 15` only switches off the neutral instant elimination (grace 0 would bring back an instant loss when the last organising team dies before a base exists, so the earlier advice "limit 15 and grace 0" was wrong). A player with founders but no base still loses at 15; the turn-88 deadline bounds everything else. Pacing: the player starts with no base, so the clock runs from turn 0 and the first base must stand by the end of turn 14 (GDD §4 target: turn 3). |
| R-12 | **Raid conversion vs cross-archetype rules.** `raid_can_destroy: false` relies on capture being legal; both sides are `arch.expedition`, so it is. If a future theme uses it across archetypes, the base stays with its owner at level 1. | Specified in H2; unit tested. |
| R-13 | **Contested dates in mechanics.** Effect turn and brigade arrival days encode dates with thin sources (months verified, days single-source). | PLACEHOLDERs, rejected by `--strict` until checked; the season boundary is a stated ASSUMED design choice on a verified June-September basis; the encyclopedia states the ranges. |
| R-14 | **Shortage meaning lives in text only (Hybrid H holds partly in text only).** With the stand-down switch dropped, the rules cannot tell "went home" from "died"; only the death-neutral ids are rule-level. If the neutral engine names its shortage outcome with separate emigration and starvation ids, or keeps a "starvation" warning, check 5 fails under bd1971. | Adopt the death-neutral names of G-8.5 and G-12 (`ev.pop_lost`, `warn.food_shortage`) before the engine is coded; otherwise check 5 needs a reviewed exception naming the exact neutral id. Theme shortage text (V-04) must not add any claim, such as "nobody was harmed", that the rules cannot back. |
| R-15 | **The 25% clause counts starting garrison positions only.** With 20 starting positions, the fortress route needs f2 down to 5 of them: f2 must lose 15 positions, and they cannot be destroyed (`real_place`), only captured, which may make the capital route the only practical win and raise the draw rate (R-2). If the map's position count changes, the threshold changes with it. | `tag_counts` pins the count (1 + 6 + 2 + 11 = 20) so a map edit fails validation instead of silently moving the threshold; `initial_site_count` is fixed at load, so AI-founded bases can neither delay nor hasten surrender. Pacing soak (R-2) reports the share of wins by each route; N, K and the 25% are OWNER values, so the soak informs the owner and does not tune them. |

### 7.2 Interactions between hooks

| Pair | Interaction | Rule |
|---|---|---|
| H1 x H5 | Patron-borne arrivals after the link cut | `via_patron` arrivals suppressed while the cut is active; entry-tile arrivals of the player are never patron-borne. |
| H2 x H4 | Predicates name sites | Sites keep their id through capture; a destroyed site counts as held by nobody; `real_place` sites cannot be destroyed, so the capital and fortress objectives can never vanish. |
| H2 x H6 | Pre-placed bases above the cap | Grandfathered; the cap acts only on upgrade orders. |
| H3 x H6 | Food multiplier and region bonus | Region bonus inside the modifier (before clamp), season after the clamp; order fixed so the preview and the turn agree. |
| H3 x movement setting | Three percent factors | Multiplied as integers, one floor at the end. |
| H4 x H5 | The cut weakens the AI's defence of the objective sites | No direct coupling; the predicate reads ownership only. |
| H4 x H1 | Loss clock and arrivals | Founder arrivals do not reset the loss clock; only holding a base does (counted in step 5a after step 3a). A founder arrival resets only the redundant grace counter `no_base_turns`. |
| H7 x raid/capture damage | Hospital lost | Healing stops in that base from the next step 5. |
| Shortage x H3 | Lower pre-wet food output | More shortage losses early; the simulator must show the opening base survives (first base by turn 3, GDD §4). |

### 7.3 Facts to verify before the numbers are fixed (cross-reference RM §10)

| RM §10 item | What it fixes in this spec | Placeholder now |
|---|---|---|
| 1 Sector areas | The ten `region.*` outlines and which base lies in which region (H6) | `tiles_rle` PLACEHOLDER |
| 2 Dates (Commander-in-Chief, joint command, brigade formation) | `timed_effects.from_turn`; brigade arrival turns 34, 63, 67. The Commander-in-Chief was chosen on 9 April, took command on 12 April and took office with the provisional government on 17 April; the 11-17 July meeting was the first sector commanders' conference (07a). No rule depends on these. The timed effect models the open war from 3 December (turn 84; PARTLY, secondary sources) and does not depend on the contested joint-command date (21 November or 4 December). Brigade months VERIFIED (July, October, October); days single-source | 84; 34 / 63 / 67 |
| 3 How the brigade names were chosen | Resolved: the letters were the initials of the real commanders (07a), so theme labels stay generic ("first / second / third regular brigade") | generic labels (final) |
| 4 First civil administration (August, liberated area) | Flavour only; month only (27 or 28 August); no mechanic depends on it | none |
| 5 Monsoon months | Climate monsoon June-September VERIFIED (07c); `season_schedule` wet = turns 22-62 is an ASSUMED boundary choice | wet = 22-62 (ASSUMED) |
| 6 Funding and local contributions | Supported in substance, no amounts (07b): justifies the coin extractor's move to open land (variant op). The "remove the coin extractor" alternative is dropped | op kept |
| 7 Arms sources | No op (the hard extractor is unchanged); affects only theme text and a possible later tuning op | none |
| 8 Eastern Command structure, fortress positions, light tanks | Six named fortress positions plus two independent defence zones (07a; one summary lists five): K = 6 `fortress` sites, two `defence_zone` sites, the capital garrison site; garrison sizes and `u.shock` in pre-placed bases ("a handful of light-tank squadrons"; no count is ever printed, the count was not found); number of starting garrison positions (sets the 25% threshold; 20 in 08) | `site.fortress_1..6`, `site.zone_1..2`, `site.town_01..11`; garrisons PLACEHOLDER |
| 9 Razakar / Al-Badr formation | Theme label of `u.militia` on the AI side only (SC rule 6 says never name them on a unit); no rule | none |
| 10 Radio dates | Theme only | none |
| 11 Every on-screen number | No force, refugee or casualty number appears in any rule or event payload (section 5 checks 4-5) | none |
| 12 Bengali terms | Theme labels only | none |

Also to check (not in RM §10): the calendar arithmetic of section 4 was re-run independently by the verifier (09 B.1: turns 0, 22, 23, 62, 63, 84, 88 and `max_turns = 89` are right); and, before release, the legal and community reviews of SC §10, which no rule here replaces.

### 7.4 Decisions this spec asks the owner to confirm

All four are decided (owner, 2026-10-03):
1. Companion keys C1 and C2: **Decided 2026-10-03: dropped.** Section 5 is restated; R-7 and R-14 record what moved to text.
2. Loss clock: **Decided: no base for 15 turns**, regardless of founders (R-11).
3. `u.scout` recruiting and the scout cap: **Decided: `bld.habitat`** (volunteer shelter); healing at `bld.scout_post` (field hospital).
4. Surrender: **Decided: capital garrison site, or 3 of the 6 fortress positions** with the AI holding at most 25% of its **starting** garrison positions (fixed at scenario load; 20 in 08, so at most 5; positions founded later do not count). The two defence zones are not fortress positions (K = 6) but are starting garrison positions for the 25% clause.

---

## 8. Event and key table (05 conforms to this)

06 owns rule keys, event ids, error codes, season ids and opaque scenario ids. The theme (05) writes one template per id under the **same key name** (one exception, `ev.match_won`, below), using only the payload fields listed as `{placeholders}`; opaque ids in a payload (`site`, `group`, `season`, `region`, `building`, `slot`, `winner_slot`) are rendered through the theme's name maps (display-name rule, section 4). **No payload has a free-text field**: every field is an opaque id, an integer or a fixed enum value listed below, so a template can never show engine-written prose. Visibility: "all" = public event to every player; "owner" = only the slot concerned.

**Template selection rule (the one rule for events; joint contract with 05).**
1. **`@<slot>` override: chosen by the receiving slot, for every event and error.** When the engine renders an event for slot S, it uses the key `<key>@S` if the theme defines it, else `<key>`. No payload field ever selects an `@<slot>` override. (This replaces 12 X3b's proposal to select by `winner` or `slot`; the joint contract with 05 handles the winner case by step 2 instead.)
2. **`ev.match_won` only:** the theme defines no base `ev.match_won` template; it defines `ev.match_won.player` and `ev.match_won.opponent`. The key is `ev.match_won.player` when `winner_slot` equals the receiving slot S, else `ev.match_won.opponent`; step 1 then applies to that key (`ev.match_won.player@S` if defined). The theme's coverage check (V-11) requires both keys for `ev.match_won` instead of the base key. A player who loses therefore never reads a victory text.
3. `ev.faction_eliminated` and `ev.faction_surrendered` follow step 1 only (receiving slot). Under bd1971 only f2 can surrender and f1 is the only human, so their base texts are written for f1 as the reader.

**Death-neutral ids.** `ev.pop_lost{base, amount, cause}` and `warn.food_shortage{base}` are death-neutral: neither the id, nor a payload field name, nor an enum value names death, starvation, famine or harm (section 5 checks 4-5); `cause` takes only `"shortage"` under bd1971. Theme text for them is stand-down wording (V-04).

| Event / key id | Payload fields | Emitted by (step) | Visibility | Theme key name |
|---|---|---|---|---|
| `ev.arrival_deferred` | `slot`, `group`, `arrival_index` | H1 (step 3a) | owner | `ev.arrival_deferred` |
| `ev.arrival_cancelled` | exactly `slot`, `arrival_index`, `reason` (enum, only `"patron_link_cut"`); no free-text field | H1 with H5 (step 3a) | owner | `ev.arrival_cancelled` (no unit placeholder: the payload has none; under bd1971 the only `via_patron` arrival is f2's, so the `@f2` text is the one shown) |
| `ev.site_taken` | `site`, `from`, `to`, `via` (`"raid"`) | H2 (step 1, raid converted to capture) | `from` and `to` | `ev.site_taken` (and `@f2` variant if the theme wants one) |
| `ev.season_started` | exactly `season` (opaque season id); no free-text field (a per-season sentence, if wanted, is a theme-side lookup by the season id, not a payload field) | H3 (step 6, when `season(T+1) != season(T)`) | all | `ev.season_started` |
| `ev.faction_eliminated` | `slot`, `reason` (`"homeless_limit"` or `"no_base_no_founder"`), `turns` | H4 (step 5a) | all | `ev.faction_eliminated` (replaces 05's `ev.defeat_scattered`) |
| `ev.faction_surrendered` | `slot`, `turn` | H4 (step 5a) | all | `ev.faction_surrendered` (replaces `ev.victory_surrender`) |
| `ev.match_won` | `winner_slot`, `reason` (`"surrender"` or `"last_standing"`) | H4 (step 5a) | all | `ev.match_won.player` / `ev.match_won.opponent`, selected by `winner_slot` against the receiving slot (rule 2 above); no base key |
| `ev.match_drawn` | `reason` (`"deadline"` or `"all_out"`) | H4 (step 5a) | all | `ev.match_drawn` (replaces `ev.deadline_draw`) |
| `ev.timed_effect_started` | `id`, `target_slot` | H5 (start of `from_turn`, when `announce: true`) | all | `ev.timed_effect_started` (replaces `ev.patron_link_cut`; bd1971 has one timed effect, `te.link_cut`) |
| `ev.unit_healed` | `unit`, `amount`, `building` | H7 (step 5) | owner | `ev.unit_healed` |
| `ev.pop_lost` | `base`, `amount`, `cause` (`"shortage"` only); death-neutral | neutral economy (step 4), proposed name G-8.5 | owner | `ev.pop_lost` (stand-down wording; V-04) |
| `warn.food_shortage` | `base`; death-neutral | neutral economy warning, proposed name G-12 | owner | `warn.food_shortage` (if the neutral engine keeps 05's `ev.shortage_warning` / `ev.shortage_resolved`, those ids are allow-listed instead; none may contain `starv`) |
| `err.patron_link_cut` | (none) | H5 (order validation) | owner | `err.patron_link_cut` |
| `err.region_cap` | `region` | H6 (order validation) | owner | `err.region_cap` |

| Season id (ruleset) | Turns (scenario schedule) | Theme label key (05 `calendar.json` `season_labels`) |
|---|---|---|
| `season.pre_wet` | 0-21 | `season.pre_monsoon` |
| `season.wet` | 22-62 (turn 22 = 31 May - 2 June 1971, contains 1 June) | `season.monsoon` |
| `season.dry` | 63-88 | `season.dry` |

Other ids the theme maps (opaque, from the scenario): `site.capital`, `site.fortress_1..6`, `site.zone_1..2`, `site.town_NN`, `site.camp_NN`; `region.r01..r09`, `region.r11` (to `ui.sector.N`); `entry.s01..s08`, `entry.s11` (each to one display name, per the display-name rule in section 4; the E01-E16 tile mapping is the section 4 table); `te.link_cut`. Version reference: `bd1971@0.1`. The theme holds **no** turn numbers (`calendar.json` holds labels, epoch and step only); `max_turns` (89) and the season schedule live in the scenario.

---

## Change log (errata applied)

Source: [09-verification-errata.md](09-verification-errata.md) (09) and the owner's decisions of 2026-10-03. Only this file was edited.

| # | Errata id | Change in 06 |
|---|---|---|
| 1 | P0-1, B.2 #1-#3, A21 | Season ids kept (`season.pre_wet/wet/dry`, 06 owns them); turn 22 confirmed as first wet turn; deleted the April-October alternative from `_season_note`; schedule status PLACEHOLDER -> ASSUMED (§3.1, §4, §7.3 row 5); stated that the theme's `calendar.json` holds labels only. |
| 2 | P0-2, B.3, B.2 #4-#5 | H3 now emits `ev.season_started{season}` at step 6 (pipeline, semantics, test); H4 emits distinct `ev.match_won` / `ev.match_drawn` instead of `ev.match_ended`; `ev.faction_eliminated` gains `reason` values and `turns`; `ev.arrival_cancelled` and `ev.site_taken` payloads made explicit (`site` field); `ev.unit_healed{unit, amount, building}` defined in H7 (B.2 #13). New §8 event and key table. |
| 3 | P0-3, C.1 (owner decision 1) | Deleted C1 and C2 rows, sections and ops; replaced the paragraph under §1 table; totals now about 1,130 + 1,520; H0.1 first bullet; pipeline step 4 `[H3, H6]`; §5 intro and guarantee restatement; check 4 rewritten with the death-neutral id `ev.pop_lost{base, amount, cause}` and the one added assertion; check 7 and check 8 rewritten; G-8.5 replaced by the naming-only change (C.1 item 2) instead of being deleted outright; G-11.6 C2 reference removed; R-7 rewritten (capture turns captured AI personnel into the player's volunteers; text-level, not rule-level mitigation); new R-14 (shortage meaning in text only); §7.2 H2 x C2 deleted, C1 x H3 -> Shortage x H3; §7.4 item 1 decided. |
| 4 | P0-4, C.2 (owner decision 2) | Deleted the `homeless_turns_limit: null` op; kept grace 15 with the new note; H4 step 1 states the homeless clock ignores founders; H4 test and acceptance (d) rewritten; §3.1 grace row; R-11 resolved and the wrong "limit 15 and grace 0" advice corrected; §7.2 H4 x H1 rewritten; §7.4 item 2 decided. |
| 5 | P0-5, A27, A.3.1 option A (owner decision 4) | Six fortress sites (`site.fortress_1..6`), two `defence_zone` sites (`site.zone_1..2`), K read from new `end_conditions.tag_counts` (6) instead of hard-coded 5; validation text, §3.1 row (OWNER 3 of 6), H4 acceptance (b), §7.3 row 8 (light-tank squadrons, no count, A29); reviewer note naming the places kept outside the scenario JSON; Jessore-Jhenidah distance note. |
| 6 | P0-7, A4, A5 | Brigade arrival `_note`s generic (no initials); first brigade moved to a northern entry group (`entry.s11`); §7.3 row 3 resolved. |
| 7 | P0-8 (owner decision 5) | Added a version-reference paragraph after the variant: `bd1971@0.1`; the preset must not say `bd1971@1`. (The preset itself is in 05, edited by the other agent.) |
| 8 | P1-4, A1 | Removed the personal name from §7.3 row 2; Commander-in-Chief sequence (9, 12, 17 April; July = first sector commanders' conference). Brigade letters also removed from that row. |
| 9 | P1-5, A3, A9 | `te.link_cut` `_note`: models the open war and blockade from 3 December (turn 84); joint-command contest no longer cited; §3.1 December row marked PARTLY (secondary sources). |
| 10 | P1-12, B.2 #12 | Level-1 `bld.scout_post` added to the capital and fortress building lists so the AI heals from turn 0. |
| 11 | P1-15, B.2 #9 | `_regions_note`: the scenario is the single home of region data; theme maps `region.rNN` to `ui.sector.N`. Also corrected "eleventh sector" to "tenth sector" (sector 10 is the label-only one; regions are r01-r09 and r11, B.2 #10). |
| 12 | P1-16, B.2 #11 | Entry groups changed from three (`entry.west/north/east`) to nine per-sector groups (`entry.s01..s08`, `entry.s11`); arrivals reassigned (ASSUMED except as noted); R-3 updated. |
| 13 | P1-19, A33 | §7.3 row 6: support committees supported in substance; "remove the coin extractor" alternative dropped. |
| 14 | P2-9, B.2 #14, C.3 (owner decision 3) | "courier(s)" in H7 replaced by `u.scout`; habitat placement marked OWNER; §7.4 item 3 decided. |
| 15 | E.2 (owner decision 6) | Scope sentence: art and asset statements are PROVISIONAL (art method undecided). |
| 16 | A7 | §7.3 row 4: Roumari month only. |
| 17 | B.1 | §3.1 `max_turns` row and §7.3 closing note: calendar arithmetic re-checked by the verifier. |
| 18 | (method) | Three schematic JSON blocks (H1, H2, H4 scenario keys) used `[x, y]`, `...` and `[...]` and did not parse; replaced with example integers and one example predicate so every JSON block in this file parses. |

**Not applied, and why.**
- **P2-8** (let `no_base_no_founder_grace_turns` accept `null`): optional schema change at P2; C.2's exact fix (grace 15) is applied instead, as the owner asked.
- **P1-14** (`raid_can_destroy` naming): 06 already uses the per-site flag; the fix is in 05 only.
- **A.3.1 town spellings** inside the scenario: not added to the JSON (opaque ids only); period vs present spelling (A26) is an open owner choice for the theme. The reviewer note uses the owner's spellings (Jhenidah, Bogura, Bhoirab).
- **A5 for brigades two and three**: their areas are not in the 07 files; entry groups stay PLACEHOLDER.
- **Turn 0, turn 6 and second opening arrival groups** (`entry.s08`, `entry.s02`, `entry.s06`) are ASSUMED mappings of the old west/east/north groups; 09 gives no source for them.
- All P0/P1/P2 items that touch only 05 (text, validators, preset file, figures) are left to the 05 editor.

## Change log (second pass)

Source: [12-second-pass-verification.md](12-second-pass-verification.md) (12), the joint contract with the 05 editor, and the owner's decisions of 2026-10-03. Only this file was edited. 12 lists no P0 item against 06; all its 06 items are P1 or P2.

| # | Report id | Change in 06 |
|---|---|---|
| 1 | M1 (P1); owner decision 3 | "Jhenaidah" corrected to the owner's **Jhenidah** in the section 4 reviewer note (two occurrences) and in the "Not applied" list of the first change log; also in row 5 of that log, so no wrong display spelling remains. |
| 2 | X3b (P1); joint contract | Section 8 gains the **template selection rule**: the `@<slot>` override is chosen by the receiving slot for every event and error (one rule, never by a payload field); `ev.match_won` has no base template, the theme writes `ev.match_won.player` and `ev.match_won.opponent`, selected by `winner_slot` against the receiving slot. The payload field `winner` is renamed **`winner_slot`** in H4 step 3, G-12 and the section 8 table. X3b's alternative (select the override by `winner`/`slot`) was replaced by this contract. |
| 3 | M5 (P1); owner decision 2 | The 25% clause counts the AI's **starting** garrison positions only. New predicate `initial_sites_held_at_most_pct{slot, at_most_pct, tags_any?}` with an exact definition (H4); `initial_site_count` is computed once at scenario load from `pre_placed_bases` (not game state, not saved); bases founded later count in neither numerator nor denominator. Replaces `base_count_pct_of_start` and `start_base_count` (removed from H0.1, the `new_game` line, H4 neutral default, G-17). Scenario: predicate with `tags_any` [capital, fortress, defence_zone, garrison_town], `tag_counts` 1/6/2/11 = 20 (08), outpost `site.camp_01` kept but excluded and noted, zone `_note` corrected (zones count for 25%, not as fortresses). Tests (5 passes, 6 fails; founded bases ignored; retaken positions count; load-time fixity; empty start rejected), acceptance (b), §3.1 row, validation text, §7.3 row 8, §7.4 item 4, R-2 wording, new risk R-15. The owner's example name `ai_sites_at_most_pct_of_initial` was generalised to `initial_sites_held_at_most_pct` because the predicate takes any slot and the ruleset stays generic. |
| 4 | Owner decision 1 | Prose no longer calls the AI's starting sites "towns": "garrison positions", "fortress positions", "defence zones", "capital garrison" (scope line, H2 table row, §3.1, §4 notes, §7.3, §7.4). New "Terms (PROPOSED, for reviewers)" paragraph under the scope. Opaque ids and tags unchanged (`site.town_NN`, `garrison_town`). |
| 5 | M3 (P1, 08 item; 06 side); joint contract | Section 4 gains the E01-E16 to `entry.sNN` table (16 tiles, nine groups), marked **ASSUMED: the verifier's mapping**; `_entry_note` points to it; the turn-0 contact note for `entry.s02`/E14. |
| 6 | X5, X6 (P1, 05 items; 06 side); joint contract | Section 4 gains the **display-name rule**: the theme owns every name; one display name per `site.*`/`entry.*` id; placeholders render it verbatim (no added "area" word); missing name fails V-11. Section 8 "Other ids" line no longer prescribes "Entry point, Sector n area". |
| 7 | X1, X2 (P0 in 05; 06 side); joint contract | Section 8: `ev.arrival_cancelled` payload is exactly `slot`, `arrival_index`, `reason` (enum); `ev.season_started` payload is exactly `season`; neither has a free-text field, and a general "no payload has a free-text field" sentence was added. |
| 8 | X4 (P0 in 05; 06 side); joint contract | Section 8 states that `ev.pop_lost{base, amount, cause}` and `warn.food_shortage{base}` are **death-neutral** (id, field names, enum values); table rows marked. |
| 9 | Owner decision 4; 12 §7.1 risk 3 | Hybrid H wording: section 5 intro, R-7 and R-14 now say the guarantee holds **partly in text only** (rule-level: no civilian state and death-neutral ids; text-level: stand-down meaning and silence about personnel on capture). |
| 10 | M6 (P2) | Jessore-Jhenidah: "about 45 km, about 9-11 tiles at 08's scale; the map author keeps them in different base areas" (was "roughly 13 tiles on a 128-tile map"). |
| 11 | Y1 (P2) | H4 step 1: when both elimination counters fire on one check, `reason` is `"homeless_limit"` (precedence); unit test added. |
| 12 | Y2 (P2) | Turn-12 f2 arrival `_note`: arrives by the neutral transport rule (GDD 5.3, map edge), not "at its port site". |
| 13 | Y3 / X11 (P2) | One name for the healing mechanism: `/hooks/healing/sources`; the "`heals_attached` flag" name is retired in the §1 table and the H7 heading; op value `{"min": 1, "max": "level"}` stated. |
| 14 | Y4 (P2) | Check 5: token `execut` kept; expected neutral exceptions to be pre-registered in the review log when `events.json` exists. |
| 15 | 12 §5 cosmetic | The turn-12 f2 arrival is reflowed onto its own line in the scenario JSON. |
| 16 | (method) | Every fenced JSON block re-parsed by a Python script in the session scratchpad after editing (the two full documents parse as-is; the key snippets parse when wrapped in `{}`, as before). |

**Not applied, and why.**
- **X3b's optional `ev.faction_eliminated@f2`** and every 05 template text (X1-X12, S1-S8): theme text lives in 05, edited in parallel.
- **M2, L1-L3, M4, M7-M10**: 08-only wording; the 08 editor's task.
- **M5 option (b), dropping `site.camp_NN`**: not done; the `tags_any` filter excludes outposts instead, so the skeleton keeps the optional outpost shape and the 20-position count is unaffected. 08 places no outposts.
- **Filling `entry_groups.tiles` with 08's coordinates**: not done; 08's tile coordinates are on its draft grid, not the final scenario map (still PLACEHOLDER, section 7.3), and the mapping itself is ASSUMED.
- **S8 (SC rule 4 note)**: SC is not this file.
