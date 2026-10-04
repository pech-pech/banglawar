# Asset pipeline (Blender pilot pictures -> Unity)

Takes the private PNGs of the Blender pilot, describes them in a theme-neutral **asset manifest**, packs them
into power-of-two **atlases** (max 4096) with a **sprite sheet JSON**, and imports them in Unity as sprites,
animation clips and one data asset the game queries by role id. Nothing here contains art; the art stays in
`art-src/` and in the git-ignored `conquest/unity/Assets/Art/Generated/`.

```
catalogue.json (theme)  --build_manifest.py-->  asset-manifest.json  --pack_atlas.py-->  atlas_*.png + sprite_sheet.json
                                                                                              |
                                  Unity: Conquest > Art > Import Sprite Sheet  <--------------+
                                  -> sprites (pivots), AnimationClips, ArtCatalog.asset
                                  game:  ArtCatalogAsset.TryGet(new AssetRequest("u","scout",state:"selected",slot:"f1"), out clip)
```

## Run it

Needs Blender 5.2 (its bundled Python has numpy and OpenImageIO; no PIL, no installs).

```sh
# everything: manifest, atlases, two-process determinism check (about 2 minutes)
conquest/tools/assets/run_pipeline.sh /path/to/art-src/bd1971-pilot/out            # palette-snapped copy (default)
conquest/tools/assets/run_pipeline.sh /path/to/art-src/bd1971-pilot/out graded     # graded copy instead

# single steps (PY = /Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13)
$PY build_manifest.py --catalogue themes/bd1971/catalogue.json --root pilot=<out> --out asset-manifest.json
$PY pack_atlas.py --manifest asset-manifest.json --root pilot=<out> --out-dir <dir> [--variant graded]
$PY check_determinism.py --manifest asset-manifest.json --root pilot=<out>
# the same scripts under Blender itself
Blender -b --factory-startup -noaudio --python-exit-code 3 -P pack_atlas.py -- --manifest ... --root ... --out-dir ...
```

Tests: `$PY -m unittest discover -s tests -v` here (22 tests, synthetic pictures) and
`dotnet test conquest/dotnet/Conquest.Tests` (the `Assets/` tests). `UPDATE_GOLDEN=1` rewrites
`conquest/dotnet/Conquest.Tests/golden/` from the Python side; the dotnet tests then check the C# side against it.

Unity: open the project, menu **Conquest > Art > Import Sprite Sheet**, or headless
`Unity -batchmode -nographics -quit -projectPath conquest/unity -executeMethod Conquest.Unity.Art.Editor.AssetManifestImporter.ImportFromCommandLine`.
Compile check without opening the editor: `conquest/tools/assets/unity_compile_check.sh`.

## What the manifest says (schema `asset-manifest/1`, see `schema/`)

One entry per picture family. Key grammar `<kind>.<role>[.L<level>][.v<variant>][.<state>][@<slot>]`:
`tile.meadow`, `bld.core`, `u.scout@f1`, `u.scout.selected@f1`, `u.scout.move_ne@f2`, `fx.core_smoke`.
Kinds: `tile bld u mk env fx`. Slots: `f1` player, `f2` opposing. Role ids come from the ruleset, never labels.

| Field | Meaning |
|---|---|
| `source` | root name + path of the palette-snapped PNG (and the graded copy if there is one), SHA-256, `frames`, `frame_size`, `layout` (`single` or `strip_h`, frames side by side) |
| `anchor_px` | ground point of the cell (the footprint centre), pixels from the **top-left** of the source frame |
| `footprint` | cells covered, `[2,2]` for the HQ piece |
| `fps`, `loop`, `events` | animation; events are `{frame, name}` |
| `layer`, `sort` | draw layer and sort rule for 2:1 isometric (below) |
| `atlas_group` | which atlases it goes into: `tiles buildings units props fx` |
| `review.status` | `prototype` for everything today |

