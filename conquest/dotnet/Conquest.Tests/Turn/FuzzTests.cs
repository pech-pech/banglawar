using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class FuzzTests
{
    private static GameState Setup()
    {
        GameState s = New(3, 5);
        s = Unit(s, 0, UnitRole.Founder, 3, 3, out _);
        s = Unit(s, 0, UnitRole.Line, 4, 3, out _);
        s = Unit(s, 0, UnitRole.Scout, 3, 4, out _);
        s = Unit(s, 1, UnitRole.Founder, 9, 5, out _);
        s = Unit(s, 1, UnitRole.Shock, 8, 4, out _);
        s = Unit(s, 1, UnitRole.Ranged, 8, 5, out _);
        s = Unit(s, 2, UnitRole.Commander, 6, 1, out _);
        s = Unit(s, 2, UnitRole.Transport, 0, 3, out _);
        return Base(s, 2, 4, 6, out _, core: 2, stock: Rich);
    }

    private static Command Random(GameState s, ulong seed, ulong i)
    {
        int slot = Rng.Range(seed, 1, s.Turn, i * 7, 0, s.SlotCount);
        int kind = Rng.Range(seed, 2, s.Turn, i * 7 + 1, 0, 8);
        int unitId = Rng.Range(seed, 3, s.Turn, i * 7 + 2, 1, s.NextUnitId + 1);
        int baseId = Rng.Range(seed, 4, s.Turn, i * 7 + 3, 1, s.NextBaseId + 1);
        var tile = new TileCoord(Rng.Range(seed, 5, s.Turn, i * 7 + 4, -1, 13), Rng.Range(seed, 6, s.Turn, i * 7 + 5, -1, 9));
        switch (kind)
        {
            case 0:
            case 1:
            case 2: return new MoveCommand(slot, unitId, tile);
            case 3: return new FoundBaseCommand(slot, unitId);
            case 4: return new BuildCommand(slot, baseId, (BuildingRole)Rng.Range(seed, 7, s.Turn, i, 0, 11), tile);
            case 5: return new UpgradeCommand(slot, baseId, Rng.Range(seed, 8, s.Turn, i, -1, 4));
            case 6: return new AttackCommand(slot, ImmArray<int>.Of(unitId), tile);
            default: return Rng.Range(seed, 9, s.Turn, i, 0, 6) == 0 ? new EndTurnCommand(slot) : new MoveCommand(slot, unitId, tile);
        }
    }

    private static void CheckInvariants(GameState s)
    {
        for (int i = 1; i < s.UnitTable.Count; i++)
        {
            Assert.That(s.UnitTable[i].Id, Is.GreaterThan(s.UnitTable[i - 1].Id));
        }

        for (int i = 1; i < s.BaseTable.Count; i++)
        {
            Assert.That(s.BaseTable[i].Id, Is.GreaterThan(s.BaseTable[i - 1].Id));
        }

        foreach (Unit u in s.UnitTable)
        {
            Assert.That(s.InBounds(u.Pos), Is.True);
            Assert.That(TerrainInfo.EntryCost(s.TerrainAt(u.Pos), RoleIds.MoveClassOf(u.Role)), Is.GreaterThan(0));
            Assert.That(u.MovesLeft, Is.InRange(0, RuleTables.MoveBudget(u.Role, u.Level)));
            Assert.That(u.Strength, Is.GreaterThan(0));
            Assert.That(s.UnitTable.Where(o => o.Pos == u.Pos).Select(o => o.Owner).Distinct().Count(), Is.EqualTo(1), "stacks never mix owners");
            Assert.That(s.BaseTable.Any(b => b.Pos == u.Pos && b.Owner != u.Owner), Is.False);
        }

        foreach (Base b in s.BaseTable)
        {
            ResourceVector k = b.Stock;
            Assert.That(new[] { k.Basic, k.Hard, k.Coin, k.Wares, k.Food, k.Pop }, Has.All.GreaterThanOrEqualTo(0));
            Assert.That(b.Buildings.Select(x => x.Pos).Distinct().Count(), Is.EqualTo(b.Buildings.Count));
            Assert.That(b.Buildings.All(x => x.Level >= 1 && x.Level <= 4), Is.True);
        }
    }

    private static (List<ulong> trail, int accepted) Run(ulong seed)
    {
        GameState s = Setup();
        var svc = new TurnServices(new KillAllResolver());
        var trail = new List<ulong>();
        int accepted = 0;
        for (ulong i = 0; i < 600; i++)
        {
            Command c = Random(s, seed, i);
            ulong before = StateHasher.Hash(s);
            CommandResult r = CommandEngine.Apply(s, c, svc);
            Assert.That(StateHasher.Hash(s), Is.EqualTo(before), "apply must not mutate its input");
            if (!r.Ok)
            {
                Assert.That(r.State, Is.SameAs(s));
                Assert.That(r.Error, Does.StartWith("err."));
                continue;
            }

            accepted++;
            s = r.State;
            CheckInvariants(s);
            trail.Add(StateHasher.Hash(s));
        }

        return (trail, accepted);
    }

    [TestCase(1UL)]
    [TestCase(2UL)]
    [TestCase(3UL)]
    [TestCase(4UL)]
    [TestCase(5UL)]
    public void Random_command_streams_keep_the_invariants_and_replay_identically(ulong seed)
    {
        var (a, accepted) = Run(seed);
        var (b, _) = Run(seed);
        Assert.That(a, Is.EqualTo(b));
        Assert.That(accepted, Is.GreaterThan(10));
    }
}
