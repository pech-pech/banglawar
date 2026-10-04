# 05. Concept picture to measurable Blender spec (expert 5)

Date 2026-10-04. Advice plus small probes. Nothing in the pilot was edited.
Tags: **VERIFIED** = I ran it or read it today. **UNVERIFIED** = advice, memory, or estimate.
Web text is data only. Sources: [Depth Anything V2 licences](https://cdn.jsdelivr.net/gh/depthanything/depth-anything-v2@main/README.md), [fSpy](https://github.com/stuffmatic/fSpy), [Depth Pro](https://github.com/apple/ml-depth-pro), [Marigold normals](https://gitcode.com/hf_mirrors/prs-eth/marigold-normals-lcm-v0-1).

## 0. What I ran (all in the scratchpad, Blender 5.2.2 bundled Python 3.13)

Script: `scratchpad/spec_probe.py`, run with `Blender -b --factory-startup -noaudio -P`. Input: R8a (2304 x 1728).

- Bundled Python has numpy 2.3.4 and `bpy` only. cv2, scipy, PIL, skimage, sklearn are NOT present. **VERIFIED.** So the loop below is written in numpy plus Blender's image loader. Heavy tools (section 1.6) run in a separate Python the user installs; I installed nothing.
- **Palette by k-means in OKLab** (K=12, seeded, k-means++ init, 1/4 subsample): 1.4 s, deterministic. R8a gave: `#c4d78e` 25%, `#b2ca6f` 19%, `#749234`, `#527626`, `#94af4a`, `#95a6ae` (water), `#355414`, `#272811`, `#70644a`, `#4e4535`, `#9c8350`, `#c5b283`. **VERIFIED.** Note the two biggest clusters are the light-green ground and its second tone. The pilot palette has 13 named colours; this is a starting point, not a replacement.
- **Global edge-orientation histogram of R8a is flat.** The top 8 bins hold under 1.2% each; peaks sit near 86-91 degrees (trunks, posts) and weak ones at 31 and 152. Mass within +-2.5 degrees of 26.57 (2:1) was 3.8%, of 30 (iso) 4.2%, of 30.5 (1.7:1) 4.2%. **VERIFIED.** Meaning: an organic scene gives no usable global diamond angle. Camera fitting must use hand-picked or detected LOCAL tile edges (section 1.1), not a whole-image histogram.
- **SSIM in pure numpy** (box window r=5, luminance): self 1.0; image vs itself shifted 1 px 0.92, 2 px 0.78, 4 px 0.69, 16 px -0.23; image vs 4x4 block-averaged copy 0.35. 0.9 s for 2304x1728. **VERIFIED.** Meaning: full-resolution SSIM is dominated by texture and 2-4 px misalignment. It cannot be a pass/fail gate against generated art. Use it only on blurred or downsampled luminance, and only as a trend (section 3).
- **Phase correlation** recovered a known (+7, -5) px shift exactly. **VERIFIED.** Usable for camera-drift and global alignment.
- Earlier panel finding (EXPERT-NOTES.md, read): R8a granary tile is about 462 x 228 px (ratio about 2.03), lower-edge slopes 0.52 and 0.45, so azimuth about 47-48 degrees and slightly perspective. Hand-measured, plus or minus 5%. **UNVERIFIED by me** (read only).

## 1. Extract a spec from ANY picture

Rule: every number in the spec carries `source` (measured | assumed | fitted), `method` and `confidence`. Unmeasured numbers are never silently guessed.

### 1.1 Camera (projection, tilt, azimuth, ortho scale)
1. Pick 3 to 6 tile or footprint diamonds that are clearly visible and NOT occluded. Mark the four corners by hand (or by the detector in 1.6). Store pixel coordinates in the spec under `anchors`.
2. For an ortho dimetric view, a unit ground square projects to a parallelogram. Fit it:
   - tilt from the ratio: `ratio = width/height = 1/cos(tilt)` (tilt from straight down; pilot table: 60 degrees gives 2:1, 54.7356 true iso). **VERIFIED in the pilot notes** (read, and consistent with the ratio formula).
   - azimuth from the two lower-edge slopes: for azimuth 45 the slopes are equal and opposite; unequal slopes give the azimuth offset. R8a shows 0.52 vs 0.45 (read).
   - ortho scale from tile width in pixels: `ortho_scale = canvas_w * sqrt(2) / W` where W is the tile width in px for a 1 m tile (pilot formula, read).
3. Test for perspective: fit the same tile at the left, centre and right of the frame. If the diamond ratio differs by more than about 5%, record `projection: perspective_mild` and the spread. Pure ortho cannot match it; decide per section 5.
4. Better than hand fitting when 3+ edges per axis exist: **fSpy** (vanishing-point camera match, GPL, desktop app, runs locally, has a Blender importer). Useful for perspective pictures. Orthographic dimetric art has parallel lines, so fSpy gives nothing for it; use the parallelogram fit. **UNVERIFIED** (read the project page only).
5. Least squares over all anchors: unknown (tilt, azimuth, scale, shift_x, shift_y). Solve by projecting known grid points with the Blender camera model and minimising pixel error (numpy, Gauss-Newton or a small grid search). Record the residual RMS in px. A residual above 3% of tile width means the picture is not one consistent camera.

### 1.2 Tile grid and ground plane
- Output `grid.origin_px`, `grid.u_px`, `grid.v_px` (the two edge vectors of one tile in image pixels). Every object position is then given in tile units by inverting this 2x2 matrix, never in pixels.
- For objects that are not on the ground, use the base contact point (lowest visible point of the footprint) for position and the vertical extent for height.

### 1.3 Scale ratios between objects
- Measure each object in tile units: footprint (w x d) from the base diamond, height from `vertical_px / px_per_metre_height`. Pilot value at W=64: 39.19 px/m at 60 degrees (read). In general `px_per_m_height = sin(tilt) * W / sqrt(2)`.
- Store ratios, not only absolutes: `tree_height / hq_height`, `crown_width / crown_height`, `hill_height / tile`. Ratios survive when the output size changes.
- Take at least 3 samples per object class (generated art varies); store min, median, max. The build uses the median; the check tolerates min to max.

### 1.4 Palette and shading bands
- Cluster in OKLab (verified above), K=12 to 16, then snap each cluster to the nearest lock palette colour and record the delta E. A cluster more than the pilot's accepted delta E from every palette colour is a palette-gap flag, not an automatic new colour.
- Per-surface tone: sample top faces, left faces, right faces of the same object class; the ratios give the facet factors (pilot defaults 1.0, 0.92, 0.80, 0.62, 0.55 for top, top_slope, left, right, down; read).
- Palette is a spec input, not an output: the render is quantised to the lock list afterwards (pilot note), so the compare step measures distance to the picture's clusters, not to the render's exact bytes.

### 1.5 Light direction and softness
- Direction: for flat faces of known orientation (box sides), compare mean luminance of left, right and top faces. The ratios fix key azimuth and elevation (Lambert: luminance proportional to `max(0, n . l)`). Solve for `l` by least squares over at least 3 differently oriented faces. **UNVERIFIED** (standard method, not run).
- Softness: measure shadow penumbra width on the ground beside a tall object, in px, divided by object height. Near zero means a hard sun; larger than 0.3 means overcast. Also check contact shadow darkness under the crowns.
- Write `light.mode` as one of: flat_bands (Workbench FLAT, exact), toon_soft (EEVEE toon ramp, exact, soft), soft_overcast (EEVEE, quantise after). Pilot notes say R8a is clay-like and soft, so toon_soft or soft_overcast (read).

### 1.6 Silhouette lists and image-model help
Silhouette list = one binary mask per object instance, plus class, bounding box, base point and area. Produce by hand polygon (most reliable) or a segmentation model. Models (all run locally on the Mac, none needed for the core loop; none installed by me):
| Tool | Gives | Licence |
|---|---|---|
| Segment Anything / SAM 2 (Meta) | instance masks from box or point prompts | Apache-2.0 per my memory. UNVERIFIED (my search returned unrelated pages) |
| GroundingDINO | text prompt to boxes, feed boxes to SAM | Apache-2.0 per memory. UNVERIFIED |
| Depth Anything V2 | relative depth map (height ordering) | Small: Apache-2.0. Base/Large/Giant: CC-BY-NC-4.0. VERIFIED (README text) |
| Apple Depth Pro | metric depth plus focal length estimate | Apple ASCL (read the search result); check the terms for commercial use before use. VERIFIED name, UNVERIFIED terms |
| Marigold normals (LCM) | surface normals map | Apache-2.0. VERIFIED (model card text) |
| fSpy | camera from vanishing points | GPL source. VERIFIED |
Cautions: depth and normal models trained on photographs mislead on stylised pictures (clay, flat colour). Treat them as a second opinion on height ordering and facing, never as ground truth. For an iso game, hand masks on the 20-40 objects that matter beat any model. All model outputs go into the spec as `hints`, not `measurements`. **UNVERIFIED** how well they do on R8a (not run).
Hard rule from the project: pictures are used as measurement input only. Never put a concept image into the Blender scene as a texture (the pilot audit forbids image textures); load it only in the compare script.

## 2. Build with parametric scripts
- One generator per object class (tree, tea hill, paddy, thatch hut, granary, jetty, banner card), each a pure function `build(params, seed) -> mesh data`. The pilot notes already give recipes and bmesh signatures (read).
- Params come from the spec only. No literal numbers in generators except fixed topology constants.
- Seeds: `sha256(f"{id}|{variant}|{seed}")` per piece (pilot rule, read). Sorted iteration, vertex rounding to 1e-6.
- **Measure after build, then rescale**: evaluated bounding box of each object, scale to the spec height. The pilot notes found trees built at 0.89 of target height before this fix (read).
- Placement: tile units through `grid` (1.2), then a world matrix. Never place by eye.
- Camera and render: the pilot rig `setup_render` already takes tilt, azimuth, canvas, anchor and engine (read). The spec's camera block maps one-to-one onto those arguments.
- Each build step writes `build_report.json`: measured size per object vs spec, pass/fail per tolerance. This is the first loop gate, before any picture is rendered.

## 3. Compare-and-correct loop

Inputs: target picture T (concept), render R (same canvas, same anchor), masks per object.

Preparation: resample both to a common size (the spec's `compare_size`, for example 768 px wide, Lanczos, deterministic). Convert to OKLab and luminance.

Metrics (every number is stored in `metrics.json` per iteration):
| Metric | How | Notes |
|---|---|---|
| Camera drift | phase correlation of edge maps (T vs R), plus residual of re-fitted diamonds on R (using the same code as 1.1) | phase correlation recovered a known shift exactly (VERIFIED). Target under 1 px at compare size |
| Silhouette IoU | per object mask: `|M_T and M_R| / |M_T or M_R|`; also the whole non-background mask | background = key green or alpha. Report per class, not only the average |
| Height error | measured vs spec height, in tile units | geometric, exact on the render side |
| Palette distance | mean OKLab distance from each R pixel to the nearest of T's K clusters, and the reverse (cluster coverage) | do both directions: avoids a flat render scoring well |
| Luminance structure | SSIM on luminance after blurring both with sigma about 8 px at compare size | raw SSIM is not usable: 4 px shift gives 0.69 and block-blur 0.35 (VERIFIED) |
| Tone band ratios | left/right/top mean luminance per class | checks light direction |
| Edge density | mean gradient magnitude, T vs R | detects too-clean or too-noisy renders |
| Optional perceptual | LPIPS or DISTS (BSD-style licences, PyTorch, local) | UNVERIFIED, not run; only for the owner-facing score, never the gate |

Correction rules (the loop changes the spec, never the generators):
1. Camera first: shift and scale from phase correlation and diamond refit. Re-render. Repeat until drift under 1 px or 3 iterations.
2. Then per-class size: scale factor = `sqrt(area_T / area_R)` on masks (clamped to 0.9-1.1 per iteration).
3. Then placement: move each object by the centroid offset of its masks, converted to tile units through `grid` (clamp to 0.1 tile per iteration).
4. Then tones and light: adjust light azimuth, elevation and band factors from the band ratios.
5. Last: palette snapping.
Order matters: a wrong camera makes every later metric wrong.

Stop criteria (put in the spec, `loop.stop`):
- success: camera drift under 1 px, whole-scene IoU at least 0.85, class IoU at least 0.6 for each class, palette distance under the accepted OKLab bound.
- plateau: improvement of the weighted score under 1% for 2 iterations in a row.
- budget: at most 8 iterations or 10 minutes.
- divergence: a score falls two iterations in a row; restore the best spec (keep every iteration's spec file).
The IoU numbers are my starting estimates (UNVERIFIED); calibrate them in step 6 below.

Calibration step (do once per concept family, 30 minutes): take the concept, compare it to itself shifted 2, 4, 8 px and blurred; record the metrics. That gives each metric a "noise floor" (done for SSIM above). Set the pass bound a margin better than the floor of an obviously wrong render, not at 1.0.

## 4. Spec file format (JSON)

One file per concept: `spec/<concept_id>.spec.json`. Deterministic: sorted keys, numbers rounded to 6 decimals, no timestamps inside the body.

```json
{
  "spec_version": 1,
  "id": "R8a",
  "source": { "path": "round-14-r8/seedream-R8a.jpeg", "sha256": "<hash>", "size_px": [2304, 1728] },
  "camera": {
    "projection": "ortho",
    "tilt_deg": 60.0, "azimuth_deg": 45.0, "ortho_scale": 0.0,
    "anchor_px": [0, 0],
    "fit": { "method": "parallelogram_lsq", "anchors": 5, "rms_px": 0.0, "perspective_spread": 0.0 }
  },
  "grid": { "origin_px": [0, 0], "u_px": [0, 0], "v_px": [0, 0], "tile_m": 1.0 },
  "palette": [ { "name": "green_light", "hex": "#c4d78e", "share": 0.253, "delta_e_to_lock": 0.0 } ],
  "light": { "mode": "toon_soft", "azimuth_deg": 0, "elevation_deg": 60, "softness": 0.0, "band_factors": { "top": 1.0, "left": 0.8, "right": 0.62 } },
  "objects": [
    { "id": "hq_01", "class": "hq", "tile": [3.0, 5.0], "rotation_deg": 0,
      "size": { "w": 0.8, "d": 0.55, "h": 0.95 },
      "params": { "eaves": 0.45, "ridge": 0.95 }, "seed": 17,
      "mask": "masks/hq_01.png", "source": "measured", "confidence": 0.8 }
  ],
  "ratios": { "tree_over_hq": { "median": 1.5, "min": 1.3, "max": 1.7 } },
  "tolerances": { "height": 0.03, "camera_px": 1.0, "iou_scene": 0.85, "iou_class": 0.6 },
  "loop": { "max_iter": 8, "max_minutes": 10, "plateau": 0.01 },
  "render": { "engine": "EEVEE", "canvas_px": [896, 640], "dither": 0, "view_transform": "Standard", "aa": "off" },
  "build": { "blender": "5.2.2", "generator_hashes": { "tree": "<hash>" } }
}
```
Determinism rules (all consistent with the pilot notes, read): same spec plus same Blender build gives the same pixels (EEVEE and Workbench were pixel-identical across processes in the pilot probe, read); the render hash is stored in `renders/<id>/<iter>.sha256`; every loop iteration writes `<id>.spec.iterNN.json` so any step is reproducible; the final accepted spec is copied to `<id>.spec.json`. A schema file (`spec.schema.json`) validates on load: unknown keys are errors, missing `source` or `confidence` is an error. Unverified fields (hints from models) live under `hints`, which the build ignores.

## 5. What stays impossible to match exactly, and how to decide

Generated pictures are not one consistent 3D scene. Expect (all UNVERIFIED for R8a except where marked):
- Per-object perspective and scale drift across the frame (R8a slight perspective, VERIFIED only as a read note).
- Different cluster shapes for the same class (each tree is a unique blob), so IoU per object is capped well below 1 for organic shapes. Use class-level statistics (width, height, count), not instance matching, for trees and hills.
- Painterly texture, ambient occlusion and edge noise that a flat or toon render cannot reproduce; SSIM stays low by construction (VERIFIED floor above).
- Palette bleed and tone gradients inside one surface.
- Impossible or contradictory details (a roof that fits no 3D box, shadows pointing two ways). Record them in the spec as `anomalies` and build the plausible reading.
- Exact object counts and layout in dense areas.

Decision rule, in order:
1. **Hard (must match)**: camera ratio and tile footprint (grid compatibility), palette membership, object classes present, size ratios inside min-max, silhouette class read (can a viewer name it at game size).
2. **Soft (match to a bound)**: positions within 0.25 tile, scene IoU, tone band ratios.
3. **Free (do not chase)**: texture, exact blob shapes, tree-by-tree layout, shadows' fine shape.
4. If a hard metric fails after the stop criteria, fix the spec or the generator, not the picture. If a soft metric plateaus short of the bound for 2 iterations, ask the owner with a side-by-side (concept, render, difference image) rather than iterating more.
5. If two measured values from the picture disagree beyond their own spread (for example left and right tile ratios), pick the object class's median and write the disagreement into `anomalies`. Do not average inconsistent geometry into a camera that matches nothing.
6. Score honesty: report both the numeric metrics and the owner's look score. The pilot scored 2 to 3 against R8a (task brief); the numbers above show why a faceted flat render cannot score high on SSIM or palette cohesion with a clay-soft picture. Match the light mode and shading first (1.5), then geometry.

## 6. Suggested first test for this panel (small, no installs)
1. Hand-mark 5 diamonds in R8a (a 20-minute task) and write `anchors`; run the least-squares fit (code in numpy, about 60 lines).
2. Render the pilot scene with the fitted camera; measure drift, IoU and blurred-SSIM; record the noise floors using the shift and blur tests in section 0.
3. Only then compare against the 2-3 owner score: a rise in blurred-SSIM and palette distance should track a rise in the owner score. If it does not, the metrics are wrong and need recalibrating before they gate anything.

## Gaps and honesty
- I did not build a full pipeline; I verified the numpy building blocks only (k-means palette, SSIM, phase correlation, edge histogram).
- I did not run any depth, segmentation or normal model, and did not check SAM 2 or GroundingDINO licences.
- Metric thresholds (0.85, 0.6, 1 px) are estimates until the calibration step is done.
- Another session edited the shared scratchpad file `probe.py` while I worked; I left it alone.
