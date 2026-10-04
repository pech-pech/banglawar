using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;

namespace Conquest.Tests.Combat;

public class ResolverContractExtrasTests
{
    private static readonly TileCoord Target = new TileCoord(10, 10);

    private static UnitView V(int id, int owner, UnitRole role, int level, int strength, TileCoord pos, int reputation = 0) =>
        new UnitView(id, owner, role, level, strength, pos, 0, strength, 0, 0, reputation);

    private static FakeContext Field(UnitView[] attackers, UnitView[] defenders, BaseView? target = null, AttackKind kind = AttackKind.Capture)
    {
        var view = new FakeView();
        view.UnitList.AddRange(attackers);
        view.UnitList.AddRange(defenders);
        return new FakeContext { Target = Target, Attackers = attackers, Defenders = defenders, TargetBase = target, State = view, Kind = kind };
    }

    private static UnitView[] Army(int firstId, int owner, int count, int strength, TileCoord pos) =>
        Enumerable.Range(0, count).Select(i => V(firstId + i, owner, UnitRole.Line, strength, strength, pos)).ToArray();

    private static CombatResolver Sure() => new CombatResolver(new CombatResolverOptions(BattleTestKit.AlwaysHit));

    [Test]
    public void The_winner_is_reported()
    {
        CombatResult attackerWins = Sure().Resolve(Field(Army(1, 0, 4, 5, new TileCoord(9, 10)), Army(20, 1, 1, 1, Target)));
        CombatResult defenderWins = Sure().Resolve(Field(Army(1, 0, 1, 1, new TileCoord(9, 10)), Army(20, 1, 4, 5, Target)));

        Assert.That(attackerWins.Winner, Is.EqualTo(BattleWinner.Attacker));
        Assert.That(defenderWins.Winner, Is.EqualTo(BattleWinner.Defender));
    }

    [Test]
    public void An_undefended_stack_of_non_fighters_is_swept_with_the_attacker_as_winner()
    {
        UnitView scout = V(30, 1, UnitRole.Scout, 1, 1, Target);

        CombatResult r = Sure().Resolve(Field(Army(1, 0, 1, 3, new TileCoord(9, 10)), new[] { scout }));

        Assert.That(r.Winner, Is.EqualTo(BattleWinner.Attacker));
        Assert.That(r.UnitChanges.Single(), Is.EqualTo(new UnitChange(30, 0, null)));
    }

    [Test]
    public void Each_sides_leading_commander_gains_or_loses_one_reputation()
    {
        UnitView[] attackers = Army(1, 0, 4, 5, new TileCoord(9, 10)).Append(V(7, 0, UnitRole.Commander, 2, 2, new TileCoord(9, 10), reputation: 3)).ToArray();
        UnitView[] defenders = Army(20, 1, 1, 1, Target).Append(V(27, 1, UnitRole.Commander, 1, 1, Target, reputation: 5)).ToArray();

        CombatResult r = Sure().Resolve(Field(attackers, defenders));

        Assert.That(r.Reputation, Is.EquivalentTo(new[] { new ReputationChange(7, 4), new ReputationChange(27, 4) }));
    }

    [Test]
    public void Reputation_never_leaves_zero_to_ten()
    {
        UnitView[] attackers = Army(1, 0, 4, 5, new TileCoord(9, 10)).Append(V(7, 0, UnitRole.Commander, 2, 2, new TileCoord(9, 10), reputation: 10)).ToArray();
        UnitView[] defenders = Army(20, 1, 1, 1, Target).Append(V(27, 1, UnitRole.Commander, 1, 1, Target, reputation: 0)).ToArray();

        CombatResult r = Sure().Resolve(Field(attackers, defenders));

        Assert.That(r.Reputation.Single(c => c.UnitId == 7).NewReputation, Is.EqualTo(10));
        Assert.That(r.Reputation.Single(c => c.UnitId == 27).NewReputation, Is.EqualTo(0));
    }

