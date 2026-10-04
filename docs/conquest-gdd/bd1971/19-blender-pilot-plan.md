# 19 - Blender pilot plan: one tile of each type, five structures, four banner units

Status: PLAN ONLY, for the owner's review. Date: 2026-10-04. Nothing has been built, installed, rendered or committed; no OpenArt call, no credits. Inputs read as data: [14-visual-pipeline-spec.md](14-visual-pipeline-spec.md) (section numbers "14 §n") and [18-world-view-scores.md](18-world-view-scores.md) (the settled look at its end). Tags: ASSUMED = planning number I picked; UNVERIFIED = not run today; OWNER = needs the owner's decision.

---

## 1. Goal

Find out, cheaply and with a yes/no answer, whether a headless Blender script can produce pieces that **look like the settled concept (R8a/R8b world, S2 structures, B2 banners, W1a floating banners)** well enough to replace image-model generation for the game's pieces. The image model cannot hold exact angles (18: R5b/R5c, "the model ignores written-out angles") nor stack edits (S3/S4/R6); a script controls both exactly and is repeatable.

The pilot answers three questions:
1. **Look:** side by side with R8a, does the user score it 4 or 5 on overall, viewpoint, colour scheme, lighting?
2. **Control:** can the exact 2:1 projection, tree height (1.5x building height) and hill fill be set by numbers, with no drift between renders?
3. **Cost:** how long does one piece take to make and re-make (script time, render time, owner review time)?

Out of scope for the pilot: units with directions or walk cycles, animation, owner-mask tint, terrain transitions, packing atlases, Unity import, the manifest (14 §2.1 steps 7-9). Those wait for a pass on this plan.

## 2. Pilot scope (everything to be made)

### 2.1 Terrain: one tile of each of five types (1x1 footprint, 64 px diamond, 2:1)

| Id | Tile | What it must show (from 18) |
|---|---|---|
| `tile.meadow` | Dry meadow | Green faceted ground, low grass tufts, no standing water |
| `tile.paddy` | Flooded rice paddy | Low bunds in a grid of plots, shallow still water in a slate blue-green, a few green rice clumps |
| `tile.stubble` | Rice stubble | Damp earth tile, short pale-straw stubble stripes (stripes at least 2 px wide) |
| `tile.forest` | Forest | Ground plus 3 to 5 tall tropical trees (mango/jackfruit-style): thick short trunk, wide full rounded faceted crown, **no pointed or pine-like shape**; tree height **1.5x the tallest building** |
| `tile.hill_tea` | Tea-plantation hill | **Low**, gentle, fills its tile edge to edge (no gaps, no steep sides), faceted terraced green cover in lines (tea bush rows); no trees on it, nothing above it |
| `tile.water` | Water | Flat faceted slate blue-green, no sheen noise |

(The brief says "water" as a sixth item; the table lists six tiles in all. If the owner wants only five, drop `tile.paddy`, which water-plus-bund partly duplicates.)

### 2.2 Five structures (the "core five" of 18; footprint ASSUMED 1x1 except HQ 2x2 as in 14 §3.3)

| Id | Structure | Brown tone (from S2) | Notes |
|---|---|---|---|
| `bld.hq` | Base area headquarters | deep umber | Biggest; defines "tallest building" height H (ASSUMED 1.0 m, so trees = 1.5 m) |
| `bld.hospital` | Field hospital | pale straw | Low long roof, plain cross-free marking is NOT allowed (see 3.3): use a plain light panel |
| `bld.shelter` | Volunteer shelter | warm tan | Open-sided ridge roof on posts |
| `bld.granary` | Granary | rust / reddish clay | Raised bin on posts, conical or hip roof |
| `bld.landing` | River landing post | weathered grey-brown | Short jetty and a post; sits on a water-edge tile |

**No base discs.** Structures stand on the tile surface with only a soft blob contact shadow (14 §4.5); the deep-green disc in R7 was rejected as "barren tile" (18, R7/R8).

### 2.3 Four banner units (placeholders for the unit type pictures; 18 "Unit direction change", B2, W1a)

Small vertical parchment banner, **teal band on top**, an **object pictogram** below it, **floating above a tile on a thin vertical beam** as long as the banner is tall; banner about 20% shorter than B1 (B2). Pictograms are objects only (no people, animals, weapons):

