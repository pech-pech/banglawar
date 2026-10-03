# 10 - Test plans for the neutral base (any theme, any variant)

Status: **plan (specs, test names, fixtures, assertions, acceptance criteria). No test code exists and none is written here.** Date: 2026-10-03.
Inputs read from disk, as data: [GDD.md](../GDD.md) (cited GDD section n), [04-theme-architecture.md](../04-theme-architecture.md) (TA n), [05-critique.md](../05-critique.md) (CR id), [06-variant-and-hooks-spec.md](06-variant-and-hooks-spec.md) (06 n), [09-verification-errata.md](09-verification-errata.md) (ER n).

**Scope rule.** Everything in sections 1-7 and 9-13 holds for ANY theme and ANY variant. Nothing in those sections may name 1971, Bangladesh or any real place, person or formation. Where the bd1971 variant is the first consumer of a generic test, the test is written once, parameterised, and bd1971 appears only as one row of a fixture table (section 1.4). Section 7 and 8 define generic test machinery; the per-variant data (allow-lists, word lists) lives with the variant or the theme pack, not in the neutral suite.

**Items that may change (parallel agents are editing 05, 06 and 08; flagged `[VOLATILE]` where used).**
- V1. ER C.1 drops rows C1/C2 of 06 (the shortage and capture switches). This plan is written to the post-ER state: it never asserts `economy.shortage.kind` or `combat.capture.pop_outcome`. If the owner restores them, section 7.6 lists the two checks to re-add.
- V2. ER C.2 changes the loss rule (neutral `homeless_turns_limit` 15 plus `no_base_no_founder_grace_turns` 15, perhaps `null`). Section 6 tests the H4 hook generically, not the final numbers.
- V3. The fortress correction (ER A.3.1 / P0-5) may change K of N. Tests read K and N from scenario data.
- V4. The neutral event id for the shortage outcome (`ev.pop_lost` vs the engine's own name) and the warning id `warn.food_shortage` are not fixed yet (ER C.1 point 2). Tests reference them through a `rules.events` lookup, not a literal, except where marked.
- V5. Variant op paths such as `/economy/tax/...` and `/features/...` are proposals (06 R-10). Tests resolve pointers against the real merged document and never hard-code a path list.
- V6. V-numbered theme validators (V-04, V-07, V-15, V-18, V-21) belong to the theme pack spec 05. Section 8 refers to them by purpose, not by number, except in the cross-reference table.
- V7. Estimated sizes and thresholds (benchmarks, pass bands) are GDD ASSUMED values and are read from the tunables, not duplicated in tests.

---

## 1. Test strategy and layout

### 1.1 Goals
1. Prove the three-layer claim of GDD 2: the **ruleset** is the only thing that changes game outcomes; a **theme** is a skin; a **variant** is a typed, validated overlay.
2. Catch the risks the review named as most likely to bite: determinism holes (CR H-8), theme leaks (CR C-2, TA 4), economy runaway (CR H-4, H-5), and import-boundary rot.
3. Be fast. The default `pytest` run (no marks) stays under 90 s on a developer laptop (ASSUMED budget). Heavy suites are marked and run in later CI stages (section 12).

### 1.2 Folder layout (proposed; `conquest/` per decision D-14)

```
conquest/
  tests/
    unit/                     # pure core, one module per source module
      core/  ai/  data/
    boundary/                 # import-graph and source lint tests (section 2)
    determinism/              # RNG, hash seed, golden replays (section 3)
    themes/                   # theme-swap, coverage, locale, fonts (sections 4, 5, 8)
    variants/                 # op validation, hash stability, hooks (section 6)
    guards/                   # allow-list machinery (section 7)
    sim/                      # economy simulator, pacing, anti-runaway (section 9)
    combat/                   # combat harness, nation matrix (section 10)
    perf/                     # benchmarks (section 11)
    soak/                     # AI-vs-AI long runs
    golden/
      replays/*.json          # recorded order lists (inputs)
      hashes/*.json           # per-turn rules_state_hash expectations
    fixtures/
      rules/                  # tiny hand-made rulesets (see 1.3)
      themes/                 # synthetic themes (see 1.3)
      variants/               # synthetic variants incl. deliberately broken ones
      scenarios/              # tiny scenarios, planted-violation scenarios
      maps/                   # hand-made 8x8 and 16x16 maps
    conftest.py               # fixture factories, marks, hash-seed subprocess helper
    helpers/                  # replay runner, state hasher, import-graph parser (test-only code)
```

### 1.3 Fixtures (the cast that makes tests generic)

| Fixture | What it is | Used by |
|---|---|---|
| `rules_neutral` | The shipped `conquest-core` ruleset at its declared minor version, no variants | most suites |
| `rules_mvp` | `rules_neutral` + variant `mvp@1` | pacing, soak |
| `rules_tiny` | Hand-made ruleset (3 resources' worth of numbers kept real, tiny map, 2 factions) in `fixtures/rules/tiny/` | fast unit and property tests |
| `variant_catalogue` | All shipped variants discovered by `glob` (never listed by name) | section 6 parameterisation |
| `variant_broken_*` | A folder of planted-defect variants (one defect each, see 6.2) | section 6 negative tests |
| `theme_catalogue` | All shipped themes discovered by `glob` | sections 4, 5, 8 |
| `theme_empty` | Manifest only, no other file (TA 2.10) | theme-swap, fallback tests |
| `theme_second` | A **minimal** second theme (labels and palette only, per decision D-6) in `fixtures/themes/second/`. It is a test fixture and a shipped sample at once | theme-swap |
| `theme_pseudo` | Machine-generated pseudo-locale of the neutral base locale (accents, +30% length, section 5.6) | layout and lint tests |
| `theme_broken_*` | Planted defects: a ruleset key in a theme file, a missing role, a bad placeholder, a missing plural `other`, a font lacking a glyph | section 5 negative tests |
| `scenario_*` | Tiny scenarios on `fixtures/maps/` | everything that needs a game |
| `replay(name)` | Loads a recorded order list from `golden/replays/` | determinism |

Factory rule: fixtures are built by functions that return **frozen** objects. A test may not mutate a fixture; a deep-freeze check in `conftest.py` raises on mutation attempts.

### 1.4 Parameterisation of themes and variants

Pytest parameter ids come from the discovered ids, so a new theme or variant is covered the day it is added, with no test edit.

```
THEMES   = discover("themes/*/theme.json")           -> ids: colonial, second, <new>...
VARIANTS = discover("rules/variants/*.json")         -> ids: equal-nations, mvp, no-patron, <new>...
@pytest.mark.parametrize("theme_id", THEMES + ["__empty__"])
@pytest.mark.parametrize("variant_id", VARIANTS)
```

A **meta-test** `test_parameter_discovery_is_not_empty_and_not_stale` fails if discovery returns zero themes or variants, or if a shipped theme folder contains no `theme.json` (guards against a silently vacuous suite). A second meta-test `test_every_shipped_variant_has_a_hash_golden` fails if a variant has no entry in `golden/hashes/rules_hash.json`.

Per-theme and per-variant data that tests must read (forbidden-word lists, allow-lists, sample payloads) is loaded **from the pack/variant folder** (`themes/<id>/lint.json`, `rules/variants/<id>.allow.json`), never embedded in the neutral suite. If the file is absent the corresponding test is `skip` with reason "no list declared", and a counter test `test_skips_are_declared` prints the skip set so a silent skip cannot hide a missing list (the pack's own required-file list in the theme schema decides whether absence is an error).

### 1.5 Marks and speed classes

| Mark | Meaning | Runs in stage |
|---|---|---|
| (none) | unit, boundary, validation; each < 1 s | 1-3 |
| `replay` | golden replays, one hash seed | 4 |
| `hashseed` | spawns subprocesses with `PYTHONHASHSEED` 0 and 4242 | 4 |
| `swap` | theme-swap determinism (5 seeds x 60 turns x 3 themes) | 5 |
| `sim` | economy simulator, 60-turn scripted builds | 5 |
| `combat` | combat harness, matrix | 6 |
| `soak` | AI-vs-AI full games | 6 (nightly for the long set) |
| `perf` | benchmarks | 7, advisory on shared runners (see 11) |

### 1.6 Naming and style
- Test names state behaviour: `test_<unit>_<condition>_<expected>` (project rule).
- Arrange-Act-Assert structure.
- One assertion theme per test; parametrise instead of looping inside a test, so a failure names its theme/variant/seed.
- Every failing assertion message carries a path (file + JSON path, or module + line) in the style of the validator (TA 3.4).

---

## 2. Core purity and boundary tests

These run in stage 1 (no game execution), take well under 5 s, and block merge. They read **real source** with `ast`, never regexes alone, then add a few text lints for things `ast` cannot see.

### 2.1 Import-graph test: `test_boundary_core_imports`

Fixture: `import_graph()` parses every `.py` under `conquest/` with `ast.parse`, collecting `Import`/`ImportFrom` (including relative imports resolved to absolute module names, imports inside functions, `try/except ImportError` blocks, `importlib.import_module("literal")` and `__import__("literal")` calls).

| Test | Assertion |
|---|---|
| `test_core_imports_only_allowed` | Every import in `core/` resolves to: the standard-library allow-list (below), `conquest.core.*`, or `conquest.rules.*` (loaded ruleset objects). Nothing else. |
| `test_ai_imports_only_core_and_rules` | `ai/` imports only the same set plus `conquest.core` public API. |
| `test_core_and_ai_never_import_presentation` | No import of `conquest.themes`, `conquest.locale`, `conquest.assets`, `conquest.app`, `conquest.ui`, `conquest.presentation`, or any module that those import transitively. Transitive closure is computed on the graph; the failure message prints the shortest chain. |
| `test_core_does_not_import_ai` | `core` never imports `ai` (CR C-1; GDD 6.2). |
| `test_ui_and_app_may_import_core_but_not_reverse` | Direction check: the edge set from `core` to `{ui, app}` is empty. |
| `test_dynamic_import_is_banned_in_core_and_ai` | No `importlib`, `__import__`, `exec`, `eval`, `compile` calls with non-literal arguments in `core/` or `ai/`. |
| `test_no_conditional_pygame_import_anywhere_in_core` | Covered by the first test, listed so the intent is explicit. |

Standard-library allow-list for `core/` and `ai/` (data file `tests/boundary/stdlib_allow.json`, reviewed on change): `dataclasses`, `enum`, `typing`, `functools`, `itertools`, `collections`, `collections.abc`, `types`, `fractions`, `decimal` (only if used for integer math; default off), `hashlib`, `json` (only inside `core/serialize.py`), `bisect`, `heapq`, `operator`, `math` (only `isqrt`, `gcd`, `lcm`, `comb`; a separate test below checks which names), `re` (validators only), `copy` (tests flag `copy.deepcopy` use in hot paths as a warning), `struct`, `abc`, `__future__`.

### 2.2 Forbidden capabilities in `core/` and `ai/`

| Test | What it detects | How |
|---|---|---|
| `test_core_has_no_pygame` | `pygame`, `pygame_ce`, `sdl2` imports | import graph (2.1) plus a text grep for the names, to catch a vendored copy |
| `test_core_has_no_wall_clock` | `time.time`, `time.monotonic`, `time.perf_counter`, `time.sleep`, `datetime.now`, `datetime.utcnow`, `date.today`, `os.times`, `time` module import at all | `ast` walk of attribute chains and imports; `time` is not on the allow-list so the import already fails |
| `test_core_has_no_random_module` | `import random`, `from random import ...`, `secrets`, `os.urandom`, `uuid.uuid4`, `numpy.random`, `Random(` | `ast`; also scans string literals ending in `.random` inside `importlib` calls |
| `test_core_has_no_file_io` | `open(`, `pathlib` use, `os.*` file calls, `shutil`, `tempfile`, `sqlite3`, `socket`, `urllib`, `http`, `subprocess`, `print(` and `input(` calls | `ast`; the one exception is `core/serialize.py`, which may use `json` on **strings** only (no file objects): the test asserts `serialize.py` never calls `open` either, because the app layer does the file write |
| `test_core_has_no_environment_reads` | `os.environ`, `os.getenv`, `sys.argv`, `locale`, `platform` | `ast` |
| `test_core_has_no_global_mutable_state` | module-level `list`, `dict`, `set` literals assigned to non-`UPPER_CASE` names, `global` statements, class attributes with mutable defaults | `ast`; constants must be tuples or `MappingProxyType` |
| `test_core_math_names_are_integer_safe` | `math` attribute names outside `{isqrt, gcd, lcm, comb}`; calls to `round`, `float(`, `**` with a non-literal negative or float exponent, `/` true division, float literals | `ast`; floats are allowed only in `core/` modules listed in `tests/boundary/float_allow.json` (expected empty) |
| `test_core_dataclasses_are_frozen` | every `@dataclass` in `core/` has `frozen=True`; no `__setattr__` override; fields use tuples or `Mapping`-typed frozen containers | `ast` |
| `test_apply_order_never_mutates` | deep-snapshot test: serialise state before and after `apply_order` and `advance` for 500 fuzz orders; the input object tree compares equal and no object identity of a shared container is reused after change | runtime, `fuzz` fixture |

### 2.3 No set iteration: `test_no_unordered_iteration`

GDD 18 and CR H-8(a): never iterate a `set` or `frozenset` (or a dict whose insertion order came from hashing). Static analysis is imperfect, so use three layers.

1. **AST rule A (iteration over a set-typed expression).** Flag `for x in <expr>`, comprehension generators, `list(<expr>)`, `tuple(<expr>)`, `next(iter(<expr>))`, `min/max` without `key` on equal elements, `sum` of floats, `"".join(<expr>)`, star-unpacking, when `<expr>` is: a set display or comprehension; a call to `set(`/`frozenset(`; a `.keys()`, `.values()`, `.items()` of a name known to be built from a set; or a name annotated `set[...]`, `frozenset[...]`, `Set[...]`, `AbstractSet[...]`. Allowed form: `sorted(<expr>)`, `sorted(<expr>, key=...)`, `len`, `in`, `any`, `all`, `<expr> <= <expr>` set algebra that returns a bool.
2. **AST rule B (set-typed fields).** Any dataclass field in `core/` annotated with a set type is a failure: state uses tuples or sorted tuples. (Set algebra may be used on temporaries.)
3. **Runtime sentinel.** In test mode, `conftest.py` installs a `SetIterGuard`: `core` is imported with `builtins.set`/`frozenset` replaced inside the `core` package namespace by subclasses whose `__iter__` raises `UnorderedIterationError` unless the caller frame is inside `sorted(`. (Implemented by patching the names in each `core` module's globals after import; `sorted` is exempt because it consumes the iterable inside C code without a Python frame, which the guard detects by checking `sys._getframe(1)` is not in `core`.) Every other test in `tests/unit/core`, `determinism` and `sim` runs with the guard on. A violation fails any test, not only this one.
4. **Self-test (planted violation).** `test_set_iteration_lint_catches_planted_code` runs rule A on three strings of Python source held in the test (a set loop, a comprehension over a frozenset field, `next(iter(s))`) and asserts three findings; and runs it on three compliant strings (`sorted(s)`, `len(s)`, `x in s`) and asserts zero findings.

### 2.4 Randomness and clock **allow-list of entry points**

Only `core/rng.py` may compute draws (blake2b or SplitMix64 over integers); only `app/` may read the clock, and only for UI animation. Tests:

- `test_only_rng_module_hashes`: `hashlib` is imported only in `core/rng.py`, `core/hashing.py` (state hash) and `core/rules_hash.py`.
- `test_rng_call_sites_pass_stream_and_key`: every call of `draw(`/`draw_range(` in `core/` and `ai/` has at least four arguments and the `stream` argument is a literal from the registered stream list or a `stream_for(...)` helper call; no call passes a bare module-level counter.
- `test_cosmetic_stream_is_not_read_by_core`: the name `rng_cosmetic` and the module `cosmetic` appear in no file under `core/` or `ai/` (P-9). Also a runtime test: call `new_game` and `advance` with the cosmetic stream monkeypatched to raise; no raise.

### 2.5 Data-file boundary

- `test_rules_files_contain_no_theme_vocabulary`: scan all keys and string values under `rules/core/` and `rules/variants/` for **any** label present in **any** shipped theme's base-locale `roles` table that is not itself a role id (for example the strings "Fort", "Farm", "Gold" as a value or key). Comparison is whole-word, case-insensitive; role ids (`bld.garrison`) are excluded, as is any `_note` key. This is the TA/CR C-2 test "a theme word appears in `core/` or `data/` keys".
- `test_rules_files_contain_no_presentation_keys`: no key in the set `{label, name, icon, sprite, glyph, color, sound, flag, palette, font, locale, text}` exists anywhere under `rules/`.

### 2.6 Planted-violation self-tests (so the boundary tests can fail)

`tests/boundary/test_boundary_self.py` builds a temporary copy of a miniature package tree in `tmp_path` (never the real tree) with one planted file per rule: `import pygame`, `import time`, `import random`, `open("x")`, `from conquest.themes import x`, `import importlib; importlib.import_module(name)`, a mutable module global, a `for k in some_set:` loop, a non-frozen dataclass. The test runs each boundary check function against that tree and asserts the expected finding, and runs each against a clean tree and asserts none. The boundary checks are written as functions taking a root path for this reason.

---

## 3. Determinism

All hold for any ruleset+variants combination; parameterise over `rules_neutral`, `rules_mvp`, and one hook-enabled variant if present.

### 3.1 Counter-based RNG: `core/rng.py` unit tests (GDD 18, CR H-8b)

Draw API under test (shape only): `draw(seed, stream, turn, key) -> int` and a bounded helper `draw_range(seed, stream, turn, key, lo, hi)`.

| Test | Assertion |
|---|---|
| `test_draw_is_pure` | same arguments give the same result across 1000 calls and across a re-import of the module |
| `test_draw_depends_on_every_argument` | changing any one of `seed`, `stream`, `turn`, `key` changes the output for at least 99.9% of 10,000 random argument tuples (a deliberately weak collision bound, no dependence on float math) |
| `test_streams_are_independent` | the sequence of draws for stream `combat:<id>` is byte-identical whether or not any number of draws were made on `ai:<player>`, `economy`, `worldgen`. Implementation of the test: record stream A; interleave 1..N draws on stream B; record A again; compare |
| `test_removing_an_ai_draw_does_not_move_combat` | run a fixed battle fixture twice, the second time with the AI planner's number of draws changed by monkeypatch; the battle outcome is identical (this is the exact failure CR H-8b described) |
| `test_draw_range_is_unbiased_enough` | bounded draw over 120,000 draws into range [0, 9] has each bucket within 5% of the mean (fixed seed; deterministic, so not flaky) |
| `test_draw_range_bounds_inclusive_exclusive` | documented bound semantics: no value `< lo`, none `>= hi` over 10,000 draws; `lo == hi - 1` always returns `lo` |
| `test_draw_range_handles_huge_and_negative_inputs` | seeds and keys of 2^63 - 1, 0, and negative values give integers in range and do not raise |
| `test_golden_draws` | 32 known `(args -> value)` pairs stored in `golden/rng.json`. This pins the algorithm: any change to the hash construction fails the test, which is intended (it also changes every replay) |
| `test_stream_names_are_registered` | all stream names used in source are in a registry list; unknown names raise at call time |
| `test_no_float_in_rng` | the return type is `int` (never `float`, never `bool`) |

### 3.2 Integer percent math and the floor helper (CR H-8c)

Source of truth: one helper (e.g. `core/imath.py`) with `pct(value, percent)`, `per_mille(...)`, `scale(value, num, den)`, and `floor_div`.

| Test | Assertion |
|---|---|
| `test_floor_helper_rounds_toward_negative_infinity` | table of 40 cases including negatives: `floor_div(-7, 2) == -4`, `scale(-7, 1, 2) == -4`, `pct(-1, 50) == -1` |
| `test_floor_helper_is_the_only_rounding_site` | `ast` search of `core/` for `//`, `round(`, `int(` on a division, `math.floor`, `math.ceil`: all occurrences are inside the helper module or listed (with a reason) in `tests/boundary/rounding_allow.json` |
| `test_percent_chain_floors_once` | `(a * p1 * p2) // 10000` equals the helper's chain for 10,000 random triples; "floor once at the end" (06 H3 x movement setting: "multiplied as integers, one floor at the end") |
| `test_movement_setting_ratios_are_rational_pairs` | Easy 3/2, Normal 1/1, Difficult 2/3 stored as integer pairs; applying each to 1..50 movement points gives the stored golden table (CR H-8c) |
| `test_modifier_clamp_is_integer_percent` | the productivity formula (GDD 8.4) fed worked example 1 (a coin-extractor landing exactly on -100%) returns an output of exactly 0, and example 2 returns the stored integer; both examples are fixtures in `fixtures/rules/econ_examples.json` |
| `test_interest_uses_per_mille_and_cap` | 5% interest on 1000 for 50 turns, with and without the cap tunable, equals stored integer sequences (no float compounding) |
| `test_rules_loader_rejects_float_rates` | a rules file with a rate written as `0.05` where an integer percent is required is a load error with a path |

### 3.3 Hash-seed independence: `test_replay_identical_under_two_hash_seeds` (GDD 18, CR H-8a)

Mechanism: the test spawns **two subprocesses** (`sys.executable -m conquest.tools.replay <replay>`) with `PYTHONHASHSEED=0` and `PYTHONHASHSEED=4242` (a third optional value `random`), each printing the per-turn `rules_state_hash` list as JSON. The parent test compares the lists byte for byte and also compares to the golden hash list (3.4). Parameterise over every golden replay.

Extra tests:
- `test_state_hash_independent_of_dict_insertion_order`: build the same state with fields inserted in shuffled orders (fixture helper with a seeded `random.Random`, test-only code), hash both, equal.
- `test_world_generation_identical_under_two_hash_seeds`: same two-subprocess pattern for `worldgen(seed)` on 5 seeds at size 80 and 128; compare the serialised terrain and the discovery list.
- `test_ai_plan_identical_under_two_hash_seeds`: same pattern for `plan(view, rng)` over a recorded mid-game view.
- `test_hash_seed_runner_really_varies_hash`: sanity check that the harness works: a probe subprocess prints `hash("conquest")` under both seeds and the test asserts the two values differ (otherwise the whole test is vacuous).
- `test_planted_set_order_dependence_is_detected` (self-test): a fixture module (outside `core/`) whose function returns `",".join(some_set_of_strings)` is run through the two-seed harness and the harness must report a difference for it.

### 3.4 Golden replays and state hashes

A **replay** is `{ruleset, variants, match settings, seed, orders: [per turn: [(player, order)]] }`. The runner applies orders, calls `advance` until the next input, and records `rules_state_hash` at the end of every turn (and at turn 0).

| Golden | Content | Turn count |
|---|---|---|
| `g1_explore_found` | scout/found/build opening, no combat | 25 |
| `g2_economy_60` | the scripted 60-turn build (section 9) | 60 |
| `g3_trade_and_recruit` | patron trade, shipments, recruit | 40 |
| `g4_field_battle` | one field battle, retreat and morale | 30 |
| `g5_raid_and_capture` | a raid then a capture | 40 |
| `g6_ai_vs_ai_seed7` | recorded orders of an AI-vs-AI game | 80 |
| `g7_save_midgame` | replay with save/load at turn 15 and 30 | 45 |
| `g8_hooks_default` | the full neutral replay re-run with all hook keys present at default (see 6.5) | 60 |

Tests:
- `test_golden_replay_hashes_match` (parameterised): the hash list equals `golden/hashes/<name>.json`.
- `test_golden_update_is_explicit`: a failure message includes the command `python -m conquest.tools.update_goldens --reason "<text>"`; the tool refuses to run without `--reason` and appends `{date, reason, old_hash_prefix, new_hash_prefix}` to `golden/CHANGELOG.json`. A CI check (stage 1) fails a PR that changes `golden/hashes/*` without a matching new `CHANGELOG.json` line.
- `test_state_hash_covers_declared_fields_only`: the set of field paths fed to the hash equals a list in `golden/hash_fields.json`. Bookkeeping fields that must not move the hash are excluded (the style used by the sibling project's `jumps`), and cosmetic fields (generated names) are listed under `excluded_cosmetic`. A new field fails until classified.
- `test_hash_changes_when_any_hashed_field_changes`: for each hashed field path, perturb it in a copy and assert the hash changes (mutation coverage of the hasher).
- `test_replay_is_resumable_after_each_phase`: stop at each `phase` boundary (orders, ai_planning, battles(i), economy, done), serialise, reload, continue; per-turn hashes equal the uninterrupted run (CR C-1; GDD 6.2).
- `test_replay_order_independent_where_simultaneous`: GDD 6.1 says all players plan from the start-of-turn snapshot. Swap the order in which two players' orders for the same turn are submitted; the end-of-turn state hash is identical except for documented alternating tie-breaks (movement execution alternates by turn parity: the test names that exact exception and checks it flips with parity).
- `test_ai_plan_independent_of_human_moves_this_turn` (CR H-1): AI plan from the snapshot is identical whatever the human did earlier in the same turn.

### 3.5 Two further determinism properties
- `test_save_load_roundtrip_hash_equal`: for 20 random mid-game states from fuzzed play, `hash(load(save(s))) == hash(s)`; JSON key order shuffled before load does not matter.
- `test_replay_cross_platform_note`: not a test; a CI matrix entry (section 12) runs `golden` on Linux and macOS and (if available) Windows with the same expected hashes. Integer-only math makes this feasible.

---

## 4. Theme-swap determinism

### 4.1 The proof test (TA 2.10; GDD 2 rule 4)

`test_theme_swap_determinism` (mark `swap`):
- Parameters: seed in `{S1..S5}` (fixed list in `tests/themes/seeds.json`), theme in `{colonial, <second shipped theme>, __empty__}` where `__empty__` is the manifest-only fixture, plus every other shipped theme discovered by glob.
- Arrange: `rules = load_rules(neutral + mvp)`. Match settings: size 64, 2 AI players, difficulty normal, seed `S`.
- Act: run 60 headless AI-vs-AI turns; at the end of every turn record `rules_state_hash`. The driver is **app-layer code**, so it does load the presentation (this is the point), but passes only `state` and `rules` to `core`.
- Assert: for each seed, the 61 hashes under every theme are equal element by element. Failure message names the first differing turn, and prints the field-level diff using the hash-field list.
- Also assert: the **list of emitted typed events** per turn is identical across themes (events are ids + payloads, not text).

Companion tests:
- `test_presentation_is_built_after_and_never_passed_to_core`: monkeypatch `core.advance` to a wrapper asserting none of its arguments is an instance of `Presentation` (or contains one).
- `test_empty_theme_is_playable_headless_and_renders_fallbacks`: with `theme_empty`, `load_presentation` succeeds, every role label resolves to the engine neutral base label (not `[key]`), every asset key resolves to a shape fallback, and the audio resolver returns silence without a raised exception. Step 6.2 chain of TA is tested stage by stage with synthetic themes that break each link.
- `test_theme_switch_mid_game_changes_no_state`: build state, switch theme through the app's switch function, assert `state` is the identical object and its hash is unchanged (decision D-10).
- `test_cosmetic_name_pool_size_does_not_change_the_game`: run two copies of the same theme where one has a name pool of 3 and one of 3000 names; per-turn hashes are equal (P-9 in TA 4). The generated names themselves differ and are excluded from the hash (see 3.4).
- `test_longer_theme_text_cannot_change_rules_hash`: `rules_hash` computed with the 3 themes is the same (the rules loader never sees a theme).

### 4.2 Save under one theme, load under another: `test_save_reload_other_theme`

Arrange: play 20 turns under theme A (colonial), save. Act: load under theme B (`second`), under `__empty__`, and under a theme id that is **not installed** ("missing theme").
Assert: state hash unchanged for all three; presentation differs; the missing-theme load falls back to the neutral base presentation without an error (TA 3.5 "never fatal"); the save's `presentation` block records the original theme and is **not** rewritten by loading; saving again under B writes B in `presentation` and the identical `state` section.
Additional:
- `test_save_with_mismatched_rules_hash_runs_migration_or_refuses`: tamper `rules.hash` in a save; load yields a clear error code (not a traceback), or, if a migration table entry exists for that save version, the migrated state loads and the hash is recomputed.
- `test_newer_save_version_never_overwritten` (GDD 17): a save with `save_version` greater than the code's is refused for writing; its bytes on disk are untouched after an attempted autosave.
- `test_damaged_save_keeps_bak`: a truncated JSON save triggers a `.bak` copy and a typed load error.
- `test_locale_switch_does_not_touch_state`: same as theme switch, for locale.

---

## 5. Theme validation tests

Runs for every discovered theme (parameter `theme_id`) in stage 2 with `--strict` semantics (TA 3.4 steps 6-7), plus negative tests against `theme_broken_*` fixtures. The validator under test is `themes/validate.py` (file + JSON path in each message). Policy table (TA 3.4): missing base-locale label = error; missing label in a non-base locale = warning; missing picture = warning (fallback exists); unknown role id = warning; strict CI turns configured errors into failures, warnings are reported but do not fail, except where this plan marks a warning budget.

### 5.1 Coverage of every role id

`test_theme_coverage[theme]` (TA 2.10):
- Every role id enumerated from the **merged** `ruleset.json` (resources, terrain, buildings, units, archetypes in use, faction slots, npc, landmarks if enabled, discoveries if enabled, abilities if enabled, score categories if enabled) has a `roles.json` binding with `name` key, `glyph` (an existing painter id), and a base-locale label (string or plural map with `other`).
- Every faction slot in `faction_slots` has a name and an adjective key and a colour; colours of different slots are pairwise distinguishable (colour distance above a stored threshold, and each slot also has a flag or pattern id: GDD 16, no colour-only signalling).
- Every `ev.*` and `err.*` id in `events.json` has a template in the base locale; every `warn.*` id likewise; every `ui.*` key referenced by the UI source code (collected by `ast` for `pres.text("...")` literals) exists in the neutral base locale (so an empty theme is complete).
- Level arrays: roles with 4 levels have glyph/picture fall-back chains for each level (the level badge comes from code, so no per-level label is required; test asserts the fallback resolves, not that art exists).
- Variants: coverage is checked per **(theme, variant)** pair: a variant that adds roles (`adds_roles`) makes a theme without bindings fail (TA 3.2). The test enumerates `VARIANTS x THEMES`, and for variants that add no roles asserts the coverage set equals the variant-free set.
- Reverse check (warning): a theme binding for a role id that is not in the ruleset yields a warning, and the test asserts `warnings == allowed_unknown_roles` where the allow list lives in the theme folder.

Negative: `theme_broken_missing_role` removes one role binding; expect an error whose path ends with that role id.

### 5.2 No ruleset keys in a theme file: `test_theme_has_no_rules[theme]`

- Schema allow-list: every key of every JSON file in a theme folder is in the theme schema's key set for that file. The set of banned ruleset keys is **derived** from the loaded ruleset (all key names appearing in `rules/core/*.json` that are not also legitimate presentation keys) and unioned with the explicit list from TA 2.4: `cost, output, move, hit, effects, level_cap, recruits, supports, capacity, attack, strength, price, rate, modifier, tax, interest, combat, hp, range`.
- Scan is recursive and covers `theme.json, roles.json, factions.json, calendar.json, names/*, text/*, flavour/*, shapes.json, assets/manifest.json, audio/manifest.json`, `lint.json`. A numeric field named like a ruleset key fails even if the value is harmless.
- Values: any string value that parses as an expression over role ids (for example `"bld.food*3"`) fails; numeric values are allowed only in keys declared numeric by the schema (`palette alpha`, sizes, durations).
- Negative: `theme_broken_has_cost` adds `"cost": {...}` to `roles.json`; the validator rejects, not ignores. Variation: ruleset key hidden in `_note`-free nested depth 5 is still found.
- Self-test: the validator is run on a synthetic theme containing every banned key once; it reports exactly that many findings.

### 5.3 Locale placeholder rendering with sample payloads

Source of payload schemas: `events.json` (each event/error id lists its payload fields and types).

- `test_every_template_renders_with_sample_payload[theme,locale]`: for every `ev.*`, `err.*`, `warn.*` template in every locale, build the sample payload by type (`int -> 3`, `res -> "res.coin"`, `unit -> "u.line"`, `base -> a name string with a quote and a non-Latin character`, `faction -> "f1"`, `turns -> 15`, `season`, `site`, ...). Render. Assert: no exception; no remaining `{`, `}` outside escaped braces; output non-empty; output does not equal the bare key.
- `test_placeholder_set_matches_payload_schema`: the set of `{names}` in each template is a subset of the payload fields of that event (a template using `{foo}` that the payload lacks is an **error**, TA 5 "rejects a placeholder the payload does not define"). A template that omits a payload field is allowed.
- `test_missing_payload_field_is_a_typed_error_not_a_crash`: render with a payload lacking a required field returns `[key]` plus one logged warning (fallback chain end), never raises.
- `test_format_spec_support`: `{n, number}` renders with the locale's grouping for 0, 1, 999, 1000, 1234567; unknown format specs are a validator error.
- `test_brace_escaping`: a literal brace in a template is written as `{{`/`}}` and renders as one brace.
- `test_templates_are_whole_sentences`: no template key ends with a space or begins with lowercase conjunction fragments (heuristic), no template is built by concatenation in code: an `ast` lint over `app/` and `ui/` flags `+` between a `pres.label(...)` call and a string literal (P-14).
- `test_player_typed_text_is_never_translated_or_executed`: a base name containing `{res}` and `%s` renders verbatim.

### 5.4 Plural categories

- `test_plural_maps_have_other`: every plural map has `other` (mandatory); keys are within `{zero, one, two, few, many, other}`; extra keys fail.
- `test_plural_rules_for_shipped_locales`: for each shipped locale, a stored table of `(n -> category)` for `n in 0..30, 100, 101` equals the plural-rule table's output (the table is stdlib-implemented per TA 5). Include English (`one`: n==1), and one locale with `few`/`many` (for example a Slavic or Arabic fixture locale in `fixtures/` even if not shipped) to keep the code general.
- `test_label_count_uses_plural`: `pres.label("u.ranged", count=0|1|2|5)` returns the matching form; a missing category falls back to `other` with no warning, a missing `other` is a validator error.
- `test_irregular_plural_words`: a fixture locale label "Artillery" with identical `one`/`other` forms renders correctly at counts 1 and 3.
- `test_gender_and_article_extra_forms`: `{"other": "...", "_gender": "m"}` is accepted; unknown `_` keys fail.

### 5.5 Fallback chain tests (text, assets, audio)

Tests mirror TA 6.2 step by step with synthetic themes: `test_text_fallback_chain` (active locale, default locale of theme, parent theme, engine base, `[key]` plus one warning), `test_asset_fallback_chain` (manifest PNG, level-dropped key with a level badge, parent theme, role glyph painter, generic category painter, magenta checker plus one logged warning per key), `test_audio_fallback_chain` (manifest, parent, engine default cue, silence, one log line, no exception), `test_theme_extends_cycle_is_an_error` (A extends B extends A), `test_asset_cache_cleared_on_theme_switch`, and `test_asset_size_matches_ruleset_footprint` (P-13: a picture whose pixel size contradicts the ruleset footprint is a validator error; fallback shapes are drawn from the footprint and always pass). Provenance: `test_every_manifest_entry_has_provenance_in_strict` (source, licence, author).

### 5.6 Pseudo-locale +30% length

`theme_pseudo` is generated by `tools/make_pseudo_locale.py` from the neutral base locale: map ASCII letters to accented look-alikes, pad each string to **130%** of its length with a filler token that is visible (for example trailing `~`), keep placeholders and plural structure intact, wrap each string in `[` `]` to expose truncation.
- `test_pseudo_locale_preserves_placeholders`: the placeholder set per key equals the base locale's.
- `test_no_ui_string_is_clipped_in_pseudo_locale`: using a **headless font metrics** object (pygame is allowed in this app-layer test via the dummy video driver `SDL_VIDEODRIVER=dummy`), lay out every screen's static strings and every `ev.*` message with sample payloads; assert each string either fits its container or wraps to at most the container's declared max lines; no string is silently cut (TA 5 "no string is cut off silently"). Containers and max lines are data in `ui/layout.json`.
- `test_pseudo_locale_covers_every_key`: no missing key relative to the base locale (it is generated, so this guards the generator).
- `test_longest_string_per_container_report`: emits a table (warn-only) of the five tightest containers for reviewers.

### 5.7 Font glyph coverage

- `test_font_has_glyphs_for_locale_sample[theme,locale]` (TA 5, 3.4 step 7): render `text/<locale>.json["_sample"]` with the theme's font for that locale; every codepoint in the sample (and in every string of the locale, a broader second test) must be present in the font's cmap. Use `fontTools` only if allowed; otherwise use pygame's `Font.metrics(text)` and fail on `None` entries (dependency decision D-13: prefer pygame metrics, no new dependency).
- `test_sample_string_covers_locale_alphabet`: `_sample` includes every letter used by any string in that locale (computed set difference is empty), so the sample cannot hide a missing glyph.
- `test_font_fallback_builtin`: a theme declaring `"_fallback": "builtin"` and a locale with no font entry resolves to the built-in font and still renders the neutral base locale.
- `test_pseudo_locale_glyphs`: the accents used by the pseudo-locale generator exist in the built-in font (otherwise the pseudo-locale test cannot work).
- Negative: `theme_broken_font` uses a font that lacks one sample glyph; expect an error naming the codepoint.

### 5.8 Presentation sanity (TA 3.4 step 7)

- `test_palette_contrast_text_pairs`: WCAG-style contrast ratio for each declared text/background pair at or above a stored threshold (ASSUMED 4.5 for body text); `test_adjacent_terrain_colours_distinguishable`; `test_owner_colours_distinguishable_with_deuteranopia_simulation` (simulate by a fixed matrix; owner colours need a second channel: flag or pattern id must exist).
- `test_flag_or_pattern_present_for_every_slot` (GDD 16).

---

## 6. Variant validation tests

Machinery under test: `rules/variant.py` (apply typed ops), the full ruleset validator, `rules_hash`. Paths are JSON Pointers over the merged document (06 H0.4 / TA-1) `[VOLATILE: names of top-level members]`.

### 6.1 Typed operations only

- `test_variant_schema_rejects_unknown_op`: ops other than `replace`, `add`, `remove` fail with the file and JSON path (`merge`, `patch`, `eval`, `copy`, `move`, `test` each separately).
- `test_variant_op_requires_pointer_and_value_shape`: `replace`/`add` need `value`; `remove` must not have `value`; `path` must be a JSON Pointer string; a dotted path such as `factions.profiles.fp.banker.effects` is rejected with the hint to use `/` form (TA-1: dotted role ids are ambiguous).
- `test_variant_cannot_contain_code_or_expressions`: string values are never evaluated; a value like `"__import__('os')"` stays an inert string and is rejected by the type check of the target slot.
- `test_variant_op_order_matters_and_is_stable`: applying ops in listed order twice gives the same result; shuffling ops that touch the same pointer changes the result (documented), so a hash difference is expected, not a bug.
- `test_variant_applies_to_check`: `applies_to` ruleset id and major mismatch is a load error; `min_minor` above the ruleset minor is a load error with a clear message.
- `test_variant_may_not_add_role_ids_without_declaration`: an `add` that introduces a new role id into `/ruleset/roles/**` without `adds_roles` fails; with `adds_roles` the variant loads and every theme lacking those roles fails coverage (5.1).
- `test_variant_cannot_touch_theme_or_match_settings`: pointers into `/themes`, `/match`, `/settings` are unresolvable and rejected.

### 6.2 Dangling references after ops, and re-validation

Run the **full** ruleset validator after all ops (TA 3.2, 3.4 step 3). Negative fixtures (`variant_broken_*`), one defect each, each asserting the validator error code and JSON path:

| Fixture | Defect |
|---|---|
| `remove_referenced_building` | removes a building role still named by a unit's `recruited_at` |
| `remove_cost_resource` | removes a resource id still used in a cost |
| `replace_with_wrong_type` | replaces a list with a number |
| `level_array_wrong_length` | a 4-level building gets 3 cost entries |
| `unknown_role_in_effect` | an effect names a role that does not exist |
| `archetype_loses_required_field` | removes `start` from an archetype |
| `slot_not_covered` | removes a faction slot from `slots` coverage |
| `region_rule_names_missing_building` | hook key references a missing role |
| `scenario_requires_disabled_feature` | the `mvp`-plus-`natives` case (TA 3.4 step 5): must be an **error**, not a silent no-op |
| `hook_off_scenario_field_present` | scenario uses a hook field while the hook is disabled: load error at step 5 (06 H0.3) |

- `test_variant_revalidated_after_overlay[variant]` (positive, parameterised on every shipped variant): after `apply`, `validate(merged)` returns no errors and no warnings.
- `test_every_shipped_variant_pointer_resolves`: each op pointer resolves (for `replace`/`remove`) or has an existing parent (`add`) `[VOLATILE per R-10]`.
- `test_variant_stack_order_and_conflict`: stacks `[mvp, equal-nations]` and `[equal-nations, mvp]` either give the same hash (commutative) or one of them is rejected by a declared conflict rule; the outcome per pair is pinned in `golden/hashes/stack_pairs.json`.
- `test_variant_superset_relation_is_checked_where_declared`: a variant declaring `"includes": ["equal-nations"]` must contain every op of the included variant (06 R-9 pattern: "the set of `equal-nations` ops is a subset of bd1971's ops"). Generic form: any `includes` list is verified op by op.

### 6.3 Rules-hash stability

- `test_rules_hash_golden[variant]`: for neutral and every shipped variant stack, `rules_hash` equals the golden value. Failure message prints how to update (same tool as 3.4, with reason).
- `test_rules_hash_independent_of_key_order_and_whitespace`: rewrite the JSON files with shuffled key order, other indentation and CRLF; hash unchanged.
- `test_rules_hash_independent_of_note_keys`: adding or editing any `_note` field does not change the hash; the canonical form strips `_note` recursively.
- `test_rules_hash_changes_on_any_semantic_edit`: mutation sweep: for 50 sampled leaf values in the merged rules, change each by one and assert the hash changes.
- `test_rules_hash_independent_of_version_string` (06 H0.1): changing the ruleset version string, with no other change, leaves `rules_hash` unchanged; the version is still recorded in the save.
- `test_variant_ids_and_versions_are_in_the_hash` (TA 3.1): same ops under a different variant id or variant version changes the hash.
- `test_theme_and_match_settings_not_in_rules_hash`.
- `test_hash_stable_across_python_versions`: CI matrix runs this test on 3.10 and the newest supported version with the same golden.

### 6.4 Hooks at default leave neutral hashes unchanged (06 H0.1)

- `test_hooks_default_elision_hash_equal`: neutral ruleset plus the full `hooks.json` with every key at its declared default has the **same** `rules_hash` as the ruleset with no `hooks.json`. The canonical form omits every default-valued key recursively, including objects whose members are all default (the test builds the nested all-default object explicitly).
- `test_hooks_default_state_hash_equal`: replays `g1..g7` with the hooks file present at defaults give the per-turn `rules_state_hash` identical to the goldens recorded **before** hooks existed (`g8_hooks_default` is the same replay as `g2_economy_60` plus the hook keys). New state fields (`site_id`, `start_base_count`, `no_base_turns`) are omitted from `rules_state_hash` when absent or default.
- `test_non_default_hook_value_changes_rules_hash` (each hook, one parametrised case per hook key): flipping one key from default changes `rules_hash`, so elision is not hiding real changes.
- `test_state_field_present_only_when_non_default`: with the hook off, the serialised state has none of the hook fields; with it on and non-default values, they are present and hashed.

### 6.5 The test that pins the defaults: `test_hook_defaults_frozen` (06 H0.1, R-1)

Data file `golden/hook_defaults_v1.json` (committed, reviewed on change) lists every hook key path and its declared default for ruleset major 1. The test:
1. loads the schema's declared defaults;
2. compares them to the golden file path by path: equal set of paths and equal values; any added key must come with a default entry and must evaluate to "neutral behaviour";
3. asserts the golden file's header major equals the ruleset major, and fails with a "bump major" message if a default changed within the same major.
Companion: `test_each_hook_default_is_neutral_by_behaviour`: for each hook, run the short fixture scenario for that hook with the hook at default and without the hook key; the resulting state hashes are equal (behavioural check beyond the hash elision).

### 6.6 Per-hook generic acceptance (neutral content, one parametrised family)

For each hook H1-H7 (names per 06 `[VOLATILE]`), one test module `tests/variants/test_hook_<name>.py` uses a tiny variant in `fixtures/variants/` and a tiny scenario, never the bd1971 data:
- off => no effect (6.4); on => the effect in the spec's acceptance bullet; invalid scenario field => load error naming the path; determinism: two-seed run (3.3); no random draws (`test_hook_draws_no_random_numbers` runs the hook with the RNG patched to raise).
- Ordering and ties: tie-breaks by list index, then slot id (`f1 < f2`), then `(y, x)`: a test builds equal-cost candidates and checks the chosen one.
- AI visibility: the hook's public data appears in `KnowledgeView` and its hidden data does not (fog fairness by type).
- Interaction tests (06 7.2): `H3 x movement setting` uses one floor at the end (integer test); `H3 x H6` order (bonus before clamp, season after) shown by a fixture where swapping order changes the result; `H2 x H4` ids survive capture; `H4 x H1` arrivals reset the clock in the documented step order.

---

## 7. "No civilian state" allow-list test

Placement: the **machinery** is generic (a snapshot-and-allow-list framework, `tests/guards/`), because the same pattern guards any variant that makes a promise about state shape (06 TA-3: "the per-variant allow-list pattern"). The **instance** for the bd1971 variant lives in `tests/test_bd1971_no_civilian_state.py` with data in `tests/allowlists/bd1971_state.json` and `tests/allowlists/bd1971_review.json` (06 5). This section specifies both, including how it composes with the errata `[VOLATILE: 06 5 is being edited; ER C.1 supplies the post-switch text]`.

### 7.1 What the test is for
The design promise is "no civilian state in the simulation": no field, event, resource, order, target kind or text key can represent or count non-combatants, their deaths, reprisals, famine, tribute or loot, and personnel can only change through enumerated causes. The test proves **absence by closed set**, not by searching for bad things only.

### 7.2 Exactly what it asserts (ten checks; numbering follows 06 5 so reviewers can cross-read)

Arrange: merged rules = `conquest-core` + the variant under test (+ `equal-nations` where the variant stacks it); scenario = the variant's shipped scenario; a game produced by `new_game` on that scenario; plus the soak run for the dynamic checks.

1. **Closed role sets (fields of the rules).** The merged rules' role lists equal exactly: the six `res.*`, the twelve `bld.*`, the eight `u.*`, the terrain roles, archetypes in play (a single archetype for this variant), and feature flags: `npc.settlement`, `arch.indigenous`, discoveries, diplomacy, tribute, scoring all `false`; native settlements maximum `0`. Any added role id fails. (The expected values are read from `bd1971_state.json["roles"]`, so the neutral suite has no variant-specific literals.)
2. **Key-path snapshot (rules).** The set of all JSON key paths in the merged rules (role-id path segments replaced by `*`, `_note` keys excluded) equals `bd1971_state.json["rules_paths"]`. A new path fails until it is added to the allow-list **and** a review entry `{path, reviewer, date, reason}` exists in `bd1971_review.json`. Sub-test: every allow-list entry has a review entry, and no review entry is orphaned.
3. **State-field snapshot.** The set of field paths of `GameState` and every nested dataclass, discovered by walking the dataclass types and, for dynamic `dict`/`tuple` payloads, by walking the instance produced in the variant's game (wildcarding ids), equals `bd1971_state.json["state_paths"]`. A new field fails the same way (allow-list + review entry). Walking both types and instances catches a field hidden behind `Any`.
4. **Events.** The set of `ev.*` ids **reachable** under the variant, each with its payload field names, equals `bd1971_state.json["events"]`. Reachability = ids emitted in the soak run (check 7) united with the ids marked reachable by the static emitter table (`core/events.json` joined with the rules' enabled features). Per ER C.1: the **neutral shortage outcome is exactly one event id** (the engine's own, via `rules.events.shortage_id`), it carries `cause == "shortage"` and no other value, and no event payload anywhere has a field whose name contains a forbidden token (check 5). No death-of-people, tribute, NPC, discovery or score event id is reachable. `[VOLATILE: if the owner restores C1/C2, add ev.pop_departed with reason in {shortage, capture} per the earlier 06 text]`
5. **Forbidden-token scan (second net; the allow-list cannot override it).** Case-insensitive scan of every rules key, state field name, event id, payload field name, error code, effect kind, predicate kind, order kind and attack-target kind for the token list in `tests/allowlists/forbidden_tokens.json`: `civilian, villag, refugee, resident, inhabitant, citizen, townsfolk, starv, famine, massacre, reprisal, atrocit, loot, plunder, hostage, prisoner, execut, tribute, kill_count, body_count, death_toll`. Exceptions need a review entry naming the exact string. ER C.1 flags the real collision: if the neutral engine names its warning `warn.starvation_spiral` or an emigration/starvation pair, `starv` fails here; resolution is the neutral rename (`warn.food_shortage`, one death-neutral shortage event) **or** a reviewed exception for that exact id. The test prints which resolution is in force.
6. **Target kinds and raid outcomes.** Attack target kinds equal exactly `{unit, base}`; raid outcomes equal exactly `{stock_seized, building_level_lost, site_taken, base_destroyed}` (read from the variant allow-list); every scenario site flagged as a real place has `raid_can_destroy == false` (the flag name per ER B.2 #7 `[VOLATILE]`).
7. **Personnel accounting (property, soak).** 20 fixed seeds x the variant's `max_turns`, AI vs AI (both slots driven by the AI). For every base and every end of turn, every decrease of `res.pop` is matched by **exactly one** of: a recruit or founder cost paid that turn; a militia strength loss in a battle that turn (GDD 11.6 rate); the neutral shortage loss (rate and rounding of GDD 8.5); a change of owner by capture (in which case `res.pop` is unchanged by the capture and counts for the new owner; if capture damage applies to `res.pop` it is listed as its **own** cause, otherwise the test asserts capture leaves it unchanged). No other decrease exists. Faction totals move only by these causes. (ER C.1 rewrite.)
8. **Runtime features.** In the same soak: zero NPC settlement entities, zero discovery objects on the map, zero tribute or diplomacy orders accepted, no score fields in state; the shortage rate equals the neutral 5% (read from rules) and emits only the allow-listed event (ER C.1: replaces "`shortage.kind == departure`").
9. **No allied units.** Every scenario arrival for the faction under test contains only roles in its archetype's `can_field` plus the scout, founder and commander roles; the timed-effect kind list equals the allow-list (`{patron_link_cut, panic_modifier}` in the shipped variant); in the soak, every unit owned by that faction was created by its own recruit order or by its own scenario arrival (provenance field checked).
10. **Theme-side smoke.** The base-locale labels for the population resource, the militia unit and the core building contain none of the forbidden tokens and no label contains the word forbidden by the theme's own lint list (colonial vocabulary in a non-colonial pack, 8.1). Full theme linting belongs to section 8.

Pass = all ten, plus the self-tests below.

### 7.3 Planted-violation self-tests (the guard must be able to fail)

Parametrised, each in a **scratch copy** (monkeypatched schema, temp rules tree; the real code is never edited):

| Planted violation | Expected red check |
|---|---|
| add a dummy `civilians` field to a state dataclass | 3 (state-field snapshot) and 5 (token) |
| add `ev.village_burned` to the events table with payload `{base}` | 4 and 5 |
| add an `npc.settlement` role id | 1 |
| set `features.tribute` to `true` | 1 and 8 |
| add a rules key `loot_rate` | 2 and 5 |
| add an attack target kind `settlement` | 6 |
| add an order kind `levy_tribute` | 5 and 6 |
| make `res.pop` shrink by an unaccounted 1 each turn in a copy of the shortage routine | 7 |
| add a score field `kills` to state | 3, 5 and 8 |
| add an arrival of allied units for the faction | 9 |
| add a review entry **without** an allow-list entry | 2 (orphan review) |
| add an allow-list entry **without** a review entry | 2 (missing review) |
| add a forbidden token to a base-locale label for the militia unit | 10 |
| add a forbidden token to an allow-list entry (the allow-list cannot override check 5) | 5 |

Also: `test_guard_passes_on_clean_tree` (the unmodified scratch copy is green, proving the planted reds are caused by the plant), and `test_selftests_cover_every_check` (the set of checks that appear in the "expected red" column equals the set `{1..10}`; a check without a self-test fails the suite).

### 7.4 How it composes with the errata's extra assertion

ER C.1 point 3 adds one assertion to check 4 and rewrites check 7: "exactly one shortage event id is reachable, it carries no `cause` value other than `shortage`, and no event payload anywhere has a field whose name contains a forbidden token". Composition rules for the plan:
- The extra assertion is implemented inside check 4 as sub-assertion 4c; its self-test (a second shortage event id, or `cause: "starvation"`, or a payload field `starved`) is added to the table in 7.3 and must turn 4 red.
- Check 7 (accounting) is what makes the rule-level promise real when the stand-down switch does not exist: it proves there is no hidden, reprisal- or famine-like decrease of personnel. 4c and 7 are independent: 4c covers events and names, 7 covers numbers over time; each must fail on its own plants.
- Check 5 interacts with the neutral rename: the test reads the neutral ids from the rules, so a rename does not require editing the guard.
- The restated guarantee goes into the test module docstring and its failure messages: "Rule-level and tested: no civilian state. Text-level and validated: stand-down on shortage; nothing said about personnel on capture." The text-level half is **not** claimed by this test; it is covered by the theme lint (8.2).

### 7.5 Maintenance protocol
- Allow-list files are sorted JSON, one path per line, so diffs are reviewable.
- A change to `bd1971_state.json` or `forbidden_tokens.json` requires a changed `bd1971_review.json` in the same PR (CI stage 1 file-pair check).
- The allow-list is generated once by `python -m conquest.tools.snapshot_allowlist --variant <id>` and then edited by hand only through review entries.

### 7.6 Generic reuse
`tests/guards/allowlist_framework.py` exposes `check_closed_set(name, actual, expected_file, review_file)` so any future variant that promises a shape (for example "no score state") gets the same three behaviours (snapshot, review pairing, token net) with only data files. A neutral test `test_every_variant_declaring_a_guard_has_guard_files` fails if a variant lists `guards: [...]` and a file is missing.
`[VOLATILE: if the owner restores the shortage and capture switches, re-add: check 4 ev.pop_departed{reason in {shortage, capture}}, check 7 captor pop equals 0, check 8 shortage.kind == departure.]`

---

## 8. Theme text lints that are theme-parameterised

Lints are **engine code** (the linter) driven by **pack data** (`themes/<id>/lint.json`). The neutral suite contains no word list. The pack's lint file is validated against a schema; the engine ships a base list of lints that apply to every theme (8.4).

### 8.1 Lint file contents (schema)

```
{
  "forbidden_words":   [ {"pattern": "...", "mode": "word|stem|regex", "reason": "...", "except_contexts": [ ... ]} ],
  "required_phrases":  [ {"key_glob": "ev.shortage*", "any_of": ["..."], "reason": "..."} ],
  "forbidden_by_key":  [ {"key_glob": "...", "pattern": "..."} ],
  "name_pool_rules":   {...},
  "figure_rules":      {...},
  "allowed_contexts":  [ {"name": "...", "key_glob": "...", "allows": ["pattern ids"]} ]
}
```
The linter runs over every string of every locale of the pack: `text/*.json` (plural forms included), `names/*.json`, `flavour/*.json`, `roles.json` labels, briefings, `_sample`, asset alt text, and calendar format strings.

### 8.2 Forbidden words per theme (examples of how a pack uses it)

- `test_forbidden_words_absent[theme]`: for every pattern, the match count outside allowed contexts is zero. Example packs: a pack set in another era lists `colony`, `settler`, `tax` (as theme-vocabulary leaks), a pack that avoids a sensitive trope lists its own stems. Matching: `word` = whole word, case-insensitive, Unicode-normalised (NFKC), with simple plural/possessive stripping; `stem` = prefix match on word boundary; `regex` = Python `re` with a timeout guard (patterns validated for catastrophic backtracking by a length cap and a no-nested-quantifier lint).
- `test_forbidden_words_catch_obfuscation`: the linter normalises and also matches a pattern separated by zero-width characters, hyphens or soft hyphens, and homoglyph substitutions from a small table (self-test with planted `c0lony`, `col​ony`).
- `test_neutral_base_locale_is_clean_for_every_theme_lint`: the engine neutral base text has none of the words any shipped theme forbids, except through declared exceptions; the empty theme therefore stays inert (this is why "colony" in a neutral label is checked against theme lists rather than hard-coded).
- `test_forbidden_words_do_not_hit_ruleset_ids`: `bld.core` and other ids are not text and are exempt; `test_ids_never_appear_in_visible_text` is the converse (no raw role id or `{braces}` in rendered output).
- `test_required_phrases_present`: where a pack declares a required phrase for a key glob (for example shortage text must contain a "return home"/"stood down"-style phrase per ER C.1, V-04), every matching key's every plural form and locale contains at least one `any_of` phrase; the phrase list is pack data. ER C.1 adds that this text must not add a claim the rules cannot back: `test_text_makes_no_claim_the_rules_do_not_make` uses the pack's `forbidden_by_key` entries for the shortage and capture templates (for example no "nobody was harmed" claim on a shortage key, no statement about where personnel go on a capture key).

### 8.3 Real personal names

- `test_no_real_personal_names_in_game_text[theme]`: the pack provides `real_names.json` (a list of real-person name tokens for that setting, given only as hashed or plain tokens as the pack owner prefers; the file itself is excluded from shipped assets) and the linter scans all strings, **name pools**, generated-name patterns (pattern x word expansion, so a generated "Given Family" cannot equal a listed person), calendar strings and alt text. Match on full name, surname alone for listed surnames, and initials+surname.
- `test_generated_names_never_collide`: expand every name pattern (bounded) and compare with the real-names list; generation uses the cosmetic stream, but the test enumerates the full product so chance does not matter. Pools with fewer than the pack's minimum generated names fail (`name_pool_rules.min_generated`, the ER P0-6 V-18 semantics: count generated names, pattern x words, not raw words).
- Exceptions: a historical figure may appear only in an encyclopedia-class entry tagged `topic: "history"` and `reviewed: true` in `allowed_contexts` (ER A and D contrast spec text, where people may be named, with in-game unit and UI text, where they may not). The linter checks the tag and that the entry is `ship: false` until its reviewer field is filled.
- Self-tests: a planted full name in a button label, a name pool entry, a briefing, and an alt text each produce a finding; the same name in a tagged encyclopedia entry produces none and one `needs_review` note.
- Ruleset side: `test_no_real_person_in_rules_or_scenario_ids` scans rules, variants, scenario ids and `_note` fields against the same list through the pack (06 hard rule: no real person in the ruleset side).

### 8.4 Single-figure casualty and strength numbers (engine-wide base lint, pack-tunable)

Behaviour from ER P0-6 V-07 (volatile in detail): flag a number of 1,000 or more, or "million"/"lakh"/"crore"/"billion" word forms, in a sentence that also contains a people, force or loss word (list in `lint.json` so each pack and language extends it: `people, refugee, troops, soldiers, fighters, personnel, men, killed, dead, deaths, died, casualt, martyr, victim, prisoner, strength`), when the sentence is outside a `figures` block. Not counted: years matching `\b1[89]\d\d\b`, distances and heights with a unit (`m`, `km`), and ids.
- `test_no_unblocked_single_figure`: zero findings; `figures` blocks must carry per-claim `source`, `attribution`, a `status` field, and a range (`low`, `high`) or the explicit `consensus: true` (at least two independent sources, ER P0-6), and a block stays `ship: false` until each claim's status is `checked`.
- `test_figures_are_ranges_with_attribution`: a claim with `low == high` is allowed only inside a multi-claim block where each claim is attributed.
- `test_no_casualty_or_strength_number_in_rules_events_or_payloads`: structural check on the ruleset side (06 5 check 5 for the token set; this adds a numeric check): no event payload field is named with a count of killed/dead/lost people, and no UI template contains a numeric placeholder bound to such a field.
- `test_number_words_are_matched`: digits, spelled-out numbers ("one million", "ten thousand"), and locale digit variants (full-width, Arabic-Indic, Bengali digits) are normalised before matching (planted-value self-tests for each).
- `test_kill_counters_do_not_exist`: no HUD template has a placeholder bound to a kill, casualty or enemy-lost counter (`forbidden_by_key`).

### 8.5 Allowed-context rules

A forbidden pattern may legitimately appear in a **context**. Contexts are declared in the pack (`allowed_contexts`) and must be narrow:
- A context is `{name, key_glob, allows: [pattern ids], requires: {tag, reviewed}}`; matching on the key, not on free text.
- The linter reports, for every allowed hit, the context that allowed it, so reviewers see a table `pattern x context x count`. `test_allowed_contexts_are_used`: a context that allows nothing in the current text is flagged (dead exceptions rot).
- `test_allowed_context_cannot_widen_global_rules`: the engine base lints in 7.2 check 5 (forbidden tokens in rules/state/event identifiers) cannot be relaxed by a theme lint file; a context that tries to match a rules path is a lint-file schema error.
- `test_context_requires_review_metadata`: `reviewed: true` requires `reviewer` and `date`; missing metadata fails.
- Example (generic): the pattern for a sensitive term is allowed only in the remembrance/encyclopedia key group, only when the entry has `ship: false` or `reviewed: true`, never in `ev.*`, `err.*`, `warn.*`, `ui.btn.*`, or unit labels.

### 8.6 Linter correctness
- Unit tests for the matcher (stemming, normalisation, boundaries, Unicode, regex guard).
- `test_lint_is_deterministic`: findings are sorted by (file, JSON path, pattern); two runs produce byte-identical reports; the report is an artifact in CI.
- `test_lint_runs_on_all_locales_and_plural_forms`: counts of strings inspected equals the counted strings in the pack (guard against skipped files).

---

## 9. Economy and pacing simulator tests

Tool under test: the headless economy simulator (`sim/econ.py`, uses `core` only) and its scripted 60-turn build orders (GDD 20; Phase 2a exit criteria). Fixtures: `fixtures/scenarios/econ_flat_64.json` (flat map, fixed start) and `fixtures/builds/*.json` (scripted order lists, named predicates for conditions).

### 9.1 Pacing targets (GDD 4; tunables read from rules, not duplicated)

`test_pacing_targets_met[build, seed]` (mark `sim`): scripted balanced build, normal difficulty, 64x64, seeds S1..S5. Assertions use the target table in `rules/core/pacing.json` (ASSUMED values from GDD 4: first colony by turn 3; second colony by turn 10 +/- 3; Center L2 by turn 12 +/- 4; first battle turn 25-40; game end turn 80-150 for AI-vs-AI):
- first colony founded turn <= target;
- second colony founded within [target - tol, target + tol];
- Center L2 reached within the band; Center L4 turn recorded for the anti-runaway reference (9.3);
- the printed pacing curve (stocks, population, buildings per turn) is saved as a CI artifact and compared with `golden/pacing_curve_<build>.json` for **drift** (warn when any point moves by more than 10%, fail when any target breaks).
Companion tests:
- `test_pacing_targets_read_from_data`: tolerances and turns come from the tunables register; editing a tunable changes the test bounds (no literals in the test file).
- `test_opening_survives_with_variant_modifiers` (parameterised on variants that change early economy): for every shipped variant stack the scripted opening founds its first base by the pacing target, no starvation spiral warning before turn 20, labour stays non-negative (06 7.2: "the simulator must show the opening base survives"). Variant-specific numeric tunings (for example a season food multiplier) are covered by `test_schedule_weighted_average_in_band`: the average over the variant's schedule lies within the band declared in the variant's `_tuning` data (06 3.1: 98-104).
- `test_failure_states_each_have_one_warning` (GDD 12): starvation spiral, labour collapse after recruiting, a mine at -100%, losing the last colony, stalemate: each fixture triggers exactly one UI warning id, and the warning id exists in the base locale.
- `test_modifier_examples_exact` (CR H-2): worked example 1 gives exactly -100% and zero output; example 2 gives the stored output; terrain falloff `1/(1+d)` normalised; modifier clamp bounds enforced; labour shortage lowers output proportionally.
- `test_specialisation_bonus_cap`: default 3% per extra building up to 30%; region or other bonuses never exceed the specialisation cap (06 3.1 note) `[VOLATILE]`.

### 9.2 Preview equals real turn (GDD 8.7)

`test_preview_equals_next_turn` (property test; mark none, default; `hypothesis` is a dev dependency only after the owner's yes (D-13) so a seeded stdlib fallback generator is specified):
- Generator: random legal colony states from a seeded stdlib generator (100 cases per CI run, 2000 nightly): random terrain around the colony, building mix and levels within caps, stocks, population, queued builds, queued trades with delays.
- Act: `economy.preview(colony)` on the state; then `advance` one full turn with **no new orders** and no other-side interaction (battles disabled in the case generator).
- Assert: for each stock and population the preview value equals the real next-turn value exactly (integers). When another system could change the outcome (a raid, a trade arriving, a scenario arrival), the generator marks the case "external" and the test asserts only that the preview includes the external known effect or the preview **flags** itself as incomplete. Shrinking: on failure the generator reduces building count, then levels, then stocks; the failing seed is printed.
- Equal for all variants in the catalogue (parameterised on the shipped stacks), including hooks that change production (season multiplier, region bonus); this is the test that catches "season after clamp" order bugs (06 7.2 H3 x H6).
- `test_preview_is_the_function_the_turn_uses`: `ast`/runtime check that `end_turn` calls `economy.preview` (or both call one shared function), not a duplicate; mutation test: a monkeypatch that adds 1 to the preview's result makes the property test fail.
- `test_preview_has_no_side_effects`: previewing 1000 times leaves the state hash and the RNG counters unchanged.

### 9.3 Anti-runaway acceptance test (CR H-4; GDD 9)

`test_pure_trade_colony_not_runaway` (mark `sim`):
- Arrange: two scripted builds on identical maps and seeds: **balanced** (food, extractors, housing, converter, church in a standard ratio) and **pure coin-and-trade** (coin extractor spam plus Dock plus import orders every turn, maximum allowed by the rules).
- Act: simulate until each reaches Center L4, or 150 turns; record the turn number.
- Assert: `turn_pure >= turn_balanced * (1 - 0.25)` (pure may be at most 25% faster; the 0.25 is read from `pacing.json["runaway_margin_pct"]`), and if pure never reaches L4 in 150 turns the test passes with a note.
- Variant sweep: repeat for every shipped stack and for each difficulty; failures are listed per cell.
Supporting unit tests (the mechanisms the acceptance test depends on):
- `test_price_rises_one_percent_per_unit_bought_and_decays_twenty` (integer arithmetic, exact table over 10 turns);
- `test_import_cap_scales_with_dock_level` (20/40/80/160 defaults read from data; a trade above the cap is clipped with a typed message, not an exception);
- `test_sell_price_below_buy_price` (spread is at least the declared ratio for every commodity);
- `test_interest_cap_binds` (GDD 10: cap per colony per turn applies; 50 default; at cap 0 interest off): a 1000-coin hoard grows by exactly the capped integer each turn for 100 turns; the unbounded run is not reachable;
- `test_interest_off_by_variant_produces_zero_growth` (variants that empty the profile);
- `test_tax_rate_tunables_apply_and_zero_means_no_tax`;
- `test_hoarding_is_not_dominant` (nation-level extension of the runaway test): a scripted "hoard and wait" player versus a balanced player in AI-vs-scripted soak does not win more than the pass band allows.

### 9.4 More pacing and economy properties (cheap, run every PR)
- `test_costs_deducted_at_order_time_and_refund_rules` (GDD 8.6): halting construction is a full refund; demolish refunds the declared percent next turn; cancelling an upgrade or recruit before end turn is a full refund; patron trade sold goods leave at order time, gold arrives after the delay, removal before end turn is a full refund (CR M-4).
- `test_no_building_exceeds_center_level` and `test_center_cannot_be_demolished`.
- `test_population_never_negative`, `test_stocks_never_negative` (property under fuzzed orders).
- `test_growth_stops_at_housing_cap`; `test_church_diminishing_returns_100_75_50`.
- `test_recruit_schema_is_uniform` (CR M-3): table-driven over every building: `recruits: {role: {min, max}}`; Housing and Center min == max == level; Tavern and Fort min 1, max level.
- `test_register_covers_every_tunable` (GDD 19, CR M-17): load `tunables`, assert each leaf key has an assumption-register entry and vice versa; also assert the register contains each `ASSUMED` key introduced by shipped variants (06 3.1: "every row goes into the register").

---

## 10. Combat harness tests

Tool: `combat/harness.py` built from the **Combat Demo** rules (GDD 11.7): point-buy 5-40 per side, line 1 point, shock 2, ranged 2, commander attack point 3, all units level 4, terrain cosmetic. Built before the AI, headless, no map, uses the real `core.battle` (no duplicate rules).

### 10.1 Combat Demo point-buy: `test_combat_demo_point_buy`

- `test_point_costs`: line 1, shock 2, ranged 2, commander attack point 3 (read from rules); all units level 4.
- `test_budget_range_enforced`: budgets below 5 or above 40 are rejected with a typed error; the exact boundaries 5 and 40 are accepted; an unaffordable roster is rejected; a roster of exactly the budget is accepted; leftover points are allowed.
- `test_capacity_rules`: 6 slots per square (line 1, shock 2, ranged 2); a roster that cannot be placed legally in the 3x4 board is rejected or auto-placed per declared rule.
- `test_roster_generation_is_deterministic`: `random_roster(budget, seed)` is a pure function of its arguments through the combat stream.
- `test_terrain_is_cosmetic_in_demo`: the same roster and seed give identical results on every terrain choice.
- `test_demo_uses_real_battle_code`: monkeypatch `core.battle.resolve_attack` with a counter; the demo calls it (no shadow implementation).

### 10.2 Battle rules unit tests (the harness depends on these)
Table-driven, with exact expected values from stored fixtures:
- Board 3 columns x 4 rows, no diagonals; reserves; home row; attacker moves first; a unit adjacent to an enemy can only move to squares not adjacent to another enemy.
- `test_attack_definition` (CR M-2): attacks per side-turn = `attacks_per_leader_level[level]` (1 without commander); each participant joins at most one attack per side-turn.
- Odds (read from `combat.json`): base hit 0.30/0.32/0.28 as integer per-mille, +5 points per extra flank square, +5 per extra unit type, charge +10, clamp 5-95; tests use per-mille integers; the clamp holds for a 20-flank fixture.
- Morale (CR M-6): panic rolled once per damaged unit after each attack; retreat from the home row is blocked (+1 damage, stays); Charisma/Reputation 0-10 clamps; reputation +1/-1 per battle.
- Win conditions: enter enemy flag square, eliminate all, force retreat; parting shot on retreat; defending-colony retreat loses the colony (raid: destroyed).
- Raid (GDD 11.6): from round 3 the attacker takes 10% of the remaining stockpile each round; from round 5 one building level per round and the attacker gains half its value; forts harder to destroy (multiplier read from data); retreating defenders reappear next turn. Round-by-round table over a 10-round fixture.
- Capture: needs a battle win; one random building loses one level (combat stream); half of each stockpile kept; cross-archetype capture forbidden returns a typed error and raid remains available.
- Colony defence: militia counts by Center level, extra ranged per fort, best commander leads, lost militia reduce population by 5 per strength point, lost fort ranged do not.
- Property: battle always terminates within `max_rounds` (declared), never produces negative strength, units never leave the board illegally, and the same `(battle_id, seed)` replays identically (stream `combat:<id>` only).

### 10.3 Early-rush test (GDD 20)
`test_early_rush_cannot_take_level1_colony`:
- Attacker: 2 level-1 line units plus a level-1 commander; defender: a level-1 colony with its militia (and a level-1 fort in the second parametrisation), default archetype; 200 battles with seeds `0..199`.
- Assert: the attacker takes the colony in none of the 200 battles **and** the number of attacker wins as a percentage is below the declared threshold (`rush_win_pct_max`, ASSUMED, default 0), reporting the empirical rate in the failure message. If the rules expect rare attacker wins, the threshold is data, not a literal.
- Variant sweep: every shipped stack (variants that change hit odds, healing or patron timing must keep it). Also `test_rush_with_one_extra_unit_has_nonzero_chance` (sanity: the harness can show an attacker win when the numbers allow, so a flat 0% is not a harness defect).

### 10.4 Nation/profile matrix pass band (GDD 10, CR H-5)

`test_profile_matrix_pass_band` (mark `combat`, nightly for N large; PR run uses a reduced N):
- Fixtures: the shipped faction profiles of the active ruleset (neutral set `fp.*`) and archetypes; the harness runs profile A vs profile B in the Combat Demo with symmetric rosters and a fixed pair of budgets (10, 25, 40), N seeds per ordered pair (N = 200 per PR, 2000 nightly, both read from `pacing.json`), alternating attacker/defender.
- Assert: for every unordered pair the win share of A over B lies in `[35%, 65%]` (band read from data). The failure message prints the full matrix with confidence intervals (Wilson interval, integer arithmetic where possible; floats are allowed in test code only, never in `core`).
- Economy-coupled profiles (interest, patron delay, movement) are not decided by combat; `test_non_combat_bonus_profiles_are_covered_elsewhere` records them in the matrix as "n/a" and points at the AI-vs-AI soak (below).
- `test_rating_value_matters` (GDD 10: about 0.05-0.08 hit chance per rating point): increasing the War College rating by one on a profile with a rating bonus increases its win share in a symmetric fixture by a measurable minimum (stored; guards against rating becoming irrelevant, CR H-5).
- Variant `equal-nations` makes all combat profiles identical: `test_equal_nations_matrix_is_flat` asserts every pair's win share is within the statistical noise bound (|share - 50%| below 3 sigma).
- Soak (stage 6): `test_ai_vs_ai_matrix_soak`: for each pair of profiles 20 full games on 64x64; assert no exception, no stalemate beyond the declared limit, each game ends within the declared turn bound (80-150 typical, hard bound 300), and aggregate win share within a wider band `[25%, 75%]` (looser, since economy and AI quality matter).

### 10.5 AI battle driver
- `test_auto_resolve_equals_ai_driven_battle`: the quick-resolve and the interactive path through the same `core.battle` yield the same result for the same orders; quitting mid-battle auto-resolves deterministically (GDD 17).
- `test_ai_tactics_use_same_rules`: AI orders are legal under `apply_battle_order`; illegal order injection is rejected (fuzz).

---

## 11. Performance gates (GDD 18; CR M-15, M-16)

Mark `perf`. Benchmarks use the project's own timer in `tests/perf/` (test-only code may read the clock; `core` may not, section 2.2). Median of 5 runs after 2 warm-ups; p95 over 200 calls for per-call gates.

| Gate | Fixture | Threshold | Notes |
|---|---|---|---|
| `apply_order` p95 | 64x64 map, 200 units, mid-game state | < 2 ms | GDD 18 |
| `end_turn` (full `advance` through economy, AI excluded) | same | < 300 ms | GDD 18 |
| `end_turn` at 128x128 and 256x256 with proportional units | scaled | recorded, not gated; threshold added after the first measured baseline (decision) | ASSUMED, flagged |
| Frame budget: map render | 64x64: 16 ms; 256x256: 33 ms | per GDD 14.3; dummy video driver; chunk surfaces pre-rendered per zoom | gates app/ui layer, runs in stage 7 |
| Fog update per unit move | 256x256 | single bulk copy of an 8 KB bitmap (functional assertion: no per-tile copies) + time recorded | CR M-16 |
| `worldgen` | sizes 80, 128, 256 | recorded; hard cap per size set from the first baseline | |
| Save/load | 64x64 mid-game | recorded; hard cap set from baseline | |
| Preview | 1000 previews of a large colony | recorded | |

Rules:
- `test_perf_baselines_file_exists`: `perf/baseline.json` holds measured numbers per runner class; the gate compares with `max(threshold, baseline * 1.5)` only when the baseline file says the runner class is the same; otherwise the test is **advisory** (reports, does not fail) on shared CI runners, and **blocking** on the self-hosted or local reference configuration. This avoids flakiness from noisy runners.
- Functional complexity checks (blocking, noise-free) that stand in for timing: `test_apply_order_copy_cost_is_linear_not_quadratic` (count of container copies via instrumented frozen helpers, for 100 vs 200 units: ratio close to 2), `test_fog_is_bytes_not_tuple_set` (type assertion), `test_world_shared_by_reference_across_states` (identity assertion on the terrain `World` before and after `apply_order`).
- Memory: `test_state_size_bound` serialised state at 256x256 below a stored bytes bound (advisory).
- Profiling artifact: on failure the job uploads a `cProfile` dump of the slowest call.

---

## 12. CI pipeline stages and order

Principle: fail fast and cheap first; expensive and noisy last. A stage runs only if the previous blocking stage passed. All commands are plain `python -m pytest ...` with marks; no new tool is required beyond pytest and pytest-cov (D-13).

| Stage | Name | Contents | Typical time (ASSUMED) | Merge effect |
|---|---|---|---|---|
| 0 | Lint and static | formatting, type check (stdlib `compileall` if no type checker is approved), `python -W error -c "import conquest"` on min and max Python | < 30 s | **Blocks** |
| 1 | Boundary and hygiene | section 2 (imports, no set iteration, no clock/random/IO, frozen dataclasses), planted-violation self-tests, golden-change/CHANGELOG pairing, allow-list/review pairing, `test_skips_are_declared` | < 20 s | **Blocks** |
| 2 | Data validation | ruleset load and integrity, all variants (section 6.1-6.3), all themes strict (section 5), scenario validation (TA 3.4 steps 1-7), tunables register coverage, text lints (section 8), pseudo-locale layout, font coverage | < 60 s | **Blocks** (errors); warnings print and are budgeted (see below) |
| 3 | Unit and property (fast) | `tests/unit`, RNG tests, integer math, hash/golden-format tests, preview-equals-real-turn (100 cases), combat rule tables, hook unit tests, allow-list guard tests (section 7, static parts) | < 90 s | **Blocks** |
| 4 | Determinism | golden replays, two-`PYTHONHASHSEED` subprocess tests, save/load round-trip, resumability, hooks-default hash equality | < 3 min | **Blocks** |
| 5 | Swap and simulate | theme-swap determinism (5 seeds x 3 themes x 60 turns), economy simulator pacing, anti-runaway acceptance, preview property (extended) | < 6 min | **Blocks** |
| 6 | Combat and soak | combat harness, early-rush, profile matrix (PR size), allow-list soak checks 7-9 (20 seeds), AI-vs-AI soak (reduced) | < 8 min | **Blocks** for correctness assertions; the profile matrix pass band **blocks on PRs that touch combat data, profiles or variants**, otherwise **warns** |
| 7 | Coverage and perf | coverage run with the 80% gate (section 13), perf benchmarks | < 5 min | Coverage **blocks**; perf **warns** on shared runners and **blocks** on the reference runner |
| Nightly | Long runs | matrix with N = 2000, soak 200 games, long property runs (2000 cases), three hash seeds, Linux + macOS (+ Windows if available), Python min and max | < 60 min | **Warns** (opens an issue); a nightly failure on `main` blocks the next release tag |
| Release | Strict | stage 2 with `--strict` including `PLACEHOLDER` rejection and `ship: false` entries excluded; review-log completeness; pack provenance check | < 2 min | **Blocks release** only |

Warning policy:
- Validator **errors** block; **warnings** do not, but each stage prints a count and a `warnings_budget.json` pins the count per theme: an increase fails the stage (so warnings cannot grow silently), a decrease prompts lowering the budget.
- Flaky policy: a test that fails then passes on rerun is reported as flaky and quarantined within 24 hours; **determinism, boundary and allow-list tests are never quarantined** (a flaky determinism test is a bug by definition).
- Required-check names are stable (`stage-1-boundary`, `stage-4-determinism`, ...) so branch protection can reference them.
- Dependency rule: the pipeline installs only approved dev dependencies (`pytest`, `pytest-cov`; any additions need the owner's yes, D-13). Property tests use a stdlib seeded generator unless `hypothesis` is approved.
- Artifacts uploaded: pacing curves, matrix table, lint report, coverage XML, perf JSON, failing-replay JSON with the first divergent turn.
- Local parity: `python -m conquest.tools.ci_local --stage N` runs the same stages locally.

---

## 13. Coverage plan and mapping table

### 13.1 Coverage gate (GDD 20: 80% minimum)
- Measurement: `pytest --cov=conquest --cov-branch --cov-report=term-missing --cov-fail-under=80` in stage 7, over unit, determinism, variants, themes, sim and combat tests (perf and nightly soak excluded from the gate so it is reproducible).
- Per-package floors (ASSUMED): `core` 90% lines and 85% branches; `ai` 80%; `rules`/`data` loaders and validators 90% (the validators are the project's safety net); `themes`/`locale`/`assets` 85%; `app` 70%; `ui` 50% (pygame-heavy code; covered through the dummy driver where feasible and by golden screenshots only if the owner approves). A floor failure blocks like the global gate.
- Branch coverage required for `core/rng.py`, `core/imath.py`, `core/hashing.py`, `rules/variant.py` (no uncovered branch allowed; each branch has a named test).
- Exclusions are explicit and counted: `# pragma: no cover` allowed only on `if __name__ == "__main__"`, abstract methods and defensive `raise AssertionError("unreachable")`; a boundary test counts pragmas and fails above a stored number.
- **Mutation spot-checks (monthly or on demand, not a gate):** a small mutation run on `core/imath.py`, `core/rng.py`, `rules/variant.py`, `core/economy.py` verifies the tests kill at least 80% of mutants; survivors are listed as backlog.
- Coverage of data, not just code: `test_every_rule_key_is_referenced` asserts every key in `rules/core/*.json` is read by some code path in the coverage run (instrumented loader records key reads) so dead tunables are found; unreferenced keys must be marked `reserved` (post-MVP hooks).

### 13.2 Test group to GDD section and risk

| Test group (plan section) | GDD / source | Risk covered | Severity if missed | Stage |
|---|---|---|---|---|
| 2.1-2.2 Import and capability boundaries | GDD 2 rule 1, 18; TA 2.10; CR C-1, C-2 | Theme or IO leaking into `core`; AI/core cycle; non-deterministic inputs | Critical | 1 |
| 2.3 No unordered iteration (static + runtime guard) | GDD 18; CR H-8(a) | Order differences between runs and machines | High | 1, 3 |
| 2.4-2.5 RNG call sites, cosmetic stream, data vocabulary | GDD 2 rule 6; TA P-9; CR C-2 | Name pool changes the game; theme words in rules | High | 1 |
| 3.1 Counter-based RNG | GDD 18; CR H-8(b) | AI change shifts combat rolls; golden tests break for unrelated reasons | High | 3 |
| 3.2 Integer math and floor helper | GDD 18, 8.4; CR H-8(c) | Rounding drift across refactors | High | 3 |
| 3.3 Two hash seeds | GDD 18, 20; CR H-8(a) | Silent nondeterminism | Critical | 4 |
| 3.4-3.5 Golden replays, resumability, save round-trip | GDD 6.2, 17, 20; CR C-1, M-12 | Pipeline bugs, save corruption, hash drift | High | 4 |
| 4 Theme-swap determinism, save across themes | GDD 2 rule 4, 17; TA 2.10, 3.5; decision D-10 | Theme is not really a skin | Critical | 5 |
| 5.1-5.2 Theme coverage and no-rules | GDD 2 rule 3, 19 step 6; TA 2.4, 2.10 | Missing labels; numbers hiding in themes | High | 2 |
| 5.3-5.4 Placeholders and plurals | TA 5, P-14 | Crashes and broken text in any locale | Medium | 2 |
| 5.5 Fallback chains | GDD 2 rule 5; TA 6.2 | Broken look with partial themes | Medium | 2 |
| 5.6 Pseudo-locale layout | TA 5, D-9, D-12 | Clipped text, layout assumptions | Medium | 2 |
| 5.7-5.8 Fonts, palette, flags | TA 5, 3.4 step 7; GDD 16 | Missing glyphs, colour-only signals | Medium | 2 |
| 6.1-6.2 Variant ops and dangling references | TA 3.2, 3.4; 06 H0.4 | Variant corrupts rules | High | 2 |
| 6.3 Rules-hash stability | TA 3.5; 06 H0.1 | Silent rules change; saves loading under wrong rules | High | 2 |
| 6.4-6.5 Hooks at default, defaults frozen | 06 H0.1, R-1 | New hooks change neutral behaviour | Critical | 2, 4 |
| 6.6 Per-hook acceptance and interactions | 06 H1-H7, 7.2 | Hook bugs, ordering errors | Medium | 3 |
| 7 No-civilian-state guard + self-tests | 06 5; ER C.1 | A promise about state shape erodes silently | Critical (reputational) | 3, 6 |
| 8.2 Theme-forbidden words and required phrases | TA 7, P-15; ER C.1, D | Wrong vocabulary, unsupported text claims | High | 2 |
| 8.3 No real personal names | ER D, P1-4; 06 hard rule | Names of real people in game text | High | 2 |
| 8.4 No single-figure casualty or strength numbers | ER A.6, P0-6 | Unsourced or contested figures | High | 2 |
| 8.5 Allowed-context rules | ER A, D | Exceptions rot or widen | Medium | 2 |
| 9.1 Pacing targets | GDD 4, 20 | Dull or broken early game | High | 5 |
| 9.2 Preview equals real turn | GDD 8.7, 20 | Forecast lies to the player | High | 3, 5 |
| 9.3 Anti-runaway | GDD 9, 10; CR H-4, H-5 | Dominant strategy found by AI and harness | High | 5 |
| 9.4 Order-time cost, refunds, caps | GDD 8.6; CR M-3, M-4 | Exploit and consistency bugs | Medium | 3 |
| 10.1-10.2 Combat Demo and battle rules | GDD 11, 11.7; CR M-2, M-6, M-7 | Combat unplayable or inconsistent | High | 6 |
| 10.3 Early rush | GDD 20 | Rush dominates the opening | High | 6 |
| 10.4 Profile matrix | GDD 10; CR H-5 | Unbalanced profiles | Medium | 6, nightly |
| 11 Performance | GDD 18, 14.3; CR M-15, M-16 | Unplayable at 256x256 | Medium | 7 |
| 12 CI order | GDD 20 | Late discovery of cheap failures | n/a | n/a |
| 13.1 Coverage and register tests | GDD 19, 20; CR M-17 | Untested code, undocumented ASSUMED values | Medium | 7 |

---

## 14. Open questions

1. **Shortage and capture switches (ER C.1).** Dropped on 2026-10-03. Confirm the neutral event naming (one death-neutral shortage event id and `warn.food_shortage`) or accept a reviewed exception for `starv`-containing neutral ids. The guard in section 7 reads ids from the rules, so either works; the choice must be made before the engine is coded.
2. **Where do per-variant guard files live?** This plan places `*.allow.json` beside the variant in `rules/variants/` and the bd1971 instance under `tests/allowlists/`. The owner or the build agent should confirm one rule (variant folder vs tests folder) so generic tests can discover guard files by glob.
3. **Lint data confidentiality.** A real-person name list (8.3) is itself sensitive and may be distributed with the repo. Options: a hashed token list (salted, case-folded) with a local-only plain list for reviewers, or keep the plain list in a private location. Decision needed.
4. **Dependencies.** `hypothesis` for property tests, `fontTools` for glyph coverage and `pygame-ce` itself all need the owner's yes (D-13). The plan specifies stdlib/pygame-metrics fallbacks so nothing blocks, at the price of weaker shrinking.
5. **Pass bands and thresholds are ASSUMED** (profile matrix 35-65% PR vs nightly N, rush threshold, runaway margin, perf numbers beyond the two GDD gates). First measured baselines should replace the guesses, and the register should record the change.
6. **Warning budgets.** Is a per-theme warning budget (section 12) desired, or should warnings never fail a stage? Proposed: budgeted.
7. **Platform matrix.** Is a Windows runner available? Integer-only math should make macOS/Linux/Windows hashes equal; CI cost vs value of the cross-platform nightly needs a decision.
8. **How strict is `--strict` for placeholders?** The release gate rejects PLACEHOLDER strings (06 4 validation note). Confirm that PR stages tolerate them and only the release stage rejects.
9. **Reviewer gates in CI.** `ship: false` / `reviewed: true` fields are enforced mechanically, but who may set them, and does CI verify the reviewer identity (a file listing reviewer ids)? Needs a process decision from the owner.
10. **Hook names and top-level document members** (06 H0.4, R-10) are proposals; the tests resolve them dynamically, but golden files (`hook_defaults_v1.json`, `rules_hash.json`) cannot be written until the ruleset author fixes them.
11. **Scenario and theme parameter explosion.** `THEMES x VARIANTS` can grow large; proposal: full cross-product only for coverage and hash tests (cheap), and one representative theme per variant for simulation tests. Confirm.
12. **UI testing depth.** `ui/` is pygame-heavy; the plan gates layout via the dummy driver and font metrics only. Whether to add golden screenshot tests (needs a stable renderer and the owner's approval of image fixtures) is open.
13. **Allow-list reviewer identity** (7.5): is `reviewer` free text, or must it match a maintained reviewers file? Matters for audit value.
14. **Mid-battle save policy** (GDD 17 auto-resolves remaining battles on quit): the resumability test (3.4) assumes the phase pipeline can be serialised at every phase boundary; confirm that saves outside the `orders` phase are test-only (autosave stays orders-only).
