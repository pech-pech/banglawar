namespace Conquest.Presentation
{
    /// <summary>
    /// The HUD's fixed strips at the 1280 x 720 reference, in HUD (panel) pixels. The camera fit reads them to
    /// know how much of the screen the HUD takes before it is laid out, and the HUD view reads them to place
    /// its elements, so the two cannot drift apart.
    /// </summary>
    public static class HudLayout
    {
        /// <summary>The top bar (resources, turn, language).</summary>
        public const int TopBarPx = 56;

        /// <summary>The hint strip directly under the top bar: its own opaque band, so the hint never draws over the map.</summary>
        public const int HintStripPx = 24;

        /// <summary>Everything the top of the screen keeps clear of the map: bar plus hint strip.</summary>
        public const int TopInsetPx = TopBarPx + HintStripPx;

        /// <summary>Breathing room above the bottom row of controls.</summary>
        public const int BottomInsetPx = 24;
    }
}
