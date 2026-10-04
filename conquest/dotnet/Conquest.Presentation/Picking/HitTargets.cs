using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>
    /// Minimum pointer targets and the measurements of the polish round. A banner smaller on screen than the
    /// minimum gets a larger, invisible hit rectangle around its centre (the picture is unchanged). Touch uses 44 CSS
    /// pixels (WCAG 2.5.5 and the platform guidelines), a mouse 24 (WCAG 2.5.8).
    /// </summary>
    public static class HitTargets
    {
        public const int TouchMinCssPx = 44;
        public const int MouseMinCssPx = 24;

        /// <summary>CSS (density-independent) pixels are 160 dpi on Android, 96 on the desktop web: device px = css x dpi / 160.</summary>
        public const int CssDpi = 160;

        /// <summary>Device pixels for a CSS length at a screen density; densities at or below 160 dpi count as 1:1.</summary>
        public static int DevicePx(int cssPx, int dpi)
        {
            if (cssPx < 0) throw new ArgumentOutOfRangeException(nameof(cssPx));
            int ratio = Math.Max(CssDpi, dpi);
            return (cssPx * ratio + CssDpi - 1) / CssDpi;
        }

        /// <summary>CSS pixels for a device length at a device-pixel ratio (permille, e.g. 2625 for a 412-dp-wide 1080 px phone).</summary>
        public static int CssPx(int devicePx, int dprPermille)
        {
            if (dprPermille <= 0) throw new ArgumentOutOfRangeException(nameof(dprPermille));
            return devicePx * 1000 / dprPermille;
        }

        public static int MinTargetPx(bool touch, int dpi) => DevicePx(touch ? TouchMinCssPx : MouseMinCssPx, dpi);

        /// <summary>Grows a rectangle around its centre to at least <paramref name="minSize"/> on each axis.</summary>
        public static PixelRect Inflate(PixelRect rect, int minSize)
        {
            if (minSize < 0) throw new ArgumentOutOfRangeException(nameof(minSize));
            int growX = Math.Max(0, minSize - rect.Width);
            int growY = Math.Max(0, minSize - rect.Height);
            return new PixelRect(rect.Left - growX / 2, rect.Top - growY / 2, rect.Right + growX - growX / 2, rect.Bottom + growY - growY / 2);
        }

        public static IReadOnlyList<BannerRect> Inflate(IReadOnlyList<BannerRect> rects, int minSize)
        {
            if (rects == null) throw new ArgumentNullException(nameof(rects));
            var result = new BannerRect[rects.Count];
            for (int i = 0; i < rects.Count; i++)
            {
                BannerRect r = rects[i];
                result[i] = new BannerRect(r.UnitId, r.Tile, Inflate(r.ScreenRect, minSize), r.SortKey);
            }

            return result;
        }

        /// <summary>Area shared by two rectangles (0 when apart).</summary>
        public static long OverlapArea(PixelRect a, PixelRect b)
        {
            long w = Math.Min(a.Right, b.Right) - Math.Max(a.Left, b.Left);
            long h = Math.Min(a.Bottom, b.Bottom) - Math.Max(a.Top, b.Top);
            return w > 0 && h > 0 ? w * h : 0;
        }

        /// <summary>
        /// Pairs (one from each list) whose overlap covers more than <paramref name="minPermilleOfSmaller"/> of the
        /// smaller rectangle. With the same list twice, each unordered pair counts once and a rectangle never meets itself.
        /// </summary>
        public static int CountOverlaps(IReadOnlyList<PixelRect> first, IReadOnlyList<PixelRect> second, int minPermilleOfSmaller)
        {
            if (first == null) throw new ArgumentNullException(nameof(first));
            if (second == null) throw new ArgumentNullException(nameof(second));
            bool same = ReferenceEquals(first, second);
            int count = 0;
            for (int i = 0; i < first.Count; i++)
            {
                for (int j = same ? i + 1 : 0; j < second.Count; j++)
                {
                    long smaller = Math.Min(Area(first[i]), Area(second[j]));
                    if (smaller <= 0) continue;
                    if (OverlapArea(first[i], second[j]) * 1000 > smaller * minPermilleOfSmaller) count++;
                }
            }

            return count;
        }

        private static long Area(PixelRect r) => (long)Math.Max(0, r.Width) * Math.Max(0, r.Height);
    }
}
