using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Rules;

/// <summary>Hooks H5 and H6 as the turn pipeline and the command engine use them.</summary>
public class HookWiringTests
{
    // west half (x 0..5) is region 0, east half (x 6..11) region 1, the bottom row is in no region
    private static RegionService Regions(bool enabled = true, int[]? capped = null)
    {
        var byTile = new int[12 * 8];
        for (int y = 0; y < 8; y++)
        {
            for (int x = 0; x < 12; x++)
            {
                byTile[(y * 12) + x] = y == 7 ? -1 : x < 6 ? 0 : 1;
            }
        }

        var config = new RegionRulesConfig(enabled, 3, 1, capped ?? new[] { 0, 1 }, 5, new[] { BuildingRole.Food, BuildingRole.BasicExtractor });
        return new RegionService(new RegionMap(12, 8, new[] { "region.west", "region.east" }, byTile), config);
    }

    private static TurnServices WithRegions(RegionService r) => new TurnServices(regions: r);

    private static CommandResult UpgradeCore(GameState s, int baseId, TurnServices svc, int slot = 0) =>
        CommandEngine.Apply(s, new UpgradeCommand(slot, baseId, -1), svc);

    private static readonly ResourceVector Plenty = new ResourceVector(900, 900, 900, 900, 900, 100);

    // ----- H5 -----

    [Test]
    public void A_timed_effect_is_announced_to_everyone_when_the_turn_it_starts_begins()
    {
        var timed = new TimedEffectSet(true, new[] { new TimedEffectEntry("te.x", 2, null, 1, announce: true), new TimedEffectEntry("te.quiet", 2, null, 1) });
        var svc = new TurnServices(timedEffects: timed);
        var turn0 = new List<GameEvent>();
        var turn1 = new List<GameEvent>();

        GameState s = EndAll(New(), svc, turn0);
        s = EndAll(s, svc, turn1);

        Assert.That(turn0.OfType<TimedEffectStarted>(), Is.Empty);
        TimedEffectStarted started = turn1.OfType<TimedEffectStarted>().Single();
        Assert.That(started, Is.EqualTo(new TimedEffectStarted("te.x", 1)));
        Assert.That(started.VisibleTo(0) && started.VisibleTo(1), Is.True);
        Assert.That(turn1.IndexOf(started), Is.LessThan(turn1.FindIndex(e => e is TurnEnded)));
    }

    // ----- H6 cap -----

    [Test]
    public void A_second_core_upgrade_to_the_cap_level_in_one_region_is_refused()
    {
        GameState s = Base(New(), 0, 1, 1, out _, core: 3, stock: Plenty);
        s = Base(s, 0, 4, 4, out int second, core: 2, stock: Plenty);

        CommandResult r = UpgradeCore(s, second, WithRegions(Regions()));

        Assert.That(r.Error, Is.EqualTo(Err.RegionCap));
    }

    [Test]
    public void The_same_upgrade_is_allowed_in_another_region_or_for_an_unregioned_base_or_an_uncapped_slot()
    {
        GameState s = Base(New(), 0, 1, 1, out _, core: 3, stock: Plenty);
        s = Base(s, 0, 8, 4, out int east, core: 2, stock: Plenty);
        s = Base(s, 0, 4, 7, out int nowhere, core: 2, stock: Plenty);

        Assert.That(UpgradeCore(s, east, WithRegions(Regions())).Ok, Is.True);
        Assert.That(UpgradeCore(s, nowhere, WithRegions(Regions())).Ok, Is.True);
        Assert.That(UpgradeCore(s, east, WithRegions(Regions(capped: new[] { 1 }))).Ok, Is.True, "slot 0 is not in the capped list");
        Assert.That(UpgradeCore(s, east, WithRegions(Regions(enabled: false))).Ok, Is.True);
    }

    [Test]
    public void A_pending_upgrade_counts_against_the_cap_until_it_is_applied()
    {
        GameState s = Base(New(), 0, 1, 1, out int first, core: 2, stock: Plenty);
        s = Base(s, 0, 4, 4, out int second, core: 2, stock: Plenty);
        TurnServices svc = WithRegions(Regions());

        s = Ok(UpgradeCore(s, first, svc));

        Assert.That(UpgradeCore(s, second, svc).Error, Is.EqualTo(Err.RegionCap));
    }

