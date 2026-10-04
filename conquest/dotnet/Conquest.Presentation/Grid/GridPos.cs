using System;

namespace Conquest.Presentation
{
    /// <summary>A tile coordinate. x grows toward screen south-east, y toward screen south-west.</summary>
    public readonly struct GridPos : IEquatable<GridPos>, IComparable<GridPos>
    {
        public int X { get; }
        public int Y { get; }

        public GridPos(int x, int y)
        {
            X = x;
            Y = y;
        }

        public bool Equals(GridPos other) => X == other.X && Y == other.Y;

        public override bool Equals(object? obj) => obj is GridPos other && Equals(other);

        public override int GetHashCode() => unchecked((X * 397) ^ Y);

        /// <summary>Total order: row (y) first, then column (x). Used wherever a stable order is needed.</summary>
        public int CompareTo(GridPos other)
        {
            int byY = Y.CompareTo(other.Y);
            return byY != 0 ? byY : X.CompareTo(other.X);
        }

        public static bool operator ==(GridPos a, GridPos b) => a.Equals(b);

        public static bool operator !=(GridPos a, GridPos b) => !a.Equals(b);

        public override string ToString() => "(" + X + "," + Y + ")";
    }

    /// <summary>An integer point in projection pixels or screen pixels (y grows downward in both).</summary>
    public readonly struct PixelPoint : IEquatable<PixelPoint>
    {
        public int X { get; }
        public int Y { get; }

        public PixelPoint(int x, int y)
        {
            X = x;
            Y = y;
        }

        public bool Equals(PixelPoint other) => X == other.X && Y == other.Y;

        public override bool Equals(object? obj) => obj is PixelPoint other && Equals(other);

        public override int GetHashCode() => unchecked((X * 397) ^ Y);

        public static bool operator ==(PixelPoint a, PixelPoint b) => a.Equals(b);

        public static bool operator !=(PixelPoint a, PixelPoint b) => !a.Equals(b);

        public override string ToString() => "[" + X + "," + Y + "]";
    }

    /// <summary>An integer rectangle; Left/Top inclusive, Right/Bottom exclusive.</summary>
    public readonly struct PixelRect
    {
        public int Left { get; }
        public int Top { get; }
        public int Right { get; }
        public int Bottom { get; }

        public PixelRect(int left, int top, int right, int bottom)
        {
            Left = left;
            Top = top;
            Right = right;
            Bottom = bottom;
        }

        public int Width => Right - Left;

        public int Height => Bottom - Top;

        public bool Contains(int x, int y) => x >= Left && x < Right && y >= Top && y < Bottom;

        public override string ToString() => "[" + Left + "," + Top + " - " + Right + "," + Bottom + ")";
    }

    /// <summary>An inclusive block of tiles.</summary>
    public readonly struct GridRange
    {
        public int MinX { get; }
        public int MinY { get; }
        public int MaxX { get; }
        public int MaxY { get; }

        public GridRange(int minX, int minY, int maxX, int maxY)
        {
            MinX = minX;
            MinY = minY;
            MaxX = maxX;
            MaxY = maxY;
        }

        public int TileCount => (MaxX - MinX + 1) * (MaxY - MinY + 1);

        public bool Contains(GridPos tile) => tile.X >= MinX && tile.X <= MaxX && tile.Y >= MinY && tile.Y <= MaxY;
    }
}
