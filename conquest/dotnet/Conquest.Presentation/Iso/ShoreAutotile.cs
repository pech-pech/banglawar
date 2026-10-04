using System;
using System.Linq;

namespace Conquest.Presentation
{
    /// <summary>
    /// Picks the water picture for a water tile from its eight neighbours (the 47-tile blob set of the bd1971 pilot).
    /// This is the twin of <c>missing/mwater.py</c> (<c>code_of</c>, <c>name_of</c>) in the pilot, and the golden table
    /// <c>golden/shore-autotile.golden.json</c> is generated from that Python, so the two cannot drift. Integers only.
    ///
    /// The pilot names directions by what the viewer sees: the NE edge is the art cell (0, +1), SE (+1, 0), SW (0, -1),
    /// NW (-1, 0); corners N (-1, +1), E (+1, +1), S (+1, -1), W (-1, -1). On the game grid +x runs SE and +y runs SW
    /// (see <see cref="IsoProjection"/>), so a game offset (dx, dy) is the art cell (dx, -dy); <see cref="RawMaskAt"/> does
    /// that flip and nothing else does.
    /// </summary>
    public static class ShoreAutotile
    {
        public const int SideNe = 1;
        public const int SideSe = 2;
        public const int SideSw = 4;
        public const int SideNw = 8;
        public const int CornerN = 16;
        public const int CornerE = 32;
        public const int CornerS = 64;
        public const int CornerW = 128;

        /// <summary>Number of canonical tiles (open water, edges, corners, channels and the rest of the blob set).</summary>
        public const int CanonicalCount = 47;

        /// <summary>Manifest key of the open-water picture (no land around).</summary>
        public const string OpenWaterKey = "tile.water";

        // Art-frame offsets in raw-mask bit order: ne, se, sw, nw, n, e, s, w (the order of mwater.all_codes).
        private static readonly int[] ArtDx = { 0, 1, 0, -1, -1, 1, 1, -1 };
        private static readonly int[] ArtDy = { 1, 0, -1, 0, 1, 1, -1, -1 };
        private static readonly int[] RawBit = { 1, 2, 4, 8, 16, 32, 64, 128 };

        private static readonly string[] KeyByCode = BuildKeys();

        /// <summary>
        /// Raw 8-neighbour land mask of tile (x, y): bit i is set when the neighbour at art offset i is land. The caller's
        /// predicate answers for game-grid coordinates and must return false (water) outside the map.
        /// </summary>
        public static int RawMaskAt(int x, int y, Func<int, int, bool> isLand)
        {
            if (isLand == null) throw new ArgumentNullException(nameof(isLand));
            int mask = 0;
            for (int i = 0; i < 8; i++)
            {
                if (isLand(x + ArtDx[i], y - ArtDy[i])) mask |= RawBit[i];
            }

            return mask;
        }

        /// <summary>
        /// Canonical blob code of a raw mask (<c>mwater.code_of</c>): the four side bits, plus a corner bit only when both
        /// sides next to that corner are water, because otherwise the diagonal cell cannot change the shoreline.
        /// </summary>
        public static int CodeOf(int rawMask)
        {
            int code = rawMask & (SideNe | SideSe | SideSw | SideNw);
            if (CornerOnly(rawMask, CornerN, SideNw | SideNe)) code |= CornerN;
            if (CornerOnly(rawMask, CornerE, SideNe | SideSe)) code |= CornerE;
            if (CornerOnly(rawMask, CornerS, SideSe | SideSw)) code |= CornerS;
            if (CornerOnly(rawMask, CornerW, SideSw | SideNw)) code |= CornerW;
            return code;
        }

        /// <summary>Picture name of a canonical code (<c>mwater.name_of</c>): water, water_edge_ne, water_m007...</summary>
        public static string NameOf(int code)
        {
            return KeyByCode[Check(code)].Substring("tile.".Length);
        }

        /// <summary>Manifest key of a canonical code, for example <c>tile.water_edge_ne</c>.</summary>
        public static string KeyOf(int code) => KeyByCode[Check(code)];

        /// <summary>Manifest key for a raw 8-neighbour mask.</summary>
        public static string KeyForRawMask(int rawMask) => KeyByCode[CodeOf(rawMask & 0xFF)];

        /// <summary>Manifest key of the water tile at (x, y) given the land predicate.</summary>
        public static string KeyAt(int x, int y, Func<int, int, bool> isLand) => KeyForRawMask(RawMaskAt(x, y, isLand));

        /// <summary>Every canonical code in ascending order (the 47 tiles).</summary>
        public static int[] AllCodes()
        {
            return AllCodesStatic().ToArray();
        }

        private static bool CornerOnly(int raw, int cornerBit, int sideBits)
        {
            // The corner's raw bit has the same value as its canonical bit (16, 32, 64, 128).
            return (raw & cornerBit) != 0 && (raw & sideBits) == 0;
        }

        private static int Check(int code)
        {
            if (code < 0 || code > 255 || KeyByCode[code] == null) throw new ArgumentOutOfRangeException(nameof(code), code, "not a canonical shore code");
            return code;
        }

        private static string[] BuildKeys()
        {
            var keys = new string[256];
            foreach (int code in AllCodesStatic()) keys[code] = "tile." + Friendly(code);
            return keys;
        }

        private static System.Collections.Generic.List<int> AllCodesStatic()
        {
            var seen = new System.Collections.Generic.SortedSet<int>();
            for (int raw = 0; raw < 256; raw++) seen.Add(CodeOf(raw));
            return new System.Collections.Generic.List<int>(seen);
        }

        private static string Friendly(int code)
        {
            switch (code)
            {
                case 0: return "water";
                case SideNe: return "water_edge_ne";
                case SideSe: return "water_edge_se";
                case SideSw: return "water_edge_sw";
                case SideNw: return "water_edge_nw";
                case CornerN: return "water_inner_n";
                case CornerE: return "water_inner_e";
                case CornerS: return "water_inner_s";
                case CornerW: return "water_inner_w";
                case SideNw | SideNe: return "water_outer_n";
                case SideNe | SideSe: return "water_outer_e";
                case SideSe | SideSw: return "water_outer_s";
                case SideSw | SideNw: return "water_outer_w";
                case SideNe | SideSw: return "water_channel_ne_sw";
                case SideNw | SideSe: return "water_channel_nw_se";
                default: return "water_m" + code.ToString("D3", System.Globalization.CultureInfo.InvariantCulture);
            }
        }
    }
}
