"""Tests for the asset pipeline. Run with Blender's bundled Python (numpy + OpenImageIO):

    <Blender.app>/Contents/Resources/<ver>/python/bin/python3.13 -m unittest discover -s tests -v

Set UPDATE_GOLDEN=1 to rewrite the golden files in conquest/dotnet/Conquest.Tests/golden/ (then run the dotnet
tests: they read the same files).
"""
import copy
import json
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)

import numpy as np  # noqa: E402

import asset_keys  # noqa: E402
import asset_schema as S  # noqa: E402
import build_manifest as BM  # noqa: E402
import cli  # noqa: E402
import content_audit  # noqa: E402
import pack_atlas as PA  # noqa: E402
import png_io  # noqa: E402

GOLDEN = os.path.abspath(os.path.join(TOOLS, "..", "..", "dotnet", "Conquest.Tests", "golden"))
UPDATE = os.environ.get("UPDATE_GOLDEN") == "1"
SHA_FIELDS = ("sha256", "graded_sha256", "source_sha256")

KEY_REQUESTS = [
    {"kind": "tile", "role": "meadow"},
    {"kind": "tile", "role": "t.open", "variant": 1},
    {"kind": "bld", "role": "core", "level": 1},
    {"kind": "u", "role": "shock", "level": 1, "state": "walk", "slot": "f1"},
    {"kind": "u", "role": "scout", "state": "selected", "slot": "f2"},
    {"kind": "u", "role": "line", "level": 3, "variant": 2, "state": "idle", "slot": "f1"},
    {"kind": "fx", "role": "core_smoke"},
]


def rect_picture(width, height, boxes):
    """boxes: [(x0, y0, x1, y1, (r, g, b))] on a transparent canvas."""
    image = np.zeros((height, width, 4), dtype=np.uint8)
    for x0, y0, x1, y1, colour in boxes:
        image[y0:y1, x0:x1, :3] = colour
        image[y0:y1, x0:x1, 3] = 255
    return image


def put(path, image):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    png_io.write_png_rgba(path, image)


def make_fixture(root):
    """Synthetic sources for tests/../fixtures/catalogue.json. Nothing here is game art."""
    for name, colour, graded in (("meadow", (60, 120, 50), (70, 130, 60)), ("stubble", (150, 130, 60), (160, 140, 70))):
        put(os.path.join(root, "t", name + "_snapped.png"), rect_picture(64, 40, [(4, 20, 60, 36, colour)]))
        put(os.path.join(root, "t", name + "_graded.png"), rect_picture(64, 40, [(4, 20, 60, 36, graded)]))
    tower = rect_picture(96, 80, [(20, 10, 60, 70, (120, 80, 50))])
    put(os.path.join(root, "s", "bld.tower.png"), tower)
    put(os.path.join(root, "s", "bld.tower_graded.png"), tower)
    for side, colour in (("P", (20, 100, 110)), ("A", (200, 150, 30))):
        single = rect_picture(40, 60, [(10, 5, 30, 40, colour)])
        put(os.path.join(root, "u", "ban.%s.scout.png" % side), single)
        put(os.path.join(root, "u", "ban.%s.scout_graded.png" % side), single)
        strip = np.concatenate([rect_picture(40, 60, [(10, 5 + 4 * i, 30, 40, colour)]) for i in range(3)], axis=1)
        put(os.path.join(root, "u", "ban.%s.scout_strip.png" % side), strip)
        put(os.path.join(root, "u", "ban.%s.scout_strip_graded.png" % side), strip)
    idle = np.concatenate([rect_picture(30, 40, [(8, 4 + i, 22, 30, (20, 100, 110))]) for i in range(4)], axis=1)
    put(os.path.join(root, "anim", "strips", "banners", "ban.player.scout.idle.png"), idle)
    smoke = np.concatenate([rect_picture(20, 20, [(5, 2 * i, 15, 10 + 2 * i, (200, 200, 200))]) for i in range(2)], axis=1)
    put(os.path.join(root, "anim", "strips", "structures", "st.tower.smoke.png"), smoke)
    spec = {"version": 1, "tile_width_px": 64, "clips": [
        {"name": "ban.player.scout.idle", "category": "banner", "clip": "idle", "role": "scout", "side": "player",
         "frames": 4, "fps": 8, "loop": True, "frame_w": 30, "frame_h": 40, "anchor_px": [15, 36],
         "events": [{"frame": 0, "name": "loop_start"}], "strip": "strips/banners/ban.player.scout.idle.png"},
        {"name": "ban.opposing.scout.idle", "category": "banner", "clip": "idle", "role": "scout", "side": "opposing",
         "frames": 4, "fps": 8, "loop": True, "frame_w": 30, "frame_h": 40, "anchor_px": [15, 36],
         "events": [], "strip": "strips/banners/ban.opposing.scout.idle.png"},
        {"name": "st.tower.smoke", "category": "struct", "clip": "smoke", "structure": "tower", "frames": 2, "fps": 4,
         "loop": True, "frame_w": 20, "frame_h": 20, "anchor_px": [10, 16], "events": [],
         "strip": "strips/structures/st.tower.smoke.png"}]}
    cli.write_text(os.path.join(root, "anim", "anim_spec.json"), cli.dump_json(spec))


