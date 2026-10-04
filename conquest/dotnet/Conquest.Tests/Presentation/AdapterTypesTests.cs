using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class AdapterTypesTests
    {
        [Test]
        public void MovePlan_HoldsWhatTheCoreReported()
        {
            var steps = new[] { new PathStep(new GridPos(1, 0), 2) };
            var plan = new MovePlan(new GridPos(0, 0), steps, 4, 6);
            Assert.That(plan.Origin, Is.EqualTo(new GridPos(0, 0)));
            Assert.That(plan.Steps, Has.Count.EqualTo(1));
            Assert.That(plan.Steps[0].Cost, Is.EqualTo(2));
            Assert.That(plan.MovePointsLeft, Is.EqualTo(4));
            Assert.That(plan.MovePointsPerTurn, Is.EqualTo(6));
        }

        [Test]
        public void PresentationCommand_AndResult_CarryTheirFields()
        {
            var command = new PresentationCommand(CommandKind.Move, new[] { 1, 2 }, new GridPos(5, 5), "x");
            Assert.That(command.Kind, Is.EqualTo(CommandKind.Move));
            Assert.That(command.UnitIds, Is.EqualTo(new[] { 1, 2 }));
            Assert.That(command.Target, Is.EqualTo(new GridPos(5, 5)));
            Assert.That(command.Detail, Is.EqualTo("x"));
            var refused = new CommandOutcome(false, "err.not_flat");
            Assert.That(refused.Accepted, Is.False);
            Assert.That(refused.ErrorCode, Is.EqualTo("err.not_flat"));
        }

        [Test]
        public void ZoomStepsOfZeroChangeNothing()
        {
            CameraModel cam = CameraModel.Create(new IsoProjection().MapBounds(8, 8), 800, 600, 0);
            Assert.That(cam.ZoomSteps(0, 400, 300), Is.SameAs(cam));
        }
    }
}
