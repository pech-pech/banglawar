using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>A floating banner's hit area in screen pixels, supplied by the view each frame.</summary>
    public readonly struct BannerRect
    {
        public int UnitId { get; }
        public GridPos Tile { get; }
        public PixelRect ScreenRect { get; }
        public int SortKey { get; }

        public BannerRect(int unitId, GridPos tile, PixelRect screenRect, int sortKey)
        {
            UnitId = unitId;
            Tile = tile;
            ScreenRect = screenRect;
            SortKey = sortKey;
        }
    }

    /// <summary>Which unit and tile are under the pointer. Tile is null when the pointer is off the map.</summary>
    public readonly struct PickResult
    {
        public GridPos? Tile { get; }
        public int? UnitId { get; }

        public PickResult(GridPos? tile, int? unitId)
        {
            Tile = tile;
            UnitId = unitId;
        }

        public static PickResult Nothing => new PickResult(null, null);
    }

    /// <summary>Which unit stands on a tile (the core's occupancy, behind a small adapter).</summary>
    public interface ITileOccupancy
    {
        int? UnitAt(GridPos tile);
    }

    public static class TilePicker
    {
        /// <summary>
        /// Banners win over terrain (they float above their tile): the front-most banner (highest sort key,
        /// then lowest unit id) containing the pointer. Otherwise the tile under the pointer, and the unit
        /// standing on it, if any.
        /// </summary>
        public static PickResult Pick(
            CameraModel camera,
            IsoProjection iso,
            int mapWidth,
            int mapHeight,
            int screenX,
            int screenY,
            IReadOnlyList<BannerRect> banners,
            ITileOccupancy occupancy)
        {
            if (camera == null) throw new ArgumentNullException(nameof(camera));
            if (iso == null) throw new ArgumentNullException(nameof(iso));
            if (banners == null) throw new ArgumentNullException(nameof(banners));
            if (occupancy == null) throw new ArgumentNullException(nameof(occupancy));

            bool found = false;
            BannerRect best = default;
            for (int i = 0; i < banners.Count; i++)
            {
                BannerRect banner = banners[i];
                if (!banner.ScreenRect.Contains(screenX, screenY))
                {
                    continue;
                }

                if (!found || banner.SortKey > best.SortKey || (banner.SortKey == best.SortKey && banner.UnitId < best.UnitId))
                {
                    best = banner;
                    found = true;
                }
            }

            if (found)
            {
                return new PickResult(best.Tile, best.UnitId);
            }

            GridPos tile = iso.WorldToGrid(camera.ScreenToWorld(screenX, screenY));
            if (!iso.IsInside(tile, mapWidth, mapHeight))
            {
                return PickResult.Nothing;
            }

            return new PickResult(tile, occupancy.UnitAt(tile));
        }
    }
}
