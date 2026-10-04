# Blender panel, expert 4: lighting, materials and render look (bd1971)

Date 2026-10-04. Blender 5.2.2 LTS headless on this Mac. Advice and measurements only: no pilot file was edited.
Tags: **[V]** VERIFIED (I ran it), **[U]** UNVERIFIED (estimate, or read but not run).
Scratch scripts (session scratchpad, not kept): `r8a_stats.py`, `look_test.py`, `match_metrics.py`, `post_tests.py`, `diag.py`, `crown.py`. Key code is quoted below.

## 0. Summary

1. The owner's lighting score of 2 comes from two things the pilot cannot do today: it has hard facet banding (4 tones per colour, 39 colours in the whole scene [V]) where R8a has continuous soft shading, and it has no contact shadow or occlusion at all. R8a has both, gently.
2. R8a is flat-lit from above-front: a crown's left and right halves differ by 4% and its bottom is about 36% darker than its top [V]. It is not a side-lit scene. The pilot's sun sits to the left, which is the wrong direction for this look.
3. Cheapest route to the look is **Cycles, CPU, 64 samples, sun straight over the camera axis, low world fill, then quantise to the palette** (0.3 s per 384x320 tile, 3.6 s at 4x supersample [V]). EEVEE is 3 to 10 times faster but its AO (fast GI) does nothing unless ray tracing is switched on [V].
4. Palette-exact is still possible with soft light: render soft, then snap to the nearest palette tone in OKLab. 1.0% of pixels moved more than 0.05 OKLab and SSIM stayed 0.996 [V].
5. Measure the match with five numbers (mean luma, luma spread, saturation, luma histogram overlap, hue histogram overlap) plus SSIM for same-layout pairs. Code in section 6.

## 1. What R8a's light and surfaces actually are (measured) [V]

Method: Blender's `bpy.data.images.load` plus numpy on `seedream-R8a.jpeg` (2304x1728), boxes picked by eye on the displayed image, values are the stored sRGB-encoded numbers (luma = Rec.709 weights on those). Boxes are about 100x60 px and can contain edges, so treat means as plus or minus 0.03.

| Region | mean sRGB | luma | p5 / p95 luma | notes |
|---|---|---|---|---|
| Background, top-left | #bfd582 | 0.794 | 0.785 / 0.802 | smooth lime, std 0.005 (not part of the sprite) |
| Tree crown (big left) | #57843d | 0.459 | 0.314 / 0.674 | hue 98, sat 0.53 |
| Tree crown (top) | #58853c | 0.463 | 0.323 / 0.637 | |
| Tree crown (right) | #4c7c32 | 0.424 | 0.326 / 0.549 | |
| Tea hill (left / right) | #5d7b21 / #526e0e | 0.431 / 0.380 | 0.21 / 0.67 | yellower and more saturated than crowns (hue 79, sat 0.73 to 0.87) |
| Grass tile | #577517 | 0.408 | 0.292 / 0.497 | |
| Plinth (dark green) | #566e28 | 0.392 | 0.277 / 0.500 | |
| Paddy | #2f4818 | 0.247 | 0.156 / 0.336 | darkest green |
| Brown thatch roof | #524137 | 0.266 | 0.193 / 0.339 | hue 21 |
| Tan roof | #c7ab7c | 0.680 | 0.559 / 0.769 | brightest large object |
| Orange roof | #b47f37 | 0.523 | 0.432 / 0.696 | |
| Rust granary wall / roof | #814e31 / #7e5242 | 0.339 / 0.354 | 0.24 / 0.44 | |
| Pond water | #5d7986 | 0.453 | 0.181 / 0.650 | slate blue, hue 199, sat 0.31 |
| Wood deck | #a79b94 | 0.615 | 0.416 / 0.686 | grey-brown, sat 0.12 |

