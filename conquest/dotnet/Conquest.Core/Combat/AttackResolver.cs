using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Combat
{
    /// <summary>The group-level numbers of one attack: how many distinct squares and kinds take part.</summary>
    public readonly struct AttackProfile
    {
        public AttackProfile(int flankSquares, int distinctKinds)
        {
            FlankSquares = flankSquares;
            DistinctKinds = distinctKinds;
        }

        public int FlankSquares { get; }

        public int DistinctKinds { get; }
    }

    /// <summary>Validation and resolution of a group attack (GDD 11.3, 11.4).</summary>
    public static class AttackResolver
    {
        public static AttackProfile Profile(BattleState state, IReadOnlyList<int> unitIds, int targetCol, int targetRow)
        {
            List<BattleUnit> attackers = unitIds.Select(state.Find).Where(u => u != null).Select(u => u!).ToList();
            int squares = attackers.Select(u => u.Row * 100 + u.Col).Distinct().Count();
            int kinds = attackers.Select(u => u.Kind).Distinct().Count();
            return new AttackProfile(squares, kinds);
        }

        public static BattleStepResult Apply(BattleState state, BattleAction action, CombatRules rules, SplitMix64 dice)
        {
            string? problem = Validate(state, action, rules, out List<BattleUnit> attackers);
            if (problem != null)
            {
                return BattleStepResult.Fail(state, dice, problem);
            }

            BattleSide enemySide = state.ToAct == BattleSide.Attacker ? BattleSide.Defender : BattleSide.Attacker;
            List<BattleUnit> squad = state.Units
                .Where(u => u.Side == enemySide && u.Col == action.Col && u.Row == action.Row).ToList();
            List<BattleUnit> before = squad.ToList();
            AttackProfile profile = Profile(state, action.UnitIds, action.Col, action.Row);
            bool onlyRanged = squad.All(t => t.Kind == UnitKind.Ranged);

            foreach (BattleUnit attacker in attackers)
            {
                for (int shot = 0; shot < attacker.Strength && squad.Any(t => t.Strength > 0); shot++)
                {
                    dice = ShootOnce(state, rules, attacker, squad, profile, onlyRanged, dice);
                }
            }

            List<BattleUnit> survivors = new List<BattleUnit>();
            List<int> deadIds = new List<int>();
            for (int i = 0; i < squad.Count; i++)
            {
                if (squad[i].Strength <= 0)
                {
                    deadIds.Add(squad[i].Id);
                }
                else if (squad[i].Strength != before[i].Strength)
                {
                    survivors.Add(squad[i]);
                }
            }

            BattleState next = state
                .WithUnits(attackers.Select(a => a.WithAttacked()).Concat(survivors).ToList(), deadIds)
                .WithAttackUsed();
            next = Morale.Check(next, survivors.Select(t => t.Id).ToList(), rules, ref dice);
            return BattleStepResult.Success(BattleEngine.CheckElimination(next), dice);
        }

        private static SplitMix64 ShootOnce(
            BattleState state,
            CombatRules rules,
            BattleUnit attacker,
            List<BattleUnit> squad,
            AttackProfile profile,
            bool onlyRanged,
            SplitMix64 dice)
        {
            List<int> live = Enumerable.Range(0, squad.Count).Where(i => squad[i].Strength > 0).ToList();
            int total = live.Sum(i => squad[i].Kind == attacker.Kind ? rules.LikeWeight : rules.UnlikeWeight);
            dice = dice.Below(total, out int pick);
            int chosen = live[live.Count - 1];
            int running = 0;
            foreach (int i in live)
            {
                running += squad[i].Kind == attacker.Kind ? rules.LikeWeight : rules.UnlikeWeight;
                if (pick < running)
                {
                    chosen = i;
                    break;
                }
            }

            BattleUnit target = squad[chosen];
            HitContext context = new HitContext(
                attacker.Kind,
                profile.FlankSquares,
                profile.DistinctKinds,
                Geometry.IsCharging(attacker),
                System.Math.Abs(target.Row - attacker.Row),
                onlyRanged,
                target.Kind,
                state.Info(attacker.Side).HitBonusPermille);
            dice = dice.Below(1000, out int roll);
            if (roll < Odds.HitChance(rules, context))
            {
                squad[chosen] = target.WithStrength(target.Strength - 1);
            }

            return dice;
        }

        private static string? Validate(BattleState state, BattleAction action, CombatRules rules, out List<BattleUnit> attackers)
        {
            attackers = new List<BattleUnit>();
            if (action.UnitIds.Count == 0)
            {
                return "err.attack_empty";
            }

            if (action.UnitIds.Distinct().Count() != action.UnitIds.Count)
            {
                return "err.attack_invalid";
            }

            if (state.AttacksUsed >= AttacksAllowed(state.Info(state.ToAct), rules))
            {
                return "err.no_attacks_left";
            }

            foreach (int id in action.UnitIds.OrderBy(i => i))
            {
                string? problem = CheckAttacker(state, id, action, rules, out BattleUnit? unit);
                if (problem != null)
                {
                    return problem;
                }

                attackers.Add(unit!);
            }

            bool hasTarget = state.Units.Any(u => u.Side != state.ToAct && u.OnBoard && u.Col == action.Col && u.Row == action.Row);
            return hasTarget ? null : "err.attack_no_target";
        }

        public static int AttacksAllowed(SideInfo info, CombatRules rules)
        {
            return info.Commander == null ? rules.AttacksWithoutCommander : info.Commander.Level * rules.AttacksPerCommanderLevel;
        }

        private static string? CheckAttacker(BattleState state, int id, BattleAction action, CombatRules rules, out BattleUnit? unit)
        {
            unit = state.Find(id);
            if (unit == null)
            {
                return "err.unit_unknown";
            }

            if (unit.Side != state.ToAct)
            {
                return "err.unit_not_yours";
            }

            if (!unit.OnBoard)
            {
                return "err.attack_invalid";
            }

            if (unit.Attacked)
            {
                return "err.unit_already_attacked";
            }

            int allowedSteps = unit.Kind == UnitKind.Shock ? 1 : 0;
            if (unit.MovedSteps > allowedSteps)
            {
                return "err.attack_after_move";
            }

            return InReach(unit, action.Col, action.Row, rules) ? null : "err.attack_out_of_reach";
        }

        /// <summary>Line and shock hit orthogonal neighbours; ranged fire anywhere in their own column.</summary>
        public static bool InReach(BattleUnit unit, int col, int row, CombatRules rules)
        {
            if (!Geometry.InGrid(rules, col, row))
            {
                return false;
            }

            return unit.Kind == UnitKind.Ranged
                ? unit.Col == col && unit.Row != row
                : Geometry.Adjacent(unit.Col, unit.Row, col, row);
        }
    }
}
