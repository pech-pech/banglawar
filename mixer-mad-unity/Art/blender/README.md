# Mixer Mad 3D: Blender scripts (agent-made, 0 credits)

Headless `bpy` scripts for Blender 4.x. Nothing here was run inside Blender yet (Blender was not available when written). Every script has a **dry-run** that runs without Blender and checks the geometry in pure Python.

| Script | Makes |
|---|---|
| `mixer_truck.py` | cement mixer: LOD0/LOD1, 13-bone rig, sockets, FBX + .blend + meta/QA json |
| `driver.py` | cartoon builder: 22 bones, 6 face blend shapes (+ idle basis), LOD0/LOD1 |
| `snow_kit.py` | snow banks x3, pines x3 (LOD0-2), rocks x3, 5 mountain layers, guard rails x2, cabin, signs x3, snow particle atlas |
| `render_check.py` | side-on still: 3D truck next to the locked sprite, plus a 50% overlay, into `../renders/` |
| `mm_common.py` | shared helpers (pure-Python geometry, materials, rig, FBX) |

## How to run (Mac)
```
cd Art/blender
blender -b -P mixer_truck.py -- --skin 1          # then driver.py, snow_kit.py, render_check.py
blender -b -P render_check.py -- --with-driver --engine eevee     # needs the two FBX/.blend from above in ../exports
# flags: --out DIR  --strict (exit 2 on a failed check)  --no-export  --no-bake-space  --only PineA,CabinA (snow_kit)
python3 mixer_truck.py --dry-run                  # any machine, no Blender: builds geometry, runs all numeric checks
```
Outputs go to `Art/exports/` (FBX, .blend, `*_meta.json`, `*_qa.json`, `textures/`). Run order: truck, driver, snow_kit, render_check.

## Scale, axes, pivots
- 1 unit = 1 m. Origin of the truck = bottom centre of the chassis (the physics datum, same as the sprite origin). Ground contact is z = -0.327 (hub z 0.173, wheel r 0.50 exact).
- Truck faces **+X** (cab at the right, drum at the left; AL-1). Z up. Y is depth; the side camera sits at -Y.
- FBX export: forward -Z, up Y, **Apply Transform** (bake space) on, scale All Local. Blender X -> Unity X, Z -> Unity Y, Y -> Unity Z, so the truck drives toward Unity +X as in the 2D sim. If bones look rotated in Unity, re-export with `--no-bake-space` (known Blender exporter quirk with armatures) and tell the art lead.
- All mesh objects have rotation 0, scale 1; the object origin is the pivot. Pivots: wheels = hub centre; drum = drum centre (spin axis = drum axis, tilt 14.3 deg, front down); chute = hinge (sim CHUTE_PIN); axles = axle centre; cab = (1.0, 0, 0.86); props = bottom centre on the ground.
- Rotation axes (also in `MM_Truck_Mixer_meta.json`): wheels +Y (positive = rolling forward), drum its own axis, chute +Y hinge (rest -26 deg), axles translate in Z (visual travel -0.10..+0.12 m).
- Sockets (empties): `Socket_Driver` (0.95, 0, 1.16), `Socket_Exhaust`, `Socket_Headlight[L/R]`, `Socket_ChuteTip`, `Socket_Contact[F/R]` (dust points).

## Naming
- Files: `MM_<Category>_<Name>[_<Variant>].fbx`, e.g. `MM_Truck_Mixer.fbx`, `MM_Char_Driver.fbx`, `MM_Env_PineA.fbx`.
- Objects: `MM_<Asset>_<Part>_LOD<n>`; armatures `..._Rig`; empties `MM_<Asset>_Socket_<Name>`. Static props get a root empty named like the asset with the LOD meshes as children, so Unity builds the LODGroup. Rigged assets parent each rigid part to its bone; Unity makes one LODGroup per bone parent.
- Materials: `MM_<Group>_<Name>` (`MM_Truck_Body`, `MM_Truck_Accent`, `MM_Truck_Drum`, `MM_Truck_DrumStripe`, `MM_Rubber`, `MM_Glass`, `MM_Chrome`, `MM_Light_Head`, `MM_Env_*`, `MM_Driver_*`). Remap by name to URP Complex Lit (hero paint, clear coat) or Lit (Low). The 4 mixer skins are colour swaps of Body/Accent/Drum/DrumStripe (table in the meta json).
- Vertex colour attribute `OutlineN` = smoothed normal*0.5+0.5 (object space) for the inverted-hull navy outline (0.06 m truck, #22252b). Face mesh and all `MM_Env_*` have none (background rule).
- UVs: box projection, 1 UV unit = 1 m (flat colour materials, no unique textures). Glass panes have 0..1 UVs for `textures/MM_GlassStreak.png` (the painted streak). Texel density is therefore set by the shared atlas in Unity (palette 256 px / detail 1024 px per S1).

## Poly budgets (from S1 section 6) and current dry-run counts
| Asset | Budget LOD0 | Now LOD0 | LOD1 |
|---|---|---|---|
| Mixer (all parts) | 12,000 | 11,300 | 2,100 (budget 5,000) |
| Driver | 3,500 | 3,300 | 1,400 (budget 1,500) |
| Props: bank/pine/rock/rail/cabin/sign/mountain | 800/900/400/600/1,500/500/1,500 | all under | lower than LOD0 |

Counts are triangles from the pure-Python mesh; Blender triangulates n-gons the same way, so the in-Blender number should match within a few percent. `--strict` fails the run if a budget or fit check fails.

## Contract checks done in the scripts
Wheel r 0.50 +-0.02, wheelbase 2.368 +-0.02, hub pivots, cab at +X, art vs the 5 convex colliders of `mixer_skin1` (art outside 0.033 m <= 0.04; collider outside art 0.050 m <= 0.06; wheel arches exempt), transforms applied, `MM_` names, UVs present. Lessons applied: AL-1 (facing stated and checked), AL-2 (no pink/magenta/violet, explicit glass colour), AL-4 (several convex parts, never one hull). AL-3 and AL-5 concern generated sprites and do not apply (no image generation here).

## First real run (2026-11-02, Blender 5.2.2 LTS on macOS)
All four scripts run headless with `--strict` and pass every check; no bpy API changes were needed. `render_check.py -- --with-driver --engine eevee` renders the side-by-side and overlay stills into `../renders/`.
`mixer_truck.py` now also exports `Truck_Mixer.fbx`, the Unity drop-in (see `Unity/README.md`): plain empties with the Unity node names, LOD0 meshes, a Triangulate modifier (Unity dropped concave n-gons), no axis bake, FBX forward `-Z` (`--unity-forward`). Copy it to `Unity/Assets/MixerMad/Art/Models/`.

## Not verified yet (before the first run)
Nothing ran in real Blender: bmesh-free, but the bpy calls (bone parenting, FBX options, colour attributes, shape keys, EEVEE render) are untested. Run each script once with `--strict`, open the .blend, and check the FBX in Unity. Hard-surface look is simple on purpose; polish passes come after the first Mac run.
