using System;

namespace Conquest.Core.Contracts
{
    /// <summary>Neutral terrain roles (GDD 2.1). Role ids: <see cref="RoleIds"/>.</summary>
    public enum Terrain
    {
        Deep = 0,
        Still = 1,
        River = 2,
        Open = 3,
        WoodA = 4,
        WoodB = 5,
        Rough = 6,
        Peak = 7,
    }

    public enum Resource
    {
        Basic = 0,
        Hard = 1,
        Coin = 2,
        Wares = 3,
        Food = 4,
        Pop = 5,
    }

    public enum BuildingRole
    {
        Food = 0,
        BasicExtractor = 1,
        HardExtractor = 2,
        CoinExtractor = 3,
        Converter = 4,
        Habitat = 5,
        Attractor = 6,
        ScoutPost = 7,
        Garrison = 8,
        Port = 9,
        Academy = 10,
    }

    public enum UnitRole
    {
        Scout = 0,
        Founder = 1,
        Commander = 2,
        Line = 3,
        Shock = 4,
        Ranged = 5,
        Transport = 6,
        Militia = 7,
    }

    /// <summary>Movement class of a unit role (spec 06 H3 <c>move_class</c>).</summary>
    public enum MoveClass
    {
        Land = 0,
        Water = 1,
    }

    /// <summary>Neutral role id strings (GDD 2.1) and their enum values. Strings compare ordinally only.</summary>
    public static class RoleIds
    {
        private static readonly string[] TerrainIds = { "t.deep", "t.still", "t.river", "t.open", "t.wood_a", "t.wood_b", "t.rough", "t.peak" };
        private static readonly string[] ResourceIds = { "res.basic", "res.hard", "res.coin", "res.wares", "res.food", "res.pop" };
        private static readonly string[] BuildingIds =
        {
            "bld.food", "bld.basic_extractor", "bld.hard_extractor", "bld.coin_extractor", "bld.converter",
            "bld.habitat", "bld.attractor", "bld.scout_post", "bld.garrison", "bld.port", "bld.academy",
        };

        private static readonly string[] UnitIds =
        {
            "u.scout", "u.founder", "u.commander", "u.line", "u.shock", "u.ranged", "u.transport", "u.militia",
        };

        public static string Of(Terrain value) => TerrainIds[(int)value];

        public static string Of(Resource value) => ResourceIds[(int)value];

        public static string Of(BuildingRole value) => BuildingIds[(int)value];

        public static string Of(UnitRole value) => UnitIds[(int)value];

        public static bool TryParse(string id, out Terrain value) => Find(TerrainIds, id, out int i) & Set(i, out value);

        public static bool TryParse(string id, out Resource value) => Find(ResourceIds, id, out int i) & Set(i, out value);

        public static bool TryParse(string id, out BuildingRole value) => Find(BuildingIds, id, out int i) & Set(i, out value);

        public static bool TryParse(string id, out UnitRole value) => Find(UnitIds, id, out int i) & Set(i, out value);

        private static bool Find(string[] ids, string id, out int index)
        {
            for (int i = 0; i < ids.Length; i++)
            {
                if (string.Equals(ids[i], id, StringComparison.Ordinal))
                {
                    index = i;
                    return true;
                }
            }

            index = -1;
            return false;
        }

        private static bool Set<T>(int index, out T value) where T : struct, Enum
        {
            value = index < 0 ? default : (T)Enum.ToObject(typeof(T), index);
            return index >= 0;
        }

        /// <summary>The movement class of a unit role: ships move on water, everything else on land.</summary>
        public static MoveClass MoveClassOf(UnitRole role) => role == UnitRole.Transport ? MoveClass.Water : MoveClass.Land;
    }
}
