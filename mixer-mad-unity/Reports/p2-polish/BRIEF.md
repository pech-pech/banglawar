# P2 polish pass: shared brief for the workstream agents (2026-11-02)

Game: Mixer Mad 3D, a kids' side-on cement-mixer truck game (Unity 6, editor 6000.6.3f1, URP 17.6 Forward+, Cinemachine 6.6, Input System 1.20). Mac app slice: one snowy level. Goal of this pass: turn the correct-but-plain prototype into a polished "glossy toy world" showcase. M's standing rule: never cut polish or testing.

## Read first
- `mixer-mad-unity/Reports/p2-mac/GAMEUP-REVIEW.md`: sections 2-6. Section 6 is the ranked fix list; section 5 lists the defects D1-D10, each of which needs a test.
- `mixer-mad-unity/Reports/LESSONS.md`: L-MM-28 to L-MM-35 are acceptance rules for this pass.
- `mixer-mad-unity/Unity/README.md`: the "First Mac run" section explains how the slice is put together.
- The current look: `mixer-mad-unity/Reports/p2-mac/0*.png`.

## Hard rules
- NEVER edit anything under `Assets/MixerMad/Sim/` or `Resources/MixerMadSim/`. That is the physics port, held bit-exact against the HTML game.
- No new packages, no installs, no network calls (kids' game; analytics is already off). Built-in URP features and Unity modules that are already referenced are fine.
- Rendering must never change gameplay: views read `SimDriver.Render`/`Curr` and nothing else.
- Teleports (crash respawn, R restart) must be clean cuts. Subscribe to `SimDriver.Instance.Teleported`, and reset any trail, particle, decal or spring there. Never draw a streak from the crash spot to the respawn spot. See `Assets/MixerMad/Tests/EditMode/RespawnTests.cs` and `CrashRepro`.
- Materials are shared assets (`MMMaterials`). No per-renderer instancing and no MaterialPropertyBlock (the SRP Batcher must keep working).
- Quality presets: Low/Medium/High/Ultra. High is the 60 fps default and must still hold on a mid tablet later. Put heavy things behind preset fields that code actually reads (L-MM-32), and make each effect switchable through `FeatureToggles` (see `PerfOverlay.cs`) so the benchmark can measure its cost.
- Calm motion (`MMSettings.CalmMotion`) must turn off shake, swoops, slow-mo and big motion.
- Keep files small and focused. Comments in plain English.

## Your worktree and how to run things
You work ONLY in your own git worktree, given in your task: `/Users/mmr/cl-Game/mm-<name>`, on branch `polish/<name>`. The Unity project is `<worktree>/mixer-mad-unity/Unity`; its Library is already imported.
- Editor binary: `U=/Applications/Unity/Hub/Editor/6000.6.3f1/Unity.app/Contents/MacOS/Unity`. Never open two editors on the same project. Only use your own worktree's project path.
- Compile check: `$U -batchmode -quit -projectPath "$P" -logFile /tmp/<name>-compile.log`, then `grep "error CS"` the log.
- Edit-mode tests: `$U -batchmode -projectPath "$P" -runTests -testPlatform EditMode -testResults /tmp/<name>-tests.xml -logFile /tmp/<name>-tests.log`. All tests must pass. Add your own tests in `Assets/MixerMad/Tests/EditMode/` (one file per workstream, e.g. `LightingTests.cs`).
- Build the Mac app: `$U -batchmode -quit -projectPath "$P" -executeMethod MixerMad.Editor.BuildScript.BuildMac -logFile /tmp/<name>-build.log`. The output goes to `$P/Builds/macOS/MixerMad.app`.
- If you change the scene builder or materials, run `-executeMethod MixerMad.Editor.SceneBuilder.BuildMenu` first.
- Stills of the running app:
  `"$P/Builds/macOS/MixerMad.app/Contents/MacOS/Mixer Mad 3D" -mmStills <dir> -mmStillsQuality 2 -screen-fullscreen 0 -screen-width 1920 -screen-height 1200 -logFile /tmp/<name>-stills.log`.
  This writes 01_start, 02_mid_drive_snow, 03_jump and 04_finish as PNG files, then quits. Look at them yourself with the Read tool, and compare against `Reports/p2-mac`.
  Fold aspect: `-screen-width 1812 -screen-height 2176` is portrait-ish; use landscape `2176x1812` for gameplay.
- Crash repro: `-mmCrashRepro <dir> -mmCalm 0`, then run `python3 mixer-mad-unity/tools/crash_analyze.py <dir>`. Respawns must stay clean.
- Each app run takes up to 4 min. Run apps one at a time, and never leave an app running.

## Delivery
- Commit on your branch, with small conventional commits. End each commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do NOT push and do NOT merge; the main session merges.
- Edit only the files your task says you own. If you must touch a shared file (for example a wiring line in `Runtime/Core/SliceAssembler.cs` or `MMMaterials.cs`), keep the change to a few added lines and list it in your report.
- Finish with a short report:
  - what you changed per fix
  - the before and after numbers you measured
  - the tests you added
  - your stills paths
  - shared-file edits
  - anything left open