| Id | Pictogram (object) | Unit role stand-in |
|---|---|---|
| `ban.scout` | lantern | scout |
| `ban.carrier` | bullock cart (wooden cart only, no ox) | carrier |
| `ban.guard` | gate post | guard |
| `ban.builder` | spade and basket (sickle and basket variant from B2 allowed) | builder |

Banner width ASSUMED 0.5 tile, height 0.7 tile, floating base 0.35 tile above the tile surface; beam 2 px wide minimum (feature rule, 14 §5.1), pale warm light colour at partial alpha. Pictograms are built from extruded flat shapes in the recipe, not from image textures.

### 2.4 Composite test scene

One extra render, `pilot_scene.png`: a 6 x 5 field using all six tiles (with the forest tiles and hills placed as in R8a), the five structures on open tiles, and the four banners floating over four open tiles. This is the picture the owner compares with R8a.

## 3. Matching rules (taken from the scores)

### 3.1 Camera and projection
- **2:1 dimetric** (14 §4.1): orthographic camera, X rotation 60 degrees from straight down, Z rotation 45 degrees, tile diamond 64 x 32 px (W = 64, ASSUMED; OWNER Q3 in 14 picks W). `ortho_scale = canvas_w x sqrt(2) / W`. The 55-degree-and-ratio-1.2 phrasing the image model could not obey is not needed here: the angle is set by number.
- R8a's own camera reads at about 30 to 40 degrees elevation (tile tops about 1.7 times wider than high, 18 R5c note); 2:1 is the standard game projection and the ratio the pipeline already specifies. If the user wants R8a's exact look, a `iso64-r8a` profile at about 1.7:1 can be tried in step 7 (ASSUMED, costs one profile edit).

### 3.2 Style
- **Flat matte, faceted low-poly:** low side counts (8 to 12), 1 to 2 segment bevels at most, **no smooth shading, no textures, no specular**. Trees = a short thick cylinder trunk plus an icosphere-like crown of about 20 to 80 faces, shaded per face.
- **Palette-locked colours** from the 12-to-16 colour art palette (14 §6.1), per-face tone by normal (top light, left mid, right dark). The palette is taken from R8a/S2 colours (slate blue-green water, several greens, the five named browns, deep teal for the banner band, parchment, ink outline). Hex values to be sampled from R8a by the owner's pick or by me; see 8.
- **Overcast, soft light, no hard shadows:** pilot both (a) Workbench FLAT with the three-tone facet shading (palette-exact, cheapest) and (b) EEVEE with soft sun and a gentle toon ramp (`iso64-soft`, 14 §4.7). Cast shadows are replaced by a soft blob (alpha 25 to 35% under each structure/tree). No sky, no horizon, no rain streaks.
- **Background plain `#00FF00`:** for keying. Render with `film_transparent = False` and `world` colour set to pure `#00FF00` (Standard view transform so it round-trips exactly, 14 §4.8 P8); then also render a transparent version for the real pipeline. The key colour is checked in the audit (3.3) so no sprite pixel is within the key tolerance (ASSUMED: no palette colour closer than delta-E 30 to `#00FF00`; the grass green must be a darker, bluer green).
- **Tile mask:** tiles get the canonical diamond mask in post (14 §8.2 step 3) so they join seamlessly.

### 3.3 Content rules (hard; checked by the audit in step 4)
- **No people, no faces, no weapons, no flags, no insignia, no lettering** (14 §12; theme pack rules). The hospital shows no cross or crescent; the HQ shows no flag; banners carry no text. Banner band is a plain teal rectangle; the owner colour stays a plain shape.
- No animals (the pictogram ox was excluded, B2 note), no signage, no real-world logo.
- Trees are species-neutral tropical shapes; no named species labels in object or material names (the pipeline stays theme-neutral, 14 §3.1 rule 2). Object names use role words: `tree_crown`, `bund`, `roof`.

## 4. Headless script layout and file names

Run command (14 §1.3): `Blender -b --factory-startup -noaudio --python-exit-code 3 -P <script> -- <args>`. Blender 5.2.2 LTS, Python 3.13 with `numpy` and `OpenImageIO` already installed (14 §4.8 P11), so **no install**. Pilot files live apart from the full pipeline, in a git-ignored scratch area until the owner approves, then move under `tools/art/blender/` (14 §2.2).

