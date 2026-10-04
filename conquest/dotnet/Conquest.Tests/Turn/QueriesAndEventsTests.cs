using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class QueriesAndEventsTests
{
    [Test]
    public void Moves_per_turn_come_from_the_role_table()
    {
        IGameQueries q = new GameQueries(New());

        Assert.That(q.MovesPerTurn(UnitRole.Scout, 1), Is.EqualTo(8));
        Assert.That(q.MovesPerTurn(UnitRole.Scout, 4), Is.EqualTo(14));
        Assert.That(q.MovesPerTurn(UnitRole.Founder, 1), Is.EqualTo(1));
        Assert.That(q.MovesPerTurn(UnitRole.Line, 2), Is.EqualTo(3));
    }

    [Test]
    public void A_move_plan_costs_exactly_what_the_move_order_then_spends()
    {
        GameState s = Unit(New(), 0, UnitRole.Shock, 2, 2, out int id);
        var target = new TileCoord(6, 4);

        MovePlan plan = new GameQueries(s).PlanMove(id, target);
        GameState moved = Ok(Do(s, new MoveCommand(0, id, target)));

        Assert.That(plan.Found, Is.True);
        Assert.That(plan.Steps[plan.Steps.Count - 1], Is.EqualTo(target));
        Assert.That(plan.Turns, Is.EqualTo(1));
        Assert.That(s.UnitTable[0].MovesLeft - moved.UnitTable[0].MovesLeft, Is.EqualTo(plan.CostHundredths));
    }

    [Test]
    public void A_long_walk_is_planned_over_several_turns_and_the_season_percent_applies()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 2, 2, out int id);
        var target = new TileCoord(9, 2);
        var wet = new TurnServices(hooks: new SeasonTable(true, new[] { new SeasonDefinition("w", 150, 100, 100) }, new[] { new SeasonRange(0, 9, "w") }));

        MovePlan dry = new GameQueries(s).PlanMove(id, target);
        MovePlan slow = new GameQueries(s, wet).PlanMove(id, target);

        Assert.That(dry.Found && slow.Found, Is.True);
        Assert.That(dry.Turns, Is.GreaterThanOrEqualTo(7), "7 steps at 1 point or more each; a founder has 1 point a turn");
        Assert.That(dry.Turns, Is.EqualTo(1 + ((dry.CostHundredths - 100 + 99) / 100)));
        Assert.That(slow.CostHundredths, Is.GreaterThan(dry.CostHundredths));
        Assert.That(slow.Turns, Is.GreaterThan(dry.Turns));
        Assert.That(Do(s, new MoveCommand(0, id, target)).Error, Is.EqualTo(Err.Unreachable), "the order itself only goes as far as this turn's movement");
    }

    [Test]
    public void Impossible_plans_are_reported_as_not_found()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 2, out int id);
        s = Unit(s, 1, UnitRole.Line, 6, 2, out _);
        IGameQueries q = new GameQueries(s);

        Assert.That(q.PlanMove(id, new TileCoord(0, 2)).Found, Is.False, "deep water");
        Assert.That(q.PlanMove(id, new TileCoord(6, 2)).Found, Is.False, "an enemy stands there");
        Assert.That(q.PlanMove(id, new TileCoord(40, 40)).Found, Is.False);
        Assert.That(q.PlanMove(99, new TileCoord(3, 3)).Found, Is.False);
        Assert.That(q.PlanMove(id, new TileCoord(2, 2)).Found, Is.False, "already there");
    }

    [Test]
    public void A_new_building_is_reported_the_turn_before_it_works_and_only_once()
    {
        GameState s = Base(New(), 0, 6, 3, out int b, core: 2, stock: Rich);
        s = Ok(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(7, 3))));
        var turn0 = new List<GameEvent>();
        var turn1 = new List<GameEvent>();

        s = EndAll(s, null, turn0);
        s = EndAll(s, null, turn1);

        Assert.That(turn0.OfType<BuildingCompleted>().Single(), Is.EqualTo(new BuildingCompleted(b, BuildingRole.Food, 1, 0)));
        Assert.That(turn1.OfType<BuildingCompleted>(), Is.Empty);
    }

    [Test]
    public void An_upgrade_is_reported_when_its_new_level_is_applied()
    {
        GameState s = Base(New(), 0, 6, 3, out int b, core: 2, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, new TileCoord(7, 3));
        s = Ok(Do(s, new UpgradeCommand(0, b, 0)));
        s = Ok(Do(s, new UpgradeCommand(0, b, -1)));
        var events = new List<GameEvent>();

        s = EndAll(s, null, events);
        s = EndAll(s, null, events);

        Assert.That(events.OfType<BuildingCompleted>().Single(), Is.EqualTo(new BuildingCompleted(b, BuildingRole.Food, 2, 0)));
        Assert.That(events.OfType<CoreUpgradeCompleted>().Single(), Is.EqualTo(new CoreUpgradeCompleted(b, 3, 0)));
        Assert.That(s.BaseTable[0].CoreLevel, Is.EqualTo(3));
    }

    [Test]
    public void The_first_base_a_slot_founds_gets_its_start_kit_and_later_ones_the_default_stock()
    {
        var kit = new ResourceVector(12, 4, 6, 3, 15, 100);
        var svc = new TurnServices(scenario: new ScenarioRules(kits: new[] { new SlotKit(0, kit) }));
        GameState s = Unit(New(), 0, UnitRole.Founder, 3, 3, out int f1);
        s = Unit(s, 0, UnitRole.Founder, 8, 3, out int f2);
        s = Unit(s, 1, UnitRole.Founder, 3, 6, out int f3);

        s = Ok(Do(s, new FoundBaseCommand(0, f1), svc));
        s = Ok(Do(s, new FoundBaseCommand(0, f2), svc));
        s = Ok(Do(s, new FoundBaseCommand(1, f3), svc));

        Assert.That(s.BaseTable[0].Stock, Is.EqualTo(kit));
        Assert.That(s.BaseTable[1].Stock, Is.EqualTo(RuleTables.StartingStock));
        Assert.That(s.BaseTable[2].Stock, Is.EqualTo(RuleTables.StartingStock), "slot 1 has no kit");
        Assert.That(s.GetExt("kit_used.f1"), Is.EqualTo(1));
    }

    [Test]
    public void Without_a_kit_nothing_is_remembered()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 3, 3, out int f);

        s = Ok(Do(s, new FoundBaseCommand(0, f)));

        Assert.That(s.Ext.Count, Is.EqualTo(0));
        Assert.That(s.BaseTable[0].Stock, Is.EqualTo(RuleTables.StartingStock));
    }
}
