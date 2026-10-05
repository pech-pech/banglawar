using Conquest.Ai;
using Conquest.Bootstrap;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Tests.Content;

namespace Conquest.Tests.Ai;

/// <summary>Plays the shipped skirmish with the opponent in both seats and records the accepted commands and the hash trail.</summary>
internal static class AiTestKit
{
    public const int MaxTurns = 120;

    public sealed record Game(BootResult Boot, GameState Final, List<string> Lines, List<string> Trail, int Rejected, List<GameEvent> Events);

    public static BootResult Boot(ulong seed)
    {
        BootResult r = ScenarioBootstrapper.Boot(ContentTestData.Scenario(), seed);
        Assert.That(r.Errors, Is.Empty, string.Join("\n", r.Errors));
        return r;
    }

    public static Game PlayBoth(ulong seed, int maxTurns = MaxTurns)
    {
        BootResult boot = Boot(seed);
        GameState s = boot.State!;
        var lines = new List<string>();
        var trail = new List<string> { 0 + " " + StateHasher.HashHex(s) };
        var events = new List<GameEvent>();
        int rejected = 0;
        int[] slots = { 0, 1 };
        while (!s.MatchOver && s.Turn < maxTurns)
        {
            int turn = s.Turn;
            DriverResult r = OpponentDriver.PlayAll(s, boot.Services!, slots, seed);
            rejected += r.Rejected;
            foreach (Command c in r.Commands)
            {
                lines.Add(CommandCodec.Encode(c));
            }

            events.AddRange(r.Events);
            s = r.State;
            if (s.Turn != turn)
            {
                trail.Add(s.Turn + " " + StateHasher.HashHex(s));
            }
        }

        return new Game(boot, s, lines, trail, rejected, events);
    }
}
