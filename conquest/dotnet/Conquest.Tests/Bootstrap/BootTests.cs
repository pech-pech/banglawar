using Conquest.Bootstrap;
using Conquest.Content.Model;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Bootstrap.BootstrapTestKit;

namespace Conquest.Tests.Bootstrap;

public class BootTests
{
    [Test]
    public void The_shipped_scenario_boots_with_two_players_and_no_errors()
    {
        BootResult r = Boot();

        Assert.That(r.Ok, Is.True);
        Assert.That(r.ScenarioId, Is.EqualTo("liberation-1971-skirmish"));
        Assert.That(r.Players.Select(p => p.Control), Is.EqualTo(new[] { "human", "ai" }));
        Assert.That(r.State!.SlotCount, Is.EqualTo(2));
        Assert.That(r.State.Turn, Is.EqualTo(0));
        Assert.That(r.State.Width, Is.EqualTo(12));
    }

    [Test]
    public void Pre_placed_bases_keep_their_site_ids_and_the_ai_owns_them_all()
    {
        GameState s = Boot().State!;

        Assert.That(s.BaseTable.Select(b => b.SiteId), Is.EqualTo(new[]
        {
            "site.capital", "site.fortress_1", "site.fortress_2", "site.zone_1", "site.town_01", "site.town_02",
        }));
        Assert.That(s.BaseTable.All(b => b.Owner == 1), Is.True);
        Base capital = s.BaseTable[0];
        Assert.That(capital.CoreLevel, Is.EqualTo(3));
        Assert.That(capital.Stock.Pop, Is.EqualTo(120));
        Assert.That(capital.Stock, Is.EqualTo(new ResourceVector(7, 5, 6, 3, 9, 120)), "basic, hard, coin, wares, food from the scenario, pop from its own field");
        Assert.That(capital.Buildings.Count, Is.EqualTo(5));
        Assert.That(capital.Buildings[0].Role, Is.EqualTo(BuildingRole.Garrison));
    }

    [Test]
    public void Garrison_and_commander_are_created_attached_to_their_base()
    {
        GameState s = Boot().State!;
        Base capital = s.BaseTable[0];

        var housed = UnitsOf(s, 1).Where(u => u.AttachedBase == capital.Id).ToList();

        Assert.That(housed.Count, Is.EqualTo(6), "3 line, 1 shock, 1 ranged and the commander");
        Assert.That(housed.Count(u => u.Role == UnitRole.Commander), Is.EqualTo(1));
        Assert.That(housed.Single(u => u.Role == UnitRole.Commander).Level, Is.EqualTo(3));
        Assert.That(housed.All(u => u.Pos == capital.Pos), Is.True);
    }

    [Test]
    public void Intel_is_seeded_for_the_player_with_positions_only()
    {
        GameState s = Boot().State!;

        Assert.That(s.Intel.Count, Is.EqualTo(6));
        Assert.That(s.Intel.All(i => i.Viewer == 0 && i.Owner == 1 && i.Level == -1 && i.FortCount == -1 && i.TurnSeen == -1), Is.True);
        Assert.That(s.Intel[0].SiteId, Is.EqualTo("site.capital"));
    }

    [Test]
    public void Full_intel_seed_reveals_level_and_fort_count()
    {
        BootResult r = BootMutated(root => root["pre_placed_bases"]![0]!["intel_seed"] = "all_full");

        IntelRecord capital = r.State!.Intel.Single(i => i.SiteId == "site.capital");
        Assert.That(capital.Level, Is.EqualTo(3));
        Assert.That(capital.FortCount, Is.EqualTo(1));
        Assert.That(r.State.Intel.Single(i => i.SiteId == "site.town_01").Level, Is.EqualTo(-1));
    }

    [Test]
    public void Owner_only_seed_gives_no_intel()
    {
        BootResult r = BootMutated(root =>
        {
            foreach (var b in root["pre_placed_bases"]!.AsArray())
            {
                b!["intel_seed"] = "owner_only";
            }
        });

        Assert.That(r.State!.Intel.Count, Is.EqualTo(0));
    }

    [Test]
    public void Turn_zero_arrivals_land_on_the_first_tile_of_their_entry_group()
    {
        BootResult r = Boot();
        GameState s = r.State!;

        var main = UnitsOf(s, 0).Where(u => u.Pos == new TileCoord(0, 3)).ToList();
        var second = UnitsOf(s, 0).Where(u => u.Pos == new TileCoord(2, 0)).ToList();

        Assert.That(main.Select(u => u.Role), Is.EqualTo(new[] { UnitRole.Founder, UnitRole.Scout, UnitRole.Commander, UnitRole.Line, UnitRole.Line }));
        Assert.That(second.Select(u => u.Role), Is.EqualTo(new[] { UnitRole.Founder, UnitRole.Line }));
        Assert.That(r.Events.OfType<UnitSpawned>().Count(), Is.EqualTo(7));
        Assert.That(r.Events.OfType<UnitSpawned>().All(e => e.Cause == UnitSpawned.CauseArrival && e.OwnerSlot == 0), Is.True);
    }

