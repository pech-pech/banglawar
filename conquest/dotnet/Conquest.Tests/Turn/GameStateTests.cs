using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class GameStateTests
{
    [Test]
    public void The_view_exposes_map_units_and_bases_read_only()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int u1);
        s = Unit(s, 1, UnitRole.Scout, 4, 4 + 1, out int u2);
        s = Base(s, 1, 8, 5, out int b, core: 2, stock: Rich, site: "site.capital");
        s = GameFactory.AddBuilding(s, b, BuildingRole.Garrison, 1, new TileCoord(9, 5));
        IGameStateView v = s;
        Assert.That(v.Width, Is.EqualTo(12));
        Assert.That(v.Height, Is.EqualTo(8));
        Assert.That(v.SlotCount, Is.EqualTo(2));
        Assert.That(v.Turn, Is.EqualTo(0));
        Assert.That(v.InBounds(new TileCoord(11, 7)), Is.True);
        Assert.That(v.TerrainAt(new TileCoord(0, 0)), Is.EqualTo(Terrain.Deep));
        Assert.That(v.Units.Select(x => x.Id), Is.EqualTo(new[] { u1, u2 }));
        Assert.That(v.TryGetUnit(u2, out UnitView uv), Is.True);
        Assert.That(uv.Role, Is.EqualTo(UnitRole.Scout));
        Assert.That(v.TryGetUnit(99, out _), Is.False);
        Assert.That(v.UnitsAt(new TileCoord(4, 4)).Single().Id, Is.EqualTo(u1));
        Assert.That(v.UnitsAt(new TileCoord(0, 0)), Is.Empty);
        Assert.That(v.Bases.Single().SiteId, Is.EqualTo("site.capital"));
        Assert.That(v.TryGetBase(b, out BaseView bv), Is.True);
        Assert.That(bv.Buildings.Single().Role, Is.EqualTo(BuildingRole.Garrison));
        Assert.That(bv.Stock, Is.EqualTo(Rich));
        Assert.That(v.TryGetBase(77, out _), Is.False);
        Assert.That(v.TryGetBaseAt(new TileCoord(8, 5), out BaseView at), Is.True);
        Assert.That(at.Id, Is.EqualTo(b));
        Assert.That(v.TryGetBaseAt(new TileCoord(1, 1), out _), Is.False);
        Assert.That(v.IsEliminated(0), Is.False);
        Assert.That(v.IsEliminated(9), Is.False);
        Assert.That(v.IsEliminated(-1), Is.False);
    }

    [Test]
    public void Unit_ids_are_assigned_from_a_counter_and_tables_stay_sorted()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int a);
        s = Unit(s, 0, UnitRole.Line, 5, 4, out int b);
        s = Unit(s, 0, UnitRole.Line, 6, 4, out int c);
        Assert.That(new[] { a, b, c }, Is.EqualTo(new[] { 1, 2, 3 }));
        s = s.WithoutUnit(b);
        Assert.That(s.FindUnitIndex(b), Is.EqualTo(-1));
        Assert.That(s.FindUnitIndex(c), Is.EqualTo(1));
        s = Unit(s, 0, UnitRole.Line, 7, 4, out int d);
        Assert.That(d, Is.EqualTo(4), "ids are never reused");
        Assert.That(s.WithoutUnit(99), Is.SameAs(s));
        Assert.That(s.WithoutBase(99), Is.SameAs(s));
    }

    [Test]
    public void Setup_helpers_reject_impossible_placements()
    {
        GameState s = New();
        Assert.Throws<ArgumentOutOfRangeException>(() => GameFactory.NewGame(s.Map, 1, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => GameFactory.NewGame(s.Map, 1, 7));
        Assert.Throws<ArgumentOutOfRangeException>(() => Unit(s, 5, UnitRole.Line, 4, 4, out _));
        Assert.Throws<ArgumentException>(() => Unit(s, 0, UnitRole.Line, 0, 0, out _));
        Assert.Throws<ArgumentException>(() => Unit(s, 0, UnitRole.Line, 99, 0, out _));
        Assert.Throws<ArgumentOutOfRangeException>(() => Base(s, 5, 4, 4, out _));
        Assert.Throws<ArgumentException>(() => Base(s, 0, 8, 2, out _));
        Assert.Throws<ArgumentException>(() => Base(s, 0, 4, 4, out _, core: 5));
        Assert.Throws<ArgumentException>(() => GameFactory.AddBuilding(s, 9, BuildingRole.Food, 1, new TileCoord(4, 4)));
    }

    [Test]
    public void New_games_start_with_every_slot_active_and_a_seeded_rng()
    {
        GameState s = New(slots: 3, seed: 99);
        Assert.That(s.Factions.Count, Is.EqualTo(3));
        Assert.That(s.Factions.All(f => !f.Eliminated && !f.EndedTurn), Is.True);
        Assert.That(s.Rng, Is.EqualTo(RngState.FromSeed(99)));
        Assert.That(s.MatchOver, Is.False);
        Assert.That(s.WinnerSlot, Is.EqualTo(-1));
    }

    [Test]
    public void Rule_tables_have_the_documented_numbers()
    {
        Assert.That(RuleTables.MovePoints(UnitRole.Scout, 2), Is.EqualTo(10));
        Assert.That(RuleTables.MovePoints(UnitRole.Shock, 4), Is.EqualTo(8));
        Assert.That(RuleTables.MovePoints(UnitRole.Commander, 3), Is.EqualTo(4));
        Assert.That(RuleTables.MovePoints(UnitRole.Ranged, 3), Is.EqualTo(3));
        Assert.That(RuleTables.MovePoints(UnitRole.Founder, 4), Is.EqualTo(2));
        Assert.That(RuleTables.MovePoints(UnitRole.Transport, 1), Is.EqualTo(12));
        Assert.That(RuleTables.MovePoints(UnitRole.Line, 9), Is.EqualTo(3));
        Assert.That(RuleTables.MoveBudget(UnitRole.Line, 1), Is.EqualTo(300));
        Assert.That(RuleTables.StartStrength(9), Is.EqualTo(5));
        Assert.That(RuleTables.StartStrength(0), Is.EqualTo(1));
        Assert.That(RuleTables.CanInitiateAttack(UnitRole.Scout), Is.False);
        Assert.That(RuleTables.CanInitiateAttack(UnitRole.Commander), Is.True);
        Assert.That(RuleTables.MaxBuildingLevel(BuildingRole.Academy), Is.EqualTo(1));
        Assert.That(RuleTables.MaxBuildingLevel(BuildingRole.Food), Is.EqualTo(4));
        Assert.That(RuleTables.ChurchWeightPct(0), Is.EqualTo(100));
        Assert.That(RuleTables.ChurchWeightPct(1), Is.EqualTo(75));
        Assert.That(RuleTables.ChurchWeightPct(5), Is.EqualTo(50));
    }

    [Test]
    public void Building_and_core_cost_tables_match_the_gdd_spot_checks()
    {
        Assert.That(RuleTables.BuildingCost(BuildingRole.Food, 1), Is.EqualTo(new ResourceVector(4, 0, 0, 0, 0, 0)));
        Assert.That(RuleTables.BuildingCost(BuildingRole.Food, 3), Is.EqualTo(new ResourceVector(20, 10, 0, 4, 0, 0)));
        Assert.That(RuleTables.BuildingCost(BuildingRole.Garrison, 4), Is.EqualTo(new ResourceVector(75, 30, 90, 15, 0, 0)));
        Assert.That(RuleTables.BuildingCost(BuildingRole.Converter, 1), Is.EqualTo(new ResourceVector(3, 3, 0, 2, 0, 0)));
        Assert.That(RuleTables.BuildingCost(BuildingRole.Academy, 1), Is.EqualTo(new ResourceVector(50, 15, 20, 5, 0, 0)));
        Assert.That(RuleTables.CoreCost(2), Is.EqualTo(new ResourceVector(20, 5, 0, 0, 0, 0)));
        Assert.That(RuleTables.CoreCost(4), Is.EqualTo(new ResourceVector(80, 20, 250, 10, 0, 0)));
        Assert.That(RuleTables.CoreCost(3), Is.EqualTo(new ResourceVector(40, 10, 100, 5, 0, 0)));
        foreach (BuildingRole r in Enum.GetValues(typeof(BuildingRole)))
        {
            for (int l = 1; l <= 4; l++)
            {
                ResourceVector c = RuleTables.BuildingCost(r, l);
                Assert.That(c.Basic + c.Hard + c.Coin + c.Wares, Is.GreaterThan(0), r + " " + l);
                Assert.That(c.Food + c.Pop, Is.EqualTo(0));
            }
        }
    }
}
