using System;

namespace Conquest.Core.Contracts
{
    /// <summary>A tile position. X grows east, Y grows south. Order is (Y, X), the tie-break of spec 06 H0.2.</summary>
    public readonly struct TileCoord : IEquatable<TileCoord>, IComparable<TileCoord>
    {
        public TileCoord(int x, int y)
        {
            X = x;
            Y = y;
        }

        public int X { get; }

        public int Y { get; }

        /// <summary>Chebyshev distance: the number of 8-way steps between two tiles.</summary>
        public int DistanceTo(TileCoord other)
        {
            int dx = Math.Abs(X - other.X);
            int dy = Math.Abs(Y - other.Y);
            return dx > dy ? dx : dy;
        }

        public int CompareTo(TileCoord other)
        {
            int byY = Y.CompareTo(other.Y);
            return byY != 0 ? byY : X.CompareTo(other.X);
        }

        public bool Equals(TileCoord other) => X == other.X && Y == other.Y;

        public override bool Equals(object? obj) => obj is TileCoord other && Equals(other);

        public override int GetHashCode() => unchecked((X * 7919) ^ (Y * 104729));

        public static bool operator ==(TileCoord a, TileCoord b) => a.Equals(b);

        public static bool operator !=(TileCoord a, TileCoord b) => !a.Equals(b);

        public override string ToString() => "(" + X + "," + Y + ")";
    }
}
