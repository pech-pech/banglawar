using System.Linq;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    /// <summary>The attack flow of the map: preview, tap-twice confirm, right click, refusal, and the result texts.</summary>
    public sealed class AttackOrderTests
    {
        [Test]
        public void ClickingAnAdjacentOpposingStackWithOwnUnitsSelectedPreviewsTheAttackAndOrdersNothing()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);

            f.Interaction.Click(f.OnOpposing, false);

            Assert.AreEqual(f.Target, f.Interaction.PendingAttackTile);
            Assert.NotNull(f.Interaction.AttackPreviewValue);
            Assert.IsTrue(f.Interaction.AttackPreviewValue!.Valid);
            CollectionAssert.AreEqual(new[] { f.Own.Id }, f.Interaction.AttackPreviewValue.AttackerIds);
            Assert.AreEqual(0, f.Session.AcceptedCommands.Count, "one click orders nothing");
            Assert.AreEqual(SelectionMode.Single, f.Interaction.Selection.Mode, "own unit stays selected, the opposing one is not inspected");
            Assert.AreEqual("Click it again to confirm", f.Interaction.Message);
        }

        [Test]
        public void TheSecondTapOnTheSameStackSendsAnAttackCommandThroughTheSession()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false, touch: true);
            f.Interaction.Click(f.OnOpposing, false, touch: true);
            Assert.AreEqual("Tap again to confirm", f.Interaction.Message);

            f.Interaction.Click(f.OnOpposing, false, touch: true);

            Assert.AreEqual(1, f.Session.AcceptedCommands.Count);
            var command = f.Session.AcceptedCommands[0] as AttackCommand;
            Assert.NotNull(command);
            Assert.AreEqual(f.Target.X, command!.Target.X);
            CollectionAssert.AreEqual(new[] { f.Own.Id }, command.UnitIds.ToArray());
            Assert.AreEqual(1, f.Session.State.Attacks.Count);
            Assert.IsNull(f.Interaction.PendingAttackTile);
            Assert.AreEqual(f.Text.Get("ui.attack_ordered"), f.Interaction.Message);
            Assert.AreEqual(1, f.Interaction.AttacksOrdered);
        }

        [Test]
        public void ARightClickOrdersTheAttackAtOnce()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);

            f.Interaction.SecondaryClick(f.OnOpposing);

            Assert.AreEqual(1, f.Session.State.Attacks.Count);
            Assert.IsInstanceOf<AttackCommand>(f.Session.AcceptedCommands[0]);
        }

        [Test]
        public void TappingAnotherTileInsteadMovesOnAndCancelDropsThePreview()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);
            f.Interaction.Click(f.OnOpposing, false);

            Assert.IsTrue(f.Interaction.Cancel());

            Assert.IsNull(f.Interaction.PendingAttackTile);
            Assert.IsNull(f.Interaction.AttackPreviewValue);
            Assert.AreEqual(SelectionMode.Single, f.Interaction.Selection.Mode);
        }

        [Test]
        public void AnOpposingStackOutOfReachIsStillOnlyInspected()
        {
            var f = new FightFixture();
            UnitView scout = f.Session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);
            f.Interaction.Click(new PickResult(new GridPos(scout.Pos.X, scout.Pos.Y), scout.Id), false);

            f.Interaction.Click(f.OnOpposing, false);

            Assert.IsNull(f.Interaction.PendingAttackTile);
            Assert.AreEqual(SelectionMode.Inspect, f.Interaction.Selection.Mode);
        }

        [Test]
        public void ShiftClickOnAnOpposingStackStillInspectsIt()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);

            f.Interaction.Click(f.OnOpposing, true);

            Assert.IsNull(f.Interaction.PendingAttackTile);
        }

        [Test]
        public void AfterTheTurnResolvesTheResultIsAMessageInBothLanguagesAndTheStateMovedOn()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);
            f.Interaction.SecondaryClick(f.OnOpposing);
            AttackResolved? resolved = null;
            f.Session.Applied += step =>
            {
                foreach (GameEvent e in step.Events)
                {
                    if (e is AttackResolved r) resolved = r;
                }
            };

            f.Interaction.EndTurn();

            Assert.NotNull(resolved, "the queued attack was fought when the turn resolved");
            Assert.AreEqual(0, f.Session.State.Attacks.Count);
            string? english = BattleMessages.For(resolved!, 0, f.Text);
            f.Text.SetLocale(Localizer.Bengali);
            string? bengali = BattleMessages.For(resolved!, 0, f.Text);
            Assert.NotNull(english);
            Assert.IsTrue(bengali!.Any(c => c >= 'ঀ' && c <= '৿'));
            Assert.AreNotEqual(english, bengali);
            Assert.IsNull(BattleMessages.For(resolved!, 5, f.Text), "a battle between others says nothing to this player");
        }

        [TestCase(AttackResolved.WinnerAttacker, 0, 1, "ui.attack_won")]
        [TestCase(AttackResolved.WinnerDefender, 0, 1, "ui.attack_lost")]
        [TestCase(AttackResolved.WinnerNone, 0, 1, "ui.attack_drawn")]
        [TestCase(AttackResolved.WinnerAttacker, 1, 0, "ui.defend_lost")]
        [TestCase(AttackResolved.WinnerDefender, 1, 0, "ui.defended")]
        [TestCase(AttackResolved.WinnerNone, 1, 0, "ui.attack_drawn")]
        public void EveryBattleOutcomeHasItsOwnMessageForBothSidesInBothLanguages(string winner, int attacker, int defender, string key)
        {
            Localizer text = TestContent.Load().Text;
            var e = new AttackResolved(attacker, defender, new TileCoord(4, 9), ImmArray<int>.Of(1), ImmArray<int>.Of(2), AttackKind.Capture, winner);

            string? english = BattleMessages.For(e, 0, text);
            text.SetLocale(Localizer.Bengali);
            string? bengali = BattleMessages.For(e, 0, text);

            text.SetLocale(Localizer.English);
            Assert.AreEqual(text.Format(key, "4", "9"), english);
            Assert.IsTrue(bengali!.Contains("4,9"), "Western digits");
            Assert.IsTrue(bengali.Any(c => c >= 'ঀ' && c <= '৿'));
        }

        [Test]
        public void TheCardTextsCarryTheCoresNumbersInWesternDigits()
        {
            var f = new FightFixture();
            f.Interaction.Click(f.OnOwn, false);
            f.Interaction.Click(f.OnOpposing, false);
            f.Text.SetLocale(Localizer.Bengali);

            AttackCardModel card = AttackCardModel.From(f.Interaction.AttackPreviewValue!, f.Text);

            Assert.IsTrue(card.CanOrder);
            Assert.IsTrue(card.ForceText.Contains(Localizer.Number(f.Interaction.AttackPreviewValue!.AttackerStrength)));
            Assert.IsFalse((card.OddsText + card.LossText + card.ForceText).Any(c => c >= '০' && c <= '৯'));
            Assert.IsTrue(card.NoteText.Any(c => c >= 'ঀ' && c <= '৿'));
        }

        [Test]
        public void RoundedPercentStepsInFives()
        {
            Assert.AreEqual(0, AttackCardModel.RoundedPercent(0));
            Assert.AreEqual(5, AttackCardModel.RoundedPercent(60));
            Assert.AreEqual(50, AttackCardModel.RoundedPercent(500));
            Assert.AreEqual(70, AttackCardModel.RoundedPercent(708));
            Assert.AreEqual(100, AttackCardModel.RoundedPercent(1000));
        }

        [Test]
        public void ARefusedPreviewShowsTheCoresReasonOnTheCard()
        {
            AttackPreview none = AttackPreview.None;
            var f = new FightFixture();
            Assert.IsFalse(none.Valid);

            AttackCardModel card = AttackCardModel.From(AttackPreview.Build(f.Session.State, f.Session.Services, 0, new int[0], f.Target), f.Text);

            Assert.IsFalse(card.CanOrder);
            Assert.AreEqual(f.Text.ErrorText("err.no_units"), card.ErrorText);
        }
    }
}
