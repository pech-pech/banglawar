using System.Text.Json.Nodes;
using Conquest.Content;
using Conquest.Content.Model;

namespace Conquest.Tests.Content;

public class ThemeTests
{
    public sealed record Case(string Name, Action<JsonNode> Edit, string Path, string Code)
    {
        public override string ToString() => Name;
    }

    public static IEnumerable<Case> BrokenThemes()
    {
        yield return new Case("label missing for a role", r => ((JsonObject)r["labels"]!).Remove("bld.core"), "$.labels", "theme.label_missing");
        yield return new Case("label for something that is not a role", r => r["labels"]!["bld.moat"] = "Moat", "$.labels.bld.moat", "theme.label_key");
        yield return new Case("only the opposing side may override a label", r => r["labels"]!["bld.core@f3"] = "Third HQ",
            "$.labels.bld.core@f3", "theme.label_key");
        yield return new Case("label too long", r => r["labels"]!["bld.core"] = new string('x', 61), "$.labels.bld.core", "theme.label_text");
        yield return new Case("opposing side's name is pinned", r => r["factions"]!["f2"]!["name"] = "Eastern Army", "$.factions.f2.name", "theme.f2_name_pin");
        yield return new Case("faction colour must be hex", r => r["factions"]!["f1"]!["color"] = "green", "$.factions.f1.color", "theme.color");
        yield return new Case("both sides need different colours", r => r["factions"]!["f2"]!["color"] = "#1f6f4a", "$.factions.f2.color", "theme.color");
        yield return new Case("faction missing", r => ((JsonObject)r["factions"]!).Remove("f2"), "$.factions", "theme.faction_missing");
        yield return new Case("faction without an adjective", r => r["factions"]!["f1"]!["adjective"] = "", "$.factions.f1", "theme.faction_name");
        yield return new Case("tile asset missing for a look the map uses", r => ((JsonObject)r["terrain_assets"]!).Remove("tea"),
            "$.terrain_assets", "theme.asset_coverage");
        yield return new Case("tile asset of the wrong kind", r => r["terrain_assets"]!["tea"] = "bld.tea", "$.terrain_assets.tea", "theme.asset_key");
        yield return new Case("unknown look in the tile table", r => r["terrain_assets"]!["lava"] = "tile.lava", "$.terrain_assets.lava", "theme.look");
        yield return new Case("building binding missing", r => ((JsonObject)r["building_assets"]!).Remove("bld.port"),
            "$.building_assets", "theme.asset_coverage");
        yield return new Case("building binding for a unit role", r => r["building_assets"]!["u.scout"] = JsonNode.Parse("{\"asset\":\"bld.x\",\"glyph\":\"hut\"}"),
            "$.building_assets.u.scout", "theme.asset_role");
        yield return new Case("unit binding with a malformed key", r => r["unit_assets"]!["u.scout"]!["asset"] = "Scout!", "$.unit_assets.u.scout.asset", "theme.asset_key");
        yield return new Case("asset neither in the manifest nor planned", r => r["terrain_assets"]!["tea"] = "tile.tea_dry", "$", "theme.asset_missing");
        yield return new Case("planned asset already in the manifest",
            r => ((JsonArray)r["planned_assets"]!).Add("bld.port"), "$.planned_assets[0]", "theme.planned_stale");
        yield return new Case("planned asset nobody uses",
            r => ((JsonArray)r["planned_assets"]!).Add("bld.nothing"), "$.planned_assets[0]", "theme.planned_unknown");
        yield return new Case("site without a display name", r => ((JsonObject)r["names"]!["sites"]!).Remove("site.zone_1"),
            "$.names.sites", "theme.name_missing");
        yield return new Case("name for a site the scenario lacks", r => r["names"]!["sites"]!["site.moon"] = "Moon base",
            "$.names.sites.site.moon", "theme.name_unknown");
        yield return new Case("two sites with the same name", r => r["names"]!["sites"]!["site.zone_1"] = "Capital garrison",
            "$.names.sites.site.zone_1", "theme.name_duplicate");
        yield return new Case("empty display name", r => r["names"]!["entries"]!["entry.s08"] = " ", "$.names.entries.entry.s08", "theme.name_empty");
        yield return new Case("entry group without a name", r => ((JsonObject)r["names"]!["entries"]!).Remove("entry.s02"),
            "$.names.entries", "theme.name_missing");
        yield return new Case("region without a name", r => ((JsonObject)r["names"]!["regions"]!).Remove("region.r02"),
            "$.names.regions", "theme.name_missing");
        yield return new Case("season without a label", r => ((JsonObject)r["calendar"]!["season_labels"]!).Remove("season.wet"),
            "$.calendar.season_labels", "theme.name_missing");
        yield return new Case("wrong schema id", r => r["schema"] = "theme/2", "$.schema", "theme.schema");
        yield return new Case("unsupported ruleset", r => r["requires_ruleset"]!["major"] = 3, "$.requires_ruleset", "theme.requires");
        yield return new Case("unsupported locale", r => r["default_locale"] = "bn", "$.default_locale", "theme.locale");
        yield return new Case("empty display name for the pack", r => r["display_name"] = "", "$.display_name", "theme.display_name");
        yield return new Case("unknown key", r => r["flag_art"] = "x", "$.flag_art", "schema.unknown_key");
        yield return new Case("label with a depiction word", r => r["labels"]!["bld.core"] = "Flag post", "$.labels.bld.core", "content.forbidden_word");
        yield return new Case("label that says people", r => r["labels"]!["res.pop"] = "People", "$.labels.res.pop", "content.forbidden_word");
        yield return new Case("label with a loaded word", r => r["labels"]!["u.line@f2"] = "Enemy company", "$.labels.u.line@f2", "content.forbidden_word");
        yield return new Case("site name that says town", r => r["names"]!["sites"]!["site.town_01"] = "Border town", "$.names.sites.site.town_01", "content.forbidden_word");
        yield return new Case("weapon outside the allow-list", r => r["labels"]!["u.shock"] = "Rifle party", "$.labels.u.shock", "content.forbidden_word");
        yield return new Case("allowed word at a path the list does not cover", r => r["labels"]!["u.ranged@f2"] = "Mortar battery",
            "$.labels.u.ranged@f2", "content.forbidden_word");
    }

