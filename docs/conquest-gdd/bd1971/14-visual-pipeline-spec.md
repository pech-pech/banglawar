# 14 - Visual pipeline spec: automated isometric sprites with Blender (theme-agnostic, piloted on `bd1971`)

Status: **SPEC ONLY, for the owner's review.** Date: 2026-10-03. Nothing here has been built, installed, generated or committed. No asset exists. No OpenArt call was made. The art method is the owner's decision (05 §8 says it is undecided); this file describes one candidate method, a Blender-based automated pipeline, in enough detail to decide on it and pilot it.

Inputs (read as data): [GDD.md](../GDD.md) §2.1, §7, §8.1, §14.3, §16, §18-19 (GDD §n); [04-theme-architecture.md](../04-theme-architecture.md) §1.7, §2.4-2.5, §6, §7 (TA §n); [13-unity-architecture-plan.md](../13-unity-architecture-plan.md) §0, §2.4, §6 (UA §n; it existed when this was written and is treated as the current Unity plan); [05-theme-pack-spec.md](05-theme-pack-spec.md) §1.3, §2, §3.1, §8, §9, §10 (TP §n); [04-sensitivity-comparison.md](04-sensitivity-comparison.md) §9, §10 (SC §n); [08-map-draft.md](08-map-draft.md) §0, §1, §7 (MAP §n); [11-reviewer-plan.md](11-reviewer-plan.md) §2, §5.3, §6, §7, §9.2 (RP §n); [06-variant-and-hooks-spec.md](06-variant-and-hooks-spec.md) (roles only).

Tags used in this file:
- **VERIFIED-RUN** = checked today by running Blender 5.2.2 LTS headless on this Mac (Apple M4 Pro, 12 cores) with throwaway scripts in the session scratchpad; outputs were thrown away. Section 4.8 lists every probe and its result.
- **VERIFIED-HELP** = read from `Blender --help` on this machine.
- **DOCS** = stated by a page cited here.
- **UNVERIFIED** = my understanding of the Blender or Unity API that I did not run or read today. Check it before relying on it.
- **ASSUMED** = a planning number or a default I picked; tunable.
- **OWNER** = needs the owner's decision.

---

## 1. Goals, non-goals and the automation principle

### 1.1 Goals
1. Produce every picture the theme asset manifest can hold (TA §6.1 keys: terrain tiles, buildings per level, units per level and animation state, transports, icons) **from data**: an asset spec (JSON), a model recipe (Python) or a hand-made `.blend`, and a palette (JSON).
2. **Theme-agnostic.** The pipeline knows role ids, footprints, directions and states; it never knows "Base area HQ" or "Fort". Re-theming means new specs, recipe parameters and a palette, not new pipeline code.
3. **Deterministic and reviewable.** Same inputs, same pixels (on the reference machine, byte for byte; elsewhere within a stated tolerance). Every output can be traced to its inputs by hash.
4. **Fits the existing contracts:** asset keys and fallback chain (TA §6), provenance per picture (TA §6.2, TP §8.3 rule 5), the Unity resolver and sprite provider (UA §6.7), footprints (GDD §8.1), and the binding content limits of `bd1971` (TP §8.3 rules 1-4, SC §9).
5. **Gated.** No asset reaches `approved` without the content checks of section 12 and, where the subject needs it, a recorded reviewer verdict (RP §6-7).

### 1.2 Non-goals
- Not a replacement for an artist's judgement: the pipeline makes consistent, cheap, re-themable pictures; whether they look good enough is the owner's call after the pilot (section 15).
- No characters with faces, no portraits, no photographs, no lettering, no flags or insignia (section 12). Units are faceless silhouettes (TP §8.3 rule 2).
- No map rendering. The map is drawn by Unity from tiles (UA §6.2); this pipeline makes the tiles, not the map. Map edges between terrain types (transitions) are an open question (section 17, Q4).
- No runtime Blender. Blender is a build-time tool only; the game never ships or calls it.
- No automatic image generation. OpenArt is outside the pipeline (section 14).

### 1.3 The automation principle
- **Production runs are scripts.** `Blender -b --factory-startup --python-exit-code 3 -P tools/art/blender/render.py -- <args>` (flags VERIFIED-RUN and VERIFIED-HELP). `-b` = no UI; `--factory-startup` = ignore the user's preferences and add-ons so every machine starts from the same state; `--python-exit-code 3` = an uncaught Python exception exits with code 3 (VERIFIED-HELP: "Set the exit-code in [0..255] to exit if a Python exception is raised"); `--` ends Blender's own arguments, and the script reads everything after it (VERIFIED-RUN: `sys.argv[sys.argv.index("--") + 1:]` returned exactly the passed list).
- **Scripts are files in the repo**, reviewed like code, with tests (section 16). A render is reproducible from a commit hash.
- **MCP is for exploration only** (section 13): looking at a `.blend`, trying an idea, reading API docs. Code found useful there is copied into a reviewed script. No pipeline step, test or CI job uses MCP.
- **Python auto-execution in `.blend` files stays off** (`-Y`/`--disable-autoexec` is the default, VERIFIED-HELP). A hand-made `.blend` must never need a script embedded in it.

---

## 2. Pipeline overview and directory layout

### 2.1 Pipeline

```
 art/specs/<theme>/*.json      art/palettes/<theme>.json      tools/art/blender/recipes/*.py   art/models/*.blend
          |                              |                               |                          |
          v                              v                               v                          v
 [1 validate]  schema + footprint + forbidden tags + reference status + palette keys   (plain Python, no Blender)
          |
          v
 [2 plan]      expand each spec into render jobs: (key, direction, state, frame); compute input hash;
               skip jobs whose hash is already in out/cache/index.json                   (plain Python)
          |
          v
 [3 scene build]  Blender -b: factory scene -> camera rig (section 4) -> recipe or linked .blend
                  -> palette materials (section 6) -> scene audit (section 12.3)          (Blender process, per batch)
          |
          v
 [4 render]    per direction x state x frame: set pose/frame, render PNG (RGBA, transparent film,
               metadata stamps off) into out/raw/<theme>/<key>/...                       (same Blender process)
          |
          v
 [5 post]      trim to the footprint canvas, outline (optional), palette quantise, pivot,
               bleed/padding, alpha clean                                                (Blender's own Python: numpy + OpenImageIO)
          |
          v
 [6 pack]      sheet per role (or per atlas group) + atlas JSON (frames, rects, pivots)  (same)
          |
          v
 [7 manifest]  write/merge themes/<id>/assets/manifest.json entries + provenance; run the
               validation gates of section 9; nothing is written if a gate fails        (plain Python)
          |
          v
 [8 contact sheet]  one PNG/HTML page per batch for the owner and reviewers (all directions,
               all frames, over the terrain colours, at 1x and 2x)                      (same)
          |
          v
 [9 Unity]     copy approved outputs into StreamingAssets/conquest/themes/<id>/assets/ (UA §2.4);
               the engine-free AssetResolver reads the manifest; SpriteProvider builds Sprites (section 10)
```

Steps 1, 2, 7 and 8 do not need Blender and can run in any Python 3. Steps 3-6 run inside Blender's bundled Python (3.13.13, with `numpy` and `OpenImageIO` importable; VERIFIED-RUN), so the default pipeline needs **no new install** beyond Blender itself (section 17).

### 2.2 Directory layout

Paths are relative to the **conquest project root**. Where that root is (this git repository, a new repository, or beside the Unity project, which is under Unity Version Control, UA §0) is an OWNER question (Q1). The names below avoid the existing platformer `tools/art/` files by sitting under `tools/art/blender/`.

```
tools/art/blender/                 COMMITTED  pipeline code (Python), reviewed and tested
  render.py                        batch driver run inside Blender (steps 3-6)
  plan.py  validate.py  manifest.py  contact_sheet.py     plain-Python steps (1, 2, 7, 8)
  rig.py                           camera, lights, film, colour management (section 4)
  palette.py                       palette JSON -> materials; colour maths (section 6)
  post.py  pack.py                 trimming, quantising, outlines, packing (section 8)
  audit.py                         in-Blender scene audit for forbidden content (section 12.3)
  recipes/                         theme-neutral model builders, one module per shape (section 5)
    __init__.py  common.py  terrain_surface.py  hut.py  keep.py  tent_camp.py  hull_long.py
    figure_silhouette.py  crate.py  jetty.py ...
  anim/                            procedural rigs and actions (section 11)
  schema/asset-spec.schema.json    JSON Schema of section 3 (validated by our own small checker)
  tests/                           unit tests (plain Python) and golden tests (Blender)
  VERSION                          generator version, semver; part of every input hash
art/                               COMMITTED  inputs that are data, not code
  specs/<theme>/<group>.json       asset specs (section 3), one file per role group
  palettes/<theme>.json            art palette (section 6), extends the theme.json palette
  palettes/<theme>.lock.json       derived shades, generated and committed for review (section 6.2)
  models/<theme>/*.blend           hand-made models, only where a recipe is not worth it (section 5.4)
  references/<theme>.json          reference LIST (citations and review status only; no images; section 12.5)
  render-profiles.json             named camera/engine/size profiles (section 4.7)
out/                               GENERATED, git-ignored
  raw/<theme>/<key>/<dir>/<state>_<frame>.png     straight from Blender
  post/<theme>/<key>/...                          after post-processing
  sheets/<theme>/<atlas>.png + <atlas>.json       packed sheets
  cache/index.json                                input hash -> output hashes (section 7.5)
  reports/<run-id>/report.json  contact/*.png     run report and contact sheets
  goldens-actual/                                 golden-test outputs on failure
StreamingAssets/conquest/themes/<id>/assets/      COMMITTED (in the game project) ONLY when status is approved
  manifest.json  *.png  *.atlas.json              what the game loads (UA §2.4, TA §6)
```

What is committed and why:
- **Committed:** code, specs, palettes (and the lock file, so a derived shade change shows in review), hand-made `.blend` files, the reference list, render profiles, golden hashes, and the **approved** outputs in the theme folder (the game must build without running Blender).
- **Not committed:** `out/` (re-creatable from a commit), reference images (copyright and sensitivity; section 12.5), any draft that has not passed the gates.
- `.blend` and PNG files are binary. Whether to use Git LFS (a tool install) or plain git is OWNER (Q2).

