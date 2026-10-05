using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>
    /// A cheap strength estimate for the attack decision: a unit's strength times the hit chance the combat rules give its kind
    /// (<see cref="Odds.HitChance"/> on the default rules). Integer only; not a prediction of the battle, a comparison.
    /// </summary>
    public static class PowerModel
    {
        public static UnitKind KindOf(UnitRole role)
        {
            switch (role)
            {
                case UnitRole.Shock: return UnitKind.Shock;
                case UnitRole.Ranged: return UnitKind.Ranged;
                default: return UnitKind.Line;
            }
        }

        public static int Of(Unit unit)
        {
            int hit = Odds.HitChance(CombatRules.Default, new HitContext(KindOf(unit.Role)));
            return unit.Strength * hit;
        }

        /// <summary>The power of a fresh unit of a role and level, used for a remembered garrison nobody has seen.</summary>
        public static int OfFresh(UnitRole role, int level)
        {
            int hit = Odds.HitChance(CombatRules.Default, new HitContext(KindOf(role)));
            return RuleTables.StartStrength(level) * hit;
        }

        /// <summary>A tile's defending power: the units in view, scaled up by the base on it; an unseen garrison is assumed.</summary>
        public static int Defence(Knowledge k, TileCoord tile)
        {
            int total = 0;
            var seen = k.EnemyUnitsAt(tile);
            for (int i = 0; i < seen.Count; i++)
            {
                total += Of(seen[i]);
            }

            for (int i = 0; i < k.EnemyBases.Count; i++)
            {
                KnownBase b = k.EnemyBases[i];
                if (b.Pos != tile)
                {
                    continue;
                }

                int level = b.Level < 1 ? 1 : b.Level;
                if (!b.InView)
                {
                    total += AiTuning.AssumedGarrisonUnits * OfFresh(UnitRole.Line, level);
                }

                total = total * (100 + AiTuning.BaseDefencePctPerLevel * level) / 100;
            }

            return total;
        }

        /// <summary>True when attacking power beats the defence by the margin in <see cref="AiTuning.FavourablePct"/>.</summary>
        public static bool Favourable(int attack, int defence) => attack > 0 && (long)attack * 100 >= (long)defence * AiTuning.FavourablePct;
    }
}
