using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Shared setup of the order-UI play tests: virtual mouse, keyboard and touchscreen (so the real input router, picking
    /// and UI Toolkit code run), booting the game, finding HUD elements on screen, and pictures at a chosen size.
    /// </summary>
    public abstract class UiPlayHarness
    {
        protected MapController map = null!;
        protected Mouse mouse = null!;
        protected Keyboard keyboard = null!;
        protected Touchscreen? touch;
        private readonly List<InputDevice> disabled = new List<InputDevice>();
        private InputSettings.EditorInputBehaviorInPlayMode oldEditorBehavior;
        private InputSettings.BackgroundBehavior oldBackground;

        public const string ShotFolder = "ui3/";

        [SetUp]
        public void BaseSetUp()
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
            mouse = InputSystem.AddDevice<Mouse>("UiTestMouse");
            keyboard = InputSystem.AddDevice<Keyboard>("UiTestKeyboard");
            MapController.QuitToTitleOverride = null;
            SaveStorageFactory.Override = null;
        }

        [TearDown]
        public void BaseTearDown()
        {
            MapController.QuitToTitleOverride = null;
            SaveStorageFactory.Override = null;
            if (touch != null && touch.added) InputSystem.RemoveDevice(touch);
            InputSystem.RemoveDevice(mouse);
            InputSystem.RemoveDevice(keyboard);
            foreach (InputDevice d in disabled) InputSystem.EnableDevice(d);
            InputSystem.settings.backgroundBehavior = oldBackground;
            InputSystem.settings.editorInputBehaviorInPlayMode = oldEditorBehavior;
        }

        protected IEnumerator Boot()
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

        protected IEnumerator Frames(int n)
        {
            for (int i = 0; i < n; i++) yield return null;
        }

        protected IEnumerator WaitIdle()
        {
            float until = Time.realtimeSinceStartup + 20f;
            while (map.Runner.IsBusy && Time.realtimeSinceStartup < until) yield return null;
            Assert.IsFalse(map.Runner.IsBusy, "the cues never finished");
            yield return Frames(3);
        }

        // ----- mouse -----

        protected IEnumerator ClickAt(Vector2 position, bool right = false)
        {
            InputSystem.QueueStateEvent(mouse, new MouseState { position = position });
            yield return Frames(2);
            MouseState down = new MouseState { position = position }.WithButton(right ? UnityEngine.InputSystem.LowLevel.MouseButton.Right : UnityEngine.InputSystem.LowLevel.MouseButton.Left);
            InputSystem.QueueStateEvent(mouse, down);
            yield return null;
            InputSystem.QueueStateEvent(mouse, new MouseState { position = position });
            yield return Frames(2);
        }

        protected IEnumerator ClickElement(string name)
        {
            yield return ClickAt(ScreenCentreOf(name));
        }

        protected Vector2 ScreenCentreOf(string elementName)
        {
            VisualElement element = map.Hud.Root.Q(elementName);
            Assert.NotNull(element, "no HUD element named " + elementName);
            Rect r = element.worldBound;
            float scale = Screen.height / map.Hud.Root.layout.height;
            return new Vector2(r.center.x * scale, Screen.height - r.center.y * scale);
        }

        protected bool Shown(string elementName)
        {
            VisualElement? e = map.Hud.Root.Q(elementName);
            return e != null && e.resolvedStyle.display != DisplayStyle.None && e.worldBound.height > 1f;
        }

        // ----- keyboard and touch -----

        protected IEnumerator PressKey(Key key)
        {
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(key));
            yield return Frames(2);
            InputSystem.QueueStateEvent(keyboard, new KeyboardState());
            yield return Frames(2);
        }

        protected IEnumerator Tap(Vector2 at)
        {
            if (touch == null || !touch.added) touch = InputSystem.AddDevice<Touchscreen>("UiTestTouch");
            InputSystem.QueueStateEvent(touch, new TouchState { touchId = 1, phase = TouchPhase.Began, position = at, pressure = 1f });
            yield return null;
            InputSystem.QueueStateEvent(touch, new TouchState { touchId = 1, phase = TouchPhase.Ended, position = at, pressure = 1f });
            yield return Frames(3);
        }

        // ----- pictures -----

        protected IEnumerator Shot(string name, int width, int height)
        {
            ShotKit.Target t = ShotKit.Begin(map, width, height);
            map.Rig.Refit();
            yield return Frames(8);
            Texture2D picture = ShotKit.Grab(map, t);
            ShotKit.Save(picture, ShotFolder + name + "-" + width + "x" + height + ".png");
            Object.Destroy(picture);
            ShotKit.End(map, t);
            map.Rig.Refit();
            yield return Frames(4);
        }

        // ----- game arrangement -----

        /// <summary>
        /// Moves one of the player's line units next to an opposing line unit (through the core's immutable state edit),
        /// restores that state into the running session, and centres the camera there. Returns the two units.
        /// </summary>
        protected IEnumerator ArrangeFight(System.Action<UnitView, UnitView> done)
        {
            GameSession session = map.Session;
            GameState state = session.State;
            UnitView opposing = state.AsView().Units.First(u => u.Owner != session.LocalSlot && u.Role == UnitRole.Line);
            UnitView line = state.AsView().Units.First(u => u.Owner == session.LocalSlot && u.Role == UnitRole.Line);
            TileCoord spot = FreeNeighbour(state, opposing.Pos);
            Unit moved = state.UnitTable[state.FindUnitIndex(line.Id)] with { Pos = spot, Leader = 0, AttachedBase = 0 };
            session.Restore(state.WithUnit(moved));
            yield return Frames(3);
            map.Rig.CenterOnTile(new GridPos(opposing.Pos.X, opposing.Pos.Y));
            yield return Frames(4);
            done(session.State.AsView().Units.First(u => u.Id == line.Id), opposing);
        }

        private static TileCoord FreeNeighbour(GameState state, TileCoord around)
        {
            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dy == 0) continue;
                    var t = new TileCoord(around.X + dx, around.Y + dy);
                    if (state.InBounds(t) && state.TerrainAt(t) == Conquest.Core.Contracts.Terrain.Open && state.UnitsAt(t).Count == 0 && state.FindBaseIndexAt(t) < 0) return t;
                }
            }

            throw new System.InvalidOperationException("no free tile next to " + around);
        }
    }
}
