"""Build the theme-neutral asset manifest (asset-manifest/1) from a theme catalogue.

    python3 build_manifest.py --catalogue themes/bd1971/catalogue.json \
        --root pilot=/path/to/bd1971-pilot/out --out build/asset-manifest.json [--report build/manifest-report.json]

Run it with Blender's bundled Python (python/bin/python3.13) or through Blender (-b --python ... -- args).
Only the PNG headers and file hashes are read here, so it is fast and needs no image library.

What it does
  1. expands the catalogue groups (explicit items, or a matrix of roles x sides x forms) into entries;
  2. adds the animation clips of anim/anim_spec.json when that optional file exists (clips whose strip is
     missing are skipped and listed in the report, because the animation agent may still be writing them);
  3. converts anchors to the manifest convention (pixels from the frame's TOP-LEFT);
  4. computes the sort point of each entry from its footprint (2:1 isometric front corner);
  5. validates the result and runs the content audit (names). Findings make the exit code 1.

Exit codes: 0 ok, 1 findings or validation errors, 2 bad input (missing file, bad catalogue).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import asset_keys  # noqa: E402
import asset_schema as S  # noqa: E402
import cli  # noqa: E402
import content_audit  # noqa: E402
import png_io  # noqa: E402

ITEM_OVERRIDES = ("kind", "role", "level", "variant", "state", "slot", "dir", "footprint", "frames", "fps", "loop",
                  "events", "tags", "layer", "atlas_group", "anchor_from_bottom_left", "sort_bias", "review")


class InputError(Exception):
    pass


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        raise InputError("cannot read %s: %s" % (path, exc))


def expand_group(group):
    """Yield one dict per entry of a catalogue group, with file names resolved."""
    if "items" in group:
        combos = [dict(item, _combo={"id": item["id"]}) for item in group["items"]]
    else:
        matrix = group["matrix"]
        axes = list(matrix.keys())
        combos = [{}]
        for axis in axes:
            combos = [dict(c, **{axis: value}) for c in combos for value in matrix[axis]]
        resolved = []
        for combo in combos:
            fields = {}
            for name, template in group["entry"].items():
                fields[name] = template.format(**combo)
            for axis in axes:
                value = combo[axis]
                if isinstance(value, dict):
                    fields.update({k: v for k, v in value.items() if k in ITEM_OVERRIDES and k != "state"})
            fields["_combo"] = combo
            resolved.append(fields)
        combos = resolved
    for combo in combos:
        template_values = dict(combo["_combo"])
        item = {k: v for k, v in combo.items() if k != "_combo"}
        item["file"] = group["file"].format(**template_values)
        graded = group.get("graded_file")
        item["graded_file"] = graded.format(**template_values) if graded else None
        yield item


def clean_state(value):
    return value if value else None


def sort_block(layer, footprint, tile_h, bias):
    if layer["sorting"] == "depth":
        offset = -((footprint[0] + footprint[1]) * tile_h // 4)
        return {"rule": "custom_axis_y", "bias": bias, "point_offset_px": [0, offset]}
    return {"rule": "fixed_layer", "bias": bias, "point_offset_px": [0, 0]}


def file_info(roots, root, relative, graded_relative, expect_frames):
    base = roots.get(root)
    if base is None:
        raise InputError("no --root given for '%s'" % root)
    path = os.path.join(base, relative)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    width, height = png_io.read_png_size(path)
    if width % expect_frames:
        raise InputError("%s: width %d is not a multiple of %d frames" % (relative, width, expect_frames))
    graded_path, graded_sha = None, None
    if graded_relative:
        candidate = os.path.join(base, graded_relative)
        if os.path.isfile(candidate):
            if png_io.read_png_size(candidate) != (width, height):
                raise InputError("%s: graded copy has a different size" % relative)
            graded_path, graded_sha = graded_relative, cli.sha256_file(candidate)
    return {"root": root, "path": relative.replace(os.sep, "/"), "sha256": cli.sha256_file(path),
            "graded_path": graded_path.replace(os.sep, "/") if graded_path else None, "graded_sha256": graded_sha,
            "frames": expect_frames, "frame_size": [width // expect_frames, height],
            "layout": "single" if expect_frames == 1 else "strip_h"}


def make_entry(spec, source, layers, projection, tag_prefix, origin_note):
    """spec holds the resolved fields; source comes from file_info."""
    layer = layers[spec["layer"]]
    footprint = list(spec["footprint"])
    anchor_bl = spec["anchor_px_bl"]
    frame_h = source["frame_size"][1]
    entry = {
        "key": asset_keys.format_key(spec["kind"], spec["role"], spec["level"], spec["variant"], spec["state"],
                                     spec["slot"]),
        "kind": spec["kind"], "role": spec["role"], "level": spec["level"], "variant": spec["variant"],
        "state": spec["state"], "slot": spec["slot"], "dir": spec["dir"],
        "atlas_group": spec["atlas_group"], "layer": spec["layer"],
        "sort": sort_block(layer, footprint, projection["tile_h"], spec["sort_bias"]),
        "footprint": footprint, "source": source,
        "anchor_px": [anchor_bl[0], frame_h - anchor_bl[1]],
        "fps": spec["fps"] if source["frames"] > 1 else None,
        "loop": bool(spec["loop"]),
        "events": spec["events"],
        "tags": sorted(set(tag_prefix + spec["tags"])),
        "provenance": {"origin": "blender-pilot", "note": origin_note},
        "review": {"status": spec["review"]},
    }
    return entry


def static_entries(catalogue, roots, layers, errors):
    defaults = catalogue["defaults"]
    projection = catalogue["projection"]
    entries = []
    for group in catalogue["groups"]:
        for item in expand_group(group):
            spec = {
                "kind": group["kind"], "role": item["role"], "level": None, "variant": None, "state": None,
                "slot": None, "dir": None, "footprint": defaults["footprint"], "frames": defaults["frames"],
                "fps": defaults["fps"], "loop": defaults["loop"], "events": [], "tags": [],
                "layer": group["layer"], "atlas_group": group["atlas_group"],
                "anchor_px_bl": group["anchor_from_bottom_left"], "sort_bias": defaults["sort_bias"],
                "review": defaults["review"],
            }
            spec["tags"] = list(group.get("tags", []))
            for field in ITEM_OVERRIDES:
                if field in item and item[field] is not None:
                    spec[field] = item[field]
            if "anchor_from_bottom_left" in item:
                spec["anchor_px_bl"] = item["anchor_from_bottom_left"]
            spec["state"] = clean_state(item.get("state"))
            spec["slot"] = clean_state(item.get("slot"))
            relative = group["dir"] + "/" + item["file"]
            graded = group["dir"] + "/" + item["graded_file"] if item["graded_file"] else None
            try:
                source = file_info(roots, group["root"], relative, graded, int(spec["frames"]))
            except FileNotFoundError as exc:
                errors.append("missing source file: %s" % exc)
                continue
            except InputError as exc:
                errors.append(str(exc))
                continue
            entries.append(make_entry(spec, source, layers, projection, [], "catalogue group '%s'" % group["id"]))
    return entries


def anim_entries(catalogue, roots, layers, notes, errors):
    anim = catalogue.get("anim")
    if not anim:
        return []
    base = roots.get(anim["root"])
    if base is None:
        raise InputError("no --root given for '%s'" % anim["root"])
    spec_path = os.path.join(base, anim["dir"], anim["spec"])
    if not os.path.isfile(spec_path):
        notes.append("animation spec %s/%s is absent: no animation entries" % (anim["dir"], anim["spec"]))
        return []
    spec = load_json(spec_path)
    if spec.get("tile_width_px") != catalogue["tile_px"]:
        errors.append("anim spec tile_width_px %r differs from the catalogue tile_px %r"
                      % (spec.get("tile_width_px"), catalogue["tile_px"]))
        return []
    defaults = catalogue["defaults"]
    projection = catalogue["projection"]
    out = []
    for clip in sorted(spec["clips"], key=lambda c: c["name"]):
        category = clip["category"]
        if category not in anim["layers"]:
            errors.append("anim clip %s: unknown category %s" % (clip["name"], category))
            continue
        fields = {"kind": None, "role": None, "state": clean_state(clip.get("clip")), "slot": None,
                  "dir": clip.get("dir"), "footprint": [1, 1], "layer": anim["layers"][category],
                  "atlas_group": anim["atlas_groups"][category]}
        if category == "banner":
            fields.update(kind="u", role=clip["role"], slot=catalogue["slots"][clip["side"]])
            tags = ["unit", "banner", "animated"]
        elif category == "struct":
            fields.update(kind="bld", role=anim["structure_roles"][clip["structure"]])
            fields["footprint"] = anim.get("structure_footprints", {}).get(clip["structure"], [1, 1])
            tags = ["structure", "animated"]
        else:
            fields.update(kind="env", role=clip["clip"], state=None)
            tags = ["terrain", "animated"]
        fields.update(anim.get("overrides", {}).get(clip["name"], {}))
        frames = int(clip["frames"])
        relative = anim["dir"] + "/" + clip["strip"]
        graded = anim["dir"] + "/" + clip["strip_graded"] if clip.get("strip_graded") else None
        try:
            source = file_info(roots, anim["root"], relative, graded, frames)
        except FileNotFoundError as exc:
            notes.append("skipped clip %s: strip not written yet (%s)" % (clip["name"], os.path.basename(str(exc))))
            continue
        except InputError as exc:
            errors.append("anim clip %s: %s" % (clip["name"], exc))
            continue
        if source["frame_size"] != [clip["frame_w"], clip["frame_h"]]:
            errors.append("anim clip %s: strip frames are %s but the spec says %sx%s"
                          % (clip["name"], source["frame_size"], clip["frame_w"], clip["frame_h"]))
            continue
        item = {
            "kind": fields["kind"], "role": fields["role"], "level": None, "variant": None, "state": fields["state"],
            "slot": fields["slot"], "dir": fields["dir"], "footprint": fields["footprint"], "fps": clip["fps"],
            "loop": clip["loop"], "events": [{"frame": e["frame"], "name": e["name"]} for e in clip["events"]],
            "tags": tags, "layer": fields["layer"], "atlas_group": fields["atlas_group"],
            "anchor_px_bl": [clip["anchor_px"][0], source["frame_size"][1] - clip["anchor_px"][1]],
            "sort_bias": defaults["sort_bias"], "review": defaults["review"],
        }
        out.append(make_entry(item, source, layers, projection, [], "anim clip '%s'" % clip["name"]))
    return out


def build_manifest(catalogue, roots, extra_audit=None):
    notes, errors = [], []
    layers = {layer["id"]: layer for layer in catalogue["layers"]}
    entries = static_entries(catalogue, roots, layers, errors) + anim_entries(catalogue, roots, layers, notes, errors)
    entries.sort(key=lambda e: e["key"])
    manifest = {
        "schema": S.MANIFEST_SCHEMA, "theme": catalogue["theme"], "tile_px": catalogue["tile_px"],
        "projection": catalogue["projection"], "layers": catalogue["layers"], "roots": list(catalogue["roots"]),
        "entries": entries,
    }
    errors += S.validate_manifest(manifest)
    findings = content_audit.audit_manifest(manifest, extra_audit) if not errors else []
    kinds = {}
    for entry in entries:
        kinds[entry["kind"]] = kinds.get(entry["kind"], 0) + 1
    report = {"entries": len(entries), "by_kind": kinds, "errors": errors, "findings": findings, "notes": notes}
    return manifest, report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--catalogue", required=True)
    parser.add_argument("--root", action="append", default=[], help="name=directory (repeatable)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--report")
    parser.add_argument("--extra-audit", help="python file defining audit_manifest(manifest) -> list[str]")
    args = parser.parse_args(cli.script_args(argv))
    try:
        catalogue = load_json(args.catalogue)
        if catalogue.get("schema") != S.CATALOGUE_SCHEMA:
            raise InputError("catalogue schema is %r, expected %r" % (catalogue.get("schema"), S.CATALOGUE_SCHEMA))
        extra = content_audit.load_extra(args.extra_audit) if args.extra_audit else None
        manifest, report = build_manifest(catalogue, cli.parse_roots(args.root), extra)
    except InputError as exc:
        print("build_manifest: %s" % exc, file=sys.stderr)
        return 2
    if args.report:
        cli.write_text(args.report, cli.dump_json(report))
    for line in report["errors"] + ["audit: " + f for f in report["findings"]]:
        print("build_manifest: " + line, file=sys.stderr)
    for line in report["notes"]:
        print("build_manifest: note: " + line)
    if report["errors"] or report["findings"]:
        return 1
    cli.write_text(args.out, cli.dump_json(manifest))
    print("build_manifest: wrote %d entries to %s %s" % (report["entries"], args.out, json.dumps(report["by_kind"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
