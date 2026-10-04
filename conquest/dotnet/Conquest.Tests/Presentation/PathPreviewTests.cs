using System.Collections.Generic;
using System.Linq;
using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class PathPreviewTests
    {
        private static List<PathStep> Line(int count, int cost)
        {
            return Enumerable.Range(1, count).Select(i => new PathStep(new GridPos(i, 0), cost)).ToList();
        }

        [Test]
        public void ShortPathFitsInTheMovementLeft()
        {
            PathPreview p = PathPreview.Build(new GridPos(0, 0), Line(3, 2), 6, 6);
            Assert.That(p.Found, Is.True);
            Assert.That(p.Steps.Count, Is.EqualTo(3));
            Assert.That(p.TotalCost, Is.EqualTo(6));
            Assert.That(p.StepsThisTurn, Is.EqualTo(3));
            Assert.That(p.TurnsNeeded, Is.EqualTo(1));
            Assert.That(p.Steps.Select(s => s.CumulativeCost), Is.EqualTo(new[] { 2, 4, 6 }));
            Assert.That(p.Steps.Last().IsDestination, Is.True);
            Assert.That(p.Steps.Take(2).Any(s => s.IsDestination || s.IsTurnEnd), Is.False);
        }

        [Test]
        public void LongPathSplitsIntoTurns_WithMarkersOnTheLastStepOfEachTurn()
        {
            PathPreview p = PathPreview.Build(new GridPos(0, 0), Line(7, 1), 3, 4);
            Assert.That(p.Steps.Select(s => s.TurnIndex), Is.EqualTo(new[] { 0, 0, 0, 1, 1, 1, 1 }));
            Assert.That(p.Steps.Select(s => s.IsTurnEnd), Is.EqualTo(new[] { false, false, true, false, false, false, false }));
            Assert.That(p.StepsThisTurn, Is.EqualTo(3));
            Assert.That(p.TurnsNeeded, Is.EqualTo(2));
        }

        [Test]
        public void WhenNoMovementIsLeftEveryStepWaitsForNextTurn()
        {
            PathPreview p = PathPreview.Build(new GridPos(0, 0), Line(2, 1), 0, 3);
            Assert.That(p.StepsThisTurn, Is.EqualTo(0));
            Assert.That(p.Steps.All(s => s.TurnIndex == 1), Is.True);
        }

        [Test]
        public void AStepDearerThanAWholeTurnIsStillTakenAlone()
        {
            var steps = new List<PathStep> { new PathStep(new GridPos(1, 0), 5), new PathStep(new GridPos(2, 0), 5) };
            PathPreview p = PathPreview.Build(new GridPos(0, 0), steps, 3, 3);
            Assert.That(p.Steps.Select(s => s.TurnIndex), Is.EqualTo(new[] { 0, 1 }));
            Assert.That(p.TotalCost, Is.EqualTo(10));
        }

        [Test]
        public void ADearStepOnAFullTurnStartsImmediately()
        {
            var steps = new List<PathStep> { new PathStep(new GridPos(1, 0), 5) };
            PathPreview p = PathPreview.Build(new GridPos(0, 0), steps, 3, 3);
            Assert.That(p.Steps[0].TurnIndex, Is.EqualTo(0));
        }

        [Test]
        public void FacingFollowsEachStep_AndZeroCostStepsAreAllowed()
        {
            var steps = new List<PathStep>
            {
                new PathStep(new GridPos(1, 0), 1),
                new PathStep(new GridPos(1, 1), 0),
                new PathStep(new GridPos(0, 0), 1),
            };
            PathPreview p = PathPreview.Build(new GridPos(0, 0), steps, 5, 5);
            Assert.That(p.Steps.Select(s => s.Facing), Is.EqualTo(new[] { Facing.SE, Facing.SW, Facing.N }));
        }

        [Test]
        public void EmptyPathIsNone()
        {
            PathPreview p = PathPreview.Build(new GridPos(0, 0), new List<PathStep>(), 5, 5);
            Assert.That(p, Is.SameAs(PathPreview.None));
            Assert.That(p.Found, Is.False);
            Assert.That(p.TurnsNeeded, Is.EqualTo(0));
            Assert.That(p.StepsThisTurn, Is.EqualTo(0));
        }

        [Test]
        public void InvalidInputThrows()
        {
            var origin = new GridPos(0, 0);
            Assert.Throws<System.ArgumentNullException>(() => PathPreview.Build(origin, null!, 1, 1));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => PathPreview.Build(origin, Line(1, 1), 1, 0));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => PathPreview.Build(origin, Line(1, 1), -1, 1));
            Assert.Throws<System.ArgumentException>(() => PathPreview.Build(origin, new List<PathStep> { new PathStep(new GridPos(2, 0), 1) }, 1, 1));
            Assert.Throws<System.ArgumentException>(() => PathPreview.Build(origin, new List<PathStep> { new PathStep(origin, 1) }, 1, 1));
            Assert.Throws<System.ArgumentException>(() => PathPreview.Build(origin, new List<PathStep> { new PathStep(new GridPos(1, 0), -1) }, 1, 1));
        }
    }
}
