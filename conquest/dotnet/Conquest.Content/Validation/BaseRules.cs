using System;
using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>Placement and content rules for pre-placed bases (hook H2): the same legality as play, with a path for every failure.</summary>
    internal static class BaseRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            var sites = new HashSet<string>();
            var occupied = new Dictionary<long, string>();
            for (int i = 0; i < s.PrePlacedBases.Count; i++)
            {
                PrePlacedBase b = s.PrePlacedBases[i];
                string path = "$.pre_placed_bases[" + i + "]";
                CheckIdentity(s, b, path, sites, errors);
                CheckAnchor(s, b, i, path, occupied, errors);
                CheckBuildings(s, b, path, occupied, errors);
                CheckStock(b, path, errors);
                CheckGarrison(b, path, errors);
                CheckFlags(b, path, errors);
            }
        }

        private static long Key(int x, int y)
        {
            return ((long)x << 32) | (uint)y;
        }

        private static void CheckIdentity(ScenarioData s, PrePlacedBase b, string path, HashSet<string> sites, ErrorSink errors)
        {
            if (!b.SiteId.StartsWith("site.", StringComparison.Ordinal))
            {
                errors.Add(path + ".site_id", "base.site_id", "site ids start with 'site.'");
            }

            if (!sites.Add(b.SiteId))
            {
                errors.Add(path + ".site_id", "base.site_duplicate", "site id '" + b.SiteId + "' is used twice");
            }

            PlayerData? owner = EntryRules.FindPlayer(s, b.Owner);
            if (owner == null || owner.StartMode != "pre_placed")
            {
                errors.Add(path + ".owner", "base.owner", "owner '" + b.Owner + "' is not a player that starts with pre-placed bases");
            }
        }

        private static void CheckAnchor(ScenarioData s, PrePlacedBase b, int index, string path, Dictionary<long, string> occupied, ErrorSink errors)
        {
            TilePoint a = b.Anchor;
            string? terrain = s.Map.TerrainAt(a.X, a.Y);
            if (!s.Map.Contains(a.X, a.Y) || terrain == null)
            {
                errors.Add(path + ".anchor", "base.anchor_outside", "anchor " + a + " is outside the map");
                return;
            }

            if (!Vocabulary.BuildingMayStandOn(Vocabulary.Core, terrain))
            {
                errors.Add(path + ".anchor", "base.anchor_terrain", "a base core needs open flat land, not " + terrain);
            }

            for (int j = 0; j < index; j++)
            {
                TilePoint o = s.PrePlacedBases[j].Anchor;
                if (Math.Max(Math.Abs(o.X - a.X), Math.Abs(o.Y - a.Y)) < Vocabulary.MinBaseSpacing)
                {
                    errors.Add(path + ".anchor", "base.too_close", "anchor " + a + " is too close to " + s.PrePlacedBases[j].SiteId);
                }
            }

            if (!occupied.ContainsKey(Key(a.X, a.Y)))
            {
                occupied[Key(a.X, a.Y)] = b.SiteId + " core";
            }
            else
            {
                errors.Add(path + ".anchor", "base.building_overlap", "anchor " + a + " is already used by " + occupied[Key(a.X, a.Y)]);
            }
        }

        private static void CheckBuildings(ScenarioData s, PrePlacedBase b, string path, Dictionary<long, string> occupied, ErrorSink errors)
        {
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                BuildingPlacement bp = b.Buildings[i];
                string p = path + ".buildings[" + i + "]";
                if (!Vocabulary.Contains(Vocabulary.Buildings, bp.Role) || bp.Role == Vocabulary.Core)
                {
                    errors.Add(p + ".role", "base.building_role", "'" + bp.Role + "' is not a building a base can hold besides its core");
                    continue;
                }

                if (bp.Level > b.CoreLevel || bp.Level > Vocabulary.BuildingMaxLevel(bp.Role))
                {
                    errors.Add(p + ".level", "base.building_level",
                        "level " + bp.Level + " exceeds the core level " + b.CoreLevel + " or the building's own maximum");
                }

                CheckFootprint(s, b, bp, p, occupied, errors);
            }
        }

        private static void CheckFootprint(ScenarioData s, PrePlacedBase b, BuildingPlacement bp, string p, Dictionary<long, string> occupied, ErrorSink errors)
        {
            int size = Vocabulary.Footprint(bp.Role);
            int radius = Vocabulary.AreaRadius(b.CoreLevel);
            for (int dy = 0; dy < size; dy++)
            {
                for (int dx = 0; dx < size; dx++)
                {
                    int x = bp.At.X + dx;
                    int y = bp.At.Y + dy;
                    if (!s.Map.Contains(x, y))
                    {
                        errors.Add(p + ".at", "base.building_outside", "tile [" + x + ", " + y + "] is outside the map");
                        return;
                    }

                    if (Math.Max(Math.Abs(x - b.Anchor.X), Math.Abs(y - b.Anchor.Y)) > radius)
                    {
                        errors.Add(p + ".at", "base.building_area", "tile [" + x + ", " + y + "] lies outside the base area (radius " + radius + ")");
                        return;
                    }

                    string? terrain = s.Map.TerrainAt(x, y);
                    if (terrain == null || !Vocabulary.BuildingMayStandOn(bp.Role, terrain))
                    {
                        errors.Add(p + ".at", "base.building_terrain", bp.Role + " cannot stand on " + (terrain ?? "unmapped") + " at [" + x + ", " + y + "]");
                        return;
                    }

                    if (occupied.TryGetValue(Key(x, y), out string? other))
                    {
                        errors.Add(p + ".at", "base.building_overlap", "tile [" + x + ", " + y + "] is already used by " + other);
                        return;
                    }

                    occupied[Key(x, y)] = b.SiteId + " " + bp.Role;
                }
            }
        }

        private static void CheckStock(PrePlacedBase b, string path, ErrorSink errors)
        {
            foreach (ResourceAmount a in b.Stock.Amounts)
            {
                string p = path + ".stock." + a.Resource;
                if (!Vocabulary.Contains(Vocabulary.Commodities, a.Resource))
                {
                    errors.Add(p, "base.stock_resource", "'" + a.Resource + "' is not a stockable commodity (people go in 'pop')");
                }
                else if (a.Amount < 0 || a.Amount > Vocabulary.MaxStock)
                {
                    errors.Add(p, "base.stock_amount", "amount must be 0.." + Vocabulary.MaxStock);
                }
            }

            int capacity = Vocabulary.HousingOfLevel(b.CoreLevel);
            foreach (BuildingPlacement bp in b.Buildings)
            {
                if (bp.Role == Vocabulary.Habitat)
                {
                    capacity += Vocabulary.HousingOfLevel(bp.Level);
                }
                else if (bp.Role == Vocabulary.Food)
                {
                    capacity += Vocabulary.FoodHousing(bp.Level);
                }
            }

            if (b.Pop > capacity)
            {
                errors.Add(path + ".pop", "base.pop_capacity", "pop " + b.Pop + " is more than the base can house (" + capacity + ")");
            }
        }

        private static void CheckGarrison(PrePlacedBase b, string path, ErrorSink errors)
        {
            int total = 0;
            for (int i = 0; i < b.Garrison.Count; i++)
            {
                UnitGroup u = b.Garrison[i];
                if (!Vocabulary.Contains(Vocabulary.GarrisonUnits, u.Role))
                {
                    errors.Add(path + ".garrison[" + i + "].role", "base.garrison_role", "'" + u.Role + "' cannot start in a garrison");
                }

                total += u.Count;
            }

            int garrisonLevel = 0;
            foreach (BuildingPlacement bp in b.Buildings)
            {
                if (bp.Role == Vocabulary.Garrison)
                {
                    garrisonLevel = Math.Max(garrisonLevel, bp.Level);
                }
            }

            int cap = Vocabulary.GarrisonSupport(garrisonLevel);
            if (total > cap)
            {
                errors.Add(path + ".garrison", "base.garrison_cap", total + " units exceed the support of " + cap);
            }
        }

        private static void CheckFlags(PrePlacedBase b, string path, ErrorSink errors)
        {
            if (b.Tags.Count == 0)
            {
                errors.Add(path + ".tags", "base.tags_empty", "give the site at least one tag");
            }

            for (int i = 0; i < b.Tags.Count; i++)
            {
                if (!Vocabulary.Contains(Vocabulary.Tags, b.Tags[i]))
                {
                    errors.Add(path + ".tags[" + i + "]", "base.tag", "unknown tag '" + b.Tags[i] + "'");
                }
            }

            if (b.RealPlace && b.RaidCanDestroy)
            {
                errors.Add(path + ".raid_can_destroy", "base.raid_destroy", "a real_place site is captured, never destroyed: set raid_can_destroy false");
            }

            if (!Vocabulary.Contains(Vocabulary.IntelSeeds, b.IntelSeed))
            {
                errors.Add(path + ".intel_seed", "base.intel_seed", "unknown intel seed '" + b.IntelSeed + "'");
            }
        }
    }
}
