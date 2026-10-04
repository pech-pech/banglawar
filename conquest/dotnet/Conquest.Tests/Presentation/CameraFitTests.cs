using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class CameraFitTests
    {
        private static readonly IsoProjection Iso = new IsoProjection();
        private static readonly PixelRect Slice = Iso.MapBounds(12, 10);

        private static ScreenInsets HudInsets(int width, int height)
        {
            int scale = CameraFit.HudScalePermille(width, height);
            return new ScreenInsets(HudLayout.TopInsetPx * scale / 1000, HudLayout.BottomInsetPx * scale / 1000, 0, 0);
        }

        [TestCase(1280, 720, 1000)]
        [TestCase(1920, 1080, 1500)]
        [TestCase(1080, 1920, 1755)]
        [TestCase(2560, 1440, 2000)]
        public void HudScaleIsTheArithmeticMeanOfTheRatiosLikeUiToolkit(int w, int h, int expected)
        {
            Assert.That(CameraFit.HudScalePermille(w, h), Is.EqualTo(expected));
        }

        [Test]
        public void HudScaleRejectsBadSizes()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => CameraFit.HudScalePermille(0, 720));
        }

        [TestCase(250, true)]
        [TestCase(375, true)]
        [TestCase(625, true)]
        [TestCase(350, false)]
        [TestCase(416, false)]
        public void CrispMeansMultiplesOf125(int zoom, bool crisp)
        {
            Assert.That(CameraFit.IsCrisp(zoom), Is.EqualTo(crisp));
        }

        [Test]
        public void EveryCrispStopDrawsAWholeEvenTileWithAnExactTwoToOneDiamond()
        {
            foreach (int zoom in CameraFit.CrispStops)
            {
                Assert.That(256 * zoom % 1000, Is.EqualTo(0), zoom + ": tile width is whole");
                int width = 256 * zoom / 1000;
                int height = 128 * zoom / 1000;
                Assert.That(width % 2, Is.EqualTo(0), zoom + ": even width so the half-width is whole");
                Assert.That(height * 2, Is.EqualTo(width), zoom + ": exactly 2:1");
                Assert.That(CameraFit.IsCrisp(zoom), Is.True);
            }

            Assert.That(CameraFit.CrispStops, Is.Ordered.Ascending);
            Assert.That(CameraFit.CrispStops[0], Is.EqualTo(CameraModel.MinZoom));
            Assert.That(CameraFit.CrispStops[^1], Is.EqualTo(CameraModel.MaxZoom));
        }

        [Test]
        public void LegacyStopsAreNotAllCrisp()
        {
            Assert.That(CameraModel.ZoomStops.Count(z => !CameraFit.IsCrisp(z)), Is.EqualTo(3), "350, 700 and 1400 blur the diamond edges");
            Assert.That(CameraFit.StopsFor(CameraFitMode.ContainMargin), Is.EqualTo(CameraModel.ZoomStops));
            Assert.That(CameraFit.StopsFor(CameraFitMode.ContainSafeCrisp), Is.EqualTo(CameraFit.CrispStops));
        }

        [TestCase(416, 375)]
        [TestCase(1000, 1000)]
        [TestCase(100, 250)]
        [TestCase(5000, 2000)]
        public void SnapDownStaysInsideTheZoomRange(int zoom, int expected)
        {
            Assert.That(CameraFit.SnapDown(zoom), Is.EqualTo(expected));
        }

        [Test]
        public void ContainZoomTakesTheTighterAxis()
        {
            Assert.That(CameraFit.ContainZoom(2000, 1000, 1000, 1000), Is.EqualTo(500));
            Assert.That(CameraFit.ContainZoom(1000, 2000, 1000, 1000), Is.EqualTo(500));
            Assert.Throws<ArgumentOutOfRangeException>(() => CameraFit.ContainZoom(0, 1, 1, 1));
        }

        [TestCase(1280, 720)]
        [TestCase(1920, 1080)]
        [TestCase(1080, 1920)]
        public void LegacyFitMatchesTheSliceAsItWas(int w, int h)
        {
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainMargin, Slice, w, h, ScreenInsets.None);
            int expected = Math.Min(w * 1000 / (Slice.Width + 256), h * 1000 / (Slice.Height + 256));
            Assert.That(fit.ZoomPermille, Is.EqualTo(Math.Max(CameraModel.MinZoom, expected)));
        }

        [TestCase(1280, 720)]
        [TestCase(1920, 1080)]
        public void ContainSafeShowsTheWholeMapBelowTheHudAtACrispZoom(int w, int h)
        {
            ScreenInsets insets = HudInsets(w, h);
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, w, h, insets);

            Assert.That(CameraFit.IsCrisp(fit.ZoomPermille), Is.True);
            PixelPoint topLeft = fit.WorldToScreen(new PixelPoint(Slice.Left, Slice.Top - CameraFit.TallArtOverhangPx));
            PixelPoint bottomRight = fit.WorldToScreen(new PixelPoint(Slice.Right, Slice.Bottom));
            Assert.That(topLeft.X, Is.GreaterThanOrEqualTo(0));
            Assert.That(bottomRight.X, Is.LessThanOrEqualTo(w));
            Assert.That(topLeft.Y, Is.GreaterThanOrEqualTo(insets.Top), "tall art of the top row clears the top bar");
            Assert.That(bottomRight.Y, Is.LessThanOrEqualTo(h - insets.Bottom));
            // the next crisp stop up would no longer fit
            int next = fit.ZoomPermille + CameraFit.CrispQuantum;
            int contentW = Slice.Width;
            int contentH = Slice.Height + CameraFit.TallArtOverhangPx + CameraFit.SkirtPx;
            Assert.That(contentW * next / 1000 > w || contentH * next / 1000 > h - insets.Top - insets.Bottom, Is.True);
        }

        [TestCase(1080, 1920)]
        [TestCase(750, 1334)]
        [TestCase(1170, 2532)]
        [TestCase(1440, 3200)]
        public void PortraitStartsZoomedInPastTheWidthFitSoTheMapFillsMoreOfTheScreen(int w, int h)
        {
            ScreenInsets insets = HudInsets(w, h);
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, w, h, insets);
            int widthFit = CameraFit.SnapDown(CameraFit.ContainZoom(Slice.Width, Slice.Height + CameraFit.TallArtOverhangPx + CameraFit.SkirtPx, w, h - insets.Top - insets.Bottom));

            Assert.That(CameraFit.IsCrisp(fit.ZoomPermille), Is.True);
            Assert.That(fit.ZoomPermille, Is.GreaterThan(widthFit), "closer than the contain fit, which left bands of empty screen");
            Assert.That(w * 1000L / fit.ZoomPermille, Is.GreaterThanOrEqualTo(Slice.Width * CameraFit.PortraitMinVisibleWidthPermille / 1000L), "still shows most of the map's width");
            PixelPoint top = fit.WorldToScreen(new PixelPoint(0, Slice.Top - CameraFit.TallArtOverhangPx));
            PixelPoint bottom = fit.WorldToScreen(new PixelPoint(0, Slice.Bottom + CameraFit.SkirtPx));
            Assert.That(top.Y, Is.GreaterThanOrEqualTo(insets.Top), "no vertical cropping under the top bar");
            Assert.That(bottom.Y, Is.LessThanOrEqualTo(h - insets.Bottom));
        }

        [Test]
        public void PortraitFitStillAllowsPanningAcrossTheWholeMap()
        {
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1080, 1920, HudInsets(1080, 1920));
            CameraModel panned = fit.PanByScreenDelta(400, 0);
            Assert.That(panned.CenterX, Is.LessThan(fit.CenterX), "the view moves toward the map's west edge");
            CameraModel farWest = fit.PanByScreenDelta(100000, 0);
            Assert.That(farWest.VisibleWorld().Left, Is.LessThanOrEqualTo(Slice.Left), "the west tip can be brought on screen");
            CameraModel farEast = fit.PanByScreenDelta(-100000, 0);
            Assert.That(farEast.VisibleWorld().Right, Is.GreaterThanOrEqualTo(Slice.Right), "so can the east tip");
        }

        [TestCase(1280, 720)]
        [TestCase(1920, 1080)]
        [TestCase(2560, 1440)]
        [TestCase(1000, 1000)]
        public void LandscapeAndSquareViewportsKeepTheContainZoom(int w, int h)
        {
            ScreenInsets insets = HudInsets(w, h);
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, w, h, insets);
            int expected = CameraFit.SnapDown(CameraFit.ContainZoom(Slice.Width, Slice.Height + CameraFit.TallArtOverhangPx + CameraFit.SkirtPx, w, h - insets.Top - insets.Bottom));
            Assert.That(fit.ZoomPermille, Is.EqualTo(expected));
        }

        [Test]
        public void ContainSafeCentresTheMapInTheSafeArea()
        {
            ScreenInsets insets = HudInsets(1280, 720);
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1280, 720, insets);
            PixelPoint top = fit.WorldToScreen(new PixelPoint(0, Slice.Top - CameraFit.TallArtOverhangPx));
            PixelPoint bottom = fit.WorldToScreen(new PixelPoint(0, Slice.Bottom + CameraFit.SkirtPx));
            int spaceAbove = top.Y - insets.Top;
            int spaceBelow = 720 - insets.Bottom - bottom.Y;
            Assert.That(Math.Abs(spaceAbove - spaceBelow), Is.LessThanOrEqualTo(8));
        }

        [Test]
        public void TheCentreSitsOnTheEightPixelGridSoTileCornersLandOnWholePixels()
        {
            CameraModel fit = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1280, 720, HudInsets(1280, 720));
            Assert.That(fit.CenterX % CameraFit.CentreQuantumPx, Is.EqualTo(0));
            Assert.That(fit.CenterY % CameraFit.CentreQuantumPx, Is.EqualTo(0));
            // tile corners sit on multiples of 64 world px; 8 world px are a whole screen pixel at every crisp stop
            foreach (int zoom in CameraFit.CrispStops) Assert.That(CameraFit.CentreQuantumPx * zoom % 1000, Is.EqualTo(0), zoom.ToString());
            CameraModel even = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1920, 1080, HudInsets(1920, 1080));
            PixelPoint corner = new PixelPoint(even.CenterX + 128, even.CenterY + 64);
            Assert.That((corner.X - even.CenterX) * (long)even.ZoomPermille % 1000, Is.EqualTo(0));
            Assert.That((corner.Y - even.CenterY) * (long)even.ZoomPermille % 1000, Is.EqualTo(0));
        }

        [Test]
        public void FocusShowsTheOwnForcesCloserButNeverCloserThanOneToOne()
        {
            var focus = new PixelRect(-640, 128, 384, 320); // the turn-0 entry tiles of the slice
            ScreenInsets insets = HudInsets(1280, 720);
            CameraModel all = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1280, 720, insets);
            CameraModel near = CameraFit.Fit(CameraFitMode.FocusForces, Slice, 1280, 720, insets, focus);

            Assert.That(near.ZoomPermille, Is.GreaterThan(all.ZoomPermille));
            Assert.That(near.ZoomPermille, Is.LessThanOrEqualTo(CameraModel.DefaultZoom));
            Assert.That(CameraFit.IsCrisp(near.ZoomPermille), Is.True);
            PixelPoint a = near.WorldToScreen(new PixelPoint(focus.Left, focus.Top));
            PixelPoint b = near.WorldToScreen(new PixelPoint(focus.Right, focus.Bottom));
            Assert.That(a.X >= 0 && b.X <= 1280 && a.Y >= insets.Top && b.Y <= 720, Is.True, "the forces are on screen");

            var tiny = new PixelRect(0, 0, 10, 10);
            Assert.That(CameraFit.Fit(CameraFitMode.FocusForces, Slice, 1920, 1080, HudInsets(1920, 1080), tiny).ZoomPermille, Is.EqualTo(CameraModel.DefaultZoom), "capped at 1:1");
            int fitAll4k = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 3840, 2160, HudInsets(3840, 2160)).ZoomPermille;
            Assert.That(CameraFit.Fit(CameraFitMode.FocusForces, Slice, 3840, 2160, HudInsets(3840, 2160), tiny).ZoomPermille, Is.EqualTo(fitAll4k), "never further out than the whole map");
            Assert.That(CameraFit.Fit(CameraFitMode.FocusForces, Slice, 1280, 720, insets).ZoomPermille, Is.EqualTo(all.ZoomPermille), "no focus falls back to the whole map");
        }

        [Test]
        public void FitIsAPureFunctionOfItsInputs()
        {
            CameraModel a = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1080, 1920, HudInsets(1080, 1920));
            CameraModel b = CameraFit.Fit(CameraFitMode.ContainSafeCrisp, Slice, 1080, 1920, HudInsets(1080, 1920));
            Assert.That((a.CenterX, a.CenterY, a.ZoomPermille), Is.EqualTo((b.CenterX, b.CenterY, b.ZoomPermille)));
        }

        [Test]
        public void FitRejectsBadInput()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => CameraFit.Fit(CameraFitMode.ContainMargin, Slice, 0, 720, ScreenInsets.None));
            Assert.Throws<ArgumentOutOfRangeException>(() => CameraFit.Fit((CameraFitMode)9, Slice, 1280, 720, ScreenInsets.None));
            Assert.Throws<ArgumentOutOfRangeException>(() => new ScreenInsets(-1, 0, 0, 0));
        }

        [Test]
        public void ZoomStepsCanUseTheCrispStops()
        {
            CameraModel cam = CameraModel.Create(Slice, 1280, 720, 256).ZoomTo(375, 640, 360);
            Assert.That(cam.ZoomSteps(1, 640, 360, CameraFit.CrispStops).ZoomPermille, Is.EqualTo(500));
            Assert.That(cam.ZoomSteps(-1, 640, 360, CameraFit.CrispStops).ZoomPermille, Is.EqualTo(250));
            Assert.That(cam.ZoomSteps(0, 640, 360, CameraFit.CrispStops), Is.SameAs(cam));
            Assert.That(cam.ZoomTo(416, 640, 360).ZoomSteps(1, 640, 360, CameraFit.CrispStops).ZoomPermille, Is.EqualTo(500));
            Assert.Throws<ArgumentException>(() => cam.ZoomSteps(1, 0, 0, Array.Empty<int>()));
        }
    }
}
