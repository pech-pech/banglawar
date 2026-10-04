using System.Collections;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Found by the scripted playtest (PlaytestSessionTests): HUD buttons must answer a real pointer, the hint must fit
    /// the moment, and on a narrow screen the transient message must not sit on the unit card.
    /// </summary>
    public sealed class HudInputTests
    {
        private MapController map = null!;
        private Mouse mouse = null!;
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
            mouse = InputSystem.AddDevice<Mouse>("HudTestMouse");
        }

        [TearDown]
        public void TearDown()
        {
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

        private IEnumerator ClickAt(Vector2 position)
        {
            InputSystem.QueueStateEvent(mouse, new MouseState { position = position });
            yield return null;
            yield return null;
            InputSystem.QueueStateEvent(mouse, new MouseState { position = position }.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left));
            yield return null;
            InputSystem.QueueStateEvent(mouse, new MouseState { position = position });
            yield return null;
            yield return null;
        }

        private Vector2 ScreenCentreOf(string elementName)
        {
            Rect r = map.Hud.Root.Q(elementName).worldBound;
            float scale = Screen.height / map.Hud.Root.layout.height;
            return new Vector2(r.center.x * scale, Screen.height - r.center.y * scale);
        }

        [UnityTest]
        public IEnumerator ARealMouseClickOnTheEndTurnButtonEndsTheTurn()
        {
            yield return Boot();
            int turn = map.Session.State.Turn;

            yield return ClickAt(ScreenCentreOf("end-turn"));
            float until = Time.realtimeSinceStartup + 10f;
            while (map.Runner.IsBusy && Time.realtimeSinceStartup < until) yield return null;
            yield return null;

            Assert.AreEqual(turn + 1, map.Session.State.Turn, "UI Toolkit needs an EventSystem to hear the pointer");
        }

        [UnityTest]
        public IEnumerator HintSaysSelectFirstThenPreviewOnceAUnitIsSelected()
        {
            yield return Boot();
            Label hint = (Label)map.Hud.HintStrip;
            string select = map.Text.Get("ui.hint_select");
            Assert.AreEqual(select, hint.text, "nothing selected: the hint tells the player to select a unit");

            UnitView mine = map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot);
            map.SimulateClick(map.ScreenPointOfBanner(mine.Id));
            yield return null;
            Assert.AreEqual(map.Text.Get("ui.hint_move"), hint.text);

            map.Interaction.Deselect();
            yield return null;
            Assert.AreEqual(select, hint.text, "back to the select hint after deselecting");
        }

        [UnityTest]
        public IEnumerator OnAPortraitScreenTheMessageDoesNotCoverTheUnitCard()
        {
            yield return Boot();
            UnitView mine = map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot);
            ShotKit.Target target = ShotKit.Begin(map, 1080, 1920);
            try
            {
                map.Rig.Refit();
                map.SimulateClick(map.ScreenPointOfBanner(mine.Id));
                map.Hud.ShowMessage("Tap again to confirm", 5f);
                yield return ShotKit.Frames(6);

                Assert.IsTrue(map.Hud.Narrow);
                Rect card = map.Hud.Root.Q("unit-card").worldBound;
                Rect message = map.Hud.Root.Q("message").worldBound;
                Assert.Greater(card.height, 10f, "the unit card is showing");
                Assert.Greater(message.height, 10f, "the message is showing");
                Assert.IsFalse(card.Overlaps(message), "message " + message + " must not overlap the card " + card);
                Assert.IsFalse(map.Hud.Root.Q("end-turn").worldBound.Overlaps(message), "nor the End turn button");
            }
            finally
            {
                ShotKit.End(map, target);
            }
        }
    }
}
