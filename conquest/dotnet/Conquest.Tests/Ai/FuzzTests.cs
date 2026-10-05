using Conquest.Bootstrap;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;
using static Conquest.Tests.Ai.AiTestKit;

namespace Conquest.Tests.Ai;

/// <summary>Many seeds of AI against AI: no exception, no refused command, and the recorded commands replay to the same final hash.</summary>
public class FuzzTests
{
    [Test]
    public void Thirty_seeds_finish_with_no_exception_no_refused_command_and_a_faithful_replay()
    {
        for (ulong seed = 1; seed <= 30; seed++)
        {
            Game g = PlayBoth(seed);

            Assert.That(g.Rejected, Is.EqualTo(0), "seed " + seed);
            Assert.That(g.Final.MatchOver, Is.True, "seed " + seed + " should end by turn " + MaxTurns);
            ReplayResult r = GameReplay.Run(g.Boot.State!, g.Boot.Services!, g.Lines);
            Assert.That(r.Ok, Is.True, "seed " + seed + ": " + r.Error + " at " + r.FailedLine);
            Assert.That(StateHasher.HashHex(r.FinalState), Is.EqualTo(StateHasher.HashHex(g.Final)), "seed " + seed);
            CheckInvariants(g.Final, seed);
        }
    }

    private static void CheckInvariants(GameState s, ulong seed)
    {
        string why = "seed " + seed;
        for (int i = 0; i < s.UnitTable.Count; i++)
        {
            Unit u = s.UnitTable[i];
            Assert.That(i == 0 || u.Id > s.UnitTable[i - 1].Id, Is.True, why);
            Assert.That(s.InBounds(u.Pos), Is.True, why);
            Assert.That(TerrainInfo.EntryCost(s.TerrainAt(u.Pos), RoleIds.MoveClassOf(u.Role)), Is.GreaterThan(0), why);
            Assert.That(u.Strength, Is.GreaterThan(0), why);
        }

        for (int i = 0; i < s.BaseTable.Count; i++)
        {
            for (int j = i + 1; j < s.BaseTable.Count; j++)
            {
                Assert.That(s.BaseTable[i].Pos.DistanceTo(s.BaseTable[j].Pos), Is.GreaterThanOrEqualTo(1), why);
            }
        }
    }

    [Test]
    public void Planning_from_every_turn_of_a_game_is_accepted_for_every_slot()
    {
        BootResult boot = Boot(77);
        GameState s = boot.State!;
        while (!s.MatchOver && s.Turn < 60)
        {
            for (int slot = 0; slot < s.SlotCount; slot++)
            {
                GameState probe = s;
                foreach (Command c in Conquest.Ai.OpponentTurn.Plan(s, boot.Services!, slot, 77))
                {
                    CommandResult r = CommandEngine.Apply(probe, c, boot.Services);
                    Assert.That(r.Ok, Is.True, "turn " + s.Turn + " slot " + slot + " " + CommandCodec.Encode(c) + " -> " + r.Error);
                    probe = r.State;
                }
            }

            s = Conquest.Ai.OpponentDriver.PlayAll(s, boot.Services!, new[] { 0, 1 }, 77).State;
        }
    }
}