    [Test]
    public void A_core_below_the_cap_level_never_counts_and_an_over_cap_holding_is_never_revoked()
    {
        GameState s = Base(New(), 0, 1, 1, out int a, core: 3, stock: Plenty);
        s = Base(s, 0, 4, 4, out int b, core: 3, stock: Plenty);
        s = Base(s, 0, 2, 5, out int c, core: 1, stock: Plenty);
        TurnServices svc = WithRegions(Regions());

        Assert.That(UpgradeCore(s, c, svc).Ok, Is.True, "level 2 is below the cap level");
        Assert.That(UpgradeCore(s, a, svc).Error, Is.EqualTo(Err.RegionCap), "the other level-3 core already fills the region's cap");
        Assert.That(EndAll(s, svc).BaseTable.Count(x => x.CoreLevel == 3), Is.EqualTo(2), "two level-3 cores in one region stay as they were");
        Assert.That(b, Is.Not.EqualTo(a));
    }

    [Test]
    public void The_enemy_slot_is_counted_by_owner_not_by_region()
    {
        GameState s = Base(New(), 1, 1, 1, out _, core: 3, stock: Plenty);
        s = Base(s, 0, 4, 4, out int mine, core: 2, stock: Plenty);

        Assert.That(UpgradeCore(s, mine, WithRegions(Regions())).Ok, Is.True);
    }

    // ----- H6 bonus -----

    [Test]
    public void A_base_in_a_region_with_a_cap_level_core_gets_the_bonus_on_the_listed_buildings_only()
    {
        GameState s = Base(New(), 0, 1, 1, out int b, core: 3, stock: new ResourceVector(0, 0, 0, 0, 500, 100));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 4, new TileCoord(2, 1));
        s = GameFactory.AddBuilding(s, b, BuildingRole.CoinExtractor, 4, new TileCoord(2, 2));
        var plain = new TurnServices();
        TurnServices bonus = WithRegions(Regions());

        ResourceVector without = EndAll(s, plain).BaseTable[0].Stock;
        ResourceVector with = EndAll(s, bonus).BaseTable[0].Stock;

        Assert.That(with.Food - without.Food, Is.EqualTo(1), "36 * 105 / 100 = 37");
        Assert.That(with.Coin, Is.EqualTo(without.Coin), "the coin extractor is not on the bonus list");
    }

    [Test]
    public void A_region_without_a_cap_level_core_of_the_slot_gets_no_bonus()
    {
        GameState s = Base(New(), 0, 1, 1, out int b, core: 2, stock: new ResourceVector(0, 0, 0, 0, 500, 100));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 2, new TileCoord(2, 1));

        Assert.That(new GameQueries(s, WithRegions(Regions())).Forecast(b), Is.EqualTo(new GameQueries(s).Forecast(b)));
    }

    [Test]
    public void The_forecast_equals_what_the_turn_really_does()
    {
        GameState s = Base(New(), 0, 1, 1, out int b, core: 3, stock: new ResourceVector(10, 10, 10, 10, 500, 100));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 4, new TileCoord(2, 1));
        s = GameFactory.AddBuilding(s, b, BuildingRole.BasicExtractor, 3, new TileCoord(2, 2));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Habitat, 2, new TileCoord(3, 2));
        TurnServices svc = new TurnServices(hooks: new SeasonTable(true, new[] { new SeasonDefinition("s", 100, 100, 90) }, new[] { new SeasonRange(0, 5, "s") }), regions: Regions());

        ResourceVector predicted = new GameQueries(s, svc).Forecast(b);
        ResourceVector real = EndAll(s, svc).BaseTable[0].Stock.Subtract(s.BaseTable[0].Stock);

        Assert.That(predicted, Is.EqualTo(real));
        Assert.That(predicted.Basic, Is.GreaterThan(0));
    }

    [Test]
    public void The_forecast_of_an_unknown_base_is_zero()
    {
        Assert.That(new GameQueries(New()).Forecast(42), Is.EqualTo(ResourceVector.Zero));
    }

    [Test]
    public void The_forecast_shows_a_shortage_as_a_negative_population_change()
    {
        GameState s = Base(New(), 0, 1, 1, out int b, core: 1, stock: new ResourceVector(0, 0, 0, 0, 0, 100));

        ResourceVector delta = new GameQueries(s).Forecast(b);

        Assert.That(delta.Pop, Is.LessThan(0));
        Assert.That(delta.Food, Is.EqualTo(0));
    }
}
