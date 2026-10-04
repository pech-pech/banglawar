using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class BannerPolishTests
    {
        [TestCase("scout", BannerSizeClass.Small)]
        [TestCase("founder", BannerSizeClass.Small)]
        [TestCase("commander", BannerSizeClass.Large)]
        [TestCase("line", BannerSizeClass.Medium)]
        [TestCase("transport", BannerSizeClass.Medium)]
        [TestCase("militia", BannerSizeClass.Medium)]
        public void SizeClassFollowsTheBannerPlan(string role, BannerSizeClass expected)
        {
            Assert.That(BannerSizeClasses.Of(role), Is.EqualTo(expected));
        }

        [Test]
        public void SizeClassRejectsNull()
        {
            Assert.Throws<ArgumentNullException>(() => BannerSizeClasses.Of(null!));
        }

        [Test]
        public void ScaleTablesAreAsDocumented()
        {
            BannerSizing c1 = BannerSizing.For(PolishChoice.C1);
            BannerSizing c2 = BannerSizing.For(PolishChoice.C2);
            BannerSizing c3 = BannerSizing.For(PolishChoice.C3);

            Assert.That(new[] { c1.ScalePermille(BannerSizeClass.Small), c1.ScalePermille(BannerSizeClass.Medium), c1.ScalePermille(BannerSizeClass.Large) }, Is.EqualTo(new[] { 1000, 1000, 1000 }));
            Assert.That(new[] { c2.ScalePermille(BannerSizeClass.Small), c2.ScalePermille(BannerSizeClass.Medium), c2.ScalePermille(BannerSizeClass.Large) }, Is.EqualTo(new[] { 1300, 1200, 1150 }));
            Assert.That(new[] { c3.ScalePermille(BannerSizeClass.Small), c3.ScalePermille(BannerSizeClass.Medium), c3.ScalePermille(BannerSizeClass.Large) }, Is.EqualTo(new[] { 1500, 1500, 1500 }));
            Assert.That(c1.BeamPermilleOfCloth, Is.EqualTo(0));
            Assert.That(c2.BeamPermilleOfCloth, Is.EqualTo(750));
            Assert.That(c3.BeamPermilleOfCloth, Is.EqualTo(1000));
            Assert.That(c2.Choice, Is.EqualTo(PolishChoice.C2));
        }

        [Test]
        public void EveryCandidateKeepsTheClassOrderSmallUnderMediumUnderLargeOnScreen()
        {
            // drawn heights of the player banners: S 164, M 181, L 200
            foreach (PolishChoice c in new[] { PolishChoice.C1, PolishChoice.C2, PolishChoice.C3 })
            {
                BannerSizing s = BannerSizing.For(c);
                int small = s.ScreenPx(164, BannerSizeClass.Small, 1000);
                int medium = s.ScreenPx(181, BannerSizeClass.Medium, 1000);
                int large = s.ScreenPx(200, BannerSizeClass.Large, 1000);
                Assert.That(small, Is.LessThan(medium), c.ToString());
                Assert.That(medium, Is.LessThan(large), c.ToString());
            }
        }

        [Test]
        public void ScreenPxScalesByClassAndZoom()
        {
            BannerSizing c2 = BannerSizing.For(PolishChoice.C2);
            Assert.That(c2.ScreenPx(200, BannerSizeClass.Large, 1000), Is.EqualTo(230));
            Assert.That(c2.ScreenPx(200, BannerSizeClass.Large, 375), Is.EqualTo(86));
        }

        [Test]
        public void ExtraBeamReachesTheTargetAndNeverShrinksTheArt()
        {
            BannerSizing c1 = BannerSizing.For(PolishChoice.C1);
            BannerSizing c2 = BannerSizing.For(PolishChoice.C2);
            BannerSizing c3 = BannerSizing.For(PolishChoice.C3);

            Assert.That(c1.ExtraBeamPx(137, 63), Is.EqualTo(0), "as drawn");
            Assert.That(c2.ExtraBeamPx(137, 63), Is.EqualTo(137 * 750 / 1000 - 63));
            Assert.That(c3.ExtraBeamPx(137, 63), Is.EqualTo(74));
            Assert.That(c2.ExtraBeamPx(40, 63), Is.EqualTo(0), "a drawn beam longer than the target stays");
            Assert.Throws<ArgumentOutOfRangeException>(() => c2.ExtraBeamPx(-1, 0));
        }

        [Test]
        public void UnknownChoicesAndClassesThrow()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => BannerSizing.For((PolishChoice)7));
            Assert.Throws<ArgumentOutOfRangeException>(() => BannerSizing.For(PolishChoice.C1).ScalePermille((BannerSizeClass)5));
        }

        private static byte[] Banner(int width, int height, int clothRows, int beamRows, int beamWidth)
        {
            var alpha = new byte[width * height];
            for (int y = 0; y < height; y++)
            {
                int rowWidth = y < clothRows ? width : y < clothRows + beamRows ? beamWidth : Math.Max(2, width * 2 / 3 - (y - clothRows - beamRows));
                int left = (width - rowWidth) / 2;
                for (int x = left; x < left + rowWidth; x++) alpha[y * width + x] = 255;
            }

            return alpha;
        }

        [Test]
        public void ProfileFindsTheBeamBetweenClothAndGroundMark()
        {
            byte[] alpha = Banner(116, 200, 137, 24, 24);

            BannerArtProfile? p = BannerArtProfile.Analyze(116, 200, alpha);

            Assert.That(p, Is.Not.Null);
            Assert.That(p!.BandTop, Is.EqualTo(137));
            Assert.That(p.BandBottom, Is.EqualTo(161));
            Assert.That(p.BeamWidth, Is.EqualTo(24));
            Assert.That(p.BandRows, Is.EqualTo(24));
            Assert.That(p.TopBorder, Is.EqualTo(137));
            Assert.That(p.ClothBottom, Is.EqualTo(137), "no collar: the cloth ends where the band starts");
            Assert.That(p.BottomBorder, Is.EqualTo(39));
            Assert.That(p.Width, Is.EqualTo(116));
            Assert.That(p.Height, Is.EqualTo(200));
        }

        [Test]
        public void ProfileIgnoresFaintPixelsAndATaperingTip()
        {
            byte[] alpha = Banner(100, 181, 117, 30, 23);
            for (int x = 0; x < 100; x++)
            {
                if (alpha[130 * 100 + x] == 0) alpha[130 * 100 + x] = 40; // a faint glow row across the beam
            }

            alpha[180 * 100 + 50] = 255; // a one-pixel tip at the bottom

            BannerArtProfile? p = BannerArtProfile.Analyze(100, 181, alpha);

            Assert.That(p, Is.Not.Null);
            Assert.That(p!.BandTop, Is.EqualTo(117));
            Assert.That(p.BandBottom, Is.EqualTo(147));
        }

        [Test]
        public void ProfilePrefersTheNarrowRunOverTheConstantClothAndIgnoresThinConnectors()
        {
            // a hologram card (rows 0-39, 100 wide), a 2-row 10 px connector, the cloth (rows 42-129, 56 wide),
            // a 9-row beam 26 wide, then a ring diamond that widens to the full 236 px and closes again
            const int w = 236, h = 326;
            var alpha = new byte[w * h];
            void Row(int y, int width)
            {
                int left = (w - width) / 2;
                for (int x = left; x < left + width; x++) alpha[y * w + x] = 255;
            }

            for (int y = 0; y < 40; y++) Row(y, 100);
            Row(40, 10);
            Row(41, 10);
            for (int y = 42; y < 199; y++) Row(y, 56);
            for (int y = 199; y < 208; y++) Row(y, 26);
            for (int y = 208; y < 266; y++) Row(y, Math.Min(236, 28 + (y - 208) * 4));
            for (int y = 266; y < h; y++) Row(y, Math.Max(6, 236 - (y - 266) * 4));

            BannerArtProfile? p = BannerArtProfile.Analyze(w, h, alpha);

            Assert.That(p, Is.Not.Null);
            Assert.That((p!.BandTop, p.BandBottom, p.BeamWidth), Is.EqualTo((199, 208, 26)));
            Assert.That(p.ClothBottom, Is.EqualTo(199));
        }

        [Test]
        public void ClothBottomSkipsATaperingCollarAboveTheBand()
        {
            const int w = 116, h = 200;
            var alpha = new byte[w * h];
            int[] collar = { 62, 51, 46, 38, 26, 26, 26, 26, 25, 25 }; // rows 133-142, as drawn under the L cloth
            for (int y = 0; y < h; y++)
            {
                int width = y < 133 ? 78 : y < 143 ? collar[y - 133] : y < 161 ? 24 : 70;
                int left = (w - width) / 2;
                for (int x = left; x < left + width; x++) alpha[y * w + x] = 255;
            }

            BannerArtProfile? p = BannerArtProfile.Analyze(w, h, alpha);

            Assert.That(p, Is.Not.Null);
            Assert.That(p!.BandTop, Is.EqualTo(143), "the stretch band is the plain 24 px beam");
            Assert.That(p.ClothBottom, Is.EqualTo(135), "row 134 (51 px) is the last at least twice the beam: the cloth ends there");
        }

        [Test]
        public void ProfileIsNullWithoutABeam()
        {
            var solid = new byte[50 * 80];
            for (int i = 0; i < solid.Length; i++) solid[i] = 255;
            Assert.That(BannerArtProfile.Analyze(50, 80, solid), Is.Null);
            Assert.That(BannerArtProfile.Analyze(50, 80, new byte[50 * 80]), Is.Null, "empty picture");
            Assert.That(BannerArtProfile.Analyze(100, 181, Banner(100, 181, 117, 2, 23)), Is.Null, "too short a beam");
        }

        [Test]
        public void ProfileRejectsBadInput()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => BannerArtProfile.Analyze(0, 10, new byte[0]));
            Assert.Throws<ArgumentNullException>(() => BannerArtProfile.Analyze(10, 10, null!));
            Assert.Throws<ArgumentException>(() => BannerArtProfile.Analyze(10, 10, new byte[5]));
        }
    }
}
