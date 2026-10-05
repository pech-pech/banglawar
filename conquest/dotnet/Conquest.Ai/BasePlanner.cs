using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>Per base: recruit toward the wanted garrison, send one founder when there is room to expand, place one missing building, upgrade.</summary>
    internal static class BasePlanner
    {
        private static readonly BuildingRole[] BuildOrder =
        {
            BuildingRole.Food, BuildingRole.Garrison, BuildingRole.BasicExtractor, BuildingRole.Habitat, BuildingRole.HardExtractor, BuildingRole.CoinExtractor,
        };

        private static readonly UnitRole[] MilitaryOrder = { UnitRole.Line, UnitRole.Ranged, UnitRole.Shock };

        public static void Run(PlanSession s)
        {
            var ids = new List<int>();
            for (int i = 0; i < s.State.BaseTable.Count; i++)
            {
                if (s.State.BaseTable[i].Owner == s.Side)
                {
                    ids.Add(s.State.BaseTable[i].Id);
                }
            }

            foreach (int id in ids)
            {
                RecruitMilitary(s, id);
                RecruitFounder(s, id);
                if (!BuildOne(s, id))
                {
                    UpgradeOne(s, id);
                }
            }
        }

        private static Base Current(PlanSession s, int id) => s.State.BaseTable[s.State.FindBaseIndex(id)];

        private static bool Threatened(PlanSession s, Base b)
        {
            Knowledge k = s.Know();
            for (int i = 0; i < k.EnemyUnits.Count; i++)
            {
                if (k.EnemyUnits[i].Pos.DistanceTo(b.Pos) <= AiTuning.DefendRadius + 2)
                {
                    return true;
                }
            }

            return false;
        }

        private static int WantedMilitary(Base b) => AiTuning.MilitaryBase + AiTuning.MilitaryPerCoreLevel * b.CoreLevel;

        private static void RecruitMilitary(PlanSession s, int baseId)
        {
            for (int n = 0; n < AiTuning.RecruitsPerBasePerTurn; n++)
            {
                Base b = Current(s, baseId);
                int housed = RecruitRules.Housed(s.State, b, UnitRole.Line);
                if (housed >= WantedMilitary(b))
                {
                    return;
                }

                UnitRole role = LeastHoused(s, b);
                if (!TryRecruit(s, b, role, UnitRole.Line))
                {
                    return;
                }
            }
        }

        /// <summary>The military role with the fewest units at the base (Line, Ranged, Shock on ties).</summary>
        private static UnitRole LeastHoused(PlanSession s, Base b)
        {
            UnitRole best = UnitRole.Line;
            int bestCount = int.MaxValue;
            for (int r = 0; r < MilitaryOrder.Length; r++)
            {
                int count = 0;
                for (int i = 0; i < s.State.UnitTable.Count; i++)
                {
                    Unit u = s.State.UnitTable[i];
                    if (u.AttachedBase == b.Id && u.Role == MilitaryOrder[r])
                    {
                        count++;
                    }
                }

                for (int i = 0; i < s.State.Recruits.Count; i++)
                {
                    if (s.State.Recruits[i].BaseId == b.Id && s.State.Recruits[i].Role == MilitaryOrder[r])
                    {
                        count++;
                    }
                }

                if (count < bestCount)
                {
                    bestCount = count;
                    best = MilitaryOrder[r];
                }
            }

            return best;
        }

        /// <summary>Recruits the best affordable level of the role, falling back to the fallback role.</summary>
        private static bool TryRecruit(PlanSession s, Base b, UnitRole role, UnitRole fallback)
        {
            return TryLevels(s, b, role) || (role != fallback && TryLevels(s, b, fallback));
        }

        private static bool TryLevels(PlanSession s, Base b, UnitRole role)
        {
            for (int level = RuleTables.MaxLevel; level >= 1; level--)
            {
                if (RecruitRules.Check(s.State, b, role, level) == null && s.Try(new RecruitCommand(s.Side, b.Id, role, level)))
                {
                    return true;
                }
            }

            return false;
        }

        private static void RecruitFounder(PlanSession s, int baseId)
        {
            Knowledge k = s.Know();
            int founders = 0;
            for (int i = 0; i < k.Units.Count; i++)
            {
                founders += k.Units[i].Role == UnitRole.Founder ? 1 : 0;
            }

            for (int i = 0; i < s.State.Recruits.Count; i++)
            {
                founders += s.State.Recruits[i].Role == UnitRole.Founder ? 1 : 0;
            }

            if (k.Bases.Count + founders >= AiTuning.MaxBases || Threatened(s, Current(s, baseId)))
            {
                return;
            }

            TryLevels(s, Current(s, baseId), UnitRole.Founder);
        }

        private static bool BuildOne(PlanSession s, int baseId)
        {
            Base b = Current(s, baseId);
            bool threatened = Threatened(s, b);
            for (int r = 0; r < BuildOrder.Length; r++)
            {
                BuildingRole role = threatened && r < 2 ? BuildOrder[1 - r] : BuildOrder[r];
                if (Has(b, role) || !b.Stock.Covers(RuleTables.BuildingCost(role, 1)))
                {
                    continue;
                }

                foreach (TileCoord at in Ring(s, b))
                {
                    if (s.Try(new BuildCommand(s.Side, b.Id, role, at)))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static bool Has(Base b, BuildingRole role)
        {
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (b.Buildings[i].Role == role)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Candidate tiles near the base, nearest first, then by (y, x); the engine has the last word on each.</summary>
        private static IEnumerable<TileCoord> Ring(PlanSession s, Base b)
        {
            var tiles = new List<TileCoord>();
            int reach = b.CoreLevel + 1;
            for (int y = b.Pos.Y - reach; y <= b.Pos.Y + reach; y++)
            {
                for (int x = b.Pos.X - reach; x <= b.Pos.X + reach; x++)
                {
                    var t = new TileCoord(x, y);
                    if (t != b.Pos && s.State.InBounds(t) && TerrainInfo.IsBuildable(s.State.TerrainAt(t)) && !Occupied(b, t))
                    {
                        tiles.Add(t);
                    }
                }
            }

            tiles.Sort((p, q) =>
            {
                int byDistance = b.Pos.DistanceTo(p).CompareTo(b.Pos.DistanceTo(q));
                return byDistance != 0 ? byDistance : p.CompareTo(q);
            });
            return tiles;
        }

        private static bool Occupied(Base b, TileCoord t)
        {
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (b.Buildings[i].Pos == t)
                {
                    return true;
                }
            }

            return false;
        }

        private static void UpgradeOne(PlanSession s, int baseId)
        {
            Base b = Current(s, baseId);
            if (b.PendingCoreLevel == 0 && b.CoreLevel < RuleTables.MaxLevel && Has(b, BuildingRole.Food) && Has(b, BuildingRole.Garrison)
                && b.Stock.Covers(RuleTables.CoreCost(b.CoreLevel + 1)) && s.Try(new UpgradeCommand(s.Side, b.Id, -1)))
            {
                return;
            }

            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                bool wanted = x.Role == BuildingRole.Garrison || x.Role == BuildingRole.Food;
                if (wanted && x.PendingLevel == 0 && x.Level < b.CoreLevel && x.Level < RuleTables.MaxBuildingLevel(x.Role)
                    && b.Stock.Covers(RuleTables.BuildingCost(x.Role, x.Level + 1)) && s.Try(new UpgradeCommand(s.Side, b.Id, i)))
                {
                    return;
                }
            }
        }
    }
}
