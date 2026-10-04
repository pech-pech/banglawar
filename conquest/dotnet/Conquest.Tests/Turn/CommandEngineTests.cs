using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class CommandEngineTests
{
    [Test]
    public void Move_spends_movement_and_reports_the_step()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 2, 2, out int id);
        ulong before = StateHasher.Hash(s);
        CommandResult r = Do(s, new MoveCommand(0, id, new TileCoord(4, 2)));
        Assert.That(r.Ok, Is.True);
        Assert.That(r.Error, Is.Null);
        Unit u = r.State.UnitTable[0];
        Assert.That(u.Pos, Is.EqualTo(new TileCoord(4, 2)));
        // line has 3 points; (3,2) open 1 + (4,2) forest 2 = 3 points
        Assert.That(u.MovesLeft, Is.EqualTo(0));
        Assert.That(r.Events.Single(), Is.EqualTo(new UnitMoved(id, new TileCoord(2, 2), new TileCoord(4, 2), 0)));
        Assert.That(StateHasher.Hash(s), Is.EqualTo(before), "input state must not change");
    }

    [Test]
    public void Move_is_refused_beyond_the_remaining_budget()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 2, 1, out int id);
        s = Ok(Do(s, new MoveCommand(0, id, new TileCoord(2, 4))));
        Assert.That(s.UnitTable[0].MovesLeft, Is.EqualTo(0));
        CommandResult r = Do(s, new MoveCommand(0, id, new TileCoord(2, 5)));
        Assert.That(r.Ok, Is.False);
        Assert.That(r.Error, Is.EqualTo(Err.Unreachable));
        Assert.That(r.State, Is.SameAs(s));
        Assert.That(r.Events.Count, Is.EqualTo(0));
    }

    [Test]
    public void A_fresh_founder_may_take_one_step_into_hills_but_not_two()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 7, 1, out int id);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(8, 1))).Ok, Is.True);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(9, 2))).Error, Is.EqualTo(Err.Unreachable));
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(8, 1))).State.UnitTable[0].MovesLeft, Is.EqualTo(0));
    }

    [TestCase(0, "err.unknown_unit")]
    [TestCase(1, "err.not_owner")]
    public void Move_checks_unit_and_owner(int mode, string expected)
    {
        GameState s = Unit(New(), 1, UnitRole.Scout, 2, 2, out int id);
        int use = mode == 0 ? 999 : id;
        Assert.That(Do(s, new MoveCommand(0, use, new TileCoord(3, 2))).Error, Is.EqualTo(expected));
    }

    [Test]
    public void Move_rejects_off_map_water_and_peak_free_targets()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 2, out int id);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(-1, 2))).Error, Is.EqualTo(Err.OutOfBounds));
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(0, 2))).Error, Is.EqualTo(Err.Impassable));
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(11, 7))).Error, Is.EqualTo(Err.Impassable));
    }

    [Test]
    public void Units_cannot_enter_tiles_held_by_enemy_units_or_bases_but_may_stack_with_friends()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 2, out int mine);
        s = Unit(s, 0, UnitRole.Line, 3, 2, out _);
        s = Unit(s, 1, UnitRole.Line, 5, 2, out _);
        s = Base(s, 1, 8, 3, out _);
        Assert.That(Do(s, new MoveCommand(0, mine, new TileCoord(3, 2))).Ok, Is.True);
        Assert.That(Do(s, new MoveCommand(0, mine, new TileCoord(5, 2))).Error, Is.EqualTo(Err.Unreachable));
        Assert.That(Do(s, new MoveCommand(0, mine, new TileCoord(8, 3))).Error, Is.EqualTo(Err.Unreachable));
        // can path around the enemy to the tile behind it
        Assert.That(Do(s, new MoveCommand(0, mine, new TileCoord(6, 2))).Ok, Is.True);
    }

    [Test]
    public void Ships_move_on_deep_water_only()
    {
        GameState s = Unit(New(), 0, UnitRole.Transport, 0, 2, out int id);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(0, 6))).Ok, Is.True);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(1, 2))).Error, Is.EqualTo(Err.Impassable));
    }

    [Test]
    public void The_season_hook_changes_how_far_land_units_walk()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 2, 4, out int id);
        var wet = new TurnServices(hooks: new FakeHooks());
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(5, 4))).Ok, Is.True);
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(5, 4)), wet).Error, Is.EqualTo(Err.Unreachable));
        Assert.That(Do(s, new MoveCommand(0, id, new TileCoord(3, 4)), wet).Ok, Is.True);
    }

    [Test]
    public void Found_turns_a_founder_into_a_base_with_the_starting_kit()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 3, 4, out int id);
        CommandResult r = Do(s, new FoundBaseCommand(0, id));
        Assert.That(r.Ok, Is.True);
        Assert.That(r.State.UnitTable.Count, Is.EqualTo(0));
        Base b = r.State.BaseTable.Single();
        Assert.That(b.Owner, Is.EqualTo(0));
        Assert.That(b.Pos, Is.EqualTo(new TileCoord(3, 4)));
        Assert.That(b.CoreLevel, Is.EqualTo(1));
        Assert.That(b.Stock, Is.EqualTo(RuleTables.StartingStock));
        Assert.That(r.State.NextBaseId, Is.EqualTo(b.Id + 1));
        Assert.That(r.Events.Single(), Is.EqualTo(new BaseFounded(b.Id, 0, b.Pos)));
    }

    [Test]
    public void Found_enforces_role_owner_terrain_and_spacing()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 3, 4, out int line);
        s = Unit(s, 0, UnitRole.Founder, 8, 1, out int onHills);
        s = Unit(s, 0, UnitRole.Founder, 5, 4, out int near);
        s = Unit(s, 1, UnitRole.Founder, 6, 4, out int theirs);
        s = Base(s, 0, 4, 4, out _);
        Assert.That(Do(s, new FoundBaseCommand(0, 999)).Error, Is.EqualTo(Err.UnknownUnit));
        Assert.That(Do(s, new FoundBaseCommand(0, theirs)).Error, Is.EqualTo(Err.NotOwner));
        Assert.That(Do(s, new FoundBaseCommand(0, line)).Error, Is.EqualTo(Err.WrongRole));
        Assert.That(Do(s, new FoundBaseCommand(0, onHills)).Error, Is.EqualTo(Err.IllegalSite));
        Assert.That(Do(s, new FoundBaseCommand(0, near)).Error, Is.EqualTo(Err.TooCloseToBase));
    }

    [Test]
    public void Build_pays_now_and_works_next_turn()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: new ResourceVector(10, 0, 0, 0, 0, 100));
        CommandResult r = Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(5, 4)));
        Assert.That(r.Ok, Is.True);
        Base nb = r.State.BaseTable[0];
        Assert.That(nb.Stock.Basic, Is.EqualTo(6));
        Assert.That(nb.Buildings.Single(), Is.EqualTo(new Building(BuildingRole.Food, 1, new TileCoord(5, 4), 1, 0)));
        Assert.That(r.Events.Single(), Is.EqualTo(new BuildingOrdered(b, BuildingRole.Food, 1, 0)));
    }

    [Test]
    public void Build_rejects_each_illegal_placement()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: Rich);
        s = Base(s, 1, 10, 4, out int enemy);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Academy, 1, new TileCoord(3, 4));
        Assert.That(Do(s, new BuildCommand(0, 99, BuildingRole.Food, new TileCoord(5, 4))).Error, Is.EqualTo(Err.UnknownBase));
        Assert.That(Do(s, new BuildCommand(0, enemy, BuildingRole.Food, new TileCoord(9, 4))).Error, Is.EqualTo(Err.NotOwner));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(-1, 4))).Error, Is.EqualTo(Err.OutOfBounds));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(7, 4))).Error, Is.EqualTo(Err.OutsideArea));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(4, 4))).Error, Is.EqualTo(Err.IllegalSite));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(3, 4))).Error, Is.EqualTo(Err.TileOccupied));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Academy, new TileCoord(3, 3))).Error, Is.EqualTo(Err.DuplicateBuilding));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Port, new TileCoord(3, 3))).Error, Is.EqualTo(Err.NeedsWater));
        Assert.That(Do(s, new BuildCommand(0, b, BuildingRole.Port, new TileCoord(5, 5))).Ok, Is.True);
        GameState poor = Base(New(), 0, 4, 4, out int pb, stock: ResourceVector.Zero);
        Assert.That(Do(poor, new BuildCommand(0, pb, BuildingRole.Food, new TileCoord(5, 4))).Error, Is.EqualTo(Err.NotEnoughResources));
    }

    [Test]
    public void Upgrade_building_follows_center_cap_and_waits_a_turn()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 2, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, new TileCoord(5, 4));
        CommandResult r = Do(s, new UpgradeCommand(0, b, 0));
        Assert.That(r.Ok, Is.True);
        Building x = r.State.BaseTable[0].Buildings[0];
        Assert.That(x.PendingLevel, Is.EqualTo(2));
        Assert.That(x.Level, Is.EqualTo(1));
        Assert.That(r.State.BaseTable[0].Stock.Hard, Is.EqualTo(500 - 4));
        Assert.That(Do(r.State, new UpgradeCommand(0, b, 0)).Error, Is.EqualTo(Err.NotReady));
    }

    [Test]
    public void Upgrade_rejects_bad_requests()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, new TileCoord(5, 4));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Academy, 1, new TileCoord(3, 4));
        Assert.That(Do(s, new UpgradeCommand(0, 99, 0)).Error, Is.EqualTo(Err.UnknownBase));
        Assert.That(Do(s, new UpgradeCommand(1, b, 0)).Error, Is.EqualTo(Err.NotOwner));
        Assert.That(Do(s, new UpgradeCommand(0, b, 5)).Error, Is.EqualTo(Err.UnknownBuilding));
        Assert.That(Do(s, new UpgradeCommand(0, b, 0)).Error, Is.EqualTo(Err.CenterTooLow));
        Assert.That(Do(s, new UpgradeCommand(0, b, 1)).Error, Is.EqualTo(Err.MaxLevel));
        GameState maxed = Base(New(), 0, 4, 4, out int mb, core: 4, stock: Rich);
        maxed = GameFactory.AddBuilding(maxed, mb, BuildingRole.Food, 4, new TileCoord(5, 4));
        Assert.That(Do(maxed, new UpgradeCommand(0, mb, 0)).Error, Is.EqualTo(Err.MaxLevel));
        Assert.That(Do(maxed, new UpgradeCommand(0, mb, -1)).Error, Is.EqualTo(Err.MaxLevel));
        GameState fresh = Base(New(), 0, 4, 4, out int fb, core: 2, stock: Rich);
        fresh = Ok(Do(fresh, new BuildCommand(0, fb, BuildingRole.Food, new TileCoord(5, 4))));
        Assert.That(Do(fresh, new UpgradeCommand(0, fb, 0)).Error, Is.EqualTo(Err.NotReady));
        GameState poor = Base(New(), 0, 4, 4, out int pb, core: 2, stock: ResourceVector.Zero);
        poor = GameFactory.AddBuilding(poor, pb, BuildingRole.Food, 1, new TileCoord(5, 4));
        Assert.That(Do(poor, new UpgradeCommand(0, pb, 0)).Error, Is.EqualTo(Err.NotEnoughResources));
        Assert.That(Do(poor, new UpgradeCommand(0, pb, -1)).Error, Is.EqualTo(Err.NotEnoughResources));
    }

    [Test]
    public void Core_upgrade_costs_resources_and_applies_at_the_deferred_step()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: Rich);
        s = Ok(Do(s, new UpgradeCommand(0, b, -1)));
        Assert.That(s.BaseTable[0].PendingCoreLevel, Is.EqualTo(2));
        Assert.That(Do(s, new UpgradeCommand(0, b, -1)).Error, Is.EqualTo(Err.NotReady));
        GameState t0 = EndAll(s);
        Assert.That(t0.BaseTable[0].CoreLevel, Is.EqualTo(1), "ready next turn");
        GameState t1 = EndAll(t0);
        Assert.That(t1.BaseTable[0].CoreLevel, Is.EqualTo(2));
        Assert.That(t1.BaseTable[0].PendingCoreLevel, Is.EqualTo(0));
    }

    [Test]
    public void Attack_queue_validates_units_reach_and_target()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int a);
        s = Unit(s, 0, UnitRole.Scout, 4, 5, out int scout);
        s = Unit(s, 0, UnitRole.Line, 9, 9 - 2, out int far);
        s = Unit(s, 1, UnitRole.Line, 5, 4, out int enemy);
        s = Unit(s, 0, UnitRole.Line, 4, 3, out int friendTarget);
        var target = new TileCoord(5, 4);
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Empty, target)).Error, Is.EqualTo(Err.NoUnits));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(50, 4))).Error, Is.EqualTo(Err.OutOfBounds));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(999), target)).Error, Is.EqualTo(Err.UnknownUnit));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(enemy), target)).Error, Is.EqualTo(Err.NotOwner));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(scout), target)).Error, Is.EqualTo(Err.WrongRole));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(far), target)).Error, Is.EqualTo(Err.OutOfReach));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(4, 3))).Error, Is.EqualTo(Err.FriendlyTarget));
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(3, 3))).Error, Is.EqualTo(Err.NoTarget));
        CommandResult ok = Do(s, new AttackCommand(0, ImmArray<int>.Of(a, a), target));
        Assert.That(ok.Ok, Is.True);
        Assert.That(ok.State.Attacks.Single().UnitIds, Is.EqualTo(new[] { a }));
        Assert.That(friendTarget, Is.GreaterThan(0));
    }

    [Test]
    public void Attacks_on_a_base_tile_are_allowed_and_friendly_base_is_refused()
    {
        GameState s = Unit(New(), 0, UnitRole.Shock, 4, 4, out int a);
        s = Base(s, 1, 5, 4, out _);
        s = Base(s, 0, 3, 4, out _);
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))).Ok, Is.True);
        Assert.That(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(3, 4))).Error, Is.EqualTo(Err.FriendlyTarget));
    }

    [Test]
    public void Slot_gates_apply_to_every_command()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 2, out int id);
        Assert.That(Do(s, new MoveCommand(5, id, new TileCoord(3, 2))).Error, Is.EqualTo(Err.BadSlot));
        Assert.That(Do(s, new MoveCommand(-1, id, new TileCoord(3, 2))).Error, Is.EqualTo(Err.BadSlot));
        GameState ended = Ok(Do(s, new EndTurnCommand(0)));
        Assert.That(Do(ended, new MoveCommand(0, id, new TileCoord(3, 2))).Error, Is.EqualTo(Err.AlreadyEnded));
        GameState dead = s with { Factions = s.Factions.SetItem(0, s.Factions[0] with { Eliminated = true }) };
        Assert.That(Do(dead, new MoveCommand(0, id, new TileCoord(3, 2))).Error, Is.EqualTo(Err.Eliminated));
        GameState over = s with { MatchOver = true };
        Assert.That(Do(over, new MoveCommand(0, id, new TileCoord(3, 2))).Error, Is.EqualTo(Err.MatchOver));
    }

    [Test]
    public void Unknown_command_types_are_refused()
    {
        GameState s = New();
        Assert.That(Do(s, new OtherCommand(0)).Error, Is.EqualTo(Err.WrongRole));
    }

    private sealed record OtherCommand(int Slot) : Command(Slot);

    [Test]
    public void The_turn_resolves_only_when_every_active_slot_has_ended()
    {
        GameState s = Unit(New(slots: 3), 0, UnitRole.Scout, 2, 2, out _);
        GameState one = Ok(Do(s, new EndTurnCommand(0)));
        Assert.That(one.Turn, Is.EqualTo(0));
        GameState two = Ok(Do(one, new EndTurnCommand(1)));
        Assert.That(two.Turn, Is.EqualTo(0));
        CommandResult done = Do(two, new EndTurnCommand(2));
        Assert.That(done.State.Turn, Is.EqualTo(1));
        Assert.That(done.Events.OfType<TurnEnded>().Single().Turn, Is.EqualTo(1));
        Assert.That(done.State.Factions.All(f => !f.EndedTurn), Is.True);
    }

    [Test]
    public void Eliminated_slots_do_not_hold_up_the_turn()
    {
        GameState s = New(slots: 2);
        s = s with { Factions = s.Factions.SetItem(1, s.Factions[1] with { Eliminated = true }) };
        Assert.That(Ok(Do(s, new EndTurnCommand(0))).Turn, Is.EqualTo(1));
    }
}