Global facts [V]:
- Whole image mean luma 0.600 (the bright background dominates). Foreground only (segmented as "differs from the corner colour by more than 0.10"): mean luma **0.513**, p5 0.180, p95 0.759, std 0.187, mean saturation 0.534.
- Luma histogram of the foreground, 16 bins: peaks in bins 6 to 12 (0.375 to 0.8), nothing above 0.8 and almost nothing below 0.1. There are no pure blacks and no blown highlights.
- Saturation-weighted hue: 61% in the 60 to 90 degree bin (yellow-greens), 15% at 90 to 120 (greens), 12% at 30 to 60 (tan, orange), 6% at 0 to 30 (browns, rust), 5% at 180 to 210 (water). Nothing else.
- **Crown shading profile** (big crown, 8 horizontal bands, top to bottom): 0.567, 0.585, 0.531, 0.463, 0.414, 0.365, 0.375, 0.403. So bottom/top about **0.64** and the lowest band lifts slightly again (bounce light from the ground). Left half 0.449, right half 0.469: **left/right 0.96**, so the key light comes from above the camera axis, not from a side.
- **Edge softness:** mean luma gradient inside crowns 0.0068 per pixel versus 0.0177 for the whole image [V]. Crowns are smooth gradients with very few hard steps.
- The brown thatch (0.27) is the darkest large object; there is no deep shadow anywhere, p5 of the whole foreground is 0.18.
- UNVERIFIED: my "ground just under the plinth is 18% darker than far ground" number (ratio 0.82) used a box that probably touched the plinth, so I do not rely on it. By eye the contact shadows are small and soft, a few percent to 15% darker than the open ground, only within about 0.1 tile of an object.

Material read [U, by eye]: matte clay or plastic. Roughness around 0.8 to 1.0, almost no specular, slight sheen only on the crown balls. Roofs have fine texture that we will not reproduce at tile size.

## 2. Why the pilot scores low, in numbers [V]

Same segmentation on `pilot_scene_A_key.png` / `pilot_scene_B_key.png` against R8a:
- Mean luma 0.423 / 0.417 versus 0.513: the pilot is 0.09 too dark.
- Luma std 0.186 / 0.171 versus 0.187: contrast range is fine.
- Saturation 0.450 versus 0.534: slightly dull (greens too grey).
- Luma histogram overlap 0.68 / 0.72, hue histogram overlap 0.55 for both: the hue share is the weaker one (too little of the 60 to 90 degree yellow-green).
- Interior gradient 0.065 / 0.062 versus 0.023: **2.7 times harder edges inside surfaces**. This is the facet banding. Scene B (the "smooth" variant) only moved the gradient from 0.065 to 0.062, because the toon ramp re-creates steps.
- Unique colours 39 and 35 (R8a has 231,888).

So lighting is not a brightness problem, it is a gradient problem plus missing occlusion. Raising palette lightness by about 0.09 of luma and saturation by about 0.08 would help on top.

## 3. The recipe at game tile size

### 3.1 Shared setup [V]
Ortho camera 60/45 degrees as in the rig; `sensor_fit=HORIZONTAL`; ortho_scale = canvas_w * sqrt(2) / tile_px; `film_transparent=True`; `dither_intensity=0`; view transform Standard; look None. Colours go in as linear values from the palette hex (the helper `rgba(hex)` converts sRGB to linear).

Materials (non-toon), per object [V]:
```python
b = mat.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = linear_rgba
b.inputs["Roughness"].default_value = 0.9
b.inputs["Specular IOR Level"].default_value = 0.15      # near matte clay; the 5.x name, not "Specular"
```
Crowns, hills and the granary: `mesh.shade_smooth()` (polygon `use_smooth = True`); icosphere subdivisions 3 gives a clean clay ball [V]. Roofs, walls, slabs stay flat. `Mesh.use_auto_smooth` no longer exists, so do not use it.

### 3.2 Light rig that reproduces R8a's direction [V]
R8a is lit from above and slightly toward the camera, with a big fill. My best tested rig (config "a"):
```python
sun: energy 2.4 (1.6 x 1.5), angle 45 deg, elevation 70 deg, azimuth = camera azimuth (45 deg)   # rotation_euler = (radians(90-70), 0, radians(45))
world: Background, colour (0.62, 0.64, 0.60), strength 0.5     # neutral grey, never green
```
Measured on the crown of the test tree [V]:

