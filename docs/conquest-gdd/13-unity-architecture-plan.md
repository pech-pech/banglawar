# 13 - Unity architecture and migration plan (engine-free C# core)

Status: **spec for the owner's review. No code, no installs, no project changes.** Date: 2026-10-03.
Inputs (read as data): [GDD.md](GDD.md) (GDD §n), [04-theme-architecture.md](04-theme-architecture.md) (TA §n), [05-critique.md](05-critique.md) (CR id), [bd1971/05-theme-pack-spec.md](bd1971/05-theme-pack-spec.md) (TP §n), [bd1971/06-variant-and-hooks-spec.md](bd1971/06-variant-and-hooks-spec.md) (VH §n / H1-H7), [bd1971/08-map-draft.md](bd1971/08-map-draft.md), [bd1971/10-test-plans-neutral-base.md](bd1971/10-test-plans-neutral-base.md) (TP10 §n), [bd1971/11-reviewer-plan.md](bd1971/11-reviewer-plan.md) (skimmed), and a read-only look at `~/Unity/My project`.

Tags: **VERIFIED-LOCAL** = read on this machine today; **DOCS** = stated by a Unity page cited here; **UNVERIFIED** = my understanding of Unity or .NET that I did not confirm against current documentation today (check before relying on it); **REC** = recommendation; **OWNER** = needs the owner's decision.

---

## 0. What is on this machine (VERIFIED-LOCAL)

| Item | Value |
|---|---|
| Unity editor installed | `6000.6.3f1` (revision 45d8eee7de74), in `/Applications/Unity/Hub/Editor/6000.6.3f1` |
| Build modules installed | `MacStandaloneSupport`, `WebGLSupport` (no Windows, Android or iOS module). Whether the Mac module includes IL2CPP is UNVERIFIED |
| .NET SDK (`dotnet`) | **Not installed** (`which dotnet` finds nothing) |
| `My project` editor version | `6000.6.3f1` |
| `My project` template | URP 3D sample: `Assets/Settings/{PC,Mobile}_RPAsset`, `PC/Mobile_Renderer`, `DefaultVolumeProfile`, `SampleScene`, `TutorialInfo`, `Readme.asset`, `InputSystem_Actions.inputactions` |
| `My project` direct packages | `com.unity.ai.assistant` 2.20.0-pre.1, `com.unity.ai.inference` 2.6.1, `com.unity.ai.navigation` 2.0.14, `com.unity.collab-proxy` 2.13.6, `com.unity.ide.rider` 3.0.38, `com.unity.ide.visualstudio` 2.0.26, `com.unity.inputsystem` 1.20.0, `com.unity.pipeline` 0.7.0-exp.1, `com.unity.render-pipelines.universal` 17.6.0, `com.unity.test-framework` 1.8.0, `com.unity.timeline` 6.6.0, `com.unity.ugui` 2.6.0, `com.unity.visualscripting` 1.9.12, plus built-in modules (including `tilemap`, `uielements`, `imageconversion`, `jsonserialize`, `vectorgraphics`, `physics2d`) |
| Resolved transitive packages (lock file) | `burst` 2.0.0, `collections` 6.6.0, `mathematics` 1.4.0, `shadergraph` 17.6.0, `ext.nunit` 2.1.0, `profiling.core` 1.0.3, `searcher` 4.9.5 |
| Not present | no 2D packages (2D Tilemap Editor, 2D Sprite, 2D Pixel Perfect), no Localization, no Newtonsoft JSON, no Code Coverage, no Addressables |
| Player settings | `apiCompatibilityLevel: 6` (the .NET Standard profile; mapping of the number is UNVERIFIED), `activeInputHandler: 1` (Input System only; UNVERIFIED mapping), `scriptingBackend` unset (default per platform), `webGLThreadsSupport: 0`, `webGLMaximumMemorySize: 2048` |
| Version control | `.plastic/` folder and `ignore.conf`: the project is under Unity Version Control (Plastic), not git |

