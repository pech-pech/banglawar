using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class RecruitTests
{
    private static GameState Colony(out int baseId, int core = 2, BuildingRole? role = BuildingRole.Garrison, int level = 2)
    {
        GameState s = Base(New(), 0, 6, 3, out baseId, core: core, stock: new ResourceVector(900, 900, 900, 900, 900, 900));
        if (role.HasValue)
        {
            s = GameFactory.AddBuilding(s, baseId, role.Value, level, new TileCoord(7, 3));
        }

        return s;
    }

    private static CommandResult Recruit(GameState s, int baseId, UnitRole role, int level) =>
        CommandEngine.Apply(s, new RecruitCommand(0, baseId, role, level));

    [Test]
    public void A_recruit_is_paid_now_and_the_unit_appears_when_the_turn_resolves()
    {
        GameState s = Colony(out int b);
        ResourceVector before = s.BaseTable[0].Stock;

        CommandResult order = Recruit(s, b, UnitRole.Line, 2);
        Assert.That(order.Ok, Is.True, order.Error);
        Assert.That(order.Events.Single(), Is.EqualTo(new RecruitOrdered(b, UnitRole.Line, 2, 0)));
        Assert.That(order.State.UnitTable.Count, Is.EqualTo(0));
        Assert.That(order.State.BaseTable[0].Stock, Is.EqualTo(before.Subtract(RecruitRules.Cost(UnitRole.Line, 2))));

        var events = new List<GameEvent>();
        GameState next = EndAll(order.State, null, events);

        Unit unit = next.UnitTable.Single();
        Assert.That(unit, Is.EqualTo(new Unit(1, 0, UnitRole.Line, 2, 2, new TileCoord(6, 3), 300, AttachedBase: b)));
        Assert.That(events.OfType<UnitSpawned>().Single(), Is.EqualTo(new UnitSpawned(1, 0, UnitRole.Line, 2, new TileCoord(6, 3), "recruit")));
        Assert.That(next.Recruits.Count, Is.EqualTo(0));
    }

    [Test]
    public void The_people_in_the_price_leave_the_colony()
    {
        GameState s = Colony(out int b);

        GameState after = Ok(Recruit(s, b, UnitRole.Line, 1));

        Assert.That(after.BaseTable[0].Stock.Pop, Is.EqualTo(890));
    }

    [TestCase(UnitRole.Transport)]
    [TestCase(UnitRole.Militia)]
    public void Roles_that_cannot_be_recruited_are_refused(UnitRole role)
    {
        Assert.That(Recruit(Colony(out int b), b, role, 1).Error, Is.EqualTo(Err.WrongRole));
    }

    [Test]
    public void Military_needs_a_garrison_of_at_least_the_recruited_level()
    {
        GameState noFort = Colony(out int a, role: null);
        GameState lowFort = Colony(out int b, level: 1);

        Assert.That(Recruit(noFort, a, UnitRole.Shock, 1).Error, Is.EqualTo(Err.NoBuilding));
        Assert.That(Recruit(lowFort, b, UnitRole.Shock, 2).Error, Is.EqualTo(Err.BadLevel));
        Assert.That(Recruit(lowFort, b, UnitRole.Shock, 1).Ok, Is.True);
    }

    [Test]
    public void A_garrison_supports_four_units_at_level_one_and_seven_at_level_two_including_orders()
    {
        GameState s = Colony(out int b, level: 1);
        for (int i = 0; i < 4; i++)
        {
            s = Ok(Recruit(s, b, UnitRole.Line, 1));
        }

        Assert.That(Recruit(s, b, UnitRole.Ranged, 1).Error, Is.EqualTo(Err.SupportCap));

        GameState level2 = Colony(out int c, level: 2);
        for (int i = 0; i < 7; i++)
        {
            level2 = Ok(Recruit(level2, c, UnitRole.Line, 1));
        }

        Assert.That(Recruit(level2, c, UnitRole.Line, 1).Error, Is.EqualTo(Err.SupportCap));
    }

    [Test]
    public void Housed_units_count_against_the_support_cap_too()
    {
        GameState s = Colony(out int b, level: 1);
        for (int i = 0; i < 4; i++)
        {
            s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, new TileCoord(6, 3), b, 0, out _);
        }

        Assert.That(Recruit(s, b, UnitRole.Line, 1).Error, Is.EqualTo(Err.SupportCap));
    }

    [Test]
    public void Scouts_come_from_the_habitat_two_per_level()
    {
        GameState s = Colony(out int b, role: BuildingRole.Habitat, level: 1);
        s = Ok(Recruit(s, b, UnitRole.Scout, 1));
        s = Ok(Recruit(s, b, UnitRole.Scout, 1));

        Assert.That(Recruit(s, b, UnitRole.Scout, 1).Error, Is.EqualTo(Err.SupportCap));
        Assert.That(Recruit(Colony(out int c, role: null), c, UnitRole.Scout, 1).Error, Is.EqualTo(Err.NoBuilding));
    }

    [Test]
    public void Founders_need_a_habitat_of_exactly_that_level()
    {
        GameState s = Colony(out int b, role: BuildingRole.Habitat, level: 2);

        Assert.That(Recruit(s, b, UnitRole.Founder, 1).Error, Is.EqualTo(Err.BadLevel));
        GameState after = Ok(Recruit(s, b, UnitRole.Founder, 2));
        GameState next = EndAll(after);
        Assert.That(next.UnitTable.Single().AttachedBase, Is.EqualTo(0), "a founder is not housed");
    }

    [Test]
    public void Commanders_match_the_core_level_and_are_limited_to_it()
    {
        GameState s = Colony(out int b, core: 1, role: null);

        Assert.That(Recruit(s, b, UnitRole.Commander, 2).Error, Is.EqualTo(Err.BadLevel));
        GameState one = Ok(Recruit(s, b, UnitRole.Commander, 1));
        Assert.That(Recruit(one, b, UnitRole.Commander, 1).Error, Is.EqualTo(Err.SupportCap));
    }

    [Test]
    public void A_recruit_needs_the_money_and_a_valid_level_and_the_right_owner()
    {
        GameState poor = Base(New(), 0, 6, 3, out int b, core: 2, stock: new ResourceVector(0, 0, 0, 0, 0, 0));
        poor = GameFactory.AddBuilding(poor, b, BuildingRole.Garrison, 2, new TileCoord(7, 3));
        GameState rich = Colony(out int r);

        Assert.That(Recruit(poor, b, UnitRole.Line, 1).Error, Is.EqualTo(Err.NotEnoughResources));
        Assert.That(Recruit(rich, r, UnitRole.Line, 0).Error, Is.EqualTo(Err.BadLevel));
        Assert.That(Recruit(rich, 99, UnitRole.Line, 1).Error, Is.EqualTo(Err.UnknownBase));
        Assert.That(CommandEngine.Apply(rich, new RecruitCommand(1, r, UnitRole.Line, 1)).Error, Is.EqualTo(Err.NotOwner));
    }

    [Test]
    public void A_recruit_for_a_base_that_was_lost_is_dropped()
    {
        GameState s = Ok(Recruit(Colony(out int b), b, UnitRole.Line, 1));

        GameState after = EndAll(s.WithoutBase(b));

        Assert.That(after.UnitTable.Count, Is.EqualTo(0));
        Assert.That(after.Recruits.Count, Is.EqualTo(0));
    }

    [Test]
    public void Costs_follow_the_manual_table()
    {
        Assert.That(RecruitRules.Cost(UnitRole.Scout, 1), Is.EqualTo(new ResourceVector(0, 0, 20, 0, 0, 1)));
        Assert.That(RecruitRules.Cost(UnitRole.Founder, 4), Is.EqualTo(new ResourceVector(60, 20, 200, 10, 60, 600)));
        Assert.That(RecruitRules.Cost(UnitRole.Ranged, 3), Is.EqualTo(new ResourceVector(0, 20, 30, 2, 0, 15)));
        Assert.That(RecruitRules.Cost(UnitRole.Commander, 4), Is.EqualTo(new ResourceVector(0, 0, 500, 0, 0, 1)));
    }

    [Test]
    public void Detach_releases_a_unit_from_its_base_and_its_carrier()
    {
        GameState s = Colony(out int b);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, new TileCoord(6, 3), b, 0, out int id);

        GameState after = Ok(CommandEngine.Apply(s, new DetachCommand(0, id)));

        Assert.That(after.UnitTable.Single(), Is.EqualTo(s.UnitTable.Single() with { AttachedBase = 0 }));
        Assert.That(CommandEngine.Apply(s, new DetachCommand(1, id)).Error, Is.EqualTo(Err.NotOwner));
        Assert.That(CommandEngine.Apply(s, new DetachCommand(0, 77)).Error, Is.EqualTo(Err.UnknownUnit));
    }

    [Test]
    public void A_moving_commander_takes_its_carried_units_along_and_announces_each_move()
    {
        GameState s = Unit(New(), 0, UnitRole.Commander, 4, 3, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, new TileCoord(4, 3), 0, cmd, out int follower);

        CommandResult r = CommandEngine.Apply(s, new MoveCommand(0, cmd, new TileCoord(6, 3)));

        Assert.That(r.Ok, Is.True, r.Error);
        Assert.That(r.State.UnitTable.Select(u => u.Pos), Is.All.EqualTo(new TileCoord(6, 3)));
        Assert.That(r.Events.OfType<UnitMoved>().Select(e => e.Unit), Is.EqualTo(new[] { cmd, follower }));
        Assert.That(r.State.UnitTable.Single(u => u.Id == follower).Leader, Is.EqualTo(cmd));
    }

    [Test]
    public void Moving_a_carried_unit_on_its_own_detaches_it()
    {
        GameState s = Unit(New(), 0, UnitRole.Commander, 4, 3, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, new TileCoord(4, 3), 0, cmd, out int follower);

        GameState after = Ok(CommandEngine.Apply(s, new MoveCommand(0, follower, new TileCoord(5, 3))));

        Assert.That(after.UnitTable.Single(u => u.Id == follower).Leader, Is.EqualTo(0));
        Assert.That(after.UnitTable.Single(u => u.Id == cmd).Pos, Is.EqualTo(new TileCoord(4, 3)));
    }

    [Test]
    public void Losing_a_commander_or_a_base_releases_what_they_held()
    {
        GameState s = Colony(out int b);
        s = GameFactory.AddUnit(s, 0, UnitRole.Commander, 1, new TileCoord(6, 3), b, 0, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, new TileCoord(6, 3), b, cmd, out int f);

        GameState noCommander = s.WithoutUnit(cmd);
        GameState noBase = s.WithoutBase(b);

        Assert.That(noCommander.UnitTable.Single().Leader, Is.EqualTo(0));
        Assert.That(noCommander.UnitTable.Single().AttachedBase, Is.EqualTo(b));
        Assert.That(noBase.UnitTable.All(u => u.AttachedBase == 0), Is.True);
        Assert.That(noBase.UnitTable.Single(u => u.Id == f).Leader, Is.EqualTo(cmd));
    }
}
