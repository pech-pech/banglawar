using System.Collections.Generic;

namespace Conquest.Content.Model
{
    /// <summary>A tile coordinate: x grows east (column), y grows south (row), both 0-based.</summary>
    public readonly struct TilePoint
    {
        public TilePoint(int x, int y)
        {
            X = x;
            Y = y;
        }

        public int X { get; }

        public int Y { get; }

        public override string ToString()
        {
            return "[" + X + ", " + Y + "]";
        }
    }

    /// <summary>One map character: the rules terrain role plus the art look that decides which picture is drawn.</summary>
    public sealed class LegendEntry
    {
        public LegendEntry(char symbol, string terrain, string look)
        {
            Symbol = symbol;
            Terrain = terrain;
            Look = look;
        }

        public char Symbol { get; }

        /// <summary>Neutral terrain role id, for example <c>t.open</c>. Maps to the core terrain table.</summary>
        public string Terrain { get; }

        /// <summary>Art look id, for example <c>paddy_water</c>. Never read by rules.</summary>
        public string Look { get; }
    }

    public sealed class MapData
    {
        public MapData(int width, int height, IReadOnlyList<LegendEntry> legend, IReadOnlyList<string> rows)
        {
            Width = width;
            Height = height;
            Legend = legend;
            Rows = rows;
        }

        public int Width { get; }

        public int Height { get; }

        public IReadOnlyList<LegendEntry> Legend { get; }

        /// <summary>Height strings of Width characters; row 0 is the north edge.</summary>
        public IReadOnlyList<string> Rows { get; }

        public LegendEntry? FindLegend(char symbol)
        {
            foreach (LegendEntry entry in Legend)
            {
                if (entry.Symbol == symbol)
                {
                    return entry;
                }
            }

            return null;
        }

        public bool Contains(int x, int y)
        {
            return x >= 0 && y >= 0 && x < Width && y < Height;
        }

        /// <summary>The terrain role at a tile, or null when the tile is outside the map or unmapped.</summary>
        public string? TerrainAt(int x, int y)
        {
            if (!Contains(x, y) || y >= Rows.Count || x >= Rows[y].Length)
            {
                return null;
            }

            return FindLegend(Rows[y][x])?.Terrain;
        }
    }

    public sealed class RectData
    {
        public RectData(int x, int y, int width, int height)
        {
            X = x;
            Y = y;
            Width = width;
            Height = height;
        }

        public int X { get; }

        public int Y { get; }

        public int Width { get; }

        public int Height { get; }
    }

    public sealed class RegionData
    {
        public RegionData(string id, IReadOnlyList<RectData> rects)
        {
            Id = id;
            Rects = rects;
        }

        public string Id { get; }

        public IReadOnlyList<RectData> Rects { get; }
    }

    public sealed class EntryGroupData
    {
        public EntryGroupData(string id, string slot, IReadOnlyList<TilePoint> tiles)
        {
            Id = id;
            Slot = slot;
            Tiles = tiles;
        }

        public string Id { get; }

        public string Slot { get; }

        public IReadOnlyList<TilePoint> Tiles { get; }
    }
}
