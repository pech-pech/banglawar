using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>
    /// The planner's scratch pad: a private copy of the state that every command is tried on, through the same
    /// <see cref="CommandEngine"/> the player uses, so only accepted commands are kept and later choices see their effects.
    /// The caller's state is never touched.
    /// </summary>
    internal sealed class PlanSession
    {
        private readonly List<Command> _commands = new List<Command>();

        public PlanSession(GameState state, TurnServices services, int side, ulong seed)
        {
            State = state;
            Services = services;
            Side = side;
            Seed = seed;
        }

        public GameState State { get; private set; }

        public TurnServices Services { get; }

        public int Side { get; }

        public ulong Seed { get; }

        public IReadOnlyList<Command> Commands => _commands;

        public Knowledge Know() => Knowledge.Of(State, Side);

        /// <summary>Tries a command on the private state; keeps it and returns true only when the engine accepts it.</summary>
        public bool Try(Command command)
        {
            CommandResult r = CommandEngine.Apply(State, command, Services);
            if (!r.Ok)
            {
                return false;
            }

            State = r.State;
            _commands.Add(command);
            return true;
        }

        public bool TryUnit(int unitId, out Unit unit)
        {
            int i = State.FindUnitIndex(unitId);
            unit = i < 0 ? null! : State.UnitTable[i];
            return i >= 0;
        }

        /// <summary>Moves a unit as far toward <paramref name="goal"/> as its movement allows; true when it moved.</summary>
        public bool MoveToward(int unitId, TileCoord goal)
        {
            if (!TryUnit(unitId, out Unit unit) || unit.Pos == goal || unit.MovesLeft <= 0)
            {
                return false;
            }

            MovePlan plan = new GameQueries(State, Services).PlanMove(unitId, goal);
            if (!plan.Found)
            {
                return false;
            }

            int tries = 0;
            for (int k = plan.Steps.Count - 1; k >= 0 && tries < AiTuning.MaxStepTries; k--, tries++)
            {
                if (Try(new MoveCommand(Side, unitId, plan.Steps[k])))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
