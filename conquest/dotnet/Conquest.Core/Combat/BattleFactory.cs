using System;
using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Combat
{
    /// <summary>A unit to place in the reserves of a new battle.</summary>
    public sealed class BattleUnitSpec
    {
        public BattleUnitSpec(int id, UnitKind kind, int strength, int maxStrength = 0, bool generated = false)
        {
            Id = id;
            Kind = kind;
            Strength = strength;
            MaxStrength = maxStrength < strength ? strength : maxStrength;
            Generated = generated;
        }

        public int Id { get; }

        public UnitKind Kind { get; }

        public int Strength { get; }

        public int MaxStrength { get; }

        public bool Generated { get; }
    }

    public static class BattleFactory
    {
        /// <summary>Starts a battle with every unit in its side's reserves. Throws for programming errors (duplicate ids, strength below 1).</summary>
        public static BattleState Create(
            IEnumerable<BattleUnitSpec> attackers,
            SideInfo attackerInfo,
            IEnumerable<BattleUnitSpec> defenders,
            SideInfo defenderInfo)
        {
            List<BattleUnit> units = new List<BattleUnit>();
            units.AddRange(attackers.Select(s => ToUnit(s, BattleSide.Attacker)));
            units.AddRange(defenders.Select(s => ToUnit(s, BattleSide.Defender)));
            return BattleState.Create(units, attackerInfo, defenderInfo);
        }

        private static BattleUnit ToUnit(BattleUnitSpec spec, BattleSide side)
        {
            if (spec.Strength < 1)
            {
                throw new ArgumentException("unit " + spec.Id + " needs a strength of at least 1");
            }

            return new BattleUnit(spec.Id, side, spec.Kind, spec.Strength, spec.MaxStrength, generated: spec.Generated);
        }
    }
}
