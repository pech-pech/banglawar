using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class TurnResolverTests
{
    private static GameState Duel(out int attacker, out int defender)
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out attacker);
        s = Unit(s, 1, UnitRole.Line, 5, 4, out defender);
        return s;
    }

    [Test]
    public void Attack_resolves_through_the_combat_contract_and_applies_the_result()
    {
        GameState s = Duel(out int a, out int d);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        var resolver = new KillAllResolver();
        var events = new List<GameEvent>();
        GameState after = EndAll(s, new TurnServices(resolver), events);
        Assert.That(resolver.Calls, Is.EqualTo(1));
        Assert.That(resolver.Last!.Turn, Is.EqualTo(0));
        Assert.That(resolver.Last.AttackerSlot, Is.EqualTo(0));
        Assert.That(resolver.Last.DefenderSlot, Is.EqualTo(1));
        Assert.That(resolver.Last.Attackers.Single().Id, Is.EqualTo(a));
        Assert.That(resolver.Last.Defenders.Single().Id, Is.EqualTo(d));
        Assert.That(resolver.Last.TargetTerrain, Is.EqualTo(Terrain.Open));
        Assert.That(resolver.Last.TargetBase, Is.Null);
        Assert.That(resolver.Last.State.Turn, Is.EqualTo(0));
        Assert.That(after.UnitTable.Select(u => u.Id), Is.EqualTo(new[] { a }));
        Assert.That(after.Attacks.Count, Is.EqualTo(0));
        Assert.That(events.OfType<UnitDestroyed>().Single(), Is.EqualTo(new UnitDestroyed(d, 1)));
    }

    [Test]
    public void The_battle_seed_comes_from_the_game_rng_state_in_order()
    {
        GameState s = Duel(out int a, out _);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        var resolver = new KillAllResolver();
        EndAll(s, new TurnServices(resolver));
        RngState.FromSeed(42).Next(out ulong expected);
        Assert.That(resolver.Last!.BattleSeed, Is.EqualTo(expected));
        GameState moved = EndAll(s, new TurnServices(new KillAllResolver()));
        Assert.That(moved.Rng, Is.Not.EqualTo(s.Rng));
    }

    [Test]
    public void Capturing_a_base_changes_owner_stock_core_and_buildings()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int a);
        s = Base(s, 1, 5, 4, out int b, core: 2, stock: Rich, site: "site.capital");
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, new TileCoord(6, 4));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Habitat, 1, new TileCoord(6, 5));
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        var events = new List<GameEvent>();
        GameState after = EndAll(s, new TurnServices(new KillAllResolver()), events);
        Base nb = after.BaseTable.Single();
        Assert.That(nb.Owner, Is.EqualTo(0));
        Assert.That(nb.SiteId, Is.EqualTo("site.capital"), "site ids survive capture");
        Assert.That(nb.Stock.Basic, Is.EqualTo(1).Or.EqualTo(1 + 0));
        Assert.That(nb.CoreLevel, Is.EqualTo(1));
        Assert.That(nb.Buildings.Single().Role, Is.EqualTo(BuildingRole.Habitat));
        Assert.That(events.OfType<SiteTaken>().Single().TakerSlot, Is.EqualTo(0));
    }

    [Test]
    public void A_destroyed_base_is_removed()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int a);
        s = Base(s, 1, 5, 4, out _);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        GameState after = EndAll(s, new TurnServices(new DestroyBaseResolver()));
        Assert.That(after.BaseTable.Count, Is.EqualTo(0));
    }

    [Test]
    public void Unit_changes_can_move_clamp_and_ignore_unknown_units()
    {
        GameState s = Duel(out int a, out int d);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        GameState after = EndAll(s, new TurnServices(new MoveAndHealResolver()));
        Unit ua = after.UnitTable.Single(u => u.Id == a);
        Assert.That(ua.Strength, Is.EqualTo(2));
        Assert.That(ua.Pos, Is.EqualTo(new TileCoord(4, 4)), "off-map retreat is ignored");
        Assert.That(after.UnitTable.Single(u => u.Id == d).Strength, Is.EqualTo(3));
    }

    [Test]
    public void Cancelled_attacks_are_reported_with_a_reason()
    {
        GameState s = Duel(out int a, out int d);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));

        var noResolver = new List<GameEvent>();
        EndAll(s, null, noResolver);
        Assert.That(noResolver.OfType<AttackCancelled>().Single(), Is.EqualTo(new AttackCancelled(0, "no_resolver")));

        GameState gone = s.WithoutUnit(d);
        var goneEvents = new List<GameEvent>();
        EndAll(gone, new TurnServices(new KillAllResolver()), goneEvents);
        Assert.That(goneEvents.OfType<AttackCancelled>().Single().Reason, Is.EqualTo("target_gone"));

        GameState away = s.WithUnit(s.UnitTable.Single(u => u.Id == a) with { Pos = new TileCoord(1, 1) });
        var awayEvents = new List<GameEvent>();
        var killer = new KillAllResolver();
        EndAll(away, new TurnServices(killer), awayEvents);
        Assert.That(awayEvents.OfType<AttackCancelled>().Single().Reason, Is.EqualTo("out_of_reach"));
        Assert.That(killer.Calls, Is.EqualTo(0));

        GameState dead = s.WithoutUnit(a);
        var deadEvents = new List<GameEvent>();
        EndAll(dead, new TurnServices(killer), deadEvents);
        Assert.That(deadEvents.OfType<AttackCancelled>().Single().Reason, Is.EqualTo("out_of_reach"));
    }

    [Test]
    public void Attacks_resolve_in_queue_order_and_later_ones_see_earlier_results()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int a);
        s = Unit(s, 0, UnitRole.Line, 4, 5, out int a2);
        s = Unit(s, 1, UnitRole.Line, 5, 4, out _);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a2), new TileCoord(5, 4))));
        var killer = new KillAllResolver();
        var events = new List<GameEvent>();
        EndAll(s, new TurnServices(killer), events);
        Assert.That(killer.Calls, Is.EqualTo(1));
        Assert.That(events.OfType<AttackCancelled>().Single().Reason, Is.EqualTo("target_gone"));
    }

    [Test]
    public void Units_get_their_movement_back_each_turn()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 2, out int id);
        s = Ok(Do(s, new MoveCommand(0, id, new TileCoord(5, 2))));
        Assert.That(s.UnitTable[0].MovesLeft, Is.LessThan(800));
        Assert.That(EndAll(s).UnitTable[0].MovesLeft, Is.EqualTo(800));
    }

    [Test]
    public void Buildings_ordered_this_turn_start_working_the_next_turn()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: new ResourceVector(10, 0, 0, 0, 5, 100));
        s = Ok(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(5, 4))));
        GameState t1 = EndAll(s);
        Assert.That(t1.BaseTable[0].Stock.Food, Is.EqualTo(4), "turn 0: not yet working, 1 eaten");
        GameState t2 = EndAll(t1);
        Assert.That(t2.BaseTable[0].Stock.Food, Is.EqualTo(4 + 3 - 1), "turn 1: farm yields 3, 100 people (the housing cap) eat 1");
    }

    [Test]
    public void Pending_upgrades_apply_when_ready_and_keep_the_old_level_working_meanwhile()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 2, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.CoinExtractor, 1, new TileCoord(5, 4));
        s = Ok(Do(s, new UpgradeCommand(0, b, 0)));
        GameState t1 = EndAll(s);
        Building mid = t1.BaseTable[0].Buildings[0];
        Assert.That(mid.Level, Is.EqualTo(1));
        Assert.That(t1.BaseTable[0].Stock.Coin, Is.EqualTo(520), "old level 1 produced 20 coins (the upgrade costs no coin)");
        GameState t2 = EndAll(t1);
        Assert.That(t2.BaseTable[0].Buildings[0].Level, Is.EqualTo(2));
        Assert.That(t2.BaseTable[0].Buildings[0].PendingLevel, Is.EqualTo(0));
        Assert.That(t2.BaseTable[0].Stock.Coin, Is.EqualTo(580), "level 2 yields 60 once it is applied");
    }

    [Test]
    public void Season_changes_emit_one_event_and_scale_food_output()
    {
        GameState s = Base(New(), 0, 4, 4, out int b, core: 1, stock: new ResourceVector(0, 0, 0, 0, 5, 100));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 2, new TileCoord(5, 4));
        var svc = new TurnServices(hooks: new FakeHooks());
        var events = new List<GameEvent>();
        GameState t1 = EndAll(s, svc, events);
        Assert.That(events.OfType<SeasonStarted>(), Is.Empty);
        Assert.That(t1.BaseTable[0].Stock.Food, Is.EqualTo(5 + 4 - 1), "9 * 50% = 4");
        GameState t2 = EndAll(t1, svc, events);
        Assert.That(events.OfType<SeasonStarted>().Single().Season, Is.EqualTo("season.wet"));
        Assert.That(t2.Turn, Is.EqualTo(2));
        EndAll(t2, svc, events);
        Assert.That(events.OfType<SeasonStarted>().Count(), Is.EqualTo(1));
    }

    [Test]
    public void Healing_and_end_conditions_are_called_in_the_pipeline_and_applied()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out int id, level: 3);
        s = s.WithUnit(s.UnitTable[0] with { Strength = 1 });
        var end = new FakeEnd();
        var events = new List<GameEvent>();
        GameState after = EndAll(s, new TurnServices(healing: new FakeHealing(), endConditions: end), events);
        Assert.That(after.UnitTable.Single(u => u.Id == id).Strength, Is.EqualTo(2));
        Assert.That(events.OfType<UnitHealed>().Single().Unit, Is.EqualTo(id));
        Assert.That(end.Calls, Is.EqualTo(1));
        Assert.That(after.Factions[1].Eliminated, Is.True);
        Assert.That(after.MatchOver, Is.True);
        Assert.That(after.WinnerSlot, Is.EqualTo(0));
        Assert.That(after.GetExt("no_base_turns.f2"), Is.EqualTo(1));
        Assert.That(events.OfType<MatchWon>().Single().WinnerSlot, Is.EqualTo(0));
        Assert.That(Do(after, new EndTurnCommand(0)).Error, Is.EqualTo(Err.MatchOver));
    }

    [Test]
    public void Out_of_range_eliminations_from_rules_are_ignored()
    {
        GameState s = New(slots: 1);
        var svc = new TurnServices(endConditions: new BadEnd());
        Assert.DoesNotThrow(() => EndAll(s, svc));
    }

    private sealed class BadEnd : IEndConditions
    {
        public EndCheckResult Evaluate(IGameStateView state) =>
            new EndCheckResult(ImmArray<int>.Of(-1, 9), false, -1, ImmArray<ExtUpdate>.Empty, ImmArray<GameEvent>.Empty);
    }

    [Test]
    public void Resolving_never_mutates_the_input_and_is_repeatable()
    {
        GameState s = Duel(out int a, out _);
        s = Base(s, 0, 2, 5, out int b, stock: Rich);
        s = GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, new TileCoord(3, 5));
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 4))));
        s = Ok(Do(s, new EndTurnCommand(0)));
        ulong before = StateHasher.Hash(s);
        CommandResult r1 = Do(s, new EndTurnCommand(1), new TurnServices(new KillAllResolver()));
        CommandResult r2 = Do(s, new EndTurnCommand(1), new TurnServices(new KillAllResolver()));
        Assert.That(StateHasher.Hash(s), Is.EqualTo(before));
        Assert.That(StateHasher.Hash(r1.State), Is.EqualTo(StateHasher.Hash(r2.State)));
        Assert.That(r1.Events.Count, Is.EqualTo(r2.Events.Count));
    }
}
