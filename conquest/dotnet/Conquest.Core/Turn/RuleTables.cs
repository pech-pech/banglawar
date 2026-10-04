using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Default neutral numbers (GDD 7 and 8, MANUAL where cited, otherwise the ASSUMED defaults listed there).
    /// These are code constants for now; the data-driven loader (Conquest.Rules) will replace them without changing callers.
    /// </summary>
    public static class RuleTables
    {
        public const int MaxLevel = 4;
        public const int MaxStrength = 5;
        public const int MovementScale = 100;

        /// <summary>ASSUMED (GDD 8.4): the productivity modifier, in percentage points, is clamped to this range.</summary>
        public const int ModifierMinPct = -100;
        public const int ModifierMaxPct = 100;

        /// <summary>ASSUMED: a base needs at least this Chebyshev distance to any other base.</summary>
        public const int MinBaseDistance = 3;

        /// <summary>ASSUMED (GDD 8.5): people one point of food feeds, growth and shortage rates in percent.</summary>
        public const int PeoplePerFood = 100;
        public const int GrowthPct = 3;
        public const int ShortagePct = 5;

        /// <summary>ASSUMED small starting kit of a new base (GDD 8.5, 01 G1-G3).</summary>
        public static ResourceVector StartingStock => new ResourceVector(30, 10, 50, 0, 20, 100);

        private static readonly int[] ScoutMoves = { 8, 10, 12, 14 };
        private static readonly int[] ShockMoves = { 5, 6, 7, 8 };
        private static readonly int[] CommanderMoves = { 3, 3, 4, 4 };
        private static readonly int[] RangedMoves = { 2, 2, 3, 3 };
        private static readonly int[] FounderMoves = { 1, 1, 1, 2 };
        private static readonly int[] TransportMoves = { 12, 14, 16, 18 };

        /// <summary>Movement points of a role at a level (02 G1, ASSUMED). Line and militia are 3.</summary>
        public static int MovePoints(UnitRole role, int level)
        {
            int i = Clamp(level, 1, MaxLevel) - 1;
            switch (role)
            {
                case UnitRole.Scout: return ScoutMoves[i];
                case UnitRole.Shock: return ShockMoves[i];
                case UnitRole.Commander: return CommanderMoves[i];
                case UnitRole.Ranged: return RangedMoves[i];
                case UnitRole.Founder: return FounderMoves[i];
                case UnitRole.Transport: return TransportMoves[i];
                default: return 3;
            }
        }

        /// <summary>The full movement budget in hundredths of a point.</summary>
        public static int MoveBudget(UnitRole role, int level) => MovePoints(role, level) * MovementScale;

        /// <summary>Strength of a fresh unit equals its level, capped at 5 (02 G5).</summary>
        public static int StartStrength(int level) => Clamp(level, 1, MaxStrength);

        /// <summary>The strength a full heal reaches: the level (capped at 5), or the current strength when that is higher.</summary>
        public static int MaxStrengthOf(int level, int strength) => strength > StartStrength(level) ? strength : StartStrength(level);

        public static bool CanInitiateAttack(UnitRole role) =>
            role == UnitRole.Line || role == UnitRole.Shock || role == UnitRole.Ranged || role == UnitRole.Commander;

        public static int MaxBuildingLevel(BuildingRole role) => role == BuildingRole.Academy ? 1 : MaxLevel;

        // ----- building costs (GDD 8.2): cost to reach level 1..4. basic=W, hard=M, coin=$, wares=G -----

        private static ResourceVector C(int basic, int hard, int coin, int wares) => new ResourceVector(basic, hard, coin, wares, 0, 0);

        public static ResourceVector BuildingCost(BuildingRole role, int level)
        {
            int i = Clamp(level, 1, MaxLevel) - 1;
            switch (role)
            {
                case BuildingRole.Food: return new[] { C(4, 0, 0, 0), C(10, 4, 0, 0), C(20, 10, 0, 4), C(32, 20, 0, 10) }[i];
                case BuildingRole.Habitat: return new[] { C(2, 0, 0, 0), C(5, 2, 0, 0), C(10, 5, 10, 2), C(15, 10, 40, 5) }[i];
                case BuildingRole.Attractor: return new[] { C(5, 0, 0, 0), C(12, 5, 20, 0), C(25, 12, 50, 5), C(40, 25, 100, 12) }[i];
                case BuildingRole.Port: return new[] { C(2, 0, 0, 0), C(5, 2, 0, 0), C(10, 5, 0, 2), C(16, 10, 25, 5) }[i];
                case BuildingRole.BasicExtractor: return new[] { C(3, 0, 0, 0), C(7, 3, 0, 0), C(15, 7, 10, 3), C(25, 15, 50, 7) }[i];
                case BuildingRole.HardExtractor: return new[] { C(4, 0, 0, 0), C(10, 4, 0, 0), C(20, 10, 10, 4), C(32, 20, 50, 10) }[i];
                case BuildingRole.CoinExtractor: return new[] { C(8, 0, 0, 0), C(20, 8, 0, 0), C(40, 20, 20, 8), C(64, 40, 100, 20) }[i];
                case BuildingRole.Converter: return new[] { C(3, 3, 0, 2), C(7, 7, 0, 5), C(15, 15, 20, 10), C(25, 25, 60, 16) }[i];
                case BuildingRole.ScoutPost: return new[] { C(2, 0, 0, 0), C(5, 2, 0, 0), C(10, 5, 10, 2), C(15, 10, 40, 5) }[i];
                case BuildingRole.Garrison: return new[] { C(10, 1, 0, 0), C(25, 5, 0, 0), C(50, 15, 20, 5), C(75, 30, 90, 15) }[i];
                default: return C(50, 15, 20, 5); // Academy, single level
            }
        }

        /// <summary>Cost to raise the Colony Center to <paramref name="level"/> (2..4; level 1 is the founder).</summary>
        public static ResourceVector CoreCost(int level)
        {
            switch (level)
            {
                case 2: return C(20, 5, 0, 0);
                case 3: return C(40, 10, 100, 5);
                default: return C(80, 20, 250, 10);
            }
        }

        // ----- outputs and capacity (GDD 8.3), indexed by level - 1 -----

        private static readonly int[] FoodOutput = { 3, 9, 21, 36 };
        private static readonly int[] ExtractorOutput = { 1, 3, 7, 12 };
        private static readonly int[] CoinOutput = { 20, 60, 140, 240 };
        private static readonly int[] HousingCapacity = { 100, 300, 600, 1000 };
        private static readonly int[] ImmigrationPerTurn = { 10, 20, 30, 40 };

        public static int FoodBase(int level) => FoodOutput[Clamp(level, 1, MaxLevel) - 1];

        public static int ExtractorBase(int level) => ExtractorOutput[Clamp(level, 1, MaxLevel) - 1];

        public static int CoinBase(int level) => CoinOutput[Clamp(level, 1, MaxLevel) - 1];

        public static int HousingOf(int level) => HousingCapacity[Clamp(level, 1, MaxLevel) - 1];

        public static int ImmigrationOf(int level) => ImmigrationPerTurn[Clamp(level, 1, MaxLevel) - 1];

        /// <summary>A farm also houses 40 people per level.</summary>
        public static int FarmHousing(int level) => 40 * Clamp(level, 1, MaxLevel);

        /// <summary>Church immigration weight in percent for the n-th church (0-based): 100, 75, 50 (ASSUMED, GDD 8.5).</summary>
        public static int ChurchWeightPct(int ordinal) => ordinal == 0 ? 100 : ordinal == 1 ? 75 : 50;

        private static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;
    }

    /// <summary>The neutral hook values: no seasons, every percent 100.</summary>
    public sealed class NeutralRuleHooks : IRuleHooks
    {
        public const string NeutralSeason = "season.neutral";

        public static NeutralRuleHooks Instance { get; } = new NeutralRuleHooks();

        public string SeasonAt(int turn) => NeutralSeason;

        public int MoveCostPct(int turn, MoveClass moveClass) => 100;

        public int FoodOutputPct(int turn) => 100;
    }
}
