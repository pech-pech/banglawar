"""render_check.py - side-on still of the 3D mixer next to the locked 2D sprite, for the art-bible check.

Run on the Mac:   blender -b -P render_check.py -- [--skin 1..4] [--engine eevee|workbench|cycles] [--with-driver] [--res-ppm 250]
Check anywhere:   python3 render_check.py --dry-run     (software preview: no Blender needed; uses Pillow if present
                                                          to add the sprite panels)

Writes to ../renders/ (default):
  mixer_side_by_side_skinN.png   left = 3D truck (orthographic side camera at -Y, cab at the RIGHT), right = locked sprite,
                                 same scale (1 m = same pixels), sprite collider polygons drawn on both
  mixer_sprite_overlay_skinN.png the sprite laid 50% over the 3D truck at the same origin (silhouette check)
  mixer_render_check.json        the numeric fit (art outside collider, collider outside art, wheel radius, scale)
Dry-run files get the suffix _dry.

What the reviewer looks for (S1 pilot acceptance 1-3): same toys, now 3D; truck 4.6 m long, wheels r 0.50;
silhouette within 0.04 m outside / 0.06 m inside the collider.
"""
import math
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mm_common import *  # noqa
import mixer_truck as T

REF_DIR = os.path.join(ART, 'reference')
PANEL_W = 5.8                 # m between the two panel centres
Z0, Z1 = -0.55, 2.95          # vertical window (m)


def sprite_path(skin):
    return os.path.join(REF_DIR, 'mixer_skin%d.png' % skin)


def numeric_fit(lods_sil):
    o, i = T.fit_check(lods_sil)
    return {'art_outside_collider_m': round(o, 4), 'collider_outside_art_m': round(i, 4),
            'limits_m': [TOL_ART_OUT, TOL_COL_OUT], 'wheel_radius_m': WHEEL_R,
            'wheelbase_m': round(WHEEL_CX[1] - WHEEL_CX[0], 3), 'truck_length_m': round(SPRITE_RECT[2] - SPRITE_RECT[0], 3)}


# ------------------------------------------------------------------ dry-run (software) preview
def dry_preview(args, parts, sil):
    ppm = 220
    cols = {k: v['color'] for k, v in T.material_specs(args.skin).items()}
    x0, x1 = -2.9, 2.9 + PANEL_W
    w, h, buf = raster_side([p.mesh for p in parts], lambda m: cols.get(m, '#808080'), ppm, x0 - 0.0, x0 + 5.8, Z0, Z1)
    for q in COLLIDERS_SKIN1:
        draw_poly_lines(buf, w, h, q, ppm, x0, Z1)
    out = os.path.join(ART, 'renders')
    os.makedirs(out, exist_ok=True)
    left = os.path.join(out, 'mixer_3d_only_skin%d_dry.png' % args.skin)
    write_png(left, w, h, buf)
    paths = [left]
    try:
        from PIL import Image
        base = Image.frombytes('RGBA', (w, h), bytes(buf))
        sp = Image.open(sprite_path(args.skin)).convert('RGBA')
        scale = ppm / 128.0
        sp = sp.resize((int(sp.width * scale), int(sp.height * scale)), Image.LANCZOS)
        panel = Image.new('RGBA', (w, h), (58, 61, 69, 255))
        # sprite rect_m = (-2.316, -0.016, 2.316, 2.609): x0 of the image is rect[0], top is rect[3]
        px = int((SPRITE_RECT[0] - x0) * ppm)
        py = int((Z1 - SPRITE_RECT[3]) * ppm)
        panel.alpha_composite(sp, (px, py))
        both = Image.new('RGBA', (w * 2, h), (58, 61, 69, 255))
        both.paste(base, (0, 0))
        both.paste(panel, (w, 0))
        p2 = os.path.join(out, 'mixer_side_by_side_skin%d_dry.png' % args.skin)
        both.convert('RGB').save(p2)
        ov = base.copy()
        spa = sp.copy()
        spa.putalpha(spa.getchannel('A').point(lambda a: int(a * 0.5)))
        ov.alpha_composite(spa, (px, py))
        p3 = os.path.join(out, 'mixer_sprite_overlay_skin%d_dry.png' % args.skin)
        ov.convert('RGB').save(p3)
        paths += [p2, p3]
    except Exception as e:
        print('[mm] Pillow not available or sprite missing, only the 3D panel was written:', e)
    return paths


