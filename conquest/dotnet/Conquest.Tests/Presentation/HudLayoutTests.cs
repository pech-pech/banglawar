using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class HudLayoutTests
    {
        [Test]
        public void TheTopInsetIsTheBarPlusTheHintStrip()
        {
            Assert.That(HudLayout.TopInsetPx, Is.EqualTo(HudLayout.TopBarPx + HudLayout.HintStripPx));
            Assert.That(HudLayout.HintStripPx, Is.GreaterThanOrEqualTo(20), "room for one line of 14 px hint text");
        }

        [TestCase(1280, 720)]
        [TestCase(1920, 1080)]
        [TestCase(1080, 1920)]
        [TestCase(2560, 1440)]
        public void NoFittedMapStartsUnderTheHintStrip(int w, int h)
        {
            var map = new IsoProjection().MapBounds(12, 10);
            int scale = CameraFit.HudScalePermille(w, h);
            var insets = new ScreenInsets(HudLayout.TopInsetPx * scale / 1000, HudLayout.BottomInsetPx * scale / 1000, 0, 0);
            int hintBottomOnScreen = HudLayout.TopInsetPx * scale / 1000;
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, map, w, h, insets);
            PixelPoint topOfArt = fit.WorldToScreen(new PixelPoint(map.Left + map.Width / 2, map.Top - CameraFit.TallArtOverhangPx));
            Assert.That(topOfArt.Y, Is.GreaterThanOrEqualTo(hintBottomOnScreen), "the map's tallest art clears the hint strip");
        }
    }
}