**Layers and sorting.** Layers `terrain`, `prop`, `structure`, `unit` are *depth* layers: they share one sort by
the front-most cell of the footprint (`DepthKey = x + y` of that cell; larger is in front), and at equal depth the
layer `tiebreak` decides (terrain 0 < prop 1 < structure 2 < unit 3), then `sort.bias`. So a unit behind a tall
tree is hidden by it. `ground`, `fx`, `overlay` are *fixed* layers drawn below/above everything by `order`.
`sort.rule` is `custom_axis_y` (Unity: Transparency Sort Mode = Custom Axis (0,1,0); the sort point is the pivot
plus `sort.point_offset_px`, which is the front corner of the footprint, `-(fw+fh)*tile_h/4` px) or `fixed_layer`.
Projection: 2:1, tile 256 x 128 px, pixels-per-unit 256.

**Fallback.** `AssetCatalog.Resolve(request)` tries the exact key, then every subset of the requested optional
parts dropped, cheapest first (variant 1, state 2, level 4, slot 8): the wanted side is kept before the wanted
state, the state before the level. `null` means "draw your placeholder". (Spec 14 section 9 left the slot's place
open, decision D-3; this is the resolution.)

## What the packer does

* Default pixels: palette-snapped copy; `--variant graded` uses the graded copy (an entry without one is an error).
* Frames of one entry are cropped to the union of their opaque pixels; the anchor moves with the crop:
  `pivot_px = (anchor.x - x0, y1 - anchor.y)` from the **bottom-left** of the rectangle (may lie outside it; a
  banner floats above its anchor). `source_anchor_px` and `trim_offset` are kept so nothing is lost.
* Shelf packer, sorted inputs, padding 2 px (also to the page edge), no rotation, per atlas group, tries page
  widths 256..4096 and keeps the fewest pages then the smallest area. Pages are power-of-two, at most 4096.
* Deterministic: no timestamps or paths in outputs, own PNG writer (`png_io.py`, zlib level 9), sorted JSON.
  Measured: identical SHA-256 for every file over repeated runs and separate processes (`check_determinism.py`).
* Verifies each source file against the manifest hash (stale manifest = error).

## Content audit hook

