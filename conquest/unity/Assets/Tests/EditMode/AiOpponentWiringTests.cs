using System.Collections.Generic;
using Conquest.Ai;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    /// <summary>The scripted opponent as the session's hook: wired from the scenario, deterministic, equal to the headless driver.</summary>
    public sealed class AiOpponentWiringTests
    {
        private static readonly PresentationCommand EndTurn = new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0));
        private const int Turns = 6;

        private static StartResult Boot() => TestContent.Load().Boot;

        [Test]
        public void TheScenarioNamesTheComputerSlotsAndTheSessionPlansOnlyForThem()
        {
            StartResult boot = Boot();
            CollectionAssert.AreEqual(new[] { 1 }, boot.AiSlots);

            GameSession session = OpponentFactory.NewSession(boot);

            Assert.IsNotInstanceOf<NoOpponentTurn>(session.Opponent);
            Assert.AreEqual(0, session.Opponent.Plan(0, boot.State, boot.Services).Count, "the human slot is never planned for");
        }

        [Test]
        public void EndingTheTurnNTimesGivesTheHeadlessDriversStateEveryTurn()
        {
            StartResult boot = Boot();
            GameSession session = OpponentFactory.NewSession(boot);
            GameState headless = boot.State;
            var ai = new List<int>(boot.AiSlots);

            for (int i = 0; i < Turns; i++)
            {
                Assert.IsTrue(session.Submit(EndTurn).Accepted, "turn " + i);
                DriverResult r = OpponentDriver.EndTurnWithOpponents(headless, boot.Services, boot.LocalSlot, ai, OpponentFactory.Seed);
                Assert.AreEqual(0, r.Rejected);
                headless = r.State;
                Assert.AreEqual(StateHasher.HashHex(headless), StateHasher.HashHex(session.State), "turn " + i);
            }

            Assert.AreEqual(0, session.OpponentRefusals);
            Assert.IsNull(session.OpponentProblem);
            Assert.AreEqual(Turns, session.State.Turn);
        }

        [Test]
        public void TwoSessionsEndingTheSameTurnsAgree()
        {
            GameSession a = OpponentFactory.NewSession(Boot());
            GameSession b = OpponentFactory.NewSession(Boot());
            for (int i = 0; i < Turns; i++)
            {
                a.Submit(EndTurn);
                b.Submit(EndTurn);
            }

            Assert.AreEqual(StateHasher.HashHex(a.State), StateHasher.HashHex(b.State));
        }

        [Test]
        public void ASaveLoadedMidGameContinuesExactlyLikeTheRunThatNeverStopped()
        {
            StartResult boot = Boot();
            GameSession straight = OpponentFactory.NewSession(boot);
            GameSession reloaded = OpponentFactory.NewSession(boot);
            var service = new GameSaveService(new MemorySaveStorage(), TestContent.Load().Scenario.Id);
            for (int i = 0; i < 3; i++)
            {
                straight.Submit(EndTurn);
                reloaded.Submit(EndTurn);
            }

            Assert.IsTrue(service.Save(reloaded.State, "slot-1").Ok);
            reloaded.Submit(EndTurn);
            reloaded.Restore(service.Load("slot-1").State!);
            Assert.AreEqual(StateHasher.HashHex(straight.State), StateHasher.HashHex(reloaded.State));
            for (int i = 0; i < 3; i++)
            {
                straight.Submit(EndTurn);
                reloaded.Submit(EndTurn);
            }

            Assert.AreEqual(StateHasher.HashHex(straight.State), StateHasher.HashHex(reloaded.State));
            Assert.AreEqual(0, reloaded.OpponentRefusals);
        }
    }
}