    [Test]
    public void Surviving_losers_of_a_field_battle_step_to_the_neighbour_farthest_from_the_enemy()
    {
        var rules = new CombatRules(roundCap: 1);
        int found = 0;
        for (ulong seed = 1; seed <= 300 && found < 5; seed++)
        {
            UnitView[] attackers = Army(1, 0, 3, 3, new TileCoord(9, 10));
            UnitView[] defenders = Army(20, 1, 3, 5, Target);
            FakeContext ctx = Field(attackers, defenders);
            ctx.BattleSeed = seed;

            CombatResult r = new CombatResolver(new CombatResolverOptions(rules)).Resolve(ctx);

            foreach (UnitRetreat move in r.Retreats)
            {
                found++;
                UnitView unit = attackers.Single(u => u.Id == move.UnitId);
                Assert.That(r.Winner, Is.EqualTo(BattleWinner.Defender));
                Assert.That(move.To.DistanceTo(unit.Pos), Is.EqualTo(1));
                Assert.That(move.To.DistanceTo(Target), Is.GreaterThan(unit.Pos.DistanceTo(Target)));
                Assert.That(r.UnitChanges.Any(c => c.UnitId == unit.Id && c.NewStrength <= 0), Is.False, "only survivors retreat");
            }
        }

        Assert.That(found, Is.GreaterThan(0), "with a one-round cap some seed leaves attackers alive after losing");
    }

    private static int RetreatsWith(UnitView[] walls, List<TileCoord> destinations)
    {
        UnitView[] attackers = { V(1, 0, UnitRole.Line, 3, 3, new TileCoord(11, 10)) };
        FakeContext ctx = Field(attackers, Army(20, 1, 3, 5, Target));
        ((FakeView)ctx.State).UnitList.AddRange(walls);
        int moves = 0;
        for (ulong seed = 1; seed <= 150; seed++)
        {
            ctx.BattleSeed = seed;
            CombatResult r = new CombatResolver(new CombatResolverOptions(new CombatRules(roundCap: 1))).Resolve(ctx);
            moves += r.Retreats.Count;
            destinations.AddRange(r.Retreats.Select(m => m.To));
        }

        return moves;
    }

    [Test]
    public void A_retreat_that_would_end_next_to_nothing_but_enemies_does_not_happen()
    {
        UnitView[] walls = { V(40, 1, UnitRole.Line, 1, 1, new TileCoord(12, 9)), V(41, 1, UnitRole.Line, 1, 1, new TileCoord(12, 10)), V(42, 1, UnitRole.Line, 1, 1, new TileCoord(12, 11)) };

        Assert.That(RetreatsWith(walls, new List<TileCoord>()), Is.EqualTo(0));
    }

    [Test]
    public void A_retreat_goes_around_a_single_blocked_tile()
    {
        UnitView[] walls = { V(41, 1, UnitRole.Line, 1, 1, new TileCoord(12, 10)) };
        var destinations = new List<TileCoord>();

        int moves = RetreatsWith(walls, destinations);

        Assert.That(moves, Is.GreaterThan(0));
        Assert.That(destinations, Is.All.EqualTo(new TileCoord(12, 9)), "ties go to the lowest (y, x)");
    }

    [Test]
    public void Colony_defenders_never_retreat_and_a_winning_attacker_never_retreats()
    {
        var baseView = new BaseView(7, 1, Target, null, 1, new ResourceVector(10, 10, 10, 10, 10, 50), ImmArray<BuildingView>.Empty);

        CombatResult r = Sure().Resolve(Field(Army(1, 0, 6, 5, new TileCoord(9, 10)), Army(20, 1, 1, 1, Target), baseView));

        Assert.That(r.Retreats.Count, Is.EqualTo(0));
        Assert.That(r.Winner, Is.EqualTo(BattleWinner.Attacker));
    }

    [Test]
    public void Only_a_raid_carries_spoils()
    {
        var baseView = new BaseView(7, 1, Target, null, 1, new ResourceVector(100, 100, 100, 100, 100, 50), ImmArray<BuildingView>.Empty);
        UnitView[] attackers = Army(1, 0, 3, 2, new TileCoord(9, 10));

        CombatResult capture = Sure().Resolve(Field(attackers, new UnitView[0], baseView, AttackKind.Capture));
        CombatResult raid = Sure().Resolve(Field(attackers, new UnitView[0], baseView, AttackKind.Raid));

        Assert.That(capture.Spoils, Is.Null);
        Assert.That(raid.Spoils.HasValue, Is.True);
        Assert.That(raid.Spoils!.Value.Pop, Is.EqualTo(0), "people are never a spoil");
    }
}
