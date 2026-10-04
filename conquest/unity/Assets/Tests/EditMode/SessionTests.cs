using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class SessionTests
    {
        private static UnitView Scout(GameSession s) => s.State.AsView().Units.First(u => u.Owner == s.LocalSlot && u.Role == UnitRole.Scout);

        private static PresentationCommand Move(int unit, GridPos to) =>
            new PresentationCommand(CommandKind.Move, new[] { unit }, to);

        [Test]
        public void PlanMoveReturnsTheCoresPathWithPerStepCosts()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = Scout(s);

            Conquest.Presentation.MovePlan? plan = s.PlanMove(scout.Id, new GridPos(scout.Pos.X + 3, scout.Pos.Y));

            Assert.NotNull(plan);
            Assert.AreEqual(3, plan!.Steps.Count);
            Assert.AreEqual(scout.MovesLeft, plan.MovePointsLeft);
            Assert.Greater(plan.MovePointsPerTurn, 0);
            Assert.IsTrue(plan.Steps.All(step => step.Cost > 0));
        }

        [Test]
        public void MoveIsAppliedThroughTheCommandEngineAndRaisesTheEvent()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = Scout(s);
            AppliedStep? seen = null;
            s.Applied += step => seen = step;

            CommandOutcome outcome = s.Submit(Move(scout.Id, new GridPos(scout.Pos.X + 2, scout.Pos.Y)));

            Assert.IsTrue(outcome.Accepted, outcome.ErrorCode);
            Assert.NotNull(seen);
            Assert.IsTrue(seen!.Events.Any(e => e is UnitMoved));
            Assert.AreEqual(scout.Pos.X + 2, s.State.TryGetUnit(scout.Id, out UnitView after) ? after.Pos.X : -1);
            Assert.AreEqual(1, s.AcceptedCommands.Count);
        }

        [Test]
        public void ImpossibleMoveIsRefusedWithAnErrorCodeAndLeavesTheStateAlone()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = Scout(s);
            ulong before = StateHasher.Hash(s.State);

            CommandOutcome outcome = s.Submit(Move(scout.Id, new GridPos(40, 40)));

            Assert.IsFalse(outcome.Accepted);
            Assert.AreEqual(Err.OutOfBounds, outcome.ErrorCode);
            Assert.AreEqual(before, StateHasher.Hash(s.State));
            Assert.AreEqual(0, s.AcceptedCommands.Count);
        }

        [Test]
        public void EndTurnEndsEverySlotAndAdvancesTheTurn()
        {
            GameSession s = TestContent.NewSession();

            CommandOutcome outcome = s.Submit(new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0)));

            Assert.IsTrue(outcome.Accepted, outcome.ErrorCode);
            Assert.AreEqual(1, s.State.Turn);
            Assert.IsFalse(s.State.Factions[0].EndedTurn, "a new turn resets the flags");
            Assert.AreEqual(2, s.AcceptedCommands.Count, "the local end turn and the other slot's");
        }

        [Test]
        public void FoundingABaseCreatesTheBaseAndConsumesTheFounder()
        {
            GameSession s = TestContent.NewSession();
            UnitView founder = s.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Founder);
            int basesBefore = s.State.AsView().Bases.Count;

            CommandOutcome outcome = s.FoundBase(founder.Id);

            Assert.IsTrue(outcome.Accepted, outcome.ErrorCode);
            Assert.AreEqual(basesBefore + 1, s.State.AsView().Bases.Count);
            Assert.IsFalse(s.State.TryGetUnit(founder.Id, out _));
        }

        [Test]
        public void ReplayingTheAcceptedCommandsGivesTheSameHash()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = Scout(s);
            s.Submit(Move(scout.Id, new GridPos(scout.Pos.X + 2, scout.Pos.Y)));
            s.Submit(new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0)));

            GameState replay = TestContent.Load().Boot.State;
            var services = TestContent.Load().Boot.Services;
            foreach (Command c in s.AcceptedCommands) replay = CommandEngine.Apply(replay, c, services).State;

            Assert.AreEqual(StateHasher.HashHex(s.State), StateHasher.HashHex(replay));
        }
    }
}
