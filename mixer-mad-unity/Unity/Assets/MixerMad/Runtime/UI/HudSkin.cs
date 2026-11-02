using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// M's glossy UI kit, as sprites: the candy kit (ui2) pedals and stars, and the F04 candy 9-slice button and panel.
    /// The PNGs live in Assets/MixerMad/Art/UI; the editor step MixerMad.Editor.UiKitImport sets their 9-slice borders
    /// and writes this asset to Art/UI/Resources so the player build can load it.
    /// Any sprite left empty falls back to the code-drawn plates in UiKit (L-MM-23: same Sliced + Fill Center setup).
    /// </summary>
    [CreateAssetMenu(menuName = "MixerMad/HUD Skin")]
    public sealed class HudSkin : ScriptableObject
    {
        public const string ResourceName = "MixerMadHudSkin";

        public Sprite button;      // F04 candy button plate, 9-slice
        public Sprite panel;       // F04 candy panel plate, 9-slice
        public Sprite gas, brake;  // ui2 candy pedals
        public Sprite starEmpty, starFull;

        static HudSkin _cached;

        /// <summary>Tests set this to check the code-drawn fallback.</summary>
        internal static bool ForceFallback { get; set; }

        /// <summary>The kit, or null when the art is missing (then every caller uses the code-drawn fallback).</summary>
        public static HudSkin Current
        {
            get
            {
                if (ForceFallback) return null;
                if (_cached == null) _cached = Resources.Load<HudSkin>(ResourceName);
                return _cached;
            }
        }
    }
}
