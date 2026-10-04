using Conquest.Assets.Lookup;
using Conquest.Assets.Model;

namespace Conquest.Tests.Assets;

/// <summary>
/// Smoke test against the real, private output of the pipeline (Assets/Art/Generated is git-ignored).
/// Skipped when the folder is absent. Override the location with CONQUEST_GENERATED_SHEET.
/// </summary>
public class GeneratedSheetTests
{
    private static string? FindSheet()
    {
        string? env = Environment.GetEnvironmentVariable("CONQUEST_GENERATED_SHEET");
        if (!string.IsNullOrEmpty(env)) return File.Exists(env) ? env : null;
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            string candidate = Path.Combine(dir.FullName, "unity", "Assets", "Art", "Generated", "sprite_sheet.json");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    [Test]
    public void Generated_sheet_parses_and_every_page_file_exists()
    {
        string? path = FindSheet();
        if (path == null) Assert.Ignore("no generated sprite sheet on this machine");
        var sheet = SheetParser.Parse(File.ReadAllText(path!));
        string folder = Path.GetDirectoryName(path)!;
        Assert.That(sheet.PixelsPerUnit, Is.EqualTo(256));
        foreach (var page in sheet.Pages)
        {
            Assert.That(File.Exists(Path.Combine(folder, page.File)), Is.True, page.File);
            Assert.That(page.Width, Is.LessThanOrEqualTo(4096));
            Assert.That(page.Height, Is.LessThanOrEqualTo(4096));
        }
        var catalog = new AssetCatalog(sheet);
        Assert.That(catalog.Resolve(new AssetRequest("u", "scout", state: "selected", slot: "f1")), Is.Not.Null);
        Assert.That(catalog.Resolve(new AssetRequest("bld", "core", level: 1)), Is.Not.Null);
    }
}
