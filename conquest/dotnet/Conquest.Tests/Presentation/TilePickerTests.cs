using System.Collections.Generic;
using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class TilePickerTests
    {
        private sealed class FakeOccupancy : ITileOccupancy
        {
            public Dictionary<GridPos, int> Units { get; } = new Dictionary<GridPos, int>();

            public int? UnitAt(GridPos tile) => Units.TryGetValue(tile, out int id) ? id : (int?)null;
        }

        private static readonly IsoProjection Iso = new IsoProjection();
        private static readonly IReadOnlyList<BannerRect> NoBanners = new List<BannerRect>();

        private static CameraModel Camera() => CameraModel.Create(Iso.MapBounds(16, 16), 1280, 720, 256);

        [Test]
        public void PickingThroughTheCameraFindsTheTileDrawnUnderThePointer()
        {
            CameraModel cam = Camera();
            var occupancy = new FakeOccupancy();
            for (int y = 0; y < 16; y += 3)
            {
                for (int x = 0; x < 16; x += 2)
                {
                    var tile = new GridPos(x, y);
                    PixelPoint screen = cam.WorldToScreen(Iso.GridToWorld(tile));
                    PickResult hit = TilePicker.Pick(cam, Iso, 16, 16, screen.X, screen.Y, NoBanners, occupancy);
                    Assert.That(hit.Tile, Is.EqualTo((GridPos?)tile));
                    Assert.That(hit.UnitId, Is.Null);
                }
            }
        }

        [Test]
        public void ZoomedCameraStillPicksTheRightTile()
        {
            CameraModel cam = Camera().ZoomTo(500, 640, 360).CenterOn(Iso.GridToWorld(new GridPos(8, 8)));
            var tile = new GridPos(9, 7);
            PixelPoint screen = cam.WorldToScreen(Iso.GridToWorld(tile));
            PickResult hit = TilePicker.Pick(cam, Iso, 16, 16, screen.X, screen.Y, NoBanners, new FakeOccupancy());
            Assert.That(hit.Tile, Is.EqualTo((GridPos?)tile));
        }

        [Test]
        public void PointerOffTheMapPicksNothing()
        {
            CameraModel cam = Camera();
            PixelPoint outside = cam.WorldToScreen(Iso.GridToWorld(new GridPos(40, 40)));
            PickResult hit = TilePicker.Pick(cam, Iso, 16, 16, outside.X, outside.Y, NoBanners, new FakeOccupancy());
            Assert.That(hit.Tile, Is.Null);
            Assert.That(hit.UnitId, Is.Null);
        }

        [Test]
        public void ReportsTheUnitStandingOnThePickedTile()
        {
            CameraModel cam = Camera();
            var occupancy = new FakeOccupancy();
            occupancy.Units[new GridPos(4, 4)] = 77;
            PixelPoint screen = cam.WorldToScreen(Iso.GridToWorld(new GridPos(4, 4)));
            PickResult hit = TilePicker.Pick(cam, Iso, 16, 16, screen.X, screen.Y, NoBanners, occupancy);
            Assert.That(hit.UnitId, Is.EqualTo((int?)77));
        }

        [Test]
        public void BannersWinOverTerrain_AndTheFrontMostBannerWins()
        {
            CameraModel cam = Camera();
            var banners = new List<BannerRect>
            {
                new BannerRect(5, new GridPos(2, 2), new PixelRect(100, 100, 140, 200), 100),
                new BannerRect(6, new GridPos(3, 3), new PixelRect(110, 100, 150, 200), 200),
                new BannerRect(4, new GridPos(3, 2), new PixelRect(110, 100, 150, 200), 200),
                new BannerRect(9, new GridPos(9, 9), new PixelRect(500, 500, 540, 600), 999),
            };
            PickResult hit = TilePicker.Pick(cam, Iso, 16, 16, 120, 150, banners, new FakeOccupancy());
            Assert.That(hit.UnitId, Is.EqualTo((int?)4));
            Assert.That(hit.Tile, Is.EqualTo((GridPos?)new GridPos(3, 2)));
            PickResult only = TilePicker.Pick(cam, Iso, 16, 16, 102, 150, banners, new FakeOccupancy());
            Assert.That(only.UnitId, Is.EqualTo((int?)5));
        }

        [Test]
        public void NullArgumentsThrow()
        {
            CameraModel cam = Camera();
            var occ = new FakeOccupancy();
            Assert.Throws<System.ArgumentNullException>(() => TilePicker.Pick(null!, Iso, 1, 1, 0, 0, NoBanners, occ));
            Assert.Throws<System.ArgumentNullException>(() => TilePicker.Pick(cam, null!, 1, 1, 0, 0, NoBanners, occ));
            Assert.Throws<System.ArgumentNullException>(() => TilePicker.Pick(cam, Iso, 1, 1, 0, 0, null!, occ));
            Assert.Throws<System.ArgumentNullException>(() => TilePicker.Pick(cam, Iso, 1, 1, 0, 0, NoBanners, null!));
            Assert.That(PickResult.Nothing.Tile, Is.Null);
        }
    }
}
