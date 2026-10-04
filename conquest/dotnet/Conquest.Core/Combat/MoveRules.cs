using System;

namespace Conquest.Core.Combat
{
    /// <summary>Validation and application of a move (GDD 11.2, 11.3, 02 section 1.3).</summary>
    internal static class MoveRules
    {
        public static BattleStepResult Apply(BattleState state, BattleAction action, CombatRules rules, SplitMix64 dice)
        {
            BattleUnit? unit = state.Find(action.UnitId);
            if (unit == null)
            {
                return BattleStepResult.Fail(state, dice, "err.unit_unknown");
            }

            if (unit.Side != state.ToAct)
            {
                return BattleStepResult.Fail(state, dice, "err.not_your_turn");
            }

            if (unit.Attacked)
            {
                return BattleStepResult.Fail(state, dice, "err.move_after_attack");
            }

            if (!Geometry.InGrid(rules, action.Col, action.Row))
            {
                return BattleStepResult.Fail(state, dice, "err.move_illegal");
            }

            int steps;
            string? problem = unit.OnBoard
                ? CheckOnBoardMove(state, unit, action.Col, action.Row, rules, out steps)
                : CheckEntry(unit, action.Row, rules, out steps);
            problem ??= CheckDestination(state, unit, action.Col, action.Row, rules);
            if (problem != null)
            {
                return BattleStepResult.Fail(state, dice, problem);
            }

            BattleUnit moved = unit.WithPlace(action.Col, action.Row, unit.OnBoard ? unit.MovedSteps + steps : steps);
            BattleState next = state.WithUnit(moved);
            if (action.Col == Geometry.FlagCol(rules) && action.Row == Geometry.HomeRow(rules, Other(unit.Side)))
            {
                next = next.WithOutcome(new BattleOutcome(unit.Side, OutcomeReason.FlagEntered));
            }

            return BattleStepResult.Success(next, dice);
        }

        private static BattleSide Other(BattleSide side)
        {
            return side == BattleSide.Attacker ? BattleSide.Defender : BattleSide.Attacker;
        }

        private static string? CheckEntry(BattleUnit unit, int row, CombatRules rules, out int steps)
        {
            steps = Geometry.MaxSteps(unit.Kind);
            return row == Geometry.HomeRow(rules, unit.Side) ? null : "err.move_not_home_row";
        }

        private static string? CheckOnBoardMove(BattleState state, BattleUnit unit, int col, int row, CombatRules rules, out int steps)
        {
            steps = Math.Abs(col - unit.Col) + Math.Abs(row - unit.Row);
            if (unit.Kind == UnitKind.Ranged && row != Geometry.HomeRow(rules, unit.Side))
            {
                return "err.move_not_home_row";
            }

            if (steps == 0 || steps > Geometry.MaxSteps(unit.Kind))
            {
                return "err.move_illegal";
            }

            if (unit.MovedSteps + steps > Geometry.MaxSteps(unit.Kind))
            {
                return "err.no_moves_left";
            }

            return steps == 2 && !HasOpenPath(state, unit, col, row) ? "err.move_blocked" : null;
        }

        /// <summary>A two-step move needs at least one intermediate square without enemy units.</summary>
        private static bool HasOpenPath(BattleState state, BattleUnit unit, int col, int row)
        {
            BattleSide enemy = Other(unit.Side);
            if (unit.Col == col || unit.Row == row)
            {
                int midCol = (unit.Col + col) / 2;
                int midRow = (unit.Row + row) / 2;
                return !Geometry.HasUnits(state.Units, midCol, midRow, enemy);
            }

            return !Geometry.HasUnits(state.Units, unit.Col, row, enemy) || !Geometry.HasUnits(state.Units, col, unit.Row, enemy);
        }

        private static string? CheckDestination(BattleState state, BattleUnit unit, int col, int row, CombatRules rules)
        {
            if (Geometry.HasUnits(state.Units, col, row, Other(unit.Side)))
            {
                return "err.move_blocked";
            }

            if (unit.OnBoard
                && Geometry.AdjacentToEnemy(state.Units, unit.Col, unit.Row, unit.Side)
                && Geometry.AdjacentToEnemy(state.Units, col, row, unit.Side))
            {
                return "err.move_adjacent_enemy";
            }

            int load = Geometry.Load(rules, state.Units, col, row, unit.Side);
            return load + Geometry.Slots(rules, unit.Kind) > rules.SquareCapacity ? "err.square_full" : null;
        }
    }
}
