using System.Collections.Generic;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Keeps the shore props (reeds, grass tufts) of the water tiles on the map's two upper borders inside the map. Reeds are
    /// part of a tile picture and stand taller than the tile's diamond, so on the NE row (y = 0) and the NW column (x = 0)
    /// they would stick out over the empty background. A <see cref="SpriteMask"/> per such tile keeps only the pixels below
    /// the border line; the SE and SW borders need nothing because pictures grow upwards. All tiles of a border share the one
    /// line, so the clipped pieces join without a seam. Pure geometry here; <see cref="TileLayer"/> attaches the masks.
    /// </summary>
    public sealed class BorderClip
    {
        public const int MaskWidth = 256;
        public const int MaskHeight = 512;

        private readonly Dictionary<int, Sprite> masks = new Dictionary<int, Sprite>();
        private readonly int pixelsPerUnit;
        private readonly int halfWidth;
        private readonly int halfHeight;

        public BorderClip(int pixelsPerUnit, int tileWidth = 256, int tileHeight = 128)
        {
            this.pixelsPerUnit = pixelsPerUnit;
            halfWidth = tileWidth / 2;
            halfHeight = tileHeight / 2;
        }

        public static bool OnNorthEastBorder(int tileY) => tileY == 0;

        public static bool OnNorthWestBorder(int tileX) => tileX == 0;

        /// <summary>
        /// True when the pixel at (localX, localYDown), measured from the tile's diamond centre with y growing downwards, is
        /// inside the map. The NE border line runs through the tile's top and right corners, the NW line through the top and left.
        /// </summary>
        public static bool KeepsPixel(int localX, int localYDown, bool northEast, bool northWest, int halfWidth, int halfHeight)
        {
            // y on the line is -halfHeight + x * halfHeight / halfWidth (NE) or -halfHeight - x * halfHeight / halfWidth (NW)
            long scaledY = (long)localYDown * halfWidth;
            long ne = -(long)halfHeight * halfWidth + (long)localX * halfHeight;
            long nw = -(long)halfHeight * halfWidth - (long)localX * halfHeight;
            if (northEast && scaledY < ne) return false;
            if (northWest && scaledY < nw) return false;
            return true;
        }

        /// <summary>A mask sprite for the given borders, centred on the tile's diamond centre (the tile pictures' pivot).</summary>
        public Sprite MaskFor(bool northEast, bool northWest)
        {
            int key = (northEast ? 1 : 0) | (northWest ? 2 : 0);
            if (masks.TryGetValue(key, out Sprite? cached)) return cached;
            var tex = new Texture2D(MaskWidth, MaskHeight, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, name = "BorderMask" + key };
            var pixels = new Color32[MaskWidth * MaskHeight];
            for (int y = 0; y < MaskHeight; y++)
            {
                int yDown = MaskHeight / 2 - y - 1; // texture rows run upwards
                for (int x = 0; x < MaskWidth; x++)
                {
                    bool keep = KeepsPixel(x - MaskWidth / 2, yDown, northEast, northWest, halfWidth, halfHeight);
                    pixels[y * MaskWidth + x] = keep ? new Color32(255, 255, 255, 255) : new Color32(0, 0, 0, 0);
                }
            }

            tex.SetPixels32(pixels);
            tex.Apply();
            Sprite sprite = Sprite.Create(tex, new Rect(0, 0, MaskWidth, MaskHeight), new Vector2(0.5f, 0.5f), pixelsPerUnit);
            masks[key] = sprite;
            return sprite;
        }

        /// <summary>Clips a tile renderer to the map if it stands on an upper border; returns true when a mask was attached.</summary>
        public bool Attach(SpriteRenderer renderer, int tileX, int tileY)
        {
            bool ne = OnNorthEastBorder(tileY);
            bool nw = OnNorthWestBorder(tileX);
            if (!ne && !nw) return false;
            var go = new GameObject("BorderMask");
            go.transform.SetParent(renderer.transform, false);
            SpriteMask mask = go.AddComponent<SpriteMask>();
            mask.sprite = MaskFor(ne, nw);
            mask.alphaCutoff = 0.5f;
            renderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
            return true;
        }
    }
}
