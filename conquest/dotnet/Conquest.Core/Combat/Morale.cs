using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Combat
{
    /// <summary>Panic and retreat of damaged units (GDD 11.5, 02 G9).</summary>
    internal static class Morale
    {
        /// <summary>Rolls once for each damaged survivor, in id order. A panicked unit falls back one row; a blocked one takes extra damage.</summary>
        public static BattleState Check(BattleState state, IReadOnlyList<int> damagedSurvivorIds, CombatRules rules, ref SplitMix64 dice)
        {
            BattleState current = state;
            foreach (int id in damagedSurvivorIds.OrderBy(i => i))
            {
                BattleUnit? unit = current.Find(id);
                if (unit == null)
                {
                    continue;
                }

                BattleSide enemy = unit.Side == BattleSide.Attacker ? BattleSide.Defender : BattleSide.Attacker;
                CommanderStats? own = current.Info(unit.Side).Commander;
                CommanderStats? foe = current.Info(enemy).Commander;
                int chance = Odds.PanicChance(
                    rules,
                    unit.MaxStrength - unit.Strength,
                    unit.MaxStrength,
                    own?.Charisma ?? 0,
                    foe?.Reputation ?? 0,
                    current.Info(unit.Side).PanicModifierPermille);
                dice = dice.Below(1000, out int roll);
                if (roll < chance)
                {
                    current = FallBack(current, unit, enemy, rules);
                }
            }

            return current;
        }

        private static BattleState FallBack(BattleState state, BattleUnit unit, BattleSide enemy, CombatRules rules)
        {
            int row = unit.Row + Geometry.RetreatStep(unit.Side);
            bool blocked = !Geometry.InGrid(rules, unit.Col, row)
                || Geometry.HasUnits(state.Units, unit.Col, row, enemy)
                || Geometry.Load(rules, state.Units, unit.Col, row, unit.Side) + Geometry.Slots(rules, unit.Kind) > rules.SquareCapacity;
            if (!blocked)
            {
                return state.WithUnit(unit.WithFallenBack(unit.Col, row));
            }

            int left = unit.Strength - rules.BlockedRetreatDamage;
            return left > 0
                ? state.WithUnit(unit.WithStrength(left))
                : state.WithUnits(new BattleUnit[0], new[] { unit.Id });
        }
    }
}
