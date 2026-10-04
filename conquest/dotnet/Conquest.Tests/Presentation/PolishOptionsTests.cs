using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class PolishOptionsTests
    {
        private static readonly PolishChoice[] Choices = { PolishChoice.C1, PolishChoice.C2, PolishChoice.C3 };

        [Test]
        public void DefaultsAreTheJudgedCandidates()
        {
            PolishOptions d = PolishOptions.Default;
            Assert.That(d.Get(PolishDecision.BannerSize), Is.EqualTo(PolishChoice.C2));
            Assert.That(d.Get(PolishDecision.Stack), Is.EqualTo(PolishChoice.C2));
            Assert.That(d.Get(PolishDecision.Selection), Is.EqualTo(PolishChoice.C2));
            Assert.That(d.Get(PolishDecision.CameraFit), Is.EqualTo(PolishChoice.C2));
            Assert.That(d.Get(PolishDecision.Layering), Is.EqualTo(PolishChoice.C3));
            Assert.That(d.Get(PolishDecision.Footprint), Is.EqualTo(PolishChoice.C3));
            Assert.That(d.Get(PolishDecision.Placeholder), Is.EqualTo(PolishChoice.C2));
        }

        [Test]
        public void WithAndCycleReturnNewOptionsAndLeaveTheOldOnesAlone()
        {
            PolishOptions d = PolishOptions.Default;
            PolishOptions changed = d.With(PolishDecision.Stack, PolishChoice.C3);
            Assert.That(changed.Get(PolishDecision.Stack), Is.EqualTo(PolishChoice.C3));
            Assert.That(d.Get(PolishDecision.Stack), Is.EqualTo(PolishChoice.C2));
            Assert.That(d.With(PolishDecision.Stack, PolishChoice.C2), Is.SameAs(d));
            Assert.That(d.Cycle(PolishDecision.Stack).Get(PolishDecision.Stack), Is.EqualTo(PolishChoice.C3));
            Assert.That(d.Cycle(PolishDecision.Stack).Cycle(PolishDecision.Stack).Get(PolishDecision.Stack), Is.EqualTo(PolishChoice.C1));
            Assert.Throws<ArgumentOutOfRangeException>(() => d.With(PolishDecision.Stack, (PolishChoice)3));
            Assert.Throws<ArgumentOutOfRangeException>(() => d.Get((PolishDecision)7));
        }

        [Test]
        public void AllSetsEveryDecisionAndEqualityIsByValue()
        {
            PolishOptions all = PolishOptions.All(PolishChoice.C3);
            foreach (PolishDecision decision in Enum.GetValues<PolishDecision>()) Assert.That(all.Get(decision), Is.EqualTo(PolishChoice.C3));
            Assert.That(PolishOptions.All(PolishChoice.C1), Is.EqualTo(PolishOptions.All(PolishChoice.C1)));
            Assert.That(PolishOptions.All(PolishChoice.C1).GetHashCode(), Is.EqualTo(PolishOptions.All(PolishChoice.C1).GetHashCode()));
            Assert.That(PolishOptions.All(PolishChoice.C1).Equals(PolishOptions.All(PolishChoice.C2)), Is.False);
            Assert.That(PolishOptions.All(PolishChoice.C1).Equals((object?)null), Is.False);
            Assert.That(Enum.GetValues<PolishDecision>(), Has.Length.EqualTo(PolishOptions.DecisionCount));
        }

        [Test]
        public void CandidatesMapToTheirStylesInOrder()
        {
            PolishOptions c1 = PolishOptions.All(PolishChoice.C1);
            PolishOptions c2 = PolishOptions.All(PolishChoice.C2);
            PolishOptions c3 = PolishOptions.All(PolishChoice.C3);
            Assert.That((c1.Stack, c2.Stack, c3.Stack), Is.EqualTo((StackStyle.RowFan, StackStyle.LeadPeek, StackStyle.ArcFan)));
            Assert.That((c1.Camera, c2.Camera, c3.Camera), Is.EqualTo((CameraFitMode.ContainMargin, CameraFitMode.ContainSafeCrisp, CameraFitMode.FocusForces)));
            Assert.That((c1.Layering, c2.Layering, c3.Layering), Is.EqualTo((LayeringMode.OverlayOnTop, LayeringMode.OverlayInDepth, LayeringMode.Bands)));
            Assert.That((c1.Anchor, c2.Anchor, c3.Anchor), Is.EqualTo((AnchorConvention.TopLeft, AnchorConvention.FrontTile, AnchorConvention.RuleTileFitted)));
            Assert.That((c1.Sizing.Choice, c2.Selection.Choice, c3.Placeholders.Choice), Is.EqualTo((PolishChoice.C1, PolishChoice.C2, PolishChoice.C3)));
        }

        [Test]
        public void DescribeNamesEveryDecision()
        {
            string text = PolishOptions.Default.Describe();
            foreach (string word in new[] { "size C2", "stack C2", "select C2", "camera C2", "layer C3", "anchor C3", "placeholder C2" })
            {
                Assert.That(text, Does.Contain(word));
            }
        }

        [Test]
        public void SelectionLooksKeepClayIdleAndAddHologramWhenSelected()
        {
            Assert.That(SelectionLook.For(PolishChoice.C1).HologramState, Is.EqualTo("selected"));
            Assert.That(SelectionLook.For(PolishChoice.C1).TileRing, Is.False);
            Assert.That(SelectionLook.For(PolishChoice.C2).TileRing, Is.True);
            Assert.That(SelectionLook.For(PolishChoice.C2).RingEdgePx, Is.GreaterThan(0));
            Assert.That(SelectionLook.For(PolishChoice.C3).HologramState, Is.EqualTo("idle_selected"));
            Assert.That(SelectionLook.For(PolishChoice.C3).RingFillAlphaPermille, Is.EqualTo(200));
            Assert.That(SelectionLook.For(PolishChoice.C2).Choice, Is.EqualTo(PolishChoice.C2));
            Assert.Throws<ArgumentOutOfRangeException>(() => SelectionLook.For((PolishChoice)5));
        }

        [Test]
        public void SideGlowsDifferInLightnessSoTheyWorkInGreyscale()
        {
            Rgb player = SelectionLook.SideGlow(0);
            Rgb opposing = SelectionLook.SideGlow(1);
            Assert.That(player, Is.Not.EqualTo(opposing));
            Assert.That(ColorMath.Contrast(player, new Rgb(40, 50, 45)), Is.GreaterThan(3.0), "player ring against dark ground");
            Assert.That(ColorMath.Contrast(opposing, new Rgb(40, 50, 45)), Is.GreaterThan(3.0));
        }

        // ----- placeholders -----

        [Test]
        public void WaterPlaceholdersAreNeutralClayAndTheirBorderIsSubtle()
        {
            foreach (PolishChoice c in Choices)
            {
                PlaceholderStyle s = PlaceholderStyle.For(c);
                Assert.That(s.Water.SaturationPermille(), Is.LessThan(300), c + ": a neutral clay tone, not a saturated blue");
                double border = ColorMath.Contrast(s.Water, s.WaterBorder);
                Assert.That(border, Is.GreaterThan(1.1).And.LessThan(1.6), c + ": border visible but subtle");
                Assert.That(s.WaterBorderPx, Is.InRange(1, 4));
                Assert.That(s.Choice, Is.EqualTo(c));
            }

            Assert.That(PlaceholderStyle.For(PolishChoice.C1).BlockHeightPermilleOfTile, Is.LessThan(PlaceholderStyle.For(PolishChoice.C3).BlockHeightPermilleOfTile));
            Assert.That(PlaceholderStyle.For(PolishChoice.C2).BlockInsetPermille, Is.InRange(500, 1000));
            Assert.Throws<ArgumentOutOfRangeException>(() => PlaceholderStyle.For((PolishChoice)4));
        }

        [TestCase("core")]
        [TestCase("garrison")]
        [TestCase("scout_post")]
        [TestCase("food")]
        [TestCase("habitat")]
        [TestCase("port")]
        [TestCase("unknown_role")]
        public void RoleTonesAreBrownAndWallsAreDarker(string role)
        {
            Rgb top = PlaceholderStyle.RoleTone(role);
            Assert.That(top.R, Is.GreaterThan(top.G).And.GreaterThan(top.B), "brown: red over green over blue");
            Assert.That(top.G, Is.GreaterThan(top.B));
            Assert.That(ColorMath.Luminance(PlaceholderStyle.LeftWall(top)), Is.LessThan(ColorMath.Luminance(top)));
            Assert.That(ColorMath.Luminance(PlaceholderStyle.RightWall(top)), Is.LessThan(ColorMath.Luminance(PlaceholderStyle.LeftWall(top))));
        }

        [Test]
        public void RgbHelpers()
        {
            Assert.That(ColorMath.Contrast(new Rgb(0, 0, 0), new Rgb(255, 255, 255)), Is.EqualTo(21.0).Within(0.01));
            Assert.That(new Rgb(200, 100, 0).Shade(500), Is.EqualTo(new Rgb(100, 50, 0)));
            Assert.That(new Rgb(200, 100, 0).Shade(2000), Is.EqualTo(new Rgb(255, 200, 0)));
            Assert.That(new Rgb(0, 0, 0).SaturationPermille(), Is.EqualTo(0));
            Assert.That(new Rgb(18, 52, 86).ToString(), Is.EqualTo("#123456"));
            Assert.That(new Rgb(1, 2, 3).Equals((object)new Rgb(1, 2, 3)), Is.True);
            Assert.That(new Rgb(1, 2, 3).GetHashCode(), Is.EqualTo(new Rgb(1, 2, 3).GetHashCode()));
            Assert.That(new Rgb(1, 2, 3).Sum, Is.EqualTo(6));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Rgb(256, 0, 0));
            Assert.Throws<ArgumentNullException>(() => PlaceholderStyle.RoleTone(null!));
        }

        // ----- hit targets -----

        [Test]
        public void CssAndDevicePixels()
        {
            Assert.That(HitTargets.DevicePx(44, 96), Is.EqualTo(44), "a desktop is 1:1");
            Assert.That(HitTargets.DevicePx(44, 420), Is.EqualTo(116), "a 420 dpi phone");
            Assert.That(HitTargets.CssPx(116, 2625), Is.EqualTo(44));
            Assert.That(HitTargets.MinTargetPx(true, 160), Is.EqualTo(44));
            Assert.That(HitTargets.MinTargetPx(false, 160), Is.EqualTo(24));
            Assert.Throws<ArgumentOutOfRangeException>(() => HitTargets.DevicePx(-1, 160));
            Assert.Throws<ArgumentOutOfRangeException>(() => HitTargets.CssPx(10, 0));
        }

        [Test]
        public void InflateGrowsSmallRectanglesAroundTheirCentreOnly()
        {
            var small = new PixelRect(100, 100, 120, 140);
            PixelRect grown = HitTargets.Inflate(small, 44);
            Assert.That((grown.Width, grown.Height), Is.EqualTo((44, 44)));
            Assert.That(grown.Left + grown.Width / 2, Is.EqualTo(110));
            var big = new PixelRect(0, 0, 100, 100);
            Assert.That(HitTargets.Inflate(big, 44), Is.EqualTo(big));
            IReadOnlyList<BannerRect> rects = HitTargets.Inflate(new[] { new BannerRect(5, new GridPos(1, 1), small, 7) }, 60);
            Assert.That(rects[0].ScreenRect.Width, Is.EqualTo(60));
            Assert.That(rects[0].UnitId, Is.EqualTo(5));
            Assert.Throws<ArgumentOutOfRangeException>(() => HitTargets.Inflate(small, -1));
            Assert.Throws<ArgumentNullException>(() => HitTargets.Inflate(null!, 10));
        }

        [Test]
        public void OverlapsCountPairsAboveAShareOfTheSmallerRectangle()
        {
            var a = new PixelRect(0, 0, 100, 100);
            var b = new PixelRect(50, 0, 150, 100); // half of each
            var c = new PixelRect(95, 0, 195, 100); // 5 percent of a
            var list = new[] { a, b, c };
            Assert.That(HitTargets.OverlapArea(a, b), Is.EqualTo(5000));
            Assert.That(HitTargets.OverlapArea(a, new PixelRect(200, 200, 300, 300)), Is.EqualTo(0));
            Assert.That(HitTargets.CountOverlaps(list, list, 250), Is.EqualTo(2), "a-b and b-c, not a-c");
            Assert.That(HitTargets.CountOverlaps(new[] { a }, new[] { c }, 10), Is.EqualTo(1));
            Assert.That(HitTargets.CountOverlaps(new[] { a }, new[] { new PixelRect(0, 0, 0, 0) }, 10), Is.EqualTo(0), "empty rectangles never count");
            Assert.Throws<ArgumentNullException>(() => HitTargets.CountOverlaps(null!, list, 1));
            Assert.Throws<ArgumentNullException>(() => HitTargets.CountOverlaps(list, null!, 1));
        }
    }
}
