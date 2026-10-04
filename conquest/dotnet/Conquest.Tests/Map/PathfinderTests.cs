using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Tests.Map;

public class PathfinderTests
{
    private static GameMap Grid(params string[] rows)
    {
        const string legend = "~-=.fjhM";
        var tiles = new Terrain[rows.Length * rows[0].Length];
        for (int y = 0; y < rows.Length; y++)
        {
            for (int x = 0; x < rows[0].Length; x++)
            {
                tiles[y * rows[0].Length + x] = (Terrain)legend.IndexOf(rows[y][x]);
            }
        }

        return GameMap.Create(rows[0].Length, rows.Length, tiles);
    }

    private static PathResult Walk(GameMap m, TileCoord a, TileCoord b, int budget, bool free = false, Func<TileCoord, bool>? blocked = null, int pct = 100, MoveClass cls = MoveClass.Land) =>
        Pathfinder.Find(m, a, b, cls, budget, pct, free, blocked ?? (_ => false));

    [Test]
    public void Diagonal_steps_are_allowed_and_cost_the_entered_terrain()
    {
        var m = Grid("....", "....", "....");
        PathResult p = Walk(m, new TileCoord(0, 0), new TileCoord(2, 2), 1000);
        Assert.That(p.Found, Is.True);
        Assert.That(p.Steps.Count, Is.EqualTo(2));
        Assert.That(p.Cost, Is.EqualTo(200));
        Assert.That(p.Steps[1], Is.EqualTo(new TileCoord(2, 2)));
    }

    [Test]
    public void The_cheapest_route_goes_around_expensive_terrain()
    {
        var m = Grid(".M.", ".M.", "...");
        PathResult p = Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 2000);
        Assert.That(p.Found, Is.True);
        Assert.That(p.Cost, Is.EqualTo(400));
        Assert.That(p.Steps.Select(s => m.TerrainAt(s)), Has.None.EqualTo(Terrain.Peak));
    }

    [Test]
    public void Budget_limits_the_reach()
    {
        var m = Grid("......");
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(3, 0), 300).Found, Is.True);
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(4, 0), 300).Found, Is.False);
    }

    [Test]
    public void A_fresh_unit_may_always_take_one_step_but_not_two()
    {
        var m = Grid("MM.");
        PathResult one = Walk(m, new TileCoord(0, 0), new TileCoord(1, 0), 100, free: true);
        Assert.That(one.Found, Is.True);
        Assert.That(one.Cost, Is.EqualTo(100));
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(1, 0), 100, free: false).Found, Is.False);
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 100, free: true).Found, Is.False);
    }

    [Test]
    public void Impassable_blocked_and_out_of_range_targets_are_not_found()
    {
        var m = Grid("..~", "...");
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 1000).Found, Is.False);
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(1, 1), 1000, blocked: t => t == new TileCoord(1, 1)).Found, Is.False);
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(9, 9), 1000).Found, Is.False);
        Assert.That(Walk(m, new TileCoord(9, 9), new TileCoord(0, 0), 1000).Found, Is.False);
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(0, 0), 1000).Found, Is.False);
    }

    [Test]
    public void Blocked_tiles_are_routed_around_or_make_the_target_unreachable()
    {
        var m = Grid("...", "...", "...");
        var wall = new[] { new TileCoord(1, 0), new TileCoord(1, 1), new TileCoord(1, 2) };
        Assert.That(Walk(m, new TileCoord(0, 1), new TileCoord(2, 1), 5000, blocked: t => wall.Contains(t)).Found, Is.False);
        PathResult around = Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 5000, blocked: t => t == new TileCoord(1, 0));
        Assert.That(around.Found, Is.True);
        Assert.That(around.Steps.Count, Is.EqualTo(2));
    }

    [Test]
    public void Season_percent_scales_the_step_cost()
    {
        var m = Grid("...");
        PathResult wet = Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 1000, pct: 150);
        Assert.That(wet.Cost, Is.EqualTo(300));
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(2, 0), 250, pct: 150).Found, Is.False);
        Assert.That(Pathfinder.StepCost(Terrain.WoodA, MoveClass.Land, 150), Is.EqualTo(300));
        Assert.That(Pathfinder.StepCost(Terrain.Deep, MoveClass.Land, 150), Is.EqualTo(0));
    }

    [Test]
    public void Ships_sail_only_on_deep_water()
    {
        var m = Grid("~~~", "~.~", "~~~");
        PathResult p = Walk(m, new TileCoord(0, 0), new TileCoord(2, 2), 2000, cls: MoveClass.Water);
        Assert.That(p.Found, Is.True);
        Assert.That(p.Steps.Select(s => m.TerrainAt(s)), Has.All.EqualTo(Terrain.Deep));
        Assert.That(Walk(m, new TileCoord(0, 0), new TileCoord(1, 1), 2000, cls: MoveClass.Water).Found, Is.False);
    }

    [Test]
    public void Equal_cost_routes_are_chosen_deterministically()
    {
        var m = Grid(".....", ".....", ".....");
        PathResult a = Walk(m, new TileCoord(0, 1), new TileCoord(4, 1), 5000);
        PathResult b = Walk(m, new TileCoord(0, 1), new TileCoord(4, 1), 5000);
        Assert.That(a.Steps, Is.EqualTo(b.Steps));
        Assert.That(a.Steps.Count, Is.EqualTo(4));
    }
}
