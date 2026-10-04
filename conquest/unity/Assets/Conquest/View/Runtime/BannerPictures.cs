using System.Collections.Generic;
using Conquest.Presentation;
using Conquest.Unity.Art;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// A banner picture prepared for a longer beam: the same atlas pixels as a sliced sprite whose middle band is
    /// the beam (found by <see cref="BannerArtProfile"/> on the picture's real alpha), pivot at the bottom centre.
    /// Drawn with <see cref="SpriteDrawMode.Sliced"/> and a taller size, only the beam stretches.
    /// </summary>
    public sealed class BannerPicture
    {
        public BannerPicture(Sprite sliced, BannerArtProfile? profile, int groundFromBottomPx)
        {
            Sprite = sliced;
            Profile = profile;
            GroundFromBottomPx = groundFromBottomPx;
        }

        public Sprite Sprite { get; }

        public BannerArtProfile? Profile { get; }

        /// <summary>The picture's ground point (its original pivot) above its bottom edge, in art pixels.</summary>
        public int GroundFromBottomPx { get; }

        public int Width => Mathf.RoundToInt(Sprite.rect.width);

        public int Height => Mathf.RoundToInt(Sprite.rect.height);

        /// <summary>Art pixels from the cloth's lower edge to the ground point (the drawn beam); 0 when there is no beam.</summary>
        public int DrawnBeamPx => Profile != null ? Height - Profile.ClothBottom - GroundFromBottomPx : 0;

        /// <summary>Art pixels above the beam: the cloth, and a hologram card when there is one.</summary>
        public int ClothPx => Profile != null ? Profile.ClothBottom : Height;

        public bool CanStretch => Profile != null;
    }

    /// <summary>Makes and caches <see cref="BannerPicture"/>s. Reading a picture's alpha goes through the GPU (the atlas is not CPU-readable).</summary>
    public sealed class BannerPictures
    {
        private readonly Dictionary<Sprite, BannerPicture> cache = new Dictionary<Sprite, BannerPicture>();
        private readonly int ppu;

        public BannerPictures(int pixelsPerUnit)
        {
            ppu = pixelsPerUnit;
        }

        public int Probed { get; private set; }

        public int ProbeFailures { get; private set; }

        public BannerPicture Get(Sprite source)
        {
            if (cache.TryGetValue(source, out BannerPicture? hit)) return hit;
            BannerArtProfile? profile = Probe(source);
            Rect rect = source.rect;
            Vector4 border = profile != null ? new Vector4(0f, profile.BottomBorder, 0f, profile.TopBorder) : Vector4.zero;
            Sprite sliced = Sprite.Create(source.texture, rect, new Vector2(0.5f, 0f), ppu, 0, SpriteMeshType.FullRect, border);
            sliced.name = source.name + " (beam)";
            sliced.hideFlags = HideFlags.HideAndDontSave;
            var picture = new BannerPicture(sliced, profile, Mathf.RoundToInt(source.pivot.y));
            cache[source] = picture;
            return picture;
        }

        private BannerArtProfile? Probe(Sprite source)
        {
            Probed++;
            byte[]? alpha = ReadAlphaTopDown(source, out int width, out int height);
            BannerArtProfile? profile = alpha != null ? BannerArtProfile.Analyze(width, height, alpha) : null;
            if (profile == null) ProbeFailures++;
            return profile;
        }

        /// <summary>The alpha channel of a sprite's rectangle, top row first, read back from a GPU copy.</summary>
        public static byte[]? ReadAlphaTopDown(Sprite sprite, out int width, out int height)
        {
            Texture2D texture = sprite.texture;
            Rect r = sprite.rect;
            width = Mathf.RoundToInt(r.width);
            height = Mathf.RoundToInt(r.height);
            if (texture == null || width <= 0 || height <= 0) return null;
            RenderTexture rt = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            RenderTexture previous = RenderTexture.active;
            var scale = new Vector2(r.width / texture.width, r.height / texture.height);
            var offset = new Vector2(r.x / texture.width, r.y / texture.height);
            Graphics.Blit(texture, rt, scale, offset);
            RenderTexture.active = rt;
            var read = new Texture2D(width, height, TextureFormat.RGBA32, false, true);
            read.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            read.Apply(false);
            RenderTexture.active = previous;
            RenderTexture.ReleaseTemporary(rt);
            Color32[] pixels = read.GetPixels32();
            ViewUtil.Destroy(read);
            var alpha = new byte[width * height];
            for (int y = 0; y < height; y++)
            {
                int source = (height - 1 - y) * width; // Unity rows run bottom-up
                for (int x = 0; x < width; x++) alpha[y * width + x] = pixels[source + x].a;
            }

            return alpha;
        }
    }
}