---

## 3. The asset spec JSON schema

### 3.1 Shape of one spec

One spec = one asset key family: one role (TA §2.3 role id), optionally one level and variant, optionally one faction slot, with all of its states, directions and frames. Keys follow TA §6.1: `<kind>.<role>[.L<level>][.v<variant>][.<state>]`, and this spec proposes the per-slot suffix `@<slot>` used for text in TP X-1 (needs the resolver to support it; UA §6.7 already lists `slot?` in `AssetRequest`; dependency D-3 in section 17).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `schema` | `"asset-spec/1"` | yes | Schema version; a newer one is refused by an older tool. |
| `id` | string | yes | Theme-neutral spec id, unique in the theme: the base asset key without state, e.g. `bld.garrison`, `u.shock.L1`, `tile.t.open.v1`. Built from role ids only, never labels (TA §6.1). |
| `theme` | string | yes | Theme id (`bd1971`). |
| `kind` | `tile` \| `bld` \| `u` \| `icon` \| `ui` \| `battle` | yes | First segment of the key. |
| `role` | role id | yes | Must exist in `rules/core/ruleset.json` roles (GDD §2.1). |
| `level` | 1..4 or null | no | Only if the role has levels (TA §2.5 `levels`). |
| `variant` | integer >= 1 or null | no | Visual variant (`.v2`), e.g. terrain variety. |
| `slot` | `f1`..`f6` or null | no | Faction-specific art (TP §2.2: player and AI ladders differ). Null = shared art tinted by the owner mask (section 6.4). |
| `footprint` | `[w, h]` tiles | yes | Must equal the ruleset footprint (GDD §8.1: garrison 2x2, others 1x1 ASSUMED). Units and transports: `[1, 1]`. Read from the ruleset by `validate.py`, never typed by hand where the ruleset has it; a mismatch fails. |
| `canvas` | object | no | Overrides of the computed canvas (section 4.4): `headroom_px`, `extra_px`. |
| `directions` | `1` \| `4` \| `8` | yes | Facings. Tiles and buildings: 1. Units and transports: 4 or 8 (OWNER Q5; default 8 for units, 4 for boats). |
| `mirror` | object or null | no | `{"render": ["S","SE","E","NE","N"], "mirror_from": {"SW":"SE","W":"E","NW":"NE"}}`: render 5 directions, mirror 3 in post. Allowed only if the spec sets `asymmetric: false` (section 11.4). |
| `states` | object | yes | Map of state name to `{frames, fps, loop, action}`; e.g. `{"idle": {"frames": 4, "fps": 6, "loop": true, "action": "idle_breathe"}}`. Tiles and buildings use `{"static": {"frames": 1}}`. State names come from a fixed list: `static`, `idle`, `walk`, `attack`, `down`, `built`, `construct`, `damaged`. |
| `model` | object | yes | Exactly one of `{"recipe": "<module>", "params": {...}}` or `{"blend": "art/models/<theme>/<file>.blend", "collection": "<name>"}` (section 5). |
| `materials` | object | yes | Material slot name to palette key: `{"body": "f.owner", "roof": "thatch", "trim": "ink"}`. Keys must exist in the palette (section 6). `f.owner` means "owner mask" (section 6.4). |
| `render_profile` | string | yes | Name in `art/render-profiles.json` (section 4.7), e.g. `iso64-flat`. |
| `seed` | integer | no | Extra seed for recipe randomness; the effective seed is `hash(id, variant, seed)` (section 7.4). |
| `tags` | string[] | yes | Content tags from the controlled list of section 12.1. Unknown tags fail. |
| `references` | string[] | no | Ids into `art/references/<theme>.json` (section 12.5). |
| `review` | object | yes | `{"status": "draft" | "internal" | "in_review" | "approved" | "rejected", "required": ["R1","R3"], "log_items": ["IMG-..."]}`. `required` is computed from tags (section 12.2) and checked, not trusted. |
| `provenance` | object | yes | `{"author": "...", "tool": "blender-pipeline", "licence": "original", "source": "procedural" | "hand-modelled" | "mixed", "external_inputs": [...]}`. `external_inputs` lists any texture or model not made in this repo, each with its own source, licence and author (TA §6.2); OpenArt textures add `model`, `plan`, `job_ref` (section 14). |
| `_note` | string | no | Free text, ignored by tools (TA §2.1 convention). |

Rules enforced by `validate.py` (each failure names file and JSON path, as TA §3.4 asks):
1. The spec holds no ruleset key (`cost`, `output`, `move`, `effects`, ...): the same "a theme has no rules" check as TP V-23.
2. `id` and the file contain no label words: a deny-list of the theme's own label strings (read from `text/en.json` values) must not appear in `id`, file names, recipe names, object names or material names. This keeps the pipeline theme-neutral (a spec for "Fighters' camp" is called `bld.garrison`).
3. Footprint equals the ruleset footprint; directions and states are from the fixed lists; every material key exists in the palette.
4. `review.required` is a superset of what the tags demand (section 12.2).
5. A spec with `slot` set needs the role's `roles.json` entry to have an override for that slot or a note why (keeps per-slot art deliberate).

### 3.2 Example: a terrain tile (paddy, variant 1)

```json
{
  "schema": "asset-spec/1",
  "id": "tile.t.open.v1",
  "theme": "bd1971",
  "kind": "tile",
  "role": "t.open",
  "variant": 1,
  "footprint": [1, 1],
  "directions": 1,
  "states": {"static": {"frames": 1}},
  "model": {"recipe": "terrain_surface",
            "params": {"pattern": "plots", "plot_rows": 3, "bund_width": 0.06, "water_sheen": 0.3,
                       "height_jitter": 0.0}},
  "materials": {"ground": "open", "bund": "open.dark", "sheen": "water_still.light"},
  "render_profile": "iso64-flat",
  "seed": 1,
  "tags": ["terrain", "landscape"],
  "references": [],
  "review": {"status": "draft", "required": [], "log_items": []},
  "provenance": {"author": "owner", "tool": "blender-pipeline", "licence": "original",
                 "source": "procedural", "external_inputs": []}
}
```

### 3.3 Example: a 2x2 building (`bld.garrison`, shared art, owner mask)

```json
{
  "schema": "asset-spec/1",
  "id": "bld.garrison",
  "theme": "bd1971",
  "kind": "bld",
  "role": "bld.garrison",
  "footprint": [2, 2],
  "directions": 1,
  "states": {"static": {"frames": 1}, "construct": {"frames": 3, "fps": 0, "loop": false, "action": "build_stages"}},
  "model": {"recipe": "tent_camp",
            "params": {"tents": 3, "tent_shape": "ridge", "fence": "bamboo_low", "fence_gap_side": "S",
                       "ground_patch": 0.92}},
  "materials": {"canvas": "rough.light", "fence": "wood_a", "ground": "rough", "pennant": "f.owner",
                "trim": "ink"},
  "render_profile": "iso64-flat",
  "tags": ["building", "military_installation"],
  "references": ["REF-camp-01"],
  "review": {"status": "draft", "required": ["R1"], "log_items": []},
  "provenance": {"author": "owner", "tool": "blender-pipeline", "licence": "original",
                 "source": "procedural", "external_inputs": []},
  "_note": "No flag, no insignia: the pennant is a plain shape filled by the owner mask (TP 3.1, 8.3 rule 1)."
}
```

### 3.4 Example: a unit with idle and walk (`u.shock.L1`, player slot)

```json
{
  "schema": "asset-spec/1",
  "id": "u.shock.L1@f1",
  "theme": "bd1971",
  "kind": "u",
  "role": "u.shock",
  "level": 1,
  "slot": "f1",
  "footprint": [1, 1],
  "directions": 8,
  "mirror": null,
  "states": {
    "idle": {"frames": 4, "fps": 6, "loop": true, "action": "idle_breathe"},
    "walk": {"frames": 8, "fps": 10, "loop": true, "action": "walk_cycle"}
  },
  "model": {"recipe": "figure_silhouette",
            "params": {"count": 3, "spacing": 0.22, "build": "slim", "headwear": "none",
                       "carry": "long_item_low", "stance": "crouched_alert"}},
  "materials": {"figure": "ink.soft", "cloth": "f.owner", "item": "ink"},
  "render_profile": "iso64-unit",
  "tags": ["unit", "figure_silhouette", "armed"],
  "references": [],
  "review": {"status": "draft", "required": ["R1", "R3"], "log_items": []},
  "provenance": {"author": "owner", "tool": "blender-pipeline", "licence": "original",
                 "source": "procedural", "external_inputs": []},
  "_note": "Faceless silhouettes only (TP 8.3 rule 2). No real uniform, insignia or identifiable weapon model. 'carry' is an abstract long shape, not a modelled firearm (OWNER Q8)."
}
```

### 3.5 Example: a boat (`u.transport.L1`, player slot)

```json
{
  "schema": "asset-spec/1",
  "id": "u.transport.L1@f1",
  "theme": "bd1971",
  "kind": "u",
  "role": "u.transport",
  "level": 1,
  "slot": "f1",
  "footprint": [1, 1],
  "directions": 4,
  "states": {"idle": {"frames": 4, "fps": 4, "loop": true, "action": "bob_on_water"},
             "walk": {"frames": 6, "fps": 8, "loop": true, "action": "row_or_drift"}},
  "model": {"recipe": "hull_long",
            "params": {"length": 0.9, "beam": 0.22, "sheer": 0.35, "ends": "raised_pointed",
                       "canopy": "half_arch", "count": 2, "crew": "none"}},
  "materials": {"hull": "wood_b", "canopy": "rough.light", "band": "f.owner", "wake": "water_deep.light"},
  "render_profile": "iso64-unit",
  "tags": ["unit", "vessel", "watercraft_traditional"],
  "references": ["REF-boat-01"],
  "review": {"status": "draft", "required": ["R1"], "log_items": []},
  "provenance": {"author": "owner", "tool": "blender-pipeline", "licence": "original",
                 "source": "procedural", "external_inputs": []},
  "_note": "Generic country boat form; proportions are ASSUMED until a reviewed reference exists (section 12.5). crew: none keeps people out of the picture."
}
```

