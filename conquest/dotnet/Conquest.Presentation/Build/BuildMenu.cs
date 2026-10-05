using System;
using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>One line of the build panel: a building role, what it costs and whether it can be ordered now.</summary>
    public sealed class BuildEntry
    {
        public BuildEntry(BuildingRole role, ResourceVector cost, ResourceVector shortfall, string? disabledReason, int siteCount)
        {
            Role = role;
            RoleId = RoleIds.Of(role);
            Cost = cost;
            Shortfall = shortfall;
            DisabledReason = disabledReason;
            SiteCount = siteCount;
        }

        public BuildingRole Role { get; }

        /// <summary>The catalogue role id, for example <c>bld.food</c>.</summary>
        public string RoleId { get; }

        /// <summary>The level-1 price from the rule table.</summary>
        public ResourceVector Cost { get; }

        /// <summary>How much of each resource the base is short of; zero when it can pay.</summary>
        public ResourceVector Shortfall { get; }

        /// <summary>An <c>err.*</c> code that explains why the role cannot be ordered now; null when it can.</summary>
        public string? DisabledReason { get; }

        /// <summary>How many tiles the core accepts for this role (0 when disabled for another reason).</summary>
        public int SiteCount { get; }

        public bool Enabled => DisabledReason == null;
    }

    /// <summary>
    /// The build panel's facts, all from the core: prices come from <see cref="RuleTables"/>; whether a site is legal comes
    /// from a dry run of the real <see cref="BuildCommand"/>, so the panel can never disagree with the order.
    /// </summary>
    public static class BuildMenu
    {
        private static readonly BuildingRole[] Roles = (BuildingRole[])Enum.GetValues(typeof(BuildingRole));

        public static IReadOnlyList<BuildingRole> AllRoles => Roles;

        /// <summary>One entry per building role the rules know, in the rule table's order. Empty for a base that is not the slot's.</summary>
        public static IReadOnlyList<BuildEntry> Entries(GameState state, TurnServices services, int baseId, int slot)
        {
            int index = state.FindBaseIndex(baseId);
            if (index < 0 || state.BaseTable[index].Owner != slot) return Array.Empty<BuildEntry>();
            Base b = state.BaseTable[index];
            var entries = new List<BuildEntry>(Roles.Length);
            foreach (BuildingRole role in Roles)
            {
                ResourceVector cost = RuleTables.BuildingCost(role, 1);
                ResourceVector shortfall = Shortfall(b.Stock, cost);
                if (!b.Stock.Covers(cost))
                {
                    entries.Add(new BuildEntry(role, cost, shortfall, Err.NotEnoughResources, 0));
                    continue;
                }

                IReadOnlyList<GridPos> sites = Sites(state, services, baseId, slot, role);
                string? reason = null;
                if (sites.Count == 0) reason = NoSiteReason(state, services, b, slot, role);
                entries.Add(new BuildEntry(role, cost, shortfall, reason, sites.Count));
            }

            return entries;
        }

        /// <summary>Why no tile works for an affordable role: the core's own answer for the first tile of the area.</summary>
        private static string NoSiteReason(GameState state, TurnServices services, Base b, int slot, BuildingRole role)
        {
            string? reason = null;
            foreach (GridPos tile in Area(state, b))
            {
                string? err = Check(state, services, baseId: b.Id, slot, role, tile);
                if (err == null) return Err.IllegalSite;
                if (err == Err.DuplicateBuilding || err == Err.NeedsWater) return err;
                reason = reason ?? err;
            }

            return reason ?? Err.IllegalSite;
        }

        /// <summary>Null when the core would accept the order; otherwise its <c>err.*</c> code.</summary>
        public static string? Check(GameState state, TurnServices services, int baseId, int slot, BuildingRole role, GridPos at)
        {
            CommandResult dry = CommandEngine.Apply(state, new BuildCommand(slot, baseId, role, new TileCoord(at.X, at.Y)), services);
            return dry.Ok ? null : dry.Error ?? Err.IllegalSite;
        }

        /// <summary>Every tile the core accepts for the role, nearest to the base first (then by row, then column).</summary>
        public static IReadOnlyList<GridPos> Sites(GameState state, TurnServices services, int baseId, int slot, BuildingRole role)
        {
            int index = state.FindBaseIndex(baseId);
            if (index < 0) return Array.Empty<GridPos>();
            Base b = state.BaseTable[index];
            var sites = new List<GridPos>();
            foreach (GridPos tile in Area(state, b))
            {
                if (Check(state, services, baseId, slot, role, tile) == null) sites.Add(tile);
            }

            return sites;
        }

        /// <summary>The first site of <see cref="Sites"/>, or null when there is none.</summary>
        public static GridPos? NearestSite(GameState state, TurnServices services, int baseId, int slot, BuildingRole role)
        {
            IReadOnlyList<GridPos> sites = Sites(state, services, baseId, slot, role);
            return sites.Count == 0 ? (GridPos?)null : sites[0];
        }

        /// <summary>The tiles around a base the panel may try, ordered by distance. The core decides which are legal.</summary>
        private static List<GridPos> Area(GameState state, Base b)
        {
            int radius = b.CoreLevel + 1;
            var tiles = new List<GridPos>();
            for (int dy = -radius; dy <= radius; dy++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    var tile = new TileCoord(b.Pos.X + dx, b.Pos.Y + dy);
                    if (state.InBounds(tile) && tile != b.Pos) tiles.Add(new GridPos(tile.X, tile.Y));
                }
            }

            tiles.Sort((l, r) =>
            {
                int dl = Math.Max(Math.Abs(l.X - b.Pos.X), Math.Abs(l.Y - b.Pos.Y));
                int dr = Math.Max(Math.Abs(r.X - b.Pos.X), Math.Abs(r.Y - b.Pos.Y));
                int byDistance = dl.CompareTo(dr);
                return byDistance != 0 ? byDistance : l.CompareTo(r);
            });
            return tiles;
        }

        private static ResourceVector Shortfall(ResourceVector stock, ResourceVector cost) =>
            new ResourceVector(
                Math.Max(0, cost.Basic - stock.Basic),
                Math.Max(0, cost.Hard - stock.Hard),
                Math.Max(0, cost.Coin - stock.Coin),
                Math.Max(0, cost.Wares - stock.Wares),
                Math.Max(0, cost.Food - stock.Food),
                Math.Max(0, cost.Pop - stock.Pop));
    }
}
