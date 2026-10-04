using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class IsoProjectionTests
    {
        private readonly IsoProjection iso = new IsoProjection();

        [Test]
        public void GridToWorld_ProjectsTileCentresAtTwoToOne()
        {
            Assert.That(iso.GridToWorld(new GridPos(0, 0)), Is.EqualTo(new PixelPoint(0, 0)));
            Assert.That(iso.GridToWorld(new GridPos(1, 0)), Is.EqualTo(new PixelPoint(128, 64)));
            Assert.That(iso.GridToWorld(new GridPos(0, 1)), Is.EqualTo(new PixelPoint(-128, 64)));
            Assert.That(iso.GridToWorld(new GridPos(1, 1)), Is.EqualTo(new PixelPoint(0, 128)));
        }

        [Test]
        public void WorldToGrid_IsExactInverseOfGridToWorld_ForEveryTileOfA256Map()
        {
            for (int y = 0; y < 256; y += 5)
            {
                for (int x = 0; x < 256; x += 3)
                {
                    var tile = new GridPos(x, y);
                    Assert.That(iso.WorldToGrid(iso.GridToWorld(tile)), Is.EqualTo(tile));
                }
            }
        }

        [Test]
        public void WorldToGrid_AgreesWithTheDiamondTest_ForEveryPixelAroundATile()
        {
            var centre = new GridPos(3, 4);
            PixelPoint c = iso.GridToWorld(centre);
            for (int dy = -64; dy <= 64; dy++)
            {
                for (int dx = -128; dx <= 128; dx++)
                {
                    int sum = System.Math.Abs(dx) * 64 + System.Math.Abs(dy) * 128;
                    GridPos hit = iso.WorldToGrid(new PixelPoint(c.X + dx, c.Y + dy));
                    if (sum < 128 * 64)
                    {
                        Assert.That(hit, Is.EqualTo(centre), "interior pixel " + dx + "," + dy);
                    }
                    else if (sum > 128 * 64)
                    {
                        Assert.That(hit, Is.Not.EqualTo(centre), "exterior pixel " + dx + "," + dy);
                    }
                }
            }
        }

        [Test]
        public void WorldToGrid_HandlesNegativeWorldCoordinates()
        {
            Assert.That(iso.WorldToGrid(new PixelPoint(-128, 64)), Is.EqualTo(new GridPos(0, 1)));
            Assert.That(iso.WorldToGrid(new PixelPoint(0, -100)), Is.EqualTo(new GridPos(-1, -1)));
        }

        [Test]
        public void GridToWorld_Interpolates_AndClampsProgress()
        {
            var a = new GridPos(0, 0);
            var b = new GridPos(1, 0);
            Assert.That(iso.GridToWorld(a, b, 0), Is.EqualTo(new PixelPoint(0, 0)));
            Assert.That(iso.GridToWorld(a, b, 500), Is.EqualTo(new PixelPoint(64, 32)));
            Assert.That(iso.GridToWorld(a, b, 1000), Is.EqualTo(new PixelPoint(128, 64)));
            Assert.That(iso.GridToWorld(a, b, -5), Is.EqualTo(new PixelPoint(0, 0)));
            Assert.That(iso.GridToWorld(a, b, 5000), Is.EqualTo(new PixelPoint(128, 64)));
            Assert.That(iso.GridToWorld(b, a, 333), Is.EqualTo(new PixelPoint(128 - 43, 64 - 22)));
        }

        [Test]
        public void MapBounds_CoversEveryTileDiamond()
        {
            PixelRect bounds = iso.MapBounds(4, 3);
            Assert.That(bounds.Left, Is.EqualTo(-3 * 128));
            Assert.That(bounds.Right, Is.EqualTo(4 * 128));
            Assert.That(bounds.Top, Is.EqualTo(-64));
            Assert.That(bounds.Bottom, Is.EqualTo(6 * 64));
            foreach (GridPos corner in new[] { new GridPos(0, 0), new GridPos(3, 0), new GridPos(0, 2), new GridPos(3, 2) })
            {
                PixelPoint c = iso.GridToWorld(corner);
                Assert.That(c.X - 128, Is.GreaterThanOrEqualTo(bounds.Left));
                Assert.That(c.X + 128, Is.LessThanOrEqualTo(bounds.Right));
                Assert.That(c.Y - 64, Is.GreaterThanOrEqualTo(bounds.Top));
                Assert.That(c.Y + 64, Is.LessThanOrEqualTo(bounds.Bottom));
            }
        }

        [Test]
        public void VisibleTiles_CoversEveryTileWhoseCentreIsInTheRectangle()
        {
            var rect = new PixelRect(-600, 200, 700, 900);
            GridRange? range = iso.VisibleTiles(rect, 64, 64, 0);
            Assert.That(range.HasValue, Is.True);
            for (int y = 0; y < 64; y++)
            {
                for (int x = 0; x < 64; x++)
                {
                    PixelPoint c = iso.GridToWorld(new GridPos(x, y));
                    if (rect.Contains(c.X, c.Y))
                    {
                        Assert.That(range!.Value.Contains(new GridPos(x, y)), Is.True, x + "," + y);
                    }
                }
            }
        }

        [Test]
        public void VisibleTiles_ClampsToTheMap_WidensByTheMargin_AndMissesCleanly()
        {
            var huge = new PixelRect(-100000, -100000, 100000, 100000);
            GridRange? all = iso.VisibleTiles(huge, 8, 6, 2);
            Assert.That(all!.Value.TileCount, Is.EqualTo(48));
            var small = new PixelRect(-10, 100, 10, 120);
            GridRange tight = iso.VisibleTiles(small, 64, 64, 0)!.Value;
            GridRange wide = iso.VisibleTiles(small, 64, 64, 3)!.Value;
            Assert.That(wide.TileCount, Is.GreaterThan(tight.TileCount));
            Assert.That(iso.VisibleTiles(new PixelRect(5000, 5000, 5100, 5100), 4, 4, 0), Is.Null);
            Assert.Throws<System.ArgumentException>(() => iso.VisibleTiles(small, 0, 4, 0));
            Assert.Throws<System.ArgumentException>(() => iso.VisibleTiles(small, 4, 4, -1));
        }

        [Test]
        public void IsInside_ChecksMapRectangle()
        {
            Assert.That(iso.IsInside(new GridPos(0, 0), 4, 3), Is.True);
            Assert.That(iso.IsInside(new GridPos(3, 2), 4, 3), Is.True);
            Assert.That(iso.IsInside(new GridPos(4, 2), 4, 3), Is.False);
            Assert.That(iso.IsInside(new GridPos(-1, 0), 4, 3), Is.False);
            Assert.That(iso.IsInside(new GridPos(0, 3), 4, 3), Is.False);
        }

        [Test]
        public void Constructor_RejectsBadTileSizes()
        {
            Assert.Throws<System.ArgumentException>(() => new IsoProjection(0, 128));
            Assert.Throws<System.ArgumentException>(() => new IsoProjection(255, 128));
            Assert.Throws<System.ArgumentException>(() => new IsoProjection(256, -2));
            Assert.Throws<System.ArgumentException>(() => iso.MapBounds(0, 3));
        }

        [Test]
        public void SmallerTileSizesStayExact()
        {
            var small = new IsoProjection(64, 32);
            var tile = new GridPos(17, 9);
            Assert.That(small.WorldToGrid(small.GridToWorld(tile)), Is.EqualTo(tile));
        }
    }

    public class GridTypesTests
    {
        [Test]
        public void GridPos_EqualityHashAndOrder()
        {
            var a = new GridPos(2, 3);
            Assert.That(a == new GridPos(2, 3), Is.True);
            Assert.That(a != new GridPos(3, 2), Is.True);
            Assert.That(a.Equals((object)new GridPos(2, 3)), Is.True);
            Assert.That(a.Equals("x"), Is.False);
            Assert.That(a.GetHashCode(), Is.EqualTo(new GridPos(2, 3).GetHashCode()));
            Assert.That(new GridPos(5, 1).CompareTo(new GridPos(0, 2)), Is.LessThan(0));
            Assert.That(new GridPos(1, 2).CompareTo(new GridPos(0, 2)), Is.GreaterThan(0));
            Assert.That(a.CompareTo(a), Is.EqualTo(0));
            Assert.That(a.ToString(), Is.EqualTo("(2,3)"));
        }

        [Test]
        public void PixelTypes_BehaveAsValues()
        {
            var p = new PixelPoint(1, 2);
            Assert.That(p == new PixelPoint(1, 2), Is.True);
            Assert.That(p != new PixelPoint(2, 1), Is.True);
            Assert.That(p.Equals((object)new PixelPoint(1, 2)), Is.True);
            Assert.That(p.GetHashCode(), Is.EqualTo(new PixelPoint(1, 2).GetHashCode()));
            Assert.That(p.ToString(), Is.EqualTo("[1,2]"));
            var r = new PixelRect(0, 0, 10, 5);
            Assert.That(r.Width, Is.EqualTo(10));
            Assert.That(r.Height, Is.EqualTo(5));
            Assert.That(r.Contains(0, 0), Is.True);
            Assert.That(r.Contains(10, 4), Is.False);
            Assert.That(r.ToString(), Does.Contain("10"));
        }

        [TestCase(1, 0, Facing.SE)]
        [TestCase(0, 1, Facing.SW)]
        [TestCase(-1, 0, Facing.NW)]
        [TestCase(0, -1, Facing.NE)]
        [TestCase(1, 1, Facing.S)]
        [TestCase(-1, -1, Facing.N)]
        [TestCase(1, -1, Facing.E)]
        [TestCase(-1, 1, Facing.W)]
        [TestCase(5, 0, Facing.SE)]
        public void Facing_FromGridDelta(int dx, int dy, Facing expected)
        {
            Assert.That(FacingMath.FromDelta(dx, dy, Facing.N), Is.EqualTo(expected));
        }

        [Test]
        public void Facing_ZeroDeltaKeepsFallback()
        {
            Assert.That(FacingMath.FromDelta(0, 0, Facing.W), Is.EqualTo(Facing.W));
        }

        [TestCase(Facing.SW, Facing.SE, true)]
        [TestCase(Facing.W, Facing.E, true)]
        [TestCase(Facing.NW, Facing.NE, true)]
        [TestCase(Facing.S, Facing.S, false)]
        [TestCase(Facing.N, Facing.N, false)]
        [TestCase(Facing.E, Facing.E, false)]
        public void Facing_RenderDirectionMirrorsTheWestSide(Facing input, Facing rendered, bool mirrored)
        {
            Assert.That(FacingMath.RenderDirection(input, out bool flip), Is.EqualTo(rendered));
            Assert.That(flip, Is.EqualTo(mirrored));
        }

        [Test]
        public void Facing_ToFourWayRotatesDiagonalsToGridAxes()
        {
            Assert.That(FacingMath.ToFourWay(Facing.N), Is.EqualTo(Facing.NE));
            Assert.That(FacingMath.ToFourWay(Facing.E), Is.EqualTo(Facing.SE));
            Assert.That(FacingMath.ToFourWay(Facing.S), Is.EqualTo(Facing.SW));
            Assert.That(FacingMath.ToFourWay(Facing.W), Is.EqualTo(Facing.NW));
            Assert.That(FacingMath.ToFourWay(Facing.SE), Is.EqualTo(Facing.SE));
        }
    }
}
