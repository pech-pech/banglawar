using System;

namespace Conquest.Presentation
{
    /// <summary>Where the ground overlay (path dots, hover and selection rings) and the banners are drawn.</summary>
    public enum LayeringMode
    {
        /// <summary>C1: the slice as it was. Overlay at a fixed order above all depth-sorted art, banners included.</summary>
        OverlayOnTop = 0,

        /// <summary>C2: overlay sorted by its tile's depth, just above structures; tall art in front still covers it.</summary>
        OverlayInDepth = 1,

        /// <summary>C3: three bands. Terrain and structures, then the overlay, then the banners (depth-sorted among themselves).</summary>
        Bands = 2,
    }

    /// <summary>What kind of picture asks for an order.</summary>
    public enum DrawRole
    {
        Terrain = 0,
        Structure = 1,
        Overlay = 2,
        Banner = 3,
    }

    /// <summary>
    /// An effective draw position: a band (a Unity sorting group, or 0 for the shared world) and the order inside it.
    /// Larger draws later (in front). In Unity a band is a SortingGroup whose own order is <see cref="Band"/>; plain
    /// world renderers have band 0 and are compared by their order against the groups' orders.
    /// </summary>
    public readonly struct DrawKey : IComparable<DrawKey>
    {
        public DrawKey(int band, int order)
        {
            Band = band;
            Order = order;
        }

        /// <summary>0 = no group (the world); otherwise the sorting group's own order.</summary>
        public int Band { get; }

        public int Order { get; }

        /// <summary>The value compared against other top-level renderers: the group's order, or the renderer's own.</summary>
        public int Outer => Band == 0 ? Order : Band;

        public int CompareTo(DrawKey other)
        {
            int outer = Outer.CompareTo(other.Outer);
            if (outer != 0) return outer;
            if (Band != other.Band) return Band.CompareTo(other.Band); // a group draws after loose renderers of the same order
            return Order.CompareTo(other.Order);
        }

        public override string ToString() => Band == 0 ? "world " + Order : "band " + Band + "/" + Order;
    }

    /// <summary>
    /// Integer draw orders per <see cref="LayeringMode"/>. Depth keys come from <see cref="SortKey"/> (at most 32,699);
    /// the bands sit above that and below Unity's 16-bit limit.
    /// </summary>
    public static class DrawOrder
    {
        public const int LegacyOverlayOrder = 30000;
        public const int OverlayBand = 32740;
        public const int BannerBand = 32750;
        public const int OverlayTiebreak = 2;
        public const int OverlayBias = 9;

        /// <summary>Terrain and structure art: always the shared world, by depth.</summary>
        public static DrawKey World(int depthKey) => new DrawKey(0, depthKey);

        /// <summary>The structure tiebreak (above terrain 0, below units 3).</summary>
        public const int StructureTiebreak = 2;

        /// <summary>
        /// How many iso depth rows (x + y) in front of a structure a terrain tile may be and still draw BEHIND it. A tree crown
        /// is tall, so a wood tile one or two rows nearer the viewer used to hide a founded base completely. 3 rows covers
        /// the crowns of the shipped art; anything nearer than that still hides the structure (a forest in front of it).
        /// </summary>
        public const int StructureDepthLift = 3;

        /// <summary>
        /// Sort key of a structure (base core, building). In <see cref="LayeringMode.Bands"/> (the default) the structure sorts as if
        /// it stood <see cref="StructureDepthLift"/> rows nearer, so terrain and tree crowns up to that many rows in front draw under
        /// it; structures keep their order among themselves (all lifted by the same amount), units and banners are unaffected
        /// (banners sit in their own band above, units use the unit tiebreak and are not lifted). Other layering modes keep the plain key.
        /// </summary>
        public static int Structure(LayeringMode mode, GridPos frontTile)
        {
            int lift = mode == LayeringMode.Bands ? StructureDepthLift : 0;
            return SortKey.ForDepth(Math.Min(SortKey.MaxDepth, SortKey.Depth(frontTile) + lift), StructureTiebreak, 0);
        }

        /// <summary>A ground overlay piece (path dot, ring) on a tile; <paramref name="layer"/> separates pieces on one tile (0..9).</summary>
        public static DrawKey Overlay(LayeringMode mode, GridPos tile, int layer)
        {
            if (layer < 0 || layer > SortKey.MaxBias) throw new ArgumentOutOfRangeException(nameof(layer));
            switch (mode)
            {
                case LayeringMode.OverlayOnTop: return new DrawKey(0, LegacyOverlayOrder + layer);
                case LayeringMode.OverlayInDepth: return new DrawKey(0, SortKey.ForDepthLayer(tile, OverlayTiebreak, Math.Min(SortKey.MaxBias, OverlayBias - 5 + layer / 2)));
                case LayeringMode.Bands: return new DrawKey(OverlayBand, layer);
                default: throw new ArgumentOutOfRangeException(nameof(mode));
            }
        }

        /// <summary>A banner with its depth key (<see cref="SortKey.ForDepthLayer"/> with the unit tiebreak).</summary>
        public static DrawKey Banner(LayeringMode mode, int bannerDepthKey) =>
            mode == LayeringMode.Bands ? new DrawKey(BannerBand, bannerDepthKey) : new DrawKey(0, bannerDepthKey);

        /// <summary>The sorting group order the view gives a band's root, or null when the mode does not use that band.</summary>
        public static int? GroupOrder(LayeringMode mode, DrawRole role)
        {
            if (mode != LayeringMode.Bands) return null;
            switch (role)
            {
                case DrawRole.Overlay: return OverlayBand;
                case DrawRole.Banner: return BannerBand;
                default: return null;
            }
        }
    }
}