---

## 4. Camera and lighting

### 4.1 Projection choice (configurable)

Two projections are supported by one rig; the render profile picks one.

| Profile family | Camera X rotation (tilt from straight down) | Z rotation | Tile diamond (width : height) | Use |
|---|---|---|---|---|
| **`2:1` "pixel isometric" (dimetric)** — REC default | **60.000 deg** | 45 deg | **2 : 1** exactly | Pixel-friendly: tile edges step 2 px across, 1 px down; matches a Unity isometric grid with cell size (1, 0.5) (UNVERIFIED for 6.6, section 10) |
| True isometric | **54.7356 deg** (= atan(sqrt 2)) | 45 deg | sqrt(3) : 1 = 1.732 : 1 | Mathematically isometric; edges are not pixel-clean |

Maths (ground tile = 1 m x 1 m square in Blender, the camera rotated by Euler XYZ (alpha, 0, 45 deg), orthographic):
- The tile's two diagonals are sqrt(2) m long. Seen from azimuth 45 deg, one diagonal lies across the screen (full length sqrt(2)), the other runs into the screen and is foreshortened by cos(alpha).
- Screen height : width = sqrt(2) cos(alpha) : sqrt(2) = cos(alpha). For 2:1 we need cos(alpha) = 0.5, so **alpha = 60 deg**. True isometric (all three axes equally foreshortened) needs alpha = atan(sqrt 2) = 54.7356 deg, giving cos(alpha) = 0.57735, i.e. 1.732 : 1.
- A vertical edge of length h projects to h sin(alpha): 0.8660 h at 60 deg, 0.8165 h at 54.7356 deg.

### 4.2 Pixel size per tile and the ortho scale

Let **W** = tile diamond width in pixels (profile setting; REC default **64**, so a tile is 64 x 32 px at 2:1). Then:
- metres per pixel = sqrt(2) / W (horizontal), and the same vertically in the image plane (square pixels).
- With `camera.data.sensor_fit = 'HORIZONTAL'`, Blender's `ortho_scale` is the image-plane width in metres (UNVERIFIED for `HORIZONTAL`; VERIFIED-RUN with the default `AUTO` fit on square canvases), so for a canvas of C_w pixels:

  **ortho_scale = C_w x sqrt(2) / W**

  Example: a 128 px wide canvas at W = 64 gives ortho_scale = 2.8284.
- Height in pixels of a vertical edge h metres tall: **h x sin(alpha) x W / sqrt(2)**. At 60 deg and W = 64: **39.19 px per metre** of height.
- VERIFIED-RUN at W = 64, 60 deg, 128 x 128 canvas, anti-aliasing off: a 1 m ground tile covered **62 x 32 px** (the two side tips are single points that fall between pixel centres, so 2 px of width are lost; this is why tiles get a canonical mask in post, section 8.2); a 1 m cube covered **64 x 71 px** (32 + 39.2 predicted). True isometric: **62 x 36 px** (36.95 predicted).
- Sub-pixel placement: put the camera so that tile corners land on pixel **edges**, not centres. With an even W, centring the footprint's diamond on the canvas centre does this when C_w and C_h are even (ASSUMED; checked by the golden test in section 16).

Where W comes from: W must match the Unity side (pixels per unit = W if 1 Unity unit = 1 tile width, section 10.2). 13 (UA §6.5) keeps continuous zoom 0.25-2.0 and bilinear filtering unless pixel art is chosen; at zoom 2.0 a 64 px tile shows at 128 screen px, at 0.25 at 16 px. OWNER Q3 picks W (candidates 64 or 96; 128 doubles memory and render time for little gain at a 128x128 map).

### 4.3 Camera rig

`rig.py` builds, in a factory-startup scene:
- an Empty `RIG` at the footprint centre; the orthographic camera is its child at distance 50 m along the view axis (any distance works in ortho; far enough to clear the tallest model), `clip_start` 0.1, `clip_end` 200;
- lights parented to `RIG`, so they keep the same angle to the screen whatever the model's facing (section 11.4 rotates the **model**, not the camera);
- a **ground-catcher** plane (optional, `shadow_catcher` profile flag) for contact shadows (4.5).

### 4.4 Canvas per footprint

For a footprint of w x h tiles at 2:1:
- diamond width = (w + h) / 2 x W; diamond height = (w + h) / 4 x W;
- canvas width = diamond width + 2 x `extra_px` (bleed, default 2);
- canvas height = diamond height + `headroom_px` (per category, ASSUMED: tiles 0, 1x1 buildings 48, 2x2 buildings 64, units 56, boats 32);
- **pivot** = the **bottom corner** of the footprint diamond, in pixels from the canvas's bottom-left, for buildings (UA §6.4 sorts by the front-most tile); the **tile centre** for units and boats (W/4 above the bottom corner of a 1x1 diamond). Pivots are integers.

Examples at W = 64: tile 64 x 32 (+bleed); 1x1 building 68 x 82; 2x2 building 132 x 132; unit canvas 68 x 90.

### 4.5 Shadows and ambient occlusion

| Option | Engine | Pros | Cons | REC |
|---|---|---|---|---|
| No shadow; shape read by flat facet colours (top light, left mid, right dark) | Workbench FLAT with per-face palette shades, or EEVEE with toon ramp | Exact palette; crisp; cheapest | No grounding | **Default for tiles** |
| Baked "blob" contact shadow drawn in post (an ellipse in `ink` at 25-35% alpha under the footprint) | any | Deterministic, palette-exact, cheap, consistent across assets | Not physically right | **Default for buildings and units** |
| Real cast shadow on a shadow-catcher plane | EEVEE (UNVERIFIED shadow-catcher equivalent in EEVEE 5.x) or Cycles | Natural | Soft edges create off-palette pixels; needs quantising | Pilot only, to compare |
| AO | Workbench cavity/AO (UNVERIFIED in final renders), EEVEE AO | Adds depth to crevices | Noise and off-palette pixels at small sizes | Off by default |

Shadows **in the sprite** must not fall outside the canvas or onto neighbouring tiles; the game draws no cross-sprite shadows in v1.

### 4.6 Engine, colour management, anti-aliasing

**Engines** settable in 5.2.2: `BLENDER_WORKBENCH`, `BLENDER_EEVEE`, `CYCLES` (VERIFIED-RUN; `BLENDER_EEVEE_NEXT`, the 4.2-4.x name, is **not** accepted in 5.2.2).

| | Workbench | EEVEE | Cycles |
|---|---|---|---|
| Palette fidelity | **Exact.** VERIFIED-RUN: a material colour set to the linear value of `#1f6f4a`, FLAT lighting, Standard view transform, rendered back as (31, 111, 74) = `#1f6f4a` exactly | Shaded: needs a toon ramp (Shader to RGB + constant Color Ramp, EEVEE only, UNVERIFIED in 5.2) and post quantising | Shaded; noise; needs quantising |
| Speed (VERIFIED-RUN, 128 x 128, one tile) | 2-90 ms per frame | 2.2 s first frame (shader compile), then ~0.22 s | 0.05-0.08 s at 16 samples (CPU default device) |
| Determinism (VERIFIED-RUN, same machine, two separate processes, trivial scene) | byte-identical | byte-identical | byte-identical with `cycles.seed` fixed |
| Lighting control | FLAT, STUDIO, MATCAP (VERIFIED-RUN enum) | full | full |
| Outlines | object outline option in viewport shading (in final render UNVERIFIED) | inverted hull or Freestyle | Freestyle |
| REC | **Default** for tiles, icons and the flat-shaded house style | Pilot comparison for buildings and units (soft light) | Not recommended |

**Colour management.** Use **Standard** view transform, look None, display device sRGB (VERIFIED-RUN: Standard round-trips the palette exactly; **AgX turned `#1f6f4a` into (21, 106, 71)**, a visible shift). Filmic, AgX and Khronos PBR Neutral are all available (VERIFIED-RUN) and are all wrong for a palette-locked style: they remap tones on purpose. Palette hex values are sRGB; `palette.py` converts them to linear for material colours with the exact sRGB transfer function (section 6.1).

**Anti-aliasing and pixel art.** Two supported modes per profile:
- `pixel`: render at the final size with `scene.display.render_aa = 'OFF'` (Workbench; enum `OFF, FXAA, 5, 8, 11, 16, 32` VERIFIED-RUN) or EEVEE with 1 sample and `render.filter_size` minimal (attribute exists, VERIFIED-RUN; whether 0 fully disables filtering is UNVERIFIED). Clean palette pixels, jaggies by design. Post adds the canonical tile mask and optional 1 px outline.
- `smooth`: render at 4x size with AA on, then downscale in post by an exact 4x box filter (deterministic, numpy) and quantise alpha to 0/255 at a 50% threshold for edges that must stay crisp, or keep soft alpha for bilinear-filtered display. Smoother, more off-palette pixels at edges (allowed by the palette check only in the alpha ramp, section 9.2).

REC: `pixel` if the owner chooses pixel art (and then integer zoom stops, UA §6.5); `smooth` if continuous zoom with bilinear filtering stays. **OWNER Q3.**

**Transparent film:** `scene.render.film_transparent = True` and PNG RGBA (VERIFIED-RUN). Straight (not premultiplied) alpha in the PNG is assumed by Unity's `ImageConversion.LoadImage` path (UNVERIFIED; section 10).

**Resolution and DPI:** pixels are what matter; `resolution_percentage` is forced to 100 by the rig. PNG DPI metadata is ignored by Unity and not set.

**Metadata stamps:** with Blender's default stamp settings, two renders of the same scene had **different file bytes but identical pixels**; with every `render.use_stamp_*` flag set to False they were **byte-identical, also across separate processes** (VERIFIED-RUN). The rig switches all stamp flags off; golden tests still hash decoded pixels, not file bytes (section 16).

### 4.7 Render profiles (`art/render-profiles.json`)