| Rig | crown bottom/top | crown left/right |
|---|---|---|
| R8a target | 0.64 | 0.96 |
| Cycles, sun from the left (azimuth -35, elev 55, world 1.0) | 0.76 | 1.12 |
| Cycles, rig "a" above | **0.70** | **1.03** |
| Cycles, sun elev 80, world 0.35 (rig "b") | 0.70 | 1.10 |
| EEVEE soft, sun from the left | 0.85 | 1.11 |
| EEVEE toon (no shadows) | 0.86 | 0.99 |

Rig "a" gets to within 0.06 of the vertical falloff and 0.07 of left/right. Going lower in world strength or higher in elevation did not help further (rig "b") [V]. If more falloff is wanted, darken the crown's lower balls with a Geometry-based vertex colour or add a second, very wide, dim sun from below-front [U].

### 3.3 Option A, Cycles CPU (recommended for the final look) [V]
```python
r.engine = "CYCLES"; sc.cycles.device = "CPU"
sc.cycles.samples = 64; sc.cycles.max_bounces = 3
sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"
r.filter_size = 1.0
```
- Time: 0.33 s at 384x320, 0.17 s at 16 samples, 3.64 s at 1536x1280 (4x supersample) [V]. Seconds are for the whole piece with a 3x3 tile test scene.
- Gives true AO and bounce for free (grass bleeds green onto walls, shadow under the hut), the closest thing to "gentle ambient occlusion" [V by the darker crown bottom; contact shadow strength not measured].
- Cycles 4x supersample downsampled agrees with EEVEE 4x downsampled at SSIM 0.9957, so the two engines agree in structure; they differ in absolute tone (Cycles is darker: luma mean 0.372 versus 0.424 for EEVEE soft, so plan to lift exposure +0.4 EV or lighten the palette) [V].
- Whether OIDN really ran (the property accepted the value; I did not inspect a noise-free comparison): UNVERIFIED.
- Determinism: Cycles with a fixed seed is deterministic on one machine [U, not tested here]. Set `sc.cycles.seed = 0` and `use_animated_seed = False`.

### 3.4 Option B, EEVEE soft (fast, good enough for iteration) [V]
```python
r.engine = "BLENDER_EEVEE"; ev = sc.eevee
ev.taa_render_samples = 32; r.filter_size = 1.0
ev.use_shadows = True; ev.shadow_ray_count = 2; ev.shadow_step_count = 6
sun.angle = radians(40); sun.use_shadow = True          # soft shadow edge comes from light.angle in 5.x
ev.use_raytracing = True                                 # REQUIRED, see below
ev.ray_tracing_method = "SCREEN"
ev.use_fast_gi = True; ev.fast_gi_method = "AMBIENT_OCCLUSION_ONLY"; ev.fast_gi_distance = 0.5; ev.fast_gi_quality = 0.5
```
- **Trap:** with `use_raytracing=False`, switching `use_fast_gi` on or off gave a pixel-identical image (max difference 0.000) [V]. AO appears only with ray tracing on: it then changed 1,519 pixels by more than 0.02 and lowered the 5th-percentile luma from 0.313 to 0.286 [V]. Without it, soft shadows (sun angle 40) are the only occlusion; they changed 796 pixels [V].
- Time 0.2 s without ray tracing and 1.6 s with it at 384x320 [V]. `GLOBAL_ILLUMINATION` mode gave almost the same image as AO-only here (mean difference 0.0098 versus 0.0103) [V].
- Removed in 5.x: `use_soft_shadows`, `use_gtao`, `gtao_distance`, `use_bloom` [V by RNA listing].
- EEVEE contact shadows are weaker than Cycles' occlusion; crown bottom/top stays at 0.83 to 0.85 [V]. Use EEVEE to iterate on shapes and Cycles for the delivered look.

