using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Core;

public class CommandCodecTests
{
    private static IEnumerable<Command> Samples()
    {
        yield return new MoveCommand(0, 5, new TileCoord(3, 4));
        yield return new MoveCommand(1, 12, new TileCoord(0, 0));
        yield return new FoundBaseCommand(0, 7);
        yield return new BuildCommand(0, 2, BuildingRole.Port, new TileCoord(8, 9));
        yield return new UpgradeCommand(1, 3, -1);
        yield return new UpgradeCommand(1, 3, 4);
        yield return new AttackCommand(0, ImmArray<int>.Of(4, 9, 11), new TileCoord(6, 6), AttackKind.Capture);
        yield return new AttackCommand(1, ImmArray<int>.Of(4), new TileCoord(2, 1), AttackKind.Raid);
        yield return new RecruitCommand(0, 1, UnitRole.Ranged, 3);
        yield return new PatronTradeCommand(0, 1, Resource.Wares, 15, true);
        yield return new PatronTradeCommand(0, 1, Resource.Food, 2, false);
        yield return new DetachCommand(0, 8);
        yield return new EndTurnCommand(1);
    }

    [TestCaseSource(nameof(Samples))]
    public void Every_command_survives_encode_and_decode(Command command)
    {
        string line = CommandCodec.Encode(command);
        CommandDecode back = CommandCodec.Decode(line);

        Assert.That(back.Ok, Is.True, back.Error);
        Assert.That(back.Command, Is.EqualTo(command));
        Assert.That(CommandCodec.Encode(back.Command!), Is.EqualTo(line));
    }

    [Test]
    public void The_text_form_is_plain_and_stable()
    {
        Assert.That(CommandCodec.Encode(new MoveCommand(0, 5, new TileCoord(3, 4))), Is.EqualTo("move 0 5 3 4"));
        Assert.That(CommandCodec.Encode(new BuildCommand(0, 2, BuildingRole.Port, new TileCoord(8, 9))), Is.EqualTo("build 0 2 bld.port 8 9"));
        Assert.That(CommandCodec.Encode(new AttackCommand(0, ImmArray<int>.Of(4, 9), new TileCoord(6, 6), AttackKind.Raid)), Is.EqualTo("attack 0 raid 6 6 4,9"));
        Assert.That(CommandCodec.Encode(new PatronTradeCommand(0, 1, Resource.Wares, 15, true)), Is.EqualTo("patron 0 1 res.wares 15 buy"));
    }

    [TestCase("")]
    [TestCase("dance 1 2")]
    [TestCase("move 0 5 3")]
    [TestCase("move 0 5 3 x")]
    [TestCase("move 0 5 3 4 9")]
    [TestCase("build 0 2 bld.castle 1 1")]
    [TestCase("attack 0 slash 1 1 3")]
    [TestCase("attack 0 raid 1 1 3,x")]
    [TestCase("recruit 0 1 u.dragon 2")]
    [TestCase("patron 0 1 res.wares 5 trade")]
    [TestCase("patron 0 1 res.gold 5 buy")]
    [TestCase("end")]
    [TestCase("end 0 0")]
    public void A_bad_line_is_an_error_not_an_exception(string line)
    {
        CommandDecode d = CommandCodec.Decode(line);

        Assert.That(d.Ok, Is.False);
        Assert.That(d.Command, Is.Null);
        Assert.That(d.Error, Is.Not.Empty);
    }

    [Test]
    public void Encoding_a_command_of_an_unknown_type_is_a_programming_error()
    {
        Assert.Throws<ArgumentException>(() => CommandCodec.Encode(new UnknownCommand(0)));
    }

    private sealed record UnknownCommand(int Slot) : Command(Slot);

    // ----- replay -----

    [Test]
    public void A_replay_applies_lines_skips_comments_and_records_a_hash_per_turn()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 3, 3, out int scout);
        var lines = new[] { "# opening", "", "move 0 " + scout + " 5 3", "end 0", "end 1", "end 0", "end 1" };

        ReplayResult r = GameReplay.Run(s, TurnServices.Neutral, lines);

        Assert.That(r.Ok, Is.True, r.Error);
        Assert.That(r.Applied, Is.EqualTo(5));
        Assert.That(r.Trail.Select(t => t.Turn), Is.EqualTo(new[] { 0, 1, 2 }));
        Assert.That(r.Trail[2].HashHex, Is.EqualTo(StateHasher.HashHex(r.FinalState)));
        Assert.That(r.FinalState.Turn, Is.EqualTo(2));
        Assert.That(r.Events.OfType<UnitMoved>().Count(), Is.EqualTo(1));
        Assert.That(r.Events.OfType<TurnEnded>().Select(e => e.Turn), Is.EqualTo(new[] { 1, 2 }));
    }

    [Test]
    public void A_replay_is_repeatable()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 3, 3, out int scout);
        var lines = new[] { "move 0 " + scout + " 5 3", "end 0", "end 1", "end 0", "end 1" };

        string a = string.Join(",", GameReplay.Run(s, TurnServices.Neutral, lines).Trail.Select(t => t.HashHex));
        string b = string.Join(",", GameReplay.Run(s, TurnServices.Neutral, lines).Trail.Select(t => t.HashHex));

        Assert.That(a, Is.EqualTo(b));
    }

    [Test]
    public void A_replay_stops_at_the_first_bad_or_refused_line()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 3, 3, out int scout);

        ReplayResult unknown = GameReplay.Run(s, TurnServices.Neutral, new[] { "end 0", "jump 1 2" });
        ReplayResult refused = GameReplay.Run(s, TurnServices.Neutral, new[] { "move 0 " + scout + " 5 3", "move 0 99 1 1", "end 0" });

        Assert.That((unknown.Ok, unknown.FailedLine, unknown.Applied), Is.EqualTo((false, 1, 1)));
        Assert.That(refused.FailedLine, Is.EqualTo(1));
        Assert.That(refused.Error, Is.EqualTo(Err.UnknownUnit));
        Assert.That(refused.Applied, Is.EqualTo(1));
    }
}
