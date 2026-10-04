using System.Collections;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>Boots the real Boot scene, lets it load the Map scene, and plays one short game through the view.</summary>
    public sealed class MapSliceSmokeTests
    {
        private const float WaitSeconds = 20f;

        private MapController map = null!;

        private IEnumerator BootAndWait()
        {
            GameApp.Reset();
            SceneManager.LoadScene("Boot");
            yield return null; // the old scenes are unloaded at the start of the next frame
            float until = Time.realtimeSinceStartup + WaitSeconds;
            while (Time.realtimeSinceStartup < until)
            {
                map = Object.FindFirstObjectByType<MapController>();
                if (map != null && map.IsBuilt) break;
                yield return null;
            }

            Assert.NotNull(map, "the Map scene never loaded");
            Assert.IsTrue(map.IsBuilt);
            yield return null;
            yield return null;
        }

        private IEnumerator WaitIdle()
        {
            float until = Time.realtimeSinceStartup + WaitSeconds;
            while (map.Runner.IsBusy && Time.realtimeSinceStartup < until) yield return null;
            Assert.IsFalse(map.Runner.IsBusy, "cues never finished");
            yield return null;
        }

        /// <summary>The first friendly unit of a role (units arrive stacked on the entry tile; the view spreads the stack).</summary>
        private UnitView FriendlyAlone(UnitRole role) =>
            map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot && u.Role == role);

        [UnityTest]
        public IEnumerator BootLoadsMapWithGridBannersAndHud()
        {
            yield return BootAndWait();

            Assert.AreEqual(12 * 10, map.Tiles.TileCount);
            Assert.AreEqual(map.Session.State.UnitTable.Count, map.Banners.Count);
            Assert.Greater(map.Banners.Count, 7);
            Assert.AreEqual(map.Session.State.BaseTable.Count + map.Session.State.BaseTable.Sum(b => b.Buildings.Count), map.Structures.PieceCount);
            CameraModel cam = map.Rig.Model;
            Assert.GreaterOrEqual(cam.CenterX, cam.Bounds.Left - cam.Margin);
            Assert.LessOrEqual(cam.CenterX, cam.Bounds.Right + cam.Margin);
            Assert.GreaterOrEqual(cam.CenterY, cam.Bounds.Top - cam.Margin);
            Assert.LessOrEqual(cam.CenterY, cam.Bounds.Bottom + cam.Margin);
            VisualElement root = map.Hud.Root;
            Assert.AreEqual(6, root.Q("resource-bar").childCount);
            Assert.NotNull(root.Q<Button>("end-turn"));
            Assert.AreEqual("Turn 1", root.Q<Label>("turn-label").text);
            Assert.AreEqual("Before the rains", root.Q<Label>("season-label").text);
            Assert.AreEqual(DisplayStyle.None, root.Q("unit-card").style.display.value);
        }

        [UnityTest]
        public IEnumerator HintLivesInItsOwnStripUnderTheBarAndTheFittedMapStartsBelowIt([Values(1280, 1080)] int width)
        {
            yield return BootAndWait();
            int height = width == 1280 ? 720 : 1920;
            ShotKit.Target target = ShotKit.Begin(map, width, height);
            try
            {
                map.Rig.Refit();
                yield return ShotKit.Frames(4);

                Label hint = (Label)map.Hud.HintStrip;
                VisualElement bar = map.Hud.Root.Q("top-bar");
                Assert.AreEqual(HudLayout.TopBarPx, hint.layout.yMin, 0.5f, "the strip starts where the top bar ends");
                Assert.AreEqual(HudLayout.HintStripPx, hint.layout.height, 0.5f);
                Assert.AreEqual(bar.layout.yMax, hint.layout.yMin, 0.5f);
                Assert.IsFalse(string.IsNullOrEmpty(hint.text));
                Assert.GreaterOrEqual(hint.resolvedStyle.backgroundColor.a, 0.8f, "an opaque band, so map art can never sit behind the text");

                float scale = height / map.Hud.Root.layout.height;
                PixelRect map12x10 = new IsoProjection().MapBounds(12, 10);
                PixelPoint topOfArt = map.Rig.Model.WorldToScreen(new PixelPoint(map12x10.Left + map12x10.Width / 2, map12x10.Top - CameraFit.TallArtOverhangPx));
                Assert.GreaterOrEqual(topOfArt.Y, hint.layout.yMax * scale - 2f, "the first camera keeps the whole map under the hint strip");
            }
            finally
            {
                ShotKit.End(map, target);
            }
        }

        [UnityTest]
        public IEnumerator SelectPreviewConfirmMoveEndTurnAndReplayAgree()
        {
            yield return BootAndWait();
            UnitView scout = FriendlyAlone(UnitRole.Commander);
            var target = new GridPos(scout.Pos.X + 3, scout.Pos.Y);

            map.SimulateClick(map.ScreenPointOfBanner(scout.Id));
            float until = Time.realtimeSinceStartup + 3f;
            while (map.Banners.Banners[scout.Id].BlendPermille < 1000 && Time.realtimeSinceStartup < until) yield return null;
            Assert.IsTrue(map.Interaction.Selection.IsSelected(scout.Id));
            Assert.AreEqual(BannerVisualState.HologramSelected, map.Banners.Banners[scout.Id].Visual);
            Assert.AreEqual(1000, map.Banners.Banners[scout.Id].BlendPermille, "the hologram has fully faded in");
            Assert.AreEqual(DisplayStyle.Flex, map.Hud.Root.Q("unit-card").style.display.value);

            map.SimulateHover(map.ScreenPointOfTile(target));
            Assert.IsTrue(map.Interaction.Preview.Found);
            Assert.AreEqual(3, map.Interaction.Preview.Steps.Count);
            Assert.AreEqual(3, map.Overlay.VisibleDots);

            map.SimulateClick(map.ScreenPointOfTile(target));
            Assert.AreEqual(target, map.Interaction.PendingTarget);
            Assert.AreEqual(0, map.Session.AcceptedCommands.Count);
            map.SimulateClick(map.ScreenPointOfTile(target));
            Assert.AreEqual(1, map.Session.AcceptedCommands.Count, "the second tap confirmed the move");
            yield return null;
            Assert.IsTrue(map.Runner.IsBusy, "the move cue is playing");
            yield return WaitIdle();

            map.Session.State.TryGetUnit(scout.Id, out UnitView moved);
            Assert.AreEqual(target, new GridPos(moved.Pos.X, moved.Pos.Y));
            BannerView banner = map.Banners.Banners[scout.Id];
            Assert.AreEqual(target, banner.Tile, "the banner sits on its state tile");
            Assert.IsFalse(banner.Busy);
            if (map.Art.HasCatalog) StringAssert.IsMatch(@"^u\.[a-z_]+\.move_(ne|se|sw|nw)@f1$", map.Runner.LastClipKey ?? string.Empty, "a four-way move clip played (the commander and its attached followers walk)");

            map.PressEndTurn();
            yield return null;
            yield return WaitIdle();
            Assert.AreEqual(1, map.Session.State.Turn);
            Assert.AreEqual("Turn 2", map.Hud.Root.Q<Label>("turn-label").text);

            GameState replay = GameApp.Content!.Boot.State;
            foreach (Command c in map.Session.AcceptedCommands) replay = CommandEngine.Apply(replay, c, GameApp.Content!.Boot.Services).State;
            Assert.AreEqual(StateHasher.HashHex(map.Session.State), StateHasher.HashHex(replay), "a headless replay of the commands matches");
        }

        [UnityTest]
        public IEnumerator FoundingABaseAddsAStructureAndLanguageSwitchRelabels()
        {
            yield return BootAndWait();
            UnitView founder = FriendlyAlone(UnitRole.Founder);

            map.SimulateClick(map.ScreenPointOfBanner(founder.Id));
            Button found = map.Hud.Root.Q<Button>("found-base");
            Assert.AreEqual(DisplayStyle.Flex, found.style.display.value);
            int pieces = map.Structures.PieceCount;
            using (var e = new NavigationSubmitEvent { target = found }) found.SendEvent(e);
            map.Interaction.FoundBase();
            yield return WaitIdle();
            yield return null;

            Assert.AreEqual(pieces + 1, map.Structures.PieceCount);
            Assert.IsFalse(map.Banners.Banners.ContainsKey(founder.Id), "the founder banner is gone");
            string english = map.Hud.Root.Q<Button>("end-turn").text;

            map.Text.SetLocale(Localizer.Bengali);
            yield return null;

            Assert.AreNotEqual(english, map.Hud.Root.Q<Button>("end-turn").text);
            Assert.AreEqual("English", map.Hud.Root.Q<Button>("language-button").text);
            Assert.IsFalse(map.Hud.DumpText().Any(c => c >= '০' && c <= '৯'), "Western digits only");
        }

        [UnityTest]
        public IEnumerator DebugPanelTogglesAndListsTheState()
        {
            yield return BootAndWait();
            VisualElement panel = map.Hud.Root.Q("debug-panel");
            Assert.AreEqual(DisplayStyle.None, panel.style.display.value);

            map.SetDebug(true);
            yield return null;

            Assert.AreEqual(DisplayStyle.Flex, panel.style.display.value);
            StringAssert.Contains("turn 1", map.Hud.Root.Q<Label>("debug-text").text);
            StringAssert.Contains("tiles 120", map.Hud.Root.Q<Label>("debug-text").text);
        }
    }
}
