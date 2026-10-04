using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>What the core says about moving a unit to a tile. Costs and the path come from the core's pathfinder.</summary>
    public sealed class MovePlan
    {
        public GridPos Origin { get; }
        public IReadOnlyList<PathStep> Steps { get; }
        public int MovePointsLeft { get; }
        public int MovePointsPerTurn { get; }

        public MovePlan(GridPos origin, IReadOnlyList<PathStep> steps, int movePointsLeft, int movePointsPerTurn)
        {
            Origin = origin;
            Steps = steps;
            MovePointsLeft = movePointsLeft;
            MovePointsPerTurn = movePointsPerTurn;
        }
    }

    /// <summary>Read-only movement query on the current core state. Null means no path.</summary>
    public interface IMovementQuery
    {
        MovePlan? PlanMove(int unitId, GridPos target);
    }

    public enum CommandKind
    {
        Move,
        Attack,
        Build,
        EndTurn,
    }

    /// <summary>
    /// What the player asked for, in the presentation's terms. The Unity-side command layer maps it to the
    /// core's order type (Conquest.Core Contracts). Several unit ids mean a group order, sorted ascending.
    /// </summary>
    public sealed class PresentationCommand
    {
        public CommandKind Kind { get; }
        public IReadOnlyList<int> UnitIds { get; }
        public GridPos Target { get; }
        public string? Detail { get; }

        public PresentationCommand(CommandKind kind, IReadOnlyList<int> unitIds, GridPos target, string? detail = null)
        {
            Kind = kind;
            UnitIds = unitIds;
            Target = target;
            Detail = detail;
        }
    }

    public sealed class CommandOutcome
    {
        public bool Accepted { get; }

        /// <summary>A stable error code from the core (for example "err.not_flat"); the theme turns it into text.</summary>
        public string? ErrorCode { get; }

        public CommandOutcome(bool accepted, string? errorCode)
        {
            Accepted = accepted;
            ErrorCode = errorCode;
        }
    }

    /// <summary>The only way the view changes the game. Implemented over the core's order validation.</summary>
    public interface ICommandSink
    {
        CommandOutcome Submit(PresentationCommand command);
    }
}
