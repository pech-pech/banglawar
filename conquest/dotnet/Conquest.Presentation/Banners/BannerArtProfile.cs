using System;

namespace Conquest.Presentation
{
    /// <summary>
    /// Where a banner picture can be stretched to make its beam longer: the longest run of rows, below the cloth,
    /// that are only as wide as the beam itself (within a few pixels of the narrowest row). Rows count from the top.
    /// Stretching only those rows lengthens the beam without touching the cloth, the hologram card or the ground mark.
    /// </summary>
    public sealed class BannerArtProfile
    {
        public const int AlphaThreshold = 60;
        public const int BeamWidthTolerance = 1;
        public const int MinBandRows = 3;
        public const int MinBeamWidth = 8;
        public const int SearchFromPermille = 300;
        public const int SearchToPermille = 850;

        private BannerArtProfile(int width, int height, int bandTop, int bandBottom, int beamWidth, int clothBottom)
        {
            Width = width;
            Height = height;
            BandTop = bandTop;
            BandBottom = bandBottom;
            BeamWidth = beamWidth;
            ClothBottom = clothBottom;
        }

        /// <summary>
        /// The row just below the cloth: going up from the band, the first row at least twice the beam's width is the
        /// cloth's lowest row. Between it and the band the beam may taper (the art draws a short collar there).
        /// </summary>
        public int ClothBottom { get; }

        public int Width { get; }

        public int Height { get; }

        /// <summary>First beam-only row (inclusive), counted from the top.</summary>
        public int BandTop { get; }

        /// <summary>Row after the last beam-only row (exclusive).</summary>
        public int BandBottom { get; }

        public int BeamWidth { get; }

        public int BandRows => BandBottom - BandTop;

        /// <summary>Rows above the band (cloth and anything above it), for a sliced sprite's top border.</summary>
        public int TopBorder => BandTop;

        /// <summary>Rows below the band (ground mark), for a sliced sprite's bottom border.</summary>
        public int BottomBorder => Height - BandBottom;

        /// <summary>
        /// Finds the beam band in an alpha image (row-major, top row first). Returns null when there is no band of at
        /// least <see cref="MinBandRows"/> rows between 30 and 85 percent of the picture's height.
        /// </summary>
        public static BannerArtProfile? Analyze(int width, int height, byte[] alphaTopDown)
        {
            if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width));
            if (alphaTopDown == null) throw new ArgumentNullException(nameof(alphaTopDown));
            if (alphaTopDown.Length < width * height) throw new ArgumentException("Alpha buffer is smaller than width x height.", nameof(alphaTopDown));

            int[] widths = new int[height];
            for (int y = 0; y < height; y++) widths[y] = RowWidth(alphaTopDown, width, y);

            // The ground mark (shadow, ring) tapers to a point at the very bottom; search only the middle of the picture.
            int start = height * SearchFromPermille / 1000;
            int end = height * SearchToPermille / 1000;
            int widest = 0;
            foreach (int w in widths) widest = Math.Max(widest, w);

            // Runs of rows of (nearly) constant width: the cloth is one, the beam another. The beam is the narrowest
            // run of at least MinBandRows rows that is at most half as wide as the widest row; ties go to the longer.
            int bestTop = -1;
            int bestLength = 0;
            int bestWidth = int.MaxValue;
            int y0 = start;
            while (y0 < end)
            {
                if (widths[y0] < MinBeamWidth)
                {
                    y0++;
                    continue;
                }

                int low = widths[y0];
                int high = widths[y0];
                int y1 = y0 + 1;
                while (y1 < end && widths[y1] >= MinBeamWidth && Math.Max(high, widths[y1]) - Math.Min(low, widths[y1]) <= BeamWidthTolerance)
                {
                    low = Math.Min(low, widths[y1]);
                    high = Math.Max(high, widths[y1]);
                    y1++;
                }

                int length = y1 - y0;
                bool beamLike = length >= MinBandRows && high * 2 <= widest;
                if (beamLike && (low < bestWidth || (low == bestWidth && length > bestLength)))
                {
                    bestTop = y0;
                    bestLength = length;
                    bestWidth = low;
                }

                y0 = y1;
            }

            if (bestTop < 0) return null;
            int clothBottom = bestTop;
            while (clothBottom > 0 && widths[clothBottom - 1] < bestWidth * 2) clothBottom--;
            return new BannerArtProfile(width, height, bestTop, bestTop + bestLength, bestWidth, clothBottom);
        }

        /// <summary>Opaque extent of a row: rightmost minus leftmost covered column plus one (0 when empty).</summary>
        private static int RowWidth(byte[] alpha, int width, int y)
        {
            int left = -1;
            int right = -1;
            int row = y * width;
            for (int x = 0; x < width; x++)
            {
                if (alpha[row + x] < AlphaThreshold) continue;
                if (left < 0) left = x;
                right = x;
            }

            return left < 0 ? 0 : right - left + 1;
        }
    }
}