```json
{
  "iso64-flat":  {"projection": "2:1", "tile_px": 64, "engine": "BLENDER_WORKBENCH", "light": "FLAT",
                  "aa_mode": "pixel", "view_transform": "Standard", "shadow": "blob", "outline": "post_1px"},
  "iso64-unit":  {"projection": "2:1", "tile_px": 64, "engine": "BLENDER_WORKBENCH", "light": "FLAT",
                  "aa_mode": "pixel", "view_transform": "Standard", "shadow": "blob", "outline": "post_1px",
                  "facet_shading": true},
  "iso64-soft":  {"projection": "2:1", "tile_px": 64, "engine": "BLENDER_EEVEE", "samples": 16,
                  "aa_mode": "smooth", "supersample": 4, "view_transform": "Standard", "shadow": "blob",
                  "outline": "none", "quantise": "palette"}
}
```
Profile names, not raw settings, go in specs, so a house-style change is one edit and re-renders exactly the affected assets (the profile is part of the input hash).

### 4.8 Probes run for this spec (VERIFIED-RUN, scratchpad only, outputs discarded)

| # | What | Result |
|---|---|---|
| P1 | `bpy.app.version_string` | `5.2.2 LTS` (build 2026-09-15) |
| P2 | args after `--` | received exactly as passed |
| P3 | engines settable | `BLENDER_WORKBENCH`, `BLENDER_EEVEE`, `CYCLES`; `BLENDER_EEVEE_NEXT` refused |
| P4 | view transforms settable | Standard, AgX, Filmic, Raw, Khronos PBR Neutral, Filmic Log, False Color |
| P5 | 2:1 tile at W=64 | 62 x 32 px (AA off); repeat in-process: identical pixels |
| P6 | true-iso tile at W=64 | 62 x 36 px |
| P7 | 1 m cube, 2:1, W=64 | 64 x 71 px (predicted 64 x 71.2) |
| P8 | Workbench FLAT + Standard colour round trip | `#1f6f4a` -> (31,111,74) exact; AgX -> (21,106,71) |
| P9 | stamps off | byte-identical PNGs in-process and across processes (Workbench, EEVEE, Cycles 16 spp seed 1) |
| P10 | `sys.exit(5)` with `--python-exit-code 3` | process exit code 5 (explicit exit codes pass through) |
| P11 | bundled Python modules | Python 3.13.13; `numpy` yes; `OpenImageIO` yes; `PIL` no. System `python3` 3.14.7 has neither numpy nor Pillow |
| P12 | start-up cost | ~1.2 s wall for a trivial headless run |
| P13 | `render.use_freestyle`, `cycles.seed`, `render.filter_size` | all present |

Not probed (UNVERIFIED): `sensor_fit = 'HORIZONTAL'` behaviour with non-square canvases, Workbench shadows/cavity/outline in final renders, EEVEE shadow catcher, Shader-to-RGB in 5.2, OpenImageIO PNG writing from Blender's Python, cross-machine or GPU-to-GPU determinism, performance of real models.

---

## 5. Procedural model recipes vs hand-made `.blend` files

### 5.1 Recipe contract

A recipe is a Python module in `tools/art/blender/recipes/` with one public function:

