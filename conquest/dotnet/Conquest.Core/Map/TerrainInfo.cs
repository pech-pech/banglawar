using Conquest.Core.Contracts;

namespace Conquest.Core.Map
{
    /// <summary>
    /// Terrain rules (GDD 5.1). Costs are the ASSUMED movement table (02 G2): grass 1, forest 2, jungle 3, hills 3,
    /// mountains 4, river 1, ship on ocean 1. Land units cannot enter ocean or lake; ships move only on ocean.
    /// </summary>
    public static class TerrainInfo
    {
        /// <summary>Whole-point cost of entering a tile, or 0 when the class cannot enter it.</summary>
        public static int EntryCost(Terrain terrain, MoveClass moveClass)
        {
            if (moveClass == MoveClass.Water)
            {
                return terrain == Terrain.Deep ? 1 : 0;
            }

            switch (terrain)
            {
                case Terrain.Open: return 1;
                case Terrain.River: return 1;
                case Terrain.WoodA: return 2;
                case Terrain.WoodB: return 3;
                case Terrain.Rough: return 3;
                case Terrain.Peak: return 4;
                default: return 0;
            }
        }

        public static bool IsLand(Terrain terrain) => EntryCost(terrain, MoveClass.Land) > 0;

        public static bool IsWater(Terrain terrain) => terrain == Terrain.Deep || terrain == Terrain.Still || terrain == Terrain.River;

        /// <summary>Flat land where a Colony Center or buildings may stand ("nothing can be built on hills or mountains").</summary>
        public static bool IsBuildable(Terrain terrain) => terrain == Terrain.Open || terrain == Terrain.WoodA || terrain == Terrain.WoodB;
    }
}
