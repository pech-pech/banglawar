using System;
using Conquest.Core;

namespace Conquest.Presentation
{
    /// <summary>How several banners on one tile are shown.</summary>
    public enum StackStyle
    {
        /// <summary>C1: up to four side by side across the tile, lead in the middle; more than four get a "+n" badge.</summary>
        RowFan = 0,

        /// <summary>C2: the lead banner in front, up to three others peeking out behind it, a count badge for two or more.</summary>
        LeadPeek = 1,

        /// <summary>C3: up to six on an arc over the tile, drawn smaller from three on; a badge only above six.</summary>
        ArcFan = 2,
    }

    /// <summary>Where one banner of a stack goes, relative to the tile centre (world pixels, y down).</summary>
    public readonly struct StackSlot
    {
        public StackSlot(int offsetX, int offsetY, int scalePermille, bool visible, int depth)
        {
            OffsetX = offsetX;
            OffsetY = offsetY;
            ScalePermille = scalePermille;
            Visible = visible;
            Depth = depth;
        }

        public int OffsetX { get; }

        public int OffsetY { get; }

        /// <summary>Extra scale on top of the banner's class scale.</summary>
        public int ScalePermille { get; }

        public bool Visible { get; }

        /// <summary>0 is the front-most (drawn last); larger numbers are further back.</summary>
        public int Depth { get; }
    }

    /// <summary>
    /// Pure layout of a stack of banners. Slot 0 is always the lead (the selected unit when it is in the stack,
    /// otherwise the largest class, then the lowest id; see <see cref="UnitStack"/>). Offsets are in world pixels and
    /// are scaled by the caller's class scale through <paramref name="bannerWidthPx"/>.
    /// </summary>
    public static class StackLayout
    {
        public const int RowStepPermilleOfWidth = 620;
        public const int PeekStepXPermilleOfWidth = 300;
        public const int PeekStepYPermilleOfWidth = 220;
        public const int PeekShrinkPermille = 60;
        public const int ArcCompactScale = 820;
        public const int ArcRisePx = 26;
        public const int BackRowRisePx = 8;

        public static int MaxVisible(StackStyle style)
        {
            switch (style)
            {
                case StackStyle.RowFan: return 4;
                case StackStyle.LeadPeek: return 4;
                case StackStyle.ArcFan: return 6;
                default: throw new ArgumentOutOfRangeException(nameof(style));
            }
        }

        /// <summary>Whether a count badge is drawn for a stack of <paramref name="count"/> units.</summary>
        public static bool ShowsBadge(StackStyle style, int count)
        {
            if (count < 0) throw new ArgumentOutOfRangeException(nameof(count));
            switch (style)
            {
                case StackStyle.LeadPeek: return count >= 2;
                case StackStyle.RowFan:
                case StackStyle.ArcFan: return count > MaxVisible(style);
                default: throw new ArgumentOutOfRangeException(nameof(style));
            }
        }

        /// <summary>The number the badge shows: the hidden count ("+n") for the fans, the whole stack for the lead-and-peek style.</summary>
        public static int BadgeNumber(StackStyle style, int count)
        {
            if (!ShowsBadge(style, count)) return 0;
            return style == StackStyle.LeadPeek ? count : count - MaxVisible(style);
        }

        public static StackSlot[] Arrange(StackStyle style, int count, int bannerWidthPx, int tileWidthPx)
        {
            if (count < 0) throw new ArgumentOutOfRangeException(nameof(count));
            if (bannerWidthPx <= 0 || tileWidthPx <= 0) throw new ArgumentOutOfRangeException(nameof(bannerWidthPx));
            var slots = new StackSlot[count];
            if (count == 0) return slots;
            if (count == 1)
            {
                slots[0] = new StackSlot(0, 0, 1000, true, 0);
                return slots;
            }

            switch (style)
            {
                case StackStyle.RowFan: Row(slots, bannerWidthPx); break;
                case StackStyle.LeadPeek: Peek(slots, bannerWidthPx); break;
                case StackStyle.ArcFan: Arc(slots, bannerWidthPx, tileWidthPx); break;
                default: throw new ArgumentOutOfRangeException(nameof(style));
            }

            return slots;
        }

