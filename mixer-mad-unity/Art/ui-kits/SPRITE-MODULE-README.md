# Mixer Mad sprite module (drop-in)

Built by `tools/build_sprites.py` from the passed raw images. Do not edit by hand: re-run the script
(`python3 -I contract/full-pack/tools/build_sprites.py`). Pending assets and audit failures are listed in
`assets.json` -> `pending` and in the script's console report.

## Files
| File | What |
|---|---|
| `images/<id>.webp` | one trimmed sprite per id, 128 px per metre, 2 px transparent pad, WebP q90 + lossless alpha |
| `assets.json` | manifest: per id file, world size, `rect_m`, `pivot`, colliders, wheels, pins, audit |
| `sprites.js` | loader: `window.MM_SPRITES` (load, draw, drawWorld, drawUI, has, meta, colliders, wheels, debug) |
| `sprites.embedded.js` | the manifest plus every image as a base64 data URI, for the single-file HTML (no fetch, works from file://) |

## Drop in (single-file HTML, offline)
1. Paste the contents of `sprites.js` and then `sprites.embedded.js` into two `<script>` blocks before the game script.
2. Before the first frame: `MM_SPRITES.load({onProgress:(d,t)=>...}).then(start)`. It never rejects; a missing or
   undecodable image just makes `MM_SPRITES.has(id)` false, so keep the code-art branch: `if(!MM_SPRITES.drawWorld(ctx,'mixer_skin1',x,y,ang,{flip})) drawCodeArt();`
3. v7a draws in a Y-up world transform (`ctx.scale(S,-S)`): use `drawWorld(ctx,id,x,y,angle,{flip,sx,sy,alpha})`, metres.
   For a normal Y-down px context use `draw(ctx,id,x,y,angle,pxPerM,opts)`. Angle = physics angle, CCW positive.
4. Wheels: `drawWorld(ctx,'wheel_yellow',wx,wy,wheelAng)` (origin = hub centre). **Draw wheels BEFORE the body**: the art arches are
   smaller than the 1.0 m wheel (arch hole r 0.30-0.38 m, wheel r 0.50), the body covers the top of the tyre.
5. UI: `drawUI(ctx,'ui1_rubber_gas',cx,cy,widthPx)`. The touch rectangle stays fixed in code.

## Debug overlay hook
`MM_SPRITES.toggleDebug()` (bind to key H / `?debug=1` / 3-finger tap). While on, every `draw`/`drawWorld` call also draws the
asset colliders (green), the origin (yellow cross), wheel circles r 0.5 (cyan), pins (magenta) and the art rect (dashed).
 the colliders in physics
read `MM_SPRITES.colliders(id)`: `{type:'poly',pts:[[x,y]..],name}`, `{type:'circle',c,r}`, `{type:'capsule',a,b,r}`, in metres from the origin, x forward.

## Conventions (assets.json)
- All metres, x forward (right), y up. `rect_m = [x0,y0,x1,y1]` of the whole PNG relative to the origin. `pivot` = the origin measured
  from the image bottom-left. `pivot_grid_0p05` is the 0.05 m grid value with `pivot_snap_err_m` (the art is not moved to fit the grid).
- Truck-like bodies: origin = bottom centre of the chassis (midpoint of the flat bottom span). Wheels, pipe, drum: the centre. Props:
  bottom centre. Parts (dump bed, boom, stick, bucket, crane boom): the pivot pin (measured navy cap). `pins` lists every cap found.
- `wheels[]` = wheel centres measured from the arch fits (x, y from origin). They are NOT the old BODY table values (see below).
- `audit.pass` false = collider is more than 0.04 m inside the art or 0.06 m past it. `status: needs_review` = do not ship as an exact solid.

## Colliders: up to 6 convex parts per body (physics must accept this)
M chose exact hitboxes with more parts. Each body's `colliders` is a set of 1 to 6 convex polygons (max 8 points each), found by a
convex decomposition of the silhouette (cuts at the deepest concavity on any side, then merging parts that still pass). They are all
rigid on the same body, in the same frame as the sprite origin. Declared gaps (`audit.declared_gaps`: wheel arches, and the open space
under them) are exempt from the 0.06 m "beyond the art" rule because the wheel circles live there. Audit limits: art <= 0.04 m outside
the union, collider <= 0.06 m beyond the art.

## Adding assets (no code edits)
Add the raw PNG to `fit-test/raw/` or `full-pack/raw/`, add an entry under its file stem in `tools/sprite_specs.json`
(fields are listed in its `_doc`), mark it PASS in `LEDGER.md`, then run `python3 -I tools/build_sprites.py`. Backgrounds
(`kind: background`) are resized, graded (40% desaturate, 25% haze, 1 px blur) and written as lossy WebP.
