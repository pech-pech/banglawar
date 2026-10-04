using System.Runtime.CompilerServices;
using Conquest.Bootstrap;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Save;
using Conquest.Core.Turn;
using static Conquest.Tests.Bootstrap.BootstrapTestKit;

namespace Conquest.Tests.Bootstrap;

/// <summary>
/// A whole game of the shipped scenario as a recorded command list (golden/skirmish-1971.replay.txt) that plays to the
/// scenario's end condition, with the hash after every turn (golden/skirmish-1971.trail.txt). Set UPDATE_GOLDEN=1 to
/// record both again with <see cref="Autopilot"/> after a change that moves the game on purpose.
/// </summary>
public class ScriptedGameTests
{
    private const int CommanderId = 21;
    private static readonly TileCoord Staging = new TileCoord(7, 5);
    private static readonly TileCoord Town = new TileCoord(8, 5);

    private static string GoldenDir([CallerFilePath] string here = "") => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", "golden"));

    private static string[] ReadLines(string name) => File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "golden", name));

    /// <summary>Writes the opening orders and then marches the first commander to the nearest enemy town and attacks it each turn.</summary>
    internal static List<string> Autopilot(BootResult boot)
    {
        var lines = new List<string>();
        GameState s = boot.State!;
        TurnServices svc = boot.Services!;

        bool Try(string line)
        {
            CommandResult r = CommandEngine.Apply(s, CommandCodec.Decode(line).Command!, svc);
            if (r.Ok)
            {
                s = r.State;
                lines.Add(line);
            }

            return r.Ok;
        }

        lines.Add("# opening: found two bases, build a farm and a garrison, send the scout east");
        foreach (string line in new[] { "found 0 19", "found 0 24", "build 0 7 bld.food 1 3", "build 0 8 bld.garrison 3 1", "move 0 20 6 3" })
        {
            Assert.That(Try(line), Is.True, line);
        }

        lines.Add("# march and attack");
        while (!s.MatchOver && s.Turn < 120)
        {
            if (s.Turn == 2)
            {
                Try("recruit 0 8 u.line 1");
            }

            March(s, Try);
            Try("end 0");
            Try("end 1");
        }

        return lines;
    }

    private static void March(GameState s, Func<string, bool> tryDo)
    {
        int index = s.FindUnitIndex(CommanderId);
        if (index < 0)
        {
            return;
        }

        Unit commander = s.UnitTable[index];
        if (commander.Pos.DistanceTo(Town) <= 1 && s.TryGetBaseAt(Town, out BaseView town) && town.Owner != 0)
        {
            string ids = string.Join(",", s.UnitTable.Where(u => u.Owner == 0 && u.Role == UnitRole.Line && u.Pos == commander.Pos).Select(u => u.Id));
            if (ids.Length > 0)
            {
                tryDo("attack 0 capture " + Town.X + " " + Town.Y + " " + ids);
            }

            return;
        }

        MovePlan plan = new GameQueries(s, null).PlanMove(CommanderId, Staging);
        for (int k = plan.Steps.Count - 1; k >= 0; k--)
        {
            if (tryDo("move 0 " + CommanderId + " " + plan.Steps[k].X + " " + plan.Steps[k].Y))
            {
                return;
            }
        }
    }

    private static string TrailText(ReplayResult r) => string.Join("\n", r.Trail.Select(t => t.Turn + " " + t.HashHex)) + "\n";

    [Test]
    public void Record_golden_files_only_on_request()
    {
        if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") != "1")
        {
            Assert.Pass("set UPDATE_GOLDEN=1 to record the scripted game");
        }

        BootResult boot = Boot();
        List<string> lines = Autopilot(boot);
        ReplayResult r = GameReplay.Run(boot.State!, boot.Services!, lines);
        File.WriteAllLines(Path.Combine(GoldenDir(), "skirmish-1971.replay.txt"), lines);
        File.WriteAllText(Path.Combine(GoldenDir(), "skirmish-1971.trail.txt"), TrailText(r));
        TestContext.Out.WriteLine("lines " + lines.Count + " final turn " + r.FinalState.Turn + " over " + r.FinalState.MatchOver + " winner " + r.FinalState.WinnerSlot);
        foreach (GameEvent e in r.Events.Where(e => e is MatchWon || e is MatchDrawn || e is AttackResolved || e is FactionEliminated || e is SiteTaken))
        {
            TestContext.Out.WriteLine(e.ToString());
        }
    }

    // ----- the recorded game -----

    private static ReplayResult Play(string[]? lines = null)
    {
        BootResult boot = Boot();
        return GameReplay.Run(boot.State!, boot.Services!, lines ?? ReadLines("skirmish-1971.replay.txt"));
    }

    [Test]
    public void The_recorded_game_plays_to_the_scenarios_deadline_with_the_recorded_hash_trail()
    {
        ReplayResult r = Play();

        Assert.That(r.Ok, Is.True, r.Error + " at line " + r.FailedLine);
        Assert.That(r.FinalState.MatchOver, Is.True);
        Assert.That(r.FinalState.Turn, Is.EqualTo(89));
        Assert.That(r.Events.OfType<MatchDrawn>().Single(), Is.EqualTo(new MatchDrawn("deadline")));
        Assert.That(TrailText(r), Is.EqualTo(string.Join("\n", ReadLines("skirmish-1971.trail.txt")) + "\n"));
        Assert.That(r.Trail.Count, Is.EqualTo(90));
    }

    [Test]
    public void Playing_it_again_gives_the_same_trail_and_the_same_final_save()
    {
        ReplayResult a = Play();
        ReplayResult b = Play();

        Assert.That(b.Trail.Select(t => t.HashHex), Is.EqualTo(a.Trail.Select(t => t.HashHex)));
        Assert.That(GameSerializer.Serialize(b.FinalState, "x"), Is.EqualTo(GameSerializer.Serialize(a.FinalState, "x")));
    }

    [Test]
    public void The_scenario_hooks_fire_at_their_turns_in_the_recorded_game()
    {
        ReplayResult r = Play();
        List<GameEvent> e = r.Events.ToList();
        int EndOf(int turn) => e.FindIndex(x => x is TurnEnded t && t.Turn == turn);

        int wet = e.FindIndex(x => x is SeasonStarted s && s.Season == "season.wet");
        int dry = e.FindIndex(x => x is SeasonStarted s && s.Season == "season.dry");
        int cut = e.FindIndex(x => x is TimedEffectStarted t && t.EffectId == "te.link_cut");
        Assert.That(e.OfType<SeasonStarted>().Select(x => x.Season), Is.EqualTo(new[] { "season.wet", "season.dry", "season.neutral" }), "the schedule ends with turn 88, so the last turn is neutral");
        Assert.That(wet, Is.LessThan(EndOf(22)).And.GreaterThan(EndOf(21)));
        Assert.That(dry, Is.LessThan(EndOf(63)).And.GreaterThan(EndOf(62)));
        Assert.That(cut, Is.LessThan(EndOf(84)).And.GreaterThan(EndOf(83)));
        Assert.That(e.OfType<TimedEffectStarted>().Single(), Is.EqualTo(new TimedEffectStarted("te.link_cut", 1)));
    }

    [Test]
    public void Scheduled_arrivals_land_at_the_end_of_the_turn_before_their_turn()
    {
        ReplayResult r = Play();
        List<GameEvent> e = r.Events.ToList();
        int EndOf(int turn) => e.FindIndex(x => x is TurnEnded t && t.Turn == turn);
        List<(int Index, UnitSpawned Event)> spawns = e.Select((x, i) => (i, x as UnitSpawned)).Where(p => p.Item2 != null).Select(p => (p.i, p.Item2!)).ToList();

        var turn6 = spawns.Where(p => p.Index > EndOf(5) - 5 && p.Index < EndOf(6) && p.Event.Cause == "arrival").ToList();
        var turn12 = spawns.Where(p => p.Index < EndOf(12) && p.Index > EndOf(11) - 5 && p.Event.Owner == 1).ToList();

        Assert.That(turn6.Select(p => p.Event.Pos), Is.All.EqualTo(new TileCoord(9, 0)));
        Assert.That(turn6.Select(p => p.Event.Role), Is.EqualTo(new[] { UnitRole.Founder, UnitRole.Scout }));
        Assert.That(turn12.Count, Is.EqualTo(2), "the AI's patron reinforcement of two line units");
        Assert.That(spawns.Count(p => p.Event.Owner == 0 && p.Event.Cause == "arrival"), Is.EqualTo(2 + 4), "turn 6 (2 units) and turn 34 (commander + 3 line)");
        Assert.That(e.OfType<ArrivalCancelled>(), Is.Empty);
    }

    [Test]
    public void Saving_in_the_middle_and_loading_continues_to_the_same_ending()
    {
        BootResult boot = Boot();
        string[] lines = ReadLines("skirmish-1971.replay.txt");
        int cut = Array.FindLastIndex(lines, 80, l => l == "end 1");
        ReplayResult first = GameReplay.Run(boot.State!, boot.Services!, lines.Take(cut + 1).ToArray());
        SaveLoadResult loaded = GameSerializer.Deserialize(GameSerializer.Serialize(first.FinalState, boot.ScenarioId));

        ReplayResult rest = GameReplay.Run(loaded.State!, boot.Services!, lines.Skip(cut + 1).ToArray());
        ReplayResult whole = Play(lines);

        Assert.That(first.Ok && rest.Ok && loaded.Ok, Is.True);
        Assert.That(StateHasher.HashHex(rest.FinalState), Is.EqualTo(StateHasher.HashHex(whole.FinalState)));
        Assert.That(first.FinalState.Turn, Is.GreaterThan(20));
    }

    [Test]
    public void A_player_who_never_founds_a_base_loses_by_the_homeless_limit_at_turn_fifteen()
    {
        string[] passes = Enumerable.Range(0, 30).SelectMany(_ => new[] { "end 0", "end 1" }).ToArray();

        ReplayResult r = Play(passes);

        Assert.That((r.FailedLine, r.Error), Is.EqualTo((30, Err.MatchOver)), "the 31st command arrives after the match is over");
        Assert.That(r.Events.OfType<FactionEliminated>().Single(), Is.EqualTo(new FactionEliminated(0, "homeless_limit", 15)));
        Assert.That(r.Events.OfType<MatchWon>().Single(), Is.EqualTo(new MatchWon(1, "last_standing")));
        Assert.That(r.FinalState.MatchOver && r.FinalState.WinnerSlot == 1, Is.True);
        Assert.That(r.FinalState.Turn, Is.EqualTo(15));
        Assert.That(r.Applied, Is.EqualTo(30));
    }
}
