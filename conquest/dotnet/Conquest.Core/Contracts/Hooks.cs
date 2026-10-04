namespace Conquest.Core.Contracts
{
    /// <summary>Per-turn rule values that the spec 06 hooks change. The neutral implementation is <c>NeutralRuleHooks</c>.</summary>
    public interface IRuleHooks
    {
        /// <summary>The season id for a turn ("season.neutral" when none applies). Used for <see cref="SeasonStarted"/>.</summary>
        string SeasonAt(int turn);

        /// <summary>Integer percent applied to a step cost (100 = unchanged), spec 06 H3.</summary>
        int MoveCostPct(int turn, MoveClass moveClass);

        /// <summary>Integer percent applied to <c>bld.food</c> output (100 = unchanged), spec 06 H3.</summary>
        int FoodOutputPct(int turn);
    }

    /// <summary>A named integer counter update for state kept by Rules code (<see cref="IGameStateView.GetExt"/>).</summary>
    public sealed record ExtUpdate(string Key, long Value);

    /// <summary>Strength changes and events produced by one pipeline step (healing).</summary>
    public sealed record StepResult(ImmArray<UnitChange> UnitChanges, ImmArray<GameEvent> Events)
    {
        public static StepResult None { get; } = new StepResult(ImmArray<UnitChange>.Empty, ImmArray<GameEvent>.Empty);
    }

    /// <summary>Pipeline step 5 (spec 06 H7). Implemented by Rules core B.</summary>
    public interface IHealingSource
    {
        StepResult Compute(IGameStateView state);
    }

    /// <summary>The outcome of the end-condition check (pipeline step 5a, spec 06 H4).</summary>
    public sealed record EndCheckResult(
        ImmArray<int> EliminatedSlots,
        bool MatchEnded,
        int WinnerSlot,
        ImmArray<ExtUpdate> ExtUpdates,
        ImmArray<GameEvent> Events)
    {
        public static EndCheckResult None { get; } =
            new EndCheckResult(ImmArray<int>.Empty, false, -1, ImmArray<ExtUpdate>.Empty, ImmArray<GameEvent>.Empty);
    }

    /// <summary>Pipeline step 5a. Implemented by Rules core B. Called after healing, before the turn counter moves.</summary>
    public interface IEndConditions
    {
        EndCheckResult Evaluate(IGameStateView state);
    }
}
