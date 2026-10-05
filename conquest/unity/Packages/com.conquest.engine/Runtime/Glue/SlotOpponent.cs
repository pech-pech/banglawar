using System.Collections.Generic;
using Conquest.Core.Turn;
using Conquest.Presentation;

namespace Conquest.Glue
{
    /// <summary>
    /// Hands the orders of the listed slots to an inner opponent and gives every other slot none (it only ends its turn).
    /// The scenario decides which slots the computer plays; a slot marked human or not listed is never planned for.
    /// </summary>
    public sealed class SlotOpponent : IOpponentTurn
    {
        private readonly HashSet<int> slots;
        private readonly IOpponentTurn inner;

        public SlotOpponent(IReadOnlyList<int> slots, IOpponentTurn inner)
        {
            this.slots = new HashSet<int>(slots);
            this.inner = inner;
        }

        public IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services) =>
            slots.Contains(slot) ? inner.Plan(slot, state, services) : System.Array.Empty<Command>();
    }
}