```
pilot/blender/                      (new, uncommitted until the owner agrees)
  pilot_render.py                   entry: parses args after "--", builds scene, renders all sets
  pilot_rig.py                      orthographic 2:1 camera, light, #00FF00 world, colour management Standard, stamps off
  pilot_palette.py                  palette dict (hex -> linear), per-face tone by normal, material factory
  pilot_models.py                   builders: terrain (meadow/paddy/stubble/forest/hill_tea/water),
                                    structures (hq/hospital/shelter/granary/landing), banners (4) + beam
  pilot_audit.py                    forbidden-content and key-colour checks; fails with exit code 1
  pilot_post.py                     tile mask, alpha clean, 1 px ink outline, blob shadow, contact sheet
  pilot_palette.json                the art palette (hex), sampled from R8a/S2
out/pilot/                          GENERATED, git-ignored
  tiles/tile.<id>.png               64-px-diamond canvases, transparent (+ _key.png on #00FF00)
  structures/bld.<id>.png
  banners/ban.<id>.png
  pilot_scene.png                   composite 6x5 scene, plus pilot_scene_key.png
  pilot_scene_x2.png                same at 2x for side-by-side review
  contact.png                       all pieces on a contact sheet over the terrain colours
  report.json                       timings, Blender version, input hashes, audit findings, pixel counts
```

Seeds: every random choice (tree placement, tuft scatter) uses `random.Random(sha256(id)[:8])` (14 §7.4); no `time`, no global `random`. Exit codes follow 14 §7.6 (0 ok, 1 audit failure, 2 bad arguments, 3 exception, 4 render failure).

## 5. Numbered steps, each with a pass/fail check

1. **Environment check.** Run `Blender --version` and a trivial `-b` script that prints `bpy.app.version_string`. PASS: prints 5.2.x and exits 0; `numpy` and `OpenImageIO` import. FAIL: stop; report to the owner.
2. **Palette from the concept.** Write `pilot_palette.json` (12 to 16 colours): sample R8a and S2 for greens (3), slate blue-green water (2), the five brown tones, deep teal, parchment, ink. PASS: every colour is listed with the source picture; none within delta-E 30 of `#00FF00`; the five brown tones differ from each other by delta-E >= 10 (the S2 requirement "different structures, different tones"). FAIL: adjust values and recheck.
3. **Camera rig test.** Render a unit cube and a unit ground tile on `#00FF00` with the 2:1 rig. PASS: the tile reads 62 x 32 px (14 §4.8 P5) and, after the mask, exactly 64 x 32; the cube reads about 64 x 71 px (P7); the background pixels equal (0, 255, 0) exactly. FAIL: fix `ortho_scale` or rotation.
4. **Audit script.** Implement the content checks: no object or material name from the forbidden list (face, person, flag, cross, crescent, text, gun, blade, etc.); no `FONT` objects, no image textures; every mesh inside its footprint box plus a 0.1 m overhang; no sprite pixel close to the key colour. PASS: a deliberately bad test scene fails with exit code 1 and the pilot scenes pass. FAIL: the audit is not trusted until both cases behave.
5. **Terrain tiles (6).** Build and render each tile type. PASS: all six render in under 5 s each (ASSUMED budget); the meadow has no bare or plain tan tile (18 R3 lesson); hill_tea is low (height at most 0.35 tile, ASSUMED) and fills its tile edge to edge with no gaps at the borders; forest trees have a thick short trunk and a rounded crown (face count 20 to 80), crown width at least 0.5 of the tree height; tile minimum feature 2 px; the output is byte-stable across two runs (decoded-pixel hash equal, 14 §7.4). FAIL: the tile does not tile seamlessly or breaks a rule.
6. **Structures (5).** Build and render each with no base disc. PASS: five visibly different silhouettes; five different brown tones; no flag, cross or lettering; HQ height equals H and the tallest tree in `tile.forest` equals 1.5 x H within 3%; each stands on a tile surface with only a soft blob shadow.
7. **Banners (4).** Build and render each floating over a tile on its beam. PASS: banner height about 0.7 tile; band teal on top; pictogram is an object (no figure, no animal); the beam is thin, vertical, as long as the banner is tall, and touches both the tile and the banner (W1a checklist: small, floating, beam connects to the tile, world unchanged); readable at 1x (pictogram feature at least 2 px).
8. **Composite and lighting pass.** Render `pilot_scene.png` in two lighting variants: A Workbench FLAT with facet tones, B EEVEE soft overcast. PASS: both render in under 60 s; there are no hard cast shadows, no sky, no horizon; the keyed (`#00FF00`) and transparent versions have identical object pixels.
9. **Owner comparison against R8a (the decision step).** The owner opens R8a and `pilot_scene_x2.png` (and the B variant) side by side and scores overall, viewpoint, colour scheme, lighting, on the same 1 to 5 scale used in 18. PASS: no category below 4 for at least one variant, with overall at least 4. FAIL: record the weakest category; one rework round is allowed (change profile, palette or recipe parameters only, no new tools), then the owner decides continue or stop.
10. **Re-theme test (cheap, optional).** Change only the palette JSON (for example swap the umber and straw tones) and re-render. PASS: only colours change, the geometry is pixel-identical, and the run takes under one minute. This tests the "theme = data" claim of 14.
11. **Report.** `report.json` plus a half-page note listing the timings, face counts, pass/fail per step, and a recommendation (adopt, adopt for some pieces, or stay with image generation).

