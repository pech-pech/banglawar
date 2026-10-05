using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>Founders: found on the spot when the site is legal, otherwise walk to the nearest legal site (expansion up to <see cref="AiTuning.MaxBases"/>).</summary>
    internal static class FoundingPlanner
    {
        public static void Run(PlanSession s)
        {
            var claimed = new List<TileCoord>();
            foreach (int founderId in FounderIds(s))
            {
                if (!s.TryUnit(founderId, out Unit founder))
                {
                    continue;
                }

                Knowledge k = s.Know();
                if (k.Bases.Count >= AiTuning.MaxBases)
                {
                    return;
                }

                if (IsFree(s, k, founder.Pos, claimed) && s.Try(new FoundBaseCommand(s.Side, founderId)))
                {
                    continue;
                }

                if (TryBestSite(s, k, founder, claimed, out TileCoord site))
                {
                    claimed.Add(site);
                    s.MoveToward(founderId, site);
                }
            }
        }

        private static List<int> FounderIds(PlanSession s)
        {
            var ids = new List<int>();
            for (int i = 0; i < s.State.UnitTable.Count; i++)
            {
                Unit u = s.State.UnitTable[i];
                if (u.Owner == s.Side && u.Role == UnitRole.Founder)
                {
                    ids.Add(u.Id);
                }
            }

            return ids;
        }

        /// <summary>A tile where a base could stand as far as this slot knows: buildable, clear of known bases and of other founders' picks.</summary>
        private static bool IsFree(PlanSession s, Knowledge k, TileCoord tile, List<TileCoord> claimed)
        {
            if (!s.State.InBounds(tile) || !TerrainInfo.IsBuildable(s.State.TerrainAt(tile)))
            {
                return false;
            }

            for (int i = 0; i < k.Bases.Count; i++)
            {
                if (k.Bases[i].Pos.DistanceTo(tile) < RuleTables.MinBaseDistance)
                {
                    return false;
                }
            }

            for (int i = 0; i < k.EnemyBases.Count; i++)
            {
                if (k.EnemyBases[i].Pos.DistanceTo(tile) < RuleTables.MinBaseDistance)
                {
                    return false;
                }
            }

            for (int i = 0; i < claimed.Count; i++)
            {
                if (claimed[i].DistanceTo(tile) < RuleTables.MinBaseDistance)
                {
                    return false;
                }
            }

            return true;
        }

        private static bool TryBestSite(PlanSession s, Knowledge k, Unit founder, List<TileCoord> claimed, out TileCoord best)
        {
            var near = new List<TileCoord>();
            for (int d = 1; d <= AiTuning.FoundSearchRadius && near.Count < AiTuning.FoundCandidateLimit; d++)
            {
                for (int y = founder.Pos.Y - d; y <= founder.Pos.Y + d; y++)
                {
                    for (int x = founder.Pos.X - d; x <= founder.Pos.X + d; x++)
                    {
                        var t = new TileCoord(x, y);
                        if (founder.Pos.DistanceTo(t) == d && IsFree(s, k, t, claimed) && near.Count < AiTuning.FoundCandidateLimit)
                        {
                            near.Add(t);
                        }
                    }
                }
            }

            var queries = new GameQueries(s.State, s.Services);
            best = founder.Pos;
            int bestCost = int.MaxValue;
            for (int i = 0; i < near.Count; i++)
            {
                MovePlan plan = queries.PlanMove(founder.Id, near[i]);
                if (plan.Found && plan.CostHundredths < bestCost)
                {
                    bestCost = plan.CostHundredths;
                    best = near[i];
                }
            }

            return bestCost != int.MaxValue;
        }
    }
}
