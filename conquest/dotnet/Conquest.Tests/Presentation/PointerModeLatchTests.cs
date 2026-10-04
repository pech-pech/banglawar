using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class PointerModeLatchTests
    {
        private static PointerActivity Frame(bool mouse, bool screen, bool touched = false, bool used = false) =>
            new PointerActivity(mouse, screen, touched, used);

        [Test]
        public void APhoneWithNoMouseIsAlwaysTouchEvenOnQuietFramesAndWhenNothingIsTouched()
        {
            var latch = PointerModeLatch.Start(false, true);
            Assert.That(latch.IsTouch, Is.True);
            for (int i = 0; i < 5; i++) latch = latch.Next(Frame(false, true, touched: i == 2, used: i == 4));
            Assert.That(latch.IsTouch, Is.True);
        }

        [Test]
        public void ADesktopWithNoTouchscreenIsAlwaysMouse()
        {
            var latch = PointerModeLatch.Start(true, false);
            Assert.That(latch.Current, Is.EqualTo(PointerKind.Mouse));
            latch = latch.Next(Frame(true, false, touched: true));
            Assert.That(latch.Current, Is.EqualTo(PointerKind.Mouse));
        }

        [Test]
        public void WithBothDevicesTheModeStaysTouchAfterTheFingerLiftsUntilTheMouseIsUsed()
        {
            var latch = PointerModeLatch.Start(true, true);
            Assert.That(latch.Current, Is.EqualTo(PointerKind.Mouse), "a machine with a mouse starts as mouse");
            latch = latch.Next(Frame(true, true, touched: true));
            Assert.That(latch.IsTouch, Is.True);
            for (int i = 0; i < 30; i++) latch = latch.Next(Frame(true, true));
            Assert.That(latch.IsTouch, Is.True, "no flicker back to mouse while the finger is up");
            latch = latch.Next(Frame(true, true, used: true));
            Assert.That(latch.Current, Is.EqualTo(PointerKind.Mouse));
            for (int i = 0; i < 30; i++) latch = latch.Next(Frame(true, true));
            Assert.That(latch.Current, Is.EqualTo(PointerKind.Mouse), "and stays mouse while the mouse is still");
        }

        [Test]
        public void ATouchAndAMouseMoveInTheSameFrameCountAsTouch()
        {
            var latch = PointerModeLatch.Start(true, true).Next(Frame(true, true, touched: true, used: true));
            Assert.That(latch.IsTouch, Is.True);
        }

        [Test]
        public void UnpluggingTheMouseOnATouchMachineSettlesOnTouch()
        {
            var latch = PointerModeLatch.Start(true, true).Next(Frame(true, true, used: true)).Next(Frame(false, true));
            Assert.That(latch.IsTouch, Is.True);
        }
    }
}
