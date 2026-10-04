using Conquest.Assets.Json;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;
using static Conquest.Tests.Assets.GoldenFiles;

namespace Conquest.Tests.Assets;

public class AssetLookupTests
{
    private static int? OptInt(object? v) => v == null ? null : (int)(long)v;

    private static IEnumerable<TestCaseData> KeyCases()
    {
        var doc = Obj(MiniJson.Parse(Text("keys.golden.json")));
        foreach (var item in List(doc["cases"]))
        {
            var c = Obj(item);
            var r = Obj(c["request"]);
            var request = new AssetRequest((string)r["kind"]!, (string)r["role"]!,
                r.ContainsKey("level") ? OptInt(r["level"]) : null, r.ContainsKey("variant") ? OptInt(r["variant"]) : null,
                r.ContainsKey("state") ? (string?)r["state"] : null, r.ContainsKey("slot") ? (string?)r["slot"] : null);
            yield return new TestCaseData(request, (string)c["key"]!, List(c["chain"]).Select(x => (string)x!).ToArray())
                .SetName("Key_and_chain_match_python: " + c["key"]);
        }
    }

    [TestCaseSource(nameof(KeyCases))]
    public void Key_and_chain_match_python(AssetRequest request, string key, string[] chain)
    {
        Assert.That(request.Key, Is.EqualTo(key));
        Assert.That(AssetKey.FallbackChain(request), Is.EqualTo(chain));
    }

    [Test]
    public void Request_requires_kind_and_role()
    {
        Assert.Throws<ArgumentException>(() => new AssetRequest("", "x"));
        Assert.Throws<ArgumentException>(() => new AssetRequest("u", ""));
        Assert.Throws<ArgumentException>(() => AssetKey.Format("", ""));
    }

    [Test]
    public void Empty_state_and_slot_count_as_absent()
    {
        var request = new AssetRequest("u", "scout", state: "", slot: "");
        Assert.That(request.Key, Is.EqualTo("u.scout"));
    }

    [Test]
    public void With_replaces_the_optional_parts()
    {
        var request = new AssetRequest("u", "scout", 2, 1, "idle", "f1").With(null, null, null, "f2");
        Assert.That(request.Key, Is.EqualTo("u.scout@f2"));
    }

    [Test]
    public void Resolve_finds_the_exact_entry()
    {
        var hit = Catalog().Resolve(new AssetRequest("u", "scout", state: "idle", slot: "f1"))!;
        Assert.That(hit.IsExact, Is.True);
        Assert.That(hit.Entry.Key, Is.EqualTo("u.scout.idle@f1"));
        Assert.That(hit.RequestedKey, Is.EqualTo("u.scout.idle@f1"));
    }

    [Test]
    public void Resolve_keeps_the_side_when_the_state_is_missing()
    {
        var hit = Catalog().Resolve(new AssetRequest("u", "scout", state: "selected", slot: "f2"))!;
        Assert.That(hit.IsExact, Is.False);
        Assert.That(hit.Entry.Key, Is.EqualTo("u.scout@f2"));
    }

    [Test]
    public void Resolve_never_invents_a_level_the_sheet_lacks()
    {
        Assert.That(Catalog().Resolve(new AssetRequest("bld", "core", level: 1))!.IsExact, Is.True);
        Assert.That(Catalog().Resolve(new AssetRequest("bld", "core", level: 3)), Is.Null);
        Assert.That(Catalog().Resolve(new AssetRequest("bld", "core")), Is.Null);
    }

    [Test]
    public void Resolve_returns_null_when_nothing_matches()
    {
        Assert.That(Catalog().Resolve(new AssetRequest("u", "nobody", slot: "f1")), Is.Null);
    }

    [Test]
    public void TryGet_is_exact_only()
    {
        var catalog = Catalog();
        Assert.That(catalog.TryGet("tile.meadow", out var entry), Is.True);
        Assert.That(entry.Role, Is.EqualTo("meadow"));
        Assert.That(catalog.TryGet("tile.nothing", out _), Is.False);
    }

    [Test]
    public void OfKind_and_count_agree_with_the_sheet()
    {
        var catalog = Catalog();
        Assert.That(catalog.Count, Is.EqualTo(catalog.Sheet.Entries.Count));
        Assert.That(catalog.OfKind("u").All(e => e.Kind == "u"), Is.True);
        Assert.That(catalog.OfKind("u").Count(), Is.GreaterThan(1));
        Assert.That(catalog.OfKind("zzz"), Is.Empty);
    }

    [Test]
    public void Layer_lookup_finds_declared_layers_only()
    {
        var catalog = Catalog();
        Assert.That(catalog.Layer("unit").Tiebreak, Is.EqualTo(3));
        Assert.Throws<KeyNotFoundException>(() => catalog.Layer("nowhere"));
    }

    [Test]
    public void FromJson_builds_a_catalog()
    {
        Assert.That(AssetCatalog.FromJson(Text("fixture.sprite_sheet.json")).Count, Is.GreaterThan(0));
        Assert.Throws<ArgumentNullException>(() => new AssetCatalog(null!));
    }

    // ---- animation clock
    private static SheetEntry Clip(bool loop) =>
        Catalog().Sheet.Entries.First(e => e.Key == (loop ? "u.scout.idle@f1" : "u.scout.pulse@f1"));

