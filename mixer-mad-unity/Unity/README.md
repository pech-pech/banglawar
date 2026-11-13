# Mixer Mad 3D: Unity 6 project (snowy pass slice)

First playable slice of the Mixer Mad 3D remake: the cement mixer truck driving side-on through a snowy pass,
URP Forward+, Mac app. Written in the cloud, NOT yet opened in Unity. Expect a first-compile pass (see "First compile: check these").

## What is in it
| Area | Where | What it does |
|---|---|---|
| Sim library | `Assets/MixerMad/Sim/` | Copy of `mm-unity/Sim/Core/*.cs`, asmdef `noEngineReferences: true`. Data JSON in `Resources/MixerMadSim/`. |
| Sim bridge | `Runtime/Core/MixerSimBackend.cs` | The only file that knows the sim API. Everything else uses `ISimBackend`. `DemoSimBackend` is a stand-in if the data is missing. |
| Sim clock | `Runtime/Core/SimDriver.cs`, `FixedStepClock.cs` | Own 120 Hz accumulator (never FixedUpdate / Time.timeScale), prev + curr snapshots, interpolated `Render` snapshot, event dispatch. |
| Slow-mo | `Runtime/Core/SlowMo.cs` | 0.5x big air (<= 1.2 s, cooldown 6 s), 0.3x crash (<= 1.0 s, ease 0.4 s, cooldown 4 s), cap 12% of a run, off in finishes, first 3 s, Calm motion, bots. Scales time fed to the accumulator, never the step. |
| Truck | `Runtime/View/TruckView.cs`, `SquashStretch.cs`, `PlaceholderTruckFactory.cs` | Maps the snapshot to the rig: chassis, wheel spin from travel, visual suspension, drum rpm, chute, lean, headlights. Squash is visual only. |
| Driver | `Runtime/View/DriverView.cs` | Emotion state machine (idle, gas grin, air woo, scared, crash daze, win cheer, fail facepalm), priority + 0.6 s hold + 0.12 s blend. Animator and blend-shape hooks. |
| Road | `Runtime/Level/RoadBuilder.cs`, `SnowyPassDecor.cs` | 3D road mesh from the physics line (snow shoulders, rock wall, back hill), ridges, pines, fences, cabin. No colliders: collision stays in the sim. |
| Camera | `Runtime/CameraRig/CameraRig.cs` | Cinemachine 3: FOV 30, 17 m view height, zoom band 14-21 m, look-ahead 20%, vertical dead zone 1.5 m, jump/crash cams, finish swoop with depth of field, garage orbit, impulses. |
| World | `Runtime/World/Weather.cs`, `DayNight.cs` | Snowfall (near, far, mist), fog, icy wet surfaces via global shader values; dawn/day/dusk/night, 12 min cycle. |
| Quality | `Runtime/Quality/QualityPresets.cs`, `PlanarReflection.cs`, `PerfOverlay.cs` | Low/Medium/High/Ultra, render scale 0.5/0.67/0.8/1.0, per-feature toggles, High = 60 fps default. F1 overlay, F2 CSV, `-mmBenchmark` headless run. |
| Input | `Runtime/Input/InputReader.cs` | New Input System: touch (gas/brake columns ~22% of width, multi-touch), keyboard, mouse, gamepad triggers. |
| UI | `Runtime/UI/` | UGUI HUD stub (pause, load meter, stars, pedals, toast, finish panel), garage stub (orbit, skins, quality, Calm motion), safe area. |
| Shaders | `Shaders/` | `ToyPlastic` (clear coat + light rim + navy inverted-hull outline pass), `SnowIce` (snow, ice, wetness, sparkle, planar mirror), `SkyGradient`, `SoftParticle`. HLSL, SRP Batcher compatible. |
| Editor | `Editor/` | `MixerMad > Build Snowy Pass Scene` (one click), `Build macOS App`, FBX post-processor. |
| Tests | `Tests/EditMode/` | "Graphics cannot change gameplay": same sim result at any slow-mo / frame pacing. |

## Open it
1. Unity Hub > Add project from disk > this `Unity/` folder. Pick Unity 6 (6000.6.x). `ProjectSettings/ProjectVersion.txt` is a guess; Hub lets you pick the installed editor.
2. If the Package Manager reports an unresolved version in `Packages/manifest.json`, remove the version and use Window > Package Manager > "Add package by name": `com.unity.cinemachine` (3.x), `com.unity.inputsystem`, `com.unity.render-pipelines.universal`, `com.unity.splines`, `com.unity.probuilder`. Versions in the manifest are best guesses.
3. Wait for the first import (shaders compile).
4. Menu `MixerMad > Build Snowy Pass Scene`. It applies project settings (Linear, Input System, Metal, Forward+ URP asset), creates the material assets, assembles the scene and adds it to Build Settings.
   If it says the Active Input Handling changed: restart the editor once, run the menu again.
5. Open `Assets/MixerMad/Scenes/SnowyPass.unity` and press Play. A blank scene with an empty GameObject carrying `SliceBootstrap` also works (it assembles at runtime).

