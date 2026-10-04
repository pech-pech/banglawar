using System.Collections;
using System.Linq;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace Conquest.UnityView.Tests
{
    /// <summary>Regressions found by the second playtest: structures hidden by tree crowns, touch mode flicker, a leftover selection ring.</summary>
    public sealed class PlaytestFixTests
    {
        /// <summary>The playtest base at (3,3) was hidden by crowns one to two rows in front; written as a literal so the test cannot follow the rule down to 0.</summary>
        private const int RowsTreeCrownsMustDrawUnder = 2;

        private MapController map = null!;
        private Mouse mouse = null!;
        private Touchscreen? touch;
        private InputSettings.EditorInputBehaviorInPlayMode oldEditorBehavior;
        private InputSettings.BackgroundBehavior oldBackground;
        private readonly System.Collections.Generic.List<InputDevice> disabled = new System.Collections.Generic.List<InputDevice>();

        [SetUp]
        public void SetUp()
        {
            foreach (InputDevice d in InputSystem.devices.ToArray())
            {
                if (d is Mouse || d is Keyboard || d is Touchscreen)
                {
                    InputSystem.DisableDevice(d);
                    disabled.Add(d);
                }
            }

            oldBackground = InputSystem.settings.backgroundBehavior;
            oldEditorBehavior = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            mouse = InputSystem.AddDevice<Mouse>("FixMouse");
        }

        [TearDown]
        public void TearDown()
        {
            if (touch != null && touch.added) InputSystem.RemoveDevice(touch);
            InputSystem.RemoveDevice(mouse);
            foreach (InputDevice d in disabled) InputSystem.EnableDevice(d);
            InputSystem.settings.backgroundBehavior = oldBackground;
            InputSystem.settings.editorInputBehaviorInPlayMode = oldEditorBehavior;
        }

        private IEnumerator Boot()
        {
            GameApp.Reset();
            SceneManager.LoadScene("Boot");
            yield return null;
            float until = Time.realtimeSinceStartup + 25f;
            while (Time.realtimeSinceStartup < until)
            {
                map = Object.FindFirstObjectByType<MapController>();
                if (map != null && map.IsBuilt) break;
                yield return null;
            }

            Assert.NotNull(map, "the Map scene never loaded");
            for (int i = 0; i < 5; i++) yield return null;
        }

        [UnityTest]
        public IEnumerator TreeCrownsUpToTheLiftRowsInFrontDrawUnderEveryStructure()
        {
            yield return Boot();
            Assert.AreEqual(LayeringMode.Bands, PolishSettings.Layering, "the rule is for the default layering");
            Assert.Greater(map.Structures.PieceCount, 0);
            var tiles = map.Tiles.Root.GetComponentsInChildren<SpriteRenderer>();

            foreach (StructurePiece piece in map.Structures.Pieces)
            {
                int frontDepth = SortKey.Depth(piece.Placement.Front);
                foreach (SpriteRenderer tile in tiles)
                {
                    int tileDepth = tile.sortingOrder / SortKey.DepthStride;
                    string what = piece.Role + "@" + piece.RuleTile + " order " + piece.Renderer.sortingOrder + " vs tile " + tile.name + " order " + tile.sortingOrder;
                    if (tileDepth <= frontDepth + RowsTreeCrownsMustDrawUnder) Assert.Less(tile.sortingOrder, piece.Renderer.sortingOrder, what);
                    else if (tileDepth > frontDepth + DrawOrder.StructureDepthLift) Assert.Greater(tile.sortingOrder, piece.Renderer.sortingOrder, what + " (a forest well in front still hides it)");
                }
            }
        }

        private static void SendTouch(Touchscreen screen, TouchPhase phase, Vector2 position)
        {
            InputSystem.QueueStateEvent(screen, new TouchState { touchId = 1, phase = phase, position = position, pressure = 1f });
        }

        [UnityTest]
        public IEnumerator WithAMouseAndATouchscreenTheModeStaysTouchUntilTheMouseMoves()
        {
            yield return Boot();
            touch = InputSystem.AddDevice<Touchscreen>("FixTouch");
            for (int i = 0; i < 3; i++) yield return null;

            SendTouch(touch, TouchPhase.Began, new Vector2(300, 200));
            yield return null;
            SendTouch(touch, TouchPhase.Ended, new Vector2(300, 200));
            yield return null;
            Assert.IsTrue(map.Hud.TouchMode, "a touch switches to touch mode");

            bool flickered = false;
            for (int i = 0; i < 20; i++)
            {
                yield return null;
                flickered |= !map.Hud.TouchMode;
            }

            Assert.IsFalse(flickered, "with the finger up and the mouse still, the mode stays touch");

            InputSystem.QueueStateEvent(mouse, new MouseState { position = new Vector2(120, 90) });
            yield return null;
            yield return null;
            Assert.IsFalse(map.Hud.TouchMode, "moving the mouse switches back");
            for (int i = 0; i < 10; i++) yield return null;
            Assert.IsFalse(map.Hud.TouchMode, "and it stays mouse");
        }

        [UnityTest]
        public IEnumerator ARealMouseClickOnATileSaysClickAgain()
        {
            yield return Boot();
            Conquest.Core.Contracts.UnitView mine = map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot && u.Role == Conquest.Core.Contracts.UnitRole.Scout);
            map.SimulateClick(map.ScreenPointOfBanner(mine.Id));
            map.SimulateClick(map.ScreenPointOfTile(new GridPos(mine.Pos.X + 2, mine.Pos.Y)));
            yield return null;
            Assert.AreEqual(map.Text.Get("ui.hint_confirm_click"), map.Interaction.Message);
            Assert.AreNotEqual(map.Text.Get("ui.hint_confirm"), map.Interaction.Message);
        }

        [UnityTest]
        public IEnumerator SelectingAnEnemyAfterAStackLeavesNoRingOnTheOldStack()
        {
            yield return Boot();
            Conquest.Core.Contracts.UnitView mine = map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot);
            Conquest.Core.Contracts.UnitView enemy = map.Session.State.AsView().Units.First(u => u.Owner != map.Session.LocalSlot);
            map.SimulateClick(map.ScreenPointOfBanner(mine.Id));
            yield return null;
            Assert.AreEqual(1, map.Overlay.VisibleRings);
            Vector3 before = map.Overlay.ActivePieces().First(p => p.name.StartsWith("SelectionRing")).position;

            map.SimulateClick(map.ScreenPointOfBanner(enemy.Id));
            yield return null;
            var pieces = map.Overlay.ActivePieces().Where(p => p.name.StartsWith("SelectionRing") || p.name.StartsWith("SelectionFill")).ToList();
            Assert.AreEqual(2, pieces.Count, "one ring (edge and fill), on the enemy's tile only");
            foreach (var piece in pieces) Assert.Greater(Vector3.Distance(piece.position, before), 0.01f, piece.name + " must have left the old tile");

            // the old unit's hologram (its art carries a teal tile diamond) cross-fades out in 120 ms, then nothing of it is left
            float until = Time.realtimeSinceStartup + 0.6f;
            while (Time.realtimeSinceStartup < until) yield return null;
            yield return null;
            var lingering = map.Banners.Banners.Where(b => b.Key != enemy.Id && b.Value.BlendPermille > 0).Select(b => "u" + b.Key).ToList();
            Assert.IsEmpty(lingering, "holograms still showing after the fade: " + string.Join(",", lingering));
        }
    }
}
