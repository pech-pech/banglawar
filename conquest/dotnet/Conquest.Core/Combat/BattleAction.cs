using System.Collections.Generic;
using Conquest.Core.Rules;

namespace Conquest.Core.Combat
{
    public enum ActionKind
    {
        Move = 0,
        Attack = 1,
        EndTurn = 2,
        Retreat = 3,
    }

    /// <summary>An order from the side whose turn it is.</summary>
    public sealed class BattleAction
    {
        private BattleAction(ActionKind kind, int unitId, int col, int row, IReadOnlyList<int> unitIds)
        {
            Kind = kind;
            UnitId = unitId;
            Col = col;
            Row = row;
            UnitIds = unitIds;
        }

        public ActionKind Kind { get; }

        /// <summary>The moving unit (Move only).</summary>
        public int UnitId { get; }

        /// <summary>Destination or target column.</summary>
        public int Col { get; }

        /// <summary>Destination or target row.</summary>
        public int Row { get; }

        /// <summary>The attacking group (Attack only).</summary>
        public IReadOnlyList<int> UnitIds { get; }

        public static BattleAction Move(int unitId, int col, int row)
        {
            return new BattleAction(ActionKind.Move, unitId, col, row, Frozen.List<int>(null));
        }

        public static BattleAction Attack(IEnumerable<int> unitIds, int col, int row)
        {
            return new BattleAction(ActionKind.Attack, -1, col, row, Frozen.List(unitIds));
        }

        public static BattleAction EndTurn()
        {
            return new BattleAction(ActionKind.EndTurn, -1, -1, -1, Frozen.List<int>(null));
        }

        public static BattleAction Retreat()
        {
            return new BattleAction(ActionKind.Retreat, -1, -1, -1, Frozen.List<int>(null));
        }
    }

    /// <summary>The result of one action: the new state and dice, or an error code with both unchanged.</summary>
    public sealed class BattleStepResult
    {
        private BattleStepResult(bool ok, string? error, BattleState state, SplitMix64 dice)
        {
            Ok = ok;
            Error = error;
            State = state;
            Dice = dice;
        }

        public bool Ok { get; }

        public string? Error { get; }

        public BattleState State { get; }

        public SplitMix64 Dice { get; }

        public static BattleStepResult Success(BattleState state, SplitMix64 dice)
        {
            return new BattleStepResult(true, null, state, dice);
        }

        public static BattleStepResult Fail(BattleState unchanged, SplitMix64 dice, string error)
        {
            return new BattleStepResult(false, error, unchanged, dice);
        }
    }
}
