using System.Collections.Generic;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Placeholder and overlay pictures drawn in code (the art pipeline has no overlay or missing-tile pictures yet):
    /// a tile diamond, a diamond outline, a disc, a box, a shadow ellipse and a beam. Cached; never destroyed.
    /// </summary>
    public sealed class ProceduralSprites
    {
        private readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();
        private readonly int ppu;

        public ProceduralSprites(int pixelsPerUnit)
        {
            ppu = pixelsPerUnit;
        }

        /// <summary>A filled 2:1 diamond; the pivot is its centre. Used for tiles with no picture.</summary>
        public Sprite Diamond(Color fill, Color edge, int width = 256, int height = 128, int edgePx = 3)
        {
            return Get("diamond" + width + "x" + height + Hex(fill) + Hex(edge) + edgePx, width, height, new Vector2(0.5f, 0.5f), (x, y) =>
            {
                float d = DiamondDistance(x + 0.5f, y + 0.5f, width, height);
                if (d > 1f) return Color.clear;
                return d > 1f - edgePx * 2f / width ? edge : fill;
            });
        }

        /// <summary>The outline of a diamond only, for hover and markers.</summary>
        public Sprite DiamondOutline(Color edge, int width = 256, int height = 128, int edgePx = 6)
        {
            return Get("outline" + width + "x" + height + Hex(edge) + edgePx, width, height, new Vector2(0.5f, 0.5f), (x, y) =>
            {
                float d = DiamondDistance(x + 0.5f, y + 0.5f, width, height);
                return d <= 1f && d > 1f - edgePx * 2f / width ? edge : Color.clear;
            });
        }

        public Sprite Disc(Color fill, Color edge, int diameter = 48)
        {
            return Get("disc" + diameter + Hex(fill) + Hex(edge), diameter, diameter, new Vector2(0.5f, 0.5f), (x, y) =>
            {
                float r = diameter / 2f;
                float dx = x + 0.5f - r;
                float dy = y + 0.5f - r;
                float d = Mathf.Sqrt(dx * dx + dy * dy);
                if (d > r) return Color.clear;
                return d > r - 4f ? edge : fill;
            });
        }

        /// <summary>A plain building stand-in: a box with an outline, pivot near the bottom centre.</summary>
        public Sprite Box(Color fill, Color edge, int width = 112, int height = 112)
        {
            return Get("box" + width + "x" + height + Hex(fill) + Hex(edge), width, height, new Vector2(0.5f, 0.2f), (x, y) =>
            {
                bool border = x < 4 || y < 4 || x >= width - 4 || y >= height - 4;
                return border ? edge : fill;
            });
        }

        /// <summary>
        /// An honest building stand-in: a plain extruded clay block standing on a footprint of
        /// <paramref name="tilesWide"/> x <paramref name="tilesDeep"/> tiles (2:1 diamond base, inset), lit top, lighter
        /// left wall, darker right wall, a thin darker edge. Pivot is the footprint's centre on the ground.
        /// </summary>
        public Sprite ClayBlock(Color top, Color left, Color right, int tilesWide, int tilesDeep, int wallPx, int insetPermille)
        {
            int span = tilesWide + tilesDeep;
            float halfW = span * 64f * insetPermille / 1000f; // the footprint diamond is span x 128 wide, span x 64 tall
            float halfH = halfW / 2f;
            const int pad = 3;
            int width = Mathf.CeilToInt(halfW * 2f) + pad * 2;
            int height = Mathf.CeilToInt(halfH * 2f) + wallPx + pad * 2;
            float cx = width / 2f;
            float baseY = pad + halfH; // centre of the ground diamond, from the bottom
            float topY = baseY + wallPx;
            Color edge = Color.Lerp(right, Color.black, 0.35f);
            string key = "block" + tilesWide + "x" + tilesDeep + "w" + wallPx + "i" + insetPermille + Hex(top) + Hex(left) + Hex(right);
            return Get(key, width, height, new Vector2(0.5f, baseY / height), (x, y) =>
            {
                float px = x + 0.5f;
                float py = y + 0.5f;
                float dx = Mathf.Abs(px - cx) / halfW;
                if (dx > 1f) return Color.clear;
                float r = (1f - dx) * halfH; // vertical half-extent of the diamond at this column
                if (py < baseY - r || py > topY + r) return Color.clear;
                bool onTop = Mathf.Abs(py - topY) <= r;
                float outline = Mathf.Min(Mathf.Min(py - (baseY - r), topY + r - py), (1f - dx) * halfW);
                if (outline < 1.6f) return edge;
                if (onTop)
                {
                    float topEdge = r - Mathf.Abs(py - topY);
                    return topEdge < 1.6f ? Color.Lerp(top, edge, 0.6f) : top;
                }

                if (Mathf.Abs(px - cx) < 1f) return Color.Lerp(right, edge, 0.5f); // the front corner
                return px < cx ? left : right;
            });
        }

        /// <summary>A soft ground shadow under a banner; the pivot is its centre.</summary>
        public Sprite Shadow(int width = 96, int height = 40)
        {
            return Get("shadow" + width + "x" + height, width, height, new Vector2(0.5f, 0.5f), (x, y) =>
            {
                float nx = (x + 0.5f) / width * 2f - 1f;
                float ny = (y + 0.5f) / height * 2f - 1f;
                float d = nx * nx + ny * ny;
                return d >= 1f ? Color.clear : new Color(0f, 0f, 0f, 0.35f * (1f - d));
            });
        }

        /// <summary>A thin vertical bar with its pivot at the bottom centre: the hologram beam.</summary>
        public Sprite Beam(Color color, int width = 6, int height = 128)
        {
            return Get("beam" + width + "x" + height + Hex(color), width, height, new Vector2(0.5f, 0f), (x, y) =>
            {
                float fade = 1f - (float)y / height;
                return new Color(color.r, color.g, color.b, color.a * (0.35f + 0.65f * fade));
            });
        }

        private Sprite Get(string key, int width, int height, Vector2 pivot, System.Func<int, int, Color> paint)
        {
            if (cache.TryGetValue(key, out Sprite? sprite) && sprite != null) return sprite;
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                name = key,
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                hideFlags = HideFlags.HideAndDontSave,
            };
            var pixels = new Color32[width * height];
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++) pixels[y * width + x] = paint(x, y);
            }

            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            Sprite created = Sprite.Create(texture, new Rect(0, 0, width, height), pivot, ppu);
            created.name = key;
            created.hideFlags = HideFlags.HideAndDontSave;
            cache[key] = created;
            return created;
        }

        private static float DiamondDistance(float x, float y, int width, int height) =>
            Mathf.Abs(x / width - 0.5f) * 2f + Mathf.Abs(y / height - 0.5f) * 2f;

        private static string Hex(Color c) => ColorUtility.ToHtmlStringRGBA(c);
    }
}
