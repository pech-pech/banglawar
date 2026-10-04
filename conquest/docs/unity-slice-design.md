# Unity map slice: design (presentation layer, camera, input, UI, tests)

Status: design for review, 2026-10-04. Not committed. Inputs read as data: GDD 6, 7, 14, 17; `13-unity-architecture-plan.md` (UA); `bd1971/14-visual-pipeline-spec.md`, `18-world-view-scores.md`, `21-unit-banner-plan.md`; `conquest/tools/assets/themes/bd1971/catalogue.json` (layers, 256x128 tiles); `Conquest.Core/Contracts` (read 2026-10-04, still moving).
Tags: **BUILT** = exists in `conquest/dotnet/Conquest.Presentation` with tests. **UNVERIFIED** = Unity behaviour not confirmed in 6000.6 today. **ASSUMED** = tunable. **OPEN** = see section 13.

Slice goal: one scenario map on screen, banners that can be hovered, selected, sent along a previewed path, a turn that ends and replays its events as animation, all driven by the engine-free core. No rules in Unity.

## 1. Layers and assemblies

```
Conquest.Core (rules, state, Command, GameEvent)   Conquest.Assets (manifest, key fallback)   Conquest.Content (data)
        ^                         ^
        |   Conquest.Presentation  [BUILT, dotnet + UPM, noEngineReferences]
        |   pure view logic: IsoProjection, SortKey, CameraModel, TilePicker, SelectionModel,
        |   BannerTransition, PathPreview, AnimationDirector + adapter interfaces
        |                         ^
Conquest.App (turn driver, save/load, replay; IFileStore)   <- Unity-free
        ^                         ^
   Conquest.Unity.Presentation (MonoBehaviours, UI Toolkit presenters, adapters)  root namespace Conquest.UnityView
   Conquest.Unity.Editor (menus, prefab validators)
   Tests: Conquest.Unity.Tests.EditMode, Conquest.Unity.Tests.PlayMode
```

| Assembly | References | Engine refs | Holds |
|---|---|---|---|
| `Conquest.Presentation` | `Conquest.Core` (IntMath only so far) | none (`noEngineReferences`) | everything that needs a test but no engine |
| `Conquest.Unity.Presentation` | Core, Assets, Presentation, App, Unity modules, Input System, UI Toolkit | yes | the only code that touches UnityEngine |

Rules: Presentation never references `Conquest.Unity.*`; nothing in Presentation reads a clock, a random number or a Unity type; integers only. Namespace of the engine side is `Conquest.UnityView` (not `Conquest.Presentation.*`) so the two never shadow each other. The UPM location is `Packages/com.conquest.engine/Runtime/Presentation/` with `Conquest.Presentation.asmdef` (the asset agent owns the package; add the folder and asmdef when integrating, mirror the csproj globs as UA 2.2 requires). The dotnet project is `netstandard2.1`, C# 9, nullable on; no records or init setters (no `IsExternalInit` in Unity 6.6).

## 2. Scenes and prefabs

**Boot.unity**: one `Bootstrap` object. Loads rules, theme and scenario JSON from StreamingAssets (UA 5), builds `GameSession` (App), the asset catalogue and the settings, then loads **Map.unity** additively. No gameplay objects.

**Map.unity** hierarchy (all runtime children are pooled, never created during a pan):
```
Map
  MapController                (MonoBehaviour: owns GameView, CueRunner, CameraRig, InputRouter)
  CameraRig / Main Camera      (orthographic, URP 2D Renderer, no Pixel Perfect Camera)
  World
    Ground      (sorting layer "Ground", fixed order)      river and shore decals
    Depth       (sorting layer "World", order = SortKey)   terrain tiles, props, structures, banners
    Fx          (sorting layer "Fx")                       dust, smoke, sparks
    Overlay     (sorting layer "Overlay", fixed)           hover diamond, path, markers, fog
  UIDocument                   (UI Toolkit HUD, sort order above world)
  EventSystem                  (Input System UI Input Module)
```
Prefabs (`Assets/Conquest/Prefabs/`): `TileView` (SpriteRenderer), `StructureView` (SpriteRenderer, footprint pivot), `BannerView` (below), `HoverDiamond`, `PathDot`, `PathTurnFlag`, `PathEndMark`, `ImpactFx`. Layer order and tiebreaks come from the manifest layer table (ground 0, terrain 10, prop 15, structure 20, unit 30, fx 40, overlay 50): ground, fx and overlay are their own Unity sorting layers with a fixed order; terrain, prop, structure and unit share the **World** layer so a unit can stand behind a tree or a hut.

