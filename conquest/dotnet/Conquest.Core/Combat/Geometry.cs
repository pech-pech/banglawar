using System;
using System.Collections.Generic;

namespace Conquest.Core.Combat
{
    /// <summary>Grid helpers for the battle board. Columns grow left to right, rows from the attacker's home row downward.</summary>
    public static class Geometry
    {
        public static int Slots(CombatRules rules, UnitKind kind)
        {
            switch (kind)
            {
                case UnitKind.Shock: return rules.SlotsShock;
                case UnitKind.Ranged: return rules.SlotsRanged;
                default: return rules.SlotsLine;
            }
        }

        /// <summary>Total moves a unit may spend in one combat turn (line 1, shock 2, ranged 1).</summary>
        public static int MaxSteps(UnitKind kind)
        {
            return kind == UnitKind.Shock ? 2 : 1;
        }

        public static int BaseHit(CombatRules rules, UnitKind kind)
        {
            switch (kind)
            {
                case UnitKind.Shock: return rules.BaseHitShock;
                case UnitKind.Ranged: return rules.BaseHitRanged;
                default: return rules.BaseHitLine;
            }
        }

        public static int HomeRow(CombatRules rules, BattleSide side)
        {
            return side == BattleSide.Attacker ? 0 : rules.Rows - 1;
        }

        /// <summary>The flag sits in the middle column of each end row (02 G10).</summary>
        public static int FlagCol(CombatRules rules)
        {
            return rules.Cols / 2;
        }

        /// <summary>The row a damaged unit falls back to (toward its own reserves).</summary>
        public static int RetreatStep(BattleSide side)
        {
            return side == BattleSide.Attacker ? -1 : 1;
        }

        public static int ForwardStep(BattleSide side)
        {
            return -RetreatStep(side);
        }

        public static bool Adjacent(int colA, int rowA, int colB, int rowB)
        {
            return Math.Abs(colA - colB) + Math.Abs(rowA - rowB) == 1;
        }

        public static bool InGrid(CombatRules rules, int col, int row)
        {
            return col >= 0 && col < rules.Cols && row >= 0 && row < rules.Rows;
        }

        /// <summary>A shock unit that moved this turn and did not panic last turn charges (GDD 11.3).</summary>
        public static bool IsCharging(BattleUnit unit)
        {
            return unit.Kind == UnitKind.Shock && unit.MovedSteps > 0 && !unit.Panicked;
        }

        /// <summary>Slots already used in a square by units of one side.</summary>
        public static int Load(CombatRules rules, IReadOnlyList<BattleUnit> units, int col, int row, BattleSide side)
        {
            int load = 0;
            for (int i = 0; i < units.Count; i++)
            {
                BattleUnit u = units[i];
                if (u.Side == side && u.Col == col && u.Row == row)
                {
                    load += Slots(rules, u.Kind);
                }
            }

            return load;
        }

        public static bool HasUnits(IReadOnlyList<BattleUnit> units, int col, int row, BattleSide side)
        {
            for (int i = 0; i < units.Count; i++)
            {
                BattleUnit u = units[i];
                if (u.Side == side && u.Col == col && u.Row == row)
                {
                    return true;
                }
            }

            return false;
        }

        public static bool AdjacentToEnemy(IReadOnlyList<BattleUnit> units, int col, int row, BattleSide mySide)
        {
            for (int i = 0; i < units.Count; i++)
            {
                BattleUnit u = units[i];
                if (u.Side != mySide && u.OnBoard && Adjacent(col, row, u.Col, u.Row))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
