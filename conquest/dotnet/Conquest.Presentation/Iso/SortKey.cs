using System;

namespace Conquest.Presentation
{
    /// <summary>
    /// Integer draw order. Terrain, props, structures and units share one Unity sorting layer and are ordered
    /// by depth (x + y of the front-most tile, which is screen y up to a constant), then by the layer's
    /// tiebreak from the asset manifest, then by the entry's sort bias. Fixed layers (ground, fx, overlay)
    /// use their own sorting layers and a plain order. The key fits Unity's 16-bit sortingOrder for maps
    /// up to 256 x 256.
    /// </summary>
    public static class SortKey
    {
        public const int DepthStride = 64;
        public const int MaxTiebreak = 5;
        public const int MaxBias = 9;
        public const int MaxDepth = 511;
        private const int TiebreakStride = 10;

        /// <summary>The tile that decides the sort of a w x h footprint anchored at origin: the one nearest the viewer.</summary>
        public static GridPos FrontTile(GridPos origin, int footprintWidth, int footprintHeight)
        {
            if (footprintWidth < 1 || footprintHeight < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(footprintWidth), "Footprint must be at least 1 x 1.");
            }

            return new GridPos(origin.X + footprintWidth - 1, origin.Y + footprintHeight - 1);
        }

        public static int Depth(GridPos tile) => tile.X + tile.Y;

        public static int ForDepthLayer(GridPos frontTile, int tiebreak, int bias)
        {
            if (frontTile.X < 0 || frontTile.Y < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(frontTile), "Tile must be on the map.");
            }

            int depth = Depth(frontTile);
            if (depth > MaxDepth)
            {
                throw new ArgumentOutOfRangeException(nameof(frontTile), "Map too large for a 16-bit sort key.");
            }

            if (tiebreak < 0 || tiebreak > MaxTiebreak || bias < 0 || bias > MaxBias)
            {
                throw new ArgumentOutOfRangeException(nameof(tiebreak), "Tiebreak 0..5 and bias 0..9.");
            }

            return depth * DepthStride + tiebreak * TiebreakStride + bias;
        }

        /// <summary>
        /// Key for a unit walking from one tile to the next. It switches to the destination's depth at the
        /// half-way point, so a unit passing a structure is hidden or shown at the right moment.
        /// </summary>
        public static int ForMoving(GridPos from, GridPos to, int progressPermille, int tiebreak, int bias)
        {
            return ForDepthLayer(progressPermille >= 500 ? to : from, tiebreak, bias);
        }

        public const int UnitTiebreak = 3;
        public const int MaxStackLayers = 7;

        /// <summary>
        /// Key for one banner of a stack: the unit layer of its tile, the front of the stack drawn last, and its
        /// hologram one step above its clay. Uses up to 15 above the unit tiebreak, still below the next depth row.
        /// </summary>
        public static int ForStackedUnit(GridPos tile, int depthInStack, bool hologram)
        {
            if (depthInStack < 0) throw new ArgumentOutOfRangeException(nameof(depthInStack));
            int layer = MaxStackLayers - Math.Min(depthInStack, MaxStackLayers);
            return ForDepthLayer(tile, UnitTiebreak, 0) + layer * 2 + (hologram ? 1 : 0);
        }

        /// <summary>Order inside a fixed sorting layer (ground, fx, overlay).</summary>
        public static int ForFixed(int order)
        {
            if (order < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(order));
            }

            return order;
        }
    }
}
