using System.Collections.Generic;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>
    /// The scripted opponent's whole turn for one slot. A greedy, scored planner with fixed tie-breaks: found and expand, run the
    /// bases (recruit, build, upgrade), move and attack. It reads only what <see cref="Knowledge"/> allows and tries each choice on a
    /// private copy of the state through <see cref="CommandEngine"/>, so every returned command is one the core accepts, in order.
    /// Pure: the same state, services, slot and seed always give the same list. The last command is the slot's end of turn.
    /// </summary>
    public static class OpponentTurn
    {
        /// <summary>Plans with the neutral rule services (no seasons). Use the overload with services for a real scenario.</summary>
        public static IReadOnlyList<Command> Plan(GameState state, int side, ulong seed) => Plan(state, TurnServices.Neutral, side, seed);

        public static IReadOnlyList<Command> Plan(GameState state, TurnServices services, int side, ulong seed)
        {
            IReadOnlyList<Command> orders = Orders(state, services, side, seed);
            if (!CanAct(state, side))
            {
                return orders;
            }

            var commands = new List<Command>(orders) { new EndTurnCommand(side) };
            return commands;
        }

        /// <summary>The same orders without the closing end of turn, for callers that submit the end themselves.</summary>
        public static IReadOnlyList<Command> Orders(GameState state, TurnServices services, int side, ulong seed)
        {
            if (!CanAct(state, side))
            {
                return new List<Command>();
            }

            var session = new PlanSession(state, services, side, seed);
            FoundingPlanner.Run(session);
            BasePlanner.Run(session);
            MilitaryPlanner.Run(session);
            return session.Commands;
        }

        private static bool CanAct(GameState state, int side) =>
            !state.MatchOver && side >= 0 && side < state.SlotCount && !state.Factions[side].Eliminated && !state.Factions[side].EndedTurn;
    }
}
