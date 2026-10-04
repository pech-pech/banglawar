using Conquest.Assets.Json;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;
using static Conquest.Tests.Assets.GoldenFiles;

namespace Conquest.Tests.Assets;

/// <summary>
/// The golden manifest and sprite sheet come from the Python pipeline run on synthetic pictures. These tests
/// pin what the C# side must understand, so a change on either side shows up here.
/// </summary>
public class GoldenManifestTests
{
    [Test]
    public void Sheet_and_manifest_describe_the_same_keys()
    {
        var manifest = Obj(MiniJson.Parse(Text("fixture.asset-manifest.json")));
        var manifestKeys = List(manifest["entries"]).Select(e => (string)Obj(e)["key"]!).OrderBy(k => k, StringComparer.Ordinal);
        var sheetKeys = Sheet().Entries.Select(e => e.Key).OrderBy(k => k, StringComparer.Ordinal);
        Assert.That(sheetKeys, Is.EqualTo(manifestKeys));
    }

    [Test]
    public void Golden_sheet_has_the_expected_shape()
    {
        var sheet = Sheet();
        Assert.That(sheet.Theme, Is.EqualTo("fixture"));
        Assert.That(sheet.TilePx, Is.EqualTo(64));
        Assert.That(sheet.PixelsPerUnit, Is.EqualTo(64));
        Assert.That(sheet.Variant, Is.EqualTo("snapped"));
        Assert.That(sheet.ProjectionTileWidth, Is.EqualTo(2 * sheet.ProjectionTileHeight));
        Assert.That(sheet.Layers.Select(l => l.Id), Is.EqualTo(new[] { "ground", "terrain", "structure", "unit", "fx" }));
        Assert.That(sheet.Entries.Select(e => e.Key), Is.Ordered.Using<string>(StringComparer.Ordinal));
        Assert.That(sheet.Pages, Is.Not.Empty);
        foreach (var page in sheet.Pages)
        {
            Assert.That(page.Width & (page.Width - 1), Is.EqualTo(0), page.File);
            Assert.That(page.Height & (page.Height - 1), Is.EqualTo(0), page.File);
        }
    }

    [Test]
    public void Golden_entry_fields_survive_the_parse()
    {
        var entry = Catalog().Resolve(new AssetRequest("u", "scout", state: "idle", slot: "f1"))!.Entry;
        Assert.That(entry.Key, Is.EqualTo("u.scout.idle@f1"));
        Assert.That(entry.Fps, Is.EqualTo(8));
        Assert.That(entry.Loop, Is.True);
        Assert.That(entry.FrameCount, Is.EqualTo(4));
        Assert.That(entry.Events.Single().Name, Is.EqualTo("loop_start"));
        Assert.That(entry.Layer, Is.EqualTo("unit"));
        Assert.That(entry.Sort.Rule, Is.EqualTo(SortInfo.CustomAxisY));
        Assert.That(entry.Sort.PointOffsetPx.Y, Is.EqualTo(-16));
        Assert.That(entry.ReviewStatus, Is.EqualTo("prototype"));
        Assert.That(entry.Tags, Does.Contain("banner").Or.Contain("unit"));
        Assert.That(entry.Frames.Select(f => f.Rect.Width).Distinct().Count(), Is.EqualTo(1));
        Assert.That(entry.PixelSha256, Has.Length.EqualTo(64));
    }

    [Test]
    public void Pivot_keeps_the_anchor_through_the_trim()
    {
        // pivot_px.x = source anchor x - trim x; pivot_px.y = trim bottom - source anchor y (from the bottom edge).
        foreach (var e in Sheet().Entries)
        {
            Assert.That(e.PivotPx.X, Is.EqualTo(e.SourceAnchorPx.X - e.TrimOffset.X), e.Key);
            Assert.That(e.PivotPx.Y, Is.EqualTo(e.TrimOffset.Y + e.Size.Y - e.SourceAnchorPx.Y), e.Key);
        }
    }

    [Test]
    public void Fixed_layer_entries_have_no_sort_offset()
    {
        var smoke = Catalog().TryGet("fx.core_smoke", out var e) ? e : throw new AssertionException("missing");
        Assert.That(smoke.Sort.Rule, Is.EqualTo(SortInfo.FixedLayer));
        Assert.That(smoke.Sort.PointOffsetPx.X, Is.EqualTo(0));
        Assert.That(smoke.Sort.PointOffsetPx.Y, Is.EqualTo(0));
    }

    [Test]
    public void Normalized_pivot_is_the_pixel_pivot_over_the_size()
    {
        var e = Catalog().TryGet("bld.core.L1", out var found) ? found : throw new AssertionException("missing");
        var (x, y) = e.NormalizedPivot;
        Assert.That(x, Is.EqualTo((double)e.PivotPx.X / e.Size.X).Within(1e-12));
        Assert.That(y, Is.EqualTo((double)e.PivotPx.Y / e.Size.Y).Within(1e-12));
    }
}
