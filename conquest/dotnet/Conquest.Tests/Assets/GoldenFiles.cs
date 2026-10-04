using Conquest.Assets.Json;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;

namespace Conquest.Tests.Assets;

/// <summary>Loads the golden files written by tools/assets/tests/test_pipeline.py (UPDATE_GOLDEN=1).</summary>
internal static class GoldenFiles
{
    public static string Path(string name) => System.IO.Path.Combine(AppContext.BaseDirectory, "golden", name);

    public static string Text(string name) => File.ReadAllText(Path(name));

    public static SpriteSheet Sheet() => SheetParser.Parse(Text("fixture.sprite_sheet.json"));

    public static AssetCatalog Catalog() => new AssetCatalog(Sheet());

    public static Dictionary<string, object?> Obj(object? value) => (Dictionary<string, object?>)value!;

    public static List<object?> List(object? value) => (List<object?>)value!;
}
