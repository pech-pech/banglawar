using Conquest.Core.Contracts;

namespace Conquest.Core.Map
{
    /// <summary>
    /// The terrain World: created once and shared by reference across all states (GDD 18). Immutable.
    /// Row-major, index = y * Width + x.
    /// </summary>
    public sealed class GameMap
    {
        public const int MaxSize = 256;

        private static readonly int[] StepDx = { 0, 1, 1, 1, 0, -1, -1, -1 };
        private static readonly int[] StepDy = { -1, -1, 0, 1, 1, 1, 0, -1 };

        private readonly Terrain[] _tiles;

        private GameMap(int width, int height, Terrain[] tiles)
        {
            Width = width;
            Height = height;
            _tiles = tiles;
            var bytes = new byte[tiles.Length + 2];
            bytes[0] = (byte)width;
            bytes[1] = (byte)height;
            for (int i = 0; i < tiles.Length; i++)
            {
                bytes[i + 2] = (byte)tiles[i];
            }

            Fingerprint = Fnv1a64.Hash(bytes);
        }

        /// <summary>FNV-1a-64 over size and terrain; part of the state hash so two different worlds never hash alike.</summary>
        public ulong Fingerprint { get; }

        public int Width { get; }

        public int Height { get; }

        /// <summary>The number of 8-way neighbour directions.</summary>
        public static int DirectionCount => 8;

        /// <summary>Creates a map from row-major terrain. The array is copied. Throws on a bad size (programming error).</summary>
        public static GameMap Create(int width, int height, Terrain[] tiles)
        {
            if (width < 1 || height < 1 || width > MaxSize || height > MaxSize)
            {
                throw new System.ArgumentOutOfRangeException(nameof(width), "Map size must be 1..256.");
            }

            if (tiles.Length != width * height)
            {
                throw new System.ArgumentException("Tile count does not match the size.", nameof(tiles));
            }

            return new GameMap(width, height, (Terrain[])tiles.Clone());
        }

        public bool InBounds(TileCoord c) => c.X >= 0 && c.Y >= 0 && c.X < Width && c.Y < Height;

        public int IndexOf(TileCoord c) => c.Y * Width + c.X;

        public TileCoord CoordOf(int index) => new TileCoord(IntMath.FloorMod(index, Width), IntMath.FloorDiv(index, Width));

        public Terrain TerrainAt(TileCoord c)
        {
            if (!InBounds(c))
            {
                throw new System.ArgumentOutOfRangeException(nameof(c));
            }

            return _tiles[IndexOf(c)];
        }

        /// <summary>The neighbour in a direction (0 = north, clockwise, 8-way) or false when it is off the map.</summary>
        public bool TryNeighbor(TileCoord c, int direction, out TileCoord neighbor)
        {
            neighbor = new TileCoord(c.X + StepDx[direction], c.Y + StepDy[direction]);
            return InBounds(neighbor);
        }

        /// <summary>True when any 8-way neighbour of the tile is water (a Dock needs water).</summary>
        public bool TouchesWater(TileCoord c)
        {
            for (int d = 0; d < DirectionCount; d++)
            {
                if (TryNeighbor(c, d, out TileCoord n) && TerrainInfo.IsWater(TerrainAt(n)))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
