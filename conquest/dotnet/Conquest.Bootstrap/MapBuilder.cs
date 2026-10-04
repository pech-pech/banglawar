using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Bootstrap
{
    /// <summary>Terrain rows and legend of the scenario to a <see cref="GameMap"/>.</summary>
    internal static class MapBuilder
    {
        public static GameMap? Build(MapData map, List<BootError> errors)
        {
            var tiles = new Terrain[map.Width * map.Height];
            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    string? role = map.TerrainAt(x, y);
                    if (role == null || !RoleIds.TryParse(role, out Terrain terrain))
                    {
                        errors.Add(new BootError("/map/rows/" + y, "err.boot_terrain", "unknown terrain at (" + x + ", " + y + ")"));
                        return null;
                    }

                    tiles[(y * map.Width) + x] = terrain;
                }
            }

            return GameMap.Create(map.Width, map.Height, tiles);
        }
    }
}
