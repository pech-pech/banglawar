# 10 - Test plans for the neutral base (any theme, any variant)

Status: **plan (specs, test names, fixtures, assertions, acceptance criteria). No test code exists and none is written here.** Date: 2026-10-03 (C# rewrite the same day).
Inputs read from disk, as data: [GDD.md](../GDD.md) (cited GDD section n; sections 17-20 carry the Unity amendments), [04-theme-architecture.md](../04-theme-architecture.md) (TA n), [05-critique.md](../05-critique.md) (CR id), [13-unity-architecture-plan.md](../13-unity-architecture-plan.md) (13 n, the authority for tooling), [05-theme-pack-spec.md](05-theme-pack-spec.md) (TP, validators V-xx), [06-variant-and-hooks-spec.md](06-variant-and-hooks-spec.md) (06 n, the authority for rules, events, predicates and the guard's ten checks), [09-verification-errata.md](09-verification-errata.md) (ER n), [16-final-consistency-check.md](16-final-consistency-check.md) (N-n).

**Tooling note (2026-10-03).** The engine is Unity 6 (`6000.6.x`, C# 9, .NET Standard 2.1) with an engine-free C# core (13). This plan was first written for Python, pytest and pygame; it is now written for C#: **NUnit** tests compiled from one source set and run under **`dotnet test`** (CoreCLR, the primary loop and the coverage gate, measured with **coverlet**) and, for the engine-free suites, also in **Unity EditMode** (Mono); presentation tests use the **Unity Test Framework** (EditMode and PlayMode). Assemblies, folders and tools follow 13 section 2. Module paths of the old text map as `core/x.py` -> type `X` in `Conquest.Core`; `PYTHONHASHSEED` runs -> the multi-runtime replay test (13 3.5); `ast` checks -> asmdef, reflection, IL and source scans (13 10.4); pygame/fontTools font checks -> Unity font checks or an own font-table reader (13 8.4); `sorted()` -> ordinal sort with explicit tie-breaks (13 3.3). Rules, ids, payloads and test intent are unchanged. Appendix A maps every old test id to its C# id or says why it was removed. **Nothing here is installed; Appendix B lists every dependency the plan implies, each needing the owner's approval before install.**

**Scope rule.** Everything in sections 1-6 and 8-13 holds for ANY theme and ANY variant. Nothing in those sections may name 1971, Bangladesh or any real place, person or formation. Where the bd1971 variant is the first consumer of a generic test, the test is written once, parameterised, and bd1971 appears only as one row of a discovered catalogue (section 1.4). Section 7 defines generic guard machinery plus its first instance; the per-variant data (allow-lists, word lists) lives with test data outside the shipped tree (section 1.2), never in the neutral suite's code.

**Items that may change (parallel agents are editing 05, 06 and 08; flagged `[VOLATILE]` where used).**
- V1. **Settled** (owner, 2026-10-03; 06 section 1): the shortage and capture switches are dropped. This plan never asserts `economy.shortage.kind` or `combat.capture.pop_outcome`. If the owner ever restores them, section 7.6 lists the checks to re-add.
- V2. **Settled** (06 H4, R-11; N-24): neutral `homeless_turns_limit` 15 and `no_base_no_founder_grace_turns` 0; bd1971 sets the grace to 15 (it only switches off the neutral instant elimination). `null` grace was not applied (06 "Not applied", P2-8). Section 6.6 tests H4 generically and reads every number from rules data.
- V3. **Settled** (06 H4 and section 4; N-24): K = 6 from `end_conditions.tag_counts`, N = 3; "4 of 6" is still offered to the owner (08 Q5), so tests read K and N from scenario data, never from a literal.
- V4. `[VOLATILE]` The neutral shortage event id `ev.pop_lost{base, amount, cause}` and the warning `warn.food_shortage{base}` are 06's proposed names (06 G-8.5, G-12); the GDD has not adopted them yet (N-27). Tests reference them through a rules lookup (`Rules.Events.ShortageEventId`, `Rules.Events.FoodShortageWarningId`), not a literal, except where marked.
- V5. `[VOLATILE]` Variant op paths such as `/economy/tax/...` and `/features/...` are proposals (06 R-10). Tests resolve JSON Pointers against the real merged document and never hard-code a path list.
- V6. `[VOLATILE]` V-numbered theme validators (V-04, V-07, V-11, V-18, V-21, V-24) belong to 05, which is being edited. Section 8 refers to them by purpose; numbers appear only in cross-reference columns.
- V7. Estimated sizes and thresholds (benchmarks, pass bands) are GDD ASSUMED values and are read from the tunables, not duplicated in tests.
- V8. `[VOLATILE]` Hook names and the top-level members of the merged document (06 H0.4) are proposals; golden files that list them (`hook_defaults_v1.json`, `rules_hash.json`) are written only after the ruleset author fixes them.

---

## 1. Test strategy and layout

### 1.1 Goals
1. Prove the three-layer claim of GDD 2: the **ruleset** is the only thing that changes game outcomes; a **theme** is a skin; a **variant** is a typed, validated overlay.
2. Catch the risks the review named as most likely to bite: determinism holes (CR H-8; in C#: dictionary order, culture, `GetHashCode`, floats, runtime differences, 13 3.5), theme leaks (CR C-2, TA 4), economy runaway (CR H-4, H-5), and assembly-boundary rot.
3. Be fast. `dotnet test` without category filters stays under 90 s on a developer laptop (ASSUMED budget). Heavy suites carry an NUnit `[Category]` and run in later CI stages (section 12).

### 1.2 Project layout (13 2.1-2.2; folder `conquest/` per D-14 as answered by 13)

```
conquest/
  unity/
    Packages/com.conquest.engine/            # embedded UPM package = engine-free code (13 2.2)
      Runtime/Core|Rules|Ai|Theme|App/       # Conquest.Core ... Conquest.App (noEngineReferences: true)
      Tests/                                 # engine-free NUnit SOURCES, compiled by both hosts
        Core.Tests/    Conquest.Core.Tests.asmdef    # one folder per runtime assembly
        Rules.Tests/   Conquest.Rules.Tests.asmdef
        Ai.Tests/      Conquest.Ai.Tests.asmdef
        Theme.Tests/   Conquest.Theme.Tests.asmdef
        App.Tests/     Conquest.App.Tests.asmdef     # headless driver, replay runner, theme swap, save
        Support/       Conquest.Tests.Support.asmdef # catalogue discovery, fixture builders,
                                                     # replay runner, property runner, test data paths
    Assets/
      StreamingAssets/conquest/              # SHIPPED data only: rules, variants, scenarios, settings,
                                             # themes incl. the minimal `second` theme (D-10). No test data.
      Conquest/Tests/EditMode/               # Conquest.Unity.Tests.EditMode: presentation logic, font
                                             # coverage, golden replays on Mono, asset/audio resolvers
      Conquest/Tests/PlayMode/               # Conquest.Unity.Tests.PlayMode: layout, smoke, render bench
  dotnet/
    Conquest.sln
    Conquest.Tests/Conquest.Tests.csproj     # globs the package Tests/ sources (13 2.2): runs the
                                             # SAME tests as Unity EditMode, on CoreCLR
    Conquest.Tests.Host/Conquest.Tests.Host.csproj
                                             # dotnet-only tests: boundary scans (asmdef/csproj/source/IL),
                                             # multi-process determinism, no-civilian-state guard, lints,
                                             # simulator, combat matrix, soak, perf
      Boundary/ Determinism/ Guards/ Lints/ Sim/ Combat/ Soak/ Perf/
    Conquest.Tests/golden/                   # replays/*.json, hashes/*.json, rng.json, hash_fields.json,
                                             # hook_defaults_v1.json, stack_pairs.json, CHANGELOG.json
    Conquest.Tests/fixtures/                 # rules/, themes/ (empty, broken_*, pseudo), variants/
                                             # (broken_*), scenarios/, maps/, builds/
    Conquest.Tests/allowlists/               # guard data: <variant>_state.json, <variant>_review.json,
                                             # forbidden_tokens.json, boundary allow-lists (N-14)
    Conquest.Tests/packlint/<themeId>/       # CI-only pack lint data: lint.json, real_names.json
    Conquest.Tools/                          # console: replay, simulate, soak, validate-data,
                                             # update-goldens, snapshot-allowlist, make-pseudo-locale
  tools/ci-local.sh                          # stages of section 12, dotnet first, Unity batch mode last
```

Rules of the layout:
- **Two dotnet test projects** (refinement of 13 2.2's single `Conquest.Tests`; REC, for 13's owner): `Conquest.Tests` compiles exactly the package `Tests/` sources, so a test that passes there passes in Unity EditMode too; `Conquest.Tests.Host` holds tests that need things Unity EditMode should not do (spawn processes, read the repo's asmdef/csproj/source tree, read IL, run long soaks). Both reference the engine-free assemblies only.
- **No test data in the shipped tree (N-14).** Golden files, fixtures, guard allow-lists, review logs and pack lint lists live under `dotnet/Conquest.Tests/`, outside Unity's import scope and outside `StreamingAssets`, so no player build carries them. EditMode tests read them by repo-relative path through `Conquest.Tests.Support.TestData` (resolved from the test assembly location; fails with a clear message if the repo layout is not found). A test `ShippedData_ContainsNoTestOnlyFiles` fails if `StreamingAssets/conquest/` contains any `*_state.json`, `*_review.json`, `*.allow.json`, `forbidden_tokens.json`, `lint.json` or `real_names.json`, or if `index.json` lists one.
- Test assemblies in Unity carry `defineConstraints: ["UNITY_INCLUDE_TESTS"]`; the engine-free test asmdefs keep `noEngineReferences: true` (13 2.1).
- Unity's NUnit (`com.unity.ext.nunit`) and NuGet NUnit may differ in version (13 10.1, UNVERIFIED which NUnit Unity's package is based on). Shared tests use only `[Test]`, `[TestCase]`, `[TestCaseSource]`, `[Category]`, `[SetUp]`, `Assert.That`, `Assert.Ignore`; `[SetCulture]` is used in shared tests only after a Phase 0 check that Unity's NUnit supports it (otherwise the culture tests move to `Conquest.Tests.Host`).

### 1.3 Fixtures (the cast that makes tests generic)

All fixture builders live in `Conquest.Tests.Support.Fixtures` and return **immutable** Core and Rules objects (sealed types, `readonly` fields, `ImmArray<T>`, 13 4.3), so no test can change a fixture another test sees. Test-side mutable helpers (a `List<T>` while building) are never stored in a `static` field; a boundary test on the support assembly (`TestSupport_HasNoMutableStatics`) enforces it. This replaces the old deep-freeze check.

| Fixture (`Fixtures.X`) | What it is | Used by |
|---|---|---|
| `RulesNeutral` | The shipped `conquest-core` ruleset at its declared minor version, no variants | most suites |
| `RulesMvp` | `RulesNeutral` + variant `mvp@1` | pacing, soak |
| `RulesTiny` | Hand-made ruleset (real numbers kept, tiny map, 2 factions) in `fixtures/rules/tiny/` | fast unit and property tests |
| `Catalogue.Variants` | All shipped variants discovered from `StreamingAssets/conquest/index.json` (never listed by name) | section 6 parameterisation |
| `VariantBroken(name)` | Planted-defect variants, one defect each (6.2), in `fixtures/variants/` | section 6 negative tests |
| `Catalogue.Themes` | All shipped themes discovered from `index.json` | sections 4, 5, 8 |
| `ThemeEmpty` | Manifest only, no other file (TA 2.10), in `fixtures/themes/empty/` | theme-swap, fallback tests |
| `ThemeSecond` | The **minimal** second theme (labels and palette only, D-10). It ships (`StreamingAssets/conquest/themes/second/`) and is also discovered as a test theme | theme-swap |
| `ThemePseudo` | Pseudo-locale of the neutral base locale, generated by `Conquest.Tools make-pseudo-locale` (accents, +30% length, 5.6) | layout and lint tests |
| `ThemeBroken(name)` | Planted defects: a ruleset key in a theme file, a missing role, a bad placeholder, a missing plural `other`, a font lacking a glyph | section 5 negative tests |
| `Scenario(name)` | Tiny scenarios on `fixtures/maps/` | everything that needs a game |
| `Replay(name)` | A recorded order list from `golden/replays/` | determinism |

### 1.4 Parameterisation of themes and variants

NUnit case names come from the discovered ids, so a new theme or variant is covered the day it is added to `index.json`, with no test edit.

```
static IEnumerable<TestCaseData> Themes()   => Catalogue.Themes.Select(id => new TestCaseData(id).SetName("{m}(" + id + ")"))
                                               .Append(new TestCaseData("__empty__"));
static IEnumerable<TestCaseData> Variants() => Catalogue.Variants.Select(...);
[TestCaseSource(nameof(ThemeVariantPairs))] public void ThemeCoverage(string themeId, string variantId) ...
```
(Shape only; no code is written here. Ordinal ordering of the discovered ids keeps case order stable.)

Meta-tests: `Catalogue_DiscoveryIsNotEmptyAndNotStale` fails if discovery returns zero themes or variants, if a theme folder has no `theme.json`, or if `index.json` is stale against the files (13 2.4); `Catalogue_EveryShippedVariantHasHashGolden` fails if a variant stack has no entry in `golden/hashes/rules_hash.json`.

Per-theme and per-variant data that tests must read (forbidden-word lists, guard allow-lists, real-name lists) is loaded **by id from the test-data folders** of 1.2 (`allowlists/<variantId>_*.json`, `packlint/<themeId>/lint.json`), never embedded in test code. If a file is absent the case calls `Assert.Ignore("no list declared for <id>")`, and `Catalogue_IgnoredCasesAreDeclared` prints the ignore set and fails if a variant or theme that declares `guards: [...]` or `lint: true` has none (the declaring file decides whether absence is an error).

### 1.5 Categories and speed classes (replace pytest marks)

| NUnit `[Category]` | Meaning | Host | Stage |
|---|---|---|---|
| (none) | unit, boundary, validation; each < 1 s | dotnet (+ EditMode for shared sources) | 1-3 |
| `Replay` | golden replays on CoreCLR | dotnet, EditMode | 4 |
| `MultiProcess` | spawns two `Conquest.Tools` processes (string-hash randomisation differs per process) | dotnet (`Tests.Host`) | 4 |
| `Culture` | runs under `tr-TR`, `bn-BD`, `en-US` current cultures | dotnet, EditMode | 4 |
| `Il2cpp` | golden replays in a development IL2CPP player in batch mode | player build | nightly, release |
| `Swap` | theme-swap determinism (5 seeds x 60 turns x themes) | dotnet | 5 |
| `Sim` | economy simulator, 60-turn scripted builds | dotnet | 5 |
| `Combat` | combat harness, matrix | dotnet | 6 |
| `Soak` | AI-vs-AI full games | dotnet | 6 (nightly for the long set) |
| `Perf` | benchmarks | dotnet, PlayMode | 7, advisory on shared runners (11) |
| `PlayMode` | Unity PlayMode | Unity batch mode | 7 |

Selection: `dotnet test dotnet/Conquest.sln --filter "Category=Replay"`, `--filter "TestCategory!=Soak&TestCategory!=Perf"` for the default loop; Unity: `-batchmode -runTests -testPlatform EditMode|PlayMode -testCategory ...` (13 10.7).

### 1.6 Naming and style
- One fixture class per subject, named `<Subject>Tests`; method names state behaviour in PascalCase, `Subject_Condition_Expected` where a condition matters (project rule "test names state behaviour"). The mechanical rename of an old id is: drop `test_`, PascalCase the words, place the method in its subject's class (`test_draw_is_pure` -> `RngTests.DrawIsPure`). Appendix A lists every old id with its new id; ids that change by more than the mechanical rule are marked.
- Arrange-Act-Assert structure.
- One assertion theme per test; parameterise with `[TestCase]`/`[TestCaseSource]` instead of looping, so a failure names its theme, variant or seed.
- Every failing assertion message carries a path (file + JSON Pointer + line/column from the strict reader, or assembly + type + member, or source file + line) in the style of the validator's `Diagnostic` (13 5.3).

---

## 2. Core purity and boundary tests

These run in stage 1 (no game execution), take well under 5 s and block merge. They live in `Conquest.Tests.Host/Boundary/` and read four real sources: the `.asmdef` JSON files, the `dotnet/` csproj files, the **compiled** engine-free assemblies (reflection and IL via `System.Reflection.Metadata`, which ships with the .NET runtime that runs the tests; UNVERIFIED that no extra package is needed, otherwise it joins Appendix B), and the C# source text (token-level scans that skip comments and string literals). "Engine-free assemblies" = `Conquest.Core`, `Conquest.Rules`, `Conquest.Ai`, `Conquest.Theme`, `Conquest.App` (13 2.1).

### 2.1 Assembly-graph tests: `AsmdefBoundaryTests` (replaces the Python import graph)

| Test | Assertion |
|---|---|
| `EngineFree_HaveNoEngineReferences` | each engine-free asmdef has `noEngineReferences: true`, `overrideReferences` false (or an empty precompiled list), no `Unity.*` package reference |
| `Core_ReferencesNothing` | `Conquest.Core.asmdef` `references` is empty; the built `Conquest.Core.dll` references only BCL assemblies (`GetReferencedAssemblies()` within `bcl_assemblies.json`) |
| `Each_ReferencesOnlyAllowedAssemblies` | per 13 2.1: Rules -> Core; Ai -> Core, Rules; Theme -> Core, Rules; App -> Core, Rules, Ai, Theme. Checked on both the asmdef and the built assembly |
| `CoreAndAi_NeverReachThemeAppOrUnity` | transitive closure over the reference graph: no path from Core or Ai to Theme, App, `Conquest.Unity.*` or `UnityEngine*`; the failure prints the shortest chain |
| `Core_DoesNotReferenceAi` | CR C-1; GDD 6.2 |
| `NoAssembly_ReferencesUnityPresentationExceptTests` | only test assemblies reference `Conquest.Unity.*` |
| `EngineFree_NoDynamicLoadingOrCodegen` | IL scan: no calls to `Assembly.Load*`, `Activator.CreateInstance`, `Type.GetType(string)`, `System.Reflection.Emit`, `Expression.Compile`, `AppDomain`, and no `dynamic` (`Microsoft.CSharp` reference) in engine-free assemblies; reflection namespaces only in an allow-listed file list (expected empty for Core) |
| `CsprojAndAsmdef_AreInParity` | each `dotnet/*/Conquest.*.csproj` globs exactly its asmdef's folder and has the same references (13 2.2, R-1) |
| `UnityPackages_ManifestMatchesAllowList` | `unity/Packages/manifest.json` lists only approved packages (13 R-10; list in `allowlists/unity_packages.json`) |

BCL allow-list for engine-free code (`allowlists/bcl_namespaces.json`, reviewed on change; replaces the Python stdlib list): `System` (primitive types, `Math` only for `Max`/`Min`/`Abs` on integers), `System.Collections.Generic` (`List<T>`, `Dictionary`/`HashSet` as **lookup-only locals**, 2.3), `System.Linq` (ordering only with an explicit integer key or `StringComparer.Ordinal`, 2.3), `System.Buffers.Binary`, `System.Text` (`UTF8Encoding`, `StringBuilder`), `System.Globalization` (only `CultureInfo.InvariantCulture`, `NumberStyles`, `NormalizationForm`), `System.Runtime.CompilerServices` (attributes, `IsExternalInit` polyfill), `System.Diagnostics.CodeAnalysis` (attributes), `System.IO` **only** in `Conquest.App` interfaces (`IFileStore` signatures) and, if needed, `MemoryStream` in the canonical writer.

### 2.2 Forbidden capabilities in engine-free code: `CapabilityScanTests`

Each row is one test; detection is source scan plus IL scan, with an allow-list file per test (expected empty unless noted).

| Test | What it detects | Notes |
|---|---|---|
| `EngineFree_HasNoUnityEngineReference` | `UnityEngine`, `UnityEditor`, `Unity.Mathematics`, `Unity.Burst`, `Mathf`, `Vector2` | backs up `noEngineReferences` (replaces the pygame bans) |
| `EngineFree_HasNoClockAccess` | `DateTime.Now`/`UtcNow`/`Today`, `DateTimeOffset.Now`, `Stopwatch`, `Environment.TickCount*`, `Thread.Sleep`, `Task.Delay`, `Timer` | App reads time only through `IClock` (13 2.1) |
| `EngineFree_HasNoAmbientRandomness` | `System.Random`, `RandomNumberGenerator`, `Guid.NewGuid`, `RNGCryptoServiceProvider` | only `Conquest.Core.Rng` draws (2.4) |
| `EngineFree_HasNoIoOutsideFileStore` | `File`, `Directory`, `FileStream`, `StreamReader/Writer` on files, `Console`, `Process`, `System.Net`, `HttpClient`, sockets | App only through `IFileStore`; Core's canonical writer works on byte buffers |
| `EngineFree_HasNoEnvironmentOrCultureReads` | `Environment.GetEnvironmentVariable`, `GetCommandLineArgs`, `CultureInfo.CurrentCulture`/`CurrentUICulture`, `RuntimeInformation` | |
| `EngineFree_UsesOrdinalAndInvariantOnly` | culture-sensitive calls: number `ToString()`/`Parse` without `InvariantCulture`; `ToUpper`/`ToLower` (non-`Invariant`); `string.Compare`, `StartsWith`, `EndsWith`, `IndexOf(string)` without `StringComparison.Ordinal`; `List<string>.Sort()`, `OrderBy(s => s)` without `StringComparer.Ordinal` | 13 3.3, 3.6 |
| `EngineFree_NeverCallsStringGetHashCode` | `GetHashCode()` on `string` or on any type that does not override it deterministically; `record` auto-equality on hashed or persisted types | CoreCLR randomises string hashes per process (13 3.2, 3.4) |
| `EngineFree_HasNoMutableStatics` | reflection: every `static` field is `static readonly` (or `const`) of an immutable type (primitive, string, `ImmArray<T>`, own immutable types); no `static` arrays or collections | replaces `test_core_has_no_global_mutable_state`; also matters for 6.6's no-domain-reload play mode (13 3.5) |
| `Core_HasNoFloatingPointOrUncheckedDivision` | reflection over field, parameter and return types and IL opcodes (`ldc.r4`, `ldc.r8`, `conv.r*`) for `float`, `double`, `decimal` in Core, Rules (rule values), Ai and the state; integer `/` and `%` outside `Conquest.Core.IMath`; `Math.Floor/Ceiling/Round/Truncate`, `Math.DivRem` | replaces `test_core_math_names_are_integer_safe` (N-9); allow-list `allowlists/float_allow.json` expected empty; arithmetic in `IMath` runs `checked` (13 3.1) |
| `CoreState_TypesAreSealedAndReadonly` | reflection over every type reachable from `GameState`: classes `sealed`; all instance fields `IsInitOnly`; no public setter other than `init`; structs carry `IsReadOnlyAttribute`; no field of type `T[]`, `List<T>`, `Dictionary<,>`, `HashSet<>` (state uses `ImmArray<T>`, `IdMap<T>`, 13 4.3); no field of type `object` (nothing hides behind an untyped field, which also serves 7.2 check 3) | replaces `test_core_dataclasses_are_frozen` (N-9) |
| `ApplyOrder_NeverMutatesInput` | runtime, 500 fuzzed orders: canonical bytes of the input state before and after `ApplyOrder` and `Pipeline.Advance` are identical; the input's `ImmArray` backing arrays compare element-wise equal to a copy taken before the call | `[Category]` none; fuzz from the property runner (9.2) |

### 2.3 No enumeration of hashed collections: `HashedEnumerationTests` (replaces "no set iteration")

GDD 18 and CR H-8(a), in C# terms (13 3.3): never enumerate a `Dictionary<,>`, `HashSet<>`, `ConcurrentDictionary<,>`, `Hashtable` or `ImmutableDictionary` in engine-free code; lookups (`TryGetValue`, `ContainsKey`, `Contains`, `Count`) are fine. Static analysis is imperfect, so use four layers.

1. **Source rule A.** Flag `foreach` over, LINQ operators on, `ToList`/`ToArray` of, `string.Join` over, and `.Keys`/`.Values` of an expression whose declared type is one of the banned collection types (resolved from declarations in the same file; unresolved cases are reported as "unknown" and must be allow-listed with a reason).
2. **IL rule B.** IL scan for calls to `GetEnumerator`, `get_Keys`, `get_Values` on the banned types, and for a banned-type value passed where `IEnumerable<>` is expected (call sites of `System.Linq.Enumerable` with a banned-type argument, detected from the preceding load's static type).
3. **Type rule C.** Reflection: no field, property, parameter or return type in engine-free assemblies is a banned collection type (they may appear only as method locals), so no state, API or rules object can carry one. Sorting rule: `Array.Sort`/`List.Sort` are not stable, so every sort of entities must use the shared tie-break comparers (`Core.Order.Compare*`, 06 H0.2: list index, then slot id, then `(y, x)`); a source scan flags a `Sort`/`OrderBy` whose key is not an integer id or an ordinal comparer.
4. **Backstop.** The multi-runtime and multi-process replay tests of 3.3 catch any order dependence the static layers miss. A Roslyn analyzer would turn rules A-C into compile errors in both hosts; it is optional (13 D-U11) and needs approval (Appendix B).

Self-test `HashedEnumerationScan_CatchesPlantedCode`: the planted samples are not compiled at test time (that would need the Roslyn compiler package); they are **fixture source files** compiled into a separate test-only assembly `Conquest.Tests.Plants` (not referenced by any runtime assembly, excluded from coverage): `foreach (var k in dict)`, `set.ToList()`, `dict.Keys.First()`; the test asserts three findings there and zero findings for three compliant samples (`dict.TryGetValue`, `set.Contains`, `ids.OrderBy(i => i)` on integers). The same plants assembly serves 2.6.

### 2.4 Randomness and hashing entry points: `EntryPointTests`

Only `Conquest.Core.Rng` computes draws (SplitMix64 finaliser, stream codes by FNV-1a-64, 13 3.2); only `Conquest.Core` hashing types compute hashes; only `Conquest.App` reads the clock, through `IClock`, for UI animation and autosave timestamps.

- `HashingCode_OnlyInRngAndHashingTypes`: the SplitMix, FNV-1a-64, 64-bit state hash and managed SHA-256 implementations exist only in `Rng`, `StableHash`, `Sha256`, `RulesHash` (13 3.4); `System.Security.Cryptography` is referenced by no engine-free assembly (the BCL SHA-256 is used only in a test that compares it with ours).
- `RngCallSites_PassRegisteredStream`: every `Rng.Draw`/`Rng.Range` call in Core and Ai takes its stream argument from a registered `StreamId` (`StreamId.Worldgen`, `StreamId.Combat(battleId)`, `StreamId.Ai(slot)`, `StreamId.Economy`); the argument count is fixed by the signature, so the old "at least four arguments" check is enforced by the compiler; no call passes a module-level counter (IL: no `ldsfld` of a mutable static, already banned by 2.2).
- `CosmeticStream_UnreachableFromCore` (TA P-9): `StreamId.Cosmetic` lives in `Conquest.Theme`/`App`, which Core and Ai cannot reference (2.1); the test asserts the name appears in no Core or Ai source, and a runtime test runs `NewGame` and `Advance` with an App cosmetic-stream provider that throws on use: no throw.

### 2.5 Data-file boundary: `RulesDataBoundaryTests`

- `RulesData_ContainsNoThemeVocabulary`: scan all keys and string values under `rules/core/` and `rules/variants/` for any label present in any shipped theme's base-locale `roles` table that is not itself a role id (for example "Fort", "Farm", "Gold" as a value or key). Whole-word, case-insensitive (`StringComparison.OrdinalIgnoreCase` on NFKC-normalised text); role ids (`bld.garrison`) and every `_`-prefixed key (`_note`) are excluded (TA/CR C-2).
- `RulesData_ContainsNoPresentationKeys`: no key in `{label, name, icon, sprite, glyph, color, sound, flag, palette, font, locale, text}` anywhere under `rules/`.

### 2.6 Planted-violation self-tests: `BoundarySelfTests`

Every scan of 2.1-2.5 is a function taking its inputs (a folder of asmdef/csproj files, a set of source files, a set of assemblies), so it can run on plants. `EachScan_ReportsItsPlantedViolation` (one `TestCaseSource` row per scan) runs each scan on (a) a temporary asmdef/csproj tree written under `Path.GetTempPath()` with one planted defect (Core asmdef with `noEngineReferences: false`; Core referencing `Conquest.Theme`; Ai referencing App; a csproj glob that drifted), (b) planted source files and (c) the `Conquest.Tests.Plants` assembly, with one plant per rule: `using UnityEngine;`, `DateTime.Now`, `new System.Random()`, `File.ReadAllText`, `Assembly.Load(name)`, a mutable static list, `foreach` over a dictionary, a non-sealed state class with a setter, `"x".GetHashCode()`, `names.Sort()` on strings, `a / b` on integers outside `IMath`, a `double` field, a `float` literal. It asserts the expected finding (file, line or member). `EachScan_CleanInputHasNoFindings` runs each scan on a clean sample and asserts none. The real tree is never edited.

---

## 3. Determinism

All hold for any ruleset+variants combination; parameterise over `RulesNeutral`, `RulesMvp`, and one hook-enabled variant if present.

### 3.1 Counter-based RNG: `RngTests` (GDD 18, CR H-8b, 13 3.2)

API under test (shape only): `ulong Rng.Draw(ulong seed, StreamId stream, int turn, ulong key)` and `int Rng.Range(ulong seed, StreamId stream, int turn, ulong key, int lo, int hiExclusive)`.

| Test | Assertion |
|---|---|
| `DrawIsPure` | same arguments give the same result across 1000 calls and in a second process (`MultiProcess`) |
| `DrawDependsOnEveryArgument` | changing any one of `seed`, `stream`, `turn`, `key` changes the output for at least 99.9% of 10,000 argument tuples from a fixed test generator |
| `StreamsAreIndependent` | draws on `StreamId.Combat(7)` are identical whether or not any number of draws were made on `Ai(f1)`, `Economy`, `Worldgen` (record A; interleave 1..N draws on B; record A again; compare) |
| `RemovingAnAiDraw_DoesNotMoveCombat` | a fixed battle fixture run twice, the second time with a test-only `IPlanner` that makes one extra draw on its own stream (substituted through the App driver, not by patching Core); the battle outcome is identical (CR H-8b) |
| `RangeIsUnbiasedEnough` | 120,000 draws into [0, 9]: each bucket within 5% of the mean (fixed seed, so not flaky) |
| `RangeBoundsInclusiveExclusive` | no value `< lo`, none `>= hiExclusive` over 10,000 draws; `lo == hiExclusive - 1` always returns `lo`; `lo >= hiExclusive` is an `ArgumentException` (a programming error, documented) |
| `DrawHandlesExtremeInputs` | seeds and keys `0`, `ulong.MaxValue`, turn `0` and `int.MaxValue` give values in range and do not throw; the rejection loop of `Range` terminates (bounded by `key + attempt` redraws, 13 3.2) |
| `DrawMatchesGoldenTable` | 32 `(args -> value)` pairs in `golden/rng.json` pin the algorithm; any change fails, which is intended (it also changes every replay) |
| `SplitMix64MatchesPublishedVectors`, `Fnv1a64MatchesPublishedVectors` | the finaliser and the stream-code hash equal published reference outputs |
| `StreamCodesAreFnv1a64OfUtf8Name` | each registered stream's 64-bit code equals FNV-1a-64 over its UTF-8 name, pinned in `golden/rng.json`; an unknown stream name is rejected when a `StreamId` is built |

### 3.2 Integer percent math and the floor helper: `IMathTests` (CR H-8c, 13 3.1)

Source of truth: `Conquest.Core.IMath` with `FloorDiv`, `Pct`, `PerMille`, `Scale`, `ChainPct`. **C# `/` truncates toward zero** (`-7 / 2 == -3`), unlike Python `//`; the helper floors toward negative infinity.

| Test | Assertion |
|---|---|
| `FloorDivRoundsTowardNegativeInfinity` | table of 40 cases including negatives: `FloorDiv(-7, 2) == -4`, `Scale(-7, 1, 2) == -4`, `Pct(-1, 50) == -1`, and the contrast case `-7 / 2 == -3` documented in the test |
| `IMathIsTheOnlyDivisionSite` | covered by `Core_HasNoFloatingPointOrUncheckedDivision` (2.2); listed so the intent is explicit |
| `ChainPctFloorsOnce` | `FloorDiv(a * p1 * p2, 10000)` equals `ChainPct(a, p1, p2)` for 10,000 generated triples ("one floor at the end", 06 7.2 H3 x movement setting) |
| `OverflowThrows` | intermediate products are `long` in a `checked` block: a deliberately huge input throws `OverflowException` instead of wrapping |
| `MovementSettingRatiosAreRationalPairs` | Easy 3/2, Normal 1/1, Difficult 2/3 stored as integer pairs; applying each to 1..50 movement points gives the stored golden table |
| `ModifierClampIsIntegerPercent` | the GDD 8.4 productivity formula fed worked example 1 (a coin extractor landing exactly on -100%) returns exactly 0, example 2 returns the stored integer; examples in `fixtures/rules/econ_examples.json` |
| `InterestUsesPerMilleAndCap` | 5% interest on 1000 for 50 turns, with and without the cap tunable, equals stored integer sequences |
| `RulesLoaderRejectsFractionalNumbers` | the strict reader (13 3.7) rejects `0.05`, `5e-2`, `+5`, `NaN` and numbers outside `long` where an integer is required, with file, line, column and JSON Pointer; numbers are never routed through `double` |

### 3.3 Runtime and process independence (replaces the two `PYTHONHASHSEED` runs; GDD 18, CR H-8a, 13 3.5)

The Python plan ran each replay under two hash seeds. The C# risks differ (13 3.5): runtime (Mono, IL2CPP, CoreCLR), per-process string-hash randomisation on CoreCLR, and the current culture. Three mechanisms replace it:

1. **Multi-runtime replay** `Replay_IdenticalAcrossRuntimes` (parameterised over every golden replay): (a) `dotnet test` on CoreCLR, (b) the same test source in Unity EditMode on Mono, (c) `[Category("Il2cpp")]`: a development IL2CPP player in batch mode with `-replay <file> -out <hashes.json>`, compared by a dotnet test that reads the output. All three per-turn `rules_state_hash` lists must equal the golden file (3.4). (c) runs nightly and before releases (needs a player build; 13 3.5).
2. **Multi-process replay** `Replay_IdenticalAcrossTwoProcesses` (`MultiProcess`): spawn `Conquest.Tools replay <file>` twice; CoreCLR randomises `string.GetHashCode` per process, so any hidden dependence on hash order shows up as a difference. This is the direct heir of the two-hash-seed test.
3. **Culture runs** `Replay_IdenticalUnderCultures` (`Culture`): one golden replay plus the loader, writer and hasher under `tr-TR`, `bn-BD` and `en-US` (13 3.6).

Further tests:
- `StateHash_IndependentOfConstructionOrder`: build the same state through two different construction orders (units added in shuffled order by a seeded test generator, then normalised by the constructors' id sort); hash both; equal.
- `Worldgen_IdenticalAcrossRuntimesAndProcesses`: mechanisms 1-2 for `Worldgen.Generate(seed)` on 5 seeds at sizes 80 and 128; compare the canonical terrain bytes and the discovery list.
- `AiPlan_IdenticalAcrossRuntimesAndProcesses`: mechanisms 1-2 for `Planner.Plan(view, rng)` over a recorded mid-game `KnowledgeView`.
- **Harness sanity (the tests must be able to see a difference):** `ProcessHarness_StringHashReallyVaries`: a probe command prints `"conquest".GetHashCode()` in two processes; the values differ (otherwise mechanism 2 is vacuous; if a future runtime stops randomising, the test fails and the plan must be revisited). `CultureHarness_ReallyChangesOrder`: under `tr-TR` a culture-sensitive sort or `ToUpper` of a planted string differs from the ordinal result (13 3.5).
- `Harness_DetectsPlantedOrderDependence` (self-test): a type in `Conquest.Tests.Plants` returns `string.Join(",", someHashSetOfStrings)` (process-dependent order) and another sorts strings with the current culture; the multi-process harness must report a difference for the first and the culture harness for the second.

### 3.4 Golden replays and state hashes: `GoldenReplayTests`

A **replay** is `{ruleset, variants, settings, seed, orders: [per turn: [(slot, order)]]}` (13 9). The runner (`Conquest.Tests.Support.ReplayRunner`, same code as `Conquest.Tools replay`) applies orders, calls `Pipeline.Advance` until the next input, and records `rules_state_hash` at turn 0 and the end of every turn.

| Golden | Content | Turns |
|---|---|---|
| `g1_explore_found` | scout/found/build opening, no combat | 25 |
| `g2_economy_60` | the scripted 60-turn build (section 9) | 60 |
| `g3_trade_and_recruit` | patron trade, shipments, recruit | 40 |
| `g4_field_battle` | one field battle, retreat and morale | 30 |
| `g5_raid_and_capture` | a raid then a capture | 40 |
| `g6_ai_vs_ai_seed7` | recorded orders of an AI-vs-AI game | 80 |
| `g7_save_midgame` | replay with save/load at turn 15 and 30 | 45 |
| `g8_hooks_default` | `g2_economy_60` re-run with every hook key present at its default (6.4) | 60 |

Tests:
- `GoldenReplayHashesMatch` (parameterised): the hash list equals `golden/hashes/<name>.json`.
- `GoldenUpdateIsExplicit`: the failure message includes `dotnet run --project dotnet/Conquest.Tools -- update-goldens --reason "<text>"`; the tool refuses to run without `--reason` and appends `{date, reason, old_hash_prefix, new_hash_prefix}` to `golden/CHANGELOG.json`. A stage-1 check fails a change that edits `golden/hashes/*` without a new `CHANGELOG.json` line.
- `StateHash_CoversDeclaredFieldsOnly`: the hasher walks the declared field list `golden/hash_fields.json` (13 3.4: never reflection order). Reflection over every type reachable from `GameState` (all fields, hashed or not) must equal the union of the file's `hashed`, `excluded_bookkeeping` and `excluded_cosmetic` lists: a new field fails until classified. (This is the hash list; the guard's state-field snapshot in 7.2 check 3 is a separate, full list, N-10.)
- `StateHash_ChangesWhenAnyHashedFieldChanges`: for each hashed field path, perturb it in a copy (through the type's `With...` method) and assert the hash changes (mutation coverage of the hasher).
- `StateHash_DefaultHookFieldsAreOmitted`: state fields introduced by hooks (`site_id`, `no_base_turns`, 06 H0.1) are omitted from the canonical bytes when absent or default (see 6.4).
- `Replay_ResumableAfterEachPhase`: stop at each phase boundary (`orders`, `ai_planning`, `battles(queue, index)`, `economy`, `done`), serialise with the canonical writer, reload, continue; per-turn hashes equal the uninterrupted run (CR C-1; GDD 6.2; saves outside `orders` are test-only, Q14).
- `Replay_OrderIndependentWhereSimultaneous`: GDD 6.1 says all players plan from the start-of-turn snapshot. Swap the submission order of two players' orders for the same turn; the end-of-turn hash is identical except for the documented alternating tie-break (movement execution alternates by turn parity: the test names that exact exception and checks it flips with parity).
- `AiPlan_IndependentOfHumanMovesThisTurn` (CR H-1).

Hashing rules pinned by these and section 6 tests (13 3.4 plus N-12): canonical form = keys sorted ordinally, invariant decimal integers, no whitespace, UTF-8; **every `_`-prefixed key (including `_note`) stripped**; a `null` or default value omitted **only where it equals the field's declared default** (06 H0.1), never every null; the ruleset **version string is not hashed**; the **variant stack (ids and versions, in order)** is hashed beside the merged document; `rules_hash` = own managed SHA-256 (`sha256:<hex>`), `rules_state_hash` = own 64-bit hash with published test vectors, bytes written little-endian explicitly.

### 3.5 Two further determinism properties
- `SaveLoad_RoundTripHashEqual`: for 20 generated mid-game states, `hash(load(save(s))) == hash(s)`; a save whose JSON keys are reordered loads to the same hash; the save's `state` section is byte-identical to the canonical bytes the hasher reads.
- Cross-platform: not a test but a CI matrix (section 12): the dotnet stages run on Linux and macOS (Windows if available) with the same goldens, and the IL2CPP player runs on the Mac. Integer-only math makes this feasible.

---

## 4. Theme-swap determinism

### 4.1 The proof test: `ThemeSwapTests` (TA 2.10; GDD 2 rule 4; 13 10.5; TP V-24)

`ThemeSwap_PerTurnHashesAndEventsIdentical` (`Swap`):
- Parameters: seed in `{S1..S5}` (fixed list in `fixtures/themes/seeds.json`), theme in every theme of `Catalogue.Themes` (so `colonial`, `second`, `bd1971` and any new one) plus `__empty__`.
- Arrange: `Rules = load(neutral + mvp)`. Settings: size 64, 2 AI players, difficulty normal, seed `S`.
- Act: run 60 headless AI-vs-AI turns with the `Conquest.App` driver; record `rules_state_hash` at the end of every turn. The driver **does** load a `Presentation` (that is the point) but passes only state and rules to Core.
- Assert: for each seed, the 61 hashes under every theme are equal element by element; the failure names the first differing turn and prints the field-level diff using `hash_fields.json`. Also: the list of typed events (ids + payloads, no text) per turn is identical across themes.

Companion tests:
- `AppDriver_BuildsPresentationAfterStateAndNeverHandsItToCore`: Core cannot accept a theme type (assembly references, 2.1); this test checks the App driver's order (state and rules first, presentation second) and that no Core call receives an App-side object through an `object`-typed parameter (none may exist, 2.2).
- `EmptyTheme_PlayableHeadlessWithFallbacks`: with `ThemeEmpty`, loading succeeds; every role label resolves to the engine neutral base label (not `[key]`); every asset request resolves through `Conquest.Theme.AssetResolver` to a glyph or category spec (13 6.7); the audio resolver returns silence without an exception. Each link of the TA 6.2 chain is tested with synthetic themes that break it (5.5).
- `ThemeSwitchMidGame_ChangesNoState`: switching theme through the App returns the identical `GameState` reference and an unchanged hash (D-10).
- `CosmeticNamePoolSize_DoesNotChangeTheGame`: two copies of one theme, name pools of 3 and of 3000; per-turn hashes equal (TA P-9); the generated names differ and are in `excluded_cosmetic` (3.4).
- `LongerThemeText_CannotChangeRulesHash`: `rules_hash` is the same under every discovered theme (the rules loader never sees a theme).

### 4.2 Save under one theme, load under another: `SaveAcrossThemesTests`

`SaveReload_UnderOtherTheme`: play 20 turns under theme A, save. Load under theme B (`second`), under `__empty__`, and under a theme id that is **not installed**. Assert: state hash unchanged for all three; presentation differs; the missing-theme load falls back to the neutral base presentation without an error (TA 3.5 "never fatal"); the save's `presentation` block keeps the original theme and is **not** rewritten by loading; saving again under B writes B in `presentation` and an identical `state` section.
Additional (through an in-memory `IFileStore` test double):
- `Save_WithMismatchedRulesHash_MigratesOrRefuses`: tamper `rules.hash`; load returns a typed error code (no exception escapes), or, if a migration table entry exists for that save version, the migrated state loads and the hash is recomputed.
- `Save_NewerVersionNeverOverwritten` (GDD 17): a save with a greater `save_version` is refused for writing; its bytes are untouched after an attempted autosave.
- `Save_DamagedKeepsBak`: a truncated save keeps a `.bak` copy and returns a typed load error; the atomic write (`.tmp` then replace, 13 9) never leaves a half-written file under the real name.
- `LocaleSwitch_DoesNotTouchState`.

---

## 5. Theme validation tests

Runs for every discovered theme in stage 2 with `--strict` semantics (TA 3.4 steps 6-7; 13 5.3), plus negative tests against `ThemeBroken(...)`. The validator under test is the `Conquest.Theme` part of `Validator.Load` and the `Conquest.Tools validate-data --strict` command; every `Diagnostic` carries `severity`, `code`, `file`, `jsonPointer`, `line`, `column`. Policy (TA 3.4): missing base-locale label = error; missing label in a non-base locale = warning; missing picture = warning (fallback exists); unknown role id = warning; strict CI turns configured errors into failures; warnings are budgeted (section 12). Step 7 font checks need Unity or a font reader (5.7).

### 5.1 Coverage of every role id: `ThemeCoverageTests` (TA 2.10; TP V-11)

`ThemeCoverage(themeId, variantStack)`:
- Every role id enumerated from the **merged** rules (resources, terrain, buildings, units, archetypes in use, faction slots, npc, landmarks if enabled, discoveries if enabled, abilities if enabled, score categories if enabled) has a `roles.json` binding with a `name` key, a `glyph` (an existing painter id) and a base-locale label (string or plural map with `other`).
- Every faction slot has a name key, an adjective key and a colour; slot colours are pairwise distinguishable (stored threshold) and each slot also has a flag or pattern id (GDD 16).
- Every `ev.*`, `err.*` and `warn.*` id in `events.json` has a base-locale template, using the 06 section 8 rule: a key `K@S` needs its base key `K`, except the **side-keyed events**, which need both sub-keys and no base key (06 section 8 rule 2): `ev.match_won` -> `.player`/`.opponent` (compared field `winner_slot`), `ev.site_taken` -> `.gained`/`.lost` (compared field `taker_slot`; N-2). The test reads the side-keyed list and compared fields from `events.json`, not from a literal `[VOLATILE: 06 section 8]`.
- `SideKeyedEvents_PickSubKeyByComparedSlot`: for each side-keyed event and each receiving slot, the renderer picks the `field == S` sub-key only for the slot named in the compared field, then applies `@S` (06 section 8 rule 2); a fixture where f2 retakes a site f1 captured earlier shows f1 the `.lost` text (16 N-2). Every `ui.*` key referenced by Presentation code exists in the neutral base locale: a source scan of `Conquest.Unity.Presentation` and `Conquest.App` collects string-literal arguments of the text API (`Presentation.Text("ui....")`) and `ui.*` bindings in UXML files.
- Level arrays: roles with 4 levels have a resolvable glyph/picture chain per level (the level badge comes from code).
- Variants: coverage is checked per **(theme, variant stack)**; a variant with `adds_roles` makes a theme without bindings fail (TA 3.2); for variants that add no roles, the coverage set equals the variant-free set.
- Scenario ids: every `site.*`, `entry.*`, `region.*` id of a scenario the theme hints at has a display name (06 section 4 display-name rule).
- Reverse check (warning): a binding for a role id not in the rules is a warning; `warnings == allowed_unknown_roles` from the theme's own data.

Negative: `ThemeBroken("missing_role")` expects an error whose pointer ends with that role id.

### 5.2 No ruleset keys in a theme file: `ThemeHasNoRulesTests` (TA 2.4; TP V-23)

- Schema allow-list: every key of every JSON file in a theme folder is in the theme schema's key set for that file (C# schema combinators with `allowed keys`, 13 5.2). The banned set is **derived** from the loaded rules (all key names in `rules/core/*.json` that are not also legitimate presentation keys) united with TA 2.4's list: `cost, output, move, hit, effects, level_cap, recruits, supports, capacity, attack, strength, price, rate, modifier, tax, interest, combat, hp, range`.
- The scan is recursive over `theme.json, roles.json, factions.json, calendar.json, names/*, text/*, flavour/*, encyclopedia/*, shapes.json, assets/manifest.json, audio/manifest.json`. A numeric field named like a ruleset key fails even if its value is harmless.
- Values: a string that parses as an expression over role ids (`"bld.food*3"`) fails; numbers are allowed only in keys the schema declares numeric (palette alpha, sizes, durations).
- Negative: `ThemeBroken("has_cost")` adds `"cost": {...}` to `roles.json`: rejected, not ignored; the same key hidden five levels deep is still found.
- `ThemeValidator_ReportsEveryBannedKeyOnce`: a synthetic theme with every banned key once yields exactly that many findings.

### 5.3 Locale placeholder rendering with sample payloads: `TemplateRenderTests`

Payload schemas: `events.json` (each id lists its payload fields and types, matching 06 section 8; no payload has a free-text field).
- `EveryTemplate_RendersWithSamplePayload(themeId, locale)`: build each sample payload by type (`int -> 3`, `res -> "res.coin"`, `unit -> "u.line"`, `base -> a name with a quote and a non-Latin character`, `slot -> "f1"`, `turns -> 15`, opaque ids `site`, `group`, `season`, `region`, `building`, `slot`, `winner_slot`, `from`, `taker_slot`, `target_slot`, `id` through the theme's name maps; `unit` as a generated name or, if none, the role label; 06 section 8). Render for each receiving slot (the `@<slot>` rule). Assert: no exception; no unescaped `{` or `}` left; output non-empty; output is not the bare key.
- `PlaceholderSet_IsSubsetOfPayloadFields`: a template using a field the payload lacks is an **error** (TA 5); omitting a field is allowed.
- `MissingPayloadField_IsTypedFallbackNotCrash`: render returns `[key]` plus one logged warning (end of the fallback chain).
- `FormatSpec_UsesLocaleDataNotOsCulture`: `{n, number}` renders 0, 1, 999, 1000, 1234567 with the theme's digit set and grouping (13 8.1: our formatter, never `CultureInfo`); an unknown format spec is a validator error.
- `BraceEscaping`: `{{`/`}}` render as one brace.
- `Templates_AreWholeSentences`: no key ends with a space or starts with a lowercase conjunction fragment (heuristic); a source scan of `Conquest.App` and `Conquest.Unity.Presentation` flags `+` or interpolation joining a label call and a string literal (TA P-14).
- `PlayerTypedText_IsNeverTranslatedOrExecuted`: a base name containing `{res}` and `%s` renders verbatim.

### 5.4 Plural categories: `PluralTests`

- `PluralMaps_HaveOther`: every plural map has `other`; keys within `{zero, one, two, few, many, other}`; extra keys fail.
- `PluralRules_ForShippedLocales`: for each shipped locale, a stored `(n -> category)` table for n in 0..30, 100, 101 equals `PluralRules.Select` driven by `engine/plurals.json` (13 8.2). English (`one`: n = 1) plus a `few`/`many` fixture locale in `fixtures/` to keep the code general. The Bengali row is UNVERIFIED until checked against CLDR (13 8.2).
- `LabelCount_UsesPlural`: counts 0, 1, 2, 5 pick the matching form; a missing category falls back to `other` silently; a missing `other` is a validator error.
- `IrregularPluralWords`: identical `one`/`other` forms render at counts 1 and 3.
- `GenderAndArticleExtraForms`: `{"other": "...", "_gender": "m"}` accepted; unknown `_` keys fail.

### 5.5 Fallback chains (text, assets, audio): `FallbackChainTests`

Mirrors TA 6.2 step by step with synthetic themes, engine-free where 13 6.7 puts the logic: `TextFallbackChain` (`K@S` in active locale, `K` in active locale, same two in the theme default locale, parent theme, engine base, `[key]` plus one warning; 13 8.3), `AssetFallbackChain` (`Conquest.Theme.AssetResolver`: manifest key, suffix-dropped key with a level-badge flag, parent theme, role `GlyphSpec`, `CategoryGlyphSpec`, `Placeholder` plus one logged warning per key), `AudioFallbackChain` (manifest, parent, engine default cue, silence, one log line, no exception), `ThemeExtendsCycle_IsAnError`, `AssetCache_ClearedOnThemeSwitch` (EditMode: `SpriteProvider` cache keyed by `(themeId, assetKey, zoomBucket)`), `AssetSize_MatchesRulesetFootprint` (TA P-13; PNG header parse is engine-free; code-drawn shapes always pass), `EveryManifestEntry_HasProvenanceInStrict` (source, licence, author).

### 5.6 Pseudo-locale +30% length: `PseudoLocaleTests`

`ThemePseudo` is produced by `Conquest.Tools make-pseudo-locale` from the neutral base locale: ASCII letters mapped to accented look-alikes, each string padded to **130%** with a visible filler, placeholders and plural structure intact, each string wrapped in `[` `]` to expose truncation.
- `PseudoLocale_PreservesPlaceholders` (engine-free).
- `PseudoLocale_CoversEveryKey` and `PseudoLocale_IsFresh` (the committed pseudo file equals a fresh generation).
- `NoUiString_IsClippedInPseudoLocale` (Unity **PlayMode**, `Conquest.Unity.Tests.PlayMode`; replaces the pygame dummy-driver test): load every UXML window with the pseudo-locale at UI scale 100% and 200% (GDD 16), let UI Toolkit lay it out, and assert each text element either fits its container or wraps within its declared max lines (data in `ui/layout.json`); no string is cut silently (TA 5). Whether a UI Toolkit panel can be laid out in EditMode is UNVERIFIED (13 10.2); PlayMode is the safe home.
- `LongestStringPerContainer_Report`: warn-only table of the five tightest containers, attached to the CI artifacts.

### 5.7 Font glyph coverage: `FontCoverageTests` (TA 5, 3.4 step 7; TP V-26; 13 8.4)

- `FontHasGlyphsForLocaleSample(themeId, locale)` (Unity **EditMode**): for the theme's font asset for that locale, every codepoint of `text/<locale>.json["_sample"]`, and in a broader second case every codepoint of every string of that locale, is present (a `FontAsset`/`Font.HasCharacter`-style check; the exact API for UI Toolkit font assets in 6.6 is UNVERIFIED, 13 8.4). **Engine-free option (REC to evaluate in Phase 0):** an own minimal TrueType/OpenType `cmap` table reader in `Conquest.Theme` (no dependency) lets the same check run under `dotnet test`. `fontTools` is **removed** (it was a Python library).
- `SampleString_CoversLocaleAlphabet`: `_sample` includes every letter used by any string of the locale (engine-free).
- `FontFallback_Builtin`: a theme declaring `"_fallback": "builtin"` and a locale without a font resolves to the engine's built-in UI font (shipped in `Resources`, 13 8.4) and renders the neutral base locale.
- `PseudoLocaleGlyphs_InBuiltinFont`.
- Negative: `ThemeBroken("font")` uses a font lacking one sample glyph; expect an error naming the codepoint.
- Coverage is not shaping: complex scripts (Bengali) still need the Phase 0 text spike and a native reader's screenshot review (13 8.4, R-4).

### 5.8 Presentation sanity (TA 3.4 step 7): `PaletteTests`

`PaletteContrast_TextPairs` (WCAG-style ratio at or above a stored threshold, ASSUMED 4.5 for body text); `AdjacentTerrainColours_Distinguishable`; `OwnerColours_DistinguishableUnderDeuteranopiaSimulation` (fixed matrix; owner colours also need a flag or pattern id); `FlagOrPattern_PresentForEverySlot` (GDD 16). All engine-free; colour math in tests may use `double` (the float ban covers engine-free assemblies, not test code).

---

## 6. Variant validation tests

Machinery under test: `Conquest.Rules` (strict reader, `JsonPointer`, `VariantOps`, the seven-step `Validator`, `RulesHash`; 13 5). Paths are RFC 6901 JSON Pointers over the merged document (06 H0.4, TA-1) `[VOLATILE: names of top-level members, V8]`.

### 6.1 Typed operations only: `VariantOpTests`

- `Schema_RejectsUnknownOp`: ops other than `replace`, `add`, `remove` fail with file and pointer (`/ops/7/op`), one case each for `merge`, `patch`, `eval`, `copy`, `move`, `test`.
- `Op_RequiresPointerAndValueShape`: `replace`/`add` need `value`; `remove` must not have one; `path` must be a JSON Pointer; a dotted path such as `factions.profiles.fp.banker.effects` is rejected with the hint to use `/` form (TA-1). Escapes `~0`/`~1` and "array index past the end" cases (13 5.4).
- `AddAndReplace_StayDistinct`: `add` onto an existing object key and `replace` of a missing target are errors (13 5.4 REC).
- `Variant_CannotContainCodeOrExpressions`: a value like `"__import__('os')"` or `"System.IO.File"` stays an inert string and fails the target slot's type check.
- `OpOrder_MattersAndIsStable`: applying ops in listed order twice gives the same result; reordering ops that touch the same pointer changes the result (documented, not a bug).
- `AppliesTo_Check`: ruleset id or major mismatch is a load error; `min_minor` above the ruleset minor is a load error with a clear message.
- `Variant_MayNotAddRoleIdsWithoutDeclaration`: an `add` of a new role id without `adds_roles` fails; with it, the variant loads and every theme lacking those roles fails coverage (5.1).
- `Variant_CannotTouchThemeOrMatchSettings`: pointers into `/themes`, `/match`, `/settings` do not resolve and are rejected.

### 6.2 Dangling references after ops, and re-validation: `VariantRevalidationTests`

The full rules validator runs after all ops (TA 3.2, 3.4 step 3; 13 5.3 step 3). Negative fixtures (`VariantBroken(...)`), one defect each, each asserting the `Diagnostic` code and pointer:

| Fixture | Defect |
|---|---|
| `remove_referenced_building` | removes a building role still named by a unit's `recruited_at` |
| `remove_cost_resource` | removes a resource id still used in a cost |
| `replace_with_wrong_type` | replaces a list with a number |
| `level_array_wrong_length` | a 4-level building gets 3 cost entries |
| `unknown_role_in_effect` | an effect names a role that does not exist |
| `archetype_loses_required_field` | removes `start` from an archetype |
| `slot_not_covered` | removes a faction slot from `slots` coverage |
| `region_rule_names_missing_building` | a hook key references a missing role |
| `scenario_requires_disabled_feature` | the `mvp`-plus-`natives` case (TA 3.4 step 5): an **error**, not a silent no-op |
| `hook_off_scenario_field_present` | a scenario uses a hook field while the hook is disabled: load error at step 5 (06 H0.3) |
| `predicate_names_slot_without_initial_sites` | an `initial_sites_held_at_most_pct` predicate names a slot with no matching pre-placed sites: load error (06 H4) |
| `tag_counts_mismatch` | `end_conditions.tag_counts` disagrees with the sites carrying that tag (06 H4) |

- `Variant_RevalidatedAfterOverlay(variantStack)` (every shipped stack): after apply, the validator returns no errors and no warnings.
- `EveryShippedVariantPointer_Resolves`: each op pointer resolves (`replace`/`remove`) or has an existing parent (`add`) `[VOLATILE per 06 R-10]`.
- `VariantStack_OrderAndConflict`: stacks `[mvp, equal-nations]` and `[equal-nations, mvp]` either give the **same merged document** (commutative) or one is rejected by a declared conflict rule; the two `rules_hash` values always differ, because the stack order is hashed (3.4, N-12). The outcome per pair is pinned in `golden/stack_pairs.json`.
- `Includes_IsCheckedOpByOp`: a variant declaring `"includes": ["equal-nations"]` must contain every op of the included variant (06 R-9: "the set of `equal-nations` ops is a subset of bd1971's ops"; generic for any `includes` list).

### 6.3 Rules-hash stability: `RulesHashTests` (13 3.4; N-12)

- `RulesHash_MatchesGolden(variantStack)`: for neutral and every shipped stack; the failure prints the update command of 3.4.
- `RulesHash_IndependentOfKeyOrderAndWhitespace`: shuffled keys, other indentation and CRLF give the same hash.
- `RulesHash_IgnoresUnderscoreKeys`: adding or editing any `_note` or other `_`-prefixed key does not change the hash; the canonical form strips them recursively.
- `RulesHash_ChangesOnAnySemanticEdit`: mutation sweep over 50 sampled leaf values of the merged rules; each change by one changes the hash.
- `RulesHash_IgnoresVersionString` (06 H0.1): changing only the ruleset version string leaves `rules_hash` unchanged; the version is still recorded in the save.
- `RulesHash_IncludesVariantStackInOrder` (TA 3.1): the same ops under a different variant id or version, or the same variants in another order, change the hash.
- `RulesHash_NullOmittedOnlyWhenDeclaredDefault`: a key whose declared default is `null` and whose value is `null` is omitted; a `null` where the default is not `null` is kept (06 H0.1, N-12).
- `RulesHash_ExcludesThemeAndMatchSettings`.
- `RulesHash_IdenticalInDotnetAndUnityHosts`: the same golden passes under `dotnet test` (CoreCLR) and Unity EditMode (Mono), with the library projects pinned to `LangVersion` 9 and `netstandard2.1` (13 2.2, R-1). Replaces the Python-version matrix.
- `Sha256_MatchesNistVectorsAndBcl`: the managed SHA-256 equals the NIST vectors and, under dotnet, `System.Security.Cryptography.SHA256` on 1,000 generated inputs (13 3.4).

### 6.4 Hooks at default leave neutral hashes unchanged: `HookDefaultTests` (06 H0.1)

- `HooksDefault_ElisionKeepsRulesHash`: neutral rules plus a full `hooks.json` with every key at its declared default hash the **same** as the rules with no `hooks.json`. The canonical form omits every default-valued key recursively, including objects whose members are all default (the test builds the nested all-default object explicitly).
- `HooksDefault_KeepsStateHash`: replays `g1`..`g7` with the hooks file present at defaults give per-turn `rules_state_hash` identical to the goldens recorded **before** hooks existed (`g8_hooks_default` is `g2_economy_60` plus the hook keys). The new hook state fields (`site_id`, `no_base_turns`) are omitted from `rules_state_hash` when absent or default; `initial_site_count` is computed at scenario load and is **never state** (06 H4), so it is not hashed at all (N-7a).
- `NonDefaultHookValue_ChangesRulesHash` (one case per hook key): flipping one key from its default changes `rules_hash`, so elision is not hiding real changes.
- `HookStateFields_PresentOnlyWhenNonDefault`: with the hook off, the canonical state has none of the hook fields; with it on and non-default values, they are present and hashed.

### 6.5 The test that pins the defaults: `HookDefaultsFrozenTests` (06 H0.1, R-1)

`HookDefaultsFrozen` (06 names it `test_hook_defaults_frozen`): data file `golden/hook_defaults_v1.json` (committed, reviewed on change) lists every hook key pointer and its declared default for ruleset major 1. The test:
1. reads the declared defaults from the C# schema combinators (13 5.2, each field declared with its default);
2. compares them with the golden file pointer by pointer: equal pointer set and equal values; an added key must come with a default entry that evaluates to neutral behaviour;
3. asserts the golden file's header major equals the ruleset major, and fails with a "bump the major version" message if a default changed within the same major.
Companion `EachHookDefault_IsNeutralByBehaviour`: for each hook, the short fixture scenario for that hook run with the hook at default and without the hook key give equal state hashes.

### 6.6 Per-hook generic acceptance (neutral content, one parameterised family)

For each hook H1-H7 (names per 06 `[VOLATILE, V8]`), one fixture class in `Rules.Tests`/`Core.Tests` (`ArrivalEntryTilesTests`, `PrePlacedBasesTests`, `SeasonsTests`, `EndConditionsTests`, `TimedEffectsTests`, `RegionRulesTests`, `HealingSourcesTests`) uses a tiny variant in `fixtures/variants/` and a tiny scenario, never the bd1971 data. 06 section 2's per-hook unit, property and acceptance bullets are the test list; this plan adds the shared shape:
- Off => no effect (6.4); on => the effect in 06's acceptance bullet; invalid scenario field => load error naming the pointer; determinism: runtime and process runs (3.3); no randomness: `Hook_DrawsNoRandomNumbers` runs the hook through the App driver with an `Rng` stream provider that throws for every stream except those 06 names (none for H1-H7).
- Ordering and ties: list index, then slot id (`f1 < f2`, ordinal), then `(y, x)` (06 H0.2): a test builds equal-cost candidates and checks the chosen one.
- AI visibility: the hook's public data appears in `KnowledgeView` and its hidden data does not (fog fairness by type; e.g. H1: an AI view never holds another slot's `entry_groups`).
- **H4 generic predicate and clock tests** (`EndConditionsTests`; numbers are fixture data, the counts below mirror 06's worked example only because it exercises the boundary):
  - `InitialSitesHeldAtMostPct_Boundary`: with 20 initial sites and `at_most_pct` 25, holding 5 passes and 6 fails (integer comparison `held * 100 <= pct * count`).
  - `InitialSitesHeldAtMostPct_IgnoresBasesFoundedLater`: 5 initial sites held plus 3 bases founded during play still passes; founded bases count in neither numerator nor denominator.
  - `InitialSitesHeldAtMostPct_RetakenSiteCountsAgain`; `InitialSitesHeldAtMostPct_TagsAnyExcludesUntaggedAndOutposts`.
  - `InitialSiteCount_FixedAtScenarioLoadAndNotState`: the count is the same before and after any turn, is not a field of `GameState` (reflection) and does not move `rules_state_hash`.
  - `Elimination_HomelessLimitTakesPrecedence`: when the homeless counter and the grace counter reach their limits on the same check, `ev.faction_eliminated.reason == "homeless_limit"` (06 H4 step 1).
  - `HomelessCounter_IgnoresFounders`: a slot with founders but no base is eliminated when the homeless counter reaches `homeless_turns_limit`; after limit - 1 checks it is still in play.
  - `SurrenderOrder_DeadlineAndAllOut`: surrender entries in list order; deadline at `T + 1 == max_turns`; both-out draw (`ev.match_drawn{reason: "all_out"}`).
- Interaction tests (06 7.2): `H3 x movement setting` multiplies integer percents with one floor at the end; `H3 x H6` order (region bonus inside the modifier before the clamp, season multiplier after) shown by a fixture where swapping the order changes the result; `H2 x H4` site ids survive capture and a destroyed site counts as held by nobody; **`H4 x H1`: a founder arrival (step 3a) resets only the grace counter `no_base_turns`, never the homeless counter; only holding a base resets the homeless counter (06 7.2; N-7b)**. The test runs a slot with no base through a founder arrival and asserts the homeless counter keeps counting.

---

## 7. "No civilian state" allow-list test

Placement: the **machinery** is generic (`Conquest.Tests.Host/Guards/AllowListGuard`), because the same pattern guards any variant that promises a state shape (06 TA-3: "the per-variant allow-list pattern"). The **instance** for bd1971 is the NUnit fixture `Bd1971NoCivilianState` (the C# name 06 section 5 and 13 10.5 use; 06's Python name was `tests/test_bd1971_no_civilian_state.py`) with data in `dotnet/Conquest.Tests/allowlists/bd1971_state.json`, `bd1971_review.json` and `forbidden_tokens.json` (06's `tests/allowlists/` maps to this folder; outside `StreamingAssets`, N-14). It runs in the normal suite (stage 3 static checks, stage 6 soak checks), not only in a release job (06 section 5). `[VOLATILE: 06 section 5 is being edited; this section follows the text read on 2026-10-03.]`

### 7.1 What the test is for
The design promise is "no civilian state in the simulation": no field, event, resource, order, target kind or rules key can represent or count non-combatants, their deaths, reprisals, famine, tribute or loot, and personnel can change only through enumerated causes. The test proves **absence by closed set**, not by searching for bad things only. Per 06 section 5 the guarantee holds **partly in the rules and partly in text only**: rule-level and tested here are no civilian state and the death-neutral shortage ids; the stand-down meaning on shortage and the silence about personnel on capture are text-level, validated by the theme (V-04, V-21; section 8.2), **not** by this test.

### 7.2 Exactly what it asserts (ten checks; numbering follows 06 section 5)

Arrange: merged rules = `conquest-core` + the variant under test (bd1971 is self-contained and repeats the `equal-nations` ops, 06 section 3); scenario = the variant's shipped scenario (bd1971: `liberation-1971`); a game produced by `NewGame` on it; plus the soak for the dynamic checks. Every expected value is read from `<variant>_state.json`, so the guard code has no variant-specific literal.

1. **Closed role sets.** The merged role lists equal exactly the allow-list (for bd1971: the six `res.*`, twelve `bld.*`, eight `u.*`, archetypes in play `{arch.expedition}`, `features` `npc.settlement`, `arch.indigenous`, `disc`, `dip`, `tribute`, `scoring` all `false`, `native_settlements.max == 0`). Any added role id fails.
2. **Key-path snapshot (rules).** The set of JSON key paths of the merged rules DOM (role-id segments wildcarded as `*`, `_`-prefixed keys excluded) equals `rules_paths`. A new path fails until it is in the allow-list **and** a review entry `{path, reviewer, date, reason}` exists in `<variant>_review.json`. Sub-tests: every allow-list entry has a review entry; no review entry is orphaned.
3. **State-field snapshot (N-10).** The set of field paths of `GameState` and **every** type reachable from it, enumerated by reflection in the test assembly (every field, hashed or not; including `excluded_bookkeeping` and `excluded_cosmetic` fields; element types of `ImmArray<T>` and `IdMap<T>` walked; reflection is allowed in tests, never in Core), equals `state_paths`. This is deliberately **not** the hash field list of 3.4. A new field fails the same way (allow-list + review). Nothing can hide behind an untyped field because `object`-typed state fields are banned (2.2 `CoreState_TypesAreSealedAndReadonly`); a value-level walk of a `NewGame` instance adds the concrete element types of any interface-typed collection.
4. **Events.** The set of `ev.*` ids **reachable** under the variant, each with its payload field names, equals `events`. Reachable = ids emitted in the soak (check 7) united with ids the static emitter table marks reachable (`events.json` joined with the rules' enabled features). The neutral shortage outcome is exactly one event id, the death-neutral `ev.pop_lost{base, amount, cause}` (read via `Rules.Events.ShortageEventId`, V4), and it is on the list; no death-of-people, tribute, NPC, discovery or score event id is reachable. **4c (06's added assertion):** exactly one shortage event id is reachable, it carries no `cause` value other than `"shortage"`, and no event payload anywhere has a field whose name contains a forbidden token of check 5.
5. **Forbidden-token scan (a second net the allow-list cannot override).** Case-insensitive (`OrdinalIgnoreCase`) scan of every rules key, state field name, event id, payload field, error code, effect kind, predicate kind, order kind and attack-target kind for the tokens in `forbidden_tokens.json`: `civilian, villag, refugee, resident, inhabitant, citizen, townsfolk, starv, famine, massacre, reprisal, atrocit, loot, plunder, hostage, prisoner, execut, tribute, kill_count, body_count, death_toll`. Exceptions need a review entry naming the exact string. `execut` may collide with neutral engine identifiers (an order-execution key): the expected neutral exceptions are pre-registered in the review log, each naming the exact string, once `events.json` and the order kinds exist (06 check 5, 12 Y4). The check passes only if the neutral engine uses the death-neutral names (`ev.pop_lost`, `warn.food_shortage`; 06 G-8.5, G-12, R-14); if it keeps a starvation-named id, this check fails by design until the rename or a reviewed exception for that exact id. The test prints which resolution is in force. `[VOLATILE: V4, N-27]`
6. **Target kinds and raid outcomes.** Attack target kinds equal exactly `{unit, base}`; raid outcomes equal exactly `{stock_seized, building_level_lost, site_taken, base_destroyed}`; every scenario site with `real_place: true` has `raid_can_destroy == false` (flag name settled in 06 H2; N-24).
7. **Personnel accounting (property, soak).** 20 fixed seeds x the scenario's `max_turns` (bd1971: 89, turns 0-88), AI vs AI (both slots driven by the AI). For every base and every end of turn, every decrease of `res.pop` is matched by exactly one of: a recruit or founder cost paid that turn; a militia strength loss in a battle that turn (GDD 11.6 rate); the neutral shortage loss (rate and rounding of GDD 8.5, reported by `ev.pop_lost{cause: "shortage"}`); or a change of owner by capture, in which case the base's `res.pop` is unchanged by the capture and counts for the new owner. No other decrease exists; faction totals move only by these causes. If capture damage (GDD 11.6) applies to `res.pop`, it is listed as its own cause; otherwise the test asserts capture leaves `res.pop` unchanged. Implementation: the soak records a `SoakTrace` (per turn, per base: `res.pop` before and after, owner, and every cause event); the check is a pure function over the trace (so it can be fed plants, 7.3), and `SoakTrace_RecordsEveryPopChange` proves the recorder misses nothing (the trace's summed deltas equal the difference between consecutive states).
8. **Runtime features.** In the same soak: zero `npc.settlement` entities, zero `disc.*` on the map, zero tribute or diplomacy orders accepted, no score fields in state; the shortage rate equals the neutral 5% (read from rules) and emits only the allow-listed event.
9. **No allied units.** Every scenario arrival for the guarded slot (bd1971: `f1`) contains only roles in its archetype's `can_field` plus the scout, founder and commander roles; the timed-effect kind list equals `{patron_link_cut, panic_modifier}`, and no kind can create or transfer units; in the soak, every unit owned by that slot was created by its own recruit order or by its own scenario arrival (unit provenance field checked).
10. **Theme-side smoke.** The base-locale labels for the population resource, the militia unit and the core building contain none of the forbidden tokens, and no label contains a word forbidden by the theme's own lint list (bd1971: "colony", RM L-4). Full theme linting is section 8.

Pass = all ten, plus the self-tests below.

### 7.3 Planted-violation self-tests (the guard must be able to fail): `Bd1971NoCivilianStateSelfTests`

Each check is a pure function over inputs: the rules DOM, a `StateShape` (field-path set), the event table, the `SoakTrace`, the theme labels and the allow-list files. Plants modify those **inputs in memory** (13 10.1: "a scratch copy of the schema in memory, not of the source tree"); the real code and data are never edited. `ShapeReflector_SeesPlantedField` separately proves the reflector of check 3: reflecting over a test-only sealed type in `Conquest.Tests.Plants` that holds a `Civilians` field yields that path.

| Planted violation (input changed) | Expected red check |
|---|---|
| a `civilians` field path added to the `StateShape` | 3 (state snapshot) and 5 (token) |
| `ev.village_burned{base}` added to the event table | 4 and 5 |
| an `npc.settlement` role id added to the rules DOM | 1 |
| `features.tribute` set to `true` | 1 and 8 |
| a rules key `loot_rate` | 2 and 5 |
| an attack target kind `settlement` | 6 |
| an order kind `levy_tribute` | 5 and 6 |
| a `res.pop` decrease of 1 per turn with no cause event, in the trace | 7 |
| a score field `kills` in the `StateShape` | 3, 5 and 8 |
| an allied-unit arrival for the guarded slot | 9 |
| a review entry **without** an allow-list entry | 2 (orphan review) |
| an allow-list entry **without** a review entry | 2 (missing review) |
| a forbidden token in the base-locale label of the militia unit | 10 |
| a forbidden token in an allow-list entry (the allow-list cannot override check 5) | 5 |
| **4c:** a second shortage event id reachable | 4 |
| **4c:** `ev.pop_lost` emitted with `cause: "starvation"` | 4 (and 5) |
| **4c:** a payload field named `starved` on any event | 4 (and 5) |
| a `real_place` site with `raid_can_destroy: true` | 6 |

Also `Guard_PassesOnCleanInputs` (the unmodified inputs are green, so each red is caused by its plant) and `SelfTests_CoverEveryCheck` (the set of checks in the "expected red" column equals `{1..10}` and includes 4c; a check without a self-test fails the suite). 06 section 5 asks for at least the `civilians` and `ev.village_burned` plants; this table is the full set (N-13).

### 7.4 How it composes with the errata's extra assertion (ER C.1; 06 check 4)
- The extra assertion is sub-assertion **4c** of check 4; its three plants are in 7.3 and must turn 4 red.
- Check 7 makes the rule-level promise real without the dropped stand-down switch: it proves there is no hidden, reprisal- or famine-like decrease of personnel. 4c and 7 are independent (4c covers events and names, 7 covers numbers over time); each fails on its own plants.
- Check 5 reads the neutral ids from the rules, so a rename does not require editing the guard.
- The restated guarantee goes into the test class's XML doc comment and its failure messages: "Rule-level and tested: no civilian state; death-neutral shortage ids. Text-level and validated by the theme: stand-down on shortage; nothing said about personnel on capture." The text-level half is **not** claimed by this test (section 8.2; TP V-04, V-21).

### 7.5 Maintenance protocol
- Allow-list files are sorted JSON (ordinal), one path per line, so diffs are reviewable.
- A change to `<variant>_state.json` or `forbidden_tokens.json` requires a changed `<variant>_review.json` in the same commit (stage-1 file-pair check).
- The allow-list is generated once by `dotnet run --project dotnet/Conquest.Tools -- snapshot-allowlist --variant <id>` and then edited by hand only through review entries.

### 7.6 Generic reuse
`AllowListGuard.CheckClosedSet(name, actual, expectedFile, reviewFile)` gives any future variant that promises a shape (for example "no score state") the same three behaviours (snapshot, review pairing, token net) with only data files. `Variants_DeclaringGuardsHaveGuardFiles` fails if a variant lists `guards: [...]` and `allowlists/<variantId>_state.json` or `_review.json` is missing.
`[VOLATILE: if the owner restores the shortage and capture switches, re-add: check 4 ev.pop_departed{reason in {shortage, capture}}, check 7 captor pop equals 0, check 8 shortage.kind == departure.]`

---

## 8. Theme text lints that are theme-parameterised

Lints are **engine code** (the linter in `Conquest.Theme`, run by `validate-data --strict` and by `Conquest.Tests.Host/Lints`) driven by **pack data**. Lint data used only in CI (forbidden-word lists, required phrases, real-name lists) lives in `dotnet/Conquest.Tests/packlint/<themeId>/` (`lint.json`, `real_names.json`), not in the shipped theme folder, so player builds never carry it (N-14 applied to lint data; the real-name list in particular must not ship, 8.3) `[OPEN: Q2/Q3 if 05 keeps any lint file inside the pack]`. The neutral suite contains no word list. The lint file is validated against its own C# schema; the engine ships a base list of lints that apply to every theme (8.4).

### 8.1 Lint file contents (schema)

```
{
  "forbidden_words":   [ {"pattern": "...", "mode": "word|stem|regex", "reason": "...", "except_contexts": [ ... ]} ],
  "required_phrases":  [ {"key_glob": "ev.pop_lost*", "any_of": ["..."], "reason": "..."},
                         {"key_glob": "warn.food_shortage*", "any_of": ["..."], "reason": "..."} ],
  "forbidden_by_key":  [ {"key_glob": "...", "pattern": "..."} ],
  "name_pool_rules":   {...},
  "figure_rules":      {...},
  "allowed_contexts":  [ {"name": "...", "key_glob": "...", "allows": ["pattern ids"]} ]
}
```
The `required_phrases` globs follow 05 V-04 as corrected by N-21 (`ev.pop_lost*`, `warn.food_shortage*` and, if the neutral engine keeps them, `ev.shortage_warning*`; not `ev.shortage*`, which would catch `ev.shortage_resolved`) `[VOLATILE: V-04 scope is 05's]`.
The linter runs over every string of every locale of the pack: `text/*.json` (plural forms included), `names/*.json`, `flavour/*.json`, `encyclopedia/*`, `roles.json` labels, briefings, `_sample`, asset alt text and calendar format strings.

### 8.2 Forbidden words per theme: `ThemeLintTests`

- `ForbiddenWords_Absent(themeId)`: for every pattern, the match count outside allowed contexts is zero. Matching: `word` = whole word, case-insensitive, NFKC-normalised (`string.Normalize(NormalizationForm.FormKC)`), simple plural/possessive stripping; `stem` = prefix match on a word boundary; `regex` = .NET `Regex` with `RegexOptions.CultureInvariant | IgnoreCase` and a **match timeout** (the constructor's `TimeSpan` argument; replaces Python `re` with a timeout guard), patterns also validated by a length cap and a no-nested-quantifier lint.
- `ForbiddenWords_CatchObfuscation`: matches across zero-width characters, hyphens, soft hyphens and a small homoglyph table (planted `c0lony`, `col​ony`).
- `NeutralBaseLocale_IsCleanForEveryThemeLint`: the engine's neutral base text has none of the words any shipped theme forbids, except through declared exceptions (so the empty theme stays inert).
- `ForbiddenWords_DoNotHitRulesetIds` (`bld.core` is not text) and its converse `Ids_NeverAppearInVisibleText` (no raw role id or `{braces}` in rendered output).
- `RequiredPhrases_Present`: where a pack declares a required phrase (bd1971: shortage text must contain "return home" or "stood down", TP V-04; note 16 N-1: "returned home" does **not** contain "return home"), every matching key's every plural form and locale contains at least one `any_of` phrase (ordinal substring after NFKC). `Text_MakesNoClaimTheRulesDoNotMake` uses the pack's `forbidden_by_key` entries for shortage and capture templates (no "nobody was harmed" or "nobody dies" on a shortage key; no statement about where personnel go on a capture key; TP V-21, 06 R-7, R-14).

### 8.3 Real personal names: `RealNameLintTests`

- `NoRealPersonalNames_InGameText(themeId)`: the pack's `packlint/<themeId>/real_names.json` (plain or salted-hashed tokens, Q3) is matched against all strings, **name pools**, generated-name patterns (pattern x word expansion, so a generated "Given Family" cannot equal a listed person), calendar strings and alt text: full name, surname alone for listed surnames, initials + surname.
- `GeneratedNames_NeverCollide`: the full bounded product of every name pattern is compared with the list (chance plays no part); a pool with fewer than the pack's `name_pool_rules.min_generated` generated names fails (pattern x words, not raw words; TP V-18).
- Exceptions: a historical figure may appear only in an encyclopedia-class entry tagged `topic: "history"` and `reviewed: true` in `allowed_contexts`, and the entry stays `ship: false` until its reviewer field is filled.
- Self-tests: a planted full name in a button label, a name-pool entry, a briefing and an alt text each produce a finding; the same name in a tagged encyclopedia entry produces none and one `needs_review` note.
- `NoRealPerson_InRulesOrScenarioIds`: rules, variants, scenario ids and `_note` fields against the same list (06 hard rule).

### 8.4 Single-figure casualty and strength numbers (engine-wide base lint, pack-tunable): `FigureLintTests`

Behaviour from TP V-07 (volatile in detail): flag a number of 1,000 or more, or "million", "lakh", "crore", "billion", in a sentence that also contains a people, force or loss word (list in `lint.json`, extendable per pack and language), outside a `figures` block. Not counted: years matching `\b1[89]\d\d\b`, distances and heights with a unit, ids.
- `NoUnblockedSingleFigure`: zero findings; `figures` blocks carry per-claim source, attribution, `status`, and a range (`low`, `high`) or `consensus: true`; a block stays `ship: false` until each claim is `checked`.
- `Figures_AreRangesWithAttribution`: `low == high` only inside a multi-claim block with every claim attributed, or under `consensus: true` (TP V-07).
- `NoCasualtyOrStrengthNumber_InRulesEventsOrPayloads`: no payload field counts killed, dead or lost people, and no UI template binds a numeric placeholder to such a field (adds a numeric check beside 7.2 check 5).
- `NumberWords_AreMatched`: digits, spelled-out numbers, and full-width, Arabic-Indic and Bengali digits are normalised before matching (planted-value self-test per form).
- `KillCounters_DoNotExist`: no HUD template has a placeholder bound to a kill, casualty or enemy-lost counter (`forbidden_by_key`).

### 8.5 Allowed-context rules: `LintContextTests`

A context is `{name, key_glob, allows: [pattern ids], requires: {tag, reviewed}}`, matched on the key, never on free text.
- The linter reports every allowed hit with its context (table `pattern x context x count`). `AllowedContexts_AreUsed`: a context that allows nothing in the current text is flagged.
- `AllowedContext_CannotWidenGlobalRules`: the engine base lints and 7.2 check 5 cannot be relaxed by a theme lint file; a context that matches a rules path is a schema error.
- `Context_RequiresReviewMetadata`: `reviewed: true` requires `reviewer` and `date`.
- Example (generic): a sensitive term is allowed only in the remembrance/encyclopedia key group with `ship: false` or `reviewed: true`, never in `ev.*`, `err.*`, `warn.*`, `ui.btn.*` or unit labels.

### 8.6 Linter correctness: `LinterTests`
- Unit tests for the matcher (stemming, normalisation, boundaries, Unicode, regex timeout).
- `Lint_IsDeterministic`: findings sorted ordinally by (file, JSON Pointer, pattern); two runs give byte-identical reports; the report is a CI artifact.
- `Lint_RunsOnAllLocalesAndPluralForms`: strings inspected equals strings counted in the pack.

---

## 9. Economy and pacing simulator tests

Tool under test: the headless economy simulator (engine-free, in `Conquest.App`, exposed as `Conquest.Tools simulate`; uses Core only) and its scripted 60-turn build orders (GDD 4, 20; 13 12 Phase 2a). Fixtures: `fixtures/scenarios/econ_flat_64.json` and `fixtures/builds/*.json` (scripted order lists, named predicates for conditions). Tests in `Conquest.Tests.Host/Sim/`, `[Category("Sim")]` unless noted.

### 9.1 Pacing targets (GDD 4; tunables read from rules, not duplicated): `PacingTests`

`PacingTargetsMet(build, seed)`: scripted balanced build, normal difficulty, 64x64, seeds S1..S5. Targets from `rules/core/pacing.json` (ASSUMED GDD 4 values: first colony by turn 3; second by turn 10 +/- 3; Center L2 by turn 12 +/- 4; first battle turn 25-40; AI-vs-AI game end turn 80-150):
- first colony founded turn <= target; second within [target - tol, target + tol]; Center L2 within the band; Center L4 turn recorded for 9.3;
- the pacing curve (stocks, population, buildings per turn) is written as a CI artifact and compared with `golden/pacing_curve_<build>.json` for **drift** (warn when any point moves more than 10%, fail when any target breaks).
Companions:
- `PacingTargets_ReadFromData`: tolerances and turns come from the tunables register; no literals in the test file.
- `Opening_SurvivesWithVariantModifiers` (every shipped stack that changes early economy): the scripted opening founds its first base by the pacing target, no `warn.food_shortage` before turn 20 (id via the rules lookup, V4), labour stays non-negative (06 7.2 "Shortage x H3"). `ScheduleWeightedAverage_InBand`: the average season food multiplier over a variant's schedule lies within the band in the variant's tuning data (06 3.1: 98-104).
- `FailureStates_EachHaveOneWarning` (GDD 12): food shortage spiral, labour collapse after recruiting, a mine at -100%, losing the last colony, stalemate: each fixture triggers exactly one warning id, and the id exists in the base locale.
- `ModifierExamples_Exact` (CR H-2); `SpecialisationBonus_Cap` (3% per extra building up to 30%; region or other bonuses never exceed the cap, 06 3.1) `[VOLATILE]`.

### 9.2 Preview equals real turn (GDD 8.7): `PreviewTests`

`PreviewEqualsNextTurn` (property test; no category for 100 cases per run, `Sim` for 2000 nightly). **Property runner (replaces `hypothesis`):** `Conquest.Tests.Support.PropertyRunner`, own code with no dependency: cases come from a seeded test-side generator (a SplitMix64 instance seeded per case, independent of game streams); on failure it shrinks in a declared order (building count, then levels, then stocks), prints the failing seed and the shrunk case, and re-running with `--seed` reproduces it. A property-testing library (FsCheck, CsCheck) is optional and needs approval (Appendix B); not REC.
- Generator: legal colony states (terrain around the colony, building mix and levels within caps, stocks, population, queued builds, queued trades with delays).
- Act: `Economy.Preview(colony)`; then advance one full turn with **no new orders** and no other-side interaction (battles disabled in the generator).
- Assert: each stock and population value equals the real next-turn value exactly (integers). When another system could change the outcome (a raid, a trade arriving, a scenario arrival), the case is marked "external" and the test asserts only that the preview includes the known effect or flags itself incomplete.
- Parameterised over every shipped stack, including hooks that change production (season multiplier, region bonus): this catches "season after clamp" order bugs (06 7.2 H3 x H6).
- `Preview_IsTheFunctionTheTurnUses`: IL call-graph check that the pipeline's economy step and `Economy.Preview` both call one shared `Economy.ComputeNextTurn` (no duplicate). The Python plan's monkeypatch half ("add 1 to the preview and watch the property fail") has no safe equivalent without a seam in Core; it moves to the optional mutation run (13.1).
- `Preview_HasNoSideEffects`: previewing 1000 times leaves the state hash unchanged (Core has no RNG counter state to move; draws are counter-based).

### 9.3 Anti-runaway acceptance test (CR H-4; GDD 9): `RunawayTests`

`PureTradeColony_NotRunaway`:
- Arrange: two scripted builds on identical maps and seeds: **balanced** and **pure coin-and-trade** (coin extractor spam plus Dock plus the maximum import orders every turn).
- Act: simulate until each reaches Center L4, or 150 turns.
- Assert: `turnPure * 100 >= turnBalanced * (100 - runaway_margin_pct)` (integer form; margin 25 read from `pacing.json`); if pure never reaches L4 in 150 turns the test passes with a note.
- Variant sweep over every shipped stack and each difficulty; failures listed per cell.
Supporting unit tests (no category): `PriceRisesOnePercentPerUnitBoughtAndDecaysTwenty` (exact integer table over 10 turns), `ImportCap_ScalesWithDockLevel` (20/40/80/160 from data; above the cap is clipped with a typed message, not an exception), `SellPrice_BelowBuyPrice`, `InterestCap_Binds` (GDD 10; cap 50 default; at cap 0 interest is off; a 1000-coin hoard grows by exactly the capped integer for 100 turns), `InterestOffByVariant_ProducesZeroGrowth`, `TaxRateTunables_ApplyAndZeroMeansNoTax`, `Hoarding_IsNotDominant` (`Soak`).

### 9.4 More pacing and economy properties (cheap, every change)
`CostsDeductedAtOrderTime_AndRefundRules` (GDD 8.6; CR M-4), `NoBuilding_ExceedsCenterLevel`, `Center_CannotBeDemolished`, `Population_NeverNegative` and `Stocks_NeverNegative` (property runner, fuzzed orders), `Growth_StopsAtHousingCap`, `Church_DiminishingReturns_100_75_50`, `RecruitSchema_IsUniform` (CR M-3), `Register_CoversEveryTunable` (GDD 19, CR M-17: each leaf key of `tunables` has an assumption-register entry and vice versa, including every ASSUMED key a shipped variant adds, 06 3.1).

---

## 10. Combat harness tests

Tool: the Combat Demo harness (engine-free, in `Conquest.App`, also `Conquest.Tools combat`) built from the **Combat Demo** rules (GDD 11.7): point-buy 5-40 per side, line 1 point, shock 2, ranged 2, commander attack point 3, all units level 4, terrain cosmetic. Built before the AI, headless, no map, calling the real `Conquest.Core.Battle` (no duplicate rules). Tests in `Conquest.Tests.Host/Combat/`.

### 10.1 Combat Demo point-buy: `CombatDemoTests`
`PointCosts` (read from rules); `BudgetRange_Enforced` (below 5 or above 40 rejected with a typed error; 5 and 40 accepted; an unaffordable roster rejected; exactly-the-budget accepted; leftover allowed); `CapacityRules` (6 slots per square; line 1, shock 2, ranged 2; an unplaceable roster is rejected or auto-placed per the declared rule); `RosterGeneration_IsDeterministic` (`RandomRoster(budget, seed)` is a pure function through the combat stream); `Terrain_IsCosmeticInDemo`; `Demo_UsesRealBattleCode` (IL call-graph check that the harness calls `Battle.ResolveAttack` and defines no method with the same role; replaces the Python monkeypatch counter).

### 10.2 Battle rules unit tests (the harness depends on these): `BattleRuleTests`
Table-driven, exact expected values from stored fixtures:
- Board 3 columns x 4 rows, no diagonals; reserves; home row; attacker moves first; a unit adjacent to an enemy may only move to squares not adjacent to another enemy.
- `AttackDefinition` (CR M-2): attacks per side-turn = `attacks_per_leader_level[level]` (1 without commander); each participant joins at most one attack per side-turn.
- Odds (from `combat.json`) as integer **per-mille**: base hit 300/320/280, +50 per extra flank square, +50 per extra unit type, charge +100, clamp 50..950 (13 3.1; equal to the old 5-95%); a hit is `Rng.Range(..., 0, 1000) < chance`; the clamp holds for a 20-flank fixture.
- Morale (CR M-6): panic rolled once per damaged unit after each attack; retreat from the home row blocked (+1 damage, stays); Charisma/Reputation 0-10 clamps; reputation +1/-1 per battle; the H5 `panic_modifier` per-mille term is added before the cap (06 H5).
- Win conditions: enter the enemy flag square, eliminate all, force retreat; parting shot on retreat; a defending colony's retreat loses the colony (raid: destroyed, unless `raid_can_destroy: false` converts it to a capture with `ev.site_taken{site, from, taker_slot, via: "raid"}` sent to both slots, 06 H2).
- Raid (GDD 11.6): from round 3 the attacker takes 10% of the remaining stockpile each round; from round 5 one building level per round and half its value to the attacker; forts harder to destroy (multiplier from data); retreating defenders reappear next turn. Round-by-round table over a 10-round fixture.
- Capture: needs a battle win; one building chosen by the combat stream loses one level; half of each stockpile kept; cross-archetype capture returns a typed error and raid remains available.
- Colony defence: militia counts by Center level, extra ranged per fort, best commander leads, lost militia reduce population by 5 per strength point, lost fort ranged do not.
- Property: a battle always ends within the declared `max_rounds`, never produces negative strength, units never leave the board illegally, and the same `(battleId, seed)` replays identically (stream `Combat(battleId)` only).

### 10.3 Early-rush test (GDD 20): `EarlyRushTests` (`Combat`)
`EarlyRush_CannotTakeLevel1Colony`: attacker 2 level-1 line units plus a level-1 commander; defender a level-1 colony with its militia (and a level-1 fort in a second case), default archetype; 200 battles, seeds 0..199. Assert: the attacker takes the colony in none of them **and** attacker wins in percent are below `rush_win_pct_max` (ASSUMED, default 0, data), with the empirical rate in the failure message. Variant sweep over every shipped stack. `RushWithOneExtraUnit_HasNonzeroChance` proves the harness can show an attacker win.

### 10.4 Nation/profile matrix pass band (GDD 10, CR H-5): `ProfileMatrixTests` (`Combat`; nightly for large N)
- Fixtures: the shipped faction profiles (`fp.*`) and archetypes; profile A vs B in the Combat Demo with symmetric rosters at budgets 10, 25, 40; N seeds per ordered pair (200 per change, 2000 nightly, from `pacing.json`), alternating attacker and defender.
- Assert: for every unordered pair the win share of A lies in `[35%, 65%]` (band from data); the failure prints the full matrix with Wilson intervals (computed in test code with `double`; the float ban applies to engine-free assemblies only).
- `NonCombatBonusProfiles_AreCoveredElsewhere`: interest, patron delay and movement profiles show "n/a" and point at the soak.
- `RatingValue_Matters` (GDD 10: about 50-80 per mille hit chance per rating point): one more War College rating point raises the win share by a stored minimum.
- `EqualNationsMatrix_IsFlat`: under `equal-nations` every pair is within the noise bound (|share - 50%| below 3 sigma).
- `AiVsAiMatrix_Soak` (`Soak`, stage 6): per pair of profiles 20 full games on 64x64: no exception, no stalemate beyond the declared limit, each game within the declared turn bound (80-150 typical, hard bound 300), aggregate share within `[25%, 75%]`.

### 10.5 AI battle driver: `AiBattleTests`
`AutoResolve_EqualsAiDrivenBattle` (same orders through the same `Battle` give the same result; quitting mid-battle auto-resolves deterministically, GDD 17, 13 9); `AiTactics_UseSameRules` (AI orders are legal under `ApplyBattleOrder`; injected illegal orders are rejected, fuzzed with the property runner).

---

## 11. Performance gates (GDD 18, 14.3; CR M-15, M-16; 13 4.4, 6.1, 6.8, 10.8)

`[Category("Perf")]`. Core benchmarks use a `Stopwatch` harness in `Conquest.Tests.Host/Perf/` (test code may read the clock; engine-free code may not, 2.2): median of 5 runs after 2 warm-ups; p95 over 200 calls for per-call gates. Render and allocation gates run in Unity PlayMode with the `Bench.unity` scene and `ProfilerRecorder` (13 6.8). BenchmarkDotNet is optional and needs approval (Appendix B).

| Gate | Fixture | Threshold | Host / notes |
|---|---|---|---|
| `ApplyOrder` p95 | 64x64 map, 200 units, mid-game state | < 2 ms | dotnet; GDD 18 |
| `EndTurn` (full `Advance` through economy, AI excluded) | same | < 300 ms | dotnet; GDD 18 |
| `EndTurn` at 128x128 and 256x256 with proportional units | scaled | recorded, not gated; threshold set after the first measured baseline | dotnet; ASSUMED |
| Frame time, map view | 256x256 seeded map, 2,000 units, scripted camera path (zoom 0.25 -> 2.0, pans) | <= 16.7 ms (60 fps), 99th percentile <= 25 ms, at any size up to 256x256 | PlayMode on the reference Mac; **13 6.1 tightens the old 33 ms at 256x256 to 16.7 ms** (N-25); advisory on CI runners |
| Managed allocation per map frame (pan/zoom, no state change) | same scene | 0 bytes (`ProfilerRecorder` "GC Allocated In Frame") | PlayMode; 13 4.4 |
| `ApplyOrder` allocation | 256x256, 2,000 units | < 64 KB per call (ASSUMED) | dotnet (`GC.GetAllocatedBytesForCurrentThread`) |
| `Advance` allocation | 256x256 | < 8 MB per end of turn (ASSUMED) | dotnet |
| Fog update per unit move | 256x256 | copies 1-4 chunks plus the chunk table (functional assertion) + time recorded | dotnet; CR M-16 |
| `Worldgen` | sizes 80, 128, 256 | recorded; cap per size set from the first baseline | dotnet |
| Save/load | 64x64 mid-game | recorded; cap from baseline | dotnet |
| Preview | 1000 previews of a large colony | recorded | dotnet |

Rules:
- `PerfBaselines_FileExists`: `dotnet/Conquest.Tests/golden/perf_baseline.json` holds measured numbers per runner class; a gate compares with `max(threshold, baseline * 1.5)` only for the same runner class; otherwise it is **advisory** (reports, does not fail) on shared runners and **blocking** on the reference machine (the owner's Mac or a self-hosted runner, 13 10.7).
- Functional checks (blocking, noise-free) that stand in for timing: `ApplyOrder_CopyCostIsLinearNotQuadratic` (count of container copies through instrumented `ImmArray` builders, 100 vs 200 units: ratio close to 2), `Fog_IsUlongChunksNotTupleSet` (type assertion: `ulong[]` in 16x16-tile chunks of 4 `ulong`s, 13 4.3), `World_SharedByReferenceAcrossStates` (reference identity of the terrain `World` before and after `ApplyOrder`).
- Memory: `StateSize_Bound`: canonical state bytes at 256x256 below a stored bound (advisory).
- Profiling artifact (replaces `cProfile`): on failure the job uploads the per-phase `Stopwatch` timings as JSON and, for PlayMode, the Profiler capture of the bench run. `dotnet-trace`/`dotnet-counters` are optional tools needing approval.

---

## 12. CI pipeline stages and order

Principle: fail fast and cheap first; expensive and noisy last. A stage runs only if the previous blocking stage passed. dotnet stages need only the .NET SDK and the approved NuGet test packages; Unity stages need the installed editor in batch mode. `tools/ci-local.sh --stage N` runs the same stages locally (13 10.7: local scripts first; GitHub Actions for the dotnet stages when a remote exists; GameCI or a self-hosted Mac runner for Unity stages, OWNER).

| Stage | Name | Contents and command (shape) | Typical time (ASSUMED) | Merge effect |
|---|---|---|---|---|
| 0 | Build and static | `dotnet build dotnet/Conquest.sln -warnaserror` (`TreatWarningsAsErrors`, `Nullable`, `LangVersion` 9 for libraries, `Deterministic`; 13 2.2); `dotnet format --verify-no-changes` (ships with the SDK); Unity batch-mode compile of the project (`-batchmode -quit`, fail on compile errors) | < 60 s | **Blocks** |
| 1 | Boundary and hygiene | `dotnet test --filter "FullyQualifiedName~Boundary"`: section 2 (asmdef graph, capability scans, hashed-enumeration scans, entry points, data boundary), planted-violation self-tests, csproj/asmdef parity, package allow-list, `ShippedData_ContainsNoTestOnlyFiles`, `index.json` freshness, golden/CHANGELOG pairing, allow-list/review pairing, `Catalogue_IgnoredCasesAreDeclared` | < 20 s | **Blocks** |
| 2 | Data validation | `Conquest.Tools validate-data --strict` over rules, all variants (6.1-6.3), all themes (section 5 engine-free parts), scenarios (TA 3.4 steps 1-7), tunables register; text lints (section 8) | < 60 s | **Blocks** (errors); warnings print and are budgeted |
| 3 | Unit and property (fast) | `dotnet test` without categories: `*.Tests` unit suites, RNG, `IMath`, hash and golden-format tests, preview property (100 cases), combat rule tables, hook unit tests, guard static checks 1-6, 9-10 and self-tests (section 7) | < 90 s | **Blocks** |
| 4 | Determinism | `Category=Replay|MultiProcess|Culture` on dotnet; then Unity EditMode (`-runTests -testPlatform EditMode`): the shared engine-free suite on Mono, golden replays on Mono, presentation EditMode tests (resolvers, font coverage); save/load round-trip, resumability, hooks-default hash equality | < 5 min | **Blocks** |
| 5 | Swap and simulate | `Category=Swap|Sim`: theme-swap determinism, pacing, anti-runaway, preview property (extended) | < 6 min | **Blocks** |
| 6 | Combat and soak | `Category=Combat|Soak` (reduced sizes): combat harness, early rush, profile matrix (PR size), guard soak checks 7-8 and the soak half of 9 (20 seeds), AI-vs-AI soak | < 8 min | **Blocks** for correctness assertions; the matrix pass band **blocks on changes that touch combat data, profiles or variants**, otherwise **warns** |
| 7 | Coverage, PlayMode and perf | coverlet run with the 80% gate and floors (section 13); Unity PlayMode (`-testPlatform PlayMode`): pseudo-locale layout, boot smoke, 5-turn AI game, render bench; `Category=Perf` | < 10 min | Coverage **blocks**; PlayMode correctness **blocks**; perf **warns** on shared runners and **blocks** on the reference runner |
| Nightly | Long runs | matrix N = 2000, soak 200 games, property runs 2000 cases, **IL2CPP player golden replays** (`Category=Il2cpp`, 13 3.5), dotnet stages on Linux + macOS (+ Windows if available) | < 90 min | **Warns** (records an issue); a nightly failure on `main` blocks the next release tag |
| Release | Strict | stage 2 with `--strict --release` including `PLACEHOLDER` rejection and `ship: false` exclusion; review-log completeness; pack provenance; IL2CPP replays green | < 5 min | **Blocks release** only |

Warning policy:
- Validator **errors** block; **warnings** do not, but each stage prints a count and `warnings_budget.json` pins it per theme: an increase fails the stage, a decrease prompts lowering the budget.
- Flaky policy: a test that fails then passes on rerun is reported and quarantined within 24 hours (`[Category("Quarantine")]` plus an issue); **determinism, boundary and guard tests are never quarantined** (a flaky determinism test is a bug by definition).
- Required-check names are stable (`stage-1-boundary`, `stage-4-determinism`, ...) for branch protection when a remote exists.
- Dependency rule: CI installs only approved dependencies (Appendix B). Property tests use the own runner (9.2); no library unless approved.
- Artifacts: pacing curves, matrix table, lint report, coverage (Cobertura XML), perf JSON, Profiler capture, failing-replay JSON with the first divergent turn and runtime.

---

## 13. Coverage plan and mapping table

### 13.1 Coverage gate (GDD 20: 80% minimum; 13 10.6)
- Measurement: **coverlet** under `dotnet test` on the engine-free assemblies in stage 7 (REC `coverlet.msbuild`: `/p:CollectCoverage=true /p:CoverletOutputFormat=cobertura /p:Threshold=80 /p:ThresholdType=line`; `coverlet.collector` with `--collect:"XPlat Code Coverage"` is the alternative but enforces no threshold itself). Suites in the gate: unit, determinism, variants, themes, sim and combat (perf, nightly soak and IL2CPP excluded so the gate is reproducible). Replaces `pytest --cov ... --cov-fail-under=80`.
- Per-assembly floors (ASSUMED; 13 10.6): `Conquest.Core` 90% lines and 85% branches; `Conquest.Ai` 80%; `Conquest.Rules` 90% (the validators are the safety net); `Conquest.Theme` 85%; `Conquest.App` 70%. Enforced by `Coverage_MeetsPerAssemblyFloors`, a test that parses the Cobertura XML (own small parser, no dependency; ReportGenerator is optional, Appendix B). A floor failure blocks like the global gate.
- Presentation (`Conquest.Unity.Presentation`): Unity's Code Coverage package (optional, approval) reports EditMode + PlayMode coverage; floor 50%, advisory at first (13 10.6).
- Branch coverage required (no uncovered branch, each branch named by a test) for `IMath`, `Rng`, the hashers (`StableHash`, `Sha256`, `RulesHash`), `JsonPointer` and `VariantOps`.
- Exclusions are explicit and counted: `[ExcludeFromCodeCoverage]` (replaces `# pragma: no cover`) only on defensive unreachable throws and on the `Conquest.Tests.Plants` assembly; `Coverage_ExclusionsAreCounted` fails above a stored number.
- **Mutation spot-checks (monthly or on demand, not a gate):** Stryker.NET (optional tool, approval) on `IMath`, `Rng`, `VariantOps`, `Economy`; target: tests kill at least 80% of mutants; survivors become backlog. It also covers the dropped monkeypatch half of `Preview_IsTheFunctionTheTurnUses` (9.2).
- Coverage of data, not just code: `EveryRuleKey_IsReferenced`: in the coverage run, the strict reader's DOM records which keys the typed `Rules` builder read (a test-only read tracker passed into the builder; Core stays pure); every key in `rules/core/*.json` must be read or marked `reserved` (post-MVP hooks).

### 13.2 Test group to GDD section and risk

| Test group (plan section) | GDD / source | Risk covered | Severity if missed | Stage |
|---|---|---|---|---|
| 2.1-2.2 Assembly and capability boundaries | GDD 2 rule 1, 18; TA 2.10; CR C-1, C-2; 13 2.1, 10.4 | Unity, theme or IO leaking into engine-free code; AI/Core cycle; clock, ambient randomness, floats, culture | Critical | 1 |
| 2.3 No enumeration of hashed collections | GDD 18; CR H-8(a); 13 3.3 | Order differences between runs, processes and runtimes | High | 1, 4 |
| 2.4-2.5 RNG entry points, cosmetic stream, data vocabulary | GDD 2 rule 6; TA P-9; CR C-2 | Name pool changes the game; theme words in rules | High | 1 |
| 3.1 Counter-based RNG | GDD 18; CR H-8(b); 13 3.2 | AI change shifts combat rolls; goldens break for unrelated reasons | High | 3 |
| 3.2 Integer math and floor helper | GDD 18, 8.4; CR H-8(c); 13 3.1 | Rounding drift; C# truncating division at negatives | High | 3 |
| 3.3 Runtime, process and culture independence | GDD 18, 20; CR H-8(a); 13 3.5-3.6 | Silent nondeterminism between Mono, IL2CPP, CoreCLR, processes, locales | Critical | 4, nightly |
| 3.4-3.5 Golden replays, resumability, save round-trip | GDD 6.2, 17, 20; CR C-1, M-12; 13 9 | Pipeline bugs, save corruption, hash drift | High | 4 |
| 4 Theme-swap determinism, save across themes | GDD 2 rule 4, 17; TA 2.10, 3.5; D-10; TP V-24 | Theme is not really a skin | Critical | 5 |
| 5.1-5.2 Theme coverage and no-rules | GDD 2 rule 3, 19 step 6; TA 2.4, 2.10; TP V-11, V-23 | Missing labels; numbers hiding in themes | High | 2 |
| 5.3-5.4 Placeholders and plurals | TA 5, P-14; 06 section 8 | Crashes and broken text in any locale | Medium | 2 |
| 5.5 Fallback chains | GDD 2 rule 5; TA 6.2; 13 6.7 | Broken look with partial themes | Medium | 2, 4 |
| 5.6 Pseudo-locale layout | TA 5, D-9, D-12; TP V-25 | Clipped text, layout assumptions | Medium | 7 |
| 5.7-5.8 Fonts, palette, flags | TA 5, 3.4 step 7; GDD 16; TP V-26; 13 8.4 | Missing glyphs, colour-only signals | Medium | 4 |
| 6.1-6.2 Variant ops and dangling references | TA 3.2, 3.4; 06 H0.4; 13 5.4 | Variant corrupts rules | High | 2 |
| 6.3 Rules-hash stability | TA 3.5; 06 H0.1; 13 3.4; N-12 | Silent rules change; saves loading under wrong rules | High | 2 |
| 6.4-6.5 Hooks at default, defaults frozen | 06 H0.1, R-1 | New hooks change neutral behaviour | Critical | 2, 4 |
| 6.6 Per-hook acceptance and interactions | 06 H1-H7, 7.2 | Hook bugs, ordering errors, wrong loss clock | Medium | 3 |
| 7 No-civilian-state guard + self-tests | 06 section 5; ER C.1; N-10, N-13 | A promise about state shape erodes silently | Critical (reputational) | 3, 6 |
| 8.2 Theme-forbidden words and required phrases | TA 7, P-15; ER C.1, D; TP V-01..V-05, V-21 | Wrong vocabulary, unsupported text claims | High | 2 |
| 8.3 No real personal names | ER D, P1-4; 06 hard rule; TP V-06, V-18 | Names of real people in game text | High | 2 |
| 8.4 No single-figure casualty or strength numbers | ER A.6, P0-6; TP V-07 | Unsourced or contested figures | High | 2 |
| 8.5 Allowed-context rules | ER A, D | Exceptions rot or widen | Medium | 2 |
| 9.1 Pacing targets | GDD 4, 20 | Dull or broken early game | High | 5 |
| 9.2 Preview equals real turn | GDD 8.7, 20 | Forecast lies to the player | High | 3, 5 |
| 9.3 Anti-runaway | GDD 9, 10; CR H-4, H-5 | Dominant strategy | High | 5 |
| 9.4 Order-time cost, refunds, caps | GDD 8.6; CR M-3, M-4 | Exploit and consistency bugs | Medium | 3 |
| 10.1-10.2 Combat Demo and battle rules | GDD 11, 11.7; CR M-2, M-6, M-7 | Combat unplayable or inconsistent | High | 6 |
| 10.3 Early rush | GDD 20 | Rush dominates the opening | High | 6 |
| 10.4 Profile matrix | GDD 10; CR H-5 | Unbalanced profiles | Medium | 6, nightly |
| 11 Performance | GDD 18, 14.3; CR M-15, M-16; 13 4.4, 6.1 | Unplayable at 256x256; GC hitches | Medium | 7 |
| 12 CI order | GDD 20; 13 10.7 | Late discovery of cheap failures | n/a | n/a |
| 13.1 Coverage and register tests | GDD 19, 20; CR M-17; 13 10.6 | Untested code, undocumented ASSUMED values | Medium | 7 |

---

## 14. Open questions

1. **Neutral shortage names (06 G-8.5, G-12; N-27).** The guard reads ids from the rules, so either works, but the GDD must adopt `ev.pop_lost` and `warn.food_shortage` (or accept a reviewed exception for a `starv`-containing neutral id) before the engine's event table is coded (Phase 2a).
2. **Where per-variant guard files live: settled** (N-14): `dotnet/Conquest.Tests/allowlists/`, never `StreamingAssets` (13 L176 lists `rules/variants/*.allow.json` under `StreamingAssets`; 13's owner should change that line). Still open: the same rule for pack lint data (`packlint/<themeId>/`, section 8) if 05 places lint lists in the pack folder.
3. **Lint data confidentiality.** A real-person name list is itself sensitive. Options: a salted, case-folded hashed token list with a local-only plain list for reviewers, or a private location outside the repo.
4. **Dependencies.** Every item in Appendix B needs the owner's yes before install. The plan works with the minimum set (.NET SDK, NUnit and adapter, test SDK, coverlet, Unity Test Framework); every other item is optional.
5. **Pass bands and thresholds are ASSUMED** (profile matrix 35-65% with PR vs nightly N, rush threshold, runaway margin, perf numbers beyond the GDD and 13 gates). First measured baselines replace the guesses; the register records the change.
6. **Warning budgets.** Proposed: budgeted per theme (section 12); confirm.
7. **Platform matrix.** Is a Windows runner (and the Windows build module, 13 section 14 item 9) wanted for the nightly? IL2CPP on the Mac is in the plan; is it included in the installed Mac module (13 section 0, UNVERIFIED)?
8. **How strict is `--strict` for placeholders?** PR stages tolerate PLACEHOLDER strings; only the release stage rejects them (06 section 4). Confirm.
9. **Reviewer gates in CI.** Who may set `ship: false`/`reviewed: true`, and does CI check reviewer identity against a reviewers file?
10. **Hook names and top-level document members** (06 H0.4, R-10) are proposals; `hook_defaults_v1.json` and `rules_hash.json` cannot be written until the ruleset author fixes them (V8).
11. **Parameter explosion.** Full `THEMES x VARIANTS` only for coverage and hash tests (cheap); one representative theme per variant for simulation. Confirm.
12. **UI testing depth.** UI Toolkit layout is gated by the PlayMode pseudo-locale test (5.6) and view-model tests; golden screenshot tests would need image fixtures and the owner's approval.
13. **Allow-list reviewer identity** (7.5): free text, or must `reviewer` match a maintained reviewers file?
14. **Mid-battle save policy** (GDD 17): the resumability test serialises at every phase boundary; saves outside the `orders` phase stay test-only (autosave orders-only, 13 9). Confirm.
15. **Hashed-collection rule strength (new).** 2.3 bans `Dictionary`/`HashSet` as fields, parameters and return types of engine-free assemblies (locals only). This is slightly stricter than 13 3.3 ("lookups are fine"); 13's owner should confirm, or accept rules A-B plus the replay backstop only.
16. **Two dotnet test projects (new).** `Conquest.Tests` (shared with Unity EditMode) plus `Conquest.Tests.Host` (dotnet-only) refines 13 2.2's single project. Confirm.
17. **Unity's NUnit features (new).** Which NUnit version `com.unity.ext.nunit` 2.1.0 is based on (UNVERIFIED): decides whether `[SetCulture]` and `TestCaseData.SetName` work in shared tests. Phase 0 check.
18. **Font check host (new).** Unity EditMode font-asset check, or an own `cmap` reader so glyph coverage runs under `dotnet test` (5.7)? Phase 0 decision together with the Bengali text spike.

---

## Appendix A. Old Python test id -> new C# test id

Rule M (mechanical): drop `test_`, PascalCase the words, put the method in the named class. Rows marked **R** were renamed beyond rule M or changed shape; **REMOVED** rows give the reason and what replaces them. Classes without a namespace live in the engine-free test assemblies (`Conquest.*.Tests`) unless the section says `Conquest.Tests.Host`.

| Old Python test id (section) | New C# test id | Note |
|---|---|---|
| `test_parameter_discovery_is_not_empty_and_not_stale` (1.4) | `CatalogueTests.Catalogue_DiscoveryIsNotEmptyAndNotStale` | R: also checks `index.json` freshness |
| `test_every_shipped_variant_has_a_hash_golden` (1.4) | `CatalogueTests.Catalogue_EveryShippedVariantHasHashGolden` | M |
| `test_skips_are_declared` (1.4) | `CatalogueTests.Catalogue_IgnoredCasesAreDeclared` | R: NUnit `Assert.Ignore` replaces pytest skip |
| `test_boundary_core_imports` (2.1, group) | `AsmdefBoundaryTests` (class) | R: asmdef and reference graph replace the `ast` import graph |
| `test_core_imports_only_allowed` (2.1) | `AsmdefBoundaryTests.Core_ReferencesNothing` + `Each_ReferencesOnlyAllowedAssemblies` | R |
| `test_ai_imports_only_core_and_rules` (2.1) | `AsmdefBoundaryTests.Each_ReferencesOnlyAllowedAssemblies` (Ai case) | R |
| `test_core_and_ai_never_import_presentation` (2.1) | `AsmdefBoundaryTests.CoreAndAi_NeverReachThemeAppOrUnity` | R |
| `test_core_does_not_import_ai` (2.1) | `AsmdefBoundaryTests.Core_DoesNotReferenceAi` | R |
| `test_ui_and_app_may_import_core_but_not_reverse` (2.1) | `AsmdefBoundaryTests.NoAssembly_ReferencesUnityPresentationExceptTests` + `Each_ReferencesOnlyAllowedAssemblies` | R |
| `test_dynamic_import_is_banned_in_core_and_ai` (2.1) | `AsmdefBoundaryTests.EngineFree_NoDynamicLoadingOrCodegen` | R |
| `test_no_conditional_pygame_import_anywhere_in_core` (2.1) | REMOVED | Python/pygame-only; `noEngineReferences` plus `EngineFree_HaveNoEngineReferences` and `CapabilityScanTests.EngineFree_HasNoUnityEngineReference` cover the intent (N-9) |
| `test_core_has_no_pygame` (2.2) | `CapabilityScanTests.EngineFree_HasNoUnityEngineReference` | R (N-9: pygame ban -> UnityEngine ban) |
| `test_core_has_no_wall_clock` (2.2) | `CapabilityScanTests.EngineFree_HasNoClockAccess` | R |
| `test_core_has_no_random_module` (2.2) | `CapabilityScanTests.EngineFree_HasNoAmbientRandomness` | R |
| `test_core_has_no_file_io` (2.2) | `CapabilityScanTests.EngineFree_HasNoIoOutsideFileStore` | R |
| `test_core_has_no_environment_reads` (2.2) | `CapabilityScanTests.EngineFree_HasNoEnvironmentOrCultureReads` | R |
| `test_core_has_no_global_mutable_state` (2.2) | `CapabilityScanTests.EngineFree_HasNoMutableStatics` | R |
| `test_core_math_names_are_integer_safe` (2.2) | `CapabilityScanTests.Core_HasNoFloatingPointOrUncheckedDivision` | R (N-9: `math` names -> float, `/`, `%` scan) |
| `test_core_dataclasses_are_frozen` (2.2) | `CapabilityScanTests.CoreState_TypesAreSealedAndReadonly` | R (N-9: frozen dataclasses -> sealed/readonly scan) |
| `test_apply_order_never_mutates` (2.2) | `CapabilityScanTests.ApplyOrder_NeverMutatesInput` | R |
| (new, 2.2) | `CapabilityScanTests.EngineFree_UsesOrdinalAndInvariantOnly`, `EngineFree_NeverCallsStringGetHashCode` | new C# risks (13 3.2, 3.6) |
| `test_no_unordered_iteration` (2.3) | `HashedEnumerationTests.EngineFree_NeverEnumeratesHashedCollections` | R (N-9: set iteration -> `Dictionary`/`HashSet` enumeration scan) |
| `SetIterGuard` runtime sentinel (2.3) | REMOVED | relied on patching `builtins.set` at runtime; replaced by type rule C (no hashed collections in fields or signatures) and the replay backstop (3.3) |
| `test_set_iteration_lint_catches_planted_code` (2.3) | `HashedEnumerationTests.HashedEnumerationScan_CatchesPlantedCode` | R: plants in `Conquest.Tests.Plants` |
| `test_only_rng_module_hashes` (2.4) | `EntryPointTests.HashingCode_OnlyInRngAndHashingTypes` | R |
| `test_rng_call_sites_pass_stream_and_key` (2.4) | `EntryPointTests.RngCallSites_PassRegisteredStream` | R: argument count is enforced by the signature |
| `test_cosmetic_stream_is_not_read_by_core` (2.4) | `EntryPointTests.CosmeticStream_UnreachableFromCore` | R |
| `test_rules_files_contain_no_theme_vocabulary` (2.5) | `RulesDataBoundaryTests.RulesData_ContainsNoThemeVocabulary` | R |
| `test_rules_files_contain_no_presentation_keys` (2.5) | `RulesDataBoundaryTests.RulesData_ContainsNoPresentationKeys` | R |
| `test_boundary_self.py` (2.6) | `BoundarySelfTests.EachScan_ReportsItsPlantedViolation`, `EachScan_CleanInputHasNoFindings` | R: C# plants |
| `test_draw_is_pure` (3.1) | `RngTests.DrawIsPure` | M (re-import -> second process) |
| `test_draw_depends_on_every_argument` (3.1) | `RngTests.DrawDependsOnEveryArgument` | M |
| `test_streams_are_independent` (3.1) | `RngTests.StreamsAreIndependent` | M |
| `test_removing_an_ai_draw_does_not_move_combat` (3.1) | `RngTests.RemovingAnAiDraw_DoesNotMoveCombat` | R: test-only planner instead of a monkeypatch |
| `test_draw_range_is_unbiased_enough` (3.1) | `RngTests.RangeIsUnbiasedEnough` | R |
| `test_draw_range_bounds_inclusive_exclusive` (3.1) | `RngTests.RangeBoundsInclusiveExclusive` | R |
| `test_draw_range_handles_huge_and_negative_inputs` (3.1) | `RngTests.DrawHandlesExtremeInputs` | R: seeds and keys are `ulong` (no negatives); extremes are 0 and `MaxValue` |
| `test_golden_draws` (3.1) | `RngTests.DrawMatchesGoldenTable` | R |
| `test_stream_names_are_registered` (3.1) | `RngTests.StreamCodesAreFnv1a64OfUtf8Name` | R: also pins the codes |
| `test_no_float_in_rng` (3.1) | REMOVED | return types are `ulong`/`int` by signature; floats are banned by `Core_HasNoFloatingPointOrUncheckedDivision` |
| (new, 3.1) | `RngTests.SplitMix64MatchesPublishedVectors`, `Fnv1a64MatchesPublishedVectors` | 13 3.2 |
| `test_floor_helper_rounds_toward_negative_infinity` (3.2) | `IMathTests.FloorDivRoundsTowardNegativeInfinity` | R |
| `test_floor_helper_is_the_only_rounding_site` (3.2) | `IMathTests.IMathIsTheOnlyDivisionSite` (pointer to the 2.2 scan) | R |
| `test_percent_chain_floors_once` (3.2) | `IMathTests.ChainPctFloorsOnce` | R |
| `test_movement_setting_ratios_are_rational_pairs` (3.2) | `IMathTests.MovementSettingRatiosAreRationalPairs` | M |
| `test_modifier_clamp_is_integer_percent` (3.2) | `IMathTests.ModifierClampIsIntegerPercent` | M |
| `test_interest_uses_per_mille_and_cap` (3.2) | `IMathTests.InterestUsesPerMilleAndCap` | M |
| `test_rules_loader_rejects_float_rates` (3.2) | `IMathTests.RulesLoaderRejectsFractionalNumbers` | R: strict reader (13 3.7) |
| (new, 3.2) | `IMathTests.OverflowThrows` | `checked` arithmetic (13 3.1) |
| `test_replay_identical_under_two_hash_seeds` (3.3) | `GoldenReplayTests.Replay_IdenticalAcrossRuntimes` + `Replay_IdenticalAcrossTwoProcesses` + `Replay_IdenticalUnderCultures` | R (N-9: two hash seeds -> three-runtime replay, two processes, cultures) |
| `test_state_hash_independent_of_dict_insertion_order` (3.3) | `StateHashTests.StateHash_IndependentOfConstructionOrder` | R |
| `test_world_generation_identical_under_two_hash_seeds` (3.3) | `WorldgenTests.Worldgen_IdenticalAcrossRuntimesAndProcesses` | R |
| `test_ai_plan_identical_under_two_hash_seeds` (3.3) | `AiPlanTests.AiPlan_IdenticalAcrossRuntimesAndProcesses` | R |
| `test_hash_seed_runner_really_varies_hash` (3.3) | `HarnessTests.ProcessHarness_StringHashReallyVaries` + `CultureHarness_ReallyChangesOrder` | R (N-9: `tr-TR` sanity check, 13 3.5) |
| `test_planted_set_order_dependence_is_detected` (3.3) | `HarnessTests.Harness_DetectsPlantedOrderDependence` | R |
| `test_golden_replay_hashes_match` (3.4) | `GoldenReplayTests.GoldenReplayHashesMatch` | M |
| `test_golden_update_is_explicit` (3.4) | `GoldenReplayTests.GoldenUpdateIsExplicit` | M (tool is `Conquest.Tools update-goldens`) |
| `test_state_hash_covers_declared_fields_only` (3.4) | `StateHashTests.StateHash_CoversDeclaredFieldsOnly` | R |
| `test_hash_changes_when_any_hashed_field_changes` (3.4) | `StateHashTests.StateHash_ChangesWhenAnyHashedFieldChanges` | R |
| (new, 3.4) | `StateHashTests.StateHash_DefaultHookFieldsAreOmitted` | 06 H0.1 |
| `test_replay_is_resumable_after_each_phase` (3.4) | `GoldenReplayTests.Replay_ResumableAfterEachPhase` | R |
| `test_replay_order_independent_where_simultaneous` (3.4) | `GoldenReplayTests.Replay_OrderIndependentWhereSimultaneous` | R |
| `test_ai_plan_independent_of_human_moves_this_turn` (3.4) | `AiPlanTests.AiPlan_IndependentOfHumanMovesThisTurn` | R |
| `test_save_load_roundtrip_hash_equal` (3.5) | `SaveTests.SaveLoad_RoundTripHashEqual` | R |
| `test_replay_cross_platform_note` (3.5) | REMOVED (was never a test) | CI matrix entry, section 12 |
| `test_theme_swap_determinism` (4.1) | `ThemeSwapTests.ThemeSwap_PerTurnHashesAndEventsIdentical` | R |
| `test_presentation_is_built_after_and_never_passed_to_core` (4.1) | `ThemeSwapTests.AppDriver_BuildsPresentationAfterStateAndNeverHandsItToCore` | R: "never passed" is enforced by assembly references |
| `test_empty_theme_is_playable_headless_and_renders_fallbacks` (4.1) | `ThemeSwapTests.EmptyTheme_PlayableHeadlessWithFallbacks` | R |
| `test_theme_switch_mid_game_changes_no_state` (4.1) | `ThemeSwapTests.ThemeSwitchMidGame_ChangesNoState` | R |
| `test_cosmetic_name_pool_size_does_not_change_the_game` (4.1) | `ThemeSwapTests.CosmeticNamePoolSize_DoesNotChangeTheGame` | R |
| `test_longer_theme_text_cannot_change_rules_hash` (4.1) | `ThemeSwapTests.LongerThemeText_CannotChangeRulesHash` | R |
| `test_save_reload_other_theme` (4.2) | `SaveAcrossThemesTests.SaveReload_UnderOtherTheme` | R |
| `test_save_with_mismatched_rules_hash_runs_migration_or_refuses` (4.2) | `SaveAcrossThemesTests.Save_WithMismatchedRulesHash_MigratesOrRefuses` | R |
| `test_newer_save_version_never_overwritten` (4.2) | `SaveAcrossThemesTests.Save_NewerVersionNeverOverwritten` | R |
| `test_damaged_save_keeps_bak` (4.2) | `SaveAcrossThemesTests.Save_DamagedKeepsBak` | R |
| `test_locale_switch_does_not_touch_state` (4.2) | `SaveAcrossThemesTests.LocaleSwitch_DoesNotTouchState` | R |
| `test_theme_coverage` (5.1) | `ThemeCoverageTests.ThemeCoverage` | M |
| (new, 5.1) | `ThemeCoverageTests.SideKeyedEvents_PickSubKeyByComparedSlot` | 06 section 8 rule 2; N-2 |
| `test_theme_has_no_rules` (5.2) | `ThemeHasNoRulesTests` (class; cases as in 5.2) + `ThemeValidator_ReportsEveryBannedKeyOnce` | R |
| `test_every_template_renders_with_sample_payload` (5.3) | `TemplateRenderTests.EveryTemplate_RendersWithSamplePayload` | R |
| `test_placeholder_set_matches_payload_schema` (5.3) | `TemplateRenderTests.PlaceholderSet_IsSubsetOfPayloadFields` | R |
| `test_missing_payload_field_is_a_typed_error_not_a_crash` (5.3) | `TemplateRenderTests.MissingPayloadField_IsTypedFallbackNotCrash` | R |
| `test_format_spec_support` (5.3) | `TemplateRenderTests.FormatSpec_UsesLocaleDataNotOsCulture` | R |
| `test_brace_escaping` (5.3) | `TemplateRenderTests.BraceEscaping` | M |
| `test_templates_are_whole_sentences` (5.3) | `TemplateRenderTests.Templates_AreWholeSentences` | R: C# source scan |
| `test_player_typed_text_is_never_translated_or_executed` (5.3) | `TemplateRenderTests.PlayerTypedText_IsNeverTranslatedOrExecuted` | R |
| `test_plural_maps_have_other` (5.4) | `PluralTests.PluralMaps_HaveOther` | R |
| `test_plural_rules_for_shipped_locales` (5.4) | `PluralTests.PluralRules_ForShippedLocales` | R |
| `test_label_count_uses_plural` (5.4) | `PluralTests.LabelCount_UsesPlural` | R |
| `test_irregular_plural_words` (5.4) | `PluralTests.IrregularPluralWords` | M |
| `test_gender_and_article_extra_forms` (5.4) | `PluralTests.GenderAndArticleExtraForms` | M |
| `test_text_fallback_chain` (5.5) | `FallbackChainTests.TextFallbackChain` | M |
| `test_asset_fallback_chain` (5.5) | `FallbackChainTests.AssetFallbackChain` | M |
| `test_audio_fallback_chain` (5.5) | `FallbackChainTests.AudioFallbackChain` | M |
| `test_theme_extends_cycle_is_an_error` (5.5) | `FallbackChainTests.ThemeExtendsCycle_IsAnError` | R |
| `test_asset_cache_cleared_on_theme_switch` (5.5) | `FallbackChainTests.AssetCache_ClearedOnThemeSwitch` | R: Unity EditMode |
| `test_asset_size_matches_ruleset_footprint` (5.5) | `FallbackChainTests.AssetSize_MatchesRulesetFootprint` | R |
| `test_every_manifest_entry_has_provenance_in_strict` (5.5) | `FallbackChainTests.EveryManifestEntry_HasProvenanceInStrict` | R |
| `test_pseudo_locale_preserves_placeholders` (5.6) | `PseudoLocaleTests.PseudoLocale_PreservesPlaceholders` | R |
| `test_no_ui_string_is_clipped_in_pseudo_locale` (5.6) | `PseudoLocaleTests.NoUiString_IsClippedInPseudoLocale` | R: Unity PlayMode with UI Toolkit replaces the pygame dummy driver |
| `test_pseudo_locale_covers_every_key` (5.6) | `PseudoLocaleTests.PseudoLocale_CoversEveryKey` | R |
| `test_longest_string_per_container_report` (5.6) | `PseudoLocaleTests.LongestStringPerContainer_Report` | R |
| `test_font_has_glyphs_for_locale_sample` (5.7) | `FontCoverageTests.FontHasGlyphsForLocaleSample` | M; Unity EditMode or own `cmap` reader replaces fontTools/pygame metrics |
| `test_sample_string_covers_locale_alphabet` (5.7) | `FontCoverageTests.SampleString_CoversLocaleAlphabet` | R |
| `test_font_fallback_builtin` (5.7) | `FontCoverageTests.FontFallback_Builtin` | R |
| `test_pseudo_locale_glyphs` (5.7) | `FontCoverageTests.PseudoLocaleGlyphs_InBuiltinFont` | R |
| `test_palette_contrast_text_pairs` (5.8) | `PaletteTests.PaletteContrast_TextPairs` | R |
| `test_adjacent_terrain_colours_distinguishable` (5.8) | `PaletteTests.AdjacentTerrainColours_Distinguishable` | R |
| `test_owner_colours_distinguishable_with_deuteranopia_simulation` (5.8) | `PaletteTests.OwnerColours_DistinguishableUnderDeuteranopiaSimulation` | R |
| `test_flag_or_pattern_present_for_every_slot` (5.8) | `PaletteTests.FlagOrPattern_PresentForEverySlot` | R |
| `test_variant_schema_rejects_unknown_op` (6.1) | `VariantOpTests.Schema_RejectsUnknownOp` | R |
| `test_variant_op_requires_pointer_and_value_shape` (6.1) | `VariantOpTests.Op_RequiresPointerAndValueShape` | R |
| (new, 6.1) | `VariantOpTests.AddAndReplace_StayDistinct` | 13 5.4 |
| `test_variant_cannot_contain_code_or_expressions` (6.1) | `VariantOpTests.Variant_CannotContainCodeOrExpressions` | R |
| `test_variant_op_order_matters_and_is_stable` (6.1) | `VariantOpTests.OpOrder_MattersAndIsStable` | R |
| `test_variant_applies_to_check` (6.1) | `VariantOpTests.AppliesTo_Check` | R |
| `test_variant_may_not_add_role_ids_without_declaration` (6.1) | `VariantOpTests.Variant_MayNotAddRoleIdsWithoutDeclaration` | R |
| `test_variant_cannot_touch_theme_or_match_settings` (6.1) | `VariantOpTests.Variant_CannotTouchThemeOrMatchSettings` | R |
| `test_variant_revalidated_after_overlay` (6.2) | `VariantRevalidationTests.Variant_RevalidatedAfterOverlay` | R |
| `test_every_shipped_variant_pointer_resolves` (6.2) | `VariantRevalidationTests.EveryShippedVariantPointer_Resolves` | R |
| `test_variant_stack_order_and_conflict` (6.2) | `VariantRevalidationTests.VariantStack_OrderAndConflict` | R: compares merged documents; hashes always differ by stack order (N-12) |
| `test_variant_superset_relation_is_checked_where_declared` (6.2) | `VariantRevalidationTests.Includes_IsCheckedOpByOp` | R |
| `test_rules_hash_golden` (6.3) | `RulesHashTests.RulesHash_MatchesGolden` | R |
| `test_rules_hash_independent_of_key_order_and_whitespace` (6.3) | `RulesHashTests.RulesHash_IndependentOfKeyOrderAndWhitespace` | R |
| `test_rules_hash_independent_of_note_keys` (6.3) | `RulesHashTests.RulesHash_IgnoresUnderscoreKeys` | R: every `_`-prefixed key (N-12) |
| `test_rules_hash_changes_on_any_semantic_edit` (6.3) | `RulesHashTests.RulesHash_ChangesOnAnySemanticEdit` | R |
| `test_rules_hash_independent_of_version_string` (6.3) | `RulesHashTests.RulesHash_IgnoresVersionString` | R |
| `test_variant_ids_and_versions_are_in_the_hash` (6.3) | `RulesHashTests.RulesHash_IncludesVariantStackInOrder` | R (N-12) |
| (new, 6.3) | `RulesHashTests.RulesHash_NullOmittedOnlyWhenDeclaredDefault`, `Sha256_MatchesNistVectorsAndBcl` | N-12; 13 3.4 |
| `test_theme_and_match_settings_not_in_rules_hash` (6.3) | `RulesHashTests.RulesHash_ExcludesThemeAndMatchSettings` | R |
| `test_hash_stable_across_python_versions` (6.3) | `RulesHashTests.RulesHash_IdenticalInDotnetAndUnityHosts` | R (N-9: Python versions -> LangVersion 9 parity between Unity and dotnet) |
| `test_hooks_default_elision_hash_equal` (6.4) | `HookDefaultTests.HooksDefault_ElisionKeepsRulesHash` | R |
| `test_hooks_default_state_hash_equal` (6.4) | `HookDefaultTests.HooksDefault_KeepsStateHash` | R; `start_base_count` removed (N-7a) |
| `test_non_default_hook_value_changes_rules_hash` (6.4) | `HookDefaultTests.NonDefaultHookValue_ChangesRulesHash` | R |
| `test_state_field_present_only_when_non_default` (6.4) | `HookDefaultTests.HookStateFields_PresentOnlyWhenNonDefault` | R |
| `test_hook_defaults_frozen` (6.5) | `HookDefaultsFrozenTests.HookDefaultsFrozen` | M (06 keeps the old name as the concept name) |
| `test_each_hook_default_is_neutral_by_behaviour` (6.5) | `HookDefaultsFrozenTests.EachHookDefault_IsNeutralByBehaviour` | R |
| `tests/variants/test_hook_<name>.py` (6.6) | `ArrivalEntryTilesTests`, `PrePlacedBasesTests`, `SeasonsTests`, `EndConditionsTests`, `TimedEffectsTests`, `RegionRulesTests`, `HealingSourcesTests` | R |
| `test_hook_draws_no_random_numbers` (6.6) | `<Hook>Tests.Hook_DrawsNoRandomNumbers` | R |
| (new, 6.6) | `EndConditionsTests.InitialSitesHeldAtMostPct_*` (4 tests), `InitialSiteCount_FixedAtScenarioLoadAndNotState`, `Elimination_HomelessLimitTakesPrecedence`, `HomelessCounter_IgnoresFounders`, `SurrenderOrder_DeadlineAndAllOut` | 06 H4 (replaces `start_base_count`; N-7) |
| `tests/test_bd1971_no_civilian_state.py` (7) | `Conquest.Tests.Host.Guards.Bd1971NoCivilianState` (ten checks) + `Bd1971NoCivilianStateSelfTests` | R; data in `dotnet/Conquest.Tests/allowlists/` (N-14) |
| `test_guard_passes_on_clean_tree` (7.3) | `Bd1971NoCivilianStateSelfTests.Guard_PassesOnCleanInputs` | R: in-memory inputs, not a scratch source tree |
| `test_selftests_cover_every_check` (7.3) | `Bd1971NoCivilianStateSelfTests.SelfTests_CoverEveryCheck` | R: includes 4c |
| (new, 7) | `ShapeReflector_SeesPlantedField`, `SoakTrace_RecordsEveryPopChange` | N-10; check 7 as a pure function |
| `test_every_variant_declaring_a_guard_has_guard_files` (7.6) | `AllowListGuardTests.Variants_DeclaringGuardsHaveGuardFiles` | R |
| `test_forbidden_words_absent` (8.2) | `ThemeLintTests.ForbiddenWords_Absent` | R |
| `test_forbidden_words_catch_obfuscation` (8.2) | `ThemeLintTests.ForbiddenWords_CatchObfuscation` | R |
| `test_neutral_base_locale_is_clean_for_every_theme_lint` (8.2) | `ThemeLintTests.NeutralBaseLocale_IsCleanForEveryThemeLint` | R |
| `test_forbidden_words_do_not_hit_ruleset_ids` (8.2) | `ThemeLintTests.ForbiddenWords_DoNotHitRulesetIds` | R |
| `test_ids_never_appear_in_visible_text` (8.2) | `ThemeLintTests.Ids_NeverAppearInVisibleText` | R |
| `test_required_phrases_present` (8.2) | `ThemeLintTests.RequiredPhrases_Present` | R; globs per N-21 |
| `test_text_makes_no_claim_the_rules_do_not_make` (8.2) | `ThemeLintTests.Text_MakesNoClaimTheRulesDoNotMake` | R |
| `test_no_real_personal_names_in_game_text` (8.3) | `RealNameLintTests.NoRealPersonalNames_InGameText` | R |
| `test_generated_names_never_collide` (8.3) | `RealNameLintTests.GeneratedNames_NeverCollide` | R |
| `test_no_real_person_in_rules_or_scenario_ids` (8.3) | `RealNameLintTests.NoRealPerson_InRulesOrScenarioIds` | R |
| `test_no_unblocked_single_figure` (8.4) | `FigureLintTests.NoUnblockedSingleFigure` | M |
| `test_figures_are_ranges_with_attribution` (8.4) | `FigureLintTests.Figures_AreRangesWithAttribution` | R |
| `test_no_casualty_or_strength_number_in_rules_events_or_payloads` (8.4) | `FigureLintTests.NoCasualtyOrStrengthNumber_InRulesEventsOrPayloads` | R |
| `test_number_words_are_matched` (8.4) | `FigureLintTests.NumberWords_AreMatched` | R |
| `test_kill_counters_do_not_exist` (8.4) | `FigureLintTests.KillCounters_DoNotExist` | R |
| `test_allowed_contexts_are_used` (8.5) | `LintContextTests.AllowedContexts_AreUsed` | R |
| `test_allowed_context_cannot_widen_global_rules` (8.5) | `LintContextTests.AllowedContext_CannotWidenGlobalRules` | R |
| `test_context_requires_review_metadata` (8.5) | `LintContextTests.Context_RequiresReviewMetadata` | R |
| `test_lint_is_deterministic` (8.6) | `LinterTests.Lint_IsDeterministic` | R |
| `test_lint_runs_on_all_locales_and_plural_forms` (8.6) | `LinterTests.Lint_RunsOnAllLocalesAndPluralForms` | R |
| `test_pacing_targets_met` (9.1) | `PacingTests.PacingTargetsMet` | M |
| `test_pacing_targets_read_from_data` (9.1) | `PacingTests.PacingTargets_ReadFromData` | R |
| `test_opening_survives_with_variant_modifiers` (9.1) | `PacingTests.Opening_SurvivesWithVariantModifiers` | R; `warn.food_shortage` via lookup |
| `test_schedule_weighted_average_in_band` (9.1) | `PacingTests.ScheduleWeightedAverage_InBand` | R |
| `test_failure_states_each_have_one_warning` (9.1) | `PacingTests.FailureStates_EachHaveOneWarning` | R |
| `test_modifier_examples_exact` (9.1) | `PacingTests.ModifierExamples_Exact` | R |
| `test_specialisation_bonus_cap` (9.1) | `PacingTests.SpecialisationBonus_Cap` | R |
| `test_preview_equals_next_turn` (9.2) | `PreviewTests.PreviewEqualsNextTurn` | M; own `PropertyRunner` replaces `hypothesis` |
| `test_preview_is_the_function_the_turn_uses` (9.2) | `PreviewTests.Preview_IsTheFunctionTheTurnUses` | R: IL call-graph check; monkeypatch half moved to the optional mutation run |
| `test_preview_has_no_side_effects` (9.2) | `PreviewTests.Preview_HasNoSideEffects` | R |
| `test_pure_trade_colony_not_runaway` (9.3) | `RunawayTests.PureTradeColony_NotRunaway` | R |
| `test_price_rises_one_percent_per_unit_bought_and_decays_twenty` (9.3) | `RunawayTests.PriceRisesOnePercentPerUnitBoughtAndDecaysTwenty` | M |
| `test_import_cap_scales_with_dock_level` (9.3) | `RunawayTests.ImportCap_ScalesWithDockLevel` | R |
| `test_sell_price_below_buy_price` (9.3) | `RunawayTests.SellPrice_BelowBuyPrice` | R |
| `test_interest_cap_binds` (9.3) | `RunawayTests.InterestCap_Binds` | R |
| `test_interest_off_by_variant_produces_zero_growth` (9.3) | `RunawayTests.InterestOffByVariant_ProducesZeroGrowth` | R |
| `test_tax_rate_tunables_apply_and_zero_means_no_tax` (9.3) | `RunawayTests.TaxRateTunables_ApplyAndZeroMeansNoTax` | R |
| `test_hoarding_is_not_dominant` (9.3) | `RunawayTests.Hoarding_IsNotDominant` | R |
| `test_costs_deducted_at_order_time_and_refund_rules` (9.4) | `EconomyRuleTests.CostsDeductedAtOrderTime_AndRefundRules` | R |
| `test_no_building_exceeds_center_level` (9.4) | `EconomyRuleTests.NoBuilding_ExceedsCenterLevel` | R |
| `test_center_cannot_be_demolished` (9.4) | `EconomyRuleTests.Center_CannotBeDemolished` | R |
| `test_population_never_negative` (9.4) | `EconomyRuleTests.Population_NeverNegative` | R |
| `test_stocks_never_negative` (9.4) | `EconomyRuleTests.Stocks_NeverNegative` | R |
| `test_growth_stops_at_housing_cap` (9.4) | `EconomyRuleTests.Growth_StopsAtHousingCap` | R |
| `test_church_diminishing_returns_100_75_50` (9.4) | `EconomyRuleTests.Church_DiminishingReturns_100_75_50` | R |
| `test_recruit_schema_is_uniform` (9.4) | `EconomyRuleTests.RecruitSchema_IsUniform` | R |
| `test_register_covers_every_tunable` (9.4) | `EconomyRuleTests.Register_CoversEveryTunable` | R |
| `test_combat_demo_point_buy` (10.1, group) | `CombatDemoTests` (class) | R |
| `test_point_costs` (10.1) | `CombatDemoTests.PointCosts` | M |
| `test_budget_range_enforced` (10.1) | `CombatDemoTests.BudgetRange_Enforced` | R |
| `test_capacity_rules` (10.1) | `CombatDemoTests.CapacityRules` | M |
| `test_roster_generation_is_deterministic` (10.1) | `CombatDemoTests.RosterGeneration_IsDeterministic` | R |
| `test_terrain_is_cosmetic_in_demo` (10.1) | `CombatDemoTests.Terrain_IsCosmeticInDemo` | R |
| `test_demo_uses_real_battle_code` (10.1) | `CombatDemoTests.Demo_UsesRealBattleCode` | R: IL call-graph check instead of a monkeypatch counter |
| `test_attack_definition` (10.2) | `BattleRuleTests.AttackDefinition` | M |
| `test_early_rush_cannot_take_level1_colony` (10.3) | `EarlyRushTests.EarlyRush_CannotTakeLevel1Colony` | R |
| `test_rush_with_one_extra_unit_has_nonzero_chance` (10.3) | `EarlyRushTests.RushWithOneExtraUnit_HasNonzeroChance` | R |
| `test_profile_matrix_pass_band` (10.4) | `ProfileMatrixTests.ProfileMatrixPassBand` | M |
| `test_non_combat_bonus_profiles_are_covered_elsewhere` (10.4) | `ProfileMatrixTests.NonCombatBonusProfiles_AreCoveredElsewhere` | R |
| `test_rating_value_matters` (10.4) | `ProfileMatrixTests.RatingValue_Matters` | R |
| `test_equal_nations_matrix_is_flat` (10.4) | `ProfileMatrixTests.EqualNationsMatrix_IsFlat` | R |
| `test_ai_vs_ai_matrix_soak` (10.4) | `ProfileMatrixTests.AiVsAiMatrix_Soak` | R |
| `test_auto_resolve_equals_ai_driven_battle` (10.5) | `AiBattleTests.AutoResolve_EqualsAiDrivenBattle` | R |
| `test_ai_tactics_use_same_rules` (10.5) | `AiBattleTests.AiTactics_UseSameRules` | R |
| `test_perf_baselines_file_exists` (11) | `PerfTests.PerfBaselines_FileExists` | R |
| `test_apply_order_copy_cost_is_linear_not_quadratic` (11) | `PerfTests.ApplyOrder_CopyCostIsLinearNotQuadratic` | R |
| `test_fog_is_bytes_not_tuple_set` (11) | `PerfTests.Fog_IsUlongChunksNotTupleSet` | R: fog is `ulong[]` chunks (13 4.3) |
| `test_world_shared_by_reference_across_states` (11) | `PerfTests.World_SharedByReferenceAcrossStates` | R |
| `test_state_size_bound` (11) | `PerfTests.StateSize_Bound` | R |
| (new, 11) | PlayMode frame-time and GC-alloc gates (`BenchTests`) | 13 4.4, 6.8; N-25 |
| `test_every_rule_key_is_referenced` (13.1) | `CoverageDataTests.EveryRuleKey_IsReferenced` | R: read tracker in the builder |
| (new, 1-13) | `ShippedData_ContainsNoTestOnlyFiles`, `TestSupport_HasNoMutableStatics`, `CsprojAndAsmdef_AreInParity`, `UnityPackages_ManifestMatchesAllowList`, `Coverage_MeetsPerAssemblyFloors`, `Coverage_ExclusionsAreCounted` | N-14; 13 2.2, R-10, 10.6 |

---

## Appendix B. Dependencies this plan implies

Every item **needs owner approval before install** (project rule "Ask before adding dependencies"; 13 section 14). Nothing has been installed. "13 #n" points to 13's own list.

| # | Item | Kind | Needed for | Required or optional | 13 # |
|---|---|---|---|---|---|
| 1 | .NET SDK (current LTS; version UNVERIFIED on this Mac) | tool | `dotnet build`, `dotnet test`, `dotnet format`, `Conquest.Tools` | required | 2 |
| 2 | NuGet `NUnit`, `NUnit3TestAdapter`, `Microsoft.NET.Test.Sdk` | NuGet, dev only | all dotnet tests | required | 6 |
| 3 | NuGet `coverlet.msbuild` (REC, enforces the threshold) or `coverlet.collector` | NuGet, dev only | 80% gate (13.1) | required | 7 |
| 4 | `com.unity.test-framework` + `com.unity.ext.nunit` | Unity packages | EditMode/PlayMode tests | required | 5 |
| 5 | `com.unity.testtools.codecoverage` | Unity package | presentation coverage report | optional | 10 |
| 6 | Property-testing library (`FsCheck`, which brings `FSharp.Core`, or `CsCheck`) | NuGet, dev only | shrinking in 9.2 | optional, **not REC** (own `PropertyRunner` instead) | not in 13 |
| 7 | Stryker.NET | dotnet tool | mutation spot-checks (13.1) | optional | not in 13 |
| 8 | BenchmarkDotNet | NuGet, dev only | precise Core benchmarks | optional | 16 |
| 9 | `dotnet-trace`, `dotnet-counters` | dotnet tools | profiling artifacts (11) | optional | not in 13 |
| 10 | ReportGenerator | dotnet tool | HTML coverage reports | optional, not REC (own Cobertura parser) | not in 13 |
| 11 | Roslyn analyzer packages (`Microsoft.CodeAnalysis.CSharp`, `Microsoft.CodeAnalysis.Analyzers`) | NuGet + analyzer DLL in Unity | compile-time determinism bans (2.3) | optional (13 D-U11) | 15 |
| 12 | `System.Reflection.Metadata` | in the .NET runtime (UNVERIFIED that no package is needed) | IL scans (2) | required if not in-box | not in 13 |
| 13 | Windows build module; IL2CPP availability in the Mac module (UNVERIFIED) | Unity modules | Windows nightly; IL2CPP replays | optional / required for `Il2cpp` | 9 |
| 14 | GameCI actions, Docker images and a Unity licence secret, or a self-hosted runner | CI services (may cost) | Unity stages in remote CI | optional | 17 |

Removed with the Python plan (no longer needed): `pytest`, `pytest-cov` (replaced by NUnit and coverlet), `hypothesis` (replaced by the own property runner), `fontTools` and pygame font metrics (replaced by a Unity font check or an own `cmap` reader), `pygame-ce` and `SDL_VIDEODRIVER=dummy` (replaced by Unity PlayMode), `PYTHONHASHSEED` (replaced by the multi-runtime, multi-process and culture runs), `cProfile` (replaced by `Stopwatch` timings and the Unity Profiler).

---

## Change log (C# rewrite)

Source: [16-final-consistency-check.md](16-final-consistency-check.md) (N-n) and [13-unity-architecture-plan.md](../13-unity-architecture-plan.md). Only this file was edited. 06 and 05 were read for authority (06 re-read after the rewrite; see the last row).

| # | Report id | Change in 10 |
|---|---|---|
| 1 | N-11; 16 3.2 list of Python places | Tooling note at the top; every place 16 3.2 lists for 10 is rewritten: default `pytest` run (1.1) -> `dotnet test`; `conftest.py`/`.py` layout (1.2) -> assemblies of 13 2.1-2.2 with two dotnet test projects; `@pytest.mark.parametrize` (1.4) -> `TestCaseSource`; marks incl. `hashseed` (1.5) -> NUnit categories; section 2 (`ast` import graph, stdlib allow-list, pygame bans, frozen dataclasses, `SetIterGuard`) -> asmdef, reflection, IL and source scans; 3.3 `PYTHONHASHSEED` -> multi-runtime, multi-process and culture runs; `python -m conquest.tools...` -> `Conquest.Tools`; pygame dummy driver and `fontTools` (5.6-5.7) -> Unity PlayMode/EditMode or an own `cmap` reader; `test_hash_stable_across_python_versions` -> dotnet/Unity host parity; Python `re` -> .NET `Regex` with timeout; `hypothesis` -> own property runner; `cProfile` -> `Stopwatch` timings and Profiler capture; section 12 commands; `pytest --cov` and `# pragma: no cover` -> coverlet and `[ExcludeFromCodeCoverage]`; old Q4 and Q12 rewritten |
| 2 | N-7 (a) | 6.4: `start_base_count` removed; new state fields are `site_id` and `no_base_turns`; `initial_site_count` is scenario-load data, never state, not hashed; 6.6 adds the generic `initial_sites_held_at_most_pct` tests from 06 H4 |
| 3 | N-7 (b) | 6.6: "H4 x H1 arrivals reset the clock" replaced by 06 7.2's rule: a founder arrival resets only the grace counter `no_base_turns`, never the homeless counter; new tests `HomelessCounter_IgnoresFounders` and `Elimination_HomelessLimitTakesPrecedence` |
| 4 | N-9 | Appendix A maps every old test id; the Python-only ones are renamed as N-9 proposes (pygame -> UnityEngine ban, frozen dataclasses -> sealed/readonly scan, `math` names -> float/`/`/`%` scan, set iteration -> `Dictionary`/`HashSet` enumeration scan, two hash seeds -> three-runtime replay plus `tr-TR` sanity check, Python versions -> LangVersion 9 host parity) or marked REMOVED with the reason |
| 5 | N-10 | 7.2 check 3: the state-field snapshot is the full reflected field set (hashed or not), explicitly not the hash field list of 3.4; `ShapeReflector_SeesPlantedField` added |
| 6 | N-12 | 3.4 states the hash rules (all `_`-prefixed keys stripped, version string not hashed, variant stack hashed in order, null omitted only where null is the declared default); 6.3 gains `RulesHash_IgnoresUnderscoreKeys`, `RulesHash_IncludesVariantStackInOrder`, `RulesHash_NullOmittedOnlyWhenDeclaredDefault`; `VariantStack_OrderAndConflict` corrected (hashes always differ by order; commutativity is checked on the merged document) |
| 7 | N-13 | 7.3 keeps the full planted-violation table and adds the 4c plants and a `real_place` plant as rows, so the set 06 and 13 cite is explicit |
| 8 | N-14 | Allow-lists, review logs, forbidden tokens, goldens, fixtures and pack lint data live under `dotnet/Conquest.Tests/`, never in `StreamingAssets`; new `ShippedData_ContainsNoTestOnlyFiles`; old Q2 settled |
| 9 | N-21 | 8.1 `required_phrases` example uses `ev.pop_lost*` and `warn.food_shortage*` (not `ev.shortage*`); 8.2 notes N-1 ("returned home" does not contain "return home") |
| 10 | N-24 | V2, V3 and check 6's flag name marked settled (grace 15 and homeless 15; K = 6, N = 3 with 4 still offered; `raid_can_destroy`) |
| 11 | N-25 | Section 11: frame budget 16.7 ms (p99 25 ms) at up to 256x256 per 13 6.1, replacing 33 ms; GC-alloc gates from 13 4.4 added |
| 12 | N-16 | Theme swap (4.1) discovers every shipped theme (incl. `bd1971`) plus `__empty__`; no `starfall` |
| 13 | 13 3.1-3.7, 4.3, 5, 9, 10 | RNG signature, SplitMix64/FNV-1a vectors, `IMath` (C# truncating `/`, `checked`), strict reader rejections, own SHA-256 vs BCL and NIST, culture runs, combat odds in per-mille 50..950, fog as `ulong` chunks, `IFileStore` save tests, PlayMode bench |
| 14 | Task brief (dependencies) | Appendix B lists every implied dependency, each needing owner approval before install; Python dependencies listed as removed with their replacements |
| 15 | 06 re-read at the end | Conformed to 06 as on disk at the end of this edit: tooling note and C# fixture name `Bd1971NoCivilianState`; H0.1 hash rules (a)-(c); ten checks, 4c, token list incl. `execut` pre-registration, `ev.pop_lost{base, amount, cause}`; H4 predicate and elimination precedence; 06 7.2 H4 x H1; section 8 side-keyed events (`ev.match_won` by `winner_slot`, `ev.site_taken` by `taker_slot`, N-2) and the opaque-id list incl. `unit` rendering (N-15) |
| 16 | N-2, N-15 | 5.1 coverage requires the `.gained`/`.lost` sub-keys and gains `SideKeyedEvents_PickSubKeyByComparedSlot`; 5.3 sample payloads cover `from`, `taker_slot`, `target_slot`, `id` and `unit`; 10.2 names the raid-conversion event payload |

**Not applied, and why.**
- **13 L67** ("every test name in TP10"), **13 L176** (`*.allow.json` under `StreamingAssets`), **13 L544** (state-field snapshot via the hash list; "two" self-tests): fixes belong to 13's owner (N-9, N-10, N-13, N-14); this file now states the correct rule from its side.
- **06 section 5** keeps the Python file name `tests/test_bd1971_no_civilian_state.py` beside its new C# name: 06's text; this file uses the C# fixture `Bd1971NoCivilianState` and `dotnet/Conquest.Tests/allowlists/`, as 06 now does (7).
- **05 V-24** still names `starfall`; **05 V-04** scope (N-21) and the N-1 string: 05's edits. 8.1 marks the V-04 scope `[VOLATILE]`.
- **New proposals for other owners** (two dotnet test projects; `Dictionary`/`HashSet` banned in signatures; own `cmap` reader): stated as REC and open questions 15-18, not as decisions.
- **Readiness (self-assessed against 16 5.2): READY WITH PLACEHOLDERS.** Placeholders: dependency approvals (Appendix B), hook names and golden files (V8), the neutral shortage ids in the GDD (V4, Q1), ASSUMED thresholds (Q5), and the Phase 0 checks on Unity's NUnit and font APIs (Q17-Q18).
