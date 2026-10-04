using System;
using Conquest.Core;

namespace Conquest.Presentation
{
    /// <summary>
    /// 2:1 isometric projection with integer math. The point of a tile is its centre. World pixels grow right
    /// and DOWN (the Unity layer flips y and divides by pixels-per-unit). Defaults match the asset manifest:
    /// 256 x 128 pixel tiles.
    /// </summary>
    public sealed class IsoProjection
    {
        public const int DefaultTileWidth = 256;
        public const int DefaultTileHeight = 128;

        public int TileWidth { get; }
        public int TileHeight { get; }
        public int HalfWidth { get; }
        public int HalfHeight { get; }

        public IsoProjection() : this(DefaultTileWidth, DefaultTileHeight)
        {
        }

        public IsoProjection(int tileWidth, int tileHeight)
        {
            if (tileWidth <= 0 || tileHeight <= 0 || IntMath.FloorMod(tileWidth, 2) != 0 || IntMath.FloorMod(tileHeight, 2) != 0)
            {
                throw new ArgumentException("Tile width and height must be positive even integers.");
            }

            TileWidth = tileWidth;
            TileHeight = tileHeight;
            HalfWidth = tileWidth / 2;
            HalfHeight = tileHeight / 2;
        }

        /// <summary>Centre of the tile in world pixels.</summary>
        public PixelPoint GridToWorld(GridPos tile)
        {
            return new PixelPoint((tile.X - tile.Y) * HalfWidth, (tile.X + tile.Y) * HalfHeight);
        }

        /// <summary>
        /// A point part-way between two tile centres (progress 0..1000), for walking units. Progress outside
        /// the range is clamped. Rounds toward negative infinity so the result is the same on every runtime.
        /// </summary>
        public PixelPoint GridToWorld(GridPos from, GridPos to, int progressPermille)
        {
            int p = Math.Max(0, Math.Min(1000, progressPermille));
            PixelPoint a = GridToWorld(from);
            PixelPoint b = GridToWorld(to);
            return new PixelPoint(
                a.X + IntMath.FloorDiv((b.X - a.X) * p, 1000),
                a.Y + IntMath.FloorDiv((b.Y - a.Y) * p, 1000));
        }

        /// <summary>
        /// The tile whose diamond contains the world point. Exact inverse of GridToWorld for every tile centre.
        /// A point exactly on a shared edge belongs to the tile with the larger x (or y).
        /// </summary>
        public GridPos WorldToGrid(PixelPoint world)
        {
            int half = HalfWidth * HalfHeight;
            int denominator = 2 * half;
            int x = IntMath.FloorDiv(world.X * HalfHeight + world.Y * HalfWidth + half, denominator);
            int y = IntMath.FloorDiv(world.Y * HalfWidth - world.X * HalfHeight + half, denominator);
            return new GridPos(x, y);
        }

        public bool IsInside(GridPos tile, int mapWidth, int mapHeight)
        {
            return tile.X >= 0 && tile.Y >= 0 && tile.X < mapWidth && tile.Y < mapHeight;
        }

        /// <summary>
        /// The smallest block of tiles (clamped to the map) that can touch the world rectangle, widened by
        /// extraTiles on every side so tall sprites that overhang their tile are not culled early.
        /// Returns null when the rectangle misses the map. Used to pool and cull tile views.
        /// </summary>
        public GridRange? VisibleTiles(PixelRect world, int mapWidth, int mapHeight, int extraTiles)
        {
            if (mapWidth <= 0 || mapHeight <= 0 || extraTiles < 0)
            {
                throw new ArgumentException("Map size must be positive and extraTiles must not be negative.");
            }

            GridPos a = WorldToGrid(new PixelPoint(world.Left, world.Top));
            GridPos b = WorldToGrid(new PixelPoint(world.Right, world.Top));
            GridPos c = WorldToGrid(new PixelPoint(world.Left, world.Bottom));
            GridPos d = WorldToGrid(new PixelPoint(world.Right, world.Bottom));
            int minX = Math.Max(0, Math.Min(Math.Min(a.X, b.X), Math.Min(c.X, d.X)) - extraTiles);
            int maxX = Math.Min(mapWidth - 1, Math.Max(Math.Max(a.X, b.X), Math.Max(c.X, d.X)) + extraTiles);
            int minY = Math.Max(0, Math.Min(Math.Min(a.Y, b.Y), Math.Min(c.Y, d.Y)) - extraTiles);
            int maxY = Math.Min(mapHeight - 1, Math.Max(Math.Max(a.Y, b.Y), Math.Max(c.Y, d.Y)) + extraTiles);
            return minX > maxX || minY > maxY ? (GridRange?)null : new GridRange(minX, minY, maxX, maxY);
        }

        /// <summary>The bounding box of the whole map diamond in world pixels.</summary>
        public PixelRect MapBounds(int mapWidth, int mapHeight)
        {
            if (mapWidth <= 0 || mapHeight <= 0)
            {
                throw new ArgumentException("Map size must be positive.");
            }

            return new PixelRect(
                -mapHeight * HalfWidth,
                -HalfHeight,
                mapWidth * HalfWidth,
                (mapWidth + mapHeight - 1) * HalfHeight);
        }
    }
}
