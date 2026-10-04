using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Json;
using Conquest.Core.Map;

namespace Conquest.Core.Save
{
    /// <summary>What the readers share: the map, the slot count and the error list, plus the common field readers.</summary>
    internal sealed class ReadContext
    {
        public ReadContext(GameMap map, int slots, List<SaveError> errors)
        {
            Map = map;
            Slots = slots;
            Errors = errors;
        }

        public GameMap Map { get; }

        public int Slots { get; }

        public List<SaveError> Errors { get; }

        public TileCoord Tile(ObjectView o)
        {
            int x = o.Int("x", 0, Map.Width - 1);
            int y = o.Int("y", 0, Map.Height - 1);
            return new TileCoord(x, y);
        }

        public UnitRole Role(ObjectView o, string key)
        {
            string id = o.Str(key);
            if (RoleIds.TryParse(id, out UnitRole role))
            {
                return role;
            }

            o.Fail(key, SaveFormat.BadValue, "unknown unit role '" + id + "'");
            return UnitRole.Scout;
        }

        public BuildingRole BuildingRole(ObjectView o)
        {
            string id = o.Str("role");
            if (RoleIds.TryParse(id, out BuildingRole role))
            {
                return role;
            }

            o.Fail("role", SaveFormat.BadValue, "unknown building role '" + id + "'");
            return Contracts.BuildingRole.Food;
        }

        public Resource Resource(ObjectView o, string key)
        {
            string id = o.Str(key);
            if (RoleIds.TryParse(id, out Resource resource))
            {
                return resource;
            }

            o.Fail(key, SaveFormat.BadValue, "unknown resource '" + id + "'");
            return Contracts.Resource.Basic;
        }

        public ResourceVector Vector(JsonArray? a)
        {
            if (a == null || a.Count != 6)
            {
                Errors.Add(new SaveError(a?.Pointer ?? string.Empty, SaveFormat.BadShape, "a stock has six integers"));
                return ResourceVector.Zero;
            }

            var v = new int[6];
            for (int i = 0; i < 6; i++)
            {
                if (a[i] is JsonInt n && n.Value >= 0 && n.Value <= int.MaxValue)
                {
                    v[i] = (int)n.Value;
                }
                else
                {
                    Errors.Add(new SaveError(a[i].Pointer, SaveFormat.BadValue, "a stock amount is a non-negative integer"));
                }
            }

            return new ResourceVector(v[0], v[1], v[2], v[3], v[4], v[5]);
        }

        public void Ascending(ObjectView o, int previous, int current)
        {
            if (current <= previous)
            {
                o.Fail("id", SaveFormat.BadOrder, "ids must be strictly ascending");
            }
        }
    }
}
