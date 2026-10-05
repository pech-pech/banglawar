using System.Runtime.CompilerServices;
using Conquest.Ai;
using Conquest.Bootstrap;
using Conquest.Core.Contracts;
using Conquest.Core.Save;
using Conquest.Core.Turn;
using static Conquest.Tests.Ai.AiTestKit;

namespace Conquest.Tests.Ai;

/// <summary>
/// The opponent in both seats of the shipped skirmish. golden/ai-skirmish-1971.replay.txt is the accepted command list and
/// golden/ai-skirmish-1971.trail.txt the hash at the start of every turn. Set UPDATE_GOLDEN=1 to record them again after a
/// change that moves the AI on purpose.
/// </summary>
public class SkirmishTests
{
    private const ulong GoldenSeed = 1971;

    private static string GoldenDir([CallerFilePath] string here = "") => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", "golden"));

    private static string[] ReadGolden(string name) => File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "golden", name));

    [Test]
    public void Record_golden_files_only_on_request()
    {
        if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") != "1")
        {
            Assert.Pass("set UPDATE_GOLDEN=1 to record the AI skirmish");
        }

        Game g = PlayBoth(GoldenSeed);
        File.WriteAllLines(Path.Combine(GoldenDir(), "ai-skirmish-1971.replay.txt"), g.Lines);
        File.WriteAllLines(Path.Combine(GoldenDir(), "ai-skirmish-1971.trail.txt"), g.Trail);
    }

    [Test]
    public void The_recorded_ai_game_replays_to_the_recorded_hash_trail_and_ends_at_the_deadline()
    {
        BootResult boot = Boot(GoldenSeed);

        ReplayResult r = GameReplay.Run(boot.State!, boot.Services!, ReadGolden("ai-skirmish-1971.replay.txt"));

        Assert.That(r.Ok, Is.True, r.Error + " at line " + r.FailedLine);
        Assert.That(r.Trail.Select(t => t.Turn + " " + t.HashHex), Is.EqualTo(ReadGolden("ai-skirmish-1971.trail.txt")));
        Assert.That(r.FinalState.MatchOver, Is.True);
        Assert.That(r.FinalState.Turn, Is.EqualTo(89));
        Assert.That(r.Events.OfType<MatchDrawn>().Single(), Is.EqualTo(new MatchDrawn("deadline")));
    }

    [Test]
    public void Planning_live_reproduces_the_recorded_commands_exactly()
    {
        Game g = PlayBoth(GoldenSeed);

        Assert.That(g.Lines, Is.EqualTo(ReadGolden("ai-skirmish-1971.replay.txt")));
        Assert.That(g.Trail, Is.EqualTo(ReadGolden("ai-skirmish-1971.trail.txt")));
        Assert.That(g.Rejected, Is.EqualTo(0));
    }

    [Test]
    public void Two_runs_give_the_same_hashes_and_the_same_final_save()
    {
        Game a = PlayBoth(GoldenSeed);
        Game b = PlayBoth(GoldenSeed);

        Assert.That(b.Trail, Is.EqualTo(a.Trail));
        Assert.That(GameSerializer.Serialize(b.Final, "x"), Is.EqualTo(GameSerializer.Serialize(a.Final, "x")));
    }

    [Test]
    public void The_game_is_not_idle_both_sides_found_build_recruit_and_fight()
    {
        Game g = PlayBoth(GoldenSeed);

        Assert.That(g.Events.OfType<BaseFounded>().Count(e => e.Owner == 0), Is.GreaterThanOrEqualTo(2), "the attacker side expanded");
        Assert.That(g.Events.OfType<AttackResolved>().Any(e => e.AttackerSlot == 0), Is.True);
        Assert.That(g.Events.OfType<AttackResolved>().Any(e => e.AttackerSlot == 1), Is.True);
        Assert.That(g.Lines.Count(l => l.StartsWith("recruit ", StringComparison.Ordinal)), Is.GreaterThan(10));
        Assert.That(g.Lines.Count(l => l.StartsWith("build ", StringComparison.Ordinal)), Is.GreaterThan(5));
    }

    [Test]
    public void Different_seeds_play_different_games_but_all_commands_stay_legal()
    {
        Game a = PlayBoth(1971);
        Game b = PlayBoth(2);

        Assert.That(b.Trail, Is.Not.EqualTo(a.Trail));
        Assert.That(a.Rejected + b.Rejected, Is.EqualTo(0));
    }

    [Test]
    public void The_human_seat_with_an_ai_opponent_through_the_driver_plays_the_whole_scenario()
    {
        BootResult boot = Boot(GoldenSeed);
        GameState s = boot.State!;
        var opponents = new[] { 1 };
        while (!s.MatchOver && s.Turn < MaxTurns)
        {
            DriverResult r = OpponentDriver.EndTurnWithOpponents(s, boot.Services!, 0, opponents, GoldenSeed);
            Assert.That(r.Rejected, Is.EqualTo(0));
            s = r.State;
        }

        Assert.That(s.MatchOver, Is.True, "an idle human loses by the homeless limit at turn 15 or the deadline ends it");
        Assert.That(s.Turn, Is.LessThanOrEqualTo(89));
    }
}
