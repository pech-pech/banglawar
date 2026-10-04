using System.Collections.Generic;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// The red defenders a colony generates (GDD 11.6, 02 G15): militia (level 2 line, two per core level) and one level 2
    /// ranged per fort level. Their ids are negative so they never clash with real units.
    /// </summary>
    public static class ColonyDefence
    {
        public const int GeneratedStrength = 2;
        public const int MilitiaPerCoreLevel = 2;
        public const int PopPerMilitiaStrength = 5;

        public static IReadOnlyList<BattleUnitSpec> Generated(int coreLevel, int fortLevels, int firstId)
        {
            List<BattleUnitSpec> specs = new List<BattleUnitSpec>();
            int id = firstId;
            for (int i = 0; i < coreLevel * MilitiaPerCoreLevel; i++)
            {
                specs.Add(new BattleUnitSpec(id--, UnitKind.Line, GeneratedStrength, generated: true));
            }

            for (int i = 0; i < fortLevels; i++)
            {
                specs.Add(new BattleUnitSpec(id--, UnitKind.Ranged, GeneratedStrength, generated: true));
            }

            return specs;
        }

        /// <summary>Population lost: 5 per militia strength point gone. Lost fort ranged cost nothing (GDD 11.6).</summary>
        public static int PopLoss(BattleState final, IReadOnlyList<BattleUnitSpec> generated, int perPoint = PopPerMilitiaStrength)
        {
            int points = 0;
            foreach (BattleUnitSpec spec in generated)
            {
                if (spec.Kind != UnitKind.Line)
                {
                    continue;
                }

                BattleUnit? now = final.Find(spec.Id);
                points += spec.Strength - (now == null ? 0 : now.Strength);
            }

            return points * perPoint;
        }
    }
}
