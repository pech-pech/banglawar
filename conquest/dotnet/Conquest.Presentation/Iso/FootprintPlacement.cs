using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>
    /// How a structure picture with a footprint larger than its rule tile is put on the map. The scenario and the
    /// core give a base one anchor tile (the validator checks only that tile); the art of the base core is drawn for
    /// a 2 x 2 footprint. The three conventions differ in which tiles the picture covers.
    /// </summary>
    public enum AnchorConvention
    {
        /// <summary>C1: the anchor is the footprint's top-left (north) tile; the picture covers x..x+w-1, y..y+h-1.</summary>
        TopLeft = 0,

        /// <summary>C2: the anchor is the footprint's front (south) tile; the picture covers x-w+1..x, y-h+1..y.</summary>
        FrontTile = 1,

        /// <summary>C3: the anchor is the only tile, as in the rules; the picture is scaled down to fit one tile.</summary>
        RuleTileFitted = 2,
    }

    /// <summary>The tiles a structure picture covers and the scale it is drawn at.</summary>
    public readonly struct FootprintPlacementResult
    {
        public FootprintPlacementResult(GridPos origin, int width, int height, int scalePermille)
        {
            Origin = origin;
            Width = width;
            Height = height;
            ScalePermille = scalePermille;
        }

        /// <summary>Top-left (north) covered tile.</summary>
        public GridPos Origin { get; }

        public int Width { get; }

        public int Height { get; }

        public int ScalePermille { get; }

        /// <summary>The tile that decides the sort (the one nearest the viewer).</summary>
        public GridPos Front => SortKey.FrontTile(Origin, Width, Height);

        public IEnumerable<GridPos> Tiles()
        {
            for (int y = Origin.Y; y < Origin.Y + Height; y++)
            {
                for (int x = Origin.X; x < Origin.X + Width; x++) yield return new GridPos(x, y);
            }
        }

        /// <summary>The footprint's centre in world pixels (the picture's anchor point).</summary>
        public PixelPoint CentreWorld(IsoProjection iso)
        {
            if (iso == null) throw new ArgumentNullException(nameof(iso));
            int cx2 = 2 * Origin.X + Width - 1;
            int cy2 = 2 * Origin.Y + Height - 1;
            return new PixelPoint((cx2 - cy2) * iso.HalfWidth / 2, (cx2 + cy2) * iso.HalfHeight / 2);
        }
    }

    public static class FootprintPlacement
    {
        public static FootprintPlacementResult Place(GridPos anchor, int artWidth, int artHeight, AnchorConvention convention)
        {
            if (artWidth < 1 || artHeight < 1) throw new ArgumentOutOfRangeException(nameof(artWidth), "Footprint must be at least 1 x 1.");
            switch (convention)
            {
                case AnchorConvention.TopLeft: return new FootprintPlacementResult(anchor, artWidth, artHeight, 1000);
                case AnchorConvention.FrontTile:
                    return new FootprintPlacementResult(new GridPos(anchor.X - artWidth + 1, anchor.Y - artHeight + 1), artWidth, artHeight, 1000);
                case AnchorConvention.RuleTileFitted:
                    return new FootprintPlacementResult(anchor, 1, 1, 1000 / Math.Max(artWidth, artHeight));
                default: throw new ArgumentOutOfRangeException(nameof(convention));
            }
        }

        /// <summary>Covered tiles that lie outside a map of the given size.</summary>
        public static int OffMapTiles(FootprintPlacementResult placement, int mapWidth, int mapHeight)
        {
            int count = 0;
            foreach (GridPos t in placement.Tiles())
            {
                if (t.X < 0 || t.Y < 0 || t.X >= mapWidth || t.Y >= mapHeight) count++;
            }

            return count;
        }

        /// <summary>Covered tiles that another structure's rule tile also uses (the picture would hide it).</summary>
        public static int CoveredOthers(FootprintPlacementResult placement, GridPos ownAnchor, IEnumerable<GridPos> otherRuleTiles)
        {
            if (otherRuleTiles == null) throw new ArgumentNullException(nameof(otherRuleTiles));
            var covered = new HashSet<GridPos>(placement.Tiles());
            int count = 0;
            foreach (GridPos t in otherRuleTiles)
            {
                if (t != ownAnchor && covered.Contains(t)) count++;
            }

            return count;
        }
    }
}
