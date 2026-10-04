"""Constants and validation for the two JSON documents of the pipeline.

asset-manifest/1   what to pack: one entry per role id (+ level, variant, state, slot), source file,
                   frame count, fps, anchor, footprint, layer and sort rule. Built by build_manifest.py.
sprite-sheet/1     what the game loads: the manifest entries plus atlas pages and frame rectangles.
                   Written by pack_atlas.py, read by Conquest.Assets (C#) and the Unity importer.

Both are theme neutral: only role ids, never labels. JSON Schema copies for outside tools are in schema/.
"""
import asset_keys

MANIFEST_SCHEMA = "asset-manifest/1"
SHEET_SCHEMA = "sprite-sheet/1"
CATALOGUE_SCHEMA = "asset-catalogue/1"

KINDS = ("tile", "bld", "u", "mk", "env", "fx")
ATLAS_GROUPS = ("tiles", "buildings", "units", "props", "fx")
SORT_RULES = ("custom_axis_y", "fixed_layer")
LAYER_SORTING = ("depth", "fixed")
REVIEW_STATUSES = ("prototype", "draft", "internal", "in_review", "approved", "rejected")
VARIANT_COPIES = ("snapped", "graded")
LAYOUTS = ("single", "strip_h")
MAX_SORT_BIAS = 9
SLOT_PREFIX = "f"

ENTRY_REQUIRED = ("key", "kind", "role", "level", "variant", "state", "slot", "dir", "atlas_group", "layer",
                  "sort", "footprint", "source", "anchor_px", "fps", "loop", "events", "tags", "provenance",
                  "review")
SOURCE_REQUIRED = ("root", "path", "sha256", "graded_path", "graded_sha256", "frames", "frame_size", "layout")
MANIFEST_REQUIRED = ("schema", "theme", "tile_px", "projection", "layers", "roots", "entries")


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_int_pair(value, minimum=None):
    ok = isinstance(value, (list, tuple)) and len(value) == 2 and all(_is_int(v) for v in value)
    return ok and (minimum is None or all(v >= minimum for v in value))


def validate_entry(entry, layer_ids, where="entry"):
    errors = []
    for field in ENTRY_REQUIRED:
        if field not in entry:
            errors.append("%s: missing field '%s'" % (where, field))
    if errors:
        return errors
    key = entry["key"]
    where = "entry '%s'" % key
    if entry["kind"] not in KINDS:
        errors.append("%s: kind '%s' not in %s" % (where, entry["kind"], KINDS))
    else:
        try:
            expected = asset_keys.format_key(entry["kind"], entry["role"], entry["level"], entry["variant"],
                                             entry["state"], entry["slot"])
            if expected != key:
                errors.append("%s: key does not match its parts (expected '%s')" % (where, expected))
        except ValueError as exc:
            errors.append("%s: %s" % (where, exc))
    if entry["level"] is not None and not (_is_int(entry["level"]) and entry["level"] >= 1):
        errors.append("%s: level must be an integer >= 1 or null" % where)
    if entry["variant"] is not None and not (_is_int(entry["variant"]) and entry["variant"] >= 1):
        errors.append("%s: variant must be an integer >= 1 or null" % where)
    if entry["slot"] is not None and not (isinstance(entry["slot"], str) and entry["slot"].startswith(SLOT_PREFIX)):
        errors.append("%s: slot must look like f1, f2 or be null" % where)
    if entry["atlas_group"] not in ATLAS_GROUPS:
        errors.append("%s: atlas_group '%s' not in %s" % (where, entry["atlas_group"], ATLAS_GROUPS))
    if entry["layer"] not in layer_ids:
        errors.append("%s: layer '%s' is not declared" % (where, entry["layer"]))
    sort = entry["sort"]
    if not isinstance(sort, dict) or sort.get("rule") not in SORT_RULES:
        errors.append("%s: sort.rule must be one of %s" % (where, SORT_RULES))
    else:
        if not _is_int(sort.get("bias")) or abs(sort["bias"]) > MAX_SORT_BIAS:
            errors.append("%s: sort.bias must be an integer within +-%d" % (where, MAX_SORT_BIAS))
        if not _is_int_pair(sort.get("point_offset_px")):
            errors.append("%s: sort.point_offset_px must be two integers" % where)
    if not _is_int_pair(entry["footprint"], 1):
        errors.append("%s: footprint must be two integers >= 1" % where)
    source = entry["source"]
    frames = 0
    if not isinstance(source, dict):
        errors.append("%s: source must be an object" % where)
    else:
        for field in SOURCE_REQUIRED:
            if field not in source:
                errors.append("%s: source is missing '%s'" % (where, field))
        frames = source.get("frames", 0)
        if not (_is_int(frames) and frames >= 1):
            errors.append("%s: source.frames must be an integer >= 1" % where)
            frames = 0
        if not _is_int_pair(source.get("frame_size"), 1):
            errors.append("%s: source.frame_size must be two integers >= 1" % where)
        if source.get("layout") not in LAYOUTS:
            errors.append("%s: source.layout must be one of %s" % (where, LAYOUTS))
        elif source["layout"] == "single" and frames != 1:
            errors.append("%s: layout 'single' needs frames == 1" % where)
        if not isinstance(source.get("sha256"), str) or len(source.get("sha256", "")) != 64:
            errors.append("%s: source.sha256 must be 64 hex digits" % where)
    if not _is_int_pair(entry["anchor_px"]):
        errors.append("%s: anchor_px must be two integers" % where)
    if frames > 1:
        if not (_is_int(entry["fps"]) and entry["fps"] >= 1):
            errors.append("%s: an animated entry needs an integer fps >= 1" % where)
    if not isinstance(entry["loop"], bool):
        errors.append("%s: loop must be true or false" % where)
    for index, event in enumerate(entry["events"]):
        if not (isinstance(event, dict) and _is_int(event.get("frame")) and isinstance(event.get("name"), str)):
            errors.append("%s: events[%d] must be {frame, name}" % (where, index))
        elif frames and not 0 <= event["frame"] < frames:
            errors.append("%s: events[%d].frame is outside 0..%d" % (where, index, frames - 1))
    if not (isinstance(entry["tags"], list) and all(isinstance(t, str) for t in entry["tags"])):
        errors.append("%s: tags must be a list of strings" % where)
    review = entry["review"]
    if not isinstance(review, dict) or review.get("status") not in REVIEW_STATUSES:
        errors.append("%s: review.status must be one of %s" % (where, REVIEW_STATUSES))
    return errors


