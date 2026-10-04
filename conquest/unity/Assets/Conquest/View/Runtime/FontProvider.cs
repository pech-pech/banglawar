using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;
using Conquest.Glue;

namespace Conquest.UnityView
{
    /// <summary>
    /// Fonts for the UI. English uses the engine's default UI font. Bengali needs shaping (conjuncts, vowel signs), so
    /// it uses the Noto Sans Bengali dynamic font asset together with UI Toolkit's Advanced Text Generator
    /// (HarfBuzz). Nothing else in the UI knows which font is active.
    /// </summary>
    public sealed class FontProvider
    {
        private readonly Font? bengaliFont;
        private FontAsset? bengaliAsset;

        public FontProvider(Font? bengaliFont)
        {
            this.bengaliFont = bengaliFont;
        }

        public bool HasBengali => bengaliFont != null;

        public FontAsset? BengaliAsset
        {
            get
            {
                if (bengaliAsset == null && bengaliFont != null)
                {
                    bengaliAsset = FontAsset.CreateFontAsset(bengaliFont, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
                    bengaliAsset.name = "NotoSansBengali (runtime)";
                }

                return bengaliAsset;
            }
        }

        /// <summary>Sets the font and text generator on the root; every child inherits them.</summary>
        public void Apply(VisualElement root, string locale)
        {
            FontAsset? asset = locale == Localizer.Bengali ? BengaliAsset : null;
            if (asset != null)
            {
                root.style.unityFontDefinition = new StyleFontDefinition(FontDefinition.FromSDFFont(asset));
                root.style.unityTextGenerator = TextGeneratorType.Advanced;
            }
            else
            {
                root.style.unityFontDefinition = StyleKeyword.Null;
                root.style.unityTextGenerator = TextGeneratorType.Standard;
            }
        }
    }
}
