using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Presentation;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Presentation;

public class BuildMenuTests
{
    private static TurnServices Services => TurnServices.Neutral;

    [Test]
    public void Every_role_is_listed_with_the_rule_tables_price()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: Rich);

        IReadOnlyList<BuildEntry> entries = BuildMenu.Entries(s, Services, b, 0);

        Assert.That(entries.Count, Is.EqualTo(Enum.GetValues(typeof(BuildingRole)).Length));
        foreach (BuildEntry e in entries)
        {
            Assert.That(e.Cost, Is.EqualTo(RuleTables.BuildingCost(e.Role, 1)), e.RoleId);
            Assert.That(e.RoleId, Does.StartWith("bld."));
        }
    }

    [Test]
    public void With_enough_stock_a_role_is_enabled_and_has_sites()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: Rich);

        BuildEntry food = BuildMenu.Entries(s, Services, b, 0).Single(e => e.Role == BuildingRole.Food);

        Assert.That(food.Enabled, Is.True, food.DisabledReason);
        Assert.That(food.SiteCount, Is.GreaterThan(0));
        Assert.That(food.Shortfall, Is.EqualTo(ResourceVector.Zero));
    }

    [Test]
    public void A_role_the_base_cannot_pay_for_is_disabled_with_the_shortfall()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: new ResourceVector(3, 0, 0, 0, 0, 0));

        BuildEntry food = BuildMenu.Entries(s, Services, b, 0).Single(e => e.Role == BuildingRole.Food);
        BuildEntry garrison = BuildMenu.Entries(s, Services, b, 0).Single(e => e.Role == BuildingRole.Garrison);

        Assert.That(food.Enabled, Is.False);
        Assert.That(food.DisabledReason, Is.EqualTo(Err.NotEnoughResources));
        Assert.That(food.Shortfall.Basic, Is.EqualTo(1));
        Assert.That(garrison.Shortfall.Basic, Is.EqualTo(7));
        Assert.That(garrison.Shortfall.Hard, Is.EqualTo(1));
    }

    [Test]
    public void A_second_academy_is_disabled_because_the_core_refuses_it()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Academy, 1, new TileCoord(8, 3));

        BuildEntry academy = BuildMenu.Entries(s, Services, b, 0).Single(e => e.Role == BuildingRole.Academy);

        Assert.That(academy.Enabled, Is.False);
        Assert.That(academy.DisabledReason, Is.EqualTo(Err.DuplicateBuilding));
    }

    [Test]
    public void A_port_far_from_water_is_disabled_with_the_needs_water_reason()
    {
        GameState s = Base(New(), 0, 10, 1, out int b, core: 1, stock: Rich);

        BuildEntry port = BuildMenu.Entries(s, Services, b, 0).Single(e => e.Role == BuildingRole.Port);

        Assert.That(port.Enabled, Is.False);
        Assert.That(port.DisabledReason, Is.EqualTo(Err.NeedsWater));
    }

    [Test]
    public void Sites_are_the_tiles_the_core_accepts_nearest_first_and_the_order_succeeds_there()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Habitat, 1, new TileCoord(8, 3));

        IReadOnlyList<GridPos> sites = BuildMenu.Sites(s, Services, b, 0, BuildingRole.Food);

        Assert.That(sites, Does.Not.Contain(new GridPos(9, 3)), "the base tile is never a site");
        Assert.That(sites, Does.Not.Contain(new GridPos(8, 3)), "an occupied tile is never a site");
        int Dist(GridPos p) => Math.Max(Math.Abs(p.X - 9), Math.Abs(p.Y - 3));
        Assert.That(sites.Select(Dist), Is.Ordered);
        Assert.That(BuildMenu.NearestSite(s, Services, b, 0, BuildingRole.Food), Is.EqualTo(sites[0]));
        foreach (GridPos site in sites)
        {
            Assert.That(CommandEngine.Apply(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(site.X, site.Y)), Services).Ok, Is.True, site.ToString());
        }
    }

    [Test]
    public void Check_returns_the_cores_error_for_a_bad_tile()
    {
        GameState s = Base(New(), 0, 9, 3, out int b, core: 1, stock: Rich);

        Assert.That(BuildMenu.Check(s, Services, b, 0, BuildingRole.Food, new GridPos(9, 3)), Is.EqualTo(Err.IllegalSite));
        Assert.That(BuildMenu.Check(s, Services, b, 0, BuildingRole.Food, new GridPos(2, 7)), Is.EqualTo(Err.OutsideArea));
        Assert.That(BuildMenu.Check(s, Services, b, 0, BuildingRole.Food, new GridPos(9, 4)), Is.Null);
    }

    [Test]
    public void A_base_that_is_not_the_slots_has_no_entries()
    {
        GameState s = Base(New(), 1, 9, 3, out int b, core: 1, stock: Rich);

        Assert.That(BuildMenu.Entries(s, Services, b, 0), Is.Empty);
        Assert.That(BuildMenu.Entries(s, Services, 999, 0), Is.Empty);
        Assert.That(BuildMenu.Sites(s, Services, 999, 0, BuildingRole.Food), Is.Empty);
        Assert.That(BuildMenu.NearestSite(s, Services, 999, 0, BuildingRole.Food), Is.Null);
    }
}