def fixture_catalogue():
    with open(os.path.join(TOOLS, "fixtures", "catalogue.json"), "r", encoding="utf-8") as handle:
        return json.load(handle)


def normalise(value):
    """Zero the file hashes (they depend on the zlib build); pixel hashes stay."""
    if isinstance(value, dict):
        return {k: ("<sha>" if k in SHA_FIELDS and v else normalise(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [normalise(v) for v in value]
    return value


def check_golden(test, name, text):
    path = os.path.join(GOLDEN, name)
    if UPDATE:
        os.makedirs(GOLDEN, exist_ok=True)
        cli.write_text(path, text)
    test.assertTrue(os.path.isfile(path), "golden file %s is missing (run with UPDATE_GOLDEN=1)" % path)
    with open(path, "r", encoding="utf-8") as handle:
        expected = json.load(handle)
    test.assertEqual(normalise(json.loads(text)), normalise(expected))


class PipelineCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = os.path.join(cls.tmp.name, "fx")
        make_fixture(cls.root)
        cls.roots = {"fx": cls.root}
        cls.manifest, cls.report = BM.build_manifest(fixture_catalogue(), cls.roots)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def pack(self, manifest=None, variant="snapped", max_page=256, pad=2, packer="shelf", grain="pow2"):
        return PA.pack(manifest or self.manifest, self.roots, None, variant, max_page, pad, True, None, packer, grain)

    # ------------------------------------------------------------ keys
    def test_key_grammar_and_chain_match_the_golden_file(self):
        cases = []
        for r in KEY_REQUESTS:
            args = {k: r.get(k) for k in ("level", "variant", "state", "slot")}
            cases.append({"request": r, "key": asset_keys.format_key(r["kind"], r["role"], **args),
                          "chain": asset_keys.fallback_chain(r["kind"], r["role"], **args)})
        check_golden(self, "keys.golden.json", cli.dump_json({"cases": cases}))

    def test_chain_keeps_slot_before_state_before_level(self):
        chain = asset_keys.fallback_chain("u", "shock", level=1, state="walk", slot="f1")
        self.assertEqual(chain[0], "u.shock.L1.walk@f1")
        self.assertEqual(chain[1], "u.shock.L1@f1")
        self.assertEqual(chain[-1], "u.shock")
        self.assertEqual(len(chain), 8)

    # ------------------------------------------------------------ manifest
    def test_manifest_is_valid_and_audit_clean(self):
        self.assertEqual(self.report["errors"], [])
        self.assertEqual(self.report["findings"], [])
        self.assertEqual(S.validate_manifest(self.manifest), [])

    def test_manifest_matches_the_golden_file(self):
        check_golden(self, "fixture.asset-manifest.json", cli.dump_json(self.manifest))

    def test_expected_keys_and_anchor_conversion(self):
        by_key = {e["key"]: e for e in self.manifest["entries"]}
        self.assertEqual(sorted(by_key), [
            "bld.core.L1", "fx.core_smoke", "tile.meadow", "tile.stubble.v2", "u.scout.idle@f1", "u.scout.pulse@f1",
            "u.scout.pulse@f2", "u.scout@f1", "u.scout@f2"])
        self.assertEqual(by_key["tile.meadow"]["anchor_px"], [32, 30])      # 40 high, anchor 10 from the bottom
        self.assertEqual(by_key["bld.core.L1"]["sort"]["point_offset_px"], [0, -32])  # 2x2 at tile_h 32
        self.assertEqual(by_key["tile.meadow"]["sort"]["point_offset_px"], [0, -16])
        self.assertEqual(by_key["fx.core_smoke"]["sort"]["rule"], "fixed_layer")
        self.assertEqual(by_key["u.scout.pulse@f1"]["source"]["frames"], 3)

    def test_missing_animation_strip_is_skipped_with_a_note(self):
        self.assertTrue(any("ban.opposing.scout.idle" in n for n in self.report["notes"]))

    def test_missing_static_file_is_an_error(self):
        os.remove(os.path.join(self.root, "t", "stubble_snapped.png"))
        try:
            _manifest, report = BM.build_manifest(fixture_catalogue(), self.roots)
        finally:
            put(os.path.join(self.root, "t", "stubble_snapped.png"), rect_picture(64, 40, [(4, 20, 60, 36, (150, 130, 60))]))
        self.assertTrue(any("stubble_snapped.png" in e for e in report["errors"]))

    def test_validation_catches_bad_entries(self):
        broken = copy.deepcopy(self.manifest)
        broken["entries"][0]["key"] = "tile.wrong"
        broken["entries"][1]["layer"] = "nowhere"
        broken["entries"][2]["footprint"] = [0, 1]
        problems = " | ".join(S.validate_manifest(broken))
        self.assertIn("key does not match", problems)
        self.assertIn("layer 'nowhere'", problems)
        self.assertIn("footprint", problems)

    # ------------------------------------------------------------ audit
    def test_audit_flags_forbidden_words_by_token_prefix(self):
        self.assertEqual(content_audit.audit_names(["surface", "cross_beam", "FlagPole", "landing"]).__len__(), 2)

    def test_audit_hook_runs_extra_plugin(self):
        findings = content_audit.audit_manifest(self.manifest, lambda m: ["custom finding"])
        self.assertIn("custom finding", findings)

    def test_audit_flags_a_forbidden_tag(self):
        broken = copy.deepcopy(self.manifest)
        broken["entries"][0]["tags"].append("crescent_moon")
        self.assertTrue(any("crescent" in f for f in content_audit.audit_manifest(broken)))

    def test_pixel_audit_flags_key_green(self):
        image = rect_picture(8, 8, [(0, 0, 4, 4, (0, 255, 0))])
        self.assertTrue(content_audit.audit_pixels(image, "x"))
        self.assertEqual(content_audit.audit_pixels(rect_picture(8, 8, [(0, 0, 4, 4, (120, 80, 50))]), "x"), [])

    # ------------------------------------------------------------ packing
    def test_png_round_trip(self):
        image = rect_picture(13, 7, [(1, 1, 9, 5, (10, 200, 30))])
        path = os.path.join(self.tmp.name, "rt.png")
        png_io.write_png_rgba(path, image)
        np.testing.assert_array_equal(png_io.read_rgba(path), image)
        self.assertEqual(png_io.read_png_size(path), (13, 7))

    def test_packing_is_deterministic(self):
        first, _ = self.pack()
        second, _ = self.pack()
        self.assertEqual({k: cli.sha256_bytes(v) for k, v in first.items()},
                         {k: cli.sha256_bytes(v) for k, v in second.items()})

    def test_sheet_matches_the_golden_file(self):
        files, findings = self.pack()
        self.assertEqual(findings, [])
        check_golden(self, "fixture.sprite_sheet.json", files[PA.SHEET_FILE].decode("utf-8"))

    def test_pages_are_power_of_two_and_sprites_keep_padding_and_pixels(self):
        files, _ = self.pack()
        sheet = json.loads(files[PA.SHEET_FILE])
        pages = []
        for meta in sheet["pages"]:
            path = os.path.join(self.tmp.name, meta["file"])
            with open(path, "wb") as handle:
                handle.write(files[meta["file"]])
            w, h = meta["size"]
            self.assertTrue(w & (w - 1) == 0 and h & (h - 1) == 0 and max(w, h) <= 256, meta)
            pages.append(png_io.read_rgba(path))
        rects = [[] for _ in pages]
        for entry in sheet["entries"]:
            for frame in entry["frames"]:
                rects[frame["page"]].append(frame["rect"])
        for page_rects in rects:
            for i, a in enumerate(page_rects):
                for b in page_rects[i + 1:]:
                    gap_x = max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]))
                    gap_y = max(a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]))
                    self.assertGreaterEqual(max(gap_x, gap_y), 2, (a, b))
        # pixels of an entry equal its source after the union crop; the anchor survives the crop
        entry = next(e for e in sheet["entries"] if e["key"] == "u.scout.idle@f1")
        source = png_io.read_rgba(os.path.join(self.root, "anim", "strips", "banners", "ban.player.scout.idle.png"))
        x0, y0 = entry["trim_offset"]
        w, h = entry["size"]
        for index, frame in enumerate(entry["frames"]):
            rx, ry, rw, rh = frame["rect"]
            expected = source[y0:y0 + h, index * 30 + x0:index * 30 + x0 + w]
            np.testing.assert_array_equal(pages[frame["page"]][ry:ry + rh, rx:rx + rw], expected)
        ax, ay = entry["source_anchor_px"]
        self.assertEqual(entry["pivot_px"], [ax - x0, y0 + h - ay])

    def decoded_frames(self, files):
        """{(key, frame index): pixels} read back out of the written pages of a pack() result."""
        sheet = json.loads(files[PA.SHEET_FILE])
        pages = []
        for meta in sheet["pages"]:
            path = os.path.join(self.tmp.name, "dec_" + meta["file"])
            with open(path, "wb") as handle:
                handle.write(files[meta["file"]])
            pages.append(png_io.read_rgba(path))
        out = {}
        for entry in sheet["entries"]:
            for index, frame in enumerate(entry["frames"]):
                x, y, w, h = frame["rect"]
                out[(entry["key"], index)] = pages[frame["page"]][y:y + h, x:x + w]
        return sheet, out

    def test_maxrects_packer_keeps_every_sprite_pixel_and_padding(self):
        _files, _ = self.pack()
        base_sheet, base = self.decoded_frames(_files)
        for grain in ("pow2", "256"):
            files, findings = self.pack(packer="maxrects", grain=grain, max_page=256 if grain == "pow2" else 512)
            self.assertEqual(findings, [])
            sheet, frames = self.decoded_frames(files)
            self.assertEqual(sorted(frames), sorted(base))
            for ref, pixels in frames.items():
                np.testing.assert_array_equal(pixels, base[ref])
            for meta in sheet["pages"]:
                w, h = meta["size"]
                if grain == "pow2":
                    self.assertTrue(w & (w - 1) == 0 and h & (h - 1) == 0, meta)
                else:
                    self.assertTrue(w % 256 == 0 and h % 256 == 0, meta)
            rects = [[] for _ in sheet["pages"]]
            for entry in sheet["entries"]:
                self.assertEqual(entry["pixel_sha256"], next(e for e in base_sheet["entries"] if e["key"] == entry["key"])["pixel_sha256"])
                for frame in entry["frames"]:
                    rects[frame["page"]].append(frame["rect"])
            for meta, page_rects in zip(sheet["pages"], rects):
                for i, a in enumerate(page_rects):
                    self.assertGreaterEqual(a[0], 2)
                    self.assertGreaterEqual(a[1], 2)
                    self.assertLessEqual(a[0] + a[2] + 2, meta["size"][0])
                    self.assertLessEqual(a[1] + a[3] + 2, meta["size"][1])
                    for b in page_rects[i + 1:]:
                        gap_x = max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]))
                        gap_y = max(a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]))
                        self.assertGreaterEqual(max(gap_x, gap_y), 2, (a, b))

    def test_maxrects_packer_is_deterministic_and_never_larger_than_a_full_page_set(self):
        first, _ = self.pack(packer="maxrects", grain="256", max_page=512)
        second, _ = self.pack(packer="maxrects", grain="256", max_page=512)
        self.assertEqual({k: cli.sha256_bytes(v) for k, v in first.items()},
                         {k: cli.sha256_bytes(v) for k, v in second.items()})

    def test_maxrects_shrinks_a_half_empty_last_page(self):
        items = [(100, 100, ("a", i)) for i in range(4)]
        pages = PA.maxrects_packing(items, 512, 2, "256")
        self.assertEqual(len(pages), 1)
        self.assertEqual(PA.page_extent(pages[0], "256"), (256, 256))
        with self.assertRaises(PA.PackError):
            PA.maxrects_packing([(600, 10, ("big", 0))], 512, 2, "256")

    def test_graded_variant_uses_the_graded_files(self):
        snapped, _ = self.pack(variant="snapped")
        with_graded = copy.deepcopy(self.manifest)
        with_graded["entries"] = [e for e in with_graded["entries"] if e["source"]["graded_path"]]
        graded, _ = self.pack(with_graded, variant="graded")
        s_sheet, g_sheet = json.loads(snapped[PA.SHEET_FILE]), json.loads(graded[PA.SHEET_FILE])
        self.assertEqual(g_sheet["variant"], "graded")
        a = next(e for e in s_sheet["entries"] if e["key"] == "tile.meadow")
        b = next(e for e in g_sheet["entries"] if e["key"] == "tile.meadow")
        self.assertNotEqual(a["pixel_sha256"], b["pixel_sha256"])

    def test_graded_variant_without_graded_copy_is_an_error(self):
        broken = copy.deepcopy(self.manifest)
        entry = next(e for e in broken["entries"] if e["key"] == "fx.core_smoke")
        with self.assertRaises(PA.PackError):
            PA.load_entry_frames(entry, self.roots, "graded")

    def test_stale_manifest_hash_is_an_error(self):
        broken = copy.deepcopy(self.manifest)
        broken["entries"][0]["source"]["sha256"] = "0" * 64
        with self.assertRaises(PA.PackError):
            self.pack(broken)

    def test_sprite_too_large_for_the_page_is_an_error(self):
        with self.assertRaises(PA.PackError):
            self.pack(max_page=32)

    def test_pixel_audit_failure_blocks_output(self):
        green = rect_picture(64, 40, [(4, 20, 60, 36, (0, 255, 0))])
        path = os.path.join(self.root, "t", "meadow_snapped.png")
        original = png_io.read_rgba(path)
        put(path, green)
        try:
            manifest, _ = BM.build_manifest(fixture_catalogue(), self.roots)
            _files, findings = self.pack(manifest)
        finally:
            put(path, original)
        self.assertTrue(any("tile.meadow" in f for f in findings))

    # ------------------------------------------------------------ schema files
    def test_json_schema_files_agree_with_the_validator(self):
        with open(os.path.join(TOOLS, "schema", "asset-manifest.schema.json"), "r", encoding="utf-8") as handle:
            schema = json.load(handle)
        entry = schema["$defs"]["entry"]
        self.assertEqual(sorted(entry["required"]), sorted(S.ENTRY_REQUIRED))
        self.assertEqual(sorted(schema["required"]), sorted(S.MANIFEST_REQUIRED))
        self.assertEqual(sorted(entry["properties"]["kind"]["enum"]), sorted(S.KINDS))
        with open(os.path.join(TOOLS, "schema", "sprite-sheet.schema.json"), "r", encoding="utf-8") as handle:
            sheet_schema = json.load(handle)
        self.assertEqual(sheet_schema["properties"]["schema"]["const"], S.SHEET_SCHEMA)


if __name__ == "__main__":
    unittest.main()
