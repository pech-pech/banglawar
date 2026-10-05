using System.Collections.Generic;
using Conquest.Core.Turn;
using Conquest.Presentation;

namespace Conquest.Ai
{
    /// <summary>
    /// The scripted opponent as the presentation layer's <see cref="IOpponentTurn"/>. The session submits the returned orders one
    /// by one through the core and adds the slot's end of turn itself, so no end-turn command is included here.
    /// </summary>
    public sealed class AiOpponentTurn : IOpponentTurn
    {
        private readonly ulong _seed;

        public AiOpponentTurn(ulong seed)
        {
            _seed = seed;
        }

        public IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services) => OpponentTurn.Orders(state, services, slot, _seed);
    }
}
