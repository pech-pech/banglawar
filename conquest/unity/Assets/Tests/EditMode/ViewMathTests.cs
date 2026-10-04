using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace Conquest.UnityView.Tests
{
    public sealed class ViewMathTests
    {
        [Test]
        public void WorldConversionRoundTripsAndFlipsY()
        {
            var p = new PixelPoint(512, 192);

            Vector3 w = ViewSpace.ToWorld(p, 256);

            Assert.AreEqual(2f, w.x, 1e-5f);
            Assert.AreEqual(-0.75f, w.y, 1e-5f);
            Assert.AreEqual(p, ViewSpace.FromWorld(w, 256));
        }

        [Test]
        public void ScreenConversionFlipsTheOrigin()
        {
            Vector2Int model = ViewSpace.ToModelScreen(new Vector2(100, 700), 720);

            Assert.AreEqual(new Vector2Int(100, 20), model);
            Assert.AreEqual(new Vector2(100, 700), ViewSpace.ToUnityScreen(100, 20, 720));
        }

        [TestCase(720, 1000, 256, 1.40625f)]
        [TestCase(720, 500, 256, 2.8125f)]
        [TestCase(720, 2000, 256, 0.703125f)]
        public void OrthographicSizeShowsOneWorldPixelPerScreenPixelAtZoomOne(int height, int zoom, int ppu, float expected)
        {
            Assert.AreEqual(expected, CameraRig.OrthographicSize(height, zoom, ppu), 1e-4f);
        }

        [Test]
        public void SortKeysStayInsideTheSixteenBitRangeOnTheSliceMap()
        {
            int key = SortKey.ForDepthLayer(new GridPos(11, 9), 3, 8);

            Assert.Less(key, 30000, "below the overlay order");
        }

        [Test]
        public void TilePickingFindsTheTileUnderTheCameraCentre()
        {
            var iso = new IsoProjection();
            CameraModel cam = CameraModel.Create(iso.MapBounds(12, 10), 1280, 720, CameraRig.MarginPx);
            var centre = iso.WorldToGrid(cam.ScreenToWorld(640, 360));

            Assert.IsTrue(iso.IsInside(centre, 12, 10));
        }
    }
}
