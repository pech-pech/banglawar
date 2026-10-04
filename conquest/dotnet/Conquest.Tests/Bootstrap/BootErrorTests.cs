using System.Text.Json.Nodes;
using Conquest.Bootstrap;
using Conquest.Content.Model;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Tests.Content;
using static Conquest.Tests.Bootstrap.BootstrapTestKit;

namespace Conquest.Tests.Bootstrap;

public class BootErrorTests
{
    private static ScenarioData Good => ContentTestData.Scenario();

    private static ScenarioData With(
        MapData? map = null,
        IReadOnlyList<EntryGroupData>? groups = null,
        IReadOnlyList<ArrivalData>? arrivals = null,
        IReadOnlyList<PrePlacedBase>? bases = null,
        IReadOnlyList<string>? capSlots = null,
        IReadOnlyList<TimedEffectData>? timed = null,
        EndConditionsData? end = null,
        IReadOnlyList<PlayerData>? players = null)
    {
        ScenarioData g = Good;
        return new ScenarioData(
            g.Schema, g.Id, g.Version, g.Requires, g.ThemeHint, g.Settings, g.Calendar, map ?? g.Map, players ?? g.Players, groups ?? g.EntryGroups,
            arrivals ?? g.Arrivals, bases ?? g.PrePlacedBases, g.Regions, capSlots ?? g.RegionCapSlots, g.SeasonTable, g.SeasonSchedule,
            timed ?? g.TimedEffects, g.Balance, end ?? g.EndConditions);
    }

    private static IReadOnlyList<string> Codes(ScenarioData s) => ScenarioBootstrapper.Boot(s, 1).Errors.Select(e => e.Code).ToList();

    [TestCase("f1", 0, true)]
    [TestCase("f6", 5, true)]
    [TestCase("f12", 11, true)]
    [TestCase("f0", -1, false)]
    [TestCase("g1", -1, false)]
    [TestCase("f", -1, false)]
    [TestCase("f-1", -1, false)]
    [TestCase("f1x", -1, false)]
    [TestCase("", -1, false)]
    [TestCase(null, -1, false)]
    public void Slot_names_parse_to_indices(string? name, int slot, bool ok)
    {
        Assert.That(SlotNames.TryParse(name, out int parsed), Is.EqualTo(ok));
        Assert.That(parsed, Is.EqualTo(slot));
    }

    [Test]
    public void An_unknown_terrain_in_the_map_is_a_boot_error_with_the_row()
    {
        ScenarioData g = Good;
        var legend = g.Map.Legend.Select(l => l.Symbol == 'o' ? new LegendEntry('o', "t.nowhere", "meadow") : l).ToList();

        BootResult r = ScenarioBootstrapper.Boot(With(map: new MapData(g.Map.Width, g.Map.Height, legend, g.Map.Rows)), 1);

        Assert.That(r.Errors.First().Code, Is.EqualTo("err.boot_terrain"));
        Assert.That(r.Errors.First().Path, Does.StartWith("/map/rows/"));
    }

    [Test]
    public void Bad_slots_in_groups_arrivals_timed_effects_and_region_caps_are_reported()
    {
        ScenarioData g = Good;
        var badGroup = new[] { new EntryGroupData("entry.x", "zz", new[] { new TilePoint(0, 0) }) };
        var badArrival = new[] { new ArrivalData(0, "q", null, g.Arrivals[0].Units, false, false) };
        var badTimed = new[] { new TimedEffectData("te", 3, null, "zz", false, null, new[] { new TimedEffectKind("panic_modifier", null, "all_battles", 10) }) };

        Assert.That(Codes(With(groups: badGroup)), Does.Contain("err.boot_slot"));
        Assert.That(Codes(With(arrivals: badArrival)), Does.Contain("err.boot_slot"));
        Assert.That(Codes(With(timed: badTimed)), Does.Contain("err.boot_slot"));
        Assert.That(Codes(With(capSlots: new[] { "nope" })), Does.Contain("err.boot_slot"));
    }

    [Test]
    public void A_timed_effect_outside_its_bounds_is_reported_by_the_rule_set()
    {
        var loud = new[] { new TimedEffectData("te", 3, null, "f2", false, null, new[] { new TimedEffectKind("panic_modifier", null, "defending_base", 900) }) };

        Assert.That(Codes(With(timed: loud)), Does.Contain("err.timed_bounds"));
    }

