using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.TextCore.Text;

namespace Conquest.UnityView.Tests
{
    public sealed class FontTests
    {
        private const string FontPath = "Assets/ThirdParty/NotoSansBengali/NotoSansBengali-VF.ttf";
        private const string Sample = "পালা শেষ করুন ঘাঁটি স্থাপন করুন বাংলা";

        private static Font LoadFont()
        {
            var font = AssetDatabase.LoadAssetAtPath<Font>(FontPath);
            Assert.NotNull(font, "the Noto Sans Bengali font must be in the repository");
            return font;
        }

        [Test]
        public void FontIsInTheRepositoryWithItsLicence()
        {
            LoadFont();
            Assert.NotNull(AssetDatabase.LoadAssetAtPath<UnityEngine.TextAsset>("Assets/ThirdParty/NotoSansBengali/OFL.txt"));
        }

        [Test]
        public void EveryBengaliCharacterOfTheUiStringsIsInTheFont()
        {
            FontAsset asset = FontAsset.CreateFontAsset(LoadFont(), 90, 9, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
            string json = System.IO.File.ReadAllText(Application.streamingAssetsPath + "/ui-strings.json");
            var missing = new System.Text.StringBuilder();
            foreach (char c in json)
            {
                if (c >= 'ঀ' && c <= '৿' && !asset.HasCharacter(c, false, true)) missing.Append(c);
            }

            Assert.AreEqual(string.Empty, missing.ToString());
            Assert.IsTrue(asset.HasCharacters(Sample, out _, false, true));
        }

        [Test]
        public void ReportsWhetherTheBengaliFontAlsoCoversLatinAndDigits()
        {
            FontAsset asset = FontAsset.CreateFontAsset(LoadFont(), 90, 9, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
            bool digits = asset.HasCharacters("0123456789", out _, false, true);
            bool latin = asset.HasCharacters("English Turn", out _, false, true);

            Assert.IsTrue(digits, "Western digits must render in the Bengali font (decision O-6)");
            Debug.Log("NotoSansBengali-VF latin letters present: " + latin);
        }
    }
}
