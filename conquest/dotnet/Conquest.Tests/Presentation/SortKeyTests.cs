using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class SortKeyTests
    {
        [Test]
        public void TileNearerTheViewerSortsHigher()
        {
            Assert.That(SortKey.ForDepthLayer(new GridPos(3, 3), 0, 0), Is.GreaterThan(SortKey.ForDepthLayer(new GridPos(2, 3), 0, 0)));
            Assert.That(SortKey.ForDepthLayer(new GridPos(0, 5), 0, 0), Is.EqualTo(SortKey.ForDepthLayer(new GridPos(5, 0), 0, 0)));
        }

        [Test]
        public void TiebreakThenBiasOrderObjectsOnTheSameTile()
        {
            var tile = new GridPos(4, 4);
            int prop = SortKey.ForDepthLayer(tile, 1, 0);
            int structure = SortKey.ForDepthLayer(tile, 2, 0);
            int unit = SortKey.ForDepthLayer(tile, 3, 0);
            Assert.That(prop, Is.LessThan(structure));
            Assert.That(structure, Is.LessThan(unit));
            Assert.That(SortKey.ForDepthLayer(tile, 3, 9), Is.GreaterThan(unit));
        }

        [Test]
        public void UnitStandingBesideAFortSortsCorrectlyOnAllEightNeighbours()
        {
            GridPos origin = new GridPos(10, 10);
            GridPos front = SortKey.FrontTile(origin, 2, 2);
            Assert.That(front, Is.EqualTo(new GridPos(11, 11)));
            int fort = SortKey.ForDepthLayer(front, 2, 0);
            for (int dy = -1; dy <= 2; dy++)
            {
                for (int dx = -1; dx <= 2; dx++)
                {
                    bool insideFootprint = dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1;
                    if (insideFootprint)
                    {
                        continue;
                    }

                    var unitTile = new GridPos(origin.X + dx, origin.Y + dy);
                    int unit = SortKey.ForDepthLayer(unitTile, 3, 0);
                    bool unitInFront = unitTile.X + unitTile.Y > front.X + front.Y;
                    bool unitBehind = unitTile.X + unitTile.Y < front.X + front.Y;
                    if (unitInFront) Assert.That(unit, Is.GreaterThan(fort), unitTile.ToString());
                    if (unitBehind) Assert.That(unit, Is.LessThan(fort), unitTile.ToString());
                }
            }
        }

        [Test]
        public void LargestKeyFitsAnInt16()
        {
            int max = SortKey.ForDepthLayer(new GridPos(255, 255), SortKey.MaxTiebreak, SortKey.MaxBias);
            Assert.That(max, Is.LessThanOrEqualTo(short.MaxValue));
            int absoluteMax = SortKey.ForDepthLayer(new GridPos(SortKey.MaxDepth, 0), SortKey.MaxTiebreak, SortKey.MaxBias);
            Assert.That(absoluteMax, Is.LessThanOrEqualTo(short.MaxValue));
        }

        [Test]
        public void MovingUnitSwitchesDepthAtTheHalfwayPoint()
        {
            var from = new GridPos(2, 2);
            var to = new GridPos(3, 2);
            Assert.That(SortKey.ForMoving(from, to, 499, 3, 0), Is.EqualTo(SortKey.ForDepthLayer(from, 3, 0)));
            Assert.That(SortKey.ForMoving(from, to, 500, 3, 0), Is.EqualTo(SortKey.ForDepthLayer(to, 3, 0)));
        }

        [Test]
        public void BadArgumentsThrow()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.ForDepthLayer(new GridPos(-1, 0), 0, 0));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.ForDepthLayer(new GridPos(300, 300), 0, 0));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.ForDepthLayer(new GridPos(1, 1), 6, 0));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.ForDepthLayer(new GridPos(1, 1), 0, 10));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.FrontTile(new GridPos(0, 0), 0, 1));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => SortKey.ForFixed(-1));
            Assert.That(SortKey.ForFixed(7), Is.EqualTo(7));
        }
    }
}
