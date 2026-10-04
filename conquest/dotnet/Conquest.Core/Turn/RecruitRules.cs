using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Recruiting (GDD 7.1, T3): costs, who may recruit what, and the support caps. Scouts come from the Habitat (owner
    /// decision 2026-10-03), commanders and founders need a building of exactly the unit's level, military need a Garrison of
    /// at least that level. ASSUMED: 2 scouts per Habitat level, commanders per colony = Colony Center level.
    /// </summary>
    public static class RecruitRules
    {
        public const int ScoutsPerHabitatLevel = 2;

        private static readonly int[] GarrisonSupport = { 4, 7, 9, 10 };

        private static ResourceVector C(int basic, int hard, int coin, int wares, int food, int pop) =>
            new ResourceVector(basic, hard, coin, wares, food, pop);

        /// <summary>The full price of a unit: $ coin, M hard, W basic, G wares, C food, P people (people leave the colony).</summary>
        public static ResourceVector Cost(UnitRole role, int level)
        {
            int i = IntMath.Clamp(level, 1, RuleTables.MaxLevel) - 1;
            switch (role)
            {
                case UnitRole.Scout: return C(0, 0, new[] { 20, 50, 100, 200 }[i], 0, 0, 1);
                case UnitRole.Commander: return C(0, 0, new[] { 100, 200, 350, 500 }[i], 0, 0, 1);
                case UnitRole.Founder:
                    return new[] { C(15, 0, 50, 0, 15, 150), C(30, 0, 100, 0, 30, 300), C(45, 10, 150, 0, 45, 450), C(60, 20, 200, 10, 60, 600) }[i];
                case UnitRole.Line:
                    return new[] { C(0, 1, 5, 0, 0, 10), C(0, 2, 10, 0, 0, 15), C(0, 5, 15, 1, 0, 20), C(0, 10, 20, 2, 0, 25) }[i];
                case UnitRole.Shock:
                    return new[] { C(0, 2, 10, 0, 0, 10), C(0, 5, 20, 0, 0, 15), C(0, 10, 30, 2, 0, 20), C(0, 16, 40, 5, 0, 25) }[i];
                default:
                    return new[] { C(0, 5, 10, 0, 0, 5), C(0, 10, 20, 0, 0, 10), C(0, 20, 30, 2, 0, 15), C(0, 32, 40, 5, 0, 20) }[i];
            }
        }

        public static bool IsRecruitable(UnitRole role) =>
            role == UnitRole.Scout || role == UnitRole.Founder || role == UnitRole.Commander
            || role == UnitRole.Line || role == UnitRole.Shock || role == UnitRole.Ranged;

        public static bool IsMilitary(UnitRole role) => role == UnitRole.Line || role == UnitRole.Shock || role == UnitRole.Ranged || role == UnitRole.Militia;

        private static bool SameGroup(UnitRole a, UnitRole b) => IsMilitary(a) ? IsMilitary(b) : a == b;

        /// <summary>Units of the role's group that this base houses plus the ones on order. Used for the support caps.</summary>
        public static int Housed(GameState s, Base b, UnitRole role)
        {
            int count = 0;
            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                Unit u = s.UnitTable[i];
                if (u.AttachedBase == b.Id && SameGroup(u.Role, role))
                {
                    count++;
                }
            }

            for (int i = 0; i < s.Recruits.Count; i++)
            {
                RecruitOrder r = s.Recruits[i];
                if (r.BaseId == b.Id && SameGroup(r.Role, role))
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>Null when the recruit is allowed, otherwise an <c>err.*</c> code.</summary>
        public static string? Check(GameState s, Base b, UnitRole role, int level)
        {
            if (!IsRecruitable(role))
            {
                return Err.WrongRole;
            }

            if (level < 1 || level > RuleTables.MaxLevel)
            {
                return Err.BadLevel;
            }

            string? building = BuildingGate(b, role, level, s.Turn);
            if (building != null)
            {
                return building;
            }

            if (Housed(s, b, role) >= Cap(b, role, s.Turn))
            {
                return Err.SupportCap;
            }

            return b.Stock.Covers(Cost(role, level)) ? null : Err.NotEnoughResources;
        }

        private static string? BuildingGate(Base b, UnitRole role, int level, int turn)
        {
            if (role == UnitRole.Commander)
            {
                return b.CoreLevel == level ? null : Err.BadLevel;
            }

            BuildingRole needed = IsMilitary(role) ? BuildingRole.Garrison : BuildingRole.Habitat;
            bool exact = role == UnitRole.Founder;
            bool found = false;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (x.Role != needed || !EconomyStep.IsFunctional(x, turn))
                {
                    continue;
                }

                found = true;
                if (exact ? x.Level == level : x.Level >= level)
                {
                    return null;
                }
            }

            return found ? Err.BadLevel : Err.NoBuilding;
        }

        /// <summary>Support cap of a role at a base: garrison 4/7/9/10 per level, scouts 2 per habitat level, commanders = core level.</summary>
        public static int Cap(Base b, UnitRole role, int turn)
        {
            if (role == UnitRole.Founder)
            {
                return int.MaxValue;
            }

            if (role == UnitRole.Commander)
            {
                return b.CoreLevel;
            }

            int cap = 0;
            BuildingRole source = IsMilitary(role) ? BuildingRole.Garrison : BuildingRole.Habitat;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (x.Role == source && EconomyStep.IsFunctional(x, turn))
                {
                    cap += source == BuildingRole.Garrison
                        ? GarrisonSupport[IntMath.Clamp(x.Level, 1, RuleTables.MaxLevel) - 1]
                        : ScoutsPerHabitatLevel * x.Level;
                }
            }

            return cap;
        }
    }
}
