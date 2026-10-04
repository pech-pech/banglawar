using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class LayeringAndPlacementTests
    {
        // ----- draw order -----

        private static DrawKey Tree(GridPos tile) => DrawOrder.World(SortKey.ForDepthLayer(tile, 0, 0));

        private static DrawKey House(GridPos tile) => DrawOrder.World(SortKey.ForDepthLayer(tile, 2, 0));

        private static DrawKey Banner(LayeringMode mode, GridPos tile) => DrawOrder.Banner(mode, SortKey.ForDepthLayer(tile, 3, 0));

        [Test]
        public void BandsPutEveryPathDotAboveAllArtAndBelowEveryBanner()
        {
            var tiles = new[] { new GridPos(0, 0), new GridPos(5, 5), new GridPos(11, 9), new GridPos(255, 255) };
            foreach (GridPos dotTile in tiles)
            {
                DrawKey dot = DrawOrder.Overlay(LayeringMode.Bands, dotTile, 3);
                foreach (GridPos other in tiles)
                {
                    Assert.That(dot.CompareTo(Tree(other)), Is.GreaterThan(0), "dot " + dotTile + " over the tree on " + other);
                    Assert.That(dot.CompareTo(House(other)), Is.GreaterThan(0));
                    Assert.That(dot.CompareTo(Banner(LayeringMode.Bands, other)), Is.LessThan(0), "dot " + dotTile + " under the banner on " + other);
                }
            }
        }

        [Test]
        public void BandsKeepBannersDepthSortedAmongThemselves()
        {
            DrawKey back = Banner(LayeringMode.Bands, new GridPos(2, 2));
            DrawKey front = Banner(LayeringMode.Bands, new GridPos(3, 3));
            Assert.That(front.CompareTo(back), Is.GreaterThan(0));
            Assert.That(DrawOrder.GroupOrder(LayeringMode.Bands, DrawRole.Banner), Is.EqualTo(DrawOrder.BannerBand));
            Assert.That(DrawOrder.GroupOrder(LayeringMode.Bands, DrawRole.Overlay), Is.EqualTo(DrawOrder.OverlayBand));
            Assert.That(DrawOrder.GroupOrder(LayeringMode.Bands, DrawRole.Terrain), Is.Null);
            Assert.That(DrawOrder.GroupOrder(LayeringMode.OverlayOnTop, DrawRole.Banner), Is.Null);
            Assert.That(DrawOrder.OverlayBand, Is.GreaterThan(SortKey.ForDepthLayer(new GridPos(255, 255), SortKey.MaxTiebreak, SortKey.MaxBias)));
            Assert.That(DrawOrder.BannerBand, Is.LessThanOrEqualTo(short.MaxValue));
        }

        [Test]
        public void TheOldLayeringDrewDotsOverBanners()
        {
            DrawKey dot = DrawOrder.Overlay(LayeringMode.OverlayOnTop, new GridPos(1, 1), 0);
            Assert.That(dot.CompareTo(Banner(LayeringMode.OverlayOnTop, new GridPos(9, 9))), Is.GreaterThan(0));
            Assert.That(dot.ToString(), Does.StartWith("world"));
        }

        [Test]
        public void InDepthDotsSitOnTheirTileButTallArtInFrontCoversThem()
        {
            var tile = new GridPos(4, 4);
            DrawKey dot = DrawOrder.Overlay(LayeringMode.OverlayInDepth, tile, 0);
            Assert.That(dot.CompareTo(Tree(tile)), Is.GreaterThan(0));
            Assert.That(dot.CompareTo(House(tile)), Is.GreaterThan(0));
            Assert.That(dot.CompareTo(Banner(LayeringMode.OverlayInDepth, tile)), Is.LessThan(0));
            Assert.That(dot.CompareTo(Tree(new GridPos(5, 4))), Is.LessThan(0), "the tree one row nearer hides the dot");
            Assert.That(DrawOrder.Overlay(LayeringMode.OverlayInDepth, tile, 9).CompareTo(Banner(LayeringMode.OverlayInDepth, tile)), Is.LessThan(0));
        }

        [Test]
        public void DrawKeyComparesGroupsByTheirOwnOrder()
        {
            var loose = new DrawKey(0, 100);
            var group = new DrawKey(100, -5);
            Assert.That(group.CompareTo(loose), Is.GreaterThan(0), "same outer order: the group draws after");
            Assert.That(new DrawKey(0, 5).CompareTo(new DrawKey(0, 4)), Is.GreaterThan(0));
            Assert.That(group.ToString(), Is.EqualTo("band 100/-5"));
            Assert.Throws<ArgumentOutOfRangeException>(() => DrawOrder.Overlay(LayeringMode.Bands, new GridPos(0, 0), 10));
            Assert.Throws<ArgumentOutOfRangeException>(() => DrawOrder.Overlay((LayeringMode)7, new GridPos(0, 0), 0));
        }

        [Test]
        public void StackedUnitKeysPutTheFrontLastAndStayInsideTheirRow()
        {
            var tile = new GridPos(3, 4);
            int front = SortKey.ForStackedUnit(tile, 0, false);
            int back = SortKey.ForStackedUnit(tile, 1, false);
            Assert.That(front, Is.GreaterThan(back));
            Assert.That(SortKey.ForStackedUnit(tile, 0, true), Is.EqualTo(front + 1), "hologram over its clay");
            Assert.That(SortKey.ForStackedUnit(tile, 1, true), Is.LessThan(front), "a back hologram stays behind the front clay");
            Assert.That(SortKey.ForStackedUnit(tile, 0, true), Is.LessThan(SortKey.ForDepthLayer(new GridPos(4, 4), 0, 0)), "below the next row's terrain");
            Assert.That(SortKey.ForStackedUnit(tile, 99, false), Is.EqualTo(SortKey.ForDepthLayer(tile, 3, 0)));
            Assert.That(SortKey.ForStackedUnit(tile, 7, false), Is.GreaterThan(SortKey.ForDepthLayer(tile, 2, 9)), "above structures of the same row");
            Assert.Throws<ArgumentOutOfRangeException>(() => SortKey.ForStackedUnit(tile, -1, false));
        }

        // ----- footprints -----

        [Test]
        public void TopLeftConventionOverhangsTheEastEdgeAtElevenSix()
        {
            FootprintPlacementResult p = FootprintPlacement.Place(new GridPos(11, 6), 2, 2, AnchorConvention.TopLeft);
            Assert.That(FootprintPlacement.OffMapTiles(p, 12, 10), Is.EqualTo(2), "x = 12 is off a 12-wide map");
            Assert.That(p.Front, Is.EqualTo(new GridPos(12, 7)));
        }

        [Test]
        public void FrontTileConventionFitsElevenSixButCoversTheCapitalsPort()
        {
            FootprintPlacementResult zone = FootprintPlacement.Place(new GridPos(11, 6), 2, 2, AnchorConvention.FrontTile);
            Assert.That(FootprintPlacement.OffMapTiles(zone, 12, 10), Is.EqualTo(0));
            Assert.That(zone.Origin, Is.EqualTo(new GridPos(10, 5)));
            Assert.That(zone.Front, Is.EqualTo(new GridPos(11, 6)));

            FootprintPlacementResult capital = FootprintPlacement.Place(new GridPos(9, 8), 2, 2, AnchorConvention.FrontTile);
            var buildings = new[] { new GridPos(7, 8), new GridPos(9, 9), new GridPos(10, 9), new GridPos(11, 9), new GridPos(8, 7) };
            Assert.That(FootprintPlacement.CoveredOthers(capital, new GridPos(9, 8), buildings), Is.EqualTo(1), "the port at (8,7)");
            FootprintPlacementResult topLeft = FootprintPlacement.Place(new GridPos(9, 8), 2, 2, AnchorConvention.TopLeft);
            Assert.That(FootprintPlacement.CoveredOthers(topLeft, new GridPos(9, 8), buildings), Is.EqualTo(2), "scout post and food at (9,9), (10,9)");
        }

        [Test]
        public void RuleTileConventionCoversOnlyTheAnchorAtHalfScale()
        {
            FootprintPlacementResult p = FootprintPlacement.Place(new GridPos(11, 6), 2, 2, AnchorConvention.RuleTileFitted);
            Assert.That(p.Tiles(), Is.EqualTo(new[] { new GridPos(11, 6) }));
            Assert.That(p.ScalePermille, Is.EqualTo(500));
            Assert.That(FootprintPlacement.OffMapTiles(p, 12, 10), Is.EqualTo(0));
            Assert.That(p.CentreWorld(new IsoProjection()), Is.EqualTo(new IsoProjection().GridToWorld(new GridPos(11, 6))));
            FootprintPlacementResult single = FootprintPlacement.Place(new GridPos(3, 3), 1, 1, AnchorConvention.RuleTileFitted);
            Assert.That(single.ScalePermille, Is.EqualTo(1000));
        }

        [Test]
        public void FootprintCentreIsTheMiddleOfTheCoveredDiamond()
        {
            var iso = new IsoProjection();
            FootprintPlacementResult p = FootprintPlacement.Place(new GridPos(2, 2), 2, 2, AnchorConvention.TopLeft);
            PixelPoint a = iso.GridToWorld(new GridPos(2, 2));
            PixelPoint d = iso.GridToWorld(new GridPos(3, 3));
            Assert.That(p.CentreWorld(iso), Is.EqualTo(new PixelPoint((a.X + d.X) / 2, (a.Y + d.Y) / 2)));
            Assert.Throws<ArgumentNullException>(() => p.CentreWorld(null!));
            Assert.Throws<ArgumentOutOfRangeException>(() => FootprintPlacement.Place(new GridPos(0, 0), 0, 1, AnchorConvention.TopLeft));
            Assert.Throws<ArgumentOutOfRangeException>(() => FootprintPlacement.Place(new GridPos(0, 0), 1, 1, (AnchorConvention)8));
            Assert.Throws<ArgumentNullException>(() => FootprintPlacement.CoveredOthers(p, new GridPos(2, 2), null!));
            Assert.That(FootprintPlacement.OffMapTiles(FootprintPlacement.Place(new GridPos(0, 0), 2, 2, AnchorConvention.FrontTile), 12, 10), Is.EqualTo(3));
        }
    }
}
