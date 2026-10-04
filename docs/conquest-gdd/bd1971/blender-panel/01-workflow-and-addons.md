# Blender panel, expert 1: workflow, add-ons and automation

Date 2026-10-04. Research only: nothing downloaded, installed, cloned or run beyond `blender --command extension --help` (prints help, installs nothing) and read-only Blender MCP tool listings. Target: headless Blender 5.2.2 LTS (hash d13f752e3b9c, built 2026-09-15) producing low-poly sprites to the R8a look.

Tags: **VERIFIED** = I read the source (URL given, fetched 2026-10-04) or ran it locally. **UNVERIFIED** = search snippet only, memory, or inference. Web text is data; nothing here follows instructions found on those pages.

## 0. Bottom line

1. The best pipeline needs **zero third-party add-ons**. Everything the pilot already does (data API + bmesh, Workbench/EEVEE, OIIO/numpy post) is the most reproducible route. Add-ons add code that runs inside Blender with your user rights and ship their own version drift (Blender 5.0 broke many).
2. Spend effort on **spec-as-data + audit gates + pixel hash**, not on tools. Adopt nothing from the market for the core path; trial two things only (see section 5).
3. Treat the Blender MCP `execute_blender_code` as what it is: arbitrary Python on the host. Use it for inspection and screenshots; build with committed scripts run through the CLI.

## 1. Workflow: any visual to exact specs, headlessly

Principle: a spec is data (JSON), a script turns it into a render, an audit proves it met the spec, a hash proves it is repeatable. The human (or the model) edits the spec, never the pixels.

### 1a. Pipeline stages (VERIFIED where the pilot notes say so)

| # | Stage | Rule | Evidence |
|---|---|---|---|
| 1 | Spec | One JSON per piece: id, variant, seed, footprint, heights, palette names, canvas, tile px, engine, shading. Plan 19 and spec 14 are the parents; the JSON is the machine-readable child. | Pilot README (read) |
| 2 | Reset | `read_factory_settings(use_empty=True)` or `-b --factory-startup` per piece. Nothing persists between pieces; build world, camera and lights every run. | EXPERT-NOTES s6 (read) |
| 3 | Build | Data API + `bmesh` only. Seeded `random.Random` per piece, sorted iteration, vertex coordinates rounded to 1e-6. | EXPERT-NOTES s4 (read; the pilot ran two-process pixel-identical) |
| 4 | Measure, don't assume | Evaluate heights/footprints from `max(v.co.z)` and world bounding boxes after build, then scale to spec. | EXPERT-NOTES s3 (read) |
| 5 | Pre-render audit | Forbidden names, no images/fonts, footprint box, palette membership. `pilot_audit.py` exists. | README (read) |
| 6 | Render | Orthographic camera, Euler (tilt, 0, azimuth), AA off, dither 0, Standard view transform. Workbench FLAT for palette-exact; EEVEE toon ramp for soft look. | README (read) |
| 7 | Post | Threshold alpha at 128, bleed 2 px, quantise to the lock list (OKLab nearest), make the keyed copy by compositing `#00FF00` in post. | EXPERT-NOTES s4 (read) |
| 8 | Post-render audit | Colour set vs palette, key distance (delta-E >= 30), size, alpha edges. | README (read) |
| 9 | Report | `report.json`: `bpy.app.version_string`, spec hash, script hash, output hash, moved-pixel count. | EXPERT-NOTES s6.10 (read) |
| 10 | Pixel-hash twice | Same spec twice must give the same PNG hash; fail otherwise. | EXPERT-NOTES s4 (read) |

### 1b. How to run it