# ------------------------------------------------------------------ Blender render
def set_engine(scene, want):
    items = list(scene.render.bl_rna.properties['engine'].enum_items.keys())
    order = {'eevee': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'], 'workbench': ['BLENDER_WORKBENCH'], 'cycles': ['CYCLES']}[want]
    for e in order:
        if e in items:
            scene.render.engine = e
            return e
    scene.render.engine = 'BLENDER_WORKBENCH'
    return 'BLENDER_WORKBENCH'


def add_sprite_plane(name, skin, alpha, x_off, col):
    img = bpy.data.images.load(sprite_path(skin), check_existing=True)
    img.colorspace_settings.name = 'sRGB'
    r = SPRITE_RECT
    verts = [(r[0] + x_off, 0.02, r[1]), (r[2] + x_off, 0.02, r[1]), (r[2] + x_off, 0.02, r[3]), (r[0] + x_off, 0.02, r[3])]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', [0, 0, 1, 0, 1, 1, 0, 1])
    mat = bpy.data.materials.new(name + '_mat')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    em = nt.nodes.new('ShaderNodeEmission')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = alpha
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    nt.links.new(tex.outputs['Alpha'], mul.inputs[0])
    nt.links.new(mul.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    for attr, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
        try:
            setattr(mat, attr, val)
        except Exception:
            pass
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    return o


def add_polyline(name, pts_xz, x_off, col, rgb, width=0.012):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = width
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts_xz) - 1)
    for k, (x, z) in enumerate(pts_xz):
        sp.points[k].co = (x + x_off, -0.05, z, 1.0)
    sp.use_cyclic_u = True
    mat = bpy.data.materials.new(name + '_mat')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = rgb + (1.0,)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    cu.materials.append(mat)
    o = bpy.data.objects.new(name, cu)
    col.objects.link(o)
    return o


def setup_stage(scene, col, cam_x, ortho_w, ppm, engine):
    from mathutils import Vector
    cam_d = bpy.data.cameras.new('MM_SideCam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = ortho_w
    cam = bpy.data.objects.new('MM_SideCam', cam_d)
    cam.location = (cam_x, -30.0, (Z0 + Z1) / 2)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)       # looks along +Y: x to the right, z up, cab at the right
    col.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = int(ortho_w * ppm)
    scene.render.resolution_y = int((Z1 - Z0) * ppm)
    scene.render.resolution_percentage = 100
    sun = bpy.data.lights.new('MM_Key', 'SUN')
    sun.energy = 3.5
    sun.color = (1.0, 0.96, 0.88)
    sun.angle = math.radians(18)
    so = bpy.data.objects.new('MM_Key', sun)
    d = Vector((-0.45, 0.55, -0.70))                          # light from the upper right, slightly toward the camera
    so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    col.objects.link(so)
    rim = bpy.data.lights.new('MM_Rim', 'SUN')
    rim.energy = 1.2
    rim.color = (1.0, 0.82, 0.62)
    ro = bpy.data.objects.new('MM_Rim', rim)
    ro.rotation_euler = Vector((0.55, 0.4, -0.35)).to_track_quat('-Z', 'Y').to_euler()
    col.objects.link(ro)
    w = bpy.data.worlds.new('MM_World')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = tuple(srgb_to_lin(c) for c in hex_rgb('#8fb4d9')) + (1.0,)
    bg.inputs[1].default_value = 0.9
    scene.world = w
    used = set_engine(scene, engine)
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = 64
    except Exception:
        pass
    # flat neutral backdrop card behind everything so both panels share one background
    me = bpy.data.meshes.new('MM_Backdrop')
    me.from_pydata([(cam_x - 20, 6.0, -5), (cam_x + 20, 6.0, -5), (cam_x + 20, 6.0, 8), (cam_x - 20, 6.0, 8)], [], [(0, 1, 2, 3)])
    bm = bpy.data.materials.new('MM_Backdrop_mat')
    bm.use_nodes = True
    bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = tuple(srgb_to_lin(c) for c in hex_rgb('#3a3d45')) + (1.0,)
    bm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    me.materials.append(bm)
    bo = bpy.data.objects.new('MM_Backdrop', me)
    col.objects.link(bo)
    return used


