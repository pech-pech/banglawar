using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>
    /// Moves first, then attacks. Each base keeps a home guard. Spare units answer a threat near an own base, or, once enough of
    /// them are free and the odds are favourable, march on the nearest known enemy base. Scouts wander on a seeded goal.
    /// An attack is queued only when the attackers beat the defence by <see cref="AiTuning.FavourablePct"/>.
    /// </summary>
    internal static class MilitaryPlanner
    {
        public static void Run(PlanSession s)
        {
            MoveStage(s);
            AttackStage(s);
        }

        // ----- movement -----

        private static void MoveStage(PlanSession s)
        {
            Knowledge k = s.Know();
            var guards = GuardIds(k, s);
            List<Unit> mobile = Mobile(s, k, guards);

            if (TryThreat(k, out TileCoord threat))
            {
                foreach (Unit u in mobile)
                {
                    Approach(s, u.Id, threat);
                }
            }
            else if (mobile.Count >= AiTuning.StrikeMinUnits && TryObjective(k, mobile, out TileCoord objective))
            {
                int power = 0;
                foreach (Unit u in mobile)
                {
                    power += PowerModel.Of(u);
                }

                if (PowerModel.Favourable(power, PowerModel.Defence(k, objective)))
                {
                    foreach (Unit u in mobile)
                    {
                        Approach(s, u.Id, objective);
                    }
                }
            }

            WanderScouts(s, k);
        }

        /// <summary>Per base the strongest <see cref="AiTuning.HomeGuard"/> attached fighters (not commanders) stay put.</summary>
        private static HashSet<int> GuardIds(Knowledge k, PlanSession s)
        {
            var guards = new HashSet<int>();
            for (int b = 0; b < k.Bases.Count; b++)
            {
                var housed = new List<Unit>();
                for (int i = 0; i < k.Units.Count; i++)
                {
                    Unit u = k.Units[i];
                    if (u.AttachedBase == k.Bases[b].Id && u.Role != UnitRole.Commander && RuleTables.CanInitiateAttack(u.Role))
                    {
                        housed.Add(u);
                    }
                }

                housed.Sort((p, q) =>
                {
                    int byStrength = q.Strength.CompareTo(p.Strength);
                    return byStrength != 0 ? byStrength : p.Id.CompareTo(q.Id);
                });
                for (int i = 0; i < housed.Count && i < AiTuning.HomeGuard; i++)
                {
                    guards.Add(housed[i].Id);
                }
            }

            return guards;
        }

        private static List<Unit> Mobile(PlanSession s, Knowledge k, HashSet<int> guards)
        {
            var list = new List<Unit>();
            for (int i = 0; i < k.Units.Count; i++)
            {
                Unit u = k.Units[i];
                bool follower = u.Leader != 0 && s.State.FindUnitIndex(u.Leader) >= 0;
                if (RuleTables.CanInitiateAttack(u.Role) && !guards.Contains(u.Id) && !follower)
                {
                    list.Add(u);
                }
            }

            return list;
        }

        /// <summary>The visible enemy unit nearest to an own base, when it is inside the defence radius.</summary>
        private static bool TryThreat(Knowledge k, out TileCoord tile)
        {
            tile = default;
            int best = int.MaxValue;
            bool found = false;
            for (int i = 0; i < k.EnemyUnits.Count; i++)
            {
                TileCoord pos = k.EnemyUnits[i].Pos;
                for (int b = 0; b < k.Bases.Count; b++)
                {
                    int d = pos.DistanceTo(k.Bases[b].Pos);
                    if (d <= AiTuning.DefendRadius && (d < best || (d == best && pos.CompareTo(tile) < 0)))
                    {
                        best = d;
                        tile = pos;
                        found = true;
                    }
                }
            }

            return found;
        }

        /// <summary>The known enemy base nearest to the first mobile unit.</summary>
        private static bool TryObjective(Knowledge k, List<Unit> mobile, out TileCoord tile)
        {
            tile = default;
            if (k.EnemyBases.Count == 0)
            {
                return false;
            }

            TileCoord from = mobile[0].Pos;
            int best = int.MaxValue;
            for (int i = 0; i < k.EnemyBases.Count; i++)
            {
                int d = from.DistanceTo(k.EnemyBases[i].Pos);
                if (d < best)
                {
                    best = d;
                    tile = k.EnemyBases[i].Pos;
                }
            }

            return true;
        }

        /// <summary>Walks a unit to the cheapest free tile next to the target (enemies hold the target tile itself).</summary>
        private static void Approach(PlanSession s, int unitId, TileCoord target)
        {
            if (!s.TryUnit(unitId, out Unit unit) || unit.Pos.DistanceTo(target) <= 1)
            {
                return;
            }

            var queries = new GameQueries(s.State, s.Services);
            Knowledge k = s.Know();
            bool found = false;
            TileCoord best = default;
            int bestCost = int.MaxValue;
            for (int d = 0; d < GameMap.DirectionCount; d++)
            {
                if (!s.State.Map.TryNeighbor(target, d, out TileCoord n) || k.IsTileTaken(n) || HasEnemyBase(k, n))
                {
                    continue;
                }

                MovePlan plan = queries.PlanMove(unitId, n);
                if (plan.Found && (plan.CostHundredths < bestCost || (plan.CostHundredths == bestCost && n.CompareTo(best) < 0)))
                {
                    found = true;
                    best = n;
                    bestCost = plan.CostHundredths;
                }
            }

            if (found)
            {
                s.MoveToward(unitId, best);
            }
        }

        private static bool HasEnemyBase(Knowledge k, TileCoord tile)
        {
            for (int i = 0; i < k.EnemyBases.Count; i++)
            {
                if (k.EnemyBases[i].Pos == tile)
                {
                    return true;
                }
            }

            return false;
        }

        private static void WanderScouts(PlanSession s, Knowledge k)
        {
            if (k.EnemyBases.Count > 0)
            {
                return;
            }

            for (int i = 0; i < k.Units.Count; i++)
            {
                if (k.Units[i].Role == UnitRole.Scout && ScoutGoal(s, k.Units[i], out TileCoord goal))
                {
                    s.MoveToward(k.Units[i].Id, goal);
                }
            }
        }

        /// <summary>A seeded land goal that holds for <see cref="AiTuning.ScoutGoalTurns"/> turns, so a scout keeps its heading.</summary>
        private static bool ScoutGoal(PlanSession s, Unit scout, out TileCoord goal)
        {
            ulong stream = RngStreams.Named("ai", s.Side);
            int block = IntMath.FloorDiv(s.State.Turn, AiTuning.ScoutGoalTurns);
            for (int attempt = 0; attempt < AiTuning.ScoutGoalAttempts; attempt++)
            {
                ulong key = (ulong)(scout.Id * 16 + attempt * 2);
                int x = Rng.Range(s.Seed, stream, block, key, 0, s.State.Width);
                int y = Rng.Range(s.Seed, stream, block, key + 1, 0, s.State.Height);
                goal = new TileCoord(x, y);
                if (TerrainInfo.IsLand(s.State.TerrainAt(goal)))
                {
                    return true;
                }
            }

            goal = scout.Pos;
            return false;
        }

        // ----- attacks -----

        private static void AttackStage(PlanSession s)
        {
            Knowledge k = s.Know();
            var targets = new List<TileCoord>();
            for (int i = 0; i < k.EnemyUnits.Count; i++)
            {
                AddUnique(targets, k.EnemyUnits[i].Pos);
            }

            for (int i = 0; i < k.EnemyBases.Count; i++)
            {
                AddUnique(targets, k.EnemyBases[i].Pos);
            }

            targets.Sort();
            var used = new HashSet<int>();
            foreach (TileCoord target in targets)
            {
                var ids = new List<int>();
                int power = 0;
                for (int i = 0; i < k.Units.Count; i++)
                {
                    Unit u = k.Units[i];
                    if (RuleTables.CanInitiateAttack(u.Role) && u.Strength > 0 && !used.Contains(u.Id) && u.Pos.DistanceTo(target) <= 1)
                    {
                        ids.Add(u.Id);
                        power += PowerModel.Of(u);
                    }
                }

                if (ids.Count == 0 || !PowerModel.Favourable(power, PowerModel.Defence(k, target)))
                {
                    continue;
                }

                if (s.Try(new AttackCommand(s.Side, ImmArray<int>.From(ids), target)))
                {
                    used.UnionWith(ids);
                }
            }
        }

        private static void AddUnique(List<TileCoord> list, TileCoord t)
        {
            if (!list.Contains(t))
            {
                list.Add(t);
            }
        }
    }
}
