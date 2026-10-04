using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Combat;

/// <summary>A resolver that records the context and returns a prepared result.</summary>
internal sealed class ScriptedResolver : ICombatResolver
{
    private readonly Func<ICombatContext, CombatResult> _make;

    public ScriptedResolver(Func<ICombatContext, CombatResult> make)
    {
        _make = make;
    }

    public ICombatContext? Last { get; private set; }

    public CombatResult Resolve(ICombatContext context)
    {
        Last = context;
        return _make(context);
    }
}

public class PipelineContractTests
{
    private static GameState Setup(out int attacker, out int target, bool withBase = false, string? site = null)
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 3, out attacker, level: 3);
        s = Unit(s, 1, UnitRole.Line, 5, 3, out target, level: 2);
        return withBase ? Base(s, 1, 5, 3, out _, core: 2, stock: Rich, site: site) : s;
    }

    private static GameState Order(GameState s, int attacker, TileCoord at, AttackKind kind = AttackKind.Capture) =>
        Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(attacker), at, kind)));

    [Test]
    public void The_context_carries_the_attack_kind_site_flags_and_the_timed_panic_modifier()
    {
        GameState s = Setup(out int a, out _, withBase: true, site: "site.capital");
        s = Order(s, a, new TileCoord(5, 3), AttackKind.Raid);
        var resolver = new ScriptedResolver(_ => CombatResult.None);
        var timed = new TimedEffectSet(true, new[]
        {
            new TimedEffectEntry("te.a", 0, null, 1, panicPermille: 100),
            new TimedEffectEntry("te.b", 0, null, 0, panicPermille: 40, scope: PanicScope.AllBattles),
        });
        var svc = new TurnServices(resolver, timedEffects: timed, scenario: new ScenarioRules(new[] { "site.capital" }, captureLegal: false));

        EndAll(s, svc);

        ICombatContext ctx = resolver.Last!;
        Assert.That(ctx.Kind, Is.EqualTo(AttackKind.Raid));
        Assert.That(ctx.RaidCanDestroy, Is.False);
        Assert.That(ctx.CaptureLegal, Is.False);
        Assert.That(ctx.PanicModifierPermille(1, true), Is.EqualTo(100));
        Assert.That(ctx.PanicModifierPermille(1, false), Is.EqualTo(0), "the effect of slot 1 is scoped to its own base defence");
        Assert.That(ctx.PanicModifierPermille(0, false), Is.EqualTo(40));
        Assert.That(ctx.Attackers.Single().MaxStrength, Is.EqualTo(3));
    }

    [Test]
    public void A_site_that_may_be_destroyed_and_a_site_less_base_report_so()
    {
        GameState s = Setup(out int a, out _, withBase: true, site: "site.free");
        var resolver = new ScriptedResolver(_ => CombatResult.None);

        EndAll(Order(s, a, new TileCoord(5, 3)), new TurnServices(resolver));

        Assert.That(resolver.Last!.RaidCanDestroy, Is.True);
        Assert.That(resolver.Last.CaptureLegal, Is.True);
        Assert.That(resolver.Last.Kind, Is.EqualTo(AttackKind.Capture));
    }

    [Test]
    public void Queueing_an_attack_reports_it_to_its_owner_and_a_raid_needs_an_enemy_base()
    {
        GameState s = Setup(out int a, out _);

        CommandResult queued = Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 3)));
        CommandResult raidOnUnit = Do(s, new AttackCommand(0, ImmArray<int>.Of(a), new TileCoord(5, 3), AttackKind.Raid));

        AttackOrdered ev = (AttackOrdered)queued.Events.Single();
        Assert.That(ev.Units, Is.EqualTo(ImmArray<int>.Of(a)));
        Assert.That(ev.VisibleTo(0), Is.True);
        Assert.That(ev.VisibleTo(1), Is.False);
        Assert.That(raidOnUnit.Error, Is.EqualTo(Err.NoTarget));
    }

    [Test]
    public void A_resolved_attack_is_reported_to_everyone_with_both_sides_and_the_winner()
    {
        GameState s = Setup(out int a, out int d);
        var events = new List<GameEvent>();
        var resolver = new ScriptedResolver(c => new CombatResult(
            ImmArray<UnitChange>.Of(new UnitChange(d, 0, null)), null, ImmArray<GameEvent>.Empty, Winner: BattleWinner.Attacker));

        EndAll(Order(s, a, new TileCoord(5, 3)), new TurnServices(resolver), events);

        AttackResolved ev = events.OfType<AttackResolved>().Single();
        Assert.That(ev, Is.EqualTo(new AttackResolved(0, 1, new TileCoord(5, 3), ImmArray<int>.Of(a), ImmArray<int>.Of(d), AttackKind.Capture, "attacker")));
        Assert.That(ev.VisibleTo(0) && ev.VisibleTo(1), Is.True);
        Assert.That(events.IndexOf(ev), Is.LessThan(events.FindIndex(e => e is UnitDestroyed)), "the summary comes before the per-unit results");
    }

    [Test]
    public void Raid_spoils_are_credited_to_the_raiders_first_base_and_reported()
    {
        GameState s = Setup(out int a, out _, withBase: true);
        s = Base(s, 0, 2, 6, out int home, core: 1, stock: ResourceVector.Zero);
        var spoils = new ResourceVector(5, 4, 3, 2, 1, 0);
        var resolver = new ScriptedResolver(_ => new CombatResult(ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty, Spoils: spoils));
        var events = new List<GameEvent>();

        GameState after = EndAll(Order(s, a, new TileCoord(5, 3), AttackKind.Raid), new TurnServices(resolver), events);

        Assert.That(after.BaseTable.Single(b => b.Id == home).Stock.Basic, Is.EqualTo(5));
        Assert.That(events.OfType<RaidSpoilsTaken>().Single(), Is.EqualTo(new RaidSpoilsTaken(1, home, 0, spoils)));
    }

    [Test]
    public void Spoils_with_no_base_to_receive_them_are_lost_but_still_reported()
    {
        GameState s = Setup(out int a, out _, withBase: true);
        var spoils = new ResourceVector(5, 0, 0, 0, 0, 0);
        var resolver = new ScriptedResolver(_ => new CombatResult(ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty, Spoils: spoils));
        var events = new List<GameEvent>();

        EndAll(Order(s, a, new TileCoord(5, 3), AttackKind.Raid), new TurnServices(resolver), events);

        Assert.That(events.OfType<RaidSpoilsTaken>().Single().ToBase, Is.EqualTo(0));
    }

    [Test]
    public void Zero_spoils_raise_no_event()
    {
        GameState s = Setup(out int a, out _, withBase: true);
        var resolver = new ScriptedResolver(_ => new CombatResult(ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty, Spoils: ResourceVector.Zero));
        var events = new List<GameEvent>();

        EndAll(Order(s, a, new TileCoord(5, 3), AttackKind.Raid), new TurnServices(resolver), events);

        Assert.That(events.OfType<RaidSpoilsTaken>(), Is.Empty);
    }

    [Test]
    public void Retreats_move_units_drop_their_attachments_and_ignore_illegal_tiles()
    {
        GameState s = Setup(out int a, out int d);
        s = Unit(s, 0, UnitRole.Commander, 4, 3, out int cmd);
        s = s.WithUnit(s.UnitTable[s.FindUnitIndex(a)] with { Leader = cmd });
        var resolver = new ScriptedResolver(_ => new CombatResult(
            ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty,
            Retreats: ImmArray<UnitRetreat>.Of(new UnitRetreat(a, new TileCoord(3, 3)), new UnitRetreat(cmd, new TileCoord(5, 3)), new UnitRetreat(99, new TileCoord(1, 1)))));
        var events = new List<GameEvent>();

        GameState after = EndAll(Order(s, a, new TileCoord(5, 3)), new TurnServices(resolver), events);

        Unit moved = after.UnitTable.Single(u => u.Id == a);
        Assert.That(moved.Pos, Is.EqualTo(new TileCoord(3, 3)));
        Assert.That(moved.Leader, Is.EqualTo(0));
        Assert.That(after.UnitTable.Single(u => u.Id == cmd).Pos, Is.EqualTo(new TileCoord(4, 3)), "the enemy tile is closed to a retreat");
        Assert.That(events.OfType<UnitRetreated>().Single(), Is.EqualTo(new UnitRetreated(a, new TileCoord(4, 3), new TileCoord(3, 3), 0)));
    }

    [Test]
    public void Reputation_changes_are_applied_and_clamped()
    {
        GameState s = Setup(out int a, out _);
        s = Unit(s, 0, UnitRole.Commander, 4, 3, out int cmd);
        var resolver = new ScriptedResolver(_ => new CombatResult(
            ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty, Reputation: ImmArray<ReputationChange>.Of(new ReputationChange(cmd, 14), new ReputationChange(555, 2))));

        GameState after = EndAll(Order(s, a, new TileCoord(5, 3)), new TurnServices(resolver));

        Assert.That(after.UnitTable.Single(u => u.Id == cmd).Reputation, Is.EqualTo(10));
    }

    [Test]
    public void The_event_audience_follows_the_declared_visibility()
    {
        var taken = new SiteTaken("site.capital", 1, 0, SiteTaken.ViaCapture);

        Assert.That(taken.Visibility, Is.EqualTo(EventVisibility.Parties));
        Assert.That(new[] { 0, 1, 2 }.Select(taken.VisibleTo), Is.EqualTo(new[] { true, true, false }));
        Assert.That(new TurnEnded(3).VisibleTo(5), Is.True);
        Assert.That(new UnitHealed(1, 1, "bld.core", 0).VisibleTo(1), Is.False);
        Assert.That(new UnitHealed(1, 1, "bld.core", 0).VisibleTo(0), Is.True);
        Assert.That(SiteTaken.ViaRaid, Is.EqualTo("raid"));
    }

    [Test]
    public void Views_expose_max_strength_attachment_leader_reputation_and_the_pending_core_level()
    {
        GameState s = Base(New(), 0, 6, 3, out int b, core: 2, stock: Rich);
        s = GameFactory.AddUnit(s, 0, UnitRole.Commander, 3, new TileCoord(6, 3), b, 0, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 2, new TileCoord(6, 3), 0, cmd, out int line);
        s = s.WithUnit(s.UnitTable[s.FindUnitIndex(cmd)] with { Reputation = 4, Strength = 2 });
        s = s.WithBase(s.BaseTable[0] with { PendingCoreLevel = 3 });
        IGameStateView view = s;

        Assert.That(view.TryGetUnit(cmd, out UnitView c), Is.True);
        Assert.That((c.MaxStrength, c.AttachedBase, c.Leader, c.Reputation), Is.EqualTo((3, b, 0, 4)));
        Assert.That(view.TryGetUnit(line, out UnitView l), Is.True);
        Assert.That((l.MaxStrength, l.AttachedBase, l.Leader), Is.EqualTo((2, 0, cmd)));
        Assert.That(view.Bases.Single().PendingCoreLevel, Is.EqualTo(3));
    }
}