        /// <summary>
        /// Lead on the tile centre, then right, left, right: 0, +1, -1, +2 (an even row leans right by one step, so the
        /// lead and its selection ring stay on the tile). Back banners sit a little higher.
        /// </summary>
        private static void Row(StackSlot[] slots, int width)
        {
            int visible = Math.Min(slots.Length, MaxVisible(StackStyle.RowFan));
            int step = width * RowStepPermilleOfWidth / 1000;
            for (int i = 0; i < slots.Length; i++)
            {
                if (i >= visible)
                {
                    slots[i] = new StackSlot(0, 0, 1000, false, i);
                    continue;
                }

                int side = i == 0 ? 0 : (IntMath.FloorMod(i, 2) == 1 ? (i + 1) / 2 : -(i / 2));
                int depth = Math.Abs(side) * 2 - (side > 0 ? 1 : 0);
                slots[i] = new StackSlot(side * step, -Math.Abs(side) * BackRowRisePx, 1000, true, Math.Max(0, depth));
            }
        }

        /// <summary>Lead at the centre; each further banner one step up and to the right, a little smaller.</summary>
        private static void Peek(StackSlot[] slots, int width)
        {
            int visible = Math.Min(slots.Length, MaxVisible(StackStyle.LeadPeek));
            int dx = width * PeekStepXPermilleOfWidth / 1000;
            int dy = width * PeekStepYPermilleOfWidth / 1000;
            for (int i = 0; i < slots.Length; i++)
            {
                slots[i] = i < visible
                    ? new StackSlot(i * dx, -i * dy, 1000 - i * PeekShrinkPermille, true, i)
                    : new StackSlot((visible - 1) * dx, -(visible - 1) * dy, 1000 - (visible - 1) * PeekShrinkPermille, false, i);
            }
        }

        /// <summary>Evenly over at most 84 percent of the tile width, lead in the middle front, the ends raised.</summary>
        private static void Arc(StackSlot[] slots, int width, int tileWidth)
        {
            int visible = Math.Min(slots.Length, MaxVisible(StackStyle.ArcFan));
            int scale = visible >= 3 ? ArcCompactScale : 1000;
            int scaledWidth = width * scale / 1000;
            int span = Math.Min(tileWidth * 84 / 100, (visible - 1) * scaledWidth * 70 / 100);
            int half = span / 2;
            // positions from left to right; the lead takes the middle one, the others fill outward
            int[] order = CentreOutOrder(visible);
            for (int i = 0; i < slots.Length; i++)
            {
                if (i >= visible)
                {
                    slots[i] = new StackSlot(0, 0, scale, false, i);
                    continue;
                }

                int column = order[i];
                int x = visible == 1 ? 0 : -half + column * span / (visible - 1);
                int distance = half == 0 ? 0 : Math.Abs(x) * 1000 / half; // 0 at the middle, 1000 at the ends
                int rise = ArcRisePx * distance / 1000 * distance / 1000;
                slots[i] = new StackSlot(x, -rise, scale, true, i);
            }
        }

        /// <summary>Column index for each slot: the middle column first, then alternating outward (right first).</summary>
        public static int[] CentreOutOrder(int columns)
        {
            if (columns < 1) throw new ArgumentOutOfRangeException(nameof(columns));
            var order = new int[columns];
            int middle = (columns - 1) / 2;
            int left = middle - 1;
            int right = middle + 1;
            order[0] = middle;
            for (int i = 1; i < columns; i++)
            {
                bool takeRight = right < columns && (IntMath.FloorMod(i, 2) == 1 || left < 0);
                if (takeRight) order[i] = right++;
                else order[i] = left--;
            }

            return order;
        }
    }
}