    [Test]
    public void Unknown_roles_in_arrivals_garrisons_and_buildings_are_reported_with_their_path()
    {
        ScenarioData g = Good;
        var arrival = new[] { new ArrivalData(0, "f1", null, new[] { new UnitGroup("u.dragon", 1, 1) }, false, false) };
        PrePlacedBase b = g.PrePlacedBases[0];
        PrePlacedBase badGarrison = Copy(b, garrison: new[] { new UnitGroup("u.dragon", 1, 1) });
        PrePlacedBase badBuilding = Copy(b, buildings: new[] { new BuildingPlacement("bld.castle", 1, new TilePoint(7, 8)) });

        BootResult a = ScenarioBootstrapper.Boot(With(arrivals: arrival), 1);
        BootResult gar = ScenarioBootstrapper.Boot(With(bases: Replace0(badGarrison)), 1);
        BootResult bld = ScenarioBootstrapper.Boot(With(bases: Replace0(badBuilding)), 1);

        Assert.That(a.Errors.Single().Path, Is.EqualTo("/arrivals/0/units"));
        Assert.That(gar.Errors.Single().Path, Is.EqualTo("/pre_placed_bases/0/garrison/0"));
        Assert.That(bld.Errors.Single().Path, Is.EqualTo("/pre_placed_bases/0/buildings/0"));
    }

    [Test]
    public void A_base_the_play_rules_would_refuse_is_a_boot_error_not_an_exception()
    {
        PrePlacedBase onWater = Copy(Good.PrePlacedBases[0], anchor: new TilePoint(8, 3));

        BootResult r = ScenarioBootstrapper.Boot(With(bases: Replace0(onWater)), 1);

        Assert.That(r.Ok, Is.False);
        Assert.That(r.Errors.Single(), Has.Property("Code").EqualTo("err.boot_base"));
        Assert.That(r.Errors.Single().Path, Is.EqualTo("/pre_placed_bases/0"));
    }

    [Test]
    public void A_bad_owner_is_reported()
    {
        PrePlacedBase b = Copy(Good.PrePlacedBases[0], owner: "zz");

        Assert.That(Codes(With(bases: Replace0(b))), Does.Contain("err.boot_slot"));
    }

    [Test]
    public void Surrender_predicates_of_every_kind_convert_and_decide_the_game()
    {
        var edit = (JsonNode root) =>
        {
            root["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse(
                @"{""all_of"": [
                    {""turn_at_least"": {""turn"": 0}},
                    {""has_base"": {""slot"": ""f2""}},
                    {""base_count"": {""slot"": ""f2"", ""at_least"": 6}},
                    {""base_count"": {""slot"": ""f1"", ""at_most"": 0}},
                    {""not"": {""has_base"": {""slot"": ""f1""}}},
                    {""has_unit_role"": {""slot"": ""f1"", ""role"": ""u.commander""}},
                    {""holds_sites_count"": {""slot"": ""f2"", ""tag"": ""fortress"", ""at_least"": 2}},
                    {""initial_sites_held_at_most_pct"": {""slot"": ""f2"", ""at_most_pct"": 100}},
                    {""any_of"": [{""holds_site"": {""slot"": ""f2"", ""site"": ""site.capital""}}, {""has_base"": {""slot"": ""f1""}}]}
                ]}");
        };

        BootResult r = BootMutated(edit);
        Assert.That(r.Errors, Is.Empty, string.Join("\n", r.Errors));
        EndCheckResult check = r.Services!.EndConditions!.Evaluate(r.State!);

        Assert.That(check.EliminatedSlots, Is.EqualTo(ImmArray<int>.Of(1)), "slot 2 surrenders");
        Assert.That(check.MatchEnded && check.WinnerSlot == 0, Is.True);
        Assert.That(check.Events.OfType<FactionSurrendered>().Single().Slot, Is.EqualTo(1));
        Assert.That(check.Events.OfType<MatchWon>().Single().Reason, Is.EqualTo("surrender"));
    }

    [Test]
    public void A_surrender_that_is_not_met_leaves_the_game_running()
    {
        BootResult r = BootMutated(root => root["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse(@"{""turn_at_least"": {""turn"": 50}}"));

        EndCheckResult check = r.Services!.EndConditions!.Evaluate(r.State!);

        Assert.That(check.MatchEnded, Is.False);
        Assert.That(check.EliminatedSlots, Is.Empty);
    }

    private static IReadOnlyList<PrePlacedBase> Replace0(PrePlacedBase first) => new[] { first }.Concat(Good.PrePlacedBases.Skip(1)).ToList();

    private static PrePlacedBase Copy(
        PrePlacedBase b,
        string? owner = null,
        TilePoint? anchor = null,
        IReadOnlyList<BuildingPlacement>? buildings = null,
        IReadOnlyList<UnitGroup>? garrison = null)
    {
        return new PrePlacedBase(
            b.SiteId, owner ?? b.Owner, anchor ?? b.Anchor, b.CoreLevel, buildings ?? b.Buildings, b.Stock, b.Pop, garrison ?? b.Garrison,
            b.CommanderLevel, b.Tags, b.RealPlace, b.RaidCanDestroy, b.IntelSeed);
    }
}
