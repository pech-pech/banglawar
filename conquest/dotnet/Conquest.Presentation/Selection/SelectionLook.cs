using System;

namespace Conquest.Presentation
{
    /// <summary>
    /// What a selected banner looks like, against the clay idle look. All three candidates keep the owner's mix
    /// (clay for units, hologram for selection); they differ in how much hologram and whether the tile gets a ring.
    /// </summary>
    public sealed class SelectionLook
    {
        private SelectionLook(PolishChoice choice, string hologramState, bool tileRing, int ringEdgePx, int ringFillAlphaPermille)
        {
            Choice = choice;
            HologramState = hologramState;
            TileRing = tileRing;
            RingEdgePx = ringEdgePx;
            RingFillAlphaPermille = ringFillAlphaPermille;
        }

        public PolishChoice Choice { get; }

        /// <summary>Manifest state of the selected picture: "selected" (clay banner, glyph card above, double ring at its foot) or "idle_selected" (glyph card on a ring, no clay).</summary>
        public string HologramState { get; }

        /// <summary>Whether a full-tile ring is drawn on the ground under the selected unit.</summary>
        public bool TileRing { get; }

        public int RingEdgePx { get; }

        /// <summary>Alpha of the ring's inner fill, permille (0 = outline only).</summary>
        public int RingFillAlphaPermille { get; }

        /// <summary>C1 the art's selected picture only; C2 the same plus a full-tile ring; C3 the glyph hologram replaces the clay, plus the ring.</summary>
        public static SelectionLook For(PolishChoice choice)
        {
            switch (choice)
            {
                case PolishChoice.C1: return new SelectionLook(choice, "selected", false, 0, 0);
                case PolishChoice.C2: return new SelectionLook(choice, "selected", true, 7, 200);
                case PolishChoice.C3: return new SelectionLook(choice, "idle_selected", true, 7, 200);
                default: throw new ArgumentOutOfRangeException(nameof(choice));
            }
        }

        /// <summary>The hologram tint of a side: cyan for the player (f1), amber for the opposing side.</summary>
        public static Rgb SideGlow(int ownerSlot) => ownerSlot == 0 ? new Rgb(72, 226, 236) : new Rgb(244, 168, 40);
    }
}
