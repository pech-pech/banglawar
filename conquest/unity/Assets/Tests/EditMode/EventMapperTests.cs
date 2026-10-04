using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class EventMapperTests
    {
        private static IReadOnlyList<PresentationEvent> MapLast(GameSession s, System.Action act)
        {
            AppliedStep? last = null;
            s.Applied += step => last = step;
            act();
            Assert.NotNull(last);
            return EventMapper.Map(last!, s.Services);
        }

        [Test]
        public void MoveBecomesAUnitMovedEventWithTheFullPath()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = s.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);

            var events = MapLast(s, () => s.Submit(new PresentationCommand(CommandKind.Move, new[] { scout.Id }, new GridPos(scout.Pos.X + 3, scout.Pos.Y))));

            PresentationEvent moved = events.Single(e => e.Kind == PresentationEventKind.UnitMoved);
            Assert.AreEqual(scout.Id, moved.UnitId);
            Assert.AreEqual("scout", moved.Role);
            Assert.AreEqual("f1", moved.Slot);
            Assert.AreEqual(4, moved.Path.Count, "origin plus three tiles");
            Assert.AreEqual(new GridPos(scout.Pos.X, scout.Pos.Y), moved.Path[0]);
            Assert.AreEqual(new GridPos(scout.Pos.X + 3, scout.Pos.Y), moved.Path[3]);
        }

        [Test]
        public void EndTurnBecomesATurnStartedEvent()
        {
            GameSession s = TestContent.NewSession();
            var all = new List<PresentationEvent>();
            s.Applied += step => all.AddRange(EventMapper.Map(step, s.Services));

            s.Submit(new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0)));

            PresentationEvent turn = all.Single(e => e.Kind == PresentationEventKind.TurnStarted);
            Assert.AreEqual(1, turn.Turn);
        }

        [Test]
        public void FoundingABaseCompletesACoreAndRemovesTheFounderBanner()
        {
            GameSession s = TestContent.NewSession();
            UnitView founder = s.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Founder);

            var events = MapLast(s, () => s.FoundBase(founder.Id));

            Assert.IsTrue(events.Any(e => e.Kind == PresentationEventKind.BuildingCompleted && e.Role == "core"));
            Assert.IsTrue(events.Any(e => e.Kind == PresentationEventKind.UnitDestroyed && e.UnitId == founder.Id), "the founder leaves without a core event");
        }

        [Test]
        public void RefusedCommandMapsToNothing()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = s.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);

            var events = MapLast(s, () => s.Submit(new PresentationCommand(CommandKind.Move, new[] { scout.Id }, new GridPos(99, 99))));

            Assert.IsEmpty(events);
        }
    }
}
