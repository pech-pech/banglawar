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
    /// <summary>The build flow of the map: found a base, open the panel, choose a role, place it, and the refusals with their texts.</summary>
    public sealed class BuildOrderTests
    {
        private sealed class Fixture
        {
            public readonly ContentBundle Content = TestContent.Load();
            public readonly GameSession Session;
            public readonly MapInteraction Interaction;
            public int BaseId;

            public Fixture()
            {
                Session = new GameSession(Content.Boot.State, Content.Boot.LocalSlot, Content.Boot.Services);
                Interaction = new MapInteraction(Session, Content.Text);
                UnitView founder = Session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Founder);
                Interaction.Click(new PickResult(new GridPos(founder.Pos.X, founder.Pos.Y), founder.Id), false);
                Assert.IsTrue(Interaction.FoundBase()!.Accepted);
                BaseId = Session.State.BaseTable.First(b => b.Owner == 0).Id;
            }

            public Base Base => Session.State.BaseTable.First(b => b.Id == BaseId);

            public Localizer Text => Content.Text;
        }

        [Test]
        public void FoundingABaseSelectsItAndTheBuildPanelOpensOnIt()
        {
            var f = new Fixture();

            Assert.AreEqual(f.BaseId, f.Interaction.SelectedBaseId);
            Assert.AreEqual(f.BaseId, f.Interaction.CurrentBaseId);
            Assert.IsTrue(f.Interaction.OpenBuild());
            Assert.IsTrue(f.Interaction.BuildOpen);
        }

        [Test]
        public void ClickingOwnBaseTileWithNothingSelectedSelectsTheBaseAndASelectedUnitOnItGivesTheSameBase()
        {
            var f = new Fixture();
            f.Interaction.Deselect();
            Assert.AreEqual(-1, f.Interaction.CurrentBaseId);

            f.Interaction.Click(new PickResult(new GridPos(f.Base.Pos.X, f.Base.Pos.Y), null), false);

            Assert.AreEqual(f.BaseId, f.Interaction.SelectedBaseId);
        }

        [Test]
        public void OpeningTheBuildPanelWithoutABaseSaysSelectABase()
        {
            var f = new Fixture();
            f.Interaction.Deselect();

            Assert.IsFalse(f.Interaction.OpenBuild());

            Assert.AreEqual(f.Text.Get("ui.select_base"), f.Interaction.Message);
            Assert.IsFalse(f.Interaction.BuildOpen);
        }

        [Test]
        public void ThePanelListsEveryRoleWithTheRuleTablesCostAndDisablesWhatTheStoreCannotPay()
        {
            var f = new Fixture();
            BuildPanelModel model = BuildPanelModel.Create(f.Session.State, f.Session.Services, f.BaseId, 0, f.Text, null, null);

            Assert.AreEqual(Enum.GetValues(typeof(BuildingRole)).Length, model.Rows.Count);
            BuildRowModel food = model.Rows.First(r => r.RoleId == "bld.food");
            BuildRowModel academy = model.Rows.First(r => r.RoleId == "bld.academy");
            Assert.IsTrue(food.Enabled, food.ReasonText);
            Assert.AreEqual(HudModels.CostText(RuleTables.BuildingCost(BuildingRole.Food, 1)), food.CostText);
            Assert.IsFalse(academy.Enabled);
            StringAssert.Contains(f.Text.ErrorText(Err.NotEnoughResources), academy.ReasonText);
            StringAssert.Contains(f.Text.Format("ui.build_short", HudModels.CostText(RuleTables.BuildingCost(BuildingRole.Academy, 1).Subtract(f.Base.Stock))), academy.ReasonText);
            Assert.AreEqual("Paddy and granary", food.Label);
        }

        [Test]
        public void ChoosingADisabledRoleOnlySaysWhyAndChoosingAnEnabledOneProposesTheNearestSite()
        {
            var f = new Fixture();
            f.Interaction.OpenBuild();

            Assert.IsFalse(f.Interaction.ChooseRole(BuildingRole.Academy));
            Assert.AreEqual(f.Text.ErrorText(Err.NotEnoughResources), f.Interaction.Message);
            Assert.IsFalse(f.Interaction.Placing);

            Assert.IsTrue(f.Interaction.ChooseRole(BuildingRole.Food));
            Assert.IsTrue(f.Interaction.Placing);
            Assert.IsTrue(f.Interaction.BuildSite.HasValue);
            Assert.IsNull(BuildMenu.Check(f.Session.State, f.Session.Services, f.BaseId, 0, BuildingRole.Food, f.Interaction.BuildSite!.Value));
        }

        [Test]
        public void ConfirmingPlacesTheBuildingPaysTheCostAndReportsInBothLanguages()
        {
            var f = new Fixture();
            f.Interaction.OpenBuild();
            f.Interaction.ChooseRole(BuildingRole.Food);
            ResourceVector before = f.Base.Stock;
            GridPos site = f.Interaction.BuildSite!.Value;

            CommandOutcome? outcome = f.Interaction.ConfirmBuild();

            Assert.IsTrue(outcome!.Accepted, outcome.ErrorCode);
            Assert.AreEqual(1, f.Base.Buildings.Count);
            Assert.AreEqual(site.X, f.Base.Buildings[0].Pos.X);
            Assert.AreEqual(before.Subtract(RuleTables.BuildingCost(BuildingRole.Food, 1)), f.Base.Stock);
            Assert.IsInstanceOf<BuildCommand>(f.Session.AcceptedCommands.Last());
            StringAssert.Contains("Paddy and granary", f.Interaction.Message);
            Assert.IsFalse(f.Interaction.Placing);
            f.Text.SetLocale(Localizer.Bengali);
            Assert.IsTrue(f.Text.Format("ui.build_ordered", f.Text.Label("bld.food", "f1")).Any(c => c >= 'ঀ' && c <= '৿'));
        }

        [Test]
        public void ATappedTileMovesTheProposalWhenLegalAndExplainsWhenNot()
        {
            var f = new Fixture();
            f.Interaction.OpenBuild();
            f.Interaction.ChooseRole(BuildingRole.Food);
            GridPos first = f.Interaction.BuildSite!.Value;
            IReadOnlyList<GridPos> sites = BuildMenu.Sites(f.Session.State, f.Session.Services, f.BaseId, 0, BuildingRole.Food);
            GridPos other = sites.First(s => s != first);

            f.Interaction.Click(new PickResult(other, null), false, touch: true);
            Assert.AreEqual(other, f.Interaction.BuildSite);
            Assert.AreEqual(0, f.Session.AcceptedCommands.Count(c => c is BuildCommand), "one tap only proposes");

            f.Interaction.Click(new PickResult(new GridPos(f.Base.Pos.X, f.Base.Pos.Y), null), false);
            Assert.AreEqual(other, f.Interaction.BuildSite, "the old proposal stays");
            Assert.AreEqual(f.Text.ErrorText(Err.IllegalSite), f.Interaction.Message);

            f.Interaction.Click(new PickResult(other, null), false);
            Assert.AreEqual(1, f.Session.AcceptedCommands.Count(c => c is BuildCommand), "the second tap on the proposal confirms");
        }

        [Test]
        public void CancelStepsBackFromPlacingToTheListToTheBaseCard()
        {
            var f = new Fixture();
            f.Interaction.OpenBuild();
            f.Interaction.ChooseRole(BuildingRole.Food);

            Assert.IsTrue(f.Interaction.Cancel());
            Assert.IsFalse(f.Interaction.Placing);
            Assert.IsTrue(f.Interaction.BuildOpen);
            Assert.IsTrue(f.Interaction.Cancel());
            Assert.IsFalse(f.Interaction.BuildOpen);
            Assert.AreEqual(f.BaseId, f.Interaction.CurrentBaseId);
            Assert.IsTrue(f.Interaction.Cancel());
            Assert.IsFalse(f.Interaction.Cancel(), "nothing left to back out of: the caller opens the pause menu");
        }

        [Test]
        public void TheSessionAcceptsABuildFromThePresentationCommandAndRefusesABadRole()
        {
            var f = new Fixture();
            GridPos site = BuildMenu.NearestSite(f.Session.State, f.Session.Services, f.BaseId, 0, BuildingRole.Food)!.Value;

            CommandOutcome bad = f.Session.Submit(new PresentationCommand(CommandKind.Build, new[] { f.BaseId }, site, "bld.nowhere"));
            CommandOutcome good = f.Session.Submit(new PresentationCommand(CommandKind.Build, new[] { f.BaseId }, site, "bld.food"));

            Assert.IsFalse(bad.Accepted);
            Assert.AreEqual(Err.UnknownBuilding, bad.ErrorCode);
            Assert.IsTrue(good.Accepted, good.ErrorCode);
        }
    }
}