def validate_manifest(manifest):
    """Return a list of problems; empty means the manifest is well formed."""
    errors = []
    for field in MANIFEST_REQUIRED:
        if field not in manifest:
            errors.append("manifest: missing field '%s'" % field)
    if errors:
        return errors
    if manifest["schema"] != MANIFEST_SCHEMA:
        errors.append("manifest: schema is '%s', this tool reads '%s'" % (manifest["schema"], MANIFEST_SCHEMA))
        return errors
    if not (_is_int(manifest["tile_px"]) and manifest["tile_px"] >= 2):
        errors.append("manifest: tile_px must be an integer >= 2")
    projection = manifest["projection"]
    if not (isinstance(projection, dict) and projection.get("kind") == "iso_2_1"
            and _is_int(projection.get("tile_w")) and _is_int(projection.get("tile_h"))
            and projection["tile_w"] == 2 * projection["tile_h"]):
        errors.append("manifest: projection must be iso_2_1 with tile_w == 2 * tile_h")
    layer_ids = set()
    for layer in manifest["layers"]:
        lid = layer.get("id")
        if not isinstance(lid, str) or lid in layer_ids:
            errors.append("manifest: layer ids must be unique strings (got %r)" % (lid,))
            continue
        layer_ids.add(lid)
        if layer.get("sorting") not in LAYER_SORTING:
            errors.append("manifest: layer '%s' sorting must be one of %s" % (lid, LAYER_SORTING))
        if not _is_int(layer.get("order")) or not _is_int(layer.get("tiebreak")):
            errors.append("manifest: layer '%s' needs integer order and tiebreak" % lid)
    seen = set()
    for index, entry in enumerate(manifest["entries"]):
        errors += validate_entry(entry, layer_ids, "entries[%d]" % index)
        key = entry.get("key")
        if key in seen:
            errors.append("manifest: duplicate key '%s'" % key)
        seen.add(key)
        root = entry.get("source", {}).get("root") if isinstance(entry.get("source"), dict) else None
        if root is not None and root not in manifest["roots"]:
            errors.append("entry '%s': source root '%s' is not listed in roots" % (key, root))
    return errors