**BannerView** (clay idle, hologram selected and status, one beam): root at the tile centre; children `Body_Clay` and `Body_Holo` (two SpriteRenderers cross-faded by alpha from `BannerTransition.BlendPermille`), `Beam` (thin vertical sprite, height = banner height), `Shadow`, `HoverRing`. Sprites come from manifest keys `u.<role>@f1.idle` / `.selected` / `.status` (`BannerVisualRules.ClipState`). A hologram scanline is a shader-graph nicety for later; v1 is the cross-fade.

## 3. The thin presentation layer

State flows one way: **Core state -> view**. Events only drive animation; the view always ends by reconciling to the state, so skipping animation can never leave it wrong.

```
input -> InputRouter -> IntentInterpreter -> PresentationCommand -> CoreCommandMapper -> Core Command
                                                                      CommandEngine.Apply(state, command)
                                                                              |  CommandResult{Ok, State, Events, Error}
GameView.Apply(before, after, events) <-------------------------------------+
   EventMapper (GameEvent -> PresentationEvent)  ->  AnimationDirector (cues)  ->  CueRunner (time, Unity)
   then Reconcile(after): every tile/structure/banner snapped to the state, pools trimmed
```

- **GameView** (Unity): `Apply(IGameStateView before, IGameStateView after, ImmArray<GameEvent> events)` and `Rebuild(IGameStateView state)` (load, scenario start, theme switch). Holds a `UnitViewRegistry` (plain C# class behind `IViewFactory`, testable without a scene) mapping unit id to `BannerView`. Fog: renders only what the local slot knows (`Visibility`, `OwnerSlot`, the knowledge view); events on unseen tiles are dropped by the mapper.
- **EventMapper** (plain C#, to be added in `Conquest.Presentation` when Contracts settles; it needs `Conquest.Core.Contracts`): merges consecutive `UnitMoved` of one unit into one path, strips `u.`/`bld.` from `RoleIds.Of(...)` to get the manifest role, writes slot as `"f" + (slot+1)`, takes unit roles from the **before** state (a destroyed unit is gone from the after state).
- **CueRunner** (Unity): runs `AnimationCue`s with `Time.unscaledDeltaTime`; blocking cues serialize, non-blocking run beside them; a "skip animations" setting and the fast-forward key finish all cues at once, then Reconcile. Presentation time never feeds the core.
- **Command layer**: `InputRouter` (Input System callbacks to plain `InputIntent` structs), `IntentInterpreter` (selection + pick + intent -> selection change or `PresentationCommand`; pure, goes into Presentation next), `CoreCommandMapper` (below), `ICommandSink` (App: applies, records for replay, returns `CommandOutcome`).

### Mapping to the core contract (Contracts read 2026-10-04)

| Presentation | Core |
|---|---|
| `GridPos` | `TileCoord` (same ints; core x grows east, y south; on screen +x runs SE and +y SW, so map north points NE; **OPEN** O-1) |
| `PresentationCommand` Move | `MoveCommand(Slot, UnitId, Target)` per selected unit, ascending id |
| Attack | `AttackCommand(Slot, ImmArray<int> UnitIds, Target)` |
| Build / EndTurn | `BuildCommand(Slot, BaseId, Role, At)` / `EndTurnCommand(Slot)` |
| `CommandOutcome(Accepted, ErrorCode)` | `CommandResult.Ok` / `Error` (`err.*` codes; the theme turns them into status text) |
| `IMovementQuery.PlanMove` -> `MovePlan` | `Pathfinder.Find` (`PathResult.Steps`, cost) + `Pathfinder.StepCost` per step + `UnitView.MovesLeft` + the role's moves per turn from the rules table |
| `PresentationEventKind.UnitMoved` | `UnitMoved(Unit, From, To, Slot)` |
| UnitDestroyed | `UnitDestroyed(Unit, Owner)` |
| BuildingStarted | `BuildingOrdered(Base, Role, Level, Slot)` |
| BuildingCompleted | no event yet: derived when `BuildingView.ReadyTurn == Turn` or from `BaseFounded` (**OPEN** O-2) |
| UnitSpawned | no event yet: derived by diffing `Units` between states (**OPEN** O-2) |
| UnitAttacked | no event: synthesised from the `AttackCommand` before the battle events (**OPEN** O-2) |
| SeasonChanged | `SeasonStarted(Season)` |
| TurnStarted | `TurnEnded(Turn)` -> `TurnStarted(Turn + 1)` |

## 4. Camera: 2:1 isometric (BUILT: `IsoProjection`, `CameraModel`)

- **Units.** Projection tile 256 x 128 px (manifest `projection iso_2_1`). Sprites import at **PPU 128**, so a tile is 2.0 x 1.0 world units. Unity world = (`wx / 128`, `-wy / 128`); the pure code keeps y down.
- **Projection.** `GridToWorld(x, y) = ((x - y) * 128, (x + y) * 64)`, the tile's centre. `WorldToGrid` is the exact integer inverse (`FloorDiv`, no floats); a tile centre round-trips for every tile of a 256 x 256 map, and every pixel strictly inside a diamond maps to that tile (tested). A point on a shared edge goes to the larger x or y. Walking units use `GridToWorld(from, to, progressPermille)`.
- **Zoom.** Integer permille 250..2000 (GDD 0.25 to 2.0), stops 250, 350, 500, 700, 1000, 1400, 2000 for `+`/`-`; wheel and pinch are continuous. `orthographicSize = viewportHeightPx * 1000 / (2 * 128 * zoomPermille)`. Zoom keeps the world point under the pointer fixed.
- **Pan.** Drag, arrows/WASD, edge-pan optional. Clamped to the map diamond's bounding box plus a 256 px margin; when the map is smaller than the view the camera stays centred. Camera centre is an integer world pixel, so at zoom 1000, 2000, 500 and 250 the picture lands on whole screen pixels.
- **Pixel settings.** The art is smooth clay, not pixel art: **no Pixel Perfect Camera** (it would fight continuous zoom). Sprites: bilinear, mipmaps on the atlas, 4 px padding, no compression artifacts at tile edges (importer, UNVERIFIED defaults), `Sprite Mode: Multiple` from the atlas JSON, pivots from the manifest `anchor_px`. 2D Renderer transparency sort stays Default: order comes from explicit integers.
- **Sort order.** `SortKey.ForDepthLayer(frontTile, tiebreak, bias) = (x + y) * 64 + tiebreak * 10 + bias` using the footprint's **front tile** (`FrontTile`, the 2x2 `bld.core` sorts at `(x+1, y+1)`), tiebreak from the manifest layer (prop 1, structure 2, unit 3), bias 0..9. Note on the brief's "sort by grid y": with this projection draw order is by `x + y` (equal to screen y), not by `y` alone; grid y alone would put a unit at (5,0) behind one at (0,1). The largest key for a 256 x 256 map is 32,699, inside Unity's 16-bit `sortingOrder`. A walking unit switches to the destination's key at half way (`ForMoving`). Same result as the manifest's `custom_axis_y` rule, but testable.
- **Culling.** `IsoProjection.VisibleTiles(camera.VisibleWorld(), w, h, extra)` gives the tile block to keep alive (extra = 3 for tall crowns). At zoom 0.25 on a 1280 x 720 view that is about 900 tiles; the 256 x 256 map is never fully instantiated. Pools only, no `Instantiate` while panning (UA 6.4).

## 5. Picking and banner interaction (BUILT: `TilePicker`, `SelectionModel`, `BannerTransition`, `PathPreview`)

- **Picking.** Each frame the view reports banner hit rectangles in screen pixels (`BannerRect`: unit, tile, rect, sort key). `TilePicker.Pick` returns the front-most banner under the pointer (highest key, then lowest id), else the tile under the pointer (`camera.ScreenToWorld` -> `WorldToGrid`, rejected outside the map) with the unit standing on it. Banners float above their tile, so they win over terrain.
- **Hover.** Pointer move -> `SelectionModel.WithHover(tile, unit)` -> `HoverDiamond` on the tile and a clay hover ring on the banner. Hover does not exist on touch.
- **Select.** Click a friendly banner: single. Shift-click: toggle in a group (max 12, ASSUMED). Click an opposing banner: **inspect** only (card shown, no orders, never joins a group). Click empty ground: clear. After every `Apply`, `Prune(exists)` drops dead units.
- **Hologram.** `BannerVisualRules.Resolve(selected, hovered, hasStatus)`: selected beats status beats hover beats clay. `BannerTransition` cross-fades clay and hologram in 180 ms, out in 120 ms with an integer smoothstep; reversing mid-fade continues from the current blend (no pop). The view owns one transition per banner and feeds it `Time.unscaledTime` in ms.
- **Move path preview.** With a friendly unit selected, hovering (mouse) or tapping (touch) a tile calls `IMovementQuery.PlanMove` -> `PathPreview.Build`: dots along the path, a flag on the last step of each turn (`IsTurnEnd`), solid style for steps in this turn (`TurnIndex 0`), faded after, an end mark, total cost in the status line. No path: red diamond plus the `err.unreachable` text. Groups preview the primary unit only.
- **Walk animation.** `MoveAlong` cue: the banner glides tile to tile over 320 ms per tile (ASSUMED), position from `GridToWorld(from, to, p)`, facing from `FacingMath.FromDelta` (8 facings; five rendered, SW/W/NW mirrored via `RenderDirection`), `walk` clip loops if the manifest has one else the idle clip plus a small vertical bob, sort key from `ForMoving`, the beam stretches with the banner. Arrival snaps to the state position.

## 6. UI Toolkit panels

One `UIDocument` (`Hud.uxml` + `Hud.uss`), PanelSettings scale 100 to 200 percent (GDD 16). Each panel is a plain C# presenter fed a small view-model, so EditMode tests query the `VisualElement` tree without a scene.

| Panel | Content | Source |
|---|---|---|
| ResourceBar (top) | six resource chips with amount and forecast delta; shape badge, never colour alone | active base `Stock`; forecast from the core's economy preview (O-4) |
| UnitCard (bottom left) | role name, level, strength, moves left, owner colour plus pattern; inspect mode for opposing units | `UnitView`, theme labels |
| EndTurnButton (bottom right) | "End turn" (E), disabled when the turn is already ended, count of pending orders | `EndTurnCommand` |
| EventLog (right, collapsible) | last 50 visible events as theme templates by `GameEvent.Id`; click centres the camera on the event | `Visibility`, `OwnerSlot` |
| SeasonIndicator (top centre) | season icon plus label plus turn; label key from theme `calendar.json season_labels` | `SeasonStarted`, `season.pre_wet/wet/dry` ids owned by the scenario |
| LanguageSwitch (menu) | English / Bangla toggle, saved in settings; rebuilds all labels, no restart | theme text, locale |

**Language and Bengali.** All text goes through the theme label provider (UA 8), not the Unity Localization package. Bangla needs the Advanced Text Generator (HarfBuzz) and a **dynamic** font asset built from `Assets/ThirdParty/NotoSansBengali/NotoSansBengali-VF.ttf` (SIL OFL, licence text beside it), referenced from USS `-unity-font-definition`; the same font is the Latin fallback if its Latin coverage is adequate (UNVERIFIED, check in the first EditMode font test). Conjunct shaping, vowel-sign ordering and line breaking are checked in the Phase-1 shaping test (UA 8.4). Pseudo-locale (+30 percent) layout test applies to every panel.

## 7. Input (Input System 1.20, one `.inputactions`, action maps `Map`, `UI`)

| Action | Mouse and keyboard | Touch |
|---|---|---|
| Point / Hover | pointer move | none |
| Select | left click (Shift = add or remove) | tap |
| Command (move, attack) | right click, or left click on empty ground with a unit selected | tap a tile to preview, tap the same tile again to confirm |
| Cancel / deselect | Esc, click empty ground | tap empty ground, back |
| Pan | middle or left-drag on empty ground (after 6 px), arrows, WASD | one-finger drag on empty ground (after 12 px) |
| Zoom | wheel, `+` / `-` (Shift = extremes) | pinch |
| Next unit / cycle | N, Tab, F1..F4 | button in the unit card |
| End turn | E | button |
| Quick save / load | Ctrl+S / Ctrl+O | menu |

Rebindable (`PerformInteractiveRebinding`, overrides saved as JSON in settings). Keyboard-only play works: arrow-key map cursor, Enter confirms the preview. Drag thresholds are pixel-based and measured in physical pixels at the current DPI. Touch uses one tap-twice rule so no accidental order is possible; mouse hover preview is skipped when the pointer is over UI.

## 8. Audio hooks

Cues carry stable sound ids: `sfx.unit.move`, `sfx.unit.spawn`, `sfx.unit.down`, `sfx.unit.attack`, `sfx.building.construct`, `sfx.building.built`, `sfx.turn.start`, `sfx.season.change`, plus UI ids `sfx.ui.click`, `sfx.ui.error`, `sfx.ui.end_turn` (constants in `AnimationDirector`). The Unity side implements `IAudioSink.Play(soundId, worldPos?)` over an engine-free `AudioResolver` (id -> clip with silence as the last fallback, UA 6.7). v1 ships **no audio files** (theme rule), so every call resolves to silence; the hooks and the mute setting are wired and tested. Sounds for events off screen or in fog are dropped by the mapper.

## 9. Save, load and replay

- **Save/load** through `Conquest.App.IGameSaveService`: `Save(GameState) -> string` and `Load(string) -> GameState` call the **core's serialiser** (OPEN O-3: Core has `CanonicalWriter` and `StateHasher` but no state serialiser yet). Saves only in the `orders` phase; autosave at turn start, 3 rotating slots, atomic write via `IFileStore` (UA 9). After a load the view calls `Rebuild(state)`: pools cleared, selection cleared, camera centred on the player's first base. Selection, camera and hover are **not** part of the save.
- **Replay** = scenario id + ruleset hash + seed + the list of accepted `Command`s per turn (UA 9, TP10 3.4). The command layer's `ICommandSink` records every accepted command. A `ReplayPlayer` feeds the same list through `CommandEngine.Apply` and the same `GameView.Apply`, at 1x, 4x or instant, and checks `StateHasher` per turn. The view never decides anything, so a replay and a live game animate identically.

## 10. Test plan

| Level | Where | What |
|---|---|---|
| Pure presentation | `dotnet test` (`Conquest.Tests/Presentation/`, **BUILT**, 102 tests, 99 percent of Presentation lines; gate 80 percent) | iso round trip for a 256 map and per-pixel diamond test, sort keys incl. 2x2 fort neighbours and 16-bit fit, camera clamp/zoom anchor, picking through the camera, selection rules, hologram blend, path turn splitting, animation cues per event with a fake catalogue |
| EditMode (Unity Test Framework) | `Conquest.Unity.Tests.EditMode` | `UnitViewRegistry` with a fake `IViewFactory` and fake state: `Apply` then `Reconcile` equals `Rebuild`; `EventMapper` table above (fixtures from a real core run); UI presenters via `VisualElement` queries (resource bar, unit card, end-turn state, log order, season label, language switch changes every label); Bengali font asset builds and shapes a conjunct sample; prefab validator (required components, sorting layers exist, every manifest key used by the scenario resolves); asmdef boundary test (Presentation has `noEngineReferences`, no assembly references `Conquest.Unity.*` except tests) |
| PlayMode smoke | `Conquest.Unity.Tests.PlayMode`, one test, 20 s budget | load Boot, scenario 1 reaches Map with no error in the log; camera inside bounds; simulate a click on a player banner (selected, hologram blend reaches 1000), hover a far tile (preview has steps), confirm (accepted), end the turn, wait until the cue queue is empty, assert `StateHasher` equals a headless `CommandEngine` run of the same commands, assert the banner sits on its state tile, quit. Replay the recorded commands and compare the hash. |
| Perf (later, UA 6.8) | `Bench.unity` | 256 map, 2000 banners, scripted zoom and pan: frame time, draw calls, GC; warns only on CI |

## 11. Built in this round

`conquest/dotnet/Conquest.Presentation/` (netstandard2.1, C# 9, nullable, no UnityEngine): `Grid/GridPos.cs` (`GridPos`, `PixelPoint`, `PixelRect`, `GridRange`), `Grid/Facing.cs`, `Iso/IsoProjection.cs`, `Iso/SortKey.cs`, `Camera/CameraModel.cs`, `Picking/TilePicker.cs`, `Selection/SelectionModel.cs`, `Selection/BannerVisual.cs`, `Path/PathPreview.cs`, `Animation/AnimationDirector.cs`, `Animation/AnimationCue.cs`, `Adapters/` (`IClipCatalog`, `PresentationEvent`, `IMovementQuery`, `ICommandSink`, `MovePlan`, `PresentationCommand`, `CommandOutcome`). Tests in `Conquest.Tests/Presentation/`. `Conquest.slnx` and `Conquest.Tests.csproj` got one added line each.

## 12. Order of work for the slice

1. Package folder, asmdefs, `Map.unity` skeleton, sorting layers, atlas import (asset agent's importer).
2. `GameView.Rebuild` with culled `TileView`s from the first scenario; `CameraRig` over `CameraModel`; pan/zoom.
3. `InputRouter` + `TilePicker` + hover; banners from the manifest; selection and hologram.
4. Path preview; `CoreCommandMapper`; move through `CommandEngine`; `CueRunner` with `MoveAlong`.
5. HUD panels and event log; end turn; season indicator; language switch.
6. Save/load, replay, the PlayMode smoke test.

## 13. Open questions

- **O-1 Map orientation.** Core x grows east, y south; the iso projection puts +x at screen south-east, so map north points to the upper right. Keep it (matches the pilot art) or rotate the grid? Decision needed before the scenario map is dressed.
- **O-2 Missing core events.** There is no event for recruit appearance, building completion, or an attack being fired; the mapper derives them from state diffs and the command. Preferable: core emits `ev.unit_spawned`, `ev.building_completed`, `ev.attack_resolved(attackers, target)`.
- **O-3 State serialiser.** Core has no `GameState` to JSON writer yet (only the canonical hash writer). Who writes it, and is it the canonical writer's pretty variant (UA 9)?
- **O-4 Forecast and moves per turn.** The resource bar forecast and `MovePointsPerTurn` need core functions (`economy.preview`, role moves per turn) exposed through `IGameStateView` or a rules query.
- **O-5 Clip states and directions.** The manifest keys carry no direction. Does `IClipCatalog.Find(..., renderDirection)` pick a strip row or an entry's `dir` field? Which states will exist for banners (`idle`, `selected`, `status`, `walk`)? Without `walk` the banner glides with a bob.
- **O-6 Bengali digits.** Western or Bengali numerals in the `bn` locale (theme decision), and does the variable font cover the Latin fallback?
- **O-7 Walk and move speed.** 320 ms per tile and the 12-unit group cap are ASSUMED; tune on the first playable.
- **O-8 Touch confirm.** Is tap-twice acceptable for orders on phones, or should a confirm button appear in the unit card?
