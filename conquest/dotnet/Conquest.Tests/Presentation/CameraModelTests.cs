using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class CameraModelTests
    {
        private static readonly IsoProjection Iso = new IsoProjection();

        private static CameraModel Camera(int mapW = 128, int mapH = 128, int vw = 1280, int vh = 720)
        {
            return CameraModel.Create(Iso.MapBounds(mapW, mapH), vw, vh, 256);
        }

        [Test]
        public void Create_CentresOnTheMapAtZoomOne()
        {
            CameraModel cam = Camera();
            Assert.That(cam.ZoomPermille, Is.EqualTo(1000));
            PixelRect b = Iso.MapBounds(128, 128);
            Assert.That(cam.CenterX, Is.EqualTo(b.Left + b.Width / 2));
            Assert.That(cam.CenterY, Is.EqualTo(b.Top + b.Height / 2));
        }

        [Test]
        public void ScreenAndWorldRoundTripAtZoomOneAndTwo()
        {
            CameraModel cam = Camera();
            PixelPoint w = cam.ScreenToWorld(100, 200);
            Assert.That(cam.WorldToScreen(w), Is.EqualTo(new PixelPoint(100, 200)));
            CameraModel zoomed = cam.ZoomTo(2000, 640, 360);
            PixelPoint w2 = zoomed.ScreenToWorld(300, 100);
            Assert.That(zoomed.WorldToScreen(w2), Is.EqualTo(new PixelPoint(300, 100)));
        }

        [Test]
        public void PanByScreenDelta_MovesTheWorldWithThePointer()
        {
            CameraModel cam = Camera();
            PixelPoint before = cam.ScreenToWorld(640, 360);
            CameraModel panned = cam.PanByScreenDelta(100, 50);
            Assert.That(panned.CenterX, Is.EqualTo(cam.CenterX - 100));
            Assert.That(panned.CenterY, Is.EqualTo(cam.CenterY - 50));
            Assert.That(panned.WorldToScreen(before), Is.EqualTo(new PixelPoint(740, 410)));
        }

        [Test]
        public void PanIsScaledByZoom()
        {
            CameraModel cam = Camera().ZoomTo(500, 640, 360);
            CameraModel panned = cam.PanByScreenDelta(100, 0);
            Assert.That(panned.CenterX, Is.EqualTo(cam.CenterX - 200));
        }

        [Test]
        public void Pan_IsClampedToTheMapPlusMargin()
        {
            CameraModel cam = Camera();
            CameraModel far = cam.PanByScreenDelta(-10_000_000, 10_000_000);
            PixelRect b = Iso.MapBounds(128, 128);
            Assert.That(far.CenterX, Is.LessThanOrEqualTo(b.Right + 256));
            Assert.That(far.CenterY, Is.GreaterThanOrEqualTo(b.Top - 256));
            PixelRect visible = far.VisibleWorld();
            Assert.That(visible.Right, Is.LessThanOrEqualTo(b.Right + 256 + 1));
            Assert.That(visible.Top, Is.GreaterThanOrEqualTo(b.Top - 256 - 1));
        }

        [Test]
        public void SmallMapSmallerThanTheViewport_StaysCentred()
        {
            CameraModel cam = Camera(2, 2, 4000, 4000);
            CameraModel panned = cam.PanByScreenDelta(5000, 5000);
            Assert.That(panned.CenterX, Is.EqualTo(cam.CenterX));
            Assert.That(panned.CenterY, Is.EqualTo(cam.CenterY));
        }

        [Test]
        public void ZoomSteps_WalkTheStopsAndStopAtTheEnds()
        {
            CameraModel cam = Camera();
            Assert.That(cam.ZoomSteps(1, 640, 360).ZoomPermille, Is.EqualTo(1400));
            Assert.That(cam.ZoomSteps(2, 640, 360).ZoomPermille, Is.EqualTo(2000));
            Assert.That(cam.ZoomSteps(9, 640, 360).ZoomPermille, Is.EqualTo(2000));
            Assert.That(cam.ZoomSteps(-1, 640, 360).ZoomPermille, Is.EqualTo(700));
            Assert.That(cam.ZoomSteps(-9, 640, 360).ZoomPermille, Is.EqualTo(250));
        }

        [Test]
        public void ZoomSteps_FromBetweenStopsSnapsToTheNextStopInTheDirection()
        {
            CameraModel cam = Camera().ZoomTo(1200, 640, 360);
            Assert.That(cam.ZoomSteps(1, 640, 360).ZoomPermille, Is.EqualTo(1400));
            Assert.That(cam.ZoomSteps(-1, 640, 360).ZoomPermille, Is.EqualTo(1000));
            CameraModel below = Camera().ZoomTo(1100, 640, 360);
            Assert.That(below.ZoomSteps(1, 640, 360).ZoomPermille, Is.EqualTo(1400));
            Assert.That(below.ZoomSteps(-1, 640, 360).ZoomPermille, Is.EqualTo(1000));
        }

        [Test]
        public void ZoomTo_KeepsTheWorldPointUnderTheAnchorFixed()
        {
            CameraModel cam = Camera();
            PixelPoint under = cam.ScreenToWorld(900, 200);
            CameraModel zoomed = cam.ZoomTo(1400, 900, 200);
            PixelPoint now = zoomed.ScreenToWorld(900, 200);
            Assert.That(System.Math.Abs(now.X - under.X), Is.LessThanOrEqualTo(1));
            Assert.That(System.Math.Abs(now.Y - under.Y), Is.LessThanOrEqualTo(1));
        }

        [Test]
        public void ZoomTo_ClampsToTheAllowedRange()
        {
            CameraModel cam = Camera();
            Assert.That(cam.ZoomTo(5, 0, 0).ZoomPermille, Is.EqualTo(CameraModel.MinZoom));
            Assert.That(cam.ZoomTo(99999, 0, 0).ZoomPermille, Is.EqualTo(CameraModel.MaxZoom));
        }

        [Test]
        public void CenterOn_AndWithViewport_Work()
        {
            CameraModel cam = Camera();
            PixelPoint target = Iso.GridToWorld(new GridPos(60, 60));
            Assert.That(cam.CenterOn(target).CenterX, Is.EqualTo(target.X));
            CameraModel wide = cam.WithViewport(1920, 1080);
            Assert.That(wide.ViewportWidth, Is.EqualTo(1920));
            Assert.That(wide.ScreenToWorld(960, 540), Is.EqualTo(new PixelPoint(wide.CenterX, wide.CenterY)));
        }

        [Test]
        public void BadArgumentsThrow()
        {
            PixelRect b = Iso.MapBounds(8, 8);
            Assert.Throws<System.ArgumentException>(() => CameraModel.Create(b, 0, 100, 0));
            Assert.Throws<System.ArgumentException>(() => CameraModel.Create(b, 100, 100, -1));
            Assert.Throws<System.ArgumentException>(() => CameraModel.Create(new PixelRect(0, 0, 0, 0), 100, 100, 0));
            Assert.Throws<System.ArgumentException>(() => Camera().WithViewport(0, 10));
        }
    }
}
