namespace Conquest.Core.Combat
{
    /// <summary>
    /// Tunable numbers of the tactical battle (GDD 11, 02 G5-G14). Every rate is an integer per-mille; defaults are the
    /// ASSUMED values of the GDD and are meant to be replaced from data.
    /// </summary>
    public sealed class CombatRules
    {
        public CombatRules(
            int cols = 3,
            int rows = 4,
            int squareCapacity = 6,
            int slotsLine = 1,
            int slotsShock = 2,
            int slotsRanged = 2,
            int baseHitLine = 300,
            int baseHitShock = 320,
            int baseHitRanged = 280,
            int flankPerExtraSquare = 50,
            int combinedPerExtraKind = 50,
            int charge = 100,
            int loneRangedTarget = 150,
            int counterBattery = -100,
            int rangePerRow = -50,
            int hitMin = 50,
            int hitMax = 950,
            int likeWeight = 3,
            int unlikeWeight = 1,
            int panicBase = 50,
            int panicPerLostPermille = 600,
            int charismaPerPoint = 20,
            int reputationPerPoint = 20,
            int panicMax = 900,
            int blockedRetreatDamage = 1,
            int roundCap = 20,
            int attacksPerCommanderLevel = 1,
            int attacksWithoutCommander = 1,
            int maxStrength = 5)
        {
            Cols = cols;
            Rows = rows;
            SquareCapacity = squareCapacity;
            SlotsLine = slotsLine;
            SlotsShock = slotsShock;
            SlotsRanged = slotsRanged;
            BaseHitLine = baseHitLine;
            BaseHitShock = baseHitShock;
            BaseHitRanged = baseHitRanged;
            FlankPerExtraSquare = flankPerExtraSquare;
            CombinedPerExtraKind = combinedPerExtraKind;
            Charge = charge;
            LoneRangedTarget = loneRangedTarget;
            CounterBattery = counterBattery;
            RangePerRow = rangePerRow;
            HitMin = hitMin;
            HitMax = hitMax;
            LikeWeight = likeWeight;
            UnlikeWeight = unlikeWeight;
            PanicBase = panicBase;
            PanicPerLostPermille = panicPerLostPermille;
            CharismaPerPoint = charismaPerPoint;
            ReputationPerPoint = reputationPerPoint;
            PanicMax = panicMax;
            BlockedRetreatDamage = blockedRetreatDamage;
            RoundCap = roundCap;
            AttacksPerCommanderLevel = attacksPerCommanderLevel;
            AttacksWithoutCommander = attacksWithoutCommander;
            MaxStrength = maxStrength;
        }

        public static CombatRules Default { get; } = new CombatRules();

        public int Cols { get; }

        public int Rows { get; }

        public int SquareCapacity { get; }

        public int SlotsLine { get; }

        public int SlotsShock { get; }

        public int SlotsRanged { get; }

        public int BaseHitLine { get; }

        public int BaseHitShock { get; }

        public int BaseHitRanged { get; }

        public int FlankPerExtraSquare { get; }

        public int CombinedPerExtraKind { get; }

        public int Charge { get; }

        public int LoneRangedTarget { get; }

        public int CounterBattery { get; }

        public int RangePerRow { get; }

        public int HitMin { get; }

        public int HitMax { get; }

        public int LikeWeight { get; }

        public int UnlikeWeight { get; }

        public int PanicBase { get; }

        public int PanicPerLostPermille { get; }

        public int CharismaPerPoint { get; }

        public int ReputationPerPoint { get; }

        public int PanicMax { get; }

        public int BlockedRetreatDamage { get; }

        /// <summary>A round is an attacker turn plus a defender turn (02 G12). The defender holds when the cap is reached.</summary>
        public int RoundCap { get; }

        public int AttacksPerCommanderLevel { get; }

        public int AttacksWithoutCommander { get; }

        /// <summary>Strength cap of a battlefield unit (GDD 11.1).</summary>
        public int MaxStrength { get; }
    }
}
