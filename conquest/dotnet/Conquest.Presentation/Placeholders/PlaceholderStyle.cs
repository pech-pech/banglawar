using System;

namespace Conquest.Presentation
{
    /// <summary>An opaque colour as 8-bit channels (no engine type).</summary>
    public readonly struct Rgb : IEquatable<Rgb>
    {
        public Rgb(int r, int g, int b)
        {
            if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) throw new ArgumentOutOfRangeException(nameof(r));
            R = r;
            G = g;
            B = b;
        }

        public int R { get; }

        public int G { get; }

        public int B { get; }

        /// <summary>Multiplies each channel by <paramref name="permille"/> / 1000, clamped.</summary>
        public Rgb Shade(int permille) => new Rgb(Clamp(R * permille / 1000), Clamp(G * permille / 1000), Clamp(B * permille / 1000));

        /// <summary>Channel sum, a cheap integer lightness order (contrast ratios are measured by the tests, not here: no floats in this project).</summary>
        public int Sum => R + G + B;

        /// <summary>HSV saturation in permille (0 = grey).</summary>
        public int SaturationPermille()
        {
            int max = Math.Max(R, Math.Max(G, B));
            int min = Math.Min(R, Math.Min(G, B));
            return max == 0 ? 0 : (max - min) * 1000 / max;
        }

        public bool Equals(Rgb other) => R == other.R && G == other.G && B == other.B;

        public override bool Equals(object? obj) => obj is Rgb other && Equals(other);

        public override int GetHashCode() => R * 65536 + G * 256 + B;

        public override string ToString() => "#" + R.ToString("X2") + G.ToString("X2") + B.ToString("X2");

        private static int Clamp(int v) => Math.Max(0, Math.Min(255, v));
    }

    /// <summary>
    /// The honest stand-ins drawn until real art arrives: flat clay-tone water diamonds with a subtle border, and
    /// buildings as plain extruded clay blocks of the right footprint in the role's brown. No texture, no detail,
    /// nothing that pretends to be final art.
    /// </summary>
    public sealed class PlaceholderStyle
    {
        private PlaceholderStyle(PolishChoice choice, Rgb water, int borderPermille, int borderPx, int blockHeightPermille, int blockInsetPermille)
        {
            Choice = choice;
            Water = water;
            WaterBorder = water.Shade(borderPermille);
            WaterBorderPx = borderPx;
            BlockHeightPermilleOfTile = blockHeightPermille;
            BlockInsetPermille = blockInsetPermille;
        }

        public PolishChoice Choice { get; }

        public Rgb Water { get; }

        public Rgb WaterBorder { get; }

        public int WaterBorderPx { get; }

        /// <summary>Block wall height as permille of the tile width.</summary>
        public int BlockHeightPermilleOfTile { get; }

        /// <summary>How much of the footprint diamond the block's base covers (permille of the footprint).</summary>
        public int BlockInsetPermille { get; }

        /// <summary>C1 slate clay (greyest), C2 blue-grey clay, C3 pale sand clay (no blue at all).</summary>
        public static PlaceholderStyle For(PolishChoice choice)
        {
            switch (choice)
            {
                case PolishChoice.C1: return new PlaceholderStyle(choice, new Rgb(150, 156, 150), 880, 2, 220, 760);
                case PolishChoice.C2: return new PlaceholderStyle(choice, new Rgb(146, 166, 170), 860, 3, 280, 720);
                case PolishChoice.C3: return new PlaceholderStyle(choice, new Rgb(196, 186, 160), 870, 2, 340, 680);
                default: throw new ArgumentOutOfRangeException(nameof(choice));
            }
        }

        /// <summary>The role's brown for a block's top face (sides are shaded from it). Roles without a tone get the core brown.</summary>
        public static Rgb RoleTone(string role)
        {
            if (role == null) throw new ArgumentNullException(nameof(role));
            switch (role)
            {
                case "core": return new Rgb(142, 104, 72);
                case "garrison": return new Rgb(120, 84, 58);
                case "scout_post": return new Rgb(160, 122, 84);
                case "food": return new Rgb(176, 140, 92);
                case "habitat": return new Rgb(150, 116, 86);
                case "port": return new Rgb(132, 110, 90);
                default: return new Rgb(142, 104, 72);
            }
        }

        /// <summary>Left wall (lit from the upper left) and right wall shades of a top colour.</summary>
        public static Rgb LeftWall(Rgb top) => top.Shade(820);

        public static Rgb RightWall(Rgb top) => top.Shade(640);
    }
}