`content_audit.py` runs in the manifest build (names: keys, roles, states, tags, event names and file stems are
split on non-letters and a token **starting with** `face person people flag cross crescent text gun blade weapon
insignia letter limb sword rifle cannon emblem` is a finding) and in the packer (pixels: no opaque colour within
delta-E 30 of the render key green). Findings make the exit code 1 and nothing is written. Plug in more checks
with `--extra-audit file.py` (a file defining `audit_manifest(manifest) -> list[str]`; for example a wrapper that
calls the pilot's `blender/pilot_audit.py` under Blender). This does **not** judge the pictures' content; the
pilot audit plus the owner's review do that.

## Swap an asset

1. Replace the PNG in the pilot output (same file name, same size/anchor), or point the catalogue item at a new
   file (`themes/<theme>/catalogue.json`, group `dir`/`file`).
2. Re-run `run_pipeline.sh` (the manifest hash check forces a manifest rebuild, which the script does).
3. In Unity re-run **Import Sprite Sheet**. Sprite ids are derived from the sprite name (`key#frame`), so prefabs
   and scenes keep their references; AnimationClips and the catalog are updated in place.
A new size or anchor needs no code change; the manifest carries it.

## A new theme

The pipeline knows role ids, never labels. A theme is data:
1. `themes/<id>/catalogue.json` (schema `asset-catalogue/1`): `tile_px`, `layers`, `slots`, `groups` (explicit
   `items`, or a `matrix` of roles x sides x forms with `entry`/`file` templates) and optional `anim`
   (`anim_spec.json` from the animation agent). Each item gives a role id, footprint and `anchor_from_bottom_left`
   (Blender convention, converted to top-left in the manifest). Pilot piece names appear only here.
2. Pictures from any source in the same layout (single image or horizontal strip, transparent background).
3. `run_pipeline.sh` with `CATALOGUE=themes/<id>/catalogue.json`. The C# side (`Conquest.Assets`) and the importer
   are untouched; a missing role falls back along the chain above.
The `bd1971` catalogue maps pilot pieces to roles: `hq -> bld.core`, `hospital -> bld.scout_post`,
`shelter -> bld.habitat`, `granary -> bld.food`, `landing -> bld.port`, banners -> `u.<role>@f1/f2` (P = f1,
A = f2). That mapping follows the theme pack and plan 19; check it against the ruleset when it exists.

## Animations

`out/anim/anim_spec.json` (written by the animation agent) is optional input. Each clip becomes an entry
`u.<role>.<clip>@<slot>`, `bld.<role>.<clip>` or `env.<name>` with the spec's frames, fps, loop, events, anchor.
Clips whose strip file is not on disk yet are skipped and listed in `manifest-report.json` under `notes`, so the
pipeline can be re-run while the agent is still writing. Re-run when the spec changes.

## C# side

* `conquest/unity/Packages/com.conquest.engine/Runtime/Assets/` (asmdef `Conquest.Assets`, `noEngineReferences`):
  `MiniJson` (strict reader), `SheetParser`/`SpriteSheet` model (immutable), `AssetRequest`/`AssetKey` (key and
  fallback chain, twin of `asset_keys.py`), `AssetCatalog` (lookup), `AnimationClock` (frame for a time you pass in),
  `IsoProjection` (tile centres, depth key, ordering), `SpriteGeometry` (rect flip, names). Compiled for
  `dotnet test` by `conquest/dotnet/Conquest.Assets/Conquest.Assets.csproj` (netstandard2.1, C# 9).
* `conquest/unity/Assets/Conquest/Art/` (`Conquest.Unity.Art`): `ArtCatalogAsset` ScriptableObject +
  `ArtClip` (sprite for a frame or time, optional AnimationClip). No AnimatorController.
* `conquest/unity/Assets/Editor/AssetManifestImporter.cs`: slices pages through `ISpriteEditorDataProvider`
  with the manifest pivots, Point filter, no compression, no mipmaps, 4096 max size, PPU = tile width (256),
  builds `Clips/*.anim` (SpriteRenderer.sprite curve, loop flag) and `ArtCatalog.asset`.

## Verified and not verified (2026-10-04)

Verified on this machine: manifest and packer on the real pilot output (334 entries, 1610 frames, 9 pages;
snapped and graded; run under Blender's CLI and the bundled interpreter); determinism over separate processes;
Python tests; dotnet tests of the `Assets/` folder (including the real generated sheet); Unity 6000.6.3f1 batch
mode compiles the project with no C# errors and `ImportFromCommandLine` imported all 334 entries / 1610 sprites.
Not verified: that the sprites look right in the Scene view (pivots and sort in a real isometric scene), play mode,
the Windows/Web players, memory (5 unit pages of 4096 x 4096 RGBA are about 64 MB each uncompressed, so about
350 MB of textures: fine for a prototype, compress or shrink before shipping), and the mapping of pilot pieces to
ruleset role ids. Frames of a clip share one rectangle (union crop), so clips do not jitter, at the cost of some transparent area.

## Water shore tiles and the second building batch (2026-10-04)

* `themes/bd1971/catalogue.json` now also maps `missing/tiles` (47 water pieces: `tile.water` plus `tile.water_edge_*`,
  `water_outer_*`, `water_inner_*`, `water_channel_*`, `water_mNNN`) and `missing/buildings` (`bld.basic_extractor`,
  `hard_extractor`, `coin_extractor`, `converter`, `attractor`, `academy`, `bld.garrison` = camp, `bld.garrison@f2` =
  strongpoint). Real pipeline run: 389 entries, 1665 sprites, 9 pages, deterministic.
* The tile for a water cell is chosen from its 8 neighbours by `Conquest.Presentation.ShoreAutotile` (twin of the pilot's
  `missing/mwater.py` `code_of`/`name_of`). `shore_golden.py` (run with Blender's python) regenerates
  `dotnet/Conquest.Tests/golden/shore-autotile.golden.json` from that Python; the C# test compares all 256 raw masks.
* `themes/bd1971/palette_additions.json` records the 12 water/bank and 3 sand colours added to the pilot palette.
