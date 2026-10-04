using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class HudModelTests
    {
        [Test]
        public void ResourceBarHasSixChipsWithWesternDigitsAndBadges()
        {
            ContentBundle c = TestContent.Load();

            var chips = HudModels.Resources(c.Boot.State, 0, c.Text);

            Assert.AreEqual(6, chips.Count);
            Assert.IsTrue(chips.All(x => !string.IsNullOrEmpty(x.Badge)), "never colour alone");
            Assert.AreEqual("Rice", chips.Single(x => x.Resource == Resource.Food).Label);
            Assert.IsTrue(chips.All(x => x.Amount == 0), "no base yet");
        }

        [Test]
        public void ResourceBarSumsTheStockOfEveryOwnBase()
        {
            ContentBundle c = TestContent.Load();

            var chips = HudModels.Resources(c.Boot.State, 1, c.Text);

            Assert.Greater(chips.Single(x => x.Resource == Resource.Pop).Amount, 0);
            Assert.AreEqual("Personnel", chips.Single(x => x.Resource == Resource.Pop).Label, "the f2 wording");
        }

        [Test]
        public void UnitCardShowsLabelLevelStrengthAndMoves()
        {
            ContentBundle c = TestContent.Load();
            var founder = c.Boot.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Founder);

            UnitCardModel? card = HudModels.Card(c.Boot.State, founder.Id, 0, c.Text);

            Assert.NotNull(card);
            Assert.AreEqual("Organising team", card!.Title);
            Assert.AreEqual("Level 1", card.LevelText);
            Assert.AreEqual("Moves 1", card.MovesText);
            Assert.IsTrue(card.CanFoundBase);
            Assert.IsTrue(card.Friendly);
        }

        [Test]
        public void OpposingUnitCardCannotFoundOrCommand()
        {
            ContentBundle c = TestContent.Load();
            var enemy = c.Boot.State.AsView().Units.First(u => u.Owner == 1);

            UnitCardModel? card = HudModels.Card(c.Boot.State, enemy.Id, 0, c.Text);

            Assert.IsFalse(card!.Friendly);
            Assert.IsFalse(card.CanFoundBase);
        }

        [Test]
        public void TurnBarShowsTurnSeasonAndEnablesEndTurn()
        {
            ContentBundle c = TestContent.Load();

            TurnBarModel bar = HudModels.TurnBar(c.Boot.State, 0, c.Seasons, c.Text);

            Assert.AreEqual("Turn 1", bar.TurnText);
            Assert.AreEqual("Before the rains", bar.SeasonText);
            Assert.IsTrue(bar.EndTurnEnabled);
            Assert.AreEqual("End turn", bar.EndTurnText);
        }
    }
}