What Unity says about this version (DOCS):
- Unity 6.6 was released 1 September 2026, is the **last feature release of the Unity 6 family**, and is a "supported release" until 6.7 (the LTS) arrives; 6.6 makes "reload scene only" (no domain reload) the default play-mode setting for new projects, adds native `Dictionary` serialization, Content Directories, a Build Analysis window and production-ready WebGPU (opt-in; WebGL stays the default). ([Unity 6.6 is now available](https://discussions.unity.com/t/unity-6-6-is-now-available/1735357))
- Unity 6.6-6.7 stay on **Mono, .NET Standard 2.1 API, C# 9**; CoreCLR is experimental there; Unity 7.0 moves to CoreCLR with .NET 10 and C# 14 and drops Mono and domain reload. ([CoreCLR, Scripting, and Serialization Update, June 2026](https://discussions.unity.com/t/coreclr-scripting-and-serialization-update-june-2026/1723299)). A news summary says .NET 10 / C# 14 arrive "in Unity 6.8" ([alternativeto](https://alternativeto.net/news/2026/9/unity-6-6-adds-webgpu-build-analysis-and-coreclr-prep/)); this conflicts with Unity's own post, so the exact version is **UNVERIFIED**. The plan below is written so it does not matter.

---

## 1. Decision summary and what changes against the Python plan

### 1.1 The decision in one paragraph
The game is a Unity application whose **simulation, rules, data validation and AI are plain C# with no reference to UnityEngine**, compiled twice: once by Unity (as assemblies with `noEngineReferences: true`) and once by the .NET SDK for `dotnet test`. Unity only draws, plays sound, reads input, loads files and drives the turn pipeline. Every design rule of the GDD (three layers, immutable state, counter-based RNG, integer math, theme-swap determinism, default elision of hooks, the no-civilian-state guard) carries over unchanged; only the language-level mechanics change.

### 1.2 Change list by GDD section

| GDD section | Python plan | Unity plan | Status |
|---|---|---|---|
| 1.1 Vision | "desktop (Python 3.10+ and pygame)" | desktop (macOS first, Windows later) built with Unity; Web as a later target (section 11) | change |
| 1.4 Locked decision 1 | Python 3.10+, pygame, venv | Unity `6000.6.x` (C# 9, .NET Standard 2.1) + engine-free C# core also built with the .NET SDK; upgrade path to 6.7 LTS, then Unity 7 (CoreCLR) | **changed by the owner** |
| 1.4 Locked decision 3 | iso tiles, zoom +/-, drag-pan | same; implemented with a Unity Tilemap or chunk meshes (section 6) | same intent |
| 1.4 Locked decision 4 | art drawn in code behind `assets.py` | **re-opened** (art method undecided, TP §8): renderer is method-agnostic; code-drawn glyphs stay as the guaranteed fallback | change |
| 1.4 Locked decision 8 | phases each playable and committed | same phases, re-planned for Unity (section 12) | same |
| 4 Pacing | targets checked by the headless simulator | same targets; simulator is a `dotnet` console tool and a test (no Unity needed) | same |
| 5.1 Default world size (D-6) | 128 "for Python performance" | 128 stays the default (it is also the bd1971 map size, 08 §0); the reason changes from Python speed to readability and AI pacing; 256 becomes a realistic target for the frame budget | reason changes |
| 14.2 Controls | pygame key events | Unity Input System action map, rebindable (section 7) | change |
| 14.3 Rendering | pre-rendered 16x16-tile chunk surfaces per zoom level, invalidated on fog change; 16 ms at 64x64, 33 ms at 256x256 | GPU draws: Tilemap in Chunk mode (or 16x16 chunk meshes) + fog as a texture overlay; zoom is a camera property, so **no per-zoom re-render**; budget tightened to 16.7 ms at 256x256 on the reference Mac | change |
| 16 Accessibility | UI scale, remap, colour-blind | same; UI Toolkit `PanelSettings` scale, Input System rebinding | same intent |
| 17 Save/load | versioned JSON, 3 rotating autosaves, `.bak`, newer-version never overwritten | same rules; files under `Application.persistentDataPath`; JSON written by our own canonical writer; Web builds need an IndexedDB-backed path (section 9) | same rules, new IO |
| 18 Architecture | `data -> core -> ai -> app -> ui`, frozen dataclasses, boundary test parses imports | same graph as **assembly definitions**; `Conquest.Core`/`Conquest.Rules`/`Conquest.Ai` have `noEngineReferences: true`; boundary test reads `.asmdef` files and assembly references; immutability by `sealed` classes with `readonly` fields, own immutable collections (section 4) | change of mechanism |
| 18 Determinism (H-8) | never iterate a set; two `PYTHONHASHSEED` runs | never enumerate `Dictionary`/`HashSet`; ordinal string comparison only; **three-runtime replay test** (Mono in the editor, IL2CPP player, CoreCLR via `dotnet test`) replaces the two hash seeds | change of mechanism |
| 19 Data | `rules/`, `themes/`, `settings/`, `scenarios/` JSON, seven-step pipeline | identical files and pipeline; location `Assets/StreamingAssets/conquest/` (section 2.4); parser is our own strict JSON reader (section 5) | same data |
| 20 Testing | pytest, pytest-cov, 80% gate | NUnit under `dotnet test` (core, rules, ai, data) + Unity Test Framework EditMode/PlayMode (presentation); coverlet for the 80% gate on the engine-free code; Unity Code Coverage optional (section 10) | change of tools |
| 21 Phases | 0 skeleton/venv ... 4 AI | 0 skeleton (Unity project + .NET solution) ... 4 AI; exit criteria rewritten (section 12) | change |
| 23 D-11 | JSON vs TOML (Python 3.10 reason) | JSON stays; the reason is now "one strict reader shared by Unity and dotnet" | reason changes |
| 23 D-13 | pygame-ce, pytest | replaced by the dependency list in section 14 | replaced |
| 23 D-14 | `conquest/` in this repo with `pyproject.toml` | `conquest/` in this repo with a Unity project and a .NET solution (section 2.5); OWNER may prefer a new repo | change |

### 1.3 What stays identical
- All rules, numbers, tables, ASSUMED tunables and the assumption register (GDD §5-13, 19).
- The three layers and every TA rule: ruleset/variant/theme/settings, theme files rejected if they contain rule keys, theme-swap determinism, fallback chains ending in a shape, silence or `[key]` (TA §0-6).
- The resumable phase pipeline `orders -> ai_planning -> battles(queue,index) -> economy -> done` and `advance(state)` (GDD §6.2), now `Pipeline.Advance(GameState, Rules) -> AdvanceResult`.
- Variant format with RFC 6901 JSON Pointer ops (VH H0.4, TA-1); default elision for the rules hash and the state hash (VH H0.1); hooks H1-H7 and their pipeline steps 3a/5a (VH §2).
- The event and key table and the `@<slot>` template rule (VH §8, TP X-1).
- The no-civilian-state allow-list test and its ten checks (VH §5, TP10 §7).
- Every test name in TP10 except the Python-specific ones, which are renamed as follows (section 10 maps the rest; only the harness changes for them): pygame bans (`test_no_conditional_pygame_import_anywhere_in_core`, `test_core_has_no_pygame`) -> `UnityEngine` reference ban (10.4); `test_core_dataclasses_are_frozen` -> sealed/`readonly` scan; `test_core_math_names_are_integer_safe` (`math.isqrt` and kin) -> float/`double`/`decimal` and `/`, `%` scan; `test_no_unordered_iteration` (`SetIterGuard`) -> `Dictionary`/`HashSet` enumeration scan; `test_replay_identical_under_two_hash_seeds` and `test_hash_seed_runner_really_varies_hash` -> three-runtime replay and the `tr-TR` sanity check (3.5); `test_hash_stable_across_python_versions` -> LangVersion 9 / `netstandard2.1` parity between Unity and dotnet (2.2). Python-only names do not carry over as names.

---

## 2. Solution layout

### 2.1 Assemblies and dependency direction

```
                    Conquest.Core  (pure model + pipeline + rng + imath + hashing)
                      ^      ^
       Conquest.Rules |      | (Rules = loaded ruleset objects; Core references Rules types only)
   (loader, 7-step    |      |
    validator, JSON,  +------+
    variants, schemas)
                      ^
                Conquest.Ai  (planner, tactics; reads KnowledgeView)
                      ^
          Conquest.Theme (presentation model: labels, plurals, @slot, calendar,
                      ^   asset-key resolution chain WITHOUT Unity types)
                      |
          Conquest.App  (controller: turn driver, AI scheduling, save/load,
                      ^   replay runner; Unity-free except an IO interface)
                      |
   Conquest.Unity.Presentation  (MonoBehaviours, renderers, UI Toolkit, input,
                                  Unity IO adapters, glyph painters)
   Conquest.Unity.Editor        (editor tools: data index, glyph bake, validators menu)
   Tests:  Conquest.Core.Tests, Conquest.Rules.Tests, Conquest.Ai.Tests, Conquest.Theme.Tests,
           Conquest.App.Tests (dotnet + Unity EditMode), Conquest.Unity.Tests.EditMode,
           Conquest.Unity.Tests.PlayMode
```

Arrows point from user to used. The required properties:

| Assembly (asmdef name) | References | `noEngineReferences` | Notes |
|---|---|---|---|
| `Conquest.Core` | none (BCL only) | **true** | state, orders, pipeline, battle, economy, predicates, rng, imath, hashing, canonical writer for state |
| `Conquest.Rules` | `Conquest.Core`? see note | **true** | strict JSON reader, JSON Pointer, variant ops, schemas, 7-step validator, `Rules` object, rules hash |
| `Conquest.Ai` | Core, Rules | **true** | `Plan(KnowledgeView, RngContext) -> Orders` |
| `Conquest.Theme` | Core (ids, events), Rules (role lists) | **true** | label/plural/template engine, calendar, `@slot`, asset key chain as data (`AssetRequest -> ResolvedAssetKey`) |
| `Conquest.App` | Core, Rules, Ai, Theme | **true** | controller and replay runner; file and clock access only through interfaces (`IFileStore`, `IClock`) |
| `Conquest.Unity.Presentation` | all of the above + Unity modules/packages | false | the only runtime assembly that touches UnityEngine |
| `Conquest.Unity.Editor` | Presentation + UnityEditor | false | `includePlatforms: ["Editor"]` |
| test assemblies | as above + NUnit | core tests true | `defineConstraints: ["UNITY_INCLUDE_TESTS"]` in Unity |

Note on Core vs Rules: the GDD says `core` imports the ruleset. In C# that means `Conquest.Core` needs the *types* of the loaded rules. **REC:** split the rules **model** (immutable `Rules`, `BuildingDef`, `UnitDef` records) into `Conquest.Core` (namespace `Conquest.Core.RulesModel`), and keep the **loading and validation** in `Conquest.Rules`, which references Core. Then the graph has no cycle: `Rules -> Core`, `Ai -> Core`, `App -> Rules, Ai, Theme`. The AI does not need the loader.

Why `App` is engine-free: the turn driver, AI scheduling decisions, autosave rotation and replay are logic. Keeping them Unity-free lets the full headless game (AI-vs-AI soak, theme-swap test, economy simulator) run under `dotnet test` in seconds, without a Unity licence on CI. The Unity layer supplies `IFileStore` (StreamingAssets/persistentDataPath), `IClock` (only for UI animation and autosave timestamps) and `IAiRunner` (thread or time-slice, section 11).

Boundary rules enforced by tests (section 10.4): Core/Rules/Ai/Theme/App have `noEngineReferences: true` and reference only the assemblies listed above; no assembly references `Conquest.Unity.*` except tests; Core never references Ai or App (CR C-1).

### 2.2 Where the engine-free code lives so `dotnet test` can build it

Constraint: Unity imports every file under `Assets/` and under a package folder, including `bin/` and `obj/` folders and stray `.dll` files, so a .NET project's build output must never sit inside a folder Unity imports. Unity skips folders whose names end in `~` or start with `.` (UNVERIFIED for the exact rule set; it is long-standing documented behaviour).

**REC (option C below):** the engine-free source is a **local UPM package** inside the repo, and a **separate .NET solution folder** compiles the very same `.cs` files by glob.

```
conquest/                                   # repo folder (D-14)
  unity/                                    # the Unity project (new; section 2.5)
    Assets/
      StreamingAssets/conquest/             # ALL game data (section 2.4)
      Conquest/Presentation/ ...asmdef      # Unity-only code
      Conquest/Editor/ ...asmdef
      Conquest/Tests/EditMode|PlayMode
      Scenes/ Boot.unity Map.unity Battle.unity
    Packages/
      manifest.json                         # references the local package below
      com.conquest.engine/                  # embedded package = engine-free code
        package.json
        Runtime/Core/   Conquest.Core.asmdef   (noEngineReferences: true)
        Runtime/Rules/  Conquest.Rules.asmdef
        Runtime/Ai/     Conquest.Ai.asmdef
        Runtime/Theme/  Conquest.Theme.asmdef
        Runtime/App/    Conquest.App.asmdef
        Tests/          *.Tests.asmdef      (engine-free NUnit tests, run in both hosts)
  dotnet/                                   # outside Unity's import scope
    Conquest.sln
    Conquest.Core/Conquest.Core.csproj      # <Compile Include="../../unity/Packages/com.conquest.engine/Runtime/Core/**/*.cs" />
    ...one csproj per asmdef, same names, same references...
    Conquest.Tests/Conquest.Tests.csproj    # globs the package Tests/ folder; NUnit + coverlet
    Conquest.Tools/                         # console: replay, simulate, soak, validate-data, update-goldens
    Directory.Build.props                   # LangVersion 9.0, Nullable, TreatWarningsAsErrors, Deterministic
  tools/ci-local.sh                         # runs dotnet stages, then Unity batch-mode tests
```

Settings that keep the two compilations honest:
- `LangVersion` **9.0** and target `netstandard2.1` for the library csprojs, so the dotnet build rejects any C# 10+ syntax that Unity 6.6 cannot compile (DOCS: C# 9 in 6.6-6.7). Test and tool projects target the installed SDK's runtime (CoreCLR).
- A test asserts each csproj's `<Compile Include>` globs and references match the asmdef's folder and references (no drift between the two builds).
- When Unity 7 arrives (CoreCLR, .NET 10), the same code compiles unchanged; LangVersion can be raised then.

Options compared:

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Source in `Assets/`, csproj globs it | asmdefs under `Assets/Conquest/Core` | simplest for Unity | `Assets/` is a busy folder; easy to put a Unity type in the wrong place; package boundaries less visible |
| B. Build a DLL with dotnet, copy into `Assets/Plugins` | Unity sees a binary | one compiler | two-step workflow, stale DLL risk, no source debugging in the editor, IL2CPP stripping config |
| **C. Embedded UPM package + sibling csproj (REC)** | as above | clear boundary, one source of truth, package can later be reused by a second game or a server | slightly more setup; Unity regenerates its own `.csproj` files for the IDE, which must not be confused with `dotnet/` (they live in the Unity project root and are git-ignored) |

### 2.3 Folder structure of the data

The data tree is the TA §2.2 tree, unchanged, plus the bd1971 files:

```
StreamingAssets/conquest/
  index.json                      # generated: every file path + SHA-256 (Web/Android cannot list folders)
  rules/core/*.json               # ruleset.json, resources, terrain, buildings, units, factions,
                                  # discoveries, abilities, combat, economy, scoring, events,
                                  # terrain_affinity, hooks.json (VH H0.1)
  rules/variants/*.json           # equal-nations, mvp, no-patron, bd1971 (allow-lists are NOT here: see below)
  engine/text/en.json             # neutral base locale (TA §5)
  themes/<id>/...                 # theme.json, roles.json, factions.json, calendar.json, names/, text/,
                                  # flavour/, encyclopedia/ (TP X-2), shapes.json, assets/, audio/
  settings/presets/*.json
  scenarios/*.json, scenarios/maps/*.map.json
```

**Test allow-lists never ship in a player build (N-14).** The variant allow-lists (`*.allow.json`, TP10 §1.4, VH §5), the source-scan allow-lists of 10.4 and the golden files live in `dotnet/Conquest.Tests/allowlists/` and `dotnet/Conquest.Tests/golden/` (matches VH's `tests/allowlists/`; this settles TP10 Q2). `dotnet/` is outside Unity's import scope (2.2), so they are never in `Assets/` or `StreamingAssets/`. The `index.json` generator only walks `StreamingAssets/conquest/`, and a test fails if any `*.allow.json` or `allowlists/` folder appears under `Assets/` or `Packages/`, or in the generated `index.json`. Build scripts and `tools/ci-local.sh` package only `Assets/` content; the tools read the allow-lists from `dotnet/` directly.

### 2.4 StreamingAssets vs Resources vs Addressables (and 6.6 Content Directories)

| Criterion | StreamingAssets (loose files) | Resources (`TextAsset`/`Texture2D` in build) | Addressables (package) | Content Directories (6.6, new) |
|---|---|---|---|---|
| Same files read by `dotnet test` | **yes, by path** | only if tests read the raw files under `Assets/Resources` | raw files yes, runtime path no | UNVERIFIED |
| Theme swap without rebuild (mods, owner edits) | **yes** | no | yes with remote/catalog work | UNVERIFIED |
| Dependency | none | none | `com.unity.addressables` (approval) | built in to 6.6 (DOCS: "integrates with existing Addressables workflow"; details UNVERIFIED) |
| Web / Android | must read with `UnityWebRequest` (async); no directory listing (UNVERIFIED but long-standing) | sync, works everywhere | works everywhere | UNVERIFIED |
| Images | raw PNG decoded at runtime (`ImageConversion.LoadImage`): no import compression, no atlas; fine for a 2D strategy game, costs load time | imported, compressed, atlased | imported, compressed, atlased, async | imported |
| Unity's own advice | supported | Unity has long discouraged heavy `Resources` use (UNVERIFIED wording) | recommended for large content | new |

**REC:** StreamingAssets for **all rules, variants, scenarios, settings and theme text**, with a generated `index.json` (a test fails if it is stale) and one async loader (`IFileStore`) used on every platform so Web works from day one. **Theme pictures** also start in StreamingAssets (keeps the "drop a PNG in the theme folder" contract of TA §6 and works with any art route); if art volume or load time grows, move pictures (not rules) to Addressables or Content Directories behind the same `IAssetSource` interface (section 6.7). Resources is used only for the engine's own fallback assets (the magenta placeholder, the built-in UI font).

### 2.5 New Unity project vs the existing `My project`

| | New project (REC) | Reuse `My project` |
|---|---|---|
| Template | Universal **2D** (URP 2D Renderer, 2D packages) | URP **3D** sample (3D renderer assets, volume profiles, tutorial assets) |
| Packages | only what this plan approves (section 14) | carries `ai.assistant` (pre-release), `ai.inference`, `ai.navigation`, `visualscripting`, `timeline`, `collab-proxy`, `com.unity.pipeline` 0.7.0-exp.1 (experimental; purpose UNVERIFIED): none needed; each adds compile time, possible pre-release breakage and licence/data terms to review |
| Version control | lives in this git repo next to the specs and tests | under Unity Version Control (`.plastic/`); mixing two VCS systems in one game is a standing risk |
| Location | `conquest/unity/` in the repo, with the `dotnet/` sibling (section 2.2) | `~/Unity/My project`, outside the repo; the engine-free package would have to be referenced by an absolute `file:` path |
| Effort | one Hub "New project" + package trimming | delete the sample, swap the 3D renderer for 2D, remove packages |
| Risk | none to existing work | the owner may use `My project` for something else |

**REC: create a new project** at `conquest/unity/` from the Universal 2D template on the installed `6000.6.3f1`, and leave `My project` untouched. OWNER decides (section 13 R-3). Creating it is an install-like action (the Hub downloads template packages): it needs the owner's yes.

---

## 3. Determinism in C#

Goal (GDD §18, CR H-8): the same ruleset, variants, settings, seed and order list give the same per-turn `rules_state_hash` on every machine, every runtime (Mono, IL2CPP, CoreCLR) and every theme.

### 3.1 Integer-only simulation
- **No `float`, `double` or `decimal` in Core, Ai, Rules (rule values) or the state.** A boundary test scans the compiled assemblies' field and method signatures by reflection and the source by text for these types (allow-list file, expected empty). Unity's `Mathf`, `Vector2` and Burst are impossible there anyway (`noEngineReferences`).
- Rates are integer percent or per-mille, as data: the loader rejects a JSON number with a fraction or exponent where an integer is required (TP10 `test_rules_loader_rejects_float_rates`).
- `Conquest.Core.IMath` is the **only** place that divides or rounds:
  - `FloorDiv(long a, long b)`: **C# `/` truncates toward zero** (`-7 / 2 == -3`), unlike Python `//`. The helper floors toward negative infinity (`-7 -> -4`) and is the only legal division in Core (test greps for `/` and `%` on integers outside `IMath`, with an allow-list). This matters for the GDD §8.4 modifier at -100% and below.
  - `Pct(long value, int percent)`, `PerMille(long value, int pm)`, `Scale(long value, long num, long den)`, `ChainPct(long value, params int[] percents)` (multiply all, floor once: VH H3 movement, TP10 §3.2).
  - All intermediate products in `long`, computed in a `checked` block: an overflow throws (a bug) instead of wrapping silently. Bounds are small (coin stock < 2^31) so `long` never overflows in practice.
  - Rational pairs for movement settings (3/2, 1/1, 2/3; CR H-8c).
- Combat odds: hit chance in per-mille (300 = 0.30), clamp 50..950; a hit is `rng.Below(1000) < chance`.

### 3.2 Counter-based RNG
`Conquest.Core.Rng`: `ulong Draw(ulong seed, StreamId stream, int turn, ulong key)` and `int Range(ulong seed, StreamId stream, int turn, ulong key, int lo, int hiExclusive)`.
- Construction: `x = seed; x = Mix(x ^ stream.Code); x = Mix(x ^ (ulong)turn); x = Mix(x ^ key); return Mix(x)`, where `Mix` is the SplitMix64 finaliser (`x += 0x9E3779B97F4A7C15; z = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) * 0x94D049BB133111EB; return z ^ (z >> 31)`) in `unchecked` context. Pure 64-bit integer operations: identical on Mono, IL2CPP and CoreCLR, 32- and 64-bit.
- `Range` uses rejection sampling (Lemire or simple modulo-with-rejection) so it is unbiased and integer-only; any loop is bounded by redrawing with `key + attempt` (deterministic).
- Streams are a registered list (`worldgen`, `combat:<battleId>`, `ai:<slot>`, `economy`, `cosmetic`), each with a stable 64-bit code computed by **our own FNV-1a-64 over the UTF-8 bytes** of the name. Never `string.GetHashCode()`: it is randomised per process on CoreCLR (so it differs between `dotnet test` runs and will in Unity 7) and its algorithm differs between runtimes (UNVERIFIED for Mono's exact behaviour; irrelevant once banned). A test bans `GetHashCode()` calls in Core/Rules/Ai except on our own types that override it deterministically.
- `key` composition: `Key(a, b, c)` mixes integers (unit id, attack index, round) with the same finaliser; never a string's hash.
- The cosmetic stream lives in `Conquest.Theme`/`App` and is unreachable from Core (assembly references make it impossible; a test still checks the name).
- Golden draws file (`golden/rng.json`, 32 pairs) pins the algorithm (TP10 §3.1).

### 3.3 Ordering rules
- **Never enumerate a `Dictionary<,>`, `HashSet<>`, `ConcurrentDictionary<,>` or `Hashtable` in Core/Ai/Rules/App.** Their enumeration order is an implementation detail: in practice insertion order until a removal, then slots are reused; it differs between runtimes and between versions (UNVERIFIED in detail; banning makes it moot). Lookups (`TryGetValue`, `ContainsKey`) are fine.
- State collections are **arrays sorted by a stable integer id** (unit id, base id, battle id), or fixed-index arrays keyed by role index (role ids are mapped to dense indices once, in `ruleset.json` order).
- Ids are integers assigned from a counter in state (`nextUnitId`), never GUIDs, never object identity, never `GetHashCode`.
- Strings are compared and sorted with `StringComparer.Ordinal` / `string.CompareOrdinal` only. Plain `List<string>.Sort()` and `OrderBy(s => s)` use the **current culture** (a Turkish or Bengali machine could order differently): banned in engine-free code by a source scan; `OrderBy(x => x.Id)` on integers is fine. LINQ `OrderBy` is a stable sort; `Array.Sort`/`List.Sort` are **not stable**: tie-breaks must be explicit (VH H0.2: list index, then slot, then `(y, x)`).
- Tie-break rule (VH H0.2) implemented once in `Core.Order.Compare*` helpers.
- No `Parallel.For`, no tasks inside Core; the AI may run on a thread *as a whole* (section 11) because it is a pure function of an immutable snapshot.

### 3.4 Hashing (rules hash and state hash)
- **Canonical form**: our own writer serialises objects with keys sorted ordinally, integers in invariant decimal, no whitespace, UTF-8, and values equal to their declared default omitted per VH H0.1 (default elision; `null` is omitted only where `null` is the declared default, not for every null). The same writer produces save files (pretty-printed variant) so "hash of save == hash of state" is checkable.
- **Three hash rules fixed by the other specs (N-12):** (1) `_note` and every `_`-prefixed key are stripped before hashing (TP10 6.3 `test_rules_hash_independent_of_note_keys`); (2) the ruleset version string is not hashed (VH H0.1; TP10 `test_rules_hash_independent_of_version_string`); (3) the variant stack, as ids and versions in order, is hashed beside the merged document (TP10 `test_variant_ids_and_versions_are_in_the_hash`).
- `rules_hash` = SHA-256 of the canonical merged rules (after variants, before themes) plus the variant stack per rule (3) above, formatted `sha256:<hex>`. SHA-256 from `System.Security.Cryptography.SHA256` is in .NET Standard 2.1; availability and speed in IL2CPP and Web players is UNVERIFIED. **REC:** ship a small managed SHA-256 (about 150 lines, tested against the NIST vectors) in Core so every platform uses identical code with no dependency, and test it against the BCL implementation under `dotnet test`.
- `rules_state_hash` (per turn, many per test) = 64-bit **xxHash64** (or SplitMix-based streaming hash) over the canonical state bytes, own implementation with published test vectors; SHA-256 only for saves. Endianness is fixed by writing bytes explicitly (`BinaryPrimitives.WriteInt64LittleEndian`, available in .NET Standard 2.1).
- Hashed field list is explicit (`golden/hash_fields.json`, TP10 §3.4): the state hasher walks a declared list of fields per type, not reflection order (reflection field order is not guaranteed). This list is the **hashed subset only**; it deliberately omits bookkeeping fields (for example `jumps`-style counters). It must never be used as the list of all state fields (see 10.5, N-10).
- Never use C# `record` auto-generated `GetHashCode`/`Equals` for anything persisted or hashed: they call `GetHashCode()` on members, including strings.

### 3.5 Runtime differences (Mono, IL2CPP, CoreCLR; 32/64-bit)
| Topic | Risk | Rule |
|---|---|---|
| Integer arithmetic | none: two's complement 32/64-bit is identical everywhere | use `int`/`long` explicitly, never `nint` |
| Floating point | IL2CPP compiles to C++ and lets the C++ compiler choose instructions; results may differ from Mono/CoreCLR (UNVERIFIED in detail) | no floats in the simulation (3.1) |
| `string.GetHashCode` | randomised on CoreCLR | banned (3.2) |
| Dictionary order | implementation detail | banned (3.3) |
| Culture | `ToString()`, `int.Parse`, `ToUpper`, sorting use current culture | invariant/ordinal only (3.6) |
| Code stripping (IL2CPP) | reflection-only types removed | no reflection in Core; `link.xml` for the engine package if needed (UNVERIFIED need) |
| Generic sharing / AOT (IL2CPP) | some generic virtual methods fail at runtime | keep collections simple; IL2CPP smoke run of the golden replays (section 10) catches it |
| Statics and domain reload | 6.6 default play mode does not reset statics (DOCS) | Core/Rules/Ai/App hold no mutable statics (boundary test, as TP10 `test_core_has_no_global_mutable_state`) |
| 32-bit targets (some Android, old Web) | pointer size only | no `IntPtr`/`nint` arithmetic in Core |

**The three-runtime replay test** (replaces the two `PYTHONHASHSEED` runs of TP10 §3.3): every golden replay is run (a) by `dotnet test` on CoreCLR, (b) in Unity EditMode tests on Mono, (c) by a development IL2CPP player started in batch mode with `-replay <file> -out <hashes.json>`; all three hash lists must equal the golden file. (c) runs nightly and before releases (it needs a player build). A sanity check proves the harness can see a difference: a planted test type that sorts strings with the current culture under `tr-TR` must change a hash.

### 3.6 Culture invariance
- Engine-free assemblies never call culture-sensitive APIs: `ToString()` on numbers without `CultureInfo.InvariantCulture`, `int.Parse` without it, `ToUpper/ToLower` (use the `Invariant` forms), `string.Compare` without `StringComparison.Ordinal`, `StartsWith/EndsWith/IndexOf(string)` without `StringComparison.Ordinal` (these default to culture-sensitive comparison). Enforced by a source-scan test with an allow-list; a Roslyn analyzer is an optional upgrade (section 14).
- Tests run under `tr-TR`, `bn-BD` and `en-US` current cultures (NUnit `[SetCulture]`) for the loader, writer, hasher and one golden replay.
- Display formatting (thousands separators, Bengali digits, dates) happens only in `Conquest.Theme` with an explicit locale object from the theme pack, never the OS culture (TA §5 "numbers and dates use the locale's digit grouping").

### 3.7 JSON number handling
- Our reader (section 5) parses integer tokens exactly into `long` and rejects: fractions and exponents where integers are required, numbers outside `long`, leading `+`, `NaN`/`Infinity`, duplicate keys, comments, trailing commas, a BOM inside the document, and any value whose JSON type does not match the schema. Numbers are **never** routed through `double`.
- Strings that look like dates stay strings (relevant for `calendar.json` `epoch`, TP X-3; Newtonsoft would convert them to `DateTime` by default unless `DateParseHandling.None` is set: a classic pitfall, see section 5.1).
- The writer emits integers only; the save format has no floating-point field at all.

---

## 4. Immutable state strategy in C#

### 4.1 Requirements
`ApplyOrder(state, order) -> Result<GameState, OrderError>` and `Advance(state)` return new states and never mutate (GDD §18); undo of targeted actions (GDD §6.4) is a stack of previous states; theme switch never touches state; save = serialise state. Scale: map 80-256 square (65,536 tiles at 256), up to 6 slots, about 200-2,000 units, up to about 100 bases, battles 3x4.

### 4.2 Options

| Option | Description | Fit |
|---|---|---|
| A. `record` classes + `System.Collections.Immutable` (`ImmutableArray`, `ImmutableDictionary`) | idiomatic modern .NET | `System.Collections.Immutable` is **not** part of .NET Standard 2.1: it is a NuGet DLL (plus `System.Memory`/`System.Runtime.CompilerServices.Unsafe` dependencies) that needs approval and IL2CPP testing (UNVERIFIED whether a Unity package already bundles a usable copy). `ImmutableDictionary` enumeration order is hash-based: it would have to be banned like `Dictionary`. Records need the `IsExternalInit` polyfill on .NET Standard 2.1 (UNVERIFIED that Unity 6.6 still requires it; harmless to add) |
| B. Persistent structures (HAMT, RRB vectors) | O(log n) updates with sharing | more code than the game needs at these sizes; harder to hash canonically |
| **C. Sealed immutable classes + own small immutable containers + copy-on-write chunks (REC)** | see 4.3 | no dependency; deterministic order by construction; cost is predictable |
| D. Mutable state + command log | fast | breaks the GDD's purity rules and the deep-snapshot tests |

### 4.3 Recommended design (option C)
- **Value objects** (`TileCoord`, `RoleIndex`, `ResourceVector` of six `long`s, `UnitId`): `readonly struct` with explicit `Equals`/deterministic `GetHashCode` (built from integer fields with our mixer).
- **Entities** (`Unit`, `Base`, `Battle`, `Faction`, `IntelRecord`): `sealed class` with `readonly` fields set in the constructor and `With...` methods returning a new instance. C# 9 `record` classes are allowed for brevity if the `IsExternalInit` polyfill compiles in both hosts, but their generated equality is not used for hashing (3.4).
- **`ImmArray<T>`**: our `readonly struct` wrapping a private `T[]` that is never exposed (indexer, `Length`, `AsSpan()` read-only, `SetItem`/`Add`/`RemoveAt` return new arrays). Entity tables are `ImmArray<Unit>` **sorted by id**, found by binary search. At 2,000 units a copy is 16 KB of references: about microseconds, fine for `ApplyOrder` (GDD gate p95 < 2 ms).
- **`IdMap<T>`** (sorted keys + values arrays) instead of dictionaries; ordered iteration is the only iteration.
- **Map layers**: the terrain `World` (tile types, flat flags, river flags, region index, affinity precomputations) is created once and **shared by reference** across all states (GDD §18; TP10 `test_world_shared_by_reference_across_states`). Mutable-per-turn layers that cover the map use **copy-on-write chunks**: `ChunkedLayer<T>` = 16x16-tile chunks in an `ImmArray<Chunk>`; changing one tile copies one chunk (256 entries) plus the chunk table (256 references at 256x256). Used for ownership/occupancy overlays if needed.
- **Fog as a bitset** (GDD §5.2, CR M-16): per player two bit-planes `explored` and `visibleNow`, each 65,536 bits = 8 KB at 256x256, stored as `ulong[]` in **16x16-tile chunks of 4 `ulong`s** (256 bits) with copy-on-write per chunk. A unit move touches 1-4 chunks: copy those plus a 256-entry chunk table (2 KB). `visibleNow` is recomputed per player per move from vision sources (cheap: radius <= 7). Never a set of tuples.
- **Intel memory**: `IdMap<IntelRecord>` per player keyed by base id, fields nullable as VH G-5.2 requires (`int?`).
- **Undo stack**: `ImmArray<GameState>` limited to the current orders phase and to the targeted actions of GDD §6.4; because states share structure the stack is cheap (each entry differs by a few arrays). Map movement is never pushed (GDD §6.4: no fog rollback). The stack is presentation-side (`App`), not part of `GameState`, so it never enters the hash or the save.

### 4.4 Allocation and GC budget
Unity's Mono/IL2CPP GC is non-moving and (by default) incremental (UNVERIFIED for 6.6 defaults); short-lived allocations cause GC spikes that show up as frame hitches.

| Path | Budget (ASSUMED, measured in Phase 1-2) |
|---|---|
| Map frame (camera pan/zoom, no state change) | **0 bytes** managed allocation per frame (Unity Profiler GC Alloc column; a PlayMode test reads `ProfilerRecorder` "GC Allocated In Frame") |
| `ApplyOrder` (unit move) | < 64 KB per call at 256x256, 2,000 units |
| `Advance` through economy | < 8 MB per end of turn at 256x256; no hitch requirement (it runs behind a "resolving turn" screen) |
| AI plan per player | measured; runs off the main thread on desktop (section 11) |
| Presentation diffing | redraw only changed chunks: the renderer compares chunk references between old and new state (reference inequality = changed), which the copy-on-write design gives for free |

---

## 5. Data loading and validation

### 5.1 JSON library options

| Option | Available in 6000.6 | Fit for this plan | Approval |
|---|---|---|---|
| `JsonUtility` (built in) | yes | **No**: no dictionaries (the data is map-heavy: `roles.json`, `text/en.json`), no top-level arrays, no polymorphism, no "missing vs default" distinction, silently ignores unknown keys (the allow-list validation of TA §2.4 needs to see them), no positions for error messages. 6.6's new native `Dictionary` serialization is for `[SerializeField]` fields (DOCS); whether `JsonUtility` gains dictionary support is UNVERIFIED | none |
| Newtonsoft Json.NET (`com.unity.nuget.newtonsoft-json`, Unity-maintained package; version UNVERIFIED) | as a package | Good: `JObject` DOM with line numbers, `JsonLoadSettings.DuplicatePropertyNameHandling = Error`; must set `DateParseHandling.None`, `FloatParseHandling.Decimal` and `MaxDepth`. Works in Unity and dotnet (NuGet `Newtonsoft.Json`). IL2CPP needs AOT care for reflection-based object binding; DOM-only use avoids it (UNVERIFIED) | **needs owner approval** (two installs: Unity package + NuGet for dotnet) |
| `System.Text.Json` | **not in the .NET Standard 2.1 API that 6.6 exposes** (DOCS: 6.6-6.7 are .NET Standard 2.1); usable only as NuGet DLLs plus their dependencies dropped into the project; in-box after the Unity 7 CoreCLR move (UNVERIFIED for the player) | Good API (`Utf8JsonReader`, strict by default) but a DLL bundle in a Mono/IL2CPP project is fragile | **needs owner approval**; not recommended before Unity 7 |
| **Own strict JSON reader/writer in `Conquest.Rules` (REC)** | n/a | About 500-700 lines + tests: RFC 8259 strict subset, DOM with `(file, line, column, JSON Pointer)` on every node, exact integers, duplicate-key rejection, canonical writer for hashes and saves. Identical behaviour in Unity Mono, IL2CPP, CoreCLR and Unity 7; no AOT/stripping issues; no approval | none (code we write) |

**REC:** write our own reader and canonical writer (one module, heavily tested, fuzzed with malformed input), because the validation pipeline needs a positioned DOM and JSON Pointer anyway and the canonical writer is needed for hashing whatever library parses. Newtonsoft is the fallback if the owner prefers fewer lines of our own code (OWNER, section 13 D-U5).

### 5.2 Schema validation
JSON Schema validator libraries (for example NJsonSchema, JsonSchema.Net) are further dependencies and target modern .NET (UNVERIFIED for .NET Standard 2.1). **REC:** schemas as **C# code** (as the Python plan chose stdlib dataclass loaders, TA D-8): a small combinator set (`Obj(fields...)`, `Int(min,max)`, `Enum(...)`, `ArrayOf(...)`, `MapOf(keyPattern, ...)`, `RoleId(group)`, `JsonPointer()`), each field declared with its default (needed for default elision, VH H0.1) and an `allowed keys` list (unknown key = error; `_note`/`_*` keys ignored as TA §2.1 says). A generator can emit a JSON Schema document from the C# schema later for editor tooling, without a runtime dependency.

### 5.3 The seven-step pipeline in C# (TA §3.4, VH TA-2)
`Validator.Load(IFileStore, LoadRequest) -> LoadResult { Rules?, MatchConfig?, Presentation?, ImmArray<Diagnostic> }`; never throws for bad data; every `Diagnostic` has `severity`, `code`, `file`, `jsonPointer`, `line`, `column`, `message` (neutral English; the UI may localise by code).

| Step | Assembly | What runs | Blocks start? |
|---|---|---|---|
| 1 Schema | Rules | parse every file (strict reader), check against its C# schema | yes |
| 2 Ruleset integrity | Rules | role references, level arrays length, costs name `res.*`, slots cover `faction_slots`, hook defaults present | yes |
| 3 Variants | Rules | apply ops in order (5.4), then step 2 again on the result; `applies_to` incl. `min_minor` | yes |
| 4 Settings vs ranges | Rules | `setting_ranges`, slots unique, players <= 6, bonus points <= 40 | yes |
| 5 Scenario vs rules | Rules | goal/surrender predicates (VH H4 grammar, depth/node limits), `tag_counts`, sites, entry tiles on passable land, regions non-overlapping, season schedule, timed effects, `initial_site_count`, `requires` features, `PLACEHOLDER` rejected in strict mode | yes |
| 6 Theme vs rules | Theme | coverage (role labels in base locale, `ev.*`/`err.*` templates with the VH §8 payload fields, `@slot` keys have base keys, site/entry/region names), no ruleset keys in theme files (TA §2.4) | strict (CI) only |
| 7 Presentation sanity | Theme (+ Unity for font checks) | palette contrast, picture size vs footprint (needs image headers: PNG header parse is engine-free), **font glyph coverage of `_sample`** (needs the Unity font engine or a font library; section 8.4) | strict only |

The same entry point runs in the game, in the editor (a menu item and an import-time check), in `dotnet test` and in the `Conquest.Tools validate-data` console command used by CI stage 2.

### 5.4 JSON Pointer variant ops (VH H0.4)
- `JsonPointer.Parse("/factions/profiles/fp.banker/effects")` per RFC 6901 (`~0` = `~`, `~1` = `/`); dotted role ids are plain segments.
- Ops `replace` (target must exist), `add` (parent must exist; for arrays `-` appends, an index inserts; for objects the key must not exist unless the spec allows overwrite: REC "must not exist", so `add` and `replace` stay distinct), `remove` (target must exist). Anything else is an error with the op index as pointer (`/ops/7/op`).
- Ops act on the DOM (immutable: each op returns a new DOM node path, copy-on-write), then the typed `Rules` object is built from the final DOM, then step 2 re-runs. `adds_roles` handling as TA §3.2.
- Tests: TP10 §6 unchanged; plus pointer escape cases and "pointer into an array by index past the end".

---

## 6. Rendering

### 6.1 Scale and budgets
Map 80-256 square, default 128 (bd1971: ~128x128, 08 §0). At zoom 0.25 on 256x256 the whole map (65,536 tiles) may be visible. Unity draws on the GPU, so the pygame problem (CR M-15: 15k blits per frame) becomes a batching problem: the target is a small, constant number of draw calls for terrain and fog.

| Budget (REC, reference: the owner's Mac; measured in Phase 1) | Value |
|---|---|
| Frame time, map view, 256x256, any zoom | <= 16.7 ms (60 fps), 99th percentile <= 25 ms |
| Terrain + fog draw calls | <= 64 at 256x256 (independent of zoom); entities batched by atlas |
| GC allocation per idle/pan frame | 0 B (4.4) |
| Fog update after a unit move | <= 1 ms on the main thread (texture sub-rect upload) |
| Full map rebuild (load, theme switch) | <= 500 ms at 256x256 |
| Memory (map view) | <= 512 MB process on desktop; Web budget in section 11 |

### 6.2 Terrain: Unity isometric Tilemap vs custom chunk meshes

| | Unity Tilemap (isometric / isometric Z-as-Y), `TilemapRenderer` Chunk mode | Custom chunk meshes (16x16 tiles per mesh, UVs into an atlas) |
|---|---|---|
| Effort | low: `SetTiles` in bulk from state; grid math built in (`CellToWorld`, `WorldToCell`) | medium: own iso math, mesh building, picking |
| Batching | Chunk mode batches tiles that share a texture/atlas (needs all terrain sprites in one atlas or texture array; UNVERIFIED details in 6.6) | full control: one draw per chunk |
| Runtime-generated art (glyph painters) | needs `Sprite` objects created at runtime (`Sprite.Create` on a runtime atlas): works (UNVERIFIED performance) | trivially uses any `Texture2D` |
| Authoring tools | 2D Tilemap Editor package for palettes (not needed: maps come from JSON) | none |
| Dependencies | the `tilemap` module is built in; the 2D template adds the 2D Tilemap Editor package (approval as part of the template) | none |
| Iso depth for multi-tile objects | not on the terrain layer (flat) | same |

**REC:** start Phase 1 with **Tilemap in Chunk mode** for terrain only (flat diamonds, no height), because it is the cheapest path to a correct iso picture, picking and coordinate conversion; hide it behind `IMapLayerView` so a chunk-mesh renderer can replace it if the 256x256 budget fails. Units, buildings, selection and previews are **not** tiles (6.4).

### 6.3 Fog layer
- One `R8` texture per viewing player, one texel per tile (256x256 = 64 KB), values: 0 never seen, 128 seen before, 255 visible now; point filtering; drawn by one iso-projected quad with a small shader (URP 2D sprite-unlit shader graph or hand-written) that darkens/dims the terrain under it and draws the black of unexplored land. Fog is **never** conveyed by colour alone (GDD §16): "seen before" also gets a hatch pattern from a tiled pattern texture.
- Update: the presenter compares fog chunk references between states (4.3) and uploads only changed 16x16 rectangles (`Texture2D.SetPixelData` + `Apply`, or `GetRawTextureData` span writes; UNVERIFIED best API in 6.6).
- Entities on fogged tiles are not drawn at all (the presenter reads the viewer's `KnowledgeView`/intel, never live state for opponents); intel records are drawn dimmed (GDD §5.2).

### 6.4 Entities, iso sorting and the 2x2 fort
- Units, bases, buildings, markers: `SpriteRenderer`s (or a pooled instanced-quad renderer if counts exceed ~2,000 visible) in a sorting layer above terrain, sorted by **custom axis** (URP 2D renderer "Transparency Sort Mode: Custom Axis" = (0, 1, 0), so lower screen y draws in front; UNVERIFIED exact setting name in 6.6's 2D renderer data).
- Each object's sort point is its **front-most tile** (CR M-15): for the 2x2 garrison, the sprite pivot is placed at the bottom corner of the footprint (tile `(x+1, y+1)` in iso), so it sorts against units standing next to it correctly. A test renders a fixture (fort plus units on all eight neighbours) and reads back sorting orders from the presenter (no pixels).
- Pooling: one pool per renderer kind; no `Instantiate` during pans.

### 6.5 Camera, zoom and pan
- Orthographic camera; `orthographicSize` maps to zoom 0.25-2.0 (GDD §14.3); `+`/`-` step through a fixed list of zoom stops (Shift = extremes, GDD §14.2), mouse wheel continuous, drag-pan with the middle/right button or a drag on empty map, edge-pan optional; clamp to the map's iso bounding diamond plus a margin.
- **Pixel-perfect** (URP 2D Pixel Perfect Camera): relevant only if the chosen art is pixel art. It snaps to integer scales, which conflicts with continuous zoom 0.25-2.0. **REC:** do not enable it now; if pixel art is chosen, switch zoom to integer stops (x1, x2, x3 and 1/2, 1/4 via mip levels) and use the Pixel Perfect Camera at that time. Point filtering for pixel art, bilinear for painted art: a theme-level setting (`theme.json` `"filter": "point" | "bilinear"`, presentation only).

### 6.6 Selection and placement previews
- Hover and selection outlines: a separate overlay `Tilemap` (or line mesh) above terrain, below entities.
- **`Z` colony-site preview** (GDD §8.1): the presenter asks Core for the site's area (`Core.Colony.AreaFor(level, anchor, world)`) and each building role's forecast from `economy.preview` (GDD §8.7, the same function the turn uses) and draws: the area outline, per-tile legality colour **plus pattern** (legal / illegal-terrain / illegal-overlap), and a number badge with the forecast output per role. Nothing in the preview is computed in the presentation layer.
- Building placement ghost: footprint-sized (2x2 for the fort) translucent glyph, snapped to tiles, red pattern when illegal; the error code from order validation (`err.not_flat`, `err.level_cap`, `err.region_cap`) is rendered as status-bar text through the theme.

### 6.7 Asset fallback chain in Unity terms (art method undecided)
TA §6.2 is implemented in two halves so the order is testable without Unity:
1. **`Conquest.Theme.AssetResolver`** (engine-free): input `AssetRequest(kind, roleId, level?, variant?, state?, slot?)`; output the first hit in: active theme manifest key -> same key with suffixes dropped right-most first (adds a "draw level badge" flag) -> parent theme -> `GlyphSpec(glyph, palette colours, footprint)` from `roles.json` -> `CategoryGlyphSpec(category, footprint)` -> `Placeholder`. It reads only manifest data; tests cover each link with synthetic themes (TP10 §5.5).
2. **`Conquest.Unity.Presentation.SpriteProvider`**: turns the resolver's answer into a `SpriteRef` (texture, rect, pivot, pixels-per-unit) with a cache keyed by `(themeId, assetKey, zoomBucket)` (TA §6.2 caching); theme switch clears the cache.

How each art route plugs in, with no change to the renderer:

| Route | Where the pixels come from | Plugs in at |
|---|---|---|
| Code-drawn shapes (the guaranteed fallback) | `IGlyphPainter` implementations draw `GlyphSpec`s into a runtime `Texture2D` atlas (CPU raster into a `NativeArray<Color32>`, or `CommandBuffer` render-to-texture; REC CPU raster for determinism of the picture and testability), sized to the footprint and zoom bucket | resolver steps 4-5 |
| Code-drawn but baked | an editor tool (or a `Conquest.Tools` command) runs the same painters and writes PNGs into `themes/<id>/assets/` with provenance `tool: "script"` | resolver step 1 (it is just a PNG) |
| Imported or generated sprites | PNG files in the theme folder listed in `assets/manifest.json` with provenance (source, licence, author); loaded with `ImageConversion.LoadImage`; size-checked against the footprint (validator step 7) | resolver steps 1-3 |
| Commissioned art | same as imported; optionally moved to Addressables/Content Directories for compression and atlasing if volume grows (2.4) | resolver steps 1-3, different `IAssetSource` |
| Animated strips | manifest `frames: n` (the sibling platformer's pattern); `SpriteRef` carries a frame index chosen by the presenter from game data, never a clock in Core | step 1 |

Audio follows the same split (`AudioResolver` engine-free; `AudioClip` loading via `UnityWebRequestMultimedia` from StreamingAssets; silence as the last link). No audio in v1 for bd1971 (TP §8.3 rule 7).

### 6.8 Performance and profiling plan
- Phase 1 exit includes a **render benchmark scene** (`Bench.unity`): 256x256 seeded map, 2,000 units, scripted camera path (zoom 0.25 -> 2.0, pans), recording `ProfilerRecorder` frame time, draw calls, batches and GC alloc into a JSON report; a PlayMode test fails above budget on the reference machine and only warns on CI runners (TP10 §11 rule).
- Tools: Unity Profiler and Frame Debugger (built in), `ProfilerMarker` around presenter steps (built in, `Unity.Profiling`), Memory Profiler package (approval, only when needed), Profile Analyzer package (approval, optional). Core benchmarks run under `dotnet` with a Stopwatch harness (BenchmarkDotNet is optional and needs approval).

---

## 7. UI

### 7.1 UI Toolkit vs uGUI vs both

| Criterion | UI Toolkit | uGUI (+ TextMeshPro inside `com.unity.ugui` 2.x) |
|---|---|---|
| Complex scripts (Bengali) | **Advanced Text Generator** (HarfBuzz + ICU + FreeType). The 6000.6 manual says UI Toolkit "uses Advanced Text Generator to render text" (DOCS: [6000.6 text manual](https://docs.unity3d.com/6000.6/Documentation/Manual/UIE-get-started-with-text.html)); in 6.0-6.3 it was an opt-in project setting (DOCS: [ATG](https://docs.unity3d.com/6/Documentation/Manual/UIE-advanced-text-generator.html)). Requires **dynamic** font assets. Bengali specifically is UNVERIFIED (section 8.4) | TextMeshPro has historically had no OpenType shaping for Indic scripts (UNVERIFIED for 6.6; Unity's RTL announcement concerns UI Toolkit, [Full RTL support](https://discussions.unity.com/t/announcing-full-rtl-language-support/1544214)) |
| Data-heavy windows (colony, trade, unit list, messages) | list views with virtualisation, USS styling, data binding (runtime binding in Unity 6; UNVERIFIED details) | workable, more manual |
| UI scale 100-200% (GDD §16) | `PanelSettings` scale | `CanvasScaler` |
| Test without rendering | `VisualElement` trees can be queried in EditMode tests | needs scenes |
| World-space (labels over units) | limited (world-space UI Toolkit support status in 6.6 UNVERIFIED) | strong |

**REC: UI Toolkit for every screen-space UI** (HUD/status bar, top buttons, colony window, building/unit windows, trade window, messages and digest, menus, encyclopedia, settings, battle screen panels). The **battle board** itself (3x4 grid, unit stacks, reserves) is drawn as sprites in a separate battle scene/camera, so it uses the same asset chain as the map; its odds panel and action buttons are UI Toolkit. uGUI is not used unless a world-space label proves necessary; if so, labels show only numbers/icons (no localised text), so Bengali shaping never depends on TMP.

Window inventory from GDD §14.1 mapped to UXML documents: `MainMenu`, `ScenarioSetup`, `PlayerSetup`, `GameHud` (status bar, Mission/Next/End Turn/+/-/Menu, Auto Map minimap as a `RenderTexture` of the fog texture), `UnitList`, `Messages`, `ColonyCenter` (commodity strip with forecast, Upgrade, Build, Population/Commodity detail, Trade, Building list, Commission Leader), `BuildingWindow`, `UnitWindow`, `TradeWindow`, `BattleScreen`, `Digest`, `Encyclopedia` (TP X-2), `Remembrance`/`Debrief` (TP X-2). Every window is bound to an immutable **view model** built by `Conquest.App` from state + presentation; the UI never reads `GameState` directly and never decides rules (it sends orders and shows the typed result).

### 7.2 Input
- **New Input System** (`com.unity.inputsystem`; 1.20.0 is what `My project` resolved, VERIFIED-LOCAL), `activeInputHandler` = Input System only. Legacy `UnityEngine.Input` is not used.
- One `.inputactions` asset with maps `Map`, `Battle`, `UI`; actions named by function, not key.

| Action | Default binding (GDD §14.2) |
|---|---|
| EndTurn | `E` |
| ColonySitePreview | `Z` (hold or toggle: OWNER detail) |
| ExploreHalt | `X` |
| SendMessage | `C` |
| NextColony / NextCommander / NextTransport / NextScout | `F1` / `F2` / `F3` / `F4` |
| ZoomIn / ZoomOut (+Shift = extreme) | `+` (`=` and keypad `+`) / `-` (keypad `-`) |
| CloseWindow | `Esc` |
| RedirectFastExplore | Ctrl + left click |
| SpeedUpMoves / MultiSelect | Shift (modifier) |
| SelectWholeSquare (battle) | Alt + left click |
| ContextHelp | right click |
| NextUnit | `N` and `Tab` (ASSUMED additions, GDD §14.2) |
| Pan | arrow keys (ASSUMED), middle-drag |
| QuickSave / QuickLoad | Ctrl+S / Ctrl+O (ASSUMED) |

- **Remapping:** interactive rebinding (`PerformInteractiveRebinding`) in a Controls settings page; overrides saved as JSON (`SaveBindingOverridesAsJson`) in the settings file; conflicts detected and shown; a "reset to defaults" button. Displayed key names come from the Input System's display strings, wrapped in theme templates (`"Next {role}"`, TA §1.7).
- **Accessibility:** UI scale 100-200%; keyboard-only play for the whole main loop (focus navigation in UI Toolkit + map cursor actions); no time pressure; battle odds as numbers; colour + pattern for owners and fog; reduced motion setting for camera easing; all text through the theme so pseudo-locale (+30%) layout tests apply (TP10 §5.6).

---

## 8. Localisation

### 8.1 Unity Localization package vs the theme-pack text system (TA §5, TP X-1)

| Requirement (from TA §5, TP, VH §8) | Unity Localization (`com.unity.localization`) | Theme-pack text system (custom, engine-free) |
|---|---|---|
| Text lives in theme folders as JSON, swappable without rebuild, readable by `dotnet test` | String Tables are Unity assets (ScriptableObjects) built into the player; external JSON needs import tooling (UNVERIFIED for runtime loading of external tables) | yes |
| Fallback chain locale -> theme default -> parent theme -> engine base -> `[key]` | locale fallback exists; theme-parent chain does not | yes, by design |
| CLDR plural categories | yes, Smart Strings Plural formatter follows CLDR (DOCS: [Plural Formatter](https://docs.unity3d.com/Packages/com.unity.localization@1.5/manual/Smart/Plural-Formatter.html)) | own small table for shipped locales (`en`, `bn`, pseudo) |
| Whole-sentence templates, placeholder checking against the VH §8 payload fields | Smart Strings are more permissive (nested formatters); checking placeholders against a payload schema is our code either way | yes |
| `key@<slot>` override chosen by the receiving slot; `ev.match_won.player/opponent` | not a concept; would be emulated with key naming | yes |
| Theme validator (coverage, forbidden words V-01..V-27) in CI without Unity | no | yes |
| Dependency | package (approval) | none |

**REC: the theme-pack text system** in `Conquest.Theme` (engine-free), exactly as TA §5 and TP specify. Unity Localization is not needed. Locale-dependent number formatting is done by our own formatter driven by locale data in the theme (digit set, grouping pattern), not by `CultureInfo` (so it is identical in dotnet and every Unity player).

### 8.2 Plural rules
- `PluralRules.Select(locale, n) -> category`; `other` mandatory (TA §5). English: `one` if n = 1. Bengali (CLDR, as I recall it): `one` if integer part i = 0 or n = 1, else `other` (UNVERIFIED: check against the CLDR plural table before `bn` ships). The table is data in `engine/plurals.json` with a test per locale.
- Pseudo-locale uses English rules.

### 8.3 Templates and per-slot overrides
- Lookup for receiving slot S and key K: `K@S` in active locale -> `K` in active locale -> same two in theme default locale -> parent theme -> engine neutral base -> `[K]` + one warning (TA §6.2 text chain, TP X-1, VH §8 rule 1). `ev.match_won` maps to `ev.match_won.player`/`.opponent` first (VH §8 rule 2).
- Opaque ids in payloads (`site`, `group`, `season`, `region`, `slot`, `winner_slot`, `building`) render through the theme's name maps (VH §4 display-name rule); a payload never carries free text. `{unit}` (for example in `ev.unit_healed`) renders as the unit's generated name or, if it has none, its role label (N-15; to be mirrored in VH §8 by its owner).
- Events sent to both parties get no base template and are chosen by the receiving slot: besides `ev.match_won` (`.player` / `.opponent`), `ev.site_taken` maps to `ev.site_taken.gained` (receiving slot equals `to`) or `ev.site_taken.lost` (otherwise) (N-2, as VH §8 rule 2 is being extended).
- Formatter rejects unknown placeholders; CI renders every `ev.*`/`err.*` template with a sample payload built from the VH §8 field list (TP V-11).

### 8.4 Fonts and Bengali shaping (flagged unknowns)
- Bengali needs OpenType shaping (conjuncts, reordering of vowel signs, ligatures). Unity 6's UI Toolkit text uses HarfBuzz + ICU (DOCS, cited in 7.1), which is the standard shaping stack, so Bengali **should** work in UI Toolkit with a dynamic font asset of a font that covers Bengali. **Not verified:** that 6000.6's ATG enables the Indic shaper for Bengali, that line breaking is correct (ICU), that the editor and IL2CPP players include the needed data on macOS/Windows/Web, and how fallback fonts chain when a Latin font lacks Bengali glyphs. **REC:** a Phase 0 **text spike** (half a day): render the TP `_sample` Bengali string in a UI Toolkit label with a candidate font (for example Noto Sans Bengali, OFL licence UNVERIFIED, TP §1.3 note) in editor, Mac player and Web player; a Bangla-reading reviewer (TP §10.1) confirms the screenshot. Until that passes, `bn` stays out of `locales` (TP V-26).
- TextMeshPro is not used for localised text (7.1).
- Glyph coverage check (TA §3.4 step 7, TP10 §5.7): in Unity, `FontAsset`/`Font.HasCharacter`-style checks per sample string in an EditMode test (exact API for UI Toolkit font assets in 6.6 UNVERIFIED). Coverage is not shaping: the screenshot review stays required for complex scripts.
- Font files live in the theme's `assets/fonts/` with licence provenance; the engine ships one Latin UI font in `Resources` as the last fallback.

---

## 9. Save/load, replay and golden tests

- **Format:** GDD §17 and TA §3.5 unchanged: `{save_version, rules{id, version, variants, hash}, presentation{theme, locale}, match, state, rng counters}`; written by our canonical writer (pretty variant); integers only.
- **IO:** `IFileStore` in `Conquest.App`; Unity adapter writes under `Application.persistentDataPath/saves/`. Atomic save: write `name.tmp`, flush, then replace (`File.Replace` keeps a `.bak`; availability on every player UNVERIFIED, fallback move-with-backup). Rotating autosave (3 slots) at the start of every turn; newer-version save never overwritten; damaged file keeps `.bak` and returns a typed error.
- **Web:** `persistentDataPath` maps to browser storage (IndexedDB); whether Unity 6.6 syncs it automatically after a write is UNVERIFIED (older versions needed a JavaScript `FS.syncfs` call). Handled inside the Web `IFileStore` adapter; tests cover the adapter contract, not the browser.
- **Mid-battle quit:** the controller auto-resolves remaining battles deterministically with the AI tactics driver before saving (GDD §17; TP10 §10.5).
- **Replay file:** `{ruleset, variants, settings, seed, orders: [turn: [(slot, order)]]}` (TP10 §3.4). The game can record one (`-record` command-line flag in development builds only, like the platformer's `?record`). `Conquest.Tools replay <file>` prints per-turn hashes.
- **Golden tests:** goldens `g1`..`g8` (TP10 §3.4) live in `dotnet/Conquest.Tests/golden/`; `update-goldens --reason` tool and CHANGELOG pairing exactly as TP10. Run in all three runtimes (3.5).
- **Theme independence:** a save made under one theme loads under any other and under a missing theme (TA §3.5, TP10 §4.2): the presentation block is rebuilt by the app; `state` is untouched.
- Saves happen only in the `orders` phase (GDD §6.4); the pipeline's resumability test (stop at each phase boundary, serialise, reload, continue) is kept (TP10 §3.4).

---

## 10. Testing in Unity

### 10.1 Where each test runs

| Suite (TP10 section) | Host | Framework |
|---|---|---|
| Core/Rules/Ai/Theme/App unit + property tests (§2-9) | **`dotnet test`** (CoreCLR) and, the same test assembly, Unity **EditMode** (Mono) | NUnit (Unity ships its own NUnit through `com.unity.ext.nunit` 2.1.0, VERIFIED-LOCAL as a transitive package; dotnet uses NuGet NUnit). Tests use only NUnit features both versions support (UNVERIFIED which NUnit version Unity's package is based on; keep to `[Test]`, `[TestCase]`, `[TestCaseSource]`, `Assert.That`) |
| Boundary tests (§2) | dotnet (reads asmdef JSON, csproj, source text, and reflection over built assemblies) | NUnit |
| Determinism goldens (§3) | dotnet + EditMode + IL2CPP player run (nightly) | NUnit + batch-mode player |
| Theme-swap determinism (§4), save across themes | dotnet (headless app driver) | NUnit |
| Theme/variant validation (§5-6, §8 lints) | dotnet (`validate-data --strict`) | NUnit |
| No-civilian-state guard (§7) | dotnet | NUnit (planted-violation self-tests use a scratch copy of the schema in memory, not of the source tree) |
| Economy simulator, combat harness, soak (§9-10) | dotnet console + tests | NUnit |
| Presentation logic (resolver chain, view models, input map, fog upload diffing, sort points) | Unity EditMode | Unity Test Framework |
| Scene smoke, render benchmark, UI layout at 100/200% and pseudo-locale, font coverage | Unity PlayMode / EditMode | Unity Test Framework |

The Python-specific tests change shape: `PYTHONHASHSEED` runs become the three-runtime run (3.5); `ast` import-graph tests become asmdef/reflection checks; the `SetIterGuard` runtime sentinel becomes a source/IL scan for `Dictionary`/`HashSet` enumeration in engine-free assemblies (a Roslyn analyzer would make it a compile error; optional dependency).

### 10.2 EditMode vs PlayMode
- **EditMode** (fast, no scene): every engine-free test (shared source), presentation services that are plain C# behind interfaces, UXML/USS loading and querying, Input System action map checks, font coverage.
- **PlayMode** (enters play mode, real frame loop): boot scene loads data from StreamingAssets through the real async `IFileStore`; a 5-turn AI-vs-AI game renders without exceptions; render benchmark (6.8); window open/close; GC-alloc-per-frame check. Kept few and slow-marked.

### 10.3 Engine-free tests outside Unity
`dotnet test dotnet/Conquest.sln` builds the same sources (2.2) and runs in seconds without the editor or a Unity licence. It is the primary development loop (TDD per the owner's rules) and the CI gate for coverage.

### 10.4 Boundary tests via asmdef references
- Parse every `*.asmdef`: Core/Rules/Ai/Theme/App have `noEngineReferences: true`, `overrideReferences` false or with an empty precompiled list, and `references` ⊆ the allowed set (2.1); `Conquest.Core` references nothing; Ai does not reference App/Theme; no engine-free asmdef references `Unity.*` packages.
- Reflection over the dotnet-built assemblies: `GetReferencedAssemblies()` of each is within the allow-list (BCL + allowed Conquest assemblies).
- Source scans with allow-list files (TP10 §2.2 equivalents): `UnityEngine`, `System.Random`, `DateTime.Now/UtcNow`, `Environment.TickCount`, `Stopwatch` (Core), `System.IO` (all but App interfaces), `Thread`, `Task.Run`, `float`, `double`, `decimal`, `GetHashCode()` on strings, enumeration of `Dictionary`/`HashSet`, culture-sensitive calls (3.6), `static` mutable fields, `/` and `%` outside `IMath`.
- Planted-violation self-tests: each scan runs on in-memory sample sources and must report the planted line (TP10 §2.6).
- csproj/asmdef parity test (2.2).

### 10.5 Theme-swap determinism and the allow-list test
- `ThemeSwapDeterminism` (TP10 §4.1): seeds S1..S5 x 60 turns x {each shipped theme, `__empty__`, `second`}; the headless app driver loads a `Presentation` (the point of the test) but passes only state and rules to Core; per-turn hashes and typed event lists must be identical.
- `Bd1971NoCivilianState` (VH §5, TP10 §7): all ten checks against the merged rules, the **full set of `GameState` field paths**, the event id/payload table from `events.json`, and the 20-seed x 89-turn soak; plus the planted-violation table of TP10 7.3-7.4 (including a dummy `civilians` state field via a test-only schema extension and a dummy `ev.village_burned` event). **State-field snapshot (N-10):** the guard snapshots ALL state fields, hashed or not, enumerated by reflection in the test assembly (or from a generated field list produced at build time by a test-side generator that walks every field of every state type); reflection is allowed in tests, never in Core. Separately it asserts that the hashed subset (`golden/hash_fields.json`, 3.4) is a subset of that full snapshot, and that every field of the snapshot not in the hashed subset is on a reviewed `unhashed-fields` allow-list in `dotnet/Conquest.Tests/allowlists/`. So an unhashed field (a civilian counter, say) cannot slip past check 3 of VH §5 because it is missing from the hash field list.

### 10.6 Coverage and the 80% gate
- Gate measured on the engine-free assemblies with **coverlet** under `dotnet test` (`coverlet.collector` or `coverlet.msbuild`, NuGet, approval): global 80% line, per-package floors as TP10 §13.1 (Core 90/85, Ai 80, Rules 90, Theme 85, App 70).
- Presentation code: Unity's **Code Coverage** package (`com.unity.testtools.codecoverage`, approval) reports EditMode+PlayMode coverage; floor 50% (TP10's `ui` floor), advisory at first.

### 10.7 CI options

| Option | What | Needs | Approval |
|---|---|---|---|
| **Local scripts (REC first)** | `tools/ci-local.sh --stage N`: stages 0-7 of TP10 §12; dotnet stages first; Unity batch mode `-batchmode -runTests -testPlatform EditMode/PlayMode -testResults ...` last | .NET SDK; the installed editor | .NET SDK install |
| GitHub Actions + **GameCI** (`game-ci/unity-test-runner`, `unity-builder`) | Unity tests and builds on Linux runners in Docker images | a remote repo; a Unity licence activation stored as a secret (Personal licence activation on CI has its own steps; terms UNVERIFIED); runner minutes | yes: GameCI actions, Docker images, secrets, CI minutes |
| GitHub Actions without Unity | dotnet stages only (the engine-free gate), on Linux + macOS (+ Windows) | a remote repo | yes (CI minutes); cheap and licence-free |
| Unity Build Automation (cloud) | Unity's hosted builds | Unity account plan; costs (UNVERIFIED) | yes, spending |
| Self-hosted runner on the owner's Mac | full parity including IL2CPP Mac player and the reference perf machine | runner software | yes |

**REC:** local scripts now; when a remote exists, GitHub Actions for the dotnet stages (fast, no licence), and either GameCI or a self-hosted Mac runner for the Unity stages (OWNER).

### 10.8 Performance benchmarks
TP10 §11 gates kept and re-homed: `ApplyOrder` p95 < 2 ms and `EndTurn` < 300 ms at 64x64/200 units (dotnet, Stopwatch harness, median of 5 after warm-ups; blocking on the reference machine, advisory elsewhere); 128 and 256 recorded; render budgets of 6.1 in PlayMode; noise-free functional checks (copy counts linear in units, fog is `ulong[]` chunks, `World` shared by reference) always blocking.

---

## 11. Build targets and platform notes

| Target | Notes | REC |
|---|---|---|
| **macOS desktop** | module installed (VERIFIED-LOCAL); Mono for development builds, IL2CPP for release (IL2CPP inclusion in the installed module UNVERIFIED); AI planning on a background thread is safe because it reads an immutable snapshot and returns orders | **primary target, Phase 0-4** |
| Windows desktop | needs the Windows build module (install, approval); same code | add before the first external playtest |
| Web (WebGL; WebGPU opt-in in 6.6) | module installed (VERIFIED-LOCAL). **C# threads are not supported** (DOCS: no multithreaded GC in WebAssembly; only experimental native C/C++ threads; use `Awaitable` for async work: [Web multithreading](https://docs.unity3d.com/Manual/web-multithreading-intro.html)). So the AI and `EndTurn` must be **time-sliced** across frames: `IAiRunner` has a `ThreadedAiRunner` (desktop) and a `SlicedAiRunner` (Web) that runs the planner as an iterator with a per-frame time budget; the planner is written as resumable steps from the start. StreamingAssets read via `UnityWebRequest`, saves in IndexedDB (9). Memory: `webGLMaximumMemorySize` is 2048 MB in `My project` (VERIFIED-LOCAL); keep the game under ~1 GB heap (ASSUMED). Browser text shaping goes through the same ATG (UNVERIFIED on Web) | **second target**: a Web smoke build in Phase 1 (load data, draw the map, 1 turn) so threading and IO assumptions are caught early; full Web release after Phase 4 |
| Mobile (Android/iOS) | no modules installed; touch UI, UI scale, battery; UI Toolkit and Input System both support touch; 256x256 maps may need lower budgets | later; not in Phase 0-4 |

Unity 7 (CoreCLR, desktop first per Unity's post) will change the scripting runtime; the engine-free core already runs on CoreCLR under `dotnet test`, which reduces that risk.

---

## 12. Phases re-planned for Unity

Each phase ends playable and committed (GDD §1.4 decision 8), with the owner's supervisor sign-off as in this repo's rules. Hooks H1-H7 and the bd1971 variant/scenario/theme are a **ruleset 1.1 minor** (VH §1) and land after Phase 4 as Phase 5 (they need the neutral pipeline, battles and AI); the no-civilian-state guard's **static** checks start in Phase 2b, when events and state fields exist.

| Phase | Content | Exit criteria |
|---|---|---|
| **0 Skeleton** | Owner approvals (section 14); new Unity project (2.5) and `dotnet/` solution; engine package with five asmdefs; `IMath`, `Rng`, canonical writer, xxHash64/SHA-256, strict JSON reader + JSON Pointer; C# schema combinators; validator steps 1-2 on a stub `ruleset.json`; `IFileStore` (desktop + Web adapters), `index.json` generator; boundary tests (10.4) with planted-violation self-tests; Bengali text spike (8.4); `tools/ci-local.sh` stages 0-3; boot scene shows "Turn 0" via the theme text chain and one code-drawn glyph via the asset chain | `dotnet test` green with coverage >= 80% on Core/Rules; Unity EditMode green; the same test assembly passes in both hosts; empty map window opens in the editor and a Mac dev player; boundary tests fail on each planted violation; text spike result recorded |
| **1 Map and fog** | full ruleset data files (neutral) + variants `mvp`, `equal-nations` + steps 3-5; world generation (seeded, `worldgen` stream); iso Tilemap terrain, camera zoom/pan, fog texture, exploration and intel memory, scout and transport movement with terrain costs; minimal second theme (labels+palette) and `__empty__`; theme-swap test on movement-only turns; Web smoke build | explore a seeded 128 map in the editor and Mac player; render benchmark at 256x256 within 6.1 budgets on the reference Mac; worldgen identical in dotnet and EditMode (hash); Web smoke build loads and draws |
| **2a Colony economy** | found, place, produce, population, Center upgrades, preview == real turn, `Z` preview, colony window (UI Toolkit), economy simulator console tool | simulator meets GDD §4 pacing targets; preview property test green; colony window usable keyboard-only at 100% and 200% scale |
| **2b Recruit, trade, save** | recruit, patron trade with elasticity and caps, transfers, save/load (autosave rotation, `.bak`, newer-version refusal), replay recording, golden `g1`-`g3`, `g7`; static checks of the allow-list machinery | save round-trip and migration tests; goldens identical on dotnet + EditMode; save under one theme loads under another and under a missing theme |
| **3 Combat** | **Combat Demo first** (point-buy, no map), battle scene (sprites) + battle UI; then field and colony battles, capture, raid, morale; auto-resolve = AI-driven path; goldens `g4`, `g5` | Combat Demo playable; scripted battle tests; early-rush test; quitting mid-battle auto-resolves deterministically |
| **4 AI and onboarding** | `KnowledgeView`, strategic planner (data build orders, named predicates), tactical AI, `IAiRunner` threaded + sliced, three tutorial missions, profile matrix, AI-vs-AI soak, golden `g6`, three-runtime replay including an IL2CPP player (nightly) | a full scripted game finishes with no exception; matrix within 35-65%; theme-swap test (5 seeds x 60 turns) green; IL2CPP hashes equal dotnet and Mono |
| 5 (after MVP) Hooks and bd1971 | hooks H1-H7 with default elision and `test_hook_defaults_frozen`; bd1971 variant, scenario, theme; no-civilian-state guard full (incl. soak checks 7-9); `--strict`/`--release` gates; reviewer process (11) | VH §2 acceptance per hook; neutral goldens unchanged (`g8`); guard green and its self-tests red on purpose |

### 12.1 First-week plan (assumes approvals for the .NET SDK, the new project and the Universal 2D template on day 1)

| Day | Work | Done when |
|---|---|---|
| 1 | Owner approvals; install the .NET SDK; create `conquest/unity` (Universal 2D, 6000.6.3f1) and trim packages to section 14's list; create `dotnet/` solution, `Directory.Build.props` (LangVersion 9, warnings as errors), empty asmdefs + csprojs; `.gitignore` for Unity (`Library/`, `Temp/`, `Logs/`, `UserSettings/`, generated `*.csproj`/`*.sln` in the Unity root) | both hosts compile an empty `Conquest.Core`; one trivial test runs in both |
| 2 | Boundary tests (asmdef parse, reference allow-list, source scans, planted violations, csproj/asmdef parity); `IMath` (floor helper with the negative cases first) and `Rng` (golden draws) by TDD | stage 1 + part of stage 3 green; planted violations caught |
| 3 | Strict JSON reader (positions, exact integers, duplicate keys, malformed-input fuzz) + canonical writer + hashes (NIST and xxHash vectors) | reader rejects the TP10-style malformed fixtures with file/line/pointer messages |
| 4 | JSON Pointer + variant ops on the DOM; schema combinators; validator steps 1-2 on a stub ruleset with `_note` handling and unknown-key rejection; `validate-data` console command | `variant_broken_*` fixtures each produce exactly their error |
| 5 | Unity side: `IFileStore` (desktop + Web), `index.json` generator + staleness test, boot scene through theme text chain and glyph painter fallback; Bengali text spike in UI Toolkit; `ci-local.sh` stages 0-3; review (code-reviewer agent) and commit | Phase 0 exit criteria, except items deferred by the spike |

---

## 13. Risks and decisions for the owner

### 13.1 Decisions

| ID | Decision | Options | REC |
|---|---|---|---|
| D-U1 | Unity version | (a) stay on installed 6000.6.3f1 (supported until 6.7 ships; C# 9, Mono); (b) wait for 6.7 LTS; (c) target Unity 7 (CoreCLR) | (a) now, upgrade to 6.7 LTS when released; engine-free core makes the later Unity 7 move cheap |
| D-U2 | Licence | Unity Personal is free up to US$200,000 revenue and funding in 2026, splash screen optional from Unity 6 (as reported by Unity's pricing pages via search: [pricing updates](https://unity.com/products/pricing-updates); exact terms UNVERIFIED, read the current Terms of Service); Pro above | Personal; owner reads and accepts the terms (accepting terms is the owner's act) |
| D-U3 | New project vs `My project` | 2.5 | new project in `conquest/unity/`, `My project` untouched |
| D-U4 | Repo location | `conquest/` in this repo (as D-14) vs a new repo | in this repo (keeps specs, tests and the art/rules hooks together); Unity's `Library/` git-ignored |
| D-U5 | JSON | own strict reader (no dependency) vs Newtonsoft package | own reader |
| D-U6 | UI framework | UI Toolkit / uGUI / both | UI Toolkit for screen UI; sprites for the battle board; no TMP for localised text |
| D-U7 | Localisation | theme-pack system vs Unity Localization | theme-pack system |
| D-U8 | Web target timing | smoke build in Phase 1 and release after Phase 4, or desktop-only | smoke in Phase 1; design the AI runner sliceable from the start |
| D-U9 | CI | local scripts / GitHub Actions dotnet-only / GameCI / self-hosted Mac | local now; dotnet-only Actions when a remote exists; Unity CI later (OWNER) |
| D-U10 | Immutable collections | own containers vs `System.Collections.Immutable` DLL | own containers |
| D-U11 | Optional analyzers | Roslyn analyzer project for determinism bans (compile errors in both hosts) vs source-scan tests only | scans first; analyzer if scans prove noisy |
| D-U12 | Art route | undecided (TP §8) | no decision needed for Phases 0-2: the resolver chain and glyph painters keep every route open |

### 13.2 Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | Two compilers drift (C# 9 in Unity vs newer in dotnet; NUnit versions) | LangVersion pinned 9 + `netstandard2.1` for libraries; parity test; same tests run in both hosts |
| R-2 | Hidden nondeterminism (dictionary order, culture, `GetHashCode`, float sneaking into AI scoring) | section 3 bans + scans + three-runtime goldens; AI scores are integers too |
| R-3 | Unity 6.6 is not LTS; 6.7 or 7 may change APIs (text, serialization, play mode) | Unity code is thin; engine-free core unaffected; upgrade only between phases |
| R-4 | Bengali shaping does not work as hoped in UI Toolkit, or differs on Web | Phase 0 spike; `bn` gated by TP V-26 and a native-speaker screenshot review; English v1 unaffected |
| R-5 | Web: no C# threads, IndexedDB sync, memory | sliced AI runner from Phase 4 design; Web smoke in Phase 1; Web IO adapter |
| R-6 | Tilemap batching or runtime sprite creation too slow at 256x256 | `IMapLayerView` seam; chunk-mesh fallback; benchmark scene in Phase 1 exit |
| R-7 | GC hitches from immutable updates | budgets (4.4), chunk diffing, pools; measure early |
| R-8 | Own JSON reader bugs | fuzz + malformed fixtures + round-trip with the canonical writer; small surface; Newtonsoft fallback (D-U5) |
| R-9 | Unity Version Control (`My project`) vs git confusion | new project in git (D-U3) |
| R-10 | Pre-release/experimental packages (`ai.assistant` pre, `com.unity.pipeline` exp) entering the game | not installed in the new project; package list is an allow-list checked by a test reading `Packages/manifest.json` |
| R-11 | IL2CPP-only failures (stripping, AOT generics) found late | nightly IL2CPP replay from Phase 4, a manual IL2CPP build at each phase end |
| R-12 | Licence or terms change | owner reviews terms at install and at each major upgrade (D-U2) |

---

## 14. Dependency and approval list

Every item below **needs owner approval before install** (project rule: "Ask before adding dependencies"; gate before anything that installs). Nothing has been installed. Versions are what I saw locally or "latest compatible" (UNVERIFIED) where not.

| # | Item | Kind | Needed for | Phase | Status |
|---|---|---|---|---|---|
| 1 | Unity Editor 6000.6.3f1 | already installed | everything | 0 | present; using it for the new project needs the owner's yes |
| 2 | **.NET SDK** (a current LTS SDK, e.g. .NET 8 or 10; UNVERIFIED which is current on this Mac) | tool install | `dotnet test`, tools, coverage | 0 | **needs owner approval before install** |
| 3 | New Unity project from the **Universal 2D** template (pulls URP 17.6, 2D Sprite, 2D Tilemap Editor and other 2D packages; exact list UNVERIFIED) | project creation + packages | rendering, tilemaps | 0 | **needs owner approval before install** |
| 4 | `com.unity.inputsystem` (1.20.0 resolved in `My project`) | Unity package | input, rebinding | 0 | **needs owner approval before install** (may come with the template) |
| 5 | `com.unity.test-framework` (1.8.0 in `My project`) + `com.unity.ext.nunit` | Unity package | EditMode/PlayMode tests | 0 | **needs owner approval before install** (usually in templates) |
| 6 | NuGet `NUnit`, `NUnit3TestAdapter`, `Microsoft.NET.Test.Sdk` | NuGet (dev only) | `dotnet test` | 0 | **needs owner approval before install** |
| 7 | NuGet `coverlet.collector` (or `coverlet.msbuild`) | NuGet (dev only) | 80% gate | 0 | **needs owner approval before install** |
| 8 | Font for Bengali (e.g. Noto Sans Bengali, OFL licence UNVERIFIED) | asset (font file) | Bengali spike, `bn` locale | 0 spike / 5 ship | **needs owner approval before install** (licence check first) |
| 9 | Windows build module | Unity module | Windows builds | before playtests | **needs owner approval before install** |
| 10 | `com.unity.testtools.codecoverage` | Unity package | presentation coverage report | 1+ (optional) | **needs owner approval before install** |
| 11 | `com.unity.nuget.newtonsoft-json` + NuGet `Newtonsoft.Json` | package + NuGet | only if D-U5 picks Newtonsoft | 0 (optional) | **needs owner approval before install** |
| 12 | `com.unity.2d.pixel-perfect` (or URP's built-in Pixel Perfect Camera; packaging UNVERIFIED) | Unity package | only if pixel art is chosen | later (optional) | **needs owner approval before install** |
| 13 | `com.unity.addressables` (or 6.6 Content Directories, built in) | Unity package | only if art volume requires | later (optional) | **needs owner approval before install** |
| 14 | `com.unity.memoryprofiler`, `com.unity.performance.profile-analyzer` | Unity packages | deep profiling | when needed (optional) | **needs owner approval before install** |
| 15 | Roslyn analyzer project (`Microsoft.CodeAnalysis.CSharp`, `Microsoft.CodeAnalysis.Analyzers`) | NuGet + a DLL in Unity labelled as analyzer | compile-time determinism bans | later (optional, D-U11) | **needs owner approval before install** |
| 16 | BenchmarkDotNet | NuGet (dev only) | precise core benchmarks | later (optional) | **needs owner approval before install** |
| 17 | GameCI actions + Docker images + Unity licence secret; or a self-hosted runner; or Unity Build Automation | CI services (may cost) | Unity CI | when a remote exists (optional) | **needs owner approval before install** (and before any spending) |
| 18 | `com.unity.localization` | Unity package | **not recommended** (8.1) | n/a | **needs owner approval before install** if ever chosen |
| 19 | `System.Collections.Immutable` / `System.Text.Json` DLLs | NuGet DLLs in Unity | **not recommended** (4.2, 5.1) | n/a | **needs owner approval before install** if ever chosen |

Packages in `My project` that this plan does **not** need: `ai.assistant`, `ai.inference`, `ai.navigation`, `collab-proxy`, `visualscripting`, `timeline`, `com.unity.pipeline`, the 3D URP renderer assets. IDE packages (`ide.rider` / `ide.visualstudio`) are optional per the owner's editor.

---

## Sources (Unity documentation and posts checked on 2026-10-03)
- [Unity 6.6 is now available](https://discussions.unity.com/t/unity-6-6-is-now-available/1735357)
- [CoreCLR, Scripting, and Serialization Update - June 2026](https://discussions.unity.com/t/coreclr-scripting-and-serialization-update-june-2026/1723299)
- [Unity 6.6 adds WebGPU, build analysis and CoreCLR prep (news summary)](https://alternativeto.net/news/2026/9/unity-6-6-adds-webgpu-build-analysis-and-coreclr-prep/)
- [UI Toolkit text, Unity 6000.6 manual](https://docs.unity3d.com/6000.6/Documentation/Manual/UIE-get-started-with-text.html)
- [Advanced Text Generator, Unity 6.0 manual](https://docs.unity3d.com/6/Documentation/Manual/UIE-advanced-text-generator.html)
- [Announcing Full RTL Language Support](https://discussions.unity.com/t/announcing-full-rtl-language-support/1544214)
- [Web multithreading, Unity manual](https://docs.unity3d.com/Manual/web-multithreading-intro.html)
- [Localization package: Plural Formatter](https://docs.unity3d.com/Packages/com.unity.localization@1.5/manual/Smart/Plural-Formatter.html)
- [Unity pricing updates](https://unity.com/products/pricing-updates)

---

## Change log (third pass)

Source: bd1971/16-final-consistency-check.md. Decisions, UNVERIFIED tags and the section 14 approval list are unchanged.

| Report id | Change in this file | Notes |
|---|---|---|
| N-9 | Section 1.3 last bullet rewritten: "Every test name in TP10 except the Python-specific ones", each renamed (pygame bans, frozen dataclasses, `math` names, set iteration, two hash seeds, Python versions) | applied as suggested |
| N-10 | Section 10.5 `Bd1971NoCivilianState`: the guard snapshots ALL state fields by reflection in the test assembly (or a generated field list), and separately asserts the hashed subset is contained in it, with an `unhashed-fields` allow-list; section 3.4 now says `hash_fields.json` is the hashed subset only | the `unhashed-fields` allow-list is my addition to make the subset check enforceable; TP10 (being rewritten) should mention it |
| N-12 | Section 3.4: `_note`/`_`-prefixed keys stripped, version string not hashed, variant stack (ids and versions, in order) hashed beside the merged document; "null omitted" narrowed to "values equal to the declared default (null only where null is the default)" | matches VH H0.1 and the TP10 test names |
| N-13 | Section 10.5: "the planted-violation table of TP10 7.3-7.4" replaces "two planted-violation self-tests" | applied |
| N-14 | Section 2.3: variant `*.allow.json` removed from the `StreamingAssets` tree; new paragraph puts allow-lists and goldens in `dotnet/Conquest.Tests/allowlists/` and `golden/` (outside Unity's import scope), with a test that fails if any allow-list appears under `Assets/`, `Packages/` or `index.json`, and builds excluding them | settles TP10 Q2 on the 13 side; 10 and 06 are owned by others |
| N-15 | Section 8.3: `winner_slot` added to the opaque ids; `{unit}` renders as generated name or role label | the matching line in 06 is for that file's owner |
| N-2 (13 part) | Section 8.3: `ev.site_taken` mapped to `.gained` / `.lost` beside `ev.match_won` | depends on 06 section 8 rule 2 being extended; 06 still showed a single `ev.site_taken` row when read, so the sentence says it is being extended. Re-check once 06 is final |
| N-25 | not applied | the fix is a note in 10 (13 6.1 already states 16.7 ms) |
| N-16, N-1, N-3 to N-8, N-11, N-17 to N-24, N-26 | not applied | do not touch 13 |