def render_to(path, scene, retry_workbench=True):
    scene.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as e:
        print('[mm] render failed (%s)' % e)
        if retry_workbench:
            print('[mm] retrying with the Workbench engine')
            scene.render.engine = 'BLENDER_WORKBENCH'
            bpy.ops.render.render(write_still=True)
    return path


def append_driver(col, exports):
    path = os.path.join(exports, 'MM_Char_Driver.blend')
    if not os.path.exists(path):
        print('[mm] driver .blend not found (%s): rendering the truck without the driver' % path)
        return []
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if ('LOD1' not in n)]
    objs = [o for o in dst.objects if o is not None]
    for o in objs:
        col.objects.link(o)
        if o.type == 'ARMATURE':
            o.location = SEAT_POS_T
    return objs


SEAT_POS_T = T.SEAT_POS


def main():
    def extra(p):
        p.add_argument('--engine', default='eevee', choices=['eevee', 'workbench', 'cycles'])
        p.add_argument('--with-driver', action='store_true')
        p.add_argument('--res-ppm', type=int, default=250, help='pixels per metre of the render')
        p.add_argument('--renders', default=os.path.join(ART, 'renders'))
    args = parse_args(extra)
    parts0, sil0 = T.build_lod(0)
    fit = numeric_fit(sil0)
    print('[mm] fit', fit)
    if args.dry_run:
        paths = dry_preview(args, parts0, sil0)
        with open(os.path.join(ART, 'renders', 'mixer_render_check_dry.json'), 'w') as f:
            json.dump(fit, f, indent=2)
        print('[mm] dry-run preview written:', *paths)
        return
    # real render
    lods = {0: parts0, 1: T.build_lod(1)[0]}
    rep = Report('MM_Truck_Mixer_render')
    targs = args
    arm, objs, col = T.build_blender(targs, lods, rep)
    for o in objs:
        if '_LOD1' in o.name:
            o.hide_render = True
            o.hide_viewport = True
    if args.with_driver:
        for o in append_driver(col, args.out):
            if '_Face_LOD1' in o.name:
                o.hide_render = True
    scene = bpy.context.scene
    os.makedirs(args.renders, exist_ok=True)
    # ---- render 1: side by side
    cam_x = PANEL_W / 2
    objs_extra = []
    objs_extra.append(add_sprite_plane('MM_SpriteRef', args.skin, 1.0, PANEL_W, col))
    for k, q in enumerate(COLLIDERS_SKIN1):
        objs_extra.append(add_polyline('MM_Collider3D_%d' % k, q, 0.0, col, (0.1, 1.0, 0.45)))
        objs_extra.append(add_polyline('MM_ColliderSprite_%d' % k, q, PANEL_W, col, (0.1, 1.0, 0.45)))
    objs_extra.append(add_polyline('MM_GroundLine3D', [(-3, WHEEL_CZ - WHEEL_R), (3, WHEEL_CZ - WHEEL_R), (3, WHEEL_CZ - WHEEL_R - 0.001), (-3, WHEEL_CZ - WHEEL_R - 0.001)], 0.0, col, (1.0, 0.85, 0.2), 0.008))
    used = setup_stage(scene, col, cam_x, PANEL_W * 2, args.res_ppm, args.engine)
    p1 = render_to(os.path.join(args.renders, 'mixer_side_by_side_skin%d.png' % args.skin), scene)
    # ---- render 2: overlay (sprite at 50% over the 3D truck, same origin)
    for o in objs_extra:
        if o.name.startswith('MM_SpriteRef') or o.name.startswith('MM_ColliderSprite'):
            bpy.data.objects.remove(o, do_unlink=True)
    add_sprite_plane('MM_SpriteOverlay', args.skin, 0.5, 0.0, col)
    scene.camera.location = (0.0, -30.0, (Z0 + Z1) / 2)
    scene.camera.data.ortho_scale = PANEL_W
    scene.render.resolution_x = int(PANEL_W * args.res_ppm)
    p2 = render_to(os.path.join(args.renders, 'mixer_sprite_overlay_skin%d.png' % args.skin), scene)
    fit.update({'engine': used, 'files': [p1, p2], 'ppm': args.res_ppm})
    with open(os.path.join(args.renders, 'mixer_render_check.json'), 'w') as f:
        json.dump(fit, f, indent=2)
    print('[mm] rendered', p1, p2)


if __name__ == '__main__':
    main()
