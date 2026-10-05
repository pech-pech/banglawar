using System.Collections.Generic;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class OpponentTallyTests
    {
        private static PresentationEvent E(PresentationEventKind kind, string slot) =>
            new PresentationEvent(kind, 1, "line", slot, new GridPos(0, 0));

        [Test]
        public void CountsOnlyTheOtherSidesVisibleActions()
        {
            var events = new List<PresentationEvent>
            {
                E(PresentationEventKind.UnitMoved, "f2"), E(PresentationEventKind.UnitMoved, "f2"), E(PresentationEventKind.UnitMoved, "f1"),
                E(PresentationEventKind.UnitSpawned, "f2"), E(PresentationEventKind.BuildingStarted, "f2"), E(PresentationEventKind.BuildingCompleted, "f1"),
            };

            OpponentTally t = OpponentTally.Of(events, "f1");

            Assert.AreEqual(2, t.Moves);
            Assert.AreEqual(1, t.NewUnits);
            Assert.AreEqual(1, t.Buildings);
            Assert.IsTrue(OpponentTally.Of(new List<PresentationEvent>(), "f1").IsEmpty);
            Assert.AreEqual(4, t.Add(t).Moves);
        }
    }
}
