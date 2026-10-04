using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// Where the surviving units of the losing side go after a field battle (GDD G18: an adjacent land tile). Each unit steps
    /// to the neighbouring tile farthest from the enemy, ties by (y, x); it stays put when no neighbour is farther, blocked by
    /// water, an enemy unit or an enemy base. Defenders of a colony never retreat (they stand on the base).
    /// </summary>
    internal static class RetreatPlanner
    {
        public static ImmArray<UnitRetreat> Plan(ICombatContext context, BattleState final, bool attackerWon)
        {
            var list = new List<UnitRetreat>();
            if (attackerWon && context.TargetBase != null)
            {
                return ImmArray<UnitRetreat>.From(list);
            }

            IReadOnlyList<UnitView> losers = attackerWon ? context.Defenders : context.Attackers;
            TileCoord awayFrom = attackerWon ? context.Attackers[0].Pos : context.Target;
            for (int i = 0; i < losers.Count; i++)
            {
                UnitView u = losers[i];
                BattleUnit? now = final.Find(u.Id);
                if (now == null || now.Strength <= 0)
                {
                    continue;
                }

                TileCoord? to = Step(context.State, u, awayFrom);
                if (to != null)
                {
                    list.Add(new UnitRetreat(u.Id, to.Value));
                }
            }

            return ImmArray<UnitRetreat>.From(list);
        }

        private static TileCoord? Step(IGameStateView state, UnitView unit, TileCoord awayFrom)
        {
            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            TileCoord? best = null;
            int bestDistance = unit.Pos.DistanceTo(awayFrom);
            for (int y = unit.Pos.Y - 1; y <= unit.Pos.Y + 1; y++)
            {
                for (int x = unit.Pos.X - 1; x <= unit.Pos.X + 1; x++)
                {
                    var t = new TileCoord(x, y);
                    if (t == unit.Pos || !Open(state, unit.Owner, t, cls))
                    {
                        continue;
                    }

                    int d = t.DistanceTo(awayFrom);
                    if (d > bestDistance)
                    {
                        best = t;
                        bestDistance = d;
                    }
                }
            }

            return best;
        }

        private static bool Open(IGameStateView state, int owner, TileCoord t, MoveClass cls)
        {
            if (!state.InBounds(t) || TerrainInfo.EntryCost(state.TerrainAt(t), cls) == 0)
            {
                return false;
            }

            IReadOnlyList<UnitView> there = state.UnitsAt(t);
            for (int i = 0; i < there.Count; i++)
            {
                if (there[i].Owner != owner)
                {
                    return false;
                }
            }

            return !state.TryGetBaseAt(t, out BaseView b) || b.Owner == owner;
        }
    }
}