    [Test]
    public void Shipped_theme_loads_with_no_errors_against_the_scenario_and_manifest()
    {
        LoadResult<ThemeData> r = ContentLoader.LoadTheme(ContentTestData.ThemeText, ContentTestData.Scenario(),
            ContentTestData.ManifestKeys, ContentTestData.AllowList());

        Assert.That(r.Errors, Is.Empty, string.Join("\n", r.Errors));
        Assert.That(r.Data!.Id, Is.EqualTo("bd1971"));
        Assert.That(r.Data.Factions.Single(f => f.Slot == "f2").Name, Is.EqualTo("Pakistan Army, Eastern Command"));
    }

    [Test]
    public void Shipped_theme_binds_every_role_the_scenario_uses()
    {
        ThemeData t = ContentLoader.LoadTheme(ContentTestData.ThemeText, null, null, ContentTestData.AllowList()).Data!;
        ScenarioData s = ContentTestData.Scenario();

        foreach (LegendEntry l in s.Map.Legend)
        {
            Assert.That(t.FindName(t.TerrainAssets, l.Look), Does.StartWith("tile."), l.Look);
        }

        foreach (string role in s.PrePlacedBases.SelectMany(b => b.Buildings).Select(b => b.Role).Distinct())
        {
            Assert.That(t.BuildingAssets.Any(a => a.Role == role), Is.True, role);
        }

        foreach (string role in s.Arrivals.SelectMany(a => a.Units).Select(u => u.Role).Distinct())
        {
            Assert.That(t.UnitAssets.Any(a => a.Role == role), Is.True, role);
        }

        Assert.That(t.FindName(t.SiteNames, "site.capital"), Is.EqualTo("Capital garrison"));
        Assert.That(t.FindName(t.SiteNames, "site.nowhere"), Is.Null);
    }