```python
def build(params: Mapping, palette: Palette, rng: random.Random, footprint: tuple[int, int]) -> bpy.types.Object:
    """Create the model in the current scene under one root Empty, inside the footprint box
    (x, y in [0, w] x [0, h] metres, z >= 0). Material SLOTS are named by role in the model
    ('body', 'roof', 'trim'); the spec maps slot names to palette keys. Returns the root."""
```
Rules:
- **Recipe names are shapes, not themes**, and match the glyph names of TA §2.5 / TP §8.1 where possible (`keep`, `hut`, `tent_camp`, `hull_long`, `crate`, `jetty`, `figure_silhouette`, `terrain_surface`, `antenna`, `stretcher`, `book`, `anvil`, `sheaf`, `log`). A colonial or sci-fi theme reuses them with other params.
- **No theme data inside recipes:** no palette hex, no label, no historical claim. Everything theme-specific arrives through `params` (proportions, counts, roof style enums) and the spec's material map.
- **Randomness only through the passed `rng`** (seeded per spec, section 7.4). Never the global `random`, never `time`, never `bpy` random-seed defaults left unset (e.g. a Noise texture or Displace modifier gets an explicit seed or offset from `rng`).
- **Stays in the footprint** (checked: the evaluated bounding box must fit in the footprint plus a per-category overhang, ASSUMED 0.1 m).
- **Data API first**, `bmesh` for custom geometry, modifiers for repetition (Array, Mirror, Solidify, Bevel with `segments` 1-2 for chunky pixel-friendly bevels), applied before render so the depsgraph is simple. Operators (`bpy.ops`) only where there is no data-API path, with the context set explicitly (UNVERIFIED pitfalls; the Blender API "gotchas" page documents context and mode issues — read before writing recipes).
- **Pixel-aware modelling:** minimum feature size of 2 px at W (the platformer's art bible rule; 2 px = 0.044 m at W = 64), so parameters are clamped to that.

### 5.2 Primitives available to recipes (`recipes/common.py`)

`box(w, d, h)`, `prism_roof(w, d, h, pitch, overhang)`, `hip_roof(...)`, `cylinder(r, h, sides)` (sides kept low, 8-12, for a faceted look), `hull(length, beam, sheer, ends)` (bmesh loft through 5-7 cross-sections), `figure(height, build, stance)` (capsule-and-box silhouette, **no head detail beyond an ellipsoid**, no face geometry, no fingers), `plot_grid(rows, cols, bund_width)`, `scatter(points, prototype, rng)` (deterministic placement, Poisson-disc with the seeded rng), `fence(path, post_spacing, style)`.

### 5.3 Where theme-specific data enters

| Layer | Holds | Example (bd1971) | Example (colonial) |
|---|---|---|---|
| Recipe (code) | geometry logic | `tent_camp`: tents along an arc inside a fence | same recipe |
| Spec `params` | proportions, counts, style enums | 3 ridge tents, low bamboo fence | 1 log palisade, 2 cabins |
| Spec `materials` | slot -> palette key | `canvas: rough.light` | `canvas: paper` |
| Palette (`art/palettes/<theme>.json`) | hex values, derived shades | `rough #b09a6a` | `rough #a08a5c` |
| References | proportions sanity, after review | REF-camp-01 (when it exists) | its own list |

### 5.4 Hand-made `.blend` files

Allowed when a recipe would cost more than modelling (e.g. a unique surrender-table picture, TP §8.3 rule 4, if it is ever made). Contract:
- One collection named in the spec; linked (not appended) with `bpy.data.libraries.load(path, link=True)` (UNVERIFIED details) into the factory scene, so the rig, lights and materials stay the pipeline's.
- Material **slots** named like recipe slots; the pipeline replaces the materials with palette materials, so a `.blend` never carries colours of its own.
- No packed images, no image textures except those listed in `provenance.external_inputs`; no Text (FONT) objects; no driver scripts; auto-exec stays off. `audit.py` enforces it (section 12.3).
- Saved with Blender 5.2.2; the version is recorded in the manifest; a file saved by a newer Blender is refused.

---

## 6. Palette and material system

### 6.1 Palette file

`art/palettes/<theme>.json` **extends** the `theme.json` palette (TP §1.3, PROVISIONAL colours) with art-only keys. It never contradicts a `theme.json` value; `validate.py` checks the shared keys are equal.

```json
{
  "schema": "art-palette/1",
  "theme": "bd1971",
  "base": "themes/bd1971/theme.json#palette",
  "colours": {
    "thatch": "#c2a66b", "mud_wall": "#a88f68", "canvas": "#d9cfb4", "metal_dull": "#6d6a64"
  },
  "derive": {"ramp": [-0.12, 0.0, 0.10], "space": "oklab_L", "names": ["dark", "", "light"]},
  "max_colours_per_sprite": 16,
  "owner_mask_key": "f.owner"
}
```
- Hex values are sRGB. `palette.py` converts to linear with the exact sRGB function (c / 12.92 if c <= 0.04045, else ((c + 0.055) / 1.055)^2.4) for `material.diffuse_color` (Workbench) and Principled Base Color (EEVEE). With Standard view transform the render returns the hex exactly (VERIFIED-RUN, section 4.8 P8).
- **Derived shades** (`open.dark`, `open.light`) are computed in OKLab by changing L only (ASSUMED method), rounded to 8-bit sRGB, and written to `<theme>.lock.json`, which is committed so a reviewer sees every colour that can appear.
- Facet shading in Workbench FLAT (no light at all) is done by assigning `dark` / base / `light` to faces by their normal (top, left, right), so the three-tone look is palette-exact by construction.

### 6.2 Re-theme = data change

Changing `theme.json` palette values or the art palette regenerates the lock file and re-renders every asset whose input hash changed (section 7.5). No recipe changes.

### 6.3 Outlines and toon shading

| Option | How | Cost | REC |
|---|---|---|---|
| Post outline | numpy: alpha edge (pixels with alpha 255 next to alpha 0), dilate 1 px outward, fill with `ink` (or `ink.soft` inside, for silhouettes) | trivial, palette-exact, deterministic | **Default** (`outline: post_1px`) |
| Inverted hull | Solidify modifier with flipped normals and a back-face-culled `ink` material | per-model, works in EEVEE | Pilot comparison only |
| Freestyle | `render.use_freestyle` (present, VERIFIED-RUN) | slow, lines poorly controlled at 1-2 px | No |
| Toon ramp | EEVEE Shader to RGB -> constant Color Ramp with palette stops (UNVERIFIED in 5.2) | needs EEVEE | For `iso64-soft` only |

### 6.4 Owner colour (faction tint)

Two ways, chosen per spec (`f.owner` material key):
- **Mask (REC default):** render the `f.owner` slot as pure white in a separate **mask pass** (a second render with every other material black, or an object/material index pass; mechanism UNVERIFIED, the second-render way is certain to work), saved as a single-channel mask beside the sprite. Unity tints the masked pixels with the faction colour at runtime (a two-texture sprite shader, or a pre-tinted copy built once at load). One render serves every slot and any future theme's colours. The mask must cover only small areas (pennant, band, cloth), so the owner colour reads as a marking, not a uniform.
- **Baked per slot:** render once per slot with `f.owner` set to that slot's palette colour. Needed when `slot`-specific art differs anyway (TP §2.2 AI ladder). Simpler in Unity, more renders.

### 6.5 Contrast and accessibility checks (from the theme palette)

Run in step 7 on the post-processed sprite, against the terrain colours it can stand on (from the ruleset's passability: a building on `open`, `wood_a`, `wood_b`, `river`; a boat on `deep`, `still`):
- **Silhouette contrast:** the luminance contrast between the sprite's outline colour and each possible ground colour must be >= 3:1 (WCAG non-text contrast, ASSUMED threshold), and the median body colour vs ground >= 1.5:1 (ASSUMED).
- **Colour-vision simulation:** re-check both under protanopia, deuteranopia and tritanopia simulation (the platformer already has such code in `src/render/colorVision.ts`; port the matrices, do not depend on that file).
- **Owner colours:** `f1` vs `f2` mask colour must differ under all three simulations by a minimum delta-E (ASSUMED 20 in OKLab x 100), and the factions also differ by banner shape (TP §3.1; GDD §16 "never by colour alone").
- A failure blocks `approved` but not `draft`; the contact sheet marks it.

---

## 7. Rendering: the batch driver

### 7.1 Command line

```
Blender -b --factory-startup -noaudio --python-exit-code 3 -t <threads> \
        -P tools/art/blender/render.py -- \
        --theme bd1971 --specs art/specs/bd1971 --only "tile.t.open*,u.transport*" \
        --profile-override none --out out --jobs-file out/plan/<run>.json --force false --report out/reports/<run>
```
(`-noaudio` and `-t` VERIFIED-HELP; `-t 0` = all cores.) `render.py` parses `sys.argv` after `--` with `argparse`; unknown arguments are an error (exit 2).

### 7.2 Per-asset loop (outline)

```
plan = load(jobs_file)                       # made by plan.py: sorted by key, then direction, state, frame
for spec_id in sorted(plan.specs):           # sorted: deterministic order
    reset_scene()                            # read_factory_settings(use_empty=True) (UNVERIFIED best call)
    rig = build_rig(profile)                 # section 4
    root = build_model(spec, palette, rng=Random(seed_for(spec)))
    assign_materials(root, spec.materials, palette)
    audit(scene, spec)                       # section 12.3; raises AuditError
    for direction in spec.directions:        # model rotated about Z by 45 deg steps (section 11.4)
        for state, cfg in sorted(spec.states.items()):
            set_action(root, cfg.action)
            for frame in range(cfg.frames):
                scene.frame_set(frame_for(cfg, frame))
                render_to(f"out/raw/{theme}/{spec.id}/{direction}/{state}_{frame:02d}.png")
                if spec.uses_owner_mask: render_mask_to(...)
    record(spec.id, ok, timings, outputs)
write_report(); sys.exit(code)
```

### 7.3 Output naming

`out/raw/<theme>/<key>/<dir>/<state>_<frame>.png`, with `<dir>` from `S, SE, E, NE, N, NW, W, SW` (screen directions, S = towards the viewer) or `-` for undirected. The packed atlas uses frame names `<key>.<state>/<dir>/<frame>`; the manifest key is the TA §6.1 key (`u.shock.L1.walk@f1`).

### 7.4 Deterministic seeds

`seed_for(spec) = int(sha256(f"{spec.id}|{spec.variant}|{spec.seed or 0}").hexdigest()[:8], 16)`. A `random.Random(seed)` is passed to the recipe. Cycles, if ever used, gets `scene.cycles.seed` from the same value (VERIFIED-RUN that the attribute exists and that a fixed seed gave identical output). No time, no hostname, no process id enters anything.

### 7.5 Caching: skip unchanged

`input_hash = sha256(canonical_json(spec) + recipe source bytes (the module and common.py) + palette lock + render profile + rig.py + post.py + VERSION + bpy.app.version_string + hashes of linked .blend files)`. `out/cache/index.json` maps `input_hash -> {raw_hashes, post_hashes, sheet}`. `plan.py` drops jobs whose input hash and outputs (by decoded-pixel hash) are present. `--force` ignores the cache. The cache never decides approval: an `approved` asset whose input hash changes goes back to `in_review` (same rule as RP §1: a changed item returns to PENDING).

### 7.6 Exit codes

| Code | Meaning |
|---|---|
| 0 | all jobs rendered (or skipped as unchanged) |
| 1 | validation or audit failure (content, footprint, palette); nothing written for the failing spec |
| 2 | bad command line |
| 3 | uncaught Python exception (`--python-exit-code 3`) |
| 4 | a render call failed or produced no file |
| 5 | partial success: some specs failed, others were written; the report lists which |

Explicit `sys.exit(n)` codes pass through Blender (VERIFIED-RUN P10).

### 7.7 Performance estimates (ASSUMED unless marked)

| Item | Estimate | Basis |
|---|---|---|
| Blender start-up per process | ~1.2 s | VERIFIED-RUN (trivial script) |
| Workbench frame, 1x1 tile, W=64 | < 0.1 s | VERIFIED-RUN for a single quad; real tiles ASSUMED < 0.2 s |
| Workbench frame, unit with 3 figures | 0.05-0.3 s | ASSUMED |
| EEVEE frame | 0.2-1 s after a one-off ~2 s shader compile | VERIFIED-RUN for a quad; real scenes ASSUMED |
| Frames per unit level (8 dirs x (idle 4 + walk 8 + attack 6 + down 4)) | 176 + 176 mask frames | from the spec |
| Full bd1971 set, Workbench (see 7.8 count) | 10-30 minutes on one process | ASSUMED |

### 7.8 Rough asset count for `bd1971` (to size the work; ASSUMED until the owner fixes directions and states)

| Group | Count |
|---|---|
| Terrain tiles: 8 roles x 3 variants | 24 (plus transition sets, Q4) |
| Buildings: 12 roles, `bld.core` x 4 levels x 2 slots, others x 1 or x 2 slots | about 20-35 sprites |
| Units: 8 roles x up to 4 levels x 2 slots x 8 dirs x ~22 frames | up to ~22,000 frames if every level differs; **REC: one model per role and slot, level shown by a badge drawn by the engine** (TA §6.2 step 2 already draws a level badge) -> 16 x 176 = ~2,800 frames |
| Icons: 6 resources, patron, misc | ~10 |

### 7.9 Parallel runs

`plan.py` splits jobs into N shards by spec (never splitting one spec); each shard is one Blender process. REC N = 4 with `-t 3` each on the 12-core reference Mac for Workbench/Cycles CPU; **EEVEE: N <= 2** (GPU contention, ASSUMED). Shards write to disjoint folders; `manifest.py` merges after all exit. Determinism is per spec, so sharding does not change pixels.

### 7.10 Failure reporting

`out/reports/<run>/report.json`: per spec `{id, status, exit_reason, audit_findings[], render_seconds, outputs[], input_hash}` plus run metadata (Blender version string, generator VERSION, git commit, machine model, start/end time; time is in the report only, never in an input hash). The contact sheet shows failed specs as a magenta tile with the reason. A non-zero exit always prints a one-line summary per failed spec to stderr.

---

## 8. Post-processing and packing (outside the Blender scene)

### 8.1 Tool choice

| Option | Dependency | Approval | REC |
|---|---|---|---|
| **A. Blender's bundled Python** (`numpy` + `OpenImageIO`, both importable, VERIFIED-RUN), run as a second `Blender -b --factory-startup -P post.py` step or in the same process after rendering | none new | none (Blender is installed) | **Yes**: zero installs, one Python for all heavy steps. OIIO PNG read/write from this Python is UNVERIFIED (fallback: `bpy.data.images` load/save, which works, VERIFIED-RUN for loading) |
| B. Pillow (+ numpy) in a project virtual environment | Pillow, numpy | **needs owner approval** | Only if A proves awkward |
| C. A `Conquest.Tools` C# command (ImageSharp or similar) | .NET SDK (not installed, UA §0) + a NuGet image library | **needs owner approval** | Later, if the team wants one language |
| D. ImageMagick / TexturePacker | system tools | **needs owner approval**; TexturePacker is commercial | No |

### 8.2 Steps (all deterministic, integer maths where possible)

1. **Load** raw RGBA (straight alpha).
2. **Supersample down** (`smooth` mode only): exact box filter by the integer factor.
3. **Canonical tile mask** (tiles only): multiply alpha by a precomputed pixel-exact 2:1 diamond for W (the same mask for every tile), so every tile tiles seamlessly and the 2 px tip loss of P5 does not matter.
4. **Alpha clean:** alpha < 50% -> 0, else 255, in `pixel` mode; colour of fully transparent pixels set to the nearest opaque neighbour's colour (**bleed**, prevents dark fringes under bilinear filtering) to a depth of `extra_px`.
5. **Blob shadow** and **outline** (sections 4.5, 6.3).
6. **Palette quantise** (`iso64-soft` and any shaded render): nearest colour in OKLab from the lock-file palette plus the alpha ramp rule; record how many pixels moved and by how much (report).
7. **Trim to the canvas rule**, not to content: sprites keep the footprint canvas of section 4.4 so pivots stay constant across frames and assets. Content outside the canvas is an error (it would be clipped).
8. **Mirror** directions declared in `mirror` (section 11.4).
9. **Size normalisation check:** width == footprint rule exactly; height <= canvas height; pivot integer and on the footprint's bottom corner (buildings) or tile centre (units).

### 8.3 Packing

- Own shelf/MaxRects packer (~150 lines, no dependency), input sorted by frame name, so the same set packs the same way every time.
- One atlas per role and slot (units), one per category for tiles and buildings (ASSUMED), max 2048 x 2048 (safe on Web, ASSUMED), padding 2 px, no rotation (Unity's runtime `Sprite.Create` path does not un-rotate; UNVERIFIED but avoided).
- Atlas JSON (our format, versioned):

```json
{"schema": "atlas/1", "image": "u.shock@f1.png", "size": [1024, 512], "tile_px": 64,
 "frames": {"u.shock.L1.walk@f1/SE/03": {"rect": [204, 0, 68, 90], "pivot_px": [34, 16],
            "mask_rect": [204, 90, 68, 90]}},
 "animations": {"u.shock.L1.walk@f1/SE": {"frames": 8, "fps": 10, "loop": true}}}
```
`rect` is x, y from the **top-left**, width, height; `pivot_px` from the sprite's **bottom-left** (Unity's convention for pivots; UNVERIFIED that the loader needs no flip; a Unity EditMode test pins it, section 16).

---

## 9. Manifest and provenance

### 9.1 Manifest entries

`manifest.py` writes entries into `themes/<id>/assets/manifest.json` (TA §2.2 / §6; the exact top-level shape follows whatever the engine's manifest loader defines; the fields below are what this pipeline adds and needs):

```json
{
  "key": "u.shock.L1.walk@f1",
  "role": "u.shock", "level": 1, "variant": null, "state": "walk", "slot": "f1",
  "file": "u.shock@f1.png", "atlas": "u.shock@f1.atlas.json", "frames": 8, "directions": 8,
  "size_px": [68, 90], "pivot_px": [34, 16], "tile_px": 64, "footprint": [1, 1],
  "owner_mask": true, "filter": "point",
  "provenance": {"source": "procedural", "licence": "original", "author": "owner",
                 "tool": "blender-pipeline", "generator_version": "0.1.0",
                 "blender_version": "5.2.2 LTS", "render_profile": "iso64-unit",
                 "spec": "art/specs/bd1971/units.json#u.shock.L1@f1",
                 "input_hash": "sha256:...", "pixel_hash": "sha256:...",
                 "external_inputs": []},
  "review": {"status": "approved", "approved_by": ["R1", "R3"], "log_items": ["IMG-u.shock-01"],
             "approved_version": "sha256:..."},
  "tags": ["unit", "figure_silhouette", "armed"]
}
```
- Key = role id + level + variant + state (+ `@slot`), per TA §6.1, so the resolver's suffix-dropping chain (TA §6.2 step 2, UA §6.7) works unchanged: `u.shock.L1.walk@f1` -> `u.shock.L1.walk` -> `u.shock.L1` -> `u.shock` (where the `@slot` is dropped is a resolver decision, D-3).
- `approved_version` = the pixel hash the reviewer saw; any change in pixels invalidates approval (section 12.4).

### 9.2 Validation checks that fail the pipeline (step 7)

| ID | Check | Fails when |
|---|---|---|
| PV-01 | Size | width differs from the footprint rule, height exceeds the canvas, pivot not integer or not at the rule point |
| PV-02 | Footprint | spec footprint differs from the ruleset (GDD §8.1) |
| PV-03 | Provenance | any of `source`, `licence`, `author`, `tool`, `generator_version`, `blender_version`, `input_hash` missing; an `external_inputs` entry without its own source/licence/author (TA §6.2 `--strict`) |
| PV-04 | Forbidden content tags | a tag in the forbidden list (12.1) is present at all; or a restricted tag is present while `review.status` is `approved` without the required reviewers in `approved_by` |
| PV-05 | Palette | after quantising, any opaque pixel not in the lock-file palette (`pixel` mode), or any fully opaque off-palette pixel (`smooth` mode: only partial-alpha edge pixels may be off-palette); more than `max_colours_per_sprite` distinct colours |
| PV-06 | Contrast | section 6.5 thresholds fail (blocks `approved` only) |
| PV-07 | Key | key does not parse per TA §6.1, uses a label instead of a role id, or duplicates another entry |
| PV-08 | Insignia keys | key contains `flag.bd`, `flag.pk`, `emblem`, `seal`, `crest`, `redcross`, `crescent` (mirrors TP V-19); a photo-type file (`.jpg`, `.jpeg`, `.heic`) is listed |
| PV-09 | Determinism | the same spec rendered twice in the run (spot check, 1 in 20, ASSUMED) gives different pixel hashes |
| PV-10 | Approval freshness | `review.approved_version` differs from the current pixel hash while status is `approved` |
| PV-11 | Animation | frame count in the atlas differs from the spec; a looping state fails the loop check (section 11.5) |
| PV-12 | Release | in `--release` mode, any listed asset with status other than `approved` |

A failure means: no manifest change for that key, exit 1 (or 5 if others passed), and the reason in the report.

---

## 10. Unity import

### 10.1 Two loading routes (UA §2.4, §6.7)

- **Route 1 (UA's starting REC): StreamingAssets, raw PNG.** The game reads the manifest and atlas JSON and creates sprites at runtime: `Texture2D` via `ImageConversion.LoadImage`, then `Sprite.Create(texture, rect, pivotNormalised, pixelsPerUnit, extrude 0, SpriteMeshType.FullRect)` per frame (signature as I remember it, UNVERIFIED for 6.6). Settings applied in code: `filterMode` Point (pixel art) or Bilinear (theme `filter`, UA §6.5), `wrapMode` Clamp, mipmaps off for pixel art (a mip chain would blur at zoom < 1 and point-filtered mips flicker; for bilinear art at zoom 0.25 mipmaps on is better, so it follows the theme filter, ASSUMED), texture marked non-readable after upload to save memory (UNVERIFIED API). No Unity import settings apply on this route; the pipeline's PNGs are final.
- **Route 2 (later, if volume grows): imported assets** (Addressables or 6.6 Content Directories behind `IAssetSource`). Then the importer settings are: Texture Type Sprite (2D and UI), Sprite Mode Multiple, Pixels Per Unit = W, Mesh Type Full Rect, Filter Point or Bilinear, Compression None for pixel art (compression creates off-palette blocks), sRGB on, Alpha Is Transparency on, Generate Mip Maps per filter. Sprite rects and pivots would be set by an editor script from the atlas JSON (an `AssetPostprocessor`; UNVERIFIED 6.6 details) and Sprite Atlas v2 groups per atlas JSON. Needs the 2D Sprite package (approval, UA §0).

### 10.2 Units and pivots

- **1 Unity unit = 1 tile width**, so `pixelsPerUnit = W` (64). A 2:1 isometric `Grid` then has cell size (1, 0.5, 1) (UNVERIFIED in 6.6; the terrain Tilemap of UA §6.2 must use the same).
- Pivots come from `pivot_px` / sprite size (normalised). Buildings pivot at the footprint's bottom corner, which is also their sort point (UA §6.4); units at the tile centre.
- Terrain tiles: Tilemap `Tile` assets built at runtime from the tile sprites (UA §6.2, `Sprite.Create` on a runtime atlas); the canonical diamond (8.2 step 3) guarantees seams line up.
- Owner mask: a small sprite shader (URP 2D unlit Shader Graph) multiplies the mask by the faction colour, or the loader bakes a tinted copy per slot at load. Which one is a Unity-side decision (dependency D-5).

### 10.3 Naming

Files: `<role>[@slot].png` + `<role>[@slot].atlas.json` (units), `tiles.png`, `buildings.png` (+ JSON). Frame names as in 7.3. Unity never sees labels.

### 10.4 Fallback chain (TA §6.2, UA §6.7) and the manifest

The engine-free `AssetResolver` reads only manifest data:
1. exact key in the active theme manifest **with `review.status == approved`** (a release build ignores other statuses; a development build may show `internal` entries with a watermark, ASSUMED);
2. same key with suffixes dropped right-most first (draws a level badge);
3. parent theme (`extends`);
4. glyph painter from `roles.json` with the theme palette and footprint;
5. category painter;
6. magenta placeholder + one warning.

So a pipeline asset can be removed or rejected at any time and the game still draws the glyph. The pipeline never needs to produce every key.

---

## 11. Animation

### 11.1 States and frame counts (ASSUMED defaults, OWNER Q5)

| State | Units | Boats | Buildings |
|---|---|---|---|
| `idle` | 4 frames, 6 fps, loop | 4, 4 fps (bob), loop | - |
| `walk` | 8 frames, 10 fps, loop | 6, 8 fps, loop | - |
| `attack` | 6 frames, 12 fps, once | - (v1) | - |
| `down` | 4 frames, 8 fps, once, ends on a still "withdrawn/kneeling" pose | 4 (low in the water, no wreck) | - |
| `construct` | - | - | 3 stages (stills) |

`down` must not show death, injury or bodies (SC §9 rules 3 and 10): the figures lower and fade or turn away; the engine removes the unit. TP §8.2 lists `idle`, `attack`, `down`; `walk` is added here (needs the theme's state list to accept it).

### 11.2 Procedural rigs

- `figure_silhouette` builds a minimal armature (root, hips, spine, head, 2 x upper/lower leg, 2 x upper/lower arm, item bone) with **parenting of rigid parts to bones** (no skinning: segment meshes move with their bone; chunky and stable at 64 px).
- Actions are generated in code from small keyframe tables (`anim/walk_cycle.py`: hip bob, leg swing angles per phase), set with `keyframe_insert` on pose bones (UNVERIFIED 5.x action/slot API changes: Blender 4.4+ introduced "slotted actions"; read the 5.2 change log before writing this), constant or linear interpolation so frames land on exact poses.
- Groups (a section of 3 figures) are offset by a phase per figure from the seeded rng, so they do not march in lockstep.
- Boats: no rig; `bob_on_water` is a sine on root z and a small roll, sampled at the frame count; oars or a pole as simple rotating parts.

### 11.3 Sampling

For a loop of N frames, render scene frames `start + i x period / N` for i in 0..N-1, where the action's period ends where it started (frame N is not rendered, so the loop does not stutter).

### 11.4 Directions

- The **model** rotates about Z in 45 deg steps under a fixed camera and fixed lights (lighting stays consistent on screen).
- Mirroring 3 of 8 directions halves render time but flips anything held in one hand and the light direction; allowed only with `asymmetric: false` and `facet_shading` symmetric lighting (top-lit FLAT). Default: render all 8.

### 11.5 Loop and consistency checks (PV-11)

- Loop: the pixel difference between the last frame and the first is no larger than the largest difference between two adjacent frames (no visible jump), ASSUMED metric.
- Stability: the pivot column's lowest opaque pixel (feet) stays within 1 px across idle frames (no sliding).
- Silhouette size: the opaque area varies by < 15% across a walk cycle (ASSUMED), catching broken poses.

---

## 12. Sensitive-content controls in the pipeline

### 12.1 Controlled tag list (machine-checkable)

**Forbidden (always fail PV-04, no approval can lift them in `bd1971`):** `civilian`, `victim`, `body`, `gore`, `destroyed_village`, `burning_building`, `photo`, `photo_derived`, `portrait`, `face`, `real_person`, `state_emblem`, `protected_emblem` (red cross, red crescent, red crystal; TP §8.3 rule 1), `religious_symbol` (SC §9 rule 8), `slogan`, `lettering`, `text`, `flag_desecrated`, `atrocity`, `celebration_of_death`.

**Restricted (allowed only with named reviewers' approval recorded, RP §6-7):**

| Tag | Required reviewers | Why |
|---|---|---|
| `figure_silhouette` | R1, R3 | People shown at all (faceless) |
| `armed` | R1, R3 | Weapons near figures |
| `uniform_generic` | R1, R5 | Opposing-side look; equal-dignity rule (SC §9 rule 6) |
| `vessel_military` (AI gunboat) | R1, R5 | Real-equipment resemblance |
| `vehicle_armoured` (AI light tank glyph `tank_light`) | R1, R5 | Same |
| `military_installation` | R1 | Installations only, never towns (SC §9 rule 2) |
| `architecture_regional` | R1, R2 | Regional building forms |
| `watercraft_traditional` | R1 | Country boats |
| `flag_real` | R1, R2, R3 and a legal reader | Display rule of TP §3.1 / RP §9.2; **default: not made at all** |
| `surrender_scene` | R1, R5 (and R3) | TP §8.3 rule 4 |
| `owner_banner_generic` | none | Invented shapes per TP §3.1 |

Neutral tags (`terrain`, `landscape`, `building`, `unit`, `vessel`, `icon`) need no reviewer.

The tag list is data (`tools/art/blender/schema/tags.json`), versioned; adding a tag needs a test update. Tags are **also derived**, not only typed: `audit.py` adds `figure_silhouette` whenever the recipe `figure_silhouette` is used, `armed` whenever a `carry` param is set, and so on, so a spec cannot hide a figure by omitting the tag (PV-04 compares typed and derived tags; derived wins).

### 12.2 Reviewer sign-off gate

- `review.status` moves `draft -> internal -> in_review -> approved` (or `rejected`). Only a person changes `in_review -> approved`, by adding the evidence-log item ids (RP §6 template, Category `Image`) and the reviewer ids to the spec; `manifest.py` copies them and the pixel hash into the manifest.
- The pipeline refuses `approved` when `required` reviewers are missing in `approved_by`, when the log item ids are absent, or when the pixel hash changed since approval (PV-10).
- What reviewers see: the contact sheet of the exact pixel hashes, at 1x and 4x, on each terrain colour, plus the spec's tags and the reference list entries used. RP §5.3 questionnaire C item 4 (imagery limits) is the checklist R3 answers.
- Disagreement follows RP §7.1: the more cautious option ships; a REJECT is never overruled by shipping. A rejected key simply falls back to its glyph (section 10.4).

### 12.3 Scene audit inside Blender (`audit.py`, step 3)

Fails the spec (exit 1) when the scene contains:
- any object of type `FONT` (text) or a Text datablock used by geometry, or any Geometry Nodes string-to-curves node (no lettering by construction);
- any image texture not listed in `provenance.external_inputs`, any packed image, any movie clip (keeps photographs and photo-derived textures out);
- any object, material or collection name matching the label deny-list (theme neutrality) or the insignia words of PV-08;
- materials using colours not from the palette (every material must be created by `palette.py`; foreign materials from a `.blend` are replaced, and leftovers fail);
- face geometry on figures: `figure_silhouette` meshes are checked for vertex count limits per part (a face cannot be sculpted into a 40-vertex ellipsoid; ASSUMED limit);
- a red-and-white cross, crescent or crystal shape is not machine-detectable in general; this stays a reviewer check (R3), plus a crude post check: any sprite whose palette contains a saturated red next to white in more than N pixels is flagged for review (ASSUMED heuristic, flag only).

### 12.4 No real insignia, portraits or photographs

- No flag asset is produced in v1 (`flag.f1`/`flag.f2` stay the generic banners drawn by the glyph painter, TP §3.1). If the owner later wants a flag picture, it is a separate spec with `flag_real` and the full review set, and RP §9.4 already lists flag pictures as the first thing cut.
- No textures from photographs (12.3), no image-model output of people (section 14), no tracing of reference photos: references inform proportions only (12.5).
- Uniforms are plain fills in palette colours; no rank marks, patches, numbers or national markings on either side; both sides get the same modelling detail and the same render profile (equal quality, TP §8.3 rule 6, SC §9 rule 6). A test compares the two slots' specs for each role: same recipe or same vertex-budget class, same profile (ASSUMED rule).

### 12.5 References for boats, architecture and clothing

- `art/references/<theme>.json` is a **list of citations**, not images: `{id, subject, citation, where_to_view, licence_note, used_for: "proportions" | "silhouette" | "colour", proposed_by, status: "proposed" | "accepted" | "rejected", reviewer, log_item}`.
- **This file invents no references.** The example ids above (`REF-camp-01`, `REF-boat-01`) are placeholders with no content; they stay empty until the owner or the historian proposes real sources. Candidate kinds of source to ask R1 about: museum collections and catalogues, published ethnographic or maritime studies of Bengal river craft, architectural surveys of rural Bengal housing. None is named here because none was checked.
- A spec may cite only `accepted` references for `approved` status; `proposed` is enough for `draft`/`internal`.
- Reference images, if collected, live outside the repository (copyright, and some may be war photographs that must never be traced or shipped). The pipeline never reads them.
- Specific cautions: country boats are a living tradition: generic proportions, no named boat type in labels without R2; architecture is rural and generic, never a recognisable real building, mosque, temple or monument (SC §9 rule 8); clothing for figures is a plain silhouette (no lungi/sari/uniform detail that would identify civilians or communities; and no civilians at all, TP §8.3 rule 3); AI-side armour and gunboats are generic forms not identifiable as a specific real model (R5 asked; Q8).

---

## 13. Role of MCP tools

### 13.1 What exists

- **This session's Blender MCP tools** (listed as deferred tools, not used for this spec): live-GUI tools that need a running Blender with an MCP add-on connected (`execute_blender_code`, `get_objects_summary`, `get_object_detail_summary`, `get_screenshot_of_window_as_image`, `render_viewport_to_path`, `render_thumbnail_to_path`, `jump_to_*`), headless "for_cli" variants (`execute_blender_code_for_cli`, `get_blendfile_summary_*_for_cli`), and documentation search (`search_api_docs`, `search_manual_docs`, `get_python_api_docs`; the server's instructions say it bundles the API reference and manual as text files). Whether this server is the Blender Lab release or another build is UNVERIFIED.
- **Blender Lab MCP server** (DOCS, blender.org/lab/mcp-server): experimental, Blender 5.1 or newer, installed as an extension/add-on; an external LLM client sends Python that Blender runs. Blender's own warning: it "will execute LLM generated code in Blender without any guards in place to protect your data from removal or being sent to a remote location", and it recommends a virtual machine or an isolated system.

### 13.2 What each is good for

| Task | Batch scripts | MCP (live or CLI) |
|---|---|---|
| Production renders, CI, goldens | **yes, only** | no |
| Inspecting a hand-made `.blend` (datablocks, missing files, linked libraries) | `audit.py` for gates | **useful** (`get_blendfile_summary_*`) for a quick look |
| Trying a recipe idea, camera angle or material interactively | slow loop | **useful**, then copy the code into a reviewed recipe |
| API lookups while writing recipes | - | **useful** (doc search tools) |
| Screenshots for the owner during design | contact sheets | useful for live sessions |

### 13.3 Honest assessment of the Lab add-on

- **Usefulness for automation: low.** The pipeline needs deterministic, reviewed, versioned code run headless; MCP adds an LLM in the loop, non-repeatable sessions and a live GUI dependency. Its value is speed of exploration and doc lookup, which the existing tools already give.
- **Risks:** unguarded code execution with the user's file permissions (delete files, read keys, send data out); a prompt-injected `.blend` or document could steer generated code; experimental status (API changes, crashes); a GUI session holds state that a script does not, so "it worked in MCP" does not mean "it works in the batch".
- **When to adopt:** only if the owner wants interactive model exploration, and then: a separate macOS user account or VM with no repo credentials, no SSH keys and no cloud tokens; Blender started with `--factory-startup` on a copy of the files; network access off if practical; never pointed at the game repository's working copy; never used in CI. Installing or enabling it **needs the owner's approval** (section 17). Not needed for the pilot.

---

## 14. OpenArt: allowed role and the spend gate

- **Allowed:** concept and texture **exploration** on neutral subjects only: e.g. a paddy-field surface pattern, water ripple, bamboo leaf texture, palette mood studies for terrain. Outputs are references for the owner's eyes or, if a texture is ever used in a model, an `external_inputs` entry with `source: "openart"`, model, plan, job reference, date and licence; such a texture still passes the palette quantise and the scene audit.
- **Never:** people or figures of any kind, faces, uniforms, the flag or any flag, emblems, insignia, slogans, lettering, war scenes, ruins, boats with crews, anything imitating photographs of real events (TP §8 preface).
- **Never from the pipeline.** No script, test, CI job or MCP session calls OpenArt. The pipeline has no OpenArt credentials and refuses any texture without the provenance above.
- **Spend gate (every call, per the project's standing rules):** before any generation, state the model, the credit cost, the current balance and the batch cap, and wait for the owner's clear yes in chat; then the owner renews the art lock themselves (the existing `.claude` lock hook and its 20-minute window); prompts are checked against the prompting playbook before sending; every job is logged in the private ledger afterwards. An earlier yes does not cover a later call.

---

## 15. Pilot plan: five assets

Goal: decide whether this method is worth adopting, with real numbers, before any further spec writing. Everything stays `internal` (not shipped, not shown outside the owner and reviewers).

| # | Asset (key) | Role and label | Profile | Success criteria | Time box (ASSUMED) |
|---|---|---|---|---|---|
| 1 | `tile.t.open.v1..v3` | Paddy land | `iso64-flat` | three variants tile seamlessly in a 16x16 test patch; distinguishable from `t.wood_a` at zoom 0.5 and under the three colour-vision simulations; palette-exact; < 0.2 s per tile | 0.5 day |
| 2 | `tile.t.river.v1` | Khal and small river | `iso64-flat` | reads as crossable water distinct from `t.deep` and `t.still` (TP §2.4); seam test with paddy; shows the transition question (Q4) concretely | 0.5 day |
| 3 | `bld.core.L2` (+ `@f2` if Q6 says per-slot) | Base area HQ / Garrison | `iso64-flat` and `iso64-soft` (compare) | 1x1 footprint exact; pivot sorts correctly beside units in a Unity scene or a mock contact sheet; no flag, no text; owner mask readable; equal-quality pair if both slots made | 1 day |
| 4 | `u.shock.L1@f1` (idle 4, walk 8, 8 dirs) | Raiding party | `iso64-unit` | faceless silhouettes (R3-style self-check against 12.1 by the owner); loop and foot-stability checks pass; group readable at zoom 1 and 0.5; render time per frame measured | 1.5 days (rig and actions are the new work) |
| 5 | `u.transport.L1@f1` (idle 4, walk 6, 4 dirs) | Country-boat flotilla | `iso64-unit` | reads as a boat on `t.deep` at zoom 0.5; no crew; bob loop clean; generic form flagged for R1 | 1 day |
| - | Driver, post, packer, manifest, gates, contact sheet | - | - | full run from specs to manifest with exit 0; second run skips all (cache); golden tests pass twice; one deliberate violation of each PV check fails as expected | 2 days |

Total ASSUMED: about 6.5 working days for one developer (agent or human), before any art polish.

**What the owner reviews:** the contact sheet (each asset at 1x and 2x over each terrain colour, all directions and frames as a strip and as an animated preview); the run report (times, cache hits, quantise statistics); a side-by-side of `iso64-flat` vs `iso64-soft` for asset 3; the same five keys drawn by the glyph painter, for comparison. The owner decides: adopt, adjust (W, projection, engine, pixel vs smooth), or drop the method. Reviewer involvement for the pilot: none required (internal only); asset 4 and 5 go on the R1/R3 list before any `approved` status.

---

## 16. Test plan, CI notes and risks

### 16.1 Tests

| Test | Runs in | What |
|---|---|---|
| Schema and rules (spec validation) | plain Python `unittest` (no pytest install) | every example spec of section 3 validates; each rule of 3.1 and each PV check has a failing fixture |
| Maths | plain Python | ortho scale, canvas and pivot formulas for footprints 1x1, 2x2, 3x2 at W 32/64/96, both projections |
| Packer | plain Python | same input -> same atlas bytes; no overlaps; padding respected; frame names complete |
| Golden images | Blender headless | a fixed set (one tile, one 2x2 building, one unit frame per direction, one boat frame): **decoded-pixel SHA-256 equality** on the reference machine (M4 Pro, Blender 5.2.2) for Workbench; for EEVEE, a tolerance compare: max channel difference <= 2 and <= 0.5% pixels differing (ASSUMED) |
| Determinism | Blender headless | render the golden set twice in two processes; pixel hashes equal (P9 shows this holds for trivial scenes; must be re-shown for real ones) |
| Geometry probes | Blender headless | the P5/P7 measurements as assertions (tile 62x32 raw -> 64x32 after mask; cube 64x71) |
| Size checks | post step | PV-01 over every output |
| Content audit | Blender headless | fixtures with a FONT object, a packed image, a foreign material, a figure with too many vertices, an undeclared tag: each fails with the right reason |
| Unity side | EditMode test (later, UA §10) | loads a fixture atlas, checks rect and pivot conversion and that a rejected key falls back to the glyph |

Golden updates: an explicit `--update-goldens` flag, refused if the generator VERSION did not change, so goldens are never silently re-baselined (same idea as the platformer's `solutions:update`).

### 16.2 CI notes

- Plain-Python tests run anywhere (Python 3.11+, ASSUMED; Blender's 3.13 also works).
- Blender tests need Blender on the runner: download per run (~400 MB+, ASSUMED) or a cached image; that is a tool install on CI and **needs owner approval**. Linux CPU rendering of Workbench may differ from the Mac GPU path, so CI uses the tolerance compare, and the byte-exact goldens are a **reference-machine** check run before committing approved assets.
- The Unity project is under Unity Version Control, not git (UA §0); how approved PNGs move from this pipeline's repo into the Unity project (copy step, or the Unity project reads the theme folder) is dependency D-4.

### 16.3 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| The look is too "programmer art" for the owner | method dropped after the pilot | pilot is cheap; compare flat vs soft; glyph fallback remains |
| Figures at 64 px read as toys or as caricature | sensitivity harm | faceless, restrained poses, R3 review, equal quality both sides; cut figures to glyphs if not approved |
| Blender API change (5.x actions, engine names) | scripts break | pin Blender 5.2.2 LTS in the manifest; the generator refuses other versions unless `--allow-blender` |
| Determinism differs across machines/GPUs | flaky goldens | pixel hashes on the reference machine; tolerance elsewhere; Workbench default |
| Off-palette pixels from shading | palette check failures | Workbench FLAT facets by default; quantise for soft profiles |
| Asset count explodes (directions x states x levels) | long renders, big atlases | one model per role and slot, level badge by engine; 4 directions for boats; cache |
| Transition tiles (coast, river banks) not covered | ugly map edges | Q4: blob/edge sets vs Unity-side blending; decide before mass terrain |
| Unity scale mismatch (PPU, cell size) | misaligned sprites | W is one setting shared by profile, manifest and Unity; an EditMode test |
| A reference image gets traced or a photo texture slips in | provenance and sensitivity breach | references are citations only; audit refuses unlisted textures |
| Lab MCP misuse | data loss or leak | not adopted for production; isolation rules (13.3) |

---

## 17. Dependencies, approvals and open questions

### 17.1 Tools and packages (every one: **needs owner approval before install**, except what is already present)

| # | Item | Status | Needed for |
|---|---|---|---|
| 1 | Blender 5.2.2 LTS | **present** (`/Applications/Blender.app`) | everything |
| 2 | numpy, OpenImageIO in Blender's Python | **present** (VERIFIED-RUN) | post, pack |
| 3 | Pillow (+ numpy) in a venv | not installed; **approval** | only if option 8.1-A fails |
| 4 | pytest | not installed; **approval** (plain `unittest` is the default) | nicer tests |
| 5 | jsonschema (Python) | not installed; **approval** (default: own small checker) | schema validation |
| 6 | Git LFS | **approval** (Q2) | binary `.blend`/PNG history |
| 7 | Blender on CI runners | **approval** | CI golden tests |
| 8 | Unity 2D packages (2D Sprite, 2D Pixel Perfect, Sprite Atlas, Tilemap Editor) | not present (UA §0); **approval** per UA | route 2 import, pixel-perfect camera |
| 9 | .NET SDK + a C# image library | not installed; **approval** | only for option 8.1-C |
| 10 | Blender Lab MCP add-on | **approval** to install or enable; not needed for the pilot | exploration only |
| 11 | OpenArt credits | per-call gate (section 14) | exploration only |
| 12 | Any 3D asset kit, texture pack, HDRI | **approval** + licence review | not planned |

### 17.2 Dependencies on other documents

| ID | Dependency | Owner |
|---|---|---|
| D-1 | Unity plan (13) is fixed enough: route 1 vs 2 (UA §2.4), filter per theme (UA §6.5), sort point (UA §6.4) | Unity plan author |
| D-2 | Asset key grammar accepts `walk`, `construct` states and the manifest fields of 9.1 (TA §6.1) | 04 author / engine |
| D-3 | Resolver supports `@slot` keys and defines where `@slot` drops in the chain (UA §6.7 `slot?`) | Unity plan / 04 |
| D-4 | How approved PNGs reach the Unity project (UVCS vs git) | owner |
| D-5 | Owner-mask rendering in Unity (shader vs baked copy) | Unity plan |
| D-6 | Reviewer log (RP §6) gets an `Image` item per asset key and pixel hash | reviewer plan |

### 17.3 Open questions for the owner

1. **Q1 Repository:** where does the conquest project (and so `tools/art/blender/`, `art/`) live: this repo, a new git repo, or inside the Unity project?
2. **Q2 Binaries:** commit `.blend` and PNG files with plain git, Git LFS, or keep `.blend` files in UVCS only?
3. **Q3 Style and scale:** pixel art (`pixel`, point filter, integer zoom stops) or smooth (`smooth`, bilinear, continuous zoom)? Tile width W = 64 or 96? Projection 2:1 (REC) or true isometric?
4. **Q4 Terrain transitions:** coast and river-bank edges as rendered transition sets (16 or 47 tiles per pair; many renders), or blended by Unity (shader masks), or none in v1?
5. **Q5 Directions and states:** units 8 or 4 directions; boats 4 or 2; which states in v1 (`idle`, `walk`, `attack`, `down`)?
6. **Q6 Per-slot art:** shared models with an owner mask (REC), or separate player and AI models where TP §2.2 labels differ (`bld.core` ladder, `u.shock` raiding party vs armoured troop, `u.transport` country boat vs gunboat)?
7. **Q7 Levels:** one model per role with an engine-drawn level badge (REC), or distinct art per level (4x the work)?
8. **Q8 Weapons and military equipment:** may figures carry an abstract long shape, or no items at all? May AI armour and gunboats appear as generic vehicles, or only as glyphs until R1/R5 review?
9. **Q9 Engine:** accept Workbench flat shading as the house style, or pilot EEVEE soft shading in parallel?
10. **Q10 Reviewers for images:** confirm that R3 (and R1) review every `figure_silhouette`/`armed` asset before `approved`, and that the pilot stays internal.
11. **Q11 MCP:** keep the Lab add-on out of the project entirely, or allow it in an isolated account for exploration?
12. **Q12 Approvals:** which of the items in 17.1 (if any) to approve for the pilot. The pilot as specified needs **none** beyond what is installed (Blender with its bundled numpy and OpenImageIO; plain `unittest`).