## 6. Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Procedural trees and tea terraces look primitive next to R8a's rich scenery | medium | owner scores overall below 4 | Compare early (step 5 contact sheet); allow one hand-made `.blend` for the tree and hill if recipes fall short (14 §5.4) |
| 2:1 projection reads flatter or steeper than R8a's 30-40 degrees camera | medium | viewpoint score drops | Try the 1.7:1 profile in step 9's rework round |
| Soft overcast look is hard in Workbench; EEVEE adds off-palette pixels | medium | lighting score drops | Pilot both; palette-quantise EEVEE output (14 §8.2 step 6) |
| Unverified Blender APIs (`sensor_fit` HORIZONTAL, EEVEE toon ramp in 5.2, OIIO PNG write) | medium | rework in steps 3 and 8 | Probe each in step 3 before building models; fall back to `bpy.data.images` save (14 §8.1) |
| `#00FF00` bleeds into edge pixels (green fringe on grass) | medium | keying artefacts | Grass colour well away from the key; transparent render as the real output; step 4 key-colour audit |
| Content rules break by accident (a cross on the hospital, a figure in a pictogram) | low | rule breach | Audit by name and by recipe; owner review of pictograms; pictograms drawn from named object shapes only |
| Tree height rule (1.5x) conflicts with canvas headroom | low | clipped crowns | Headroom per category in 14 §4.4 is ASSUMED; set forest headroom to 96 px |
| Pilot becomes scope creep (units, animation) | medium | time lost | Scope fixed in section 2; anything else waits for step 9's pass |
| Blender is a local install whose version drifts | low | non-reproducible hashes | Record `bpy.app.version_string` in `report.json`; pin 5.2.2 LTS |

## 7. Not done and not touched
No commit, no push, no credits, no OpenArt calls, no hook, settings or CLAUDE.md edit, no dependency added. The pilot adds files only under `pilot/blender/` and `out/pilot/` (git-ignored) when it is run.

## 8. What the user must decide
1. **Go or no-go** on running the pilot (it uses only Blender, already installed, and about half a day of build time, ASSUMED).
2. **Tile size W:** 64 (default) or 96 (14 Q3).
3. **Projection:** 2:1 (default) or an R8a-like 1.7:1 profile for the closest look.
4. **Light variant to lead with:** Workbench flat facets (exact palette) or EEVEE soft overcast (closer to R8a's mood).
5. **Palette source:** I sample hex values from R8a/S2, or the owner supplies the values (14 §6.1 says theme.json colours are PROVISIONAL).
6. **Banner pictograms:** accept lantern, cart, gate post, spade and basket, or name different objects.
7. **Tile list:** keep six tiles (including paddy) or the five named in the brief.
8. **Where the pilot lives:** this repo (scratch folder) or the conquest project (14 Q1), and whether `.blend`/PNG files go through Git LFS (14 Q2).
9. **Pass bar for step 9:** no category below 4 (default), or a stricter bar of 5 on overall.