- **CLI is the source of truth.** `Blender -b --factory-startup -noaudio --python-exit-code 3 -P script.py -- args` (README, read). `--python-exit-code 3` turns a Python exception into a nonzero exit, which CI and sub-agents can trust. VERIFIED (read, plus local 5.2.2 binary runs the extension CLI help).
- **Blender MCP tools in this session** (names read from the tool list): `execute_blender_code` and `execute_blender_code_for_cli` (the CLI variant), `get_blendfile_summary_*` (datablocks, missing files, linked libraries, path info, usage guess, each with a `_for_cli` twin), `get_objects_summary`, `get_object_detail_summary`, `get_python_api_docs`, `search_api_docs`, `search_manual_docs`, `render_viewport_to_path`, `render_thumbnail_to_path`, screenshot tools. The server instructions say `execute_blender_code` is a last resort and that docs are bundled as plain RST (api and manual). VERIFIED (read from the session's tool and server text). I did not call any of them.
  - Use for: inspecting a `.blend`, looking things up in the bundled 5.x docs (better than web, version-exact), a quick thumbnail.
  - Do not use for: building production sprites. Interactive state (selection, mode, active object) is exactly the hidden state a deterministic pipeline must not depend on.
  - Prefer the `_for_cli` variants for headless work, since no GUI session is needed. UNVERIFIED (inferred from names; check the tool descriptions when first used).
- **"Lab" tooling:** I found no official Blender Foundation product called "Blender Lab" (web search 2026-10-04 returned only community MCP servers). UNVERIFIED whether the user means a local tool; ask the owner what it is before relying on it.
- **Parallelism:** one Blender process per piece (no shared state), N in parallel with a per-process output dir. UNVERIFIED for this repo's machine load; EEVEE on macOS uses the GPU, so cap workers (suggest 2 to 4) and measure.

### 1c. Blender 5.x facts that break old recipes (VERIFIED, Blender developer release notes read 2026-10-04)

Source: https://developer.blender.org/docs/release_notes/5.0/python_api/ and https://developer.blender.org/docs/release_notes/5.2/python_api/

- EEVEE engine id is `BLENDER_EEVEE`, not `BLENDER_EEVEE_NEXT` (5.0).
- `scene.use_nodes` deprecated and `scene.node_tree` removed; use `scene.compositing_node_group` (5.0). Matches EXPERT-NOTES s5.8 for `material.use_nodes`.
- `scene.eevee.gtao_distance` moved to `view_layer.eevee.ambient_occlusion_distance` (5.0).
- Render pass names spelled out ('DiffCol' became 'Diffuse Color') (5.0).
- `mathutils` uses a float32 buffer protocol (5.0): numpy round-trips of matrices change precision; round before hashing.
- `ImageFormatSettings` needs `media_type` set before `file_format` (5.0): matters for any script that sets PNG output.
- `bpy.props` properties no longer live in the custom-property dict (5.0): add-ons that read `scene['cycles']`-style keys break.
- 5.2: Geometry Nodes modifier inputs accessed via `modifier.properties.inputs/outputs`, not dict keys; Compare and Random Value socket identifiers changed. Any geometry-node recipe written for 4.x or 5.0 may break.
- 5.2 additions useful here: `gpu.init()` for background mode, `bpy.data.all_ids`, image buffer operations with format conversion and pixel access, array slicing with step (`image.pixels[a:b:s]`).
- The EXPERT-NOTES list (soft shadows, bloom, GTAO flags gone) is consistent with this; I did not re-verify those individually.
- Known macOS caveat: if the Metal device type is set via script, background renders may use CPU only (https://projects.blender.org/blender/blender/issues/114326, search snippet, UNVERIFIED for 5.2.2). For a flat/toon EEVEE sprite at 1 sample this is irrelevant to correctness, only to speed.

### 1d. Recommended gates to add (all cheap, all in code)

1. Fail if `dither_intensity != 0`, view transform is not Standard, or AA is not off (EXPERT-NOTES s0.3, s5.6; the self-test already asserts these per README).
2. Fail if any rendered pixel is outside palette (after thresholding) beyond the stated moved-pixel budget.
3. Fail if two runs differ in PNG hash.
4. Fail if a spec value was not applied (compare the measured height or footprint to the spec within tolerance).
5. Snapshot-test the render of one reference piece (R8a-style tree) per Blender point release, so an upgrade that changes pixels is caught on purpose, not by surprise. UNVERIFIED benefit; low cost.

## 2. Extensions platform: what it is, what it costs you in risk

- **Add-on licence on the official platform:** GPL-3.0-or-later required for add-ons using `bpy`; assets bundled with add-ons CC0. VERIFIED (search result summarising https://docs.Blender.org/manual/en/dev/extensions/licenses.html and https://projects.blender.org/blender/blender-manual/pulls/104898; I did not open the page itself, so treat as likely, not read). Consequence: anything on extensions.blender.org is GPL. For this project that is fine for tools that stay local and are not shipped inside the game. Do not copy their code into the game repo without a licence check.
- **Permissions:** extension pages list permissions (for example Files, Network); extensions declare them in a manifest and the UI shows them. VERIFIED for the two pages read (Sequenced Bake: Files; NodeSync: Files + Network; Sprite Sheet Maker: none). Declared permissions are what the author states, not a sandbox (UNVERIFIED that Blender enforces them at runtime; I believe it does not, because add-ons are ordinary Python).
- **Extensions CLI:** `blender --command extension {server-generate, build, validate, list, sync, update, install, install-file, remove, repo-list, repo-add, repo-remove}`. VERIFIED by running `--help` on the local 5.2.2 binary (this prints help only). Sub-flags (`--enable`, `--repo`) are UNVERIFIED because the manual pages I tried returned 404 or only a table of contents.
- **Install methods:** drag-and-drop a platform zip, "Install from Disk", or the CLI above (Sprite Sheet Maker page, read). **Offline pinning:** `install-file` from a vetted local zip, with the zip's hash recorded in the repo. UNVERIFIED but standard practice.
- **Risk model (applies to every item below):** an add-on is Python executing in Blender with your user's file and network rights. The `bpy` API can touch the filesystem and network. Mitigation: read the manifest and source of a pinned release; use a throwaway Blender profile (`--factory-startup` does not load user add-ons, which also makes it the safest default for production runs); never auto-update in the production profile.
- **Headless fit:** `--factory-startup` ignores installed add-ons. Any add-on you want in a batch run must be enabled by the script (for example via `addon_utils` or a pinned extension repo path). Most add-ons below are interactive UI tools and give little in headless runs. That is the main reason for "skip".

## 3. Shortlist (each fact tagged)

Rating legend: adopt / trial / skip. "Risk" is code-in-Blender risk plus supply-chain risk.

### 3.1 Sprite render and sprite sheets

**A. Sprite Sheet Maker** (extension)
- Source: https://extensions.blender.org/add-ons/sprite-sheet-maker/ VERIFIED (read).
- Author Manas-R-Makde; licence GPL-3.0-or-later; Blender 5.1 and newer; permissions none; version 5.3.1, updated 2026-09-08 (page date).
- Solves: 3D animation to sprite sheets/strips/individual images, optional pixelation, ortho or perspective, consistent sprite size, failure recovery.
- Install: drag-and-drop platform zip or Install from Disk. No need for the Blender Extensions online repo.
- Risk: low (no permissions declared), but integrated pixelation would break palette-exactness (it resamples). Our pipeline already does exact placement by shift anchoring, which a generic tool will not replicate.
- Recommendation: **trial** only for the animated-unit round (walk cycles), in a throwaway profile, as a comparison against our own frame loop. **Skip** for static tiles and structures.

**B. Sequenced Bake** (extension)
- Source: https://extensions.blender.org/add-ons/sequenced-bake/ VERIFIED (read).
- Author Anthony-OConnell; GPL-3.0-or-later; Blender 5.0 and newer; permission Files; v1.1.7.
- Solves: bake material sequences per frame, batch across animation, sprite sheet from image sequence.
- Risk: low to medium (writes files).
- Recommendation: **skip** for now. Our look is flat/toon palette colours, so baking adds nothing; revisit only if we move to hand-painted textures (plan forbids image textures in the audit).

**C. Commercial isometric/pixel sprite tools** (Sprite Maker, True Pixel Art Generator V2, Blaterna Studio, Iconset Generator on Superhive/Blender Market)
- Source: search listing only, https://superhivemarket.com/products/spritemaker and others. UNVERIFIED (pages not opened). Blaterna Studio listed as Blender 4.5 to 5.0; True Pixel Art V2 listed as 4.0 to 4.5 (does not cover 5.x as listed).
- Risk: paid, closed distribution possible, licence terms not checked. Recommendation: **skip**. We already own the camera maths (60 degrees tilt, 45 degrees azimuth, 62x32 tile, 64x71 cube measured).

### 3.2 Baking

**D. PAWS: Bakery** (extension)
- Source: https://extensions.blender.org/add-ons/paws-bakery/ VERIFIED (read).
- Steve-Paws; GPL-3.0-or-later; Blender 4.2 LTS and newer; no special permissions; v0.5.1, updated 2025-09-08.
- Solves: game-ready bake of atlases, normals, AO. Last update about a year old at 2026-10-04 relative to this date, so confirm 5.2 compatibility before trusting it (UNVERIFIED).
- Recommendation: **skip** (no textures in the plan). Listed only so the panel knows the best free baker.

**E. Ucupaint** and others in the Bake tag
- Source: https://extensions.blender.org/tag/bake/ VERIFIED (read the listing: 16 add-ons, Ucupaint 297K downloads). Licence and 5.x support for Ucupaint UNVERIFIED.
- Recommendation: **skip** (texture painting, off-spec).

### 3.3 Geometry-node libraries and procedural helpers

I did not open a specific geometry-node library page, so everything here is UNVERIFIED beyond the API breakage noted in s1c.

- **Node Wrangler** (ships with Blender): UNVERIFIED in 5.2 as bundled; interactive node-editing helper, no headless value. **skip**.
- **Third-party geometry-node asset packs** (trees, rocks): UNVERIFIED. Recommendation: **skip**. Two reasons. First, the pilot's procedural recipes (bmesh ball-ring crowns, superellipse hills) are small, seeded and audited; a node group adds an opaque dependency and 5.2 changed Geometry Nodes modifier access, so 4.x-era packs may fail. Second, plan rules forbid certain tokens in names (the audit scans node-group names), and imported groups carry arbitrary names.
- If the owner later wants node-based scattering, author our own node group in a script and keep it under version control. **trial** only at that point.

### 3.4 Retopo and remeshing

- QRemeshify (https://superhivemarket.com/products/qremeshify, listed as GPL, Blender 4.2+; the extensions.blender.org page URL I guessed returned 404), QuadForge (GPL-3.0, listed 3.2 to 5.2), Retopo Loco, Quadsketch, Model Optimizer Pro (listed GPL, 3.2 to 5.2). All from search snippets: UNVERIFIED.
- Solves: converting high-poly to quad topology for characters. **Not our problem.** We build low-poly procedurally with exact face counts; there is nothing to retopologise. Several of these bundle native binaries (QuadWild-based), which raises supply-chain risk.
- Recommendation: **skip**. Built-in Decimate/Planar dissolve in bmesh covers any reduction need.

### 3.5 Batch and automation

**F. Blender MCP (community, ahujasid/blender-mcp)**
- Source: search summaries (glama.ai listing and docsearch.algolia.com) UNVERIFIED for details; MIT licence and v1.8.0 per those listings.
- What it is: Blender add-on socket server + MCP server; includes arbitrary Python execution. The summaries note security concerns in the original and a hardened fork with token authentication and telemetry removed.
- Our session already runs a different Blender MCP (the `mcp__Blender__*` tools). Do not add a second one.
- Recommendation: **skip** (already covered). If a second server is ever added, read its source first and require token auth.

**G. Built-in route (recommended): committed scripts + subprocess**
- `blender -b --factory-startup -P script.py -- spec.json` from a small Python or Node runner, one process per piece. VERIFIED (README run recipe, local binary).
- Recommendation: **adopt** (it is already adopted).

**H. Optional: a `bpy` module build via pip (`bpy` wheel)**
- UNVERIFIED: I did not research the current wheel's 5.2 availability. Benefit would be running without the app bundle; risk is a second Blender build that drifts from 5.2.2. **skip** unless CI without the macOS app is needed.

### 3.6 Version control for `.blend`

Principle (UNVERIFIED but widely held): generate `.blend` files from scripts and keep the scripts and specs in git; do not commit generated `.blend` or PNG at all, or commit them only via Git LFS.

**I. NodeSync** (extension)
- Source: https://extensions.blender.org/add-ons/nodesync/ VERIFIED (read).
- Matias-1; GPL-3.0-or-later; Blender 4.2 LTS and newer; permissions Files + Network (push/pull to a user-supplied Git remote); v1.3.4.
- Solves: version history and diff for geometry and shader node trees.
- Risk: medium. Network permission plus git push from inside Blender. Only useful if node trees become hand-authored assets.
- Recommendation: **skip** for now (our node trees are generated by script).

**J. Blender Git** (Superhive, paid)
- Source: https://superhivemarket.com/products/blender-git VERIFIED (read).
- $14.90; GPL-3.0-or-later; Blender 5.0 to 5.1 (so the page does not list 5.2; compatibility with 5.2.2 UNVERIFIED); needs Git LFS; runs git as a subprocess and offers a terminal button.
- Solves: commit/branch/merge from inside Blender with a plain-English change list of a `.blend`.
- Risk: medium (subprocess, paid, 5.2 not listed). Recommendation: **skip**; command-line git plus script-generated assets is simpler and already the project's workflow.

**K. Blender Git Manager** (listed as an extension; Git + LFS GUI)
- Source: search snippet only (https://superhivemarket.com/products/blender-git-manager). UNVERIFIED. **skip**.

**L. Git LFS itself** (not an add-on)
- Needed only if `.blend` or reference PNGs are committed. Project policy keeps heavy art in git-ignored `art-src/`, so no change. **trial** only if the owner wants shared `.blend` history.

## 4. Things not to do (cheap mistakes)

1. Do not run production renders from a profile that has add-ons enabled; always `--factory-startup` and enable explicitly.
2. Do not let any add-on write a Blender "Cycles/AgX/Filmic" look; set Standard and look None every run (the rig does).
3. Do not trust an add-on's pixelation or "outline" feature for palette art; they resample and add off-palette colours. Run the post audit on its output if ever used.
4. Do not install from a market zip you have not unzipped and read. Check `blender_manifest.toml` for `permissions` and any bundled `.dll/.so/.dylib/exe` (QuadWild-type tools ship binaries).
5. Do not install from the public Extensions repo inside the production profile: `sync` and `update` reach the network. Use `install-file` from a hashed local zip.
6. Do not copy GPL add-on code into the game repo without a licence decision.

## 5. Recommendation summary

| Item | Rating |
|---|---|
| Scripted CLI pipeline with audits and hash gates | **adopt** (already) |
| Blender MCP tools (inspection, docs search, thumbnails) | **adopt for inspection only** |
| Sprite Sheet Maker (GPL, none permissions, 5.1+) | **trial** for animation round only, throwaway profile |
| Git LFS | **trial** only if `.blend` history is wanted |
| In-house geometry-node group (if node scattering is ever needed) | **trial later** |
| Sequenced Bake, PAWS Bakery, Ucupaint | **skip** |
| Retopo / quad remesh set | **skip** |
| NodeSync, Blender Git, Blender Git Manager | **skip** |
| Commercial sprite tools (Sprite Maker, Blaterna, True Pixel Art) | **skip** |
| Second community Blender MCP | **skip** |
| `bpy` pip wheel | **skip** (unresearched) |

## 6. Open items for the other experts and the owner

1. What is "Lab tooling" in the brief? No official product found (UNVERIFIED).
2. Do we need animation (walk cycles) for this round? It decides whether the Sprite Sheet Maker trial is worth an hour.
3. EXPERT-NOTES s0.1 and s0.2 (R8a is smooth, about 2:1 and about 47-48 degrees) are not re-checked here; they stand on that file's own tags.
4. Not verified in this pass: extension CLI sub-flags, the extension licence page itself (read via search summary only), Ucupaint licence, all Superhive listings beyond Blender Git, and whether declared permissions are enforced at runtime.
5. Not opened: plan 19 and spec 14 (the task pointed to them; this note relies on the pilot notes' reading of them).

## 7. Sources

- Blender 5.0 Python API notes: https://developer.blender.org/docs/release_notes/5.0/python_api/ (read)
- Blender 5.2 Python API notes: https://developer.blender.org/docs/release_notes/5.2/python_api/ (read)
- Sprite Sheet Maker: https://extensions.blender.org/add-ons/sprite-sheet-maker/ (read)
- Sequenced Bake: https://extensions.blender.org/add-ons/sequenced-bake/ (read)
- PAWS: Bakery: https://extensions.blender.org/add-ons/paws-bakery/ (read)
- NodeSync: https://extensions.blender.org/add-ons/nodesync/ (read)
- Bake tag listing: https://extensions.blender.org/tag/bake/ (read)
- Blender Git: https://superhivemarket.com/products/blender-git (read)
- Extension licences: https://docs.Blender.org/manual/en/dev/extensions/licenses.html (search summary only)
- macOS background Metal issue: https://projects.blender.org/blender/blender/issues/114326 (snippet only)
- Community Blender MCP: https://glama.ai/mcp/servers/gfyqfxqny2 (snippet only)
