using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Map
{
    public sealed class PathResult
    {
        public PathResult(bool found, ImmArray<TileCoord> steps, int cost)
        {
            Found = found;
            Steps = steps;
            Cost = cost;
        }

        public bool Found { get; }

        /// <summary>The tiles entered, in order, excluding the start tile.</summary>
        public ImmArray<TileCoord> Steps { get; }

        /// <summary>Movement spent in hundredths of a point (a first step that exceeds the budget spends the whole budget).</summary>
        public int Cost { get; }

        public static PathResult NotFound { get; } = new PathResult(false, ImmArray<TileCoord>.Empty, 0);
    }

    /// <summary>
    /// Deterministic budget-bounded shortest path over 8-way steps. Costs are hundredths of a movement point:
    /// <c>EntryCost * movePct</c> (movePct 100 = neutral, spec 06 H3). A unit with its full budget may always take one step (02 G2): pass allowFreeStep.
    /// Ties are broken by lowest cost, then (y, x).
    /// </summary>
    public static class Pathfinder
    {
        public static int StepCost(Terrain terrain, MoveClass moveClass, int movePct)
        {
            int entry = TerrainInfo.EntryCost(terrain, moveClass);
            return entry == 0 ? 0 : checked(entry * movePct);
        }

        public static PathResult Find(
            GameMap map,
            TileCoord from,
            TileCoord to,
            MoveClass moveClass,
            int budget,
            int movePct,
            bool allowFreeStep,
            Func<TileCoord, bool> isBlocked)
        {
            if (!map.InBounds(from) || !map.InBounds(to) || from == to || isBlocked(to))
            {
                return PathResult.NotFound;
            }

            int size = map.Width * map.Height;
            var spent = new int[size];
            var prev = new int[size];
            var closed = new bool[size];
            for (int i = 0; i < size; i++)
            {
                spent[i] = int.MaxValue;
                prev[i] = -1;
            }

            int start = map.IndexOf(from);
            int goal = map.IndexOf(to);
            spent[start] = 0;
            var open = new List<int> { start };
            while (open.Count > 0)
            {
                int best = 0;
                for (int k = 1; k < open.Count; k++)
                {
                    if (spent[open[k]] < spent[open[best]] || (spent[open[k]] == spent[open[best]] && open[k] < open[best]))
                    {
                        best = k;
                    }
                }

                int cur = open[best];
                open.RemoveAt(best);
                if (closed[cur])
                {
                    continue;
                }

                closed[cur] = true;
                if (cur == goal)
                {
                    return Build(map, prev, start, goal, spent[goal]);
                }

                Expand(map, cur, spent, prev, closed, open, moveClass, budget, movePct, allowFreeStep, isBlocked);
            }

            return PathResult.NotFound;
        }

        private static void Expand(
            GameMap map,
            int cur,
            int[] spent,
            int[] prev,
            bool[] closed,
            List<int> open,
            MoveClass moveClass,
            int budget,
            int movePct,
            bool allowFreeStep,
            Func<TileCoord, bool> isBlocked)
        {
            TileCoord here = map.CoordOf(cur);
            for (int d = 0; d < GameMap.DirectionCount; d++)
            {
                if (!map.TryNeighbor(here, d, out TileCoord n))
                {
                    continue;
                }

                int ni = map.IndexOf(n);
                int cost = StepCost(map.TerrainAt(n), moveClass, movePct);
                if (closed[ni] || cost == 0 || isBlocked(n))
                {
                    continue;
                }

                int total = checked(spent[cur] + cost);
                if (total > budget)
                {
                    if (spent[cur] != 0 || !allowFreeStep)
                    {
                        continue;
                    }

                    total = budget; // the one-step rule: a fresh unit may always take one step
                }

                if (total < spent[ni])
                {
                    spent[ni] = total;
                    prev[ni] = cur;
                    open.Add(ni);
                }
            }
        }

        private static PathResult Build(GameMap map, int[] prev, int start, int goal, int cost)
        {
            var reversed = new List<TileCoord>();
            for (int at = goal; at != start; at = prev[at])
            {
                reversed.Add(map.CoordOf(at));
            }

            reversed.Reverse();
            return new PathResult(true, ImmArray<TileCoord>.From(reversed), cost);
        }
    }
}
