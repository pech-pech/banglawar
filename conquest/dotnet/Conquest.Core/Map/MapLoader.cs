using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Json;

namespace Conquest.Core.Map
{
    public sealed record MapError(string Pointer, string Message);

    public sealed class MapLoadResult
    {
        private MapLoadResult(GameMap? map, ImmArray<MapError> errors)
        {
            Map = map;
            Errors = errors;
        }

        public bool Ok => Map != null;

        public GameMap? Map { get; }

        public ImmArray<MapError> Errors { get; }

        public static MapLoadResult Success(GameMap map) => new MapLoadResult(map, ImmArray<MapError>.Empty);

        public static MapLoadResult Failure(ImmArray<MapError> errors) => new MapLoadResult(null, errors);
    }

    /// <summary>
    /// Loads <c>{"version":1,"width":W,"height":H,"rows":["..."]}</c>. Legend: <c>~</c> deep, <c>-</c> still, <c>=</c> river,
    /// <c>.</c> open, <c>f</c> wood_a, <c>j</c> wood_b, <c>h</c> rough, <c>M</c> peak. Never throws for bad data.
    /// </summary>
    public static class MapLoader
    {
        public const int CurrentVersion = 1;
        private const string Legend = "~-=.fjhM";

        public static MapLoadResult Parse(string json)
        {
            JsonParseResult parsed = StrictJson.Parse(json);
            if (!parsed.Ok)
            {
                JsonError e = parsed.Error!;
                return Fail(e.Pointer, e.Message + " (line " + e.Line + ", column " + e.Column + ")");
            }

            if (!(parsed.Root is JsonObject root))
            {
                return Fail("", "The map file must be a JSON object.");
            }

            var errors = new List<MapError>();
            for (int i = 0; i < root.Count; i++)
            {
                string key = root.KeyAt(i);
                if (key != "version" && key != "width" && key != "height" && key != "rows")
                {
                    errors.Add(new MapError(root.ValueAt(i).Pointer, "Unknown key '" + key + "'."));
                }
            }

            long version = ReadInt(root, "version", errors);
            long width = ReadInt(root, "width", errors);
            long height = ReadInt(root, "height", errors);
            if (version != CurrentVersion && errors.Count == 0)
            {
                errors.Add(new MapError("/version", "Unsupported version " + version + "."));
            }

            if (errors.Count == 0 && (width < 1 || width > GameMap.MaxSize || height < 1 || height > GameMap.MaxSize))
            {
                errors.Add(new MapError("/width", "Width and height must be 1..256."));
            }

            Terrain[]? tiles = errors.Count == 0 ? ReadRows(root, (int)width, (int)height, errors) : null;
            if (errors.Count > 0 || tiles == null)
            {
                return MapLoadResult.Failure(ImmArray<MapError>.From(errors));
            }

            return MapLoadResult.Success(GameMap.Create((int)width, (int)height, tiles));
        }

        private static MapLoadResult Fail(string pointer, string message) =>
            MapLoadResult.Failure(ImmArray<MapError>.Of(new MapError(pointer, message)));

        private static long ReadInt(JsonObject root, string key, List<MapError> errors)
        {
            if (!root.TryGet(key, out JsonValue v))
            {
                errors.Add(new MapError("/" + key, "Missing '" + key + "'."));
                return 0;
            }

            if (v is JsonInt i)
            {
                return i.Value;
            }

            errors.Add(new MapError(v.Pointer, "'" + key + "' must be an integer."));
            return 0;
        }

        private static Terrain[]? ReadRows(JsonObject root, int width, int height, List<MapError> errors)
        {
            if (!root.TryGet("rows", out JsonValue rowsValue))
            {
                errors.Add(new MapError("/rows", "Missing 'rows'."));
                return null;
            }

            if (!(rowsValue is JsonArray rows))
            {
                errors.Add(new MapError(rowsValue.Pointer, "'rows' must be an array."));
                return null;
            }

            if (rows.Count != height)
            {
                errors.Add(new MapError(rows.Pointer, "Expected " + height + " rows but found " + rows.Count + "."));
                return null;
            }

            var tiles = new Terrain[width * height];
            for (int y = 0; y < height; y++)
            {
                if (!(rows[y] is JsonString row))
                {
                    errors.Add(new MapError(rows[y].Pointer, "A row must be a string."));
                    continue;
                }

                if (row.Value.Length != width)
                {
                    errors.Add(new MapError(row.Pointer, "Expected " + width + " characters but found " + row.Value.Length + "."));
                    continue;
                }

                for (int x = 0; x < width; x++)
                {
                    int idx = Legend.IndexOf(row.Value[x]);
                    if (idx < 0)
                    {
                        errors.Add(new MapError(row.Pointer, "Unknown tile character '" + row.Value[x] + "' at column " + x + "."));
                        continue;
                    }

                    tiles[y * width + x] = (Terrain)idx;
                }
            }

            return errors.Count == 0 ? tiles : null;
        }
    }
}
