using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// A small deterministic policy that plays one side of a battle: enter reserves, attack where most units reach,
    /// advance toward the enemy flag, end the turn. It is the "auto-resolve" of 02 G25 and the engine behind AI-vs-AI
    /// and context-only combat. It is not a smart AI; it only has to be legal, deterministic and to terminate.
    /// </summary>
    public static class BattleAutoPlayer
    {
        public static BattleStepResult PlayTurn(BattleState state, CombatRules rules, SplitMix64 dice)
        {
            if (state.Outcome != null)
            {
                return BattleStepResult.Success(state, dice);
            }

            BattleSide side = state.ToAct;
            BattleState s = state;
            EnterReserves(ref s, side, rules, ref dice);
            AttackWhilePossible(ref s, side, rules, ref dice);
            Advance(ref s, side, rules, ref dice);
            return s.Outcome != null ? BattleStepResult.Success(s, dice) : BattleEngine.Apply(s, BattleAction.EndTurn(), rules, dice);
        }

        /// <summary>Plays both sides until the battle has an outcome (the round cap guarantees it).</summary>
        public static BattleStepResult Resolve(BattleState state, CombatRules rules, SplitMix64 dice)
        {
            BattleStepResult last = BattleStepResult.Success(state, dice);
            int guard = (rules.RoundCap * 2) + 4;
            while (last.State.Outcome == null && guard-- > 0)
            {
                last = PlayTurn(last.State, rules, last.Dice);
            }

            return last;
        }

        private static bool TryApply(ref BattleState state, ref SplitMix64 dice, BattleAction action, CombatRules rules)
        {
            BattleStepResult r = BattleEngine.Apply(state, action, rules, dice);
            if (!r.Ok)
            {
                return false;
            }

            state = r.State;
            dice = r.Dice;
            return true;
        }

        private static void EnterReserves(ref BattleState s, BattleSide side, CombatRules rules, ref SplitMix64 dice)
        {
            int home = Geometry.HomeRow(rules, side);
            foreach (int id in s.Units.Where(u => u.Side == side && !u.OnBoard).Select(u => u.Id).ToList())
            {
                foreach (int col in ColumnsFromFlag(rules))
                {
                    if (TryApply(ref s, ref dice, BattleAction.Move(id, col, home), rules))
                    {
                        break;
                    }
                }
            }
        }

        private static IEnumerable<int> ColumnsFromFlag(CombatRules rules)
        {
            int flag = Geometry.FlagCol(rules);
            return Enumerable.Range(0, rules.Cols).OrderBy(c => System.Math.Abs(c - flag)).ThenBy(c => c);
        }

        private static void AttackWhilePossible(ref BattleState s, BattleSide side, CombatRules rules, ref SplitMix64 dice)
        {
            for (int i = 0; i < 16 && s.Outcome == null; i++)
            {
                if (!BestAttack(s, side, rules, out BattleAction? attack) || !TryApply(ref s, ref dice, attack!, rules))
                {
                    return;
                }
            }
        }

        private static bool BestAttack(BattleState s, BattleSide side, CombatRules rules, out BattleAction? best)
        {
            best = null;
            int bestCount = 0;
            foreach (var square in s.Units.Where(u => u.Side != side && u.OnBoard).Select(u => (u.Row, u.Col)).Distinct().OrderBy(p => p.Row).ThenBy(p => p.Col))
            {
                List<int> eligible = s.Units
                    .Where(u => u.Side == side && u.OnBoard && !u.Attacked && CanStillAttack(u) && AttackResolver.InReach(u, square.Col, square.Row, rules))
                    .Select(u => u.Id).ToList();
                if (eligible.Count > bestCount)
                {
                    bestCount = eligible.Count;
                    best = BattleAction.Attack(eligible, square.Col, square.Row);
                }
            }

            return best != null;
        }

        private static bool CanStillAttack(BattleUnit u)
        {
            return u.MovedSteps <= (u.Kind == UnitKind.Shock ? 1 : 0);
        }

        private static void Advance(ref BattleState s, BattleSide side, CombatRules rules, ref SplitMix64 dice)
        {
            foreach (int id in s.Units.Where(u => u.Side == side && u.OnBoard && !u.Attacked).Select(u => u.Id).ToList())
            {
                if (s.Outcome != null)
                {
                    return;
                }

                BattleUnit? u = s.Find(id);
                if (u == null || u.MovedSteps > 0)
                {
                    continue;
                }

                foreach ((int col, int row) in Candidates(s, u, rules))
                {
                    if (TryApply(ref s, ref dice, BattleAction.Move(id, col, row), rules))
                    {
                        break;
                    }
                }
            }
        }

        private static IEnumerable<(int Col, int Row)> Candidates(BattleState s, BattleUnit u, CombatRules rules)
        {
            int forward = Geometry.ForwardStep(u.Side);
            int flag = Geometry.FlagCol(rules);
            int toward = u.Col < flag ? 1 : u.Col > flag ? -1 : 0;
            if (u.Kind == UnitKind.Ranged)
            {
                return RangedColumns(s, u, rules);
            }

            List<(int, int)> list = new List<(int, int)>();
            if (u.Kind == UnitKind.Shock)
            {
                list.Add((u.Col, u.Row + (2 * forward)));
            }

            list.Add((u.Col, u.Row + forward));
            if (toward != 0)
            {
                list.Add((u.Col + toward, u.Row));
            }

            return list;
        }

        /// <summary>A ranged unit stays on its home row and shifts to a neighbouring column with more enemies in it.</summary>
        private static IEnumerable<(int Col, int Row)> RangedColumns(BattleState s, BattleUnit u, CombatRules rules)
        {
            int here = s.Units.Count(e => e.Side != u.Side && e.OnBoard && e.Col == u.Col);
            return new[] { u.Col - 1, u.Col + 1 }
                .Where(c => c >= 0 && c < rules.Cols && s.Units.Count(e => e.Side != u.Side && e.OnBoard && e.Col == c) > here)
                .Select(c => (c, u.Row));
        }
    }
}
