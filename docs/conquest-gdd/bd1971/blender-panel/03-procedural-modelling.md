# Blender panel, expert 3: procedural and geometry-node modelling

Date 2026-10-04. Blender 5.2.2 LTS headless. Tags: **VERIFIED** = I ran it today (scripts in the session scratchpad: `crowns.py`, `props.py`, `gn.py`; nothing in the pilot folder was touched). **UNVERIFIED** = advice or estimate.
Render rig for all tests: Workbench, STUDIO light, per-material colour, ortho 60/45 degrees, `sensor_fit=HORIZONTAL`, `ortho_scale = canvas_w*sqrt(2)/W`, AA off, dither 0 (same as the pilot rig, but STUDIO light so shading is soft; these test pictures are NOT palette-exact).

## 0. Verdict in five lines
1. The blocky crowns come from **20-face icospheres, flat normals, 3 to 4 balls** (pilot `build_tree`, DETAIL=1). Faceting is the cause, not the shape. VERIFIED by side-by-side render: the faceted reference reads as rocks; every smooth variant reads as a cloud.
2. Best recipes: **metaball** (about 1.4k faces) and **voxel-remesh of merged balls** (about 1.8k faces) read as R8a puffs; the **SDF smooth-union crown** (my own, 1280 faces at subdivisions 4) is the best budget/control trade because it needs no modifier and no depsgraph. All three are deterministic (same hash twice). VERIFIED.
3. A crown of 320 faces (icosphere subdivisions 3) is NOT enough: the silhouette shows corners. 1280 faces (subdivisions 4) is. VERIFIED by eye.
4. Geometry nodes run headless in 5.2 and are deterministic (two evaluations, identical hash). VERIFIED. Use them for instancing and noise only if wanted; plain bmesh is simpler and equally deterministic.
5. Tileable terrain: periodic hash noise gives seam error exactly 0.0. VERIFIED.

## 1. Face-count facts (5.2) VERIFIED
`bmesh.ops.create_icosphere(bm, subdivisions=n, radius=r, matrix=m)`: n=1 gives 20 faces, 2 gives 80, 3 gives 320, 4 gives 1280. (Older docs say n=1 is 80: wrong in 5.2.)
Measured crown budgets: pilot faceted 80 faces (4 x 20); SDF n=3 320; SDF n=4 1280; metaball 1310 to 1479; voxel remesh 1602 to 1856; tea hill grid 56x56 3136; tile grid 24x24 576; bamboo clump (9 culms) 1143.
The pilot budget "crown 20 to 80 faces" (check `crown_faces_20_to_80`) must be changed for a puffy look: propose crown 300 to 1500 faces, forest tile under about 8k faces. Workbench renders a 3.1k-face hill in well under 0.2 s for the whole 9-object scene (0.13 s total). VERIFIED. Face count is not a speed issue for sprites; it is a "reads as soft" issue.

## 2. Puffy crowns: four recipes (tested, rendered)
Common: smooth-shade the crown only (`me.shade_smooth()`); put 5 to 9 lobes (radii 0.42R to 0.62R, ring at 0.72R, 3 raised lobes at 0.5R, one centre lobe), keep width at least 1.1x height, squash z by 0.85.