Controls: D / Right / W = gas, A / Left / S / Space = brake, touch = bottom 55% of the left (brake) and right (gas) 22% columns, Esc pause, R restart, G garage, C Calm motion,
1-4 quality, T skip time of day, F3 cycle weather, F1 perf overlay + feature toggles, F2 CSV log.

## Build a Mac app
Menu `MixerMad > Build macOS App`, or from a terminal:
```
/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity -batchmode -quit \
  -projectPath "<path>/Unity" -executeMethod MixerMad.Editor.BuildScript.BuildMac \
  -logFile build.log [-mmOut Builds/macOS/MixerMad.app] [-mmDev] [-mmRebuildScene]
```
Output: `Builds/macOS/MixerMad.app` and `Builds/build-report.json` (size, total time, per-step timings, warnings, errors; exit code 0 ok, 2 build failed, 3 setup failed).
Do not pass `-nographics` (shader compile for Metal needs the GPU path).

Measure: run the built app with `-mmBenchmark 40` (40 s per preset, Low to Ultra, uncapped frame rate, slow-mo on). It writes `benchmark-summary.csv` into the app's persistent data folder
(`~/Library/Application Support/PGS/Mixer Mad 3D/`) with avg ms, fps, 1% low, p99, GPU and CPU ms, sim ms per step. In the app, F1 shows the same live and toggles each feature so one build answers "what costs what".