    [Test]
    public void Looping_clip_wraps_and_non_looping_clip_holds_the_last_frame()
    {
        var idle = Clip(true);   // 4 frames at 8 fps, loops
        Assert.That(AnimationClock.FrameAt(idle, 0), Is.EqualTo(0));
        Assert.That(AnimationClock.FrameAt(idle, 0.13), Is.EqualTo(1));
        Assert.That(AnimationClock.FrameAt(idle, 0.5), Is.EqualTo(0));
        Assert.That(AnimationClock.Duration(idle), Is.EqualTo(0.5).Within(1e-9));
        Assert.That(AnimationClock.IsFinished(idle, 99), Is.False);
        var pulse = Clip(false);  // 3 frames at 6 fps, plays once
        Assert.That(AnimationClock.FrameAt(pulse, 10), Is.EqualTo(2));
        Assert.That(AnimationClock.IsFinished(pulse, 0.4), Is.False);
        Assert.That(AnimationClock.IsFinished(pulse, 0.5), Is.True);
    }

    [Test]
    public void Clock_is_zero_for_still_images_and_negative_time()
    {
        var still = Catalog().Sheet.Entries.First(e => e.Key == "tile.meadow");
        Assert.That(AnimationClock.FrameAt(still, 5), Is.EqualTo(0));
        Assert.That(AnimationClock.Duration(still), Is.EqualTo(0));
        Assert.That(AnimationClock.FrameAt(Clip(true), -1), Is.EqualTo(0));
    }

    [Test]
    public void Events_fire_inside_the_window_only()
    {
        var idle = Clip(true);
        Assert.That(AnimationClock.EventsBetween(idle, -1, 0).Select(e => e.Name), Is.EqualTo(new[] { "loop_start" }));
        Assert.That(AnimationClock.EventsBetween(idle, 0, 1), Is.Empty);
        var still = Catalog().Sheet.Entries.First(e => e.Key == "tile.meadow");
        Assert.That(AnimationClock.EventsBetween(still, -1, 1), Is.Empty);
    }

    // ---- isometric helpers
    [Test]
    public void Tile_centres_follow_the_two_to_one_projection()
    {
        var (x, y) = IsoProjection.TileCentre(1, 0, 256, 256);
        Assert.That(x, Is.EqualTo(0.5).Within(1e-12));
        Assert.That(y, Is.EqualTo(-0.25).Within(1e-12));
        var (x2, y2) = IsoProjection.TileCentre(1, 1, 256, 256);
        Assert.That(x2, Is.EqualTo(0).Within(1e-12));
        Assert.That(y2, Is.EqualTo(-0.5).Within(1e-12));
    }

    [Test]
    public void Footprint_anchor_is_the_centre_of_the_cells()
    {
        var a = IsoProjection.FootprintAnchor(0, 0, new IntPair(2, 2), 256, 256);
        var c = IsoProjection.TileCentre(0.5, 0.5, 256, 256);
        Assert.That(a.X, Is.EqualTo(c.X).Within(1e-12));
        Assert.That(a.Y, Is.EqualTo(c.Y).Within(1e-12));
    }

    [Test]
    public void Depth_key_uses_the_front_cell_and_ties_break_by_layer_then_bias()
    {
        var one = new IntPair(1, 1);
        Assert.That(IsoProjection.DepthKey(2, 3, one), Is.EqualTo(5));
        Assert.That(IsoProjection.DepthKey(2, 3, new IntPair(2, 2)), Is.EqualTo(7));
        var catalog = Catalog();
        var terrain = catalog.Layer("terrain");
        var unit = catalog.Layer("unit");
        Assert.That(IsoProjection.Compare(4, unit, 0, 5, terrain, 0), Is.LessThan(0));
        Assert.That(IsoProjection.Compare(5, terrain, 0, 5, unit, 0), Is.LessThan(0));
        Assert.That(IsoProjection.Compare(5, unit, 1, 5, unit, 0), Is.GreaterThan(0));
        Assert.That(IsoProjection.Compare(5, unit, 0, 5, unit, 0), Is.EqualTo(0));
    }

    // ---- geometry used by the importer
    [Test]
    public void Unity_rects_are_flipped_to_a_bottom_left_origin()
    {
        var r = SpriteGeometry.ToUnityRect(new SheetRect(10, 20, 30, 40), 256);
        Assert.That((r.X, r.Y, r.Width, r.Height), Is.EqualTo((10, 196, 30, 40)));
    }

    [Test]
    public void Sprite_and_file_names_are_stable_and_tool_friendly()
    {
        Assert.That(SpriteGeometry.SpriteName("u.scout@f1", 3), Is.EqualTo("u.scout@f1#03"));
        Assert.That(SpriteGeometry.FileNameForKey("u.scout.idle@f1"), Is.EqualTo("u.scout.idle_at_f1"));
    }

    [Test]
    public void Sort_point_offset_is_converted_to_world_units()
    {
        var e = Catalog().Sheet.Entries.First(x => x.Key == "bld.core.L1");
        var (x, y) = SpriteGeometry.SortPointOffsetUnits(e, 64);
        Assert.That(x, Is.EqualTo(0).Within(1e-12));
        Assert.That(y, Is.EqualTo(-0.5).Within(1e-12));
    }
}