### 3.5 Option C, toon ramp (palette-exact in one step) [V]
Diffuse BSDF -> Shader to RGB -> Color Ramp (CONSTANT, 3 stops at 0.0, 0.35, 0.65 with tones 0.62, 0.80, 1.0 of the base) -> Emission.
- Bug to avoid: a default Color Ramp already has stops at 0 and 1. Move the existing second stop to 0.35 and add one at 0.65; adding two new stops leaves a white stop at 1.0 and the whole scene renders near-white [V, I hit it].
- With `taa_render_samples=1`, `filter_size=0`, shadows off: 16 colours, binary alpha, 0.1 s [V].
- With shadows on at 1 sample the shadow edges are grainy confetti [V]. With shadows on at 16 samples it is clean but gives 353 colours (edge blends), so quantise afterwards [V].
- Result is flat bands, so gradient stays high. This is the "toon ramps" answer: palette-exact, but it does not give R8a's smoothness. Use 5 or more ramp stops (0.55 to 1.0) to approximate a gradient if the owner prefers exactness over softness [U].

### 3.6 Palette-exact versus graded [V]
Two products from the same soft render:
1. **Graded** (no snap): ship as is after the colour fixes in 4.
2. **Palette-exact**: snap each pixel to the nearest colour in OKLab among `palette colour x tone factors (1.0, 0.8, 0.62)`.
   - Tested with 14 colours x 3 tones = 42 candidates: soft render -> 22 colours, 1.0% of pixels moved more than 0.05 OKLab, SSIM versus the unsnapped image 0.9962; toon with shadows -> 22 colours, 0.3% moved, SSIM 0.9994; Cycles -> 35 colours, 0.3% moved, SSIM 0.9981 [V].
   - This is a small change, so soft light followed by a snap keeps most of the softness as 3-tone steps. For finer gradients allow 5 tone factors per colour (more steps, still a locked list) [U].
   - Edges: snap only pixels with alpha at or above 0.5 and threshold alpha to binary afterwards, as the rig does.

## 4. Optional post-pass grading

### 4.1 Numpy (preferred: deterministic, no Blender state) [V]
Grade in the numpy step that already exists for thresholding alpha and keying: levels, saturation and hue shift on the opaque pixels. It is easy to unit-test and always gives identical results.

### 4.2 Compositor [V that it works, numbers below]
In 5.2 the compositor tree lives in `scene.compositing_node_group` (a `CompositorNodeTree`), not `scene.node_tree` (gone) [V]. Working pattern:
```python
ng = bpy.data.node_groups.new("grade", "CompositorNodeTree"); sc.compositing_node_group = ng
src = ng.nodes.new("CompositorNodeImage"); src.image = img          # outputs "Image", "Alpha"
hs = ng.nodes.new("CompositorNodeHueSat")                           # inputs Image, Hue, Saturation, Value, Factor
ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
go = ng.nodes.new("NodeGroupOutput"); ng.links.new(hs.outputs["Image"], go.inputs[0])
bpy.ops.render.render(write_still=True)                              # the compositor runs on the render
```
- Pass-through is bit-exact (mean abs difference 0.0000 versus the input) and the default `CompositorNodeColorBalance` is also a no-op [V].
- **Caution:** HueSat with Saturation 1.12 raised the foreground's mean HSV saturation from 0.555 to 0.733, far more than 12% [V], because it works in linear colour. Use values near 1.03 to 1.05 and check with the metrics in section 6.
- Compositor render of a 384x320 image takes about 0.3 s [V]. A node-based grade adds Blender state to an otherwise stateless pipeline, so I recommend it only for the owner's exploratory grading (Glare, Kuwahara paint-like smoothing and Color Balance are all in 5.2 [V by node list]).

