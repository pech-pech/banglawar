using System.Text.Json;
using System.Text.Json.Nodes;
using Conquest.Content;
using Conquest.Content.Model;

namespace Conquest.Tests.Content;

/// <summary>Finds the shipped data files (copied next to the test assembly) and builds mutated copies of them.</summary>
internal static class ContentTestData
{
    public static string DataDir => Path.Combine(AppContext.BaseDirectory, "data");

    public static string ScenarioText => File.ReadAllText(Path.Combine(DataDir, "scenarios", "skirmish-1971.json"));

    public static string ThemeText => File.ReadAllText(Path.Combine(DataDir, "themes", "bd1971", "theme.json"));

    public static string AllowListText => File.ReadAllText(Path.Combine(DataDir, "allowlists", "content-words.json"));

    /// <summary>Role-level keys the asset manifest holds today (conquest/tools/assets/themes/bd1971/catalogue.json).</summary>
    public static readonly string[] ManifestKeys =
    {
        "tile.meadow", "tile.paddy_water", "tile.paddy_dense", "tile.stubble", "tile.forest", "tile.tea",
        "tile.water",
        "bld.core", "bld.food", "bld.habitat", "bld.scout_post", "bld.port",
        "bld.basic_extractor", "bld.hard_extractor", "bld.coin_extractor", "bld.converter", "bld.attractor", "bld.garrison",
        "bld.academy",
        "u.scout", "u.founder", "u.commander", "u.line", "u.shock", "u.ranged", "u.transport", "u.militia",
    };

    public static AllowListData AllowList()
    {
        LoadResult<AllowListData> r = ContentLoader.LoadAllowList(AllowListText);
        Assert.That(r.Ok, Is.True, string.Join("\n", r.Errors));
        return r.Data!;
    }

    public static ScenarioData Scenario()
    {
        LoadResult<ScenarioData> r = ContentLoader.LoadScenario(ScenarioText, AllowList());
        Assert.That(r.Ok, Is.True, string.Join("\n", r.Errors));
        return r.Data!;
    }

    /// <summary>Applies an edit to a copy of the JSON text and returns the new text.</summary>
    public static string Mutate(string text, Action<JsonNode> edit)
    {
        JsonNode root = JsonNode.Parse(text)!;
        edit(root);
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    public static LoadResult<ScenarioData> LoadScenarioMutated(Action<JsonNode> edit)
    {
        return ContentLoader.LoadScenario(Mutate(ScenarioText, edit), AllowList());
    }

    public static LoadResult<ThemeData> LoadThemeMutated(Action<JsonNode> edit, bool withAllowList = true)
    {
        return ContentLoader.LoadTheme(Mutate(ThemeText, edit), Scenario(), ManifestKeys,
            withAllowList ? AllowList() : null);
    }

    public static void AssertHas<T>(LoadResult<T> result, string path, string code)
        where T : class
    {
        Assert.That(result.Ok, Is.False, "expected the content to be rejected");
        Assert.That(result.Data, Is.Null);
        bool found = result.Errors.Any(e => e.Path == path && e.Code == code);
        Assert.That(found, Is.True, "expected " + code + " at " + path + " but got:\n" + string.Join("\n", result.Errors));
    }
}
