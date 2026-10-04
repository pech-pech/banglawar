using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// The 3x4 tactical battle as a pure function: <c>Apply(state, action, rules, dice)</c> returns the next state and dice,
    /// or an error code with state and dice unchanged. Nothing is mutated and no clock or global random is read.
    /// </summary>
    public static class BattleEngine
    {
        public static BattleStepResult Apply(BattleState state, BattleAction action, CombatRules rules, SplitMix64 dice)
        {
            if (state.Outcome != null)
            {
                return BattleStepResult.Fail(state, dice, "err.battle_over");
            }

            switch (action.Kind)
            {
                case ActionKind.Move:
                    return MoveRules.Apply(state, action, rules, dice);
                case ActionKind.Attack:
                    return AttackResolver.Apply(state, action, rules, dice);
                case ActionKind.EndTurn:
                    return EndTurn(state, rules, dice);
                default:
                    return Retreat(state, rules, dice);
            }
        }

        /// <summary>A side with no unit left anywhere (board or reserves) loses.</summary>
        internal static BattleState CheckElimination(BattleState state)
        {
            if (state.Outcome != null)
            {
                return state;
            }

            if (state.CountOf(BattleSide.Defender) == 0)
            {
                return state.WithOutcome(new BattleOutcome(BattleSide.Attacker, OutcomeReason.Eliminated));
            }

            return state.CountOf(BattleSide.Attacker) == 0
                ? state.WithOutcome(new BattleOutcome(BattleSide.Defender, OutcomeReason.Eliminated))
                : state;
        }

        private static BattleStepResult EndTurn(BattleState state, CombatRules rules, SplitMix64 dice)
        {
            BattleSide acting = state.ToAct;
            List<BattleUnit> reset = state.Units.Where(u => u.Side == acting).Select(u => u.WithTurnReset()).ToList();
            BattleState next = state.WithUnits(reset, new int[0]);

            if (acting == BattleSide.Defender && state.Round >= rules.RoundCap)
            {
                BattleOutcome held = new BattleOutcome(BattleSide.Defender, OutcomeReason.RoundCap);
                return BattleStepResult.Success(next.WithTurn(BattleSide.Attacker, state.Round).WithOutcome(held), dice);
            }

            next = acting == BattleSide.Attacker
                ? next.WithTurn(BattleSide.Defender, state.Round)
                : next.WithTurn(BattleSide.Attacker, state.Round + 1);
            return BattleStepResult.Success(next, dice);
        }

        /// <summary>The army flees: the enemy gets one parting shot with base odds and no bonuses (02 G14), then wins.</summary>
        private static BattleStepResult Retreat(BattleState state, CombatRules rules, SplitMix64 dice)
        {
            BattleSide fleeing = state.ToAct;
            BattleSide staying = fleeing == BattleSide.Attacker ? BattleSide.Defender : BattleSide.Attacker;
            List<BattleUnit> targets = state.Units.Where(u => u.Side == fleeing && u.OnBoard).ToList();
            HashSet<int> hurtIds = new HashSet<int>();

            foreach (BattleUnit shooter in state.Units.Where(u => u.Side == staying && u.OnBoard))
            {
                for (int shot = 0; shot < shooter.Strength && targets.Count > 0; shot++)
                {
                    dice = dice.Below(targets.Count, out int pick);
                    dice = dice.Below(1000, out int roll);
                    int chance = Clamp(Geometry.BaseHit(rules, shooter.Kind), rules.HitMin, rules.HitMax);
                    if (roll < chance)
                    {
                        targets = Wound(targets, pick, hurtIds);
                    }
                }
            }

            List<int> removed = state.Units
                .Where(u => hurtIds.Contains(u.Id) && targets.All(t => t.Id != u.Id))
                .Select(u => u.Id).ToList();
            BattleState next = state.WithUnits(targets.Where(t => hurtIds.Contains(t.Id)).ToList(), removed)
                .WithOutcome(new BattleOutcome(staying, OutcomeReason.Retreated));
            return BattleStepResult.Success(next, dice);
        }

        private static List<BattleUnit> Wound(List<BattleUnit> targets, int index, HashSet<int> hurtIds)
        {
            List<BattleUnit> next = new List<BattleUnit>(targets);
            BattleUnit hurt = next[index].WithStrength(next[index].Strength - 1);
            hurtIds.Add(hurt.Id);
            if (hurt.Strength <= 0)
            {
                next.RemoveAt(index);
            }
            else
            {
                next[index] = hurt;
            }

            return next;
        }

        private static int Clamp(int value, int min, int max)
        {
            return value < min ? min : value > max ? max : value;
        }
    }
}
