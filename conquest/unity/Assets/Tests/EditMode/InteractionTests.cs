using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class InteractionTests
    {
        private sealed class Fixture
        {
            public readonly GameSession Session = TestContent.NewSession();
            public readonly MapInteraction Interaction;
            public readonly UnitView Scout;

            public Fixture()
            {
                Interaction = new MapInteraction(Session, TestContent.Load().Text);
                Scout = Session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);
            }

            public PickResult OnBanner(UnitView u) => new PickResult(new GridPos(u.Pos.X, u.Pos.Y), u.Id);

            public PickResult OnTile(int x, int y) => new PickResult(new GridPos(x, y), null);
        }

        [Test]
        public void ClickingAFriendlyBannerSelectsItAndAnOpposingOneOnlyInspects()
        {
            var f = new Fixture();
            UnitView enemy = f.Session.State.AsView().Units.First(u => u.Owner == 1);

            f.Interaction.Click(f.OnBanner(f.Scout), false);
            Assert.AreEqual(SelectionMode.Single, f.Interaction.Selection.Mode);
            f.Interaction.Click(f.OnBanner(enemy), false);

            Assert.AreEqual(SelectionMode.Inspect, f.Interaction.Selection.Mode);
            Assert.IsFalse(f.Interaction.Selection.CanCommand);
        }

        [Test]
        public void FirstTapOnATilePreviewsThePathAndSecondTapConfirms()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);
            GridPos target = new GridPos(f.Scout.Pos.X + 2, f.Scout.Pos.Y);

            f.Interaction.Click(f.OnTile(target.X, target.Y), false);
            Assert.AreEqual(target, f.Interaction.PendingTarget);
            Assert.IsTrue(f.Interaction.Preview.Found);
            Assert.AreEqual(2, f.Interaction.Preview.Steps.Count);
            Assert.AreEqual(0, f.Session.AcceptedCommands.Count, "nothing is ordered by one tap");

            f.Interaction.Click(f.OnTile(target.X, target.Y), false);

            Assert.AreEqual(1, f.Session.AcceptedCommands.Count);
            Assert.IsNull(f.Interaction.PendingTarget);
            f.Session.State.TryGetUnit(f.Scout.Id, out UnitView moved);
            Assert.AreEqual(target.X, moved.Pos.X);
        }

        [Test]
        public void TappingADifferentTileMovesThePendingTargetInsteadOfConfirming()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);

            f.Interaction.Click(f.OnTile(f.Scout.Pos.X + 1, f.Scout.Pos.Y), false);
            f.Interaction.Click(f.OnTile(f.Scout.Pos.X + 2, f.Scout.Pos.Y), false);

            Assert.AreEqual(0, f.Session.AcceptedCommands.Count);
            Assert.AreEqual(new GridPos(f.Scout.Pos.X + 2, f.Scout.Pos.Y), f.Interaction.PendingTarget);
        }

        [Test]
        public void UnreachableTileShowsNoPathAndTheErrorText()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);

            f.Interaction.Click(f.OnTile(2, 7), false);

            Assert.IsFalse(f.Interaction.Preview.Found);
            Assert.IsNull(f.Interaction.PendingTarget);
            Assert.AreEqual("Cannot reach that tile this turn", f.Interaction.Message);
            Assert.AreEqual(new GridPos(2, 7), f.Interaction.BlockedTarget);
        }

        [Test]
        public void FarTilePreviewsAMultiTurnPathButConfirmingIsRefusedForThisTurn()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);
            var far = new GridPos(f.Scout.Pos.X + 11, f.Scout.Pos.Y);

            f.Interaction.Click(f.OnTile(far.X, far.Y), false);
            Assert.IsTrue(f.Interaction.Preview.Found);
            Assert.Greater(f.Interaction.Preview.TurnsNeeded, 1);
            f.Interaction.Click(f.OnTile(far.X, far.Y), false);

            Assert.AreEqual(0, f.Session.AcceptedCommands.Count);
            Assert.AreEqual("err.unreachable", f.Interaction.LastErrorCode);
        }

        [Test]
        public void RightClickOrdersAtOnce()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);

            f.Interaction.SecondaryClick(f.OnTile(f.Scout.Pos.X + 2, f.Scout.Pos.Y));

            Assert.AreEqual(1, f.Session.AcceptedCommands.Count);
        }

        [Test]
        public void CancelClearsThePendingTargetFirstThenTheSelection()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);
            f.Interaction.Click(f.OnTile(f.Scout.Pos.X + 1, f.Scout.Pos.Y), false);

            f.Interaction.Cancel();
            Assert.IsNull(f.Interaction.PendingTarget);
            Assert.AreEqual(SelectionMode.Single, f.Interaction.Selection.Mode);
            f.Interaction.Cancel();

            Assert.AreEqual(SelectionMode.None, f.Interaction.Selection.Mode);
        }

        [Test]
        public void HoveringATileWithAUnitSelectedPreviewsWithoutPending()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);

            f.Interaction.Hover(f.OnTile(f.Scout.Pos.X + 2, f.Scout.Pos.Y));

            Assert.IsTrue(f.Interaction.Preview.Found);
            Assert.IsNull(f.Interaction.PendingTarget);
        }

        [Test]
        public void EndTurnClearsOrdersAndAdvancesTheTurn()
        {
            var f = new Fixture();
            f.Interaction.Click(f.OnBanner(f.Scout), false);
            f.Interaction.Click(f.OnTile(f.Scout.Pos.X + 1, f.Scout.Pos.Y), false);

            CommandOutcome outcome = f.Interaction.EndTurn();

            Assert.IsTrue(outcome.Accepted);
            Assert.IsNull(f.Interaction.PendingTarget);
            Assert.AreEqual(1, f.Session.State.Turn);
        }

        [Test]
        public void FoundBaseNeedsASingleSelectedFounder()
        {
            var f = new Fixture();
            Assert.IsNull(f.Interaction.FoundBase());
            UnitView founder = f.Session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Founder);
            f.Interaction.Click(f.OnBanner(founder), false);

            CommandOutcome? outcome = f.Interaction.FoundBase();

            Assert.IsTrue(outcome!.Accepted);
        }

        private static UnitView[] BiggestFriendlyStack(Fixture f)
        {
            return f.Session.State.AsView().Units.Where(u => u.Owner == 0)
                .GroupBy(u => (u.Pos.X, u.Pos.Y)).OrderByDescending(g => g.Count()).First().ToArray();
        }

        [Test]
        public void ClickingTheSelectedUnitOfAStackAgainCyclesThroughEveryUnitThere()
        {
            var f = new Fixture();
            UnitView[] stack = BiggestFriendlyStack(f);
            Assert.Greater(stack.Length, 2, "turn-0 arrivals share an entry tile");
            var seen = new System.Collections.Generic.HashSet<int>();
            UnitView current = stack[0];
            for (int i = 0; i < stack.Length; i++)
            {
                f.Interaction.Click(f.OnBanner(current), false);
                int selected = f.Interaction.Selection.PrimaryId;
                seen.Add(selected);
                current = stack.First(u => u.Id == selected);
            }

            Assert.AreEqual(stack.Length, seen.Count, "every unit of the stack was reached by clicking");
            Assert.AreEqual(SelectionMode.Single, f.Interaction.Selection.Mode);
        }

        [Test]
        public void ClickingAStackBadgeSelectsTheWholeFriendlyStack()
        {
            var f = new Fixture();
            UnitView[] stack = BiggestFriendlyStack(f);
            var tile = new GridPos(stack[0].Pos.X, stack[0].Pos.Y);

            f.Interaction.ClickStack(tile);

            CollectionAssert.AreEquivalent(stack.Select(u => u.Id), f.Interaction.Selection.SelectedIds);
            Assert.AreEqual(SelectionMode.Multi, f.Interaction.Selection.Mode);
            Assert.IsTrue(f.Interaction.Selection.CanCommand, "a group can be ordered");
            Assert.AreEqual(stack.Length, f.Interaction.StackAt(tile).Count);
        }

        [Test]
        public void ClickingAnOpposingStackBadgeOnlyInspects()
        {
            var f = new Fixture();
            UnitView[] enemies = f.Session.State.AsView().Units.Where(u => u.Owner == 1)
                .GroupBy(u => (u.Pos.X, u.Pos.Y)).OrderByDescending(g => g.Count()).First().ToArray();

            f.Interaction.ClickStack(new GridPos(enemies[0].Pos.X, enemies[0].Pos.Y));

            Assert.AreEqual(SelectionMode.Inspect, f.Interaction.Selection.Mode);
            Assert.AreEqual(1, f.Interaction.Selection.SelectedIds.Count);
            f.Interaction.ClickStack(new GridPos(0, 9));
            Assert.AreEqual(SelectionMode.Inspect, f.Interaction.Selection.Mode, "an empty tile changes nothing");
        }
    }
}
