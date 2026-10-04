"""Trim and pack the sprites of an asset manifest into power-of-two atlases plus a sprite sheet JSON.

    python3 pack_atlas.py --manifest build/asset-manifest.json --root pilot=/path/to/out \
        --out-dir ../../unity/Assets/Art/Generated [--variant snapped|graded]

Runs under Blender's bundled Python (numpy + OpenImageIO, no PIL):
    Blender -b --factory-startup -noaudio --python-exit-code 3 -P pack_atlas.py -- <same arguments>
or directly with <Blender.app>/Contents/Resources/<ver>/python/bin/python3.13.

Output (all in --out-dir)
    atlas_<group>_<nn>.png    RGBA, straight alpha, width and height powers of two, at most --max-page
    sprite_sheet.json         schema sprite-sheet/1: every manifest entry plus pages and frame rectangles

Rules
  * Default copy is the palette-snapped picture; --variant graded uses the graded copy (an entry without one
    is an error, never a silent fallback).
  * Frames of one entry share one rectangle size: the union of their non-transparent pixels (all frames of a
    clip are cropped alike, so animation does not jitter). The anchor is carried through the crop:
    pivot_px is measured from the bottom-left of the trimmed rectangle (Unity's convention) and may lie
    outside the rectangle (a banner floats above its anchor).
  * Fully transparent pixels are written as (0, 0, 0, 0). No rotation. Padding between sprites and to the
    page edge is --padding pixels (default 2).
  * Deterministic: inputs are sorted, the packer is a shelf packer with fixed tie breaks, PNGs come from
    png_io.py, the JSON has sorted keys and no timestamps or paths. Two runs give identical SHA-256 per file
    (check_determinism.py runs the check).
  * Source files are verified against the manifest's SHA-256 (a stale manifest is an error).
  * The content audit's pixel check runs on every entry; findings make the exit code 1 and nothing is written.

Exit codes: 0 ok, 1 audit findings, 2 bad input.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import asset_schema as S  # noqa: E402
import cli  # noqa: E402
import content_audit  # noqa: E402
import pack_rects  # noqa: E402
import png_io  # noqa: E402

GENERATOR = {"name": "pack_atlas", "version": "1.0.0"}
DEFAULT_MAX_PAGE = 4096
DEFAULT_PADDING = 2
MIN_PAGE_SIDE = 4
WIDTH_CANDIDATES = (256, 512, 1024, 2048, 4096)
SHEET_FILE = "sprite_sheet.json"
PACKERS = ("shelf", "maxrects")
GRAINS = ("pow2", "256")
MAXRECTS_SHRINK_TRIES = 40


class PackError(Exception):
    pass


def next_pow2(value):
    side = MIN_PAGE_SIDE
    while side < value:
        side *= 2
    return side


# ---------------------------------------------------------------- loading and trimming
def load_entry_frames(entry, roots, variant):
    source = entry["source"]
    relative = source["path"] if variant == "snapped" else source["graded_path"]
    expected = source["sha256"] if variant == "snapped" else source["graded_sha256"]
    if not relative:
        raise PackError("entry '%s' has no %s copy" % (entry["key"], variant))
    base = roots.get(source["root"])
    if base is None:
        raise PackError("no --root given for '%s'" % source["root"])
    path = os.path.join(base, relative)
    if not os.path.isfile(path):
        raise PackError("missing source file %s" % path)
    if cli.sha256_file(path) != expected:
        raise PackError("%s changed since the manifest was built (rebuild the manifest)" % relative)
    image = png_io.read_rgba(path)
    frame_w, frame_h = source["frame_size"]
    count = source["frames"]
    if image.shape[1] != frame_w * count or image.shape[0] != frame_h:
        raise PackError("%s has size %dx%d, manifest says %d frames of %dx%d"
                        % (relative, image.shape[1], image.shape[0], count, frame_w, frame_h))
    return [image[:, i * frame_w:(i + 1) * frame_w] for i in range(count)]


def union_bbox(frames):
    """(x0, y0, x1, y1) with x1, y1 exclusive; a 1x1 box at the origin when everything is transparent."""
    mask = np.zeros(frames[0].shape[:2], dtype=bool)
    for frame in frames:
        mask |= frame[..., 3] > 0
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    if rows.size == 0:
        return (0, 0, 1, 1)
    return (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)


def trim_entry(entry, frames):
    x0, y0, x1, y1 = union_bbox(frames)
    trimmed = [np.ascontiguousarray(f[y0:y1, x0:x1]) for f in frames]
    ax, ay = entry["anchor_px"]
    digest_input = b"".join(t.tobytes() for t in trimmed)
    return {
        "frames": trimmed, "size": [x1 - x0, y1 - y0], "trim_offset": [x0, y0],
        "pivot_px": [ax - x0, y1 - ay], "pixel_sha256": cli.sha256_bytes(digest_input),
    }


# ---------------------------------------------------------------- packing
def shelf_pack(items, page_w, max_page, pad):
    """items: list of (w, h, ref) already sorted. Returns pages: [{'placements': [(ref,x,y)], 'w':.., 'h':..}]."""
    pages = []
    page = None
    x = y = row_h = 0

    def start():
        nonlocal page, x, y, row_h
        page = {"placements": [], "w": 0, "h": 0}
        pages.append(page)
        x, y, row_h = pad, pad, 0

    start()
    for w, h, ref in items:
        if w + 2 * pad > min(page_w, max_page) or h + 2 * pad > max_page:
            raise PackError("sprite %s (%dx%d) does not fit a %d page with padding %d" % (ref[0], w, h, max_page, pad))
        if x + w + pad > page_w:
            y += row_h + pad
            x, row_h = pad, 0
        if y + h + pad > max_page:
            start()
        page["placements"].append((ref, x, y))
        x += w + pad
        row_h = max(row_h, h)
        page["w"] = max(page["w"], x)
        page["h"] = max(page["h"], y + row_h + pad)
    return pages


def best_packing(items, max_page, pad):
    """Try several page widths; keep the fewest pages, then the smallest power-of-two area, then the narrowest."""
    widest = max(w for w, _h, _r in items) + 2 * pad
    best = None
    for page_w in WIDTH_CANDIDATES:
        if page_w < widest or page_w > max_page:
            continue
        pages = shelf_pack(items, page_w, max_page, pad)
        area = sum(next_pow2(p["w"]) * next_pow2(p["h"]) for p in pages)
        score = (len(pages), area, page_w)
        if best is None or score < best[0]:
            best = (score, pages)
    if best is None:
        raise PackError("no page width fits the widest sprite (%d px incl. padding)" % widest)
    return best[1]


def page_side_candidates(grain, max_page):
    if grain == "pow2":
        sides, side = [], MIN_PAGE_SIDE
        while side <= max_page:
            sides.append(side)
            side *= 2
        return sides
    step = int(grain)
    return list(range(step, max_page + 1, step))


def page_extent(page, grain):
    """Final (width, height) of a page whose content reaches page['w'] x page['h']."""
    if grain == "pow2":
        return next_pow2(page["w"]), next_pow2(page["h"])
    step = int(grain)
    return -(-page["w"] // step) * step, -(-page["h"] // step) * step


def maxrects_packing(items, max_page, pad, grain):
    """Fill max_page x max_page pages first-fit with MaxRects, then shrink each page to the smallest allowed
    size (by area, then width) that still takes all of its items in the same order."""
    for w, h, ref in items:
        if w + 2 * pad > max_page or h + 2 * pad > max_page:
            raise PackError("sprite %s (%dx%d) does not fit a %d page with padding %d" % (ref[0], w, h, max_page, pad))
    bins, contents, spots = [], [], []
    for item in items:
        for index, page in enumerate(bins):
            spot = page.place(item[0], item[1])
            if spot is not None:
                contents[index].append(item)
                spots[index].append((item[2], spot[0], spot[1]))
                break
        else:
            page = pack_rects.Bin(max_page, max_page, pad)
            spot = page.place(item[0], item[1])
            bins.append(page)
            contents.append([item])
            spots.append([(item[2], spot[0], spot[1])])
    first_fit = {id(c): sp for c, sp in zip(contents, spots)}
    sides = page_side_candidates(grain, max_page)
    pages = []
    for page_items in contents:
        need = sum((w + pad) * (h + pad) for w, h, _r in page_items)
        widest = max(w for w, _h, _r in page_items) + 2 * pad
        tallest = max(h for _w, h, _r in page_items) + 2 * pad
        candidates = sorted(((cw * ch, cw, ch) for cw in sides for ch in sides
                             if cw >= widest and ch >= tallest and cw * ch >= need),
                            key=lambda c: (c[0], c[1]))
        placements, tries = None, 0
        for _area, cw, ch in candidates:
            if tries >= MAXRECTS_SHRINK_TRIES:
                break
            tries += 1
            placements = pack_rects.pack_into(page_items, cw, ch, pad)
            if placements is not None:
                break
        if placements is None:  # nothing smaller worked: keep the first-fit placement and trim to its extent
            placements = first_fit[id(page_items)]
        page = {"placements": placements, "w": 0, "h": 0}
        for (_ref, x, y), (w, h, _r) in zip(placements, page_items):
            page["w"] = max(page["w"], x + w + pad)
            page["h"] = max(page["h"], y + h + pad)
        pages.append(page)
    return pages


def render_page(page, placed, grain="pow2"):
    width, height = page_extent(page, grain)
    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    for (key, index), x, y in page["placements"]:
        frame = placed[key]["frames"][index]
        canvas[y:y + frame.shape[0], x:x + frame.shape[1]] = frame
    return canvas


# ---------------------------------------------------------------- sheet
def sheet_entry(entry, trim, frame_records):
    return {
        "key": entry["key"], "kind": entry["kind"], "role": entry["role"], "level": entry["level"],
        "variant": entry["variant"], "state": entry["state"], "slot": entry["slot"], "dir": entry["dir"],
        "atlas_group": entry["atlas_group"], "layer": entry["layer"], "sort": entry["sort"],
        "footprint": entry["footprint"], "fps": entry["fps"], "loop": entry["loop"], "events": entry["events"],
        "tags": entry["tags"], "review": entry["review"],
        "frame_count": entry["source"]["frames"], "size": trim["size"], "pivot_px": trim["pivot_px"],
        "source_size": entry["source"]["frame_size"], "source_anchor_px": entry["anchor_px"],
        "trim_offset": trim["trim_offset"], "frames": frame_records, "pixel_sha256": trim["pixel_sha256"],
        "source_sha256": entry["source"]["sha256"],
    }


def pack(manifest, roots, out_dir, variant, max_page, pad, audit_pixels, extra_audit=None,
         packer="shelf", grain="pow2"):
    """Returns (files, findings). files maps file name -> bytes; nothing is written here."""
    errors = S.validate_manifest(manifest)
    if errors:
        raise PackError("manifest invalid: " + "; ".join(errors[:5]))
    placed, findings = {}, []
    for entry in manifest["entries"]:
        frames = load_entry_frames(entry, roots, variant)
        if audit_pixels:
            for index, frame in enumerate(frames):
                findings += content_audit.audit_pixels(frame, "%s#%d" % (entry["key"], index))
        placed[entry["key"]] = trim_entry(entry, frames)
    if extra_audit is not None:
        findings += list(extra_audit(manifest))
    findings = sorted(set(findings))
    groups = {}
    for entry in manifest["entries"]:
        groups.setdefault(entry["atlas_group"], []).append(entry["key"])

    files, pages_meta, locations = {}, [], {}
    for group in sorted(groups):
        items = []
        for key in groups[group]:
            trim = placed[key]
            for index in range(len(trim["frames"])):
                items.append((trim["size"][0], trim["size"][1], (key, index)))
        items.sort(key=lambda it: (-it[1], -it[0], it[2][0], it[2][1]))
        if packer == "maxrects":
            group_pages = maxrects_packing(items, max_page, pad, grain)
        else:
            group_pages = best_packing(items, max_page, pad)
        for number, page in enumerate(group_pages):
            name = "atlas_%s_%02d.png" % (group, number)
            canvas = render_page(page, placed, grain if packer == "maxrects" else "pow2")
            data = png_io.png_bytes(canvas)
            files[name] = data
            pages_meta.append({"file": name, "group": group, "size": [canvas.shape[1], canvas.shape[0]],
                               "sha256": cli.sha256_bytes(data)})
            page_index = len(pages_meta) - 1
            for (key, index), x, y in page["placements"]:
                size = placed[key]["size"]
                locations.setdefault(key, {})[index] = {"page": page_index, "rect": [x, y, size[0], size[1]]}

    entries = []
    for entry in manifest["entries"]:
        records = [locations[entry["key"]][i] for i in range(len(placed[entry["key"]]["frames"]))]
        entries.append(sheet_entry(entry, placed[entry["key"]], records))
    sheet = {
        "schema": S.SHEET_SCHEMA, "theme": manifest["theme"], "tile_px": manifest["tile_px"],
        "pixels_per_unit": manifest["tile_px"], "projection": manifest["projection"], "variant": variant,
        "padding": pad, "max_page": max_page, "generator": GENERATOR, "layers": manifest["layers"],
        "pages": pages_meta, "entries": entries,
    }
    files[SHEET_FILE] = cli.dump_json(sheet).encode("utf-8")
    return files, findings


def output_digest(files):
    lines = ["%s %s" % (name, cli.sha256_bytes(files[name])) for name in sorted(files)]
    return cli.sha256_bytes("\n".join(lines).encode("utf-8"))


def write_outputs(files, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for stale in os.listdir(out_dir):
        if stale.startswith("atlas_") and stale.endswith(".png") and stale not in files:
            os.remove(os.path.join(out_dir, stale))
    for name, data in files.items():
        with open(os.path.join(out_dir, name), "wb") as handle:
            handle.write(data)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--root", action="append", default=[], help="name=directory (repeatable)")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--variant", choices=S.VARIANT_COPIES, default="snapped")
    parser.add_argument("--max-page", type=int, default=DEFAULT_MAX_PAGE)
    parser.add_argument("--padding", type=int, default=DEFAULT_PADDING)
    parser.add_argument("--packer", choices=PACKERS, default="shelf",
                        help="shelf (default, power-of-two pages) or maxrects (tighter, fewer wasted pixels)")
    parser.add_argument("--page-grain", choices=GRAINS, default="pow2",
                        help="maxrects only: page sides are powers of two, or multiples of 256")
    parser.add_argument("--no-pixel-audit", action="store_true")
    parser.add_argument("--extra-audit", help="python file defining audit_manifest(manifest) -> list[str]")
    args = parser.parse_args(cli.script_args(argv))
    if args.max_page > 4096 or args.max_page & (args.max_page - 1) or args.padding < 0:
        print("pack_atlas: --max-page must be a power of two <= 4096 and --padding >= 0", file=sys.stderr)
        return 2
    try:
        import json
        with open(args.manifest, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        extra = content_audit.load_extra(args.extra_audit) if args.extra_audit else None
        files, findings = pack(manifest, cli.parse_roots(args.root), args.out_dir, args.variant, args.max_page,
                               args.padding, not args.no_pixel_audit, extra, args.packer, args.page_grain)
    except (PackError, OSError, ValueError) as exc:
        print("pack_atlas: %s" % exc, file=sys.stderr)
        return 2
    if findings:
        for line in findings:
            print("pack_atlas: audit: " + line, file=sys.stderr)
        return 1
    write_outputs(files, args.out_dir)
    pages = [n for n in files if n.endswith(".png")]
    print("pack_atlas: %d entries, %d pages, variant %s, digest %s" % (
        len(manifest["entries"]), len(pages), args.variant, output_digest(files)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
