using System;
using System.Collections.Generic;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>
    /// The hook for a computer opponent. After the local player ends the turn, the session asks this driver, once per
    /// other active slot, for the orders of that slot; each order goes through the core's command validation like any
    /// other, and the slot's own end-turn follows. The default does nothing, so an opponent that is not wired yet
    /// simply ends its turn.
    /// </summary>
    public interface IOpponentTurn
    {
        /// <summary>The orders slot <paramref name="slot"/> wants to give this turn, in order. May be empty. Must not throw.</summary>
        IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services);
    }

    /// <summary>The opponent that gives no orders.</summary>
    public sealed class NoOpponentTurn : IOpponentTurn
    {
        public static NoOpponentTurn Instance { get; } = new NoOpponentTurn();

        public IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services) => Array.Empty<Command>();
    }
}
