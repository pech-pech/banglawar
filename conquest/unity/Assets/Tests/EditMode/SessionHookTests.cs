using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    /// <summary>The opponent hook and the state replacement of a loaded game.</summary>
    public sealed class SessionHookTests
    {
        private static readonly PresentationCommand EndTurn = new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0));

        private sealed class RecordingOpponent : IOpponentTurn
        {
            public readonly List<int> Slots = new List<int>();
            public readonly List<bool> LocalHadEnded = new List<bool>();
            public Func<int, GameState, IReadOnlyList<Command>> Orders = (slot, state) => Array.Empty<Command>();

            public IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services)
            {
                Slots.Add(slot);
                LocalHadEnded.Add(state.Factions[0].EndedTurn);
                return Orders(slot, state);
            }
        }

        [Test]
        public void TheDefaultOpponentGivesNoOrdersAndTheTurnStillAdvances()
        {
            GameSession s = TestContent.NewSession();

            Assert.AreSame(NoOpponentTurn.Instance, s.Opponent);
            Assert.IsTrue(s.Submit(EndTurn).Accepted);
            Assert.AreEqual(1, s.State.Turn);
            Assert.AreEqual(0, s.OpponentRefusals);
        }

        [Test]
        public void TheHookIsAskedOnceForEachOtherSlotAfterThePlayerHasEndedTheTurn()
        {
            GameSession s = TestContent.NewSession();
            var opponent = new RecordingOpponent();
            s.Opponent = opponent;

            s.Submit(EndTurn);

            CollectionAssert.AreEqual(new[] { 1 }, opponent.Slots);
            Assert.IsTrue(opponent.LocalHadEnded[0], "it is asked after the local end-turn, before the turn resolves");
            Assert.AreEqual(1, s.State.Turn);
        }

        [Test]
        public void AnOpponentOrderGoesThroughTheSameValidationAndIsRecorded()
        {
            GameSession s = TestContent.NewSession();
            UnitView theirs = s.State.AsView().Units.First(u => u.Owner == 1);
            var target = new TileCoord(theirs.Pos.X, theirs.Pos.Y == 0 ? 1 : theirs.Pos.Y - 1);
            var opponent = new RecordingOpponent();
            opponent.Orders = (slot, state) => new Command[]
            {
                new MoveCommand(slot, theirs.Id, target),
                new MoveCommand(slot, 99999, target),
                new MoveCommand(0, theirs.Id, target),
                new EndTurnCommand(slot),
            };
            s.Opponent = opponent;

            s.Submit(EndTurn);

            Assert.GreaterOrEqual(s.AcceptedCommands.Count(c => c is MoveCommand m && m.Slot == 1 && m.UnitId == theirs.Id), 0);
            Assert.AreEqual(0, s.AcceptedCommands.Count(c => c is MoveCommand m && m.UnitId == 99999));
            Assert.AreEqual(1, s.OpponentRefusals, "only the unknown unit was refused; another slot's order and a premature end turn are ignored");
            Assert.AreEqual(Err.UnknownUnit, s.OpponentProblem);
            Assert.AreEqual(1, s.State.Turn, "the turn still resolved");
        }

        [Test]
        public void AnOpponentThatThrowsOrReturnsNullDoesNotBreakTheTurn()
        {
            GameSession throwing = TestContent.NewSession();
            throwing.Opponent = new ThrowingOpponent();
            GameSession nothing = TestContent.NewSession();
            var none = new RecordingOpponent();
            none.Orders = (slot, state) => null!;
            nothing.Opponent = none;

            Assert.IsTrue(throwing.Submit(EndTurn).Accepted);
            Assert.IsTrue(nothing.Submit(EndTurn).Accepted);

            Assert.AreEqual(1, throwing.State.Turn);
            StringAssert.Contains("InvalidOperationException", throwing.OpponentProblem);
            Assert.AreEqual(1, nothing.State.Turn);
        }

        private sealed class ThrowingOpponent : IOpponentTurn
        {
            public IReadOnlyList<Command> Plan(int slot, GameState state, TurnServices services) => throw new InvalidOperationException("boom");
        }

        [Test]
        public void RestoreReplacesTheStateClearsTheRecordAndRaisesTheEvent()
        {
            GameSession s = TestContent.NewSession();
            GameState start = s.State;
            s.Submit(EndTurn);
            int raised = 0;
            s.Restored += () => raised++;

            s.Restore(start);

            Assert.AreEqual(0, s.State.Turn);
            Assert.AreEqual(0, s.AcceptedCommands.Count);
            Assert.AreEqual(1, raised);
            Assert.AreEqual(StateHasher.HashHex(start), StateHasher.HashHex(s.State));
            Assert.Throws<ArgumentNullException>(() => s.Restore(null!));
        }

        [Test]
        public void ASavedAndLoadedSessionStateIsHashIdenticalAndKeepsPlaying()
        {
            GameSession s = TestContent.NewSession();
            UnitView scout = s.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);
            s.Submit(new PresentationCommand(CommandKind.Move, new[] { scout.Id }, new GridPos(scout.Pos.X + 2, scout.Pos.Y)));
            var service = new GameSaveService(new MemorySaveStorage(), TestContent.Load().Scenario.Id);

            Assert.IsTrue(service.Save(s.State, "slot-1").Ok);
            string hash = StateHasher.HashHex(s.State);
            s.Submit(EndTurn);
            Assert.AreNotEqual(hash, StateHasher.HashHex(s.State));
            LoadOutcome loaded = service.Load("slot-1");
            s.Restore(loaded.State!);

            Assert.AreEqual(hash, StateHasher.HashHex(s.State));
            Assert.IsTrue(s.Submit(EndTurn).Accepted);
            Assert.AreEqual(1, s.State.Turn);
        }
    }
}
