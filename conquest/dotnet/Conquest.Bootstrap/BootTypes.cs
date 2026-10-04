using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Bootstrap
{
    /// <summary>Something that stopped a scenario from becoming a game: a JSON-style path, an <c>err.*</c> code and a message.</summary>
    public sealed class BootError
    {
        public BootError(string path, string code, string message)
        {
            Path = path;
            Code = code;
            Message = message;
        }

        public string Path { get; }

        public string Code { get; }

        public string Message { get; }

        public override string ToString() => Code + " at " + Path + ": " + Message;
    }

    /// <summary>A player slot of the scenario: its index (f1 = 0) and who controls it ("human" or "ai").</summary>
    public sealed class BootPlayer
    {
        public BootPlayer(int slot, string control)
        {
            Slot = slot;
            Control = control;
        }

        public int Slot { get; }

        public string Control { get; }
    }

    /// <summary>
    /// The result of booting a scenario: the turn-0 state (pre-placed bases, intel and turn-0 arrivals in place), the services the
    /// turn pipeline needs, and the turn-0 events (arrival spawns). <c>State</c> is null when <c>Errors</c> is not empty.
    /// </summary>
    public sealed class BootResult
    {
        public BootResult(
            string scenarioId,
            GameState? state,
            TurnServices? services,
            IReadOnlyList<GameEvent> events,
            IReadOnlyList<BootPlayer> players,
            IReadOnlyList<BootError> errors)
        {
            ScenarioId = scenarioId;
            State = state;
            Services = services;
            Events = events;
            Players = players;
            Errors = errors;
        }

        public string ScenarioId { get; }

        public GameState? State { get; }

        public TurnServices? Services { get; }

        public IReadOnlyList<GameEvent> Events { get; }

        public IReadOnlyList<BootPlayer> Players { get; }

        public IReadOnlyList<BootError> Errors { get; }

        public bool Ok => Errors.Count == 0 && State != null && Services != null;

        public string StateHashHex => State == null ? string.Empty : StateHasher.HashHex(State);
    }

    /// <summary>The ASSUMED ruleset numbers the variant fixes and the scenario does not carry (06 section 3).</summary>
    public static class BootDefaults
    {
        public const int RegionCapMinLevel = 3;
        public const int RegionCapMaxPerRegion = 1;
        public const int RegionBonusPct = 5;
        public const int HealingMaxStrength = 5;
        public const int HealPerTurn = 1;
        public const int PredicateMaxDepth = 4;
        public const int PredicateMaxNodes = 32;
    }
}
