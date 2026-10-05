using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>What a driver call did: the new state, the events the core raised, the commands applied and how many were refused.</summary>
    public sealed class DriverResult
    {
        public DriverResult(GameState state, IReadOnlyList<GameEvent> events, IReadOnlyList<Command> commands, int rejected)
        {
            State = state;
            Events = events;
            Commands = commands;
            Rejected = rejected;
        }

        public GameState State { get; }

        public IReadOnlyList<GameEvent> Events { get; }

        /// <summary>The accepted commands in order, ready for <see cref="CommandCodec.Encode"/> and a replay file.</summary>
        public IReadOnlyList<Command> Commands { get; }

        /// <summary>Commands the core refused (always 0 for a plan made on the same state; kept as a tripwire).</summary>
        public int Rejected { get; }
    }

    /// <summary>
    /// Plays opponent slots through <see cref="CommandEngine"/>, the player's own command path. Call
    /// <see cref="EndTurnWithOpponents"/> when the human ends the turn.
    /// </summary>
    public static class OpponentDriver
    {
        /// <summary>Plans and applies one slot's whole turn, ending with its end of turn (which resolves the turn if it was the last).</summary>
        public static DriverResult PlayTurn(GameState state, TurnServices services, int slot, ulong seed)
        {
            return Apply(state, services, OpponentTurn.Plan(state, services, slot, seed));
        }

        /// <summary>
        /// The human's end-turn button: every listed opponent slot plays its turn first (on the state with the human's moves in
        /// it, seeing only what its units see), then the ending slot's end of turn is applied, which resolves the turn. The
        /// opponent seed is the game seed or any fixed number; the same inputs always give the same result.
        /// </summary>
        public static DriverResult EndTurnWithOpponents(GameState state, TurnServices services, int endingSlot, IReadOnlyList<int> opponentSlots, ulong seed)
        {
            GameState s = state;
            var events = new List<GameEvent>();
            var commands = new List<Command>();
            int rejected = 0;
            for (int i = 0; i < opponentSlots.Count; i++)
            {
                int slot = opponentSlots[i];
                if (slot == endingSlot)
                {
                    continue;
                }

                DriverResult r = PlayTurn(s, services, slot, seed);
                s = r.State;
                Append(events, commands, r);
                rejected += r.Rejected;
            }

            CommandResult end = CommandEngine.Apply(s, new EndTurnCommand(endingSlot), services);
            if (end.Ok)
            {
                s = end.State;
                events.AddRange(end.Events);
                commands.Add(new EndTurnCommand(endingSlot));
            }
            else
            {
                rejected++;
            }

            return new DriverResult(s, events, commands, rejected);
        }

        /// <summary>One whole turn with every listed slot driven by the opponent (AI against AI, tests and soak runs).</summary>
        public static DriverResult PlayAll(GameState state, TurnServices services, IReadOnlyList<int> slots, ulong seed)
        {
            GameState s = state;
            var events = new List<GameEvent>();
            var commands = new List<Command>();
            int rejected = 0;
            for (int i = 0; i < slots.Count; i++)
            {
                DriverResult r = PlayTurn(s, services, slots[i], seed);
                s = r.State;
                Append(events, commands, r);
                rejected += r.Rejected;
            }

            return new DriverResult(s, events, commands, rejected);
        }

        private static DriverResult Apply(GameState state, TurnServices services, IReadOnlyList<Command> plan)
        {
            GameState s = state;
            var events = new List<GameEvent>();
            var applied = new List<Command>();
            int rejected = 0;
            for (int i = 0; i < plan.Count; i++)
            {
                CommandResult r = CommandEngine.Apply(s, plan[i], services);
                if (!r.Ok)
                {
                    rejected++;
                    continue;
                }

                s = r.State;
                applied.Add(plan[i]);
                events.AddRange(r.Events);
            }

            return new DriverResult(s, events, applied, rejected);
        }

        private static void Append(List<GameEvent> events, List<Command> commands, DriverResult r)
        {
            events.AddRange(r.Events);
            commands.AddRange(r.Commands);
        }
    }
}