### 2a. SDF smooth-union radial crown (recommended) VERIFIED
No modifier, no random calls, no Blender noise. Take an icosphere, move every vertex along its own direction to the surface of a smooth union of spheres (bisection, 26 steps).
```python
def smin(a, b, k):                       # polynomial smooth min
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h*h*k*0.25
def field(p, L, k):                      # L = [(centre Vector, radius)]
    f = None
    for c, r in L:
        d = (p - c).length - r
        f = d if f is None else smin(f, d, k)
    return f
def crown(L, R, sub=4, k=0.07*0.3, squash=0.85):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized(); lo, hi = 0.0, 3*R
        for _ in range(26):
            mid = (lo+hi)/2
            if field(d*mid, L, k) < 0: lo = mid
            else: hi = mid
        v.co = d*lo; v.co.z *= squash
```
The blend radius `k` is the "puffiness dial": k = 0.35R gave a smooth dome with no lobes (too soft, reads as a hat); k = 0.10R and 0.07R keep the scalloped creases between lobes like R8a. Measured: crown width 0.69 m vs height 0.40 m at R=0.3 (ratio 1.7, passes the pilot's 1.1 rule). Time 0.02 s. Determinism: built twice, equal hash. Only the lobe positions use the seeded `random.Random`.
Rounding vertex coordinates to 6 decimals before `to_mesh` (as the pilot does) keeps hashes stable across machines.

### 2b. Metaball to mesh VERIFIED
```python
mb = bpy.data.metaballs.new("mb"); mb.resolution = 0.035; mb.threshold = 0.6
for c, r in L:
    e = mb.elements.new(); e.co = c; e.radius = r*1.5; e.stiffness = 2.0
ob = bpy.data.objects.new("mbo", mb); scene.collection.objects.link(ob)
bpy.context.view_layer.update()
me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
```
Works headless in 5.2. 1.3k to 1.5k faces. Looks like soft blobs with visible lobes (the most clay-like of the four). Caveat: `radius*1.5` was my fudge so the field is roughly the lobe size; tune by measuring width. Resolution 0.035 is world-units; finer = more faces. The mesh is an evaluated copy: unlink and remove the helper object afterwards.

### 2c. Voxel remesh of merged balls VERIFIED
Merge 7 to 10 icospheres (subdivisions 2) in one bmesh, add a `REMESH` modifier (`mode="VOXEL"`, `voxel_size=0.03`), evaluate with `new_from_object`. 1.6k to 1.9k faces, smooth, slightly more uniform than the metaball, and the lobes fuse into one skin. Changing `voxel_size` is the face-count control (0.03 gave about 1.8k). Possible follow-up UNVERIFIED: a Decimate modifier (collapse ratio about 0.5) to hit a budget; it can add jitter, so check the hash.

### 2d. Geometry nodes: icosphere + noise displacement VERIFIED (it builds and is deterministic; look not rendered)
Node tree built from Python: IcoSphere (r 0.3, subdivisions 4) with Set Position, Offset = Normal x (Noise(Position) - 0.5) x 0.12, then Set Shade Smooth. Result 1280 faces, max radius 0.337, two evaluations gave the same hash `373aac83ad`. Node ids in 5.2: `GeometryNodeMeshIcoSphere`, `GeometryNodeInputNormal`, `GeometryNodeInputPosition`, `ShaderNodeTexNoise`, `ShaderNodeVectorMath` (operation `SCALE`), `GeometryNodeSetPosition`, `GeometryNodeSetShadeSmooth`. Use `ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")`.
My judgement UNVERIFIED: noise displacement alone gives lumpy potato shapes, not R8a's distinct lobes with creases. Lobes (2a to 2c) beat noise. If GN is wanted, instance lobes with "Distribute Points on Face" is overkill for 4 trees per tile; the pilot's bmesh route is fine. Pilot audit note: audit node-group and node names (the forbidden-word list scans them).

### 2e. Why not subdivision surface on the old ball cluster UNVERIFIED
A Subsurf modifier on 4 separate icospheres only smooths each ball; creases between balls stay hard (they stay separate shells). It would still look better than flat, but 2a to 2c fuse the lobes, which is what R8a shows.

## 3. Rendering the soft look while staying palette-exact
The pilot's toon path (shadowless wide sun, three-tone constant ramp) is the right idea for puffs. Smooth normals on a 1280-face crown with only 3 tones will produce 3 curved bands, which reads as clay at 64 px (band edges follow the lobes). UNVERIFIED for the toon ramp on these new meshes; VERIFIED only that STUDIO smooth shading reads soft (picture: five trees, the four smooth ones look like clay clouds, the faceted one like rocks).
Recommendations:
- Keep two light tones per crown minimum plus a darker underside tone (the `down` factor 0.55 already does this): a puff needs a dark belly under each lobe cluster to read round. UNVERIFIED.
- Put the crown colour one step lighter than the trunk-side greens so lobes pop against the hill.
- Do not add outline passes; roundness comes from the three bands plus the silhouette scallops.

## 4. Reading as soft clay at 64 px tile width
All UNVERIFIED unless stated; the 64 px render (`crowns_W64.png`) was made, and at 64 px a crown is about 25 px wide.
- Lobe count: at most 5 to 7 visible lobes per crown. Each lobe must be at least 5 px across (about 0.11 m at 45 px/m horizontally). Creases thinner than 2 px vanish.
- Silhouette sampling is what makes it look clay-like: enforce at least about 1000 faces so the outline has no corners (VERIFIED: 320 faces showed corners at 200 px).
- Round every transition: bevel on structures (`BEVEL` modifier, width 0.02 to 0.03, 2 segments, `limit_method="ANGLE"`; VERIFIED it evaluates). With 2 segments the rounded edge is about 1 to 1.5 px at W=64, so use width at least 0.03 on anything you want the player to notice.
- Avoid tiny details: bamboo culm radius 0.018 m gave a line about 1.6 px wide in my test (VERIFIED, the render shows thin strings). Use radius at least 0.03 and cluster 5 to 7 culms.
- Shading must come from the bands, not texture: no noise textures, no image nodes (audit forbids them).

## 5. Tea-plantation hill with bush lines VERIFIED
Heightfield grid (56x56), superellipse radius s = (|2x|^4 + |2y|^4)^(1/4), `d = sqrt(1 - s^2)^0.9`, `z = h*d` plus a contour ridge `0.016*(0.5-0.5*cos(2*pi*rows*d))*min(1, 6d)`, with `s >= 1 -> z = 0`.
Measured: max z 0.330 (limit 0.35), edge z exactly 0.0 (so neighbouring tiles join), 3136 faces, deterministic. Render: a rounded clay "pillow" filling the tile with 7 concentric soft rows, which is close to R8a's ringed tea mounds. The rows are ridges (soft bands), not separate bushes, which cuts 10k faces of bush balls to 3k and avoids tiny specks. Colour each row alternately light/mid green by `d` band in the palette step (UNVERIFIED; use per-face material by row index). Place the tree on top as a separate object, which is how R8a does it.
Caveat: R8a hills are domes taller than 0.35; a taller hill must be a multi-tile prop, not a tile (spec limit).

## 6. Rice-paddy terraces PARTLY VERIFIED
Three stacked slabs (1.0x1.0, 0.82x0.72, 0.64x0.46; steps 0.05 high) with a `BEVEL` modifier (0.025, 2 segments). VERIFIED: 162 faces, renders as rounded stepped earth. UNVERIFIED: water inset (add a water-colour plane 0.005 above each slab's top, inset by the bund width 0.06, to read as flooded plots) and rice clumps (4-sided cones; keep each at least 2 px). For curved terraces follow 5: use the contour of the hill heightfield but quantise `d` with a smoothstep ("stair with rounded risers"), UNVERIFIED.

## 7. Thatch roofs PARTLY VERIFIED
Gable prism from 6 vertices (two slope quads, open ends), Solidify 0.05 plus Bevel 0.02, smooth shaded: 82 faces, VERIFIED to build and evaluate. It looks like a thick folded card; it lacks gable ends and a thatch edge. Improvements UNVERIFIED:
- Add two gable triangles in wall colour (or build the walls as a bevelled box) so it is not a tent.
- Make the roof soft: raise the eave line with a sag (move eave vertices down 0.03 at the corners), use a Subsurf (level 1) with edge creases at the ridge, bevel width 0.04. A fat rounded roof reads "thatch" at 64 px better than any detail.
- Colour variants by tone only (as the pilot does).

## 8. Bamboo VERIFIED (geometry), looks too thin
Lofted rings: 6-sided, 21 rings (3 per segment, every third ring bulges 1.45x as a node), taper to 65%, random lean up to 0.04 m. 9 culms = 1143 faces, deterministic. Render: culms are thin lines with visible nodes, only 2 clearly readable at 120 px per tile, so the radius and count must go up (section 4). Recipe for a "grove" tile: 6 to 8 culms of radius 0.03 to 0.04, heights 0.8 to 1.1, plus a low rounded leaf mass (2a with 3 lobes, flattened, 0.15R) at the top of each cluster instead of leaf cards. UNVERIFIED.

## 9. Boats and carts: crude, VERIFIED to build only
- Sampan: 9 cross-sections x 5 points lofted (bow and stern pinched with `(1-|t|^2.2)^0.6`, rise 0.07|t|^2.5), Solidify 0.012. 88 faces. In the picture it reads as a thin sliver because the hull is 0.2 wide and 0.1 high at a 60 degree tilt. Recipe changes UNVERIFIED: width 0.3, depth 0.12, add a bevelled thwart box and a rounded canopy (half cylinder, 0.15 high, thatch colour) so the silhouette reads "boat" at 64 px; sit it 0.01 below the water plane.
- Cart: bed box 0.34x0.22x0.04, two 14-sided wheel discs (radius 0.095, thickness 0.03, rotated 90 degrees about X), a shaft box. 252 faces with Bevel 0.008. Too small (about 12 px wide). Scale 1.6x and thicken wheels to 0.05.

## 10. Low-poly terrain that tiles seamlessly VERIFIED
Grid of 24x24 quads, height = periodic value noise: lattice values are `md5("i,j,seed")` (no `random`, no Blender noise), indices wrapped `% period`, evaluated at u in [0,1] so u=1 equals u=0.
Measured: seam max |dz| = 0.0 on both axes, 576 faces, two builds give the same hash. Amplitude 0.07 m (about 2.7 px at W=64): enough for soft undulation, not enough to break the diamond. Keep the border vertices of every non-flat tile identical, and for neighbouring tile TYPES (hill next to meadow) make the hill edge z = 0 (as in 5) and the meadow edge z = 0 too; otherwise forbid the pair. Tile type rule: a tile must be flat (z = 0) on the border or be periodic with itself.
To use hash noise across tile types, share the lattice seed so a meadow and a forest floor have equal border heights.

## 11. Determinism
VERIFIED: every builder above gave the same vertex hash on two runs in one process (hash of vertices at 5 decimals).
- Seed per piece: `random.Random(int(sha256(f"{piece}|{variant}").hexdigest()[:8], 16))`.
- No `mathutils.noise` (it has its own state and platform-dependent variants UNVERIFIED), no `set`/`dict` order dependence, `sorted()` iteration.
- Evaluated meshes (metaball, remesh, GN) are deterministic in one process; cross-machine hash identity UNVERIFIED, so compare rendered pixels (as the pilot does), not vertex hashes, in CI.
- Round vertex coordinates to 6 decimals before `to_mesh`.
- Pin `bpy.app.version_string` in `report.json`.

## 12. Face-count budget proposal UNVERIFIED (derived from measurements above)
| Piece | Faces |
|---|---|
| Crown (SDF n=4 or metaball) | 1200 to 1500 |
| Tree (crown + 8-side trunk) | under 1600 |
| Forest tile (4 trees, tufts) | under 7000 |
| Tea hill tile | about 3200 |
| Terrain/meadow tile | about 600 |
| Paddy tile (slabs + 12 rice clumps) | under 500 |
| Bamboo grove | under 1500 |
| Hut + thatch | under 600 |
| Boat / cart | under 300 |
Scene-level: tens of thousands of faces render in a fraction of a second in Workbench, so the budget protects the "soft at 64 px" quality and the review picture size, not speed.

## 13. What I did not do
No EEVEE toon-ramp render of the new crowns; no 64 px quantised palette check of the new meshes; no render of the GN crown; no paddy water/rice, thatch gables, or boat redesign (listed as UNVERIFIED recipe changes). The seeded 5-picture crown strip (`crowns_W400.png`) and the 9-object prop strip (`props.png`) are in the scratchpad if the owner wants to see them.
