using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Pipeline step 3a (spec 06 H1): scheduled arrivals land on the first free tile of their entry group, as one stack.
    /// Progress is kept in the state's ext counters (<c>arrival_done.N</c>, <c>arrival_defer.N</c>), so it is saved and hashed.
    /// A blocked arrival waits (<c>ev.arrival_deferred</c>); with <c>MaxDeferTurns</c> set it later lands on any free group
    /// tile of its slot. An arrival without a group lands on the free tile nearest the slot's first base (ASSUMED stand-in
    /// for "transport at the arrival edge"). Arrivals cost nothing and are never lost to a blocked entry.
    /// </summary>
    public static class ArrivalStep
    {
        public const string DonePrefix = "arrival_done.";
        public const string DeferPrefix = "arrival_defer.";
        public const int CarryPerCommanderLevel = 4;

        /// <summary>Places every arrival due on or before <paramref name="arrivalTurn"/> that has not landed yet.</summary>
        public static GameState Run(GameState state, TurnServices services, int arrivalTurn, List<GameEvent> events)
        {
            GameState s = state;
            IArrivalPlan plan = services.Arrivals;
            for (int i = 0; i < plan.Arrivals.Count; i++)
            {
                ArrivalSpec a = plan.Arrivals[i];
                if (a.Turn > arrivalTurn || s.GetExt(DonePrefix + a.Index) != 0)
                {
                    continue;
                }

                s = RunOne(s, plan, a, services, arrivalTurn, events);
            }

            return s;
        }

        private static GameState RunOne(GameState s, IArrivalPlan plan, ArrivalSpec a, TurnServices services, int turn, List<GameEvent> events)
        {
            if (s.IsEliminated(a.Slot))
            {
                return s.WithExt(DonePrefix + a.Index, 1);
            }

            if (services.TimedEffects.ArrivalSuppressed(a.Slot, turn, a.ViaPatron))
            {
                events.Add(new ArrivalCancelled(a.Slot, a.Index, "patron_link_cut"));
                return s.WithExt(DonePrefix + a.Index, 1);
            }

            if (a.Group != null && FindGroup(plan, a.Group) == null)
            {
                events.Add(new ArrivalCancelled(a.Slot, a.Index, "unknown_group"));
                return s.WithExt(DonePrefix + a.Index, 1);
            }

            int deferred = (int)s.GetExt(DeferPrefix + a.Index);
            bool anyGroup = plan.MaxDeferTurns >= 0 && deferred > plan.MaxDeferTurns;
            TileCoord? tile = LandingTile(s, plan, a, anyGroup);
            if (tile == null)
            {
                events.Add(new ArrivalDeferred(a.Slot, a.Group ?? string.Empty, a.Index));
                return s.WithExt(DeferPrefix + a.Index, deferred + 1);
            }

            return Land(s.WithExt(DonePrefix + a.Index, 1), a, tile.Value, events);
        }

        private static EntryGroup? FindGroup(IArrivalPlan plan, string id)
        {
            for (int i = 0; i < plan.Groups.Count; i++)
            {
                if (string.Equals(plan.Groups[i].Id, id, System.StringComparison.Ordinal))
                {
                    return plan.Groups[i];
                }
            }

            return null;
        }

        private static TileCoord? LandingTile(GameState s, IArrivalPlan plan, ArrivalSpec a, bool anyGroup)
        {
            if (a.Group == null)
            {
                return NearestFreeToHome(s, a);
            }

            TileCoord? own = FirstFree(s, a, FindGroup(plan, a.Group)!.Tiles);
            if (own != null || !anyGroup)
            {
                return own;
            }

            for (int i = 0; i < plan.Groups.Count; i++)
            {
                if (plan.Groups[i].Slot == a.Slot)
                {
                    TileCoord? other = FirstFree(s, a, plan.Groups[i].Tiles);
                    if (other != null)
                    {
                        return other;
                    }
                }
            }

            return null;
        }

        private static TileCoord? FirstFree(GameState s, ArrivalSpec a, ImmArray<TileCoord> tiles)
        {
            for (int i = 0; i < tiles.Count; i++)
            {
                if (IsFree(s, a, tiles[i]))
                {
                    return tiles[i];
                }
            }

            return null;
        }

        /// <summary>Land-passable for every unit, no enemy unit on it, and not inside an enemy base (its core or a building).</summary>
        private static bool IsFree(GameState s, ArrivalSpec a, TileCoord tile)
        {
            if (!s.InBounds(tile))
            {
                return false;
            }

            for (int i = 0; i < a.Units.Count; i++)
            {
                if (TerrainInfo.EntryCost(s.TerrainAt(tile), RoleIds.MoveClassOf(a.Units[i].Role)) == 0)
                {
                    return false;
                }
            }

            return !CommandEngine.IsBlockedFor(s, a.Slot, tile) && !InEnemyFootprint(s, a.Slot, tile);
        }

        private static bool InEnemyFootprint(GameState s, int slot, TileCoord tile)
        {
            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                Base b = s.BaseTable[i];
                if (b.Owner == slot)
                {
                    continue;
                }

                for (int k = 0; k < b.Buildings.Count; k++)
                {
                    if (b.Buildings[k].Pos == tile)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static TileCoord? NearestFreeToHome(GameState s, ArrivalSpec a)
        {
            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                if (s.BaseTable[i].Owner != a.Slot)
                {
                    continue;
                }

                TileCoord home = s.BaseTable[i].Pos;
                int reach = s.Width > s.Height ? s.Width : s.Height;
                for (int r = 0; r <= reach; r++)
                {
                    TileCoord? found = FirstFreeInRing(s, a, home, r);
                    if (found != null)
                    {
                        return found;
                    }
                }

                return null;
            }

            return null;
        }

        private static TileCoord? FirstFreeInRing(GameState s, ArrivalSpec a, TileCoord home, int r)
        {
            for (int y = home.Y - r; y <= home.Y + r; y++)
            {
                for (int x = home.X - r; x <= home.X + r; x++)
                {
                    var t = new TileCoord(x, y);
                    if (t.DistanceTo(home) == r && IsFree(s, a, t))
                    {
                        return t;
                    }
                }
            }

            return null;
        }

        private static GameState Land(GameState state, ArrivalSpec a, TileCoord tile, List<GameEvent> events)
        {
            GameState s = state;
            var created = new List<int>();
            for (int g = 0; g < a.Units.Count; g++)
            {
                ArrivalUnit group = a.Units[g];
                for (int n = 0; n < group.Count; n++)
                {
                    s = GameFactory.AddUnit(s, a.Slot, group.Role, group.Level, tile, out int id);
                    created.Add(id);
                    events.Add(new UnitSpawned(id, a.Slot, group.Role, group.Level, tile, UnitSpawned.CauseArrival));
                }
            }

            return a.AttachToFirstCommander ? AttachToCommander(s, created) : s;
        }

        /// <summary>Carriable units attach to the first commander up to its capacity; the overflow stands unattached on the same tile.</summary>
        private static GameState AttachToCommander(GameState state, List<int> created)
        {
            GameState s = state;
            Unit? commander = null;
            for (int i = 0; i < created.Count && commander == null; i++)
            {
                Unit u = s.UnitTable[s.FindUnitIndex(created[i])];
                commander = u.Role == UnitRole.Commander ? u : null;
            }

            if (commander == null)
            {
                return s;
            }

            int room = commander.Level * CarryPerCommanderLevel;
            for (int i = 0; i < created.Count && room > 0; i++)
            {
                Unit u = s.UnitTable[s.FindUnitIndex(created[i])];
                if (CanBeCarried(u.Role))
                {
                    s = s.WithUnit(u with { Leader = commander.Id });
                    room--;
                }
            }

            return s;
        }

        /// <summary>A commander carries military units and founders (GDD 7.2); scouts travel alone.</summary>
        private static bool CanBeCarried(UnitRole role) => RecruitRules.IsMilitary(role) || role == UnitRole.Founder;
    }
}
