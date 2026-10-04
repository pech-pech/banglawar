namespace Conquest.Core.Combat
{
    /// <summary>Everything that changes one shot's hit chance (GDD 11.4).</summary>
    public readonly struct HitContext
    {
        public HitContext(
            UnitKind attackerKind,
            int flankSquares = 1,
            int distinctKinds = 1,
            bool charged = false,
            int rowDistance = 1,
            bool targetSquareOnlyRanged = false,
            UnitKind? targetKind = null,
            int sideBonusPermille = 0)
        {
            AttackerKind = attackerKind;
            FlankSquares = flankSquares < 1 ? 1 : flankSquares;
            DistinctKinds = distinctKinds < 1 ? 1 : distinctKinds;
            Charged = charged;
            RowDistance = rowDistance < 1 ? 1 : rowDistance;
            TargetSquareOnlyRanged = targetSquareOnlyRanged;
            TargetKind = targetKind;
            SideBonusPermille = sideBonusPermille;
        }

        public UnitKind AttackerKind { get; }

        public int FlankSquares { get; }

        public int DistinctKinds { get; }

        public bool Charged { get; }

        public int RowDistance { get; }

        public bool TargetSquareOnlyRanged { get; }

        public UnitKind? TargetKind { get; }

        public int SideBonusPermille { get; }
    }

    /// <summary>Pure integer odds: hit and panic chances in per-mille.</summary>
    public static class Odds
    {
        public static int HitChance(CombatRules rules, in HitContext c)
        {
            int chance = Geometry.BaseHit(rules, c.AttackerKind);
            chance += rules.FlankPerExtraSquare * (c.FlankSquares - 1);
            chance += rules.CombinedPerExtraKind * (c.DistinctKinds - 1);
            chance += c.SideBonusPermille;
            if (c.AttackerKind == UnitKind.Shock && c.Charged)
            {
                chance += rules.Charge;
            }

            if (c.AttackerKind == UnitKind.Ranged)
            {
                chance += rules.RangePerRow * (c.RowDistance - 1);
                if (c.TargetKind == UnitKind.Ranged)
                {
                    chance += rules.CounterBattery;
                }
            }
            else if (c.TargetSquareOnlyRanged)
            {
                chance += rules.LoneRangedTarget;
            }

            return Clamp(chance, rules.HitMin, rules.HitMax);
        }

        /// <summary>The chance a damaged survivor falls back (02 G9). The timed modifier is added before the cap.</summary>
        public static int PanicChance(CombatRules rules, int lost, int max, int ownCharisma, int enemyReputation, int modifierPermille)
        {
            long lostShare = max > 0 ? (long)rules.PanicPerLostPermille * lost / max : 0;
            long chance = rules.PanicBase + lostShare
                - ((long)rules.CharismaPerPoint * ownCharisma)
                + ((long)rules.ReputationPerPoint * enemyReputation)
                + modifierPermille;
            return Clamp(chance, 0, rules.PanicMax);
        }

        private static int Clamp(long value, int min, int max)
        {
            return (int)(value < min ? min : value > max ? max : value);
        }
    }
}
