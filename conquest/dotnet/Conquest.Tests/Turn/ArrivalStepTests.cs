using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class ArrivalStepTests
{
    private static readonly TileCoord A = new TileCoord(2, 2);
    private static readonly TileCoord B = new TileCoord(3, 2);

    private static EntryGroup Group(string id, int slot, params TileCoord[] tiles) => new EntryGroup(id, slot, ImmArray<TileCoord>.From(tiles));

    private static ArrivalSpec Arrival(int index, int turn, int slot, string? group, bool attach = false, bool patron = false, params ArrivalUnit[] units) =>
        new ArrivalSpec(index, turn, slot, group, ImmArray<ArrivalUnit>.From(units), attach, patron);

    private static ArrivalUnit U(UnitRole role, int level = 1, int count = 1) => new ArrivalUnit(role, level, count);

    private static TurnServices Plan(int maxDefer, ITimedEffects? effects, EntryGroup[] groups, params ArrivalSpec[] arrivals) =>
        new TurnServices(arrivals: new ArrivalPlan(arrivals, groups, maxDefer), timedEffects: effects);

    private static GameState Run(GameState s, TurnServices svc, int turn, List<GameEvent>? events = null) =>
        ArrivalStep.Run(s, svc, turn, events ?? new List<GameEvent>());

    [Test]
    public void An_arrival_lands_as_one_stack_on_the_first_tile_of_its_group()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A, B) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line, 2, 2), U(UnitRole.Scout)));
        var events = new List<GameEvent>();

        GameState s = Run(New(), svc, 0, events);

        Assert.That(s.UnitTable.Select(u => u.Pos).Distinct(), Is.EqualTo(new[] { A }));
        Assert.That(s.UnitTable.Select(u => u.Role), Is.EqualTo(new[] { UnitRole.Line, UnitRole.Line, UnitRole.Scout }));
        Assert.That(events.OfType<UnitSpawned>().Select(e => e.Unit), Is.EqualTo(new[] { 1, 2, 3 }));
    }

    [Test]
    public void An_arrival_waits_for_its_turn_and_never_lands_twice()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 3, 0, "g", false, false, U(UnitRole.Line)));

        GameState early = Run(New(), svc, 2);
        GameState on = Run(early, svc, 3);
        GameState again = Run(on, svc, 4);

        Assert.That(early.UnitTable.Count, Is.EqualTo(0));
        Assert.That(on.UnitTable.Count, Is.EqualTo(1));
        Assert.That(again.UnitTable.Count, Is.EqualTo(1));
    }

    [Test]
    public void Tiles_with_an_enemy_unit_are_skipped()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A, B) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));
        GameState s = Unit(New(), 1, UnitRole.Line, A.X, A.Y, out _);

        s = Run(s, svc, 0);

        Assert.That(s.UnitTable.Single(u => u.Owner == 0).Pos, Is.EqualTo(B));
    }

    [Test]
    public void Tiles_inside_an_enemy_base_footprint_are_skipped()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A, B) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));
        GameState s = Base(New(), 1, 5, 5, out int bid, core: 2);
        s = GameFactory.AddBuilding(s, bid, BuildingRole.Food, 1, A);

        s = Run(s, svc, 0);

        Assert.That(s.UnitTable.Single().Pos, Is.EqualTo(B));
    }

    [Test]
    public void Water_tiles_are_not_land_passable_for_land_units()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, new TileCoord(0, 0), B) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));

        GameState s = Run(New(), svc, 0);

        Assert.That(s.UnitTable.Single().Pos, Is.EqualTo(B));
    }

    [Test]
    public void A_blocked_arrival_is_deferred_and_lands_when_the_tile_is_free()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));
        GameState blocked = Unit(New(), 1, UnitRole.Line, A.X, A.Y, out int enemy);
        var events = new List<GameEvent>();

        GameState first = Run(blocked, svc, 0, events);
        GameState second = Run(first.WithoutUnit(enemy), svc, 1, events);

        Assert.That(first.UnitTable.Count(u => u.Owner == 0), Is.EqualTo(0));
        Assert.That(first.GetExt(ArrivalStep.DeferPrefix + 0), Is.EqualTo(1));
        Assert.That(events.OfType<ArrivalDeferred>().Single(), Is.EqualTo(new ArrivalDeferred(0, "g", 0)));
        Assert.That(second.UnitTable.Single().Pos, Is.EqualTo(A));
        Assert.That(second.GetExt(ArrivalStep.DonePrefix + 0), Is.EqualTo(1));
    }

    [Test]
    public void After_the_defer_limit_the_arrival_lands_on_any_free_tile_of_the_slots_other_groups()
    {
        TurnServices svc = Plan(1, null, new[] { Group("g", 0, A), Group("h", 0, B) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));
        GameState s = Unit(New(), 1, UnitRole.Line, A.X, A.Y, out _);

        s = Run(s, svc, 0);
        s = Run(s, svc, 1);
        Assert.That(s.UnitTable.Count(u => u.Owner == 0), Is.EqualTo(0), "deferred twice is not yet over the limit of 1 deferral");
        s = Run(s, svc, 2);

        Assert.That(s.UnitTable.Single(u => u.Owner == 0).Pos, Is.EqualTo(B));
    }

    [Test]
    public void A_commander_carries_up_to_four_units_per_level_and_the_overflow_stands_alone()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) },
            Arrival(0, 0, 0, "g", true, false, U(UnitRole.Line, 1, 5), U(UnitRole.Commander), U(UnitRole.Scout), U(UnitRole.Founder)));

        GameState s = Run(New(), svc, 0);
        Unit commander = s.UnitTable.Single(u => u.Role == UnitRole.Commander);

        var carried = s.UnitTable.Where(u => u.Leader == commander.Id).ToList();
        Assert.That(carried.Count, Is.EqualTo(4));
        Assert.That(s.UnitTable.Count(u => u.Role == UnitRole.Line && u.Leader == 0), Is.EqualTo(1), "5 line + 1 founder = 6 carriable, the first 4 fit");
        Assert.That(s.UnitTable.Single(u => u.Role == UnitRole.Founder).Leader, Is.EqualTo(0));
        Assert.That(s.UnitTable.Single(u => u.Role == UnitRole.Scout).Leader, Is.EqualTo(0));
        Assert.That(s.UnitTable.Select(u => u.Pos).Distinct().Count(), Is.EqualTo(1));
    }

    [Test]
    public void Nobody_is_attached_without_the_flag_or_without_a_commander()
    {
        TurnServices noFlag = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Commander), U(UnitRole.Line)));
        TurnServices noCommander = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", true, false, U(UnitRole.Line)));

        Assert.That(Run(New(), noFlag, 0).UnitTable.All(u => u.Leader == 0), Is.True);
        Assert.That(Run(New(), noCommander, 0).UnitTable.All(u => u.Leader == 0), Is.True);
    }

    [Test]
    public void A_patron_arrival_is_cancelled_when_the_link_is_cut_and_is_not_deferred()
    {
        var cut = new TimedEffectSet(true, new[] { new TimedEffectEntry("te", 0, null, 0, patronLinkCut: true) });
        TurnServices svc = Plan(-1, cut, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", false, true, U(UnitRole.Line)));
        var events = new List<GameEvent>();

        GameState s = Run(New(), svc, 0, events);

        Assert.That(s.UnitTable.Count, Is.EqualTo(0));
        Assert.That(events.OfType<ArrivalCancelled>().Single(), Is.EqualTo(new ArrivalCancelled(0, 0, "patron_link_cut")));
        Assert.That(s.GetExt(ArrivalStep.DonePrefix + 0), Is.EqualTo(1));
    }

    [Test]
    public void A_patron_arrival_lands_when_the_link_is_up()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", false, true, U(UnitRole.Line)));

        Assert.That(Run(New(), svc, 0).UnitTable.Count, Is.EqualTo(1));
    }

    [Test]
    public void An_arrival_without_a_group_lands_on_the_nearest_free_tile_to_the_slots_first_base()
    {
        TurnServices svc = Plan(-1, null, new EntryGroup[0], Arrival(0, 0, 1, null, false, false, U(UnitRole.Line)));
        GameState s = Base(New(), 1, 6, 4, out _);

        s = Run(s, svc, 0);

        Unit landed = s.UnitTable.Single(u => u.Owner == 1);
        Assert.That(landed.Pos, Is.EqualTo(new TileCoord(6, 4)), "the base tile itself is free for its own side");
    }

    [Test]
    public void An_arrival_for_a_slot_without_a_base_or_group_waits()
    {
        TurnServices svc = Plan(-1, null, new EntryGroup[0], Arrival(0, 0, 1, null, false, false, U(UnitRole.Line)));
        var events = new List<GameEvent>();

        GameState s = Run(New(), svc, 0, events);

        Assert.That(s.UnitTable.Count, Is.EqualTo(0));
        Assert.That(events.OfType<ArrivalDeferred>().Count(), Is.EqualTo(1));
    }

    [Test]
    public void An_unknown_group_cancels_the_arrival()
    {
        TurnServices svc = Plan(-1, null, new EntryGroup[0], Arrival(0, 0, 0, "ghost", false, false, U(UnitRole.Line)));
        var events = new List<GameEvent>();

        GameState s = Run(New(), svc, 0, events);

        Assert.That(events.OfType<ArrivalCancelled>().Single().Reason, Is.EqualTo("unknown_group"));
        Assert.That(s.UnitTable.Count, Is.EqualTo(0));
    }

    [Test]
    public void An_eliminated_slot_gets_nothing()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 0, 0, "g", false, false, U(UnitRole.Line)));
        GameState s = New();
        s = s with { Factions = s.Factions.SetItem(0, s.Factions[0] with { Eliminated = true }) };

        Assert.That(Run(s, svc, 0).UnitTable.Count, Is.EqualTo(0));
    }

    [Test]
    public void The_turn_pipeline_places_next_turns_arrivals_at_the_end_of_this_turn()
    {
        TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A) }, Arrival(0, 1, 0, "g", false, false, U(UnitRole.Line)));
        GameState s = New();
        var events = new List<GameEvent>();

        GameState turn1 = EndAll(s, svc, events);

        Assert.That(turn1.Turn, Is.EqualTo(1));
        Assert.That(turn1.UnitTable.Single().Pos, Is.EqualTo(A), "present when turn 1 begins");
        Assert.That(events.OfType<UnitSpawned>().Count(), Is.EqualTo(1));
    }

    [Test]
    public void No_arrival_is_ever_lost_or_duplicated_whatever_blocks_the_entry()
    {
        var arrivals = new[]
        {
            Arrival(0, 1, 0, "g", false, false, U(UnitRole.Line, 1, 2)),
            Arrival(1, 2, 0, "g", false, false, U(UnitRole.Scout)),
            Arrival(2, 2, 0, "g", true, false, U(UnitRole.Commander), U(UnitRole.Line)),
        };
        for (int seed = 1; seed <= 25; seed++)
        {
            TurnServices svc = Plan(-1, null, new[] { Group("g", 0, A, B) }, arrivals);
            GameState s = New(2, (ulong)seed);
            uint rnd = (uint)seed * 2654435761u;
            for (int turn = 0; turn < 12; turn++)
            {
                rnd = (rnd * 1664525u) + 1013904223u;
                s = s with { UnitTable = ImmArray<Unit>.From(s.UnitTable.Where(u => u.Owner == 0)) };
                if ((rnd >> 28) % 2 == 0)
                {
                    s = Unit(s, 1, UnitRole.Line, A.X, A.Y, out _);
                }

                if ((rnd >> 24) % 2 == 0)
                {
                    s = Unit(s, 1, UnitRole.Line, B.X, B.Y, out _);
                }

                s = Run(s, svc, turn);
            }

            Assert.That(s.UnitTable.Count(u => u.Owner == 0), Is.EqualTo(5), "seed " + seed + ": 2 line + scout + commander + line, each exactly once");
        }
    }
}
