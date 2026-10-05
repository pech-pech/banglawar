using System;
using System.Collections;
using System.IO;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// The attack, build and pause/save/load UI through the real input path: virtual mouse, keyboard and touch devices
    /// drive the real <see cref="InputRouter"/>, picking and the UI Toolkit panel. Pictures go to Screenshots/ui3/.
    /// </summary>
    public sealed class UiOrderPlayTests : UiPlayHarness
    {
        private UnitView own;
        private UnitView opposing;

        private IEnumerator Fight()
        {
            yield return Boot();
            yield return ArrangeFight((o, e) =>
            {
                own = o;
                opposing = e;
            });
        }

        private int OwnId => own.Id;

        // ----- attack -----

        [UnityTest]
        public IEnumerator AMouseAttackIsPreviewedConfirmedAndFoughtAtTheEndOfTheTurn()
        {
            yield return Fight();
            int turn = map.Session.State.Turn;

            yield return ClickAt(map.ScreenPointOfBanner(OwnId));
            Assert.AreEqual(OwnId, map.Interaction.Selection.PrimaryId);
            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));

            Assert.IsTrue(map.Hud.AttackCardVisible, "the preview card shows");
            Assert.IsTrue(map.Overlay.AttackMarkVisible, "the target tile is marked");
            Assert.AreEqual(0, map.Session.State.Attacks.Count, "the first click orders nothing");
            StringAssert.Contains(map.Text.Get("ui.attack_title"), map.Hud.DumpText());
            StringAssert.Contains("%", map.Hud.Root.Q<Label>("attack-odds").text);
            yield return Shot("attack-preview", 1280, 720);
            yield return Shot("attack-preview", 1080, 1920);

            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));

            Assert.AreEqual(1, map.Session.State.Attacks.Count, "the second click sends the AttackCommand");
            Assert.IsInstanceOf<AttackCommand>(map.Session.AcceptedCommands.Last());
            Assert.IsFalse(map.Hud.AttackCardVisible);
            Assert.AreEqual(1, map.Overlay.VisibleQueuedMarks);
            StringAssert.Contains("1", map.Hud.Root.Q<Label>("orders-label").text);
            StringAssert.Contains(map.Text.Get("ui.attack_ordered"), map.Hud.CurrentMessage);
            yield return Shot("attack-ordered", 1280, 720);

            yield return ClickElement("end-turn");
            yield return WaitIdle();
            yield return Frames(2);

            Assert.AreEqual(turn + 1, map.Session.State.Turn);
            Assert.AreEqual(0, map.Session.State.Attacks.Count);
            Assert.NotNull(map.LastBattleText, "the result of the fight is told to the player");
            StringAssert.Contains(map.LastBattleText!, map.Hud.CurrentMessage);
            Assert.AreEqual(map.Session.State.UnitTable.Count(u => map.Fog.CanSeeUnit(u)), map.Banners.Count, "banners match the units left after the fight");
            Assert.AreEqual(0, map.Overlay.VisibleQueuedMarks);
            yield return Shot("attack-result", 1280, 720);
        }

        [UnityTest]
        public IEnumerator ARightClickOrdersTheAttackAtOnce()
        {
            yield return Fight();
            yield return ClickAt(map.ScreenPointOfBanner(OwnId));

            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id), right: true);

            Assert.AreEqual(1, map.Session.State.Attacks.Count);
        }

        [UnityTest]
        public IEnumerator ATouchAttackNeedsTwoTapsAndSaysTapAgain()
        {
            yield return Fight();
            yield return Tap(map.ScreenPointOfBanner(OwnId));
            yield return Tap(map.ScreenPointOfBanner(opposing.Id));

            Assert.AreEqual(0, map.Session.State.Attacks.Count);
            Assert.AreEqual(map.Text.Get("ui.hint_confirm"), map.Hud.CurrentMessage);
            Assert.IsTrue(map.Hud.AttackCardVisible);

            yield return Tap(map.ScreenPointOfBanner(opposing.Id));

            Assert.AreEqual(1, map.Session.State.Attacks.Count);
        }

        [UnityTest]
        public IEnumerator TheCardButtonsConfirmAndCancelAndEscBacksOutBeforeItPauses()
        {
            yield return Fight();
            yield return ClickAt(map.ScreenPointOfBanner(OwnId));
            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));

            yield return ClickElement("attack-cancel");
            Assert.IsFalse(map.Hud.AttackCardVisible);
            Assert.AreEqual(0, map.Session.State.Attacks.Count);

            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));
            yield return PressKey(Key.Escape);
            Assert.IsFalse(map.Hud.AttackCardVisible, "Esc backed out of the preview");
            Assert.IsFalse(map.Paused, "and did not open the pause menu");

            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));
            yield return ClickElement("attack-confirm");
            Assert.AreEqual(1, map.Session.State.Attacks.Count);
        }

        [UnityTest]
        public IEnumerator BengaliTextFitsOnTheAttackCardInPortrait()
        {
            yield return Fight();
            yield return ClickAt(map.ScreenPointOfBanner(OwnId));
            yield return ClickAt(map.ScreenPointOfBanner(opposing.Id));
            map.Text.SetLocale(Localizer.Bengali);
            yield return Frames(3);

            Assert.IsTrue(map.Hud.Root.Q<Label>("attack-odds").text.Any(c => c >= 'ঀ' && c <= '৿'));
            yield return Shot("attack-preview-bengali", 1080, 1920);
            yield return Shot("attack-preview-bengali", 1280, 720);
        }

        // ----- build -----

        private IEnumerator FoundBaseByMouse()
        {
            yield return Boot();
            UnitView founder = map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot && u.Role == UnitRole.Founder);
            map.Rig.CenterOnTile(new GridPos(founder.Pos.X, founder.Pos.Y));
            yield return Frames(3);
            yield return ClickAt(map.ScreenPointOfBanner(founder.Id));
            Assert.IsTrue(Shown("found-base"));
            yield return ClickElement("found-base");
            yield return WaitIdle();
        }

        [UnityTest]
        public IEnumerator BuildPanelListsRolesDisablesWhatIsUnaffordableAndPlacesABuilding()
        {
            yield return FoundBaseByMouse();
            Assert.AreEqual(1, map.Session.State.BaseTable.Count(b => b.Owner == 0));
            Assert.IsTrue(map.Hud.BaseCardVisible, "the new base is selected and shows its card");
            Base b = map.Session.State.BaseTable.First(x => x.Owner == 0);

            yield return ClickElement("build-open");
            yield return Frames(3);

            Assert.IsTrue(map.Hud.BuildPanelVisible);
            Assert.AreEqual(Enum.GetValues(typeof(BuildingRole)).Length, map.Hud.Root.Query<Button>().ToList().Count(x => x.name.StartsWith("build-row-")));
            var enabled = map.Hud.EnabledBuildRows.ToList();
            CollectionAssert.Contains(enabled, "build-row-bld.food");
            CollectionAssert.DoesNotContain(enabled, "build-row-bld.academy");
            StringAssert.Contains(map.Text.ErrorText(Err.NotEnoughResources), map.Hud.Root.Q("build-row-bld.academy").Q<Label>("row-reason").text);
            yield return Shot("build-panel", 1280, 720);
            yield return Shot("build-panel", 1080, 1920);
            map.Hud.Root.Q<ScrollView>("build-rows").scrollOffset = new Vector2(0f, 10000f);
            yield return Frames(3);
            yield return Shot("build-panel-scrolled-to-unaffordable", 1280, 720);
            map.Hud.Root.Q<ScrollView>("build-rows").scrollOffset = Vector2.zero;
            yield return Frames(3);

            yield return ClickElement("build-row-bld.food");
            yield return Frames(3);
            Assert.IsTrue(map.Interaction.Placing);
            Assert.IsTrue(map.Overlay.SiteMarkVisible, "the proposed tile is marked");
            Assert.IsTrue(Shown("build-confirm"));
            yield return Shot("build-placing", 1280, 720);

            yield return ClickElement("build-confirm");
            yield return WaitIdle(); // the picture is rebuilt when the cue ends; how many frames that takes depends on how much is drawn

            Base after = map.Session.State.BaseTable.First(x => x.Id == b.Id);
            Assert.AreEqual(1, after.Buildings.Count);
            Assert.AreEqual(BuildingRole.Food, after.Buildings[0].Role);
            Assert.Greater(b.Stock.Basic, after.Stock.Basic, "the cost was paid");
            Assert.AreEqual(1, map.Structures.Pieces.Count(p => p.Role == "food"), "the building is drawn");
            StringAssert.Contains(map.Text.Label("bld.food", "f1"), map.Hud.CurrentMessage);
            yield return Shot("build-ordered", 1280, 720);
        }

        [UnityTest]
        public IEnumerator ATappedTileMovesTheProposedSiteAndABadTileExplainsWhy()
        {
            yield return FoundBaseByMouse();
            yield return ClickElement("build-open");
            yield return ClickElement("build-row-bld.food");
            yield return Frames(3);
            Base b = map.Session.State.BaseTable.First(x => x.Owner == 0);
            var sites = BuildMenu.Sites(map.Session.State, map.Session.Services, b.Id, 0, BuildingRole.Food);
            GridPos other = sites.First(s => s != map.Interaction.BuildSite);

            yield return Tap(map.ScreenPointOfTile(other));
            Assert.AreEqual(other, map.Interaction.BuildSite);
            Assert.AreEqual(0, map.Session.AcceptedCommands.Count(c => c is BuildCommand));

            yield return Tap(map.ScreenPointOfTile(new GridPos(b.Pos.X, b.Pos.Y)));
            Assert.AreEqual(other, map.Interaction.BuildSite, "the base tile is refused");
            Assert.AreEqual(map.Text.ErrorText(Err.IllegalSite), map.Hud.CurrentMessage);

            yield return Tap(map.ScreenPointOfTile(other));
            Assert.AreEqual(1, map.Session.AcceptedCommands.Count(c => c is BuildCommand), "the second tap confirms");
        }

        [UnityTest]
        public IEnumerator BengaliBuildPanelInPortrait()
        {
            yield return FoundBaseByMouse();
            yield return ClickElement("build-open");
            map.Text.SetLocale(Localizer.Bengali);
            yield return Frames(4);

            Assert.IsTrue(map.Hud.Root.Q<Label>("build-title").text.Any(c => c >= 'ঀ' && c <= '৿'));
            yield return Shot("build-panel-bengali", 1080, 1920);
            yield return Shot("build-panel-bengali", 1280, 720);
        }

        // ----- pause, save, load -----

        [UnityTest]
        public IEnumerator EscOpensThePauseMenuAndEscOrResumeClosesIt()
        {
            yield return Boot();

            yield return PressKey(Key.Escape);
            Assert.IsTrue(map.Paused);
            Assert.IsTrue(Shown("pause-menu"));
            yield return Shot("pause-menu", 1280, 720);
            yield return Shot("pause-menu", 1080, 1920);

            int turn = map.Session.State.Turn;
            yield return PressKey(Key.E);
            Assert.AreEqual(turn, map.Session.State.Turn, "orders are ignored while paused");

            yield return PressKey(Key.Escape);
            Assert.IsFalse(map.Paused);

            yield return ClickElement("menu-button");
            Assert.IsTrue(map.Paused, "the HUD button opens it too");
            yield return ClickElement("pause-resume");
            Assert.IsFalse(map.Paused);
        }

        [UnityTest]
        public IEnumerator SaveWritesAVersionedFileAndLoadRestoresTheHashIdenticalState()
        {
            string dir = Path.Combine(Path.GetTempPath(), "conquest-play-" + System.Guid.NewGuid().ToString("N"));
            SaveStorageFactory.Override = new DirectorySaveStorage(dir);
            try
            {
                yield return Boot();
                UnitView scout = map.Session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Scout);
                map.Session.Submit(new PresentationCommand(CommandKind.Move, new[] { scout.Id }, new GridPos(scout.Pos.X + 2, scout.Pos.Y)));
                yield return WaitIdle();
                string savedHash = StateHasher.HashHex(map.Session.State);

                yield return PressKey(Key.Escape);
                yield return ClickElement("pause-save");
                string file = Path.Combine(dir, GameSaveService.FileName(GameSaveService.Quicksave));
                Assert.IsTrue(File.Exists(file), "the save file is on disk");
                StringAssert.StartsWith("{\"format\":\"conquest.save\",\"version\":1", File.ReadAllText(file));
                Assert.AreEqual(map.Text.Get("ui.saved"), map.Hud.PauseStatus);
                yield return Shot("pause-saved", 1280, 720);

                yield return ClickElement("pause-resume");
                map.Session.Submit(new PresentationCommand(CommandKind.EndTurn, new int[0], new GridPos(0, 0)));
                yield return WaitIdle();
                Assert.AreNotEqual(savedHash, StateHasher.HashHex(map.Session.State));

                yield return PressKey(Key.Escape);
                yield return ClickElement("pause-load");
                yield return Frames(3);

                Assert.AreEqual(savedHash, StateHasher.HashHex(map.Session.State), "load restores the identical state");
                Assert.AreEqual(map.Text.Get("ui.loaded"), map.Hud.PauseStatus);
                Assert.AreEqual(map.Session.State.UnitTable.Count(u => map.Fog.CanSeeUnit(u)), map.Banners.Count);
                map.Banners.TryGet(scout.Id, out BannerView view);
                Assert.NotNull(view);
                Assert.AreEqual(scout.Pos.X + 2, map.Session.State.TryGetUnit(scout.Id, out UnitView now) ? now.Pos.X : -1);
            }
            finally
            {
                if (Directory.Exists(dir)) Directory.Delete(dir, true);
            }
        }

        [UnityTest]
        public IEnumerator ADamagedSaveGivesAMessageAndLeavesTheGameAlone()
        {
            var storage = new MemorySaveStorage();
            storage.Overwrite(GameSaveService.FileName(GameSaveService.Quicksave), "{ not a save");
            SaveStorageFactory.Override = storage;
            yield return Boot();
            string before = StateHasher.HashHex(map.Session.State);

            yield return PressKey(Key.Escape);
            yield return ClickElement("pause-load");

            Assert.AreEqual(map.Text.ErrorText(GameSaveService.ErrDamaged), map.Hud.PauseStatus);
            Assert.AreEqual(before, StateHasher.HashHex(map.Session.State));
        }

        [UnityTest]
        public IEnumerator LoadIsDisabledUntilASaveExistsAndAnUnwritableFolderStillSavesInMemory()
        {
            string blocker = Path.Combine(Path.GetTempPath(), "conquest-play-blocker-" + System.Guid.NewGuid().ToString("N"));
            File.WriteAllText(blocker, "a file where the folder should be");
            try
            {
                SaveStorageFactory.Override = SaveStorageFactory.Chain(blocker, blocker);
                yield return Boot();

                yield return PressKey(Key.Escape);
                Assert.IsFalse(map.Hud.Root.Q<Button>("pause-load").enabledSelf, "nothing to load yet");
                yield return ClickElement("pause-save");
                Assert.AreEqual(map.Text.Get("ui.saved"), map.Hud.PauseStatus, "the memory fallback took the save");
                Assert.IsTrue(map.Hud.Root.Q<Button>("pause-load").enabledSelf);
            }
            finally
            {
                File.Delete(blocker);
            }
        }

        [UnityTest]
        public IEnumerator AutosaveOnEndTurnIsOffByDefaultAndWorksOnceSwitchedOn()
        {
            var storage = new MemorySaveStorage();
            SaveStorageFactory.Override = storage;
            yield return Boot();
            string autosave = GameSaveService.FileName(GameSaveService.Autosave);
            Assert.IsFalse(map.Settings.AutosaveOnEndTurn);

            yield return ClickElement("end-turn");
            yield return WaitIdle();
            Assert.IsFalse(storage.Exists(autosave), "off by default");

            yield return PressKey(Key.Escape);
            yield return ClickElement("pause-autosave");
            Assert.IsTrue(map.Settings.AutosaveOnEndTurn);
            Assert.IsTrue(UiSettings.Load(storage).AutosaveOnEndTurn, "the setting is stored");
            yield return PressKey(Key.Escape);
            yield return ClickElement("end-turn");
            yield return WaitIdle();

            Assert.IsTrue(storage.Exists(autosave), "the autosave is written after the turn resolves");
            LoadOutcome loaded = new GameSaveService(storage, map.Session.State.Map != null ? GameApp.Content!.Scenario.Id : string.Empty).Load(GameSaveService.Autosave);
            Assert.AreEqual(StateHasher.HashHex(map.Session.State), StateHasher.HashHex(loaded.State!));
        }

        [UnityTest]
        public IEnumerator LanguageAndQuitToTitleWorkFromThePauseMenu()
        {
            yield return Boot();
            MapController? quit = null;
            MapController.QuitToTitleOverride = m => quit = m;

            yield return PressKey(Key.Escape);
            string before = map.Hud.Root.Q<Button>("pause-save").text;
            yield return ClickElement("pause-language");
            Assert.AreEqual(Localizer.Bengali, map.Text.Locale);
            Assert.AreNotEqual(before, map.Hud.Root.Q<Button>("pause-save").text);
            yield return Shot("pause-menu-bengali", 1280, 720);
            yield return Shot("pause-menu-bengali", 1080, 1920);
            map.Text.SetLocale(Localizer.English);

            yield return ClickElement("pause-quit");

            Assert.AreSame(map, quit, "quit to title is requested; nothing quits the application");
        }
    }
}
