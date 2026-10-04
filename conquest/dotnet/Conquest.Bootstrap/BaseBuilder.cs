using System;
using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Bootstrap
{
    /// <summary>
    /// Spec 06 H2: creates the pre-placed bases in list order (core, buildings, stock, people, attached garrison and commander,
    /// <c>site_id</c>) and seeds the intel records. A base the play rules would refuse is a boot error with the JSON path.
    /// </summary>
    internal static class BaseBuilder
    {
        public const string OwnerOnly = "owner_only";
        public const string AllPositionOnly = "all_position_only";
        public const string AllFull = "all_full";

        public static GameState Place(GameState state, ScenarioData s, List<BootError> errors)
        {
            GameState g = state;
            for (int i = 0; i < s.PrePlacedBases.Count; i++)
            {
                string path = "/pre_placed_bases/" + i;
                try
                {
                    g = PlaceOne(g, s.PrePlacedBases[i], path, errors);
                }
                catch (ArgumentException ex)
                {
                    errors.Add(new BootError(path, "err.boot_base", ex.Message));
                }
            }

            return g;
        }

        public static ResourceVector Stock(StockData data, int pop, bool includePopFromData)
        {
            int people = includePopFromData ? data.Get("res.pop") : pop;
            return new ResourceVector(data.Get("res.basic"), data.Get("res.hard"), data.Get("res.coin"), data.Get("res.wares"), data.Get("res.food"), people);
        }

        private static GameState PlaceOne(GameState state, PrePlacedBase b, string path, List<BootError> errors)
        {
            if (!SlotNames.TryParse(b.Owner, out int owner))
            {
                errors.Add(new BootError(path, "err.boot_slot", "bad owner '" + b.Owner + "'"));
                return state;
            }

            var anchor = new TileCoord(b.Anchor.X, b.Anchor.Y);
            GameState g = GameFactory.AddBase(state, owner, anchor, b.CoreLevel, Stock(b.Stock, b.Pop, false), b.SiteId, out int baseId);
            for (int k = 0; k < b.Buildings.Count; k++)
            {
                BuildingPlacement p = b.Buildings[k];
                if (!RoleIds.TryParse(p.Role, out BuildingRole role))
                {
                    errors.Add(new BootError(path + "/buildings/" + k, "err.boot_role", "bad building role '" + p.Role + "'"));
                    continue;
                }

                g = GameFactory.AddBuilding(g, baseId, role, p.Level, new TileCoord(p.At.X, p.At.Y));
            }

            return AddGarrison(g, b, owner, anchor, baseId, path, errors);
        }

        private static GameState AddGarrison(GameState state, PrePlacedBase b, int owner, TileCoord anchor, int baseId, string path, List<BootError> errors)
        {
            GameState g = state;
            for (int k = 0; k < b.Garrison.Count; k++)
            {
                UnitGroup u = b.Garrison[k];
                if (!RoleIds.TryParse(u.Role, out UnitRole role))
                {
                    errors.Add(new BootError(path + "/garrison/" + k, "err.boot_role", "bad unit role '" + u.Role + "'"));
                    continue;
                }

                for (int n = 0; n < u.Count; n++)
                {
                    g = GameFactory.AddUnit(g, owner, role, u.Level, anchor, baseId, 0, out _);
                }
            }

            if (b.CommanderLevel.HasValue)
            {
                g = GameFactory.AddUnit(g, owner, UnitRole.Commander, b.CommanderLevel.Value, anchor, baseId, 0, out _);
            }

            return g;
        }

        /// <summary>Intel records for every other slot, per base: nothing, position only, or position with level and fort count.</summary>
        public static GameState SeedIntel(GameState state, ScenarioData s)
        {
            GameState g = state;
            var records = new List<IntelRecord>();
            for (int slot = 0; slot < g.SlotCount; slot++)
            {
                for (int i = 0; i < g.BaseTable.Count; i++)
                {
                    Base b = g.BaseTable[i];
                    string seed = SeedFor(s, b.SiteId);
                    if (b.Owner != slot && seed != OwnerOnly)
                    {
                        bool full = seed == AllFull;
                        records.Add(new IntelRecord(slot, b.Id, b.SiteId, b.Pos, b.Owner, full ? b.CoreLevel : -1, full ? Forts(b) : -1, -1));
                    }
                }
            }

            return g with { Intel = ImmArray<IntelRecord>.From(records) };
        }

        private static string SeedFor(ScenarioData s, string? siteId)
        {
            foreach (PrePlacedBase p in s.PrePlacedBases)
            {
                if (string.Equals(p.SiteId, siteId, StringComparison.Ordinal))
                {
                    return p.IntelSeed;
                }
            }

            return OwnerOnly;
        }

        private static int Forts(Base b)
        {
            int count = 0;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (b.Buildings[i].Role == BuildingRole.Garrison)
                {
                    count++;
                }
            }

            return count;
        }
    }
}