## Folder rules
- `Assets/MixerMad/Sim/` is a straight copy of the sim library. Never edit it here; edit in `mm-unity/Sim/` and re-copy (Core/*.cs flat, JSON into `Resources/MixerMadSim/`).
- Nothing in `Runtime/View|CameraRig|World|UI|Quality` may call `World.Step`, write to a snapshot, or read `Time.timeScale`. Only `SimDriver` steps the sim. Only `MixerSimBackend` references `MixerMad.Sim`.
- No Rigidbody or collider on any rig or road mesh. Collision is the physics line only.
- Materials are shared assets in `Resources/MixerMad/` (never instance them, never `MaterialPropertyBlock`: that breaks the SRP Batcher). Skins are material swaps.
- Visual randomness (blink timers) may use `UnityEngine.Random`; the sim never does.
- Nothing networked, no ads, no IAP, no analytics (kids' game). Settings are local JSON in `persistentDataPath`.
- Generated art stays out of `Art/` until reviewed. FBX go to `Art/Models/`, textures to `Art/Textures/`.

## Blender art drop-in
Put `Truck_Mixer.fbx` in `Assets/MixerMad/Art/Models/`, run `MixerMad > Build Snowy Pass Scene`: the FBX replaces the primitive truck. `ModelPostprocessor` bakes smoothed normals for the outline.

Export: +X forward, +Y up, 1 unit = 1 m, scale 1, apply transforms, origin (root pivot) at the chassis bottom centre between the axles. Wheel radius 0.5 m exactly (physics value). Length about 4.6 m.

| Node name | Pivot | Moves how |
|---|---|---|
| `Truck_Mixer` (root) | chassis bottom centre | placed by `TruckView` from the sim (position and Z rotation). Do not animate. |
| `Visual` | root origin | squash and stretch scale (wheels included) |
| `Body` | root origin | small lean from acceleration |
| `Drum` (inside any tilt parent) | drum axis centre | spins on local X |
| `Chute` | hinge at the drum mouth | rest pose = closed; code rotates it on Z toward 54 deg open |
| `Driver_Seat` | seat | empty; the driver prefab (rig below) is its child |
| `Susp_F_n`, `Susp_R_n` | wheel centre | slides on Y (visual suspension) and is placed at the sim wheel position on first frame. F = front axle, R = rear axle, n = 0 near side, 1 far side. |
| `Wheel_F_n`, `Wheel_R_n` (child of the `Susp_` node) | wheel centre | spins on Z |
| `Headlight_L`, `Headlight_R` (Light or empty) | lamp | switched on at night |

Driver (child of `Driver_Seat`, node names optional, all driven if present): `Head, Hat, Eye_L, Eye_R, Pupil_L, Pupil_R, Brow_L, Brow_R, Mouth, Arm_L, Arm_R, Sweat, Stars, Torso`.
Optional Animator parameters: int `Emotion` (0 idle, 1 gas grin, 2 air woo, 3 scared, 4 crash daze, 5 win cheer, 6 fail facepalm), trigger `Blink`.
Optional blend shapes on a `SkinnedMeshRenderer`: `mouth_smile, mouth_open, mouth_O, mouth_frown, brow_up, brow_worry, eye_wide, eye_squint`.
Materials: assign the shared `Toy_*` materials (`ToyPlastic` shader); the 4 mixer skins are `Toy_Yellow`, `Skin_Sky`, `Skin_Lime`, `Skin_Pink`.

## First compile: check these (never opened in Unity yet)
1. Cinemachine 3 API in `CameraRig.cs`: `cam.Priority.Enabled/Value` (struct field), `CinemachinePositionComposer` (`CameraDistance`, `Damping`, `Composition.ScreenPosition`, `Composition.DeadZone.Enabled/Size`, `Lookahead.Enabled`), `CinemachineBrain.UpdateMethods`, `CinemachineBlendDefinition.Styles`, `PreviousStateIsValid`.
2. URP runtime asset setters in `QualityPresets.Apply`: `renderScale, supportsHDR, msaaSampleCount, shadowCascadeCount, mainLightShadowmapResolution, supportsSoftShadows, shadowDistance`; editor side in `ProjectSetup`: `UniversalRendererData.renderingMode = ForwardPlus`, `UniversalRenderPipelineAsset.Create`, `supportsCameraDepthTexture`.
3. Shader: the extra outline pass tagged `SRPDefaultUnlit` must be drawn by the Forward+ opaque pass in Render Graph; if not, add a Render Objects feature for that tag. Forward+ keyword is declared as both `_FORWARD_PLUS` and `_CLUSTER_LIGHT_LOOP`. `GlossyEnvironmentReflection` 3-argument overload. `UniversalFragmentPBR` field names (`InputData.positionCS`).
4. Volume overrides in `QualityPresets` (`Bloom`, `Tonemapping`, `Vignette`, `ColorAdjustments`, `DepthOfField` parameter names) and `FrameTimingManager` in `PerfOverlay`.
5. `PlanarReflection`: second camera + `GL.invertCulling` in `beginCameraRendering`; the mirrored view clips below-plane geometry in the shaders (`_MM_ReflClip`) instead of an oblique projection.
6. Sim bridge: `MixerSimBackend` uses `World.Create`, `Step(InputFrame)`, `Events`, `TruckPose()`, `Points[4]/[5]`, `AirTime`, `State`, `Load`, `Level.X/Y/flagX/zones`. Re-check after the sim agent changes anything.
7. The Input System UI module (`InputSystemUIInputModule.AssignDefaultActions`) and `Touchscreen.touches`.

## First Mac run (P2, 2026-11-02): what changed
Opened with editor 6000.6.3f1 on an Apple Silicon Mac. It compiles clean (no errors, no warnings), builds `Builds/macOS/MixerMad.app` (80 MB) and runs the benchmark and the stills.
- Packages are pinned to what 6000.6.3f1 ships: URP 17.6.0, Input System 1.20.0, ProBuilder 6.1.2, Splines 2.9.1, Test Framework 1.8.0, uGUI 2.6.0. Cinemachine is 6.6.0, the editor-bundled successor of the Cinemachine 3 line (same `Unity.Cinemachine` API).
- The scene holds only `SliceBootstrap` (with the Blender truck in `truckPrefab`); the slice is assembled at run time. Several components keep their wiring in non-serialized fields, so a scene assembled in the editor and saved came back broken in the player. The default UI input actions are also created at run time (`UiDefaultActions`): assigning them in the editor saved a run-time InputActionAsset into the scene, which made the player report `level0` as corrupted.
- URP 17.6: `supportsSoftShadows` has an internal setter, so soft vs hard is chosen per light (`QualityPresets.SoftShadowsOn`). Forward+ keyword is `_CLUSTER_LIGHT_LOOP` only.
- `GetComponent<T>() ?? AddComponent<T>()` does not work on Unity objects (fake null); replaced with `TryGetComponent`.
- Blender truck: `Art/blender/mixer_truck.py` now also writes `Truck_Mixer.fbx` with the node names below (no armature, LOD0, triangulated). `ModelPostprocessor` resets every node to rotation 0 and moves Blender's axis change into the mesh data (only `Drum_Tilt`/`Drum` keep the 14.3 deg tilt), and `FbxTruckAdapter` swaps the `MM_*` materials for the shared `Toy_*` ones (glass becomes `Glass_Clear`, URP Lit transparent, so the driver shows), adds the headlight lights and seats the placeholder driver. `MixerMad > Check Truck FBX` (`MixerMad.Editor.FbxTruckCheck.Run`) checks the import contract.
- The sim's chassis origin is not the art origin (the vehicle data draws the sprite with `oy` = -0.823 m). `TruckView` now moves `Body` by the same amount the hubs move when they snap to the sim wheels, so body and wheels keep the modelled relation.
- `build-report.json` is valid JSON again (a `{2:F1}}}` format string printed `F1`).
- Review stills: run the app with `-mmStills <folder>` (optional `-mmStillsQuality 0..3`). It drives with `StillsBot` and saves `01_start`, `02_mid_drive_snow`, `03_jump`, `04_finish` as PNG, then quits. `MixerMad.Editor.StillsBotSearch.Run` drives the real sim headlessly with a grid of bot settings and lists the ones that finish.

## Placeholder vs final
Placeholder: all truck and driver geometry (primitives), pedal / button art (generated rounded rects instead of the glossy 9-slice kits), garage and HUD layout, pines / cabin / ridges, snow flake sprite (procedural), skies. Level shape = the v7 level index 2 (snow weather) from the sim data.
Not in the slice: audio, finish toys / reward animations, results scene, other trucks and biomes, VFX Graph (Ultra particles use Shuriken at 30,000), SSAO (flag exists, no renderer feature yet), tire-track decals, light shafts and soft-particle depth fade, level 2-8 content.