    [Test]
    public void The_first_commander_carries_the_founder_and_the_two_line_units_but_not_the_scout()
    {
        GameState s = Boot().State!;
        Unit commander = UnitsOf(s, 0).Single(u => u.Role == UnitRole.Commander);

        var carried = UnitsOf(s, 0).Where(u => u.Leader == commander.Id).Select(u => u.Role).ToList();

        Assert.That(carried, Is.EqualTo(new[] { UnitRole.Founder, UnitRole.Line, UnitRole.Line }));
        Assert.That(UnitsOf(s, 0).Single(u => u.Role == UnitRole.Scout).Leader, Is.EqualTo(0));
    }

    [Test]
    public void Later_arrivals_wait_in_the_schedule_and_are_not_placed_at_boot()
    {
        GameState s = Boot().State!;

        Assert.That(UnitsOf(s, 0).Count(), Is.EqualTo(7));
        Assert.That(s.GetExt(ArrivalStep.DonePrefix + 0), Is.EqualTo(1));
        Assert.That(s.GetExt(ArrivalStep.DonePrefix + 2), Is.EqualTo(0));
    }

    [Test]
    public void Services_carry_the_scenario_hooks()
    {
        TurnServices svc = Boot().Services!;

        Assert.That(svc.Hooks.SeasonAt(10), Is.EqualTo("season.pre_wet"));
        Assert.That(svc.Hooks.SeasonAt(30), Is.EqualTo("season.wet"));
        Assert.That(svc.Hooks.MoveCostPct(30, MoveClass.Land), Is.EqualTo(150));
        Assert.That(svc.Scenario.RaidCanDestroy("site.capital"), Is.False);
        Assert.That(svc.Scenario.StartKit(0)!.Value.Basic, Is.EqualTo(12));
        Assert.That(svc.Scenario.StartKit(1), Is.Null);
        Assert.That(svc.TimedEffects.PatronLinkCut(1, 84), Is.True);
        Assert.That(svc.TimedEffects.PatronLinkCut(1, 83), Is.False);
        Assert.That(svc.Regions.RegionOf(new TileCoord(2, 2)), Is.EqualTo("region.r08"));
        Assert.That(svc.Regions.RegionOf(new TileCoord(8, 2)), Is.EqualTo("region.r02"));
        Assert.That(svc.Arrivals.Arrivals.Count, Is.EqualTo(5));
        Assert.That(svc.Arrivals.Groups.Count, Is.EqualTo(3));
    }

    [Test]
    public void The_boot_is_deterministic_and_the_seed_is_part_of_the_hash()
    {
        string a = Boot().StateHashHex;
        string b = Boot().StateHashHex;
        string c = Boot(seed: 7).StateHashHex;

        Assert.That(a, Is.EqualTo(b));
        Assert.That(c, Is.Not.EqualTo(a));
    }

    [Test]
    public void The_opening_state_hash_is_pinned()
    {
        // Golden: moves only when scenario data or the opening rules change on purpose.
        Assert.That(Boot().StateHashHex, Is.EqualTo(GoldenHashes.SkirmishOpening));
    }

    [Test]
    public void A_scenario_with_too_many_players_is_refused_with_a_path()
    {
        ScenarioData good = Conquest.Tests.Content.ContentTestData.Scenario();
        var seven = Enumerable.Range(1, 7).Select(i => new PlayerData("f" + i, "ai", "pre_placed", null)).ToList();
        var bad = new ScenarioData(
            good.Schema, good.Id, good.Version, good.Requires, good.ThemeHint, good.Settings, good.Calendar, good.Map, seven,
            good.EntryGroups, good.Arrivals, good.PrePlacedBases, good.Regions, good.RegionCapSlots, good.SeasonTable,
            good.SeasonSchedule, good.TimedEffects, good.Balance, good.EndConditions);

        BootResult r = ScenarioBootstrapper.Boot(bad, 1);

        Assert.That(r.Ok, Is.False);
        Assert.That(r.State, Is.Null);
        Assert.That(r.Errors.Select(e => e.Code), Does.Contain("err.boot_players"));
        Assert.That(r.StateHashHex, Is.Empty);
    }
}

internal static class GoldenHashes
{
    public const string SkirmishOpening = "dd73d7b9909c6d30";
}