### 4.3 Colour targets from section 1
Measured R8a means to pull the palette toward (the pilot's palette hexes are not known to me, so this is a target list):
- Crown #57843d, tea hill #5d7b21 (yellower), grass #577517, plinth #566e28, paddy #2f4818.
- Roofs: dark thatch #524137, tan #c7ab7c, orange #b47f37; rust #7e5242 to #814e31; water #5d7986; deck #a79b94.
- Tone steps: use a top face at 1.0 of the base, a lower side at about 0.65 to 0.70 (R8a crown bottom/top 0.64).

## 5. Tile-size notes
- Render at 4x and box-downsample, or render at 1x with `filter_size=1.0`. Downsampled 4x versus native 1x EEVEE: SSIM 0.9886, mean absolute difference 0.0010 [V]. The cost is small (0.26 s EEVEE) and the result has proper edge anti-aliasing. For `pixel` mode where AA must be off, use 1x with `filter_size=0` and the toon ramp.
- Detail below 2 px is lost at tile size. Keep the soft look to large surfaces: crowns, hills, roofs, walls. R8a's thatch texture, leaves and grass blades cannot survive at 64 px per tile.
- AO distance should be about 0.1 to 0.2 of a tile so shadows stay within 6 to 12 px at W=64 [U]. `fast_gi_distance = 0.5` is in metres (tile = 1 m) and was a bit wide in my test.

## 6. Automatic match measurement [V]
Run inside Blender's Python (system Python has no numpy or PIL). Functions I wrote and ran (`match_metrics.py`):
- `load(path)` returns float RGBA from `bpy.data.images` (stored sRGB-encoded values).
- `foreground(a)`: alpha >= 0.5 if there is transparency, else pixels farther than 0.10 (max channel) from the median corner colour. Works for the pilot's key-green PNGs; for R8a's drifting lime background it is approximate (70% foreground, which includes some ground glow) [V].
- `profile(a, mask)`: mean/p5/p95/std of luma, mean saturation, mean luma gradient over the eroded interior, 16-bin luma histogram, 12-bin saturation-weighted hue histogram, unique colours.
- `compare(ref, cand)`: differences of the above plus histogram intersections (1.0 = identical).
- `ssim(x, y)`: uniform 7x7 window, standard constants, luma only (numpy sliding windows; fine up to about 1500x1300).
- `grid_luma(a, mask, (4, 4))`: mean luma per cell over the foreground bounding box, for region-by-region comparison [written, not exercised beyond import].

Pass thresholds I propose [U]:

| Metric | Target vs R8a | Notes |
|---|---|---|
| Mean luma delta | within 0.04 | pilot now: -0.09 |
| Luma std delta | within 0.03 | pilot ok |
| Saturation delta | within 0.05 | pilot -0.08 |
| Luma histogram overlap | at least 0.80 | pilot 0.68 to 0.72 |
| Hue histogram overlap | at least 0.80 | pilot 0.55 |
| Interior gradient ratio | at most 1.5x R8a | pilot 2.7x |
| Crown bottom/top | 0.64 plus or minus 0.08 | rig "a" 0.70 |
| Crown left/right | 0.96 plus or minus 0.06 | rig "a" 1.03 |

Important limits:
- **SSIM against R8a is meaningless for the whole picture**: R8a is a different layout (different object positions, a lime background, a perspective camera). I only use SSIM for same-layout pairs: engine versus engine (EEVEE soft versus Cycles 0.9914, versus EEVEE no shadow 0.9976, versus toon 0.9739 [V]), supersampling checks, and before/after of a snap or grade. To use SSIM against R8a, first build a pilot render with R8a's layout, or compare cropped single objects (a lone tree, a lone roof) at matched scale [U].
- Segmentation of R8a is rough (jpeg, lime halo); run it on crops of single objects for decisions and keep whole-image numbers for trend.
- The five numbers are what the owner's "lighting 2 / overall 2 to 3" can be tracked with between rounds. Log them in `report.json` per run.

## 7. Recommended next steps (in order)
1. Change the sun to camera-aligned (azimuth equal to the camera azimuth, elevation about 70) and the world to about 0.5 grey. This alone moves left/right from 1.12 to 1.03 [V].
2. Make Cycles the review-picture engine (64 samples, OIDN, seed fixed); keep EEVEE toon for exact-palette sprites only if the owner prefers it.
3. Add the OKLab snap as the last step for palette-exact output; report the moved-pixel percentage (fail above 2%).
4. Lift palette lightness and saturation by about 0.09 luma and 0.08 sat (section 2), then re-measure.
5. Add the metrics block to the pilot's `report.json` and gate a round on the section 6 thresholds.
