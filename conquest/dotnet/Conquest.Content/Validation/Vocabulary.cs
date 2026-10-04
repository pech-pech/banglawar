using System.Collections.Generic;

namespace Conquest.Content.Validation
{
    /// <summary>
    /// The closed sets of neutral ids that content may name (docs GDD 2.1, 05 section 2, 06 section 5). Role ids
    /// are ruleset-owned; this list is the content side's copy and is checked against the real ruleset once the
    /// rules loader exists. Numbers here (areas, caps, bounds) are ASSUMED values mirrored from the GDD tables.
    /// </summary>
    public static class Vocabulary
    {
        public const string Open = "t.open";
        public const string WoodA = "t.wood_a";
        public const string WoodB = "t.wood_b";
        public const string Rough = "t.rough";
        public const string Peak = "t.peak";
        public const string Deep = "t.deep";
        public const string Still = "t.still";
        public const string River = "t.river";

        public const string Core = "bld.core";
        public const string Garrison = "bld.garrison";
        public const string Port = "bld.port";
        public const string Academy = "bld.academy";
        public const string Habitat = "bld.habitat";
        public const string Food = "bld.food";

        public const string Founder = "u.founder";
        public const string Commander = "u.commander";
        public const string Transport = "u.transport";
        public const string Militia = "u.militia";

        public const string Population = "res.pop";

        public static readonly string[] Slots = { "f1", "f2", "f3", "f4", "f5", "f6" };

        public static readonly string[] Commodities = { "res.basic", "res.hard", "res.coin", "res.wares", "res.food" };

        public static readonly string[] Resources = { "res.basic", "res.hard", "res.coin", "res.wares", "res.food", "res.pop" };

        public static readonly string[] Buildings =
        {
            "bld.core", "bld.food", "bld.basic_extractor", "bld.hard_extractor", "bld.coin_extractor", "bld.converter",
            "bld.habitat", "bld.attractor", "bld.scout_post", "bld.garrison", "bld.port", "bld.academy",
        };

        public static readonly string[] Units =
        {
            "u.scout", "u.founder", "u.commander", "u.line", "u.shock", "u.ranged", "u.transport", "u.militia",
        };

        /// <summary>Roles a base may start with in its garrison (fighting units only).</summary>
        public static readonly string[] GarrisonUnits = { "u.line", "u.shock", "u.ranged" };

        public static readonly string[] Terrains = { Deep, Still, River, Open, WoodA, WoodB, Rough, Peak };

        public static readonly string[] Tags = { "capital", "fortress", "defence_zone", "garrison_town", "outpost" };

        public static readonly string[] IntelSeeds = { "owner_only", "all_position_only", "all_full" };

        public static readonly string[] Controls = { "human", "ai" };

        public static readonly string[] StartModes = { "entry_tiles", "pre_placed" };

        public static readonly string[] TimedEffectKinds = { "patron_link_cut", "panic_modifier" };

        public static readonly string[] PredicateKinds =
        {
            "all_of", "any_of", "not", "holds_site", "holds_sites_count", "initial_sites_held_at_most_pct", "base_count",
            "turn_at_least", "has_base", "has_unit_role",
        };

        public const int MaxPredicateDepth = 4;
        public const int MaxPredicateNodes = 32;

        public const int MinMapSide = 4;
        public const int MaxMapSide = 64;
        public const int MaxTurns = 400;
        public const int MaxStock = 999;
        public const int MinEntryDistanceToOpposingBase = 3;
        public const int MinBaseSpacing = 2;

        public static bool Contains(string[] set, string value)
        {
            return System.Array.IndexOf(set, value) >= 0;
        }

        /// <summary>Art look to the one terrain role it may sit on; water looks may sit on any water role.</summary>
        public static bool LookMatchesTerrain(string look, string terrain)
        {
            switch (look)
            {
                case "meadow":
                case "paddy_water":
                case "paddy_dense":
                case "stubble":
                    return terrain == Open;
                case "forest":
                    return terrain == WoodA;
                case "mangrove":
                    return terrain == WoodB;
                case "tea":
                    return terrain == Rough;
                case "high_hill":
                    return terrain == Peak;
                case "water":
                    return IsWater(terrain);
                default:
                    return false;
            }
        }

        public static bool IsKnownLook(string look)
        {
            return look == "meadow" || look == "paddy_water" || look == "paddy_dense" || look == "stubble" || look == "forest"
                || look == "mangrove" || look == "tea" || look == "high_hill" || look == "water";
        }

        public static bool IsWater(string terrain)
        {
            return terrain == Deep || terrain == Still || terrain == River;
        }

        /// <summary>Land units cannot stand on the great river or on wetland; they may cross a khal.</summary>
        public static bool IsLandPassable(string terrain)
        {
            return terrain != Deep && terrain != Still;
        }

        /// <summary>Terrain a building may stand on. The core needs flat open land; the ghat needs water.</summary>
        public static bool BuildingMayStandOn(string role, string terrain)
        {
            if (role == Core)
            {
                return terrain == Open;
            }

            if (role == Port)
            {
                return IsWater(terrain);
            }

            return terrain == Open || terrain == WoodA || terrain == WoodB;
        }

        public static int BuildingMaxLevel(string role)
        {
            return role == Academy ? 1 : 4;
        }

        public static int Footprint(string role)
        {
            return role == Garrison ? 2 : 1;
        }

        /// <summary>Base area radius in tiles: 5x5 at level 1, one ring more per level (GDD 8.1).</summary>
        public static int AreaRadius(int coreLevel)
        {
            return coreLevel + 1;
        }

        /// <summary>People a core of this level houses (GDD 8.3).</summary>
        public static int HousingOfLevel(int level)
        {
            switch (level)
            {
                case 1: return 100;
                case 2: return 300;
                case 3: return 600;
                default: return 1000;
            }
        }

        /// <summary>Units a garrison building of this level supports (GDD 8.3); a base with none supports a token guard.</summary>
        public static int GarrisonSupport(int garrisonLevel)
        {
            switch (garrisonLevel)
            {
                case 0: return 2;
                case 1: return 4;
                case 2: return 7;
                case 3: return 9;
                default: return 10;
            }
        }

        public static int FoodHousing(int level)
        {
            return 40 * level;
        }

        public static IReadOnlyList<string> AllRoles()
        {
            var all = new List<string>();
            all.AddRange(Resources);
            all.AddRange(Buildings);
            all.AddRange(Units);
            all.AddRange(Terrains);
            return all;
        }
    }
}
