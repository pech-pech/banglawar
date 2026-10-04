using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// <see cref="IGameQueries"/> over one state: the resource-bar forecast, movement per turn and a move plan for the path
    /// preview. All answers come from the code the turn pipeline and the move command run, so a preview equals the result.
    /// </summary>
    public sealed class GameQueries : IGameQueries
    {
        private const int UnlimitedBudget = 1_000_000;

        private readonly GameState _state;
        private readonly TurnServices _services;

        public GameQueries(GameState state, TurnServices? services = null)
        {
            _state = state;
            _services = services ?? TurnServices.Neutral;
        }

        public ResourceVector Forecast(int baseId)
        {
            int index = _state.FindBaseIndex(baseId);
            return index < 0
                ? ResourceVector.Zero
                : EconomyStep.Forecast(_state, _state.BaseTable[index], _services.Hooks, _services.Regions);
        }

        public int MovesPerTurn(UnitRole role, int level) => RuleTables.MovePoints(role, level);

        public MovePlan PlanMove(int unitId, TileCoord target)
        {
            int index = _state.FindUnitIndex(unitId);
            if (index < 0 || !_state.InBounds(target))
            {
                return NoPlan;
            }

            Unit unit = _state.UnitTable[index];
            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            if (TerrainInfo.EntryCost(_state.TerrainAt(target), cls) == 0)
            {
                return NoPlan;
            }

            PathResult path = CommandEngine.FindPath(_state, unit, target, UnlimitedBudget, _services);
            return path.Found ? new MovePlan(true, path.Steps, path.Cost, TurnsFor(unit, path.Cost)) : NoPlan;
        }

        private static MovePlan NoPlan => new MovePlan(false, ImmArray<TileCoord>.Empty, 0, 0);

        /// <summary>Turns needed counting the current one: this turn's remaining movement first, then full budgets.</summary>
        private static int TurnsFor(Unit unit, int cost)
        {
            if (cost <= unit.MovesLeft)
            {
                return 1;
            }

            int full = RuleTables.MoveBudget(unit.Role, unit.Level);
            int rest = cost - unit.MovesLeft;
            return 1 + IntMath.FloorDiv(rest + full - 1, full);
        }
    }
}