    [Test]
    public void Theme_asset_references_use_the_manifest_key_grammar()
    {
        ThemeData t = ContentLoader.LoadTheme(ContentTestData.ThemeText, null, null, ContentTestData.AllowList()).Data!;

        var keys = t.TerrainAssets.Select(a => a.Value)
            .Concat(t.BuildingAssets.Select(a => a.Asset))
            .Concat(t.UnitAssets.Select(a => a.Asset));
        foreach (string key in keys)
        {
            Assert.That(key, Does.Match("^(tile|bld|u)\\.[a-z][a-z0-9_]*$"));
        }
    }

    [TestCaseSource(nameof(BrokenThemes))]
    public void Broken_theme_variants_fail_with_the_right_path(Case c)
    {
        LoadResult<ThemeData> result = ContentTestData.LoadThemeMutated(c.Edit);

        ContentTestData.AssertHas(result, c.Path, c.Code);
    }

    [Test]
    public void There_are_at_least_fifteen_broken_theme_variants()
    {
        Assert.That(BrokenThemes().Count(), Is.GreaterThanOrEqualTo(15));
    }

    [Test]
    public void Role_labels_that_name_equipment_need_the_reviewed_allow_list()
    {
        LoadResult<ThemeData> r = ContentLoader.LoadTheme(ContentTestData.ThemeText, ContentTestData.Scenario(), ContentTestData.ManifestKeys);

        Assert.That(r.Ok, Is.False);
        var hits = r.Errors.Where(e => e.Code == "content.forbidden_word").Select(e => e.Path).ToList();
        Assert.That(hits, Is.EquivalentTo(new[]
        {
            "$.labels.res.hard", "$.labels.u.ranged", "$.labels.u.ranged@f2", "$.labels.u.shock@f2", "$.labels.u.transport@f2",
        }));
    }

    [Test]
    public void Theme_without_a_scenario_or_manifest_skips_the_cross_checks()
    {
        LoadResult<ThemeData> r = ContentLoader.LoadTheme(ContentTestData.ThemeText, null, null, ContentTestData.AllowList());

        Assert.That(r.Ok, Is.True, string.Join("\n", r.Errors));
    }

    [Test]
    public void Scenario_that_hints_at_another_theme_is_rejected()
    {
        ScenarioData other = ContentTestData.LoadScenarioMutated(root => root["theme_hint"] = "second").Data!;

        LoadResult<ThemeData> r = ContentLoader.LoadTheme(ContentTestData.ThemeText, other, ContentTestData.ManifestKeys, ContentTestData.AllowList());

        ContentTestData.AssertHas(r, "$.id", "theme.hint");
    }

    [Test]
    public void Golden_hash_of_the_shipped_theme_is_pinned()
    {
        LoadResult<ThemeData> r = ContentLoader.LoadTheme(ContentTestData.ThemeText, ContentTestData.Scenario(),
            ContentTestData.ManifestKeys, ContentTestData.AllowList());

        Assert.That(r.HashHex, Is.EqualTo(GoldenHashes.Theme));
        Assert.That(r.Canonical.Length, Is.EqualTo(GoldenHashes.ThemeCanonicalLength));
    }

    [Test]
    public void Theme_syntax_errors_are_reported_not_thrown()
    {
        LoadResult<ThemeData> r = ContentLoader.LoadTheme("{\"a\":", null, null);

        Assert.That(r.Ok, Is.False);
        Assert.That(r.Errors[0].Code, Is.EqualTo("json.unexpected_end"));
    }
}
