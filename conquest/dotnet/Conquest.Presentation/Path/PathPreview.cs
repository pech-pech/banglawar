using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>One step of a path computed by the core: the tile entered and the movement points it costs.</summary>
    public readonly struct PathStep
    {
        public GridPos Pos { get; }
        public int Cost { get; }

        public PathStep(GridPos pos, int cost)
        {
            Pos = pos;
            Cost = cost;
        }
    }

    public sealed class PathPreviewStep
    {
        public GridPos Pos { get; }
        public int CumulativeCost { get; }

        /// <summary>0 = reached this turn, 1 = next turn, and so on.</summary>
        public int TurnIndex { get; }
        public Facing Facing { get; }

        /// <summary>The last step the unit makes before its movement runs out (draw a turn marker here).</summary>
        public bool IsTurnEnd { get; }
        public bool IsDestination { get; }

        public PathPreviewStep(GridPos pos, int cumulativeCost, int turnIndex, Facing facing, bool isTurnEnd, bool isDestination)
        {
            Pos = pos;
            CumulativeCost = cumulativeCost;
            TurnIndex = turnIndex;
            Facing = facing;
            IsTurnEnd = isTurnEnd;
            IsDestination = isDestination;
        }
    }

    /// <summary>
    /// The path a banner would walk, annotated for drawing: which steps are reachable this turn, where each
    /// turn ends and the facing of every step. It only formats a path the core already found and costed;
    /// it never decides movement rules. Unreachable (no path) is an empty preview with Found = false.
    /// </summary>
    public sealed class PathPreview
    {
        public static readonly PathPreview None = new PathPreview(false, Array.Empty<PathPreviewStep>(), 0);

        public bool Found { get; }
        public IReadOnlyList<PathPreviewStep> Steps { get; }
        public int TotalCost { get; }

        private PathPreview(bool found, IReadOnlyList<PathPreviewStep> steps, int totalCost)
        {
            Found = found;
            Steps = steps;
            TotalCost = totalCost;
        }

        /// <summary>Steps with TurnIndex 0.</summary>
        public int StepsThisTurn
        {
            get
            {
                int count = 0;
                foreach (PathPreviewStep step in Steps)
                {
                    if (step.TurnIndex == 0) count++;
                }

                return count;
            }
        }

        public int TurnsNeeded => Steps.Count == 0 ? 0 : Steps[Steps.Count - 1].TurnIndex + 1;

        /// <summary>
        /// Splits the path into turns. A step that costs more than the points left starts a new turn with
        /// movePointsPerTurn; a step dearer than a whole turn is still taken alone on a fresh turn
        /// (ASSUMED rule, to be confirmed against the core's movement rule). Steps must be adjacent tiles.
        /// </summary>
        public static PathPreview Build(GridPos origin, IReadOnlyList<PathStep> steps, int movePointsLeft, int movePointsPerTurn)
        {
            if (steps == null) throw new ArgumentNullException(nameof(steps));
            if (movePointsPerTurn <= 0) throw new ArgumentOutOfRangeException(nameof(movePointsPerTurn));
            if (movePointsLeft < 0) throw new ArgumentOutOfRangeException(nameof(movePointsLeft));
            if (steps.Count == 0)
            {
                return None;
            }

            var result = new List<PathPreviewStep>(steps.Count);
            GridPos previous = origin;
            Facing facing = Facing.SE;
            int remaining = movePointsLeft;
            int turn = 0;
            int cumulative = 0;
            for (int i = 0; i < steps.Count; i++)
            {
                PathStep step = steps[i];
                int dx = step.Pos.X - previous.X;
                int dy = step.Pos.Y - previous.Y;
                if (step.Cost < 0 || (dx == 0 && dy == 0) || Math.Abs(dx) > 1 || Math.Abs(dy) > 1)
                {
                    throw new ArgumentException("Path step " + i + " is not an adjacent tile with a non-negative cost.");
                }

                if (step.Cost > remaining && remaining != movePointsPerTurn)
                {
                    if (result.Count > 0)
                    {
                        PathPreviewStep last = result[result.Count - 1];
                        result[result.Count - 1] = new PathPreviewStep(last.Pos, last.CumulativeCost, last.TurnIndex, last.Facing, true, false);
                    }

                    turn++;
                    remaining = movePointsPerTurn;
                }

                remaining = Math.Max(0, remaining - step.Cost);
                cumulative += step.Cost;
                facing = FacingMath.FromDelta(dx, dy, facing);
                result.Add(new PathPreviewStep(step.Pos, cumulative, turn, facing, false, i == steps.Count - 1));
                previous = step.Pos;
            }

            return new PathPreview(true, result, cumulative);
        }
    }
}
