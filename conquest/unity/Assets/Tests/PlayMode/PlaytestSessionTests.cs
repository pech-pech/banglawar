using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// A scripted playtest: every action goes through virtual Input System devices (mouse, keyboard, touchscreen), so
    /// the real <see cref="InputRouter"/>, picking, selection and HUD code run. Observations are written to
    /// Screenshots/playtest/log.txt with a picture per step. Batch-mode frame times are NOT representative of a player's
    /// machine (no vsync, software-ish timing, render textures read back on the CPU).
    /// </summary>
    [Explicit("Run through conquest/tools/unity/run_tests.sh PlayMode PlaytestSessionTests; writes pictures and a log")]
    public sealed class PlaytestSessionTests
    {
        private const string Folder = "playtest2/";

        private MapController map = null!;
        private readonly StringBuilder log = new StringBuilder();
        private readonly List<string> errors = new List<string>();
        private readonly List<float> frameMs = new List<float>();
        private int step;
        private string uitkEvents = "";
        private InputSettings.BackgroundBehavior oldBackground;
        private InputSettings.EditorInputBehaviorInPlayMode oldEditorBehavior;

        // virtual devices
        private Mouse mouse = null!;
        private Keyboard keyboard = null!;
        private Touchscreen? touch;
        private readonly List<InputDevice> disabled = new List<InputDevice>();
        private Vector2 mousePos;
        private bool left;
        private bool right;

        private void Note(string line)
        {
            log.AppendLine(line);
            Debug.Log("[playtest] " + line);
        }

        private void Issue(bool ok, string what)
        {
            Note((ok ? "  ok     " : "  ISSUE  ") + what);
        }

        private void OnLog(string condition, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) errors.Add(type + ": " + condition);
            if (type == LogType.Warning) log.AppendLine("  warning: " + condition);
        }

        [SetUp]
        public void SetUp()
        {
            Application.logMessageReceived += OnLog;
            LogAssert.ignoreFailingMessages = true;
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
            mouse = InputSystem.AddDevice<Mouse>("PlaytestMouse");
            keyboard = InputSystem.AddDevice<Keyboard>("PlaytestKeyboard");
        }

        [TearDown]
        public void TearDown()
        {
            Application.logMessageReceived -= OnLog;
            LogAssert.ignoreFailingMessages = false;
            InputSystem.settings.backgroundBehavior = oldBackground;
            InputSystem.settings.editorInputBehaviorInPlayMode = oldEditorBehavior;
            if (touch != null && touch.added) InputSystem.RemoveDevice(touch);
            InputSystem.RemoveDevice(mouse);
            InputSystem.RemoveDevice(keyboard);
            foreach (InputDevice d in disabled) InputSystem.EnableDevice(d);
            string path = Path.Combine(ShotKit.Folder(Folder), "log.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, log + "\nconsole errors/exceptions: " + errors.Count + "\n" + string.Join("\n", errors));
        }

        // ----- input helpers -----

        private void SendMouse(Vector2 scroll = default)
        {
            Vector2 previous = mouse.position.ReadValue();
            var state = new MouseState { position = mousePos, delta = mousePos - previous, scroll = scroll };
            if (left) state = state.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left);
            if (right) state = state.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Right);
            InputSystem.QueueStateEvent(mouse, state);
        }

        private IEnumerator MoveMouse(Vector2 to, int frames = 1)
        {
            Vector2 from = mousePos;
            for (int i = 1; i <= frames; i++)
            {
                mousePos = Vector2.Lerp(from, to, i / (float)frames);
                SendMouse();
                yield return Frame();
            }
        }

        private IEnumerator Frame()
        {
            yield return null;
            frameMs.Add(Time.unscaledDeltaTime * 1000f);
        }

        private IEnumerator Click(Vector2 at, bool secondary = false)
        {
            PickResult dpick = map.PickAt(at);
            Note("    click at " + at + " pick unit " + (dpick.UnitId.HasValue ? dpick.UnitId.Value.ToString() : "-") + " tile " + (dpick.Tile.HasValue ? dpick.Tile.Value.ToString() : "-") + " overUi " + map.Hud.IsPointerOverUi(at) + " busy " + map.Runner.IsBusy);
            yield return MoveMouse(at);
            yield return Frame();
            if (secondary) right = true; else left = true;
            SendMouse();
            yield return Frame();
            right = false;
            left = false;
            SendMouse();
            yield return Frame();
            yield return Frame();
        }

        private IEnumerator Drag(Vector2 from, Vector2 to, int frames)
        {
            yield return MoveMouse(from);
            left = true;
            SendMouse();
            yield return Frame();
            yield return MoveMouse(to, frames);
            left = false;
            SendMouse();
            yield return Frame();
            yield return Frame();
        }

        private IEnumerator Scroll(Vector2 at, float amount)
        {
            yield return MoveMouse(at);
            SendMouse(new Vector2(0f, amount));
            yield return Frame();
            SendMouse();
            yield return Frame();
        }

        private IEnumerator PressKey(Key key, int heldFrames = 2)
        {
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(key));
            for (int i = 0; i < heldFrames; i++) yield return Frame();
            InputSystem.QueueStateEvent(keyboard, new KeyboardState());
            yield return Frame();
            yield return Frame();
        }

        private void EnsureTouch()
        {
            if (touch == null || !touch.added) touch = InputSystem.AddDevice<Touchscreen>("PlaytestTouch");
        }

        private void SendTouch(int id, TouchPhase phase, Vector2 position, Vector2 delta = default)
        {
            InputSystem.QueueStateEvent(touch!, new TouchState { touchId = id, phase = phase, position = position, delta = delta, pressure = 1f });
        }

        private IEnumerator Tap(Vector2 at)
        {
            EnsureTouch();
            SendTouch(1, TouchPhase.Began, at);
            yield return Frame();
            SendTouch(1, TouchPhase.Ended, at);
            yield return Frame();
            yield return Frame();
            yield return Frame();
        }

        private IEnumerator TouchDrag(Vector2 from, Vector2 to, int frames)
        {
            EnsureTouch();
            SendTouch(1, TouchPhase.Began, from);
            yield return Frame();
            Vector2 last = from;
            for (int i = 1; i <= frames; i++)
            {
                Vector2 p = Vector2.Lerp(from, to, i / (float)frames);
                SendTouch(1, TouchPhase.Moved, p, p - last);
                last = p;
                yield return Frame();
            }

            SendTouch(1, TouchPhase.Ended, to);
            yield return Frame();
            yield return Frame();
        }

        private IEnumerator Pinch(Vector2 centre, float startHalf, float endHalf, int frames)
        {
            EnsureTouch();
            Vector2 a0 = centre + new Vector2(-startHalf, 0);
            Vector2 b0 = centre + new Vector2(startHalf, 0);
            SendTouch(1, TouchPhase.Began, a0);
            SendTouch(2, TouchPhase.Began, b0);
            yield return Frame();
            for (int i = 1; i <= frames; i++)
            {
                float half = Mathf.Lerp(startHalf, endHalf, i / (float)frames);
                SendTouch(1, TouchPhase.Moved, centre + new Vector2(-half, 0));
                SendTouch(2, TouchPhase.Moved, centre + new Vector2(half, 0));
                yield return Frame();
            }

            SendTouch(1, TouchPhase.Ended, centre + new Vector2(-endHalf, 0));
            SendTouch(2, TouchPhase.Ended, centre + new Vector2(endHalf, 0));
            yield return Frame();
            yield return Frame();
        }

        // ----- scene helpers -----

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

        private IEnumerator WaitIdle()
        {
            float until = Time.realtimeSinceStartup + 20f;
            while (map.Runner.IsBusy && Time.realtimeSinceStartup < until) yield return null;
            Issue(!map.Runner.IsBusy, "cues finished");
            for (int i = 0; i < 3; i++) yield return Frame();
        }

        private int shotWidth = 1280;
        private int shotHeight = 720;

        /// <summary>
        /// Interaction runs on the real screen (Screen.width x Screen.height, camera and panel unredirected) so the
        /// pointer maths is the shipped maths. A picture temporarily redirects camera and panel to render textures of
        /// the chosen size, then puts them back.
        /// </summary>
        private IEnumerator Shot(string name)
        {
            step++;
            ShotKit.Target t = ShotKit.Begin(map, shotWidth, shotHeight);
            for (int i = 0; i < 6; i++) yield return Frame();
            Texture2D picture = ShotKit.Grab(map, t);
            ShotKit.Save(picture, Folder + step.ToString("00") + "-" + name + ".png");
            Object.Destroy(picture);
            ShotKit.End(map, t);
            for (int i = 0; i < 4; i++) yield return Frame();
        }

        private IEnumerator SetSize(int width, int height)
        {
            shotWidth = width;
            shotHeight = height;
            Note("pictures now " + width + "x" + height + "; interaction viewport " + map.Rig.ViewportWidth + "x" + map.Rig.ViewportHeight + " (Screen " + Screen.width + "x" + Screen.height + ")  hud panel " + map.Hud.Root.layout.width + "x" + map.Hud.Root.layout.height + "  zoom " + map.Rig.Model.ZoomPermille);
            yield return Frame();
        }

        private Vector2 Mid() => new Vector2(map.Rig.ViewportWidth / 2f, map.Rig.ViewportHeight / 2f);

        private Vector2 At(float fx, float fy) => new Vector2(map.Rig.ViewportWidth * fx, map.Rig.ViewportHeight * fy);

        private Vector2 PanelToScreen(Rect panelRect)
        {
            float scale = map.Rig.ViewportHeight / map.Hud.Root.layout.height;
            return new Vector2(panelRect.center.x * scale, map.Rig.ViewportHeight - panelRect.center.y * scale);
        }

        private Vector2 CentreOf(string elementName) => PanelToScreen(map.Hud.Root.Q(elementName).worldBound);

        private string Message()
        {
            Label m = map.Hud.Root.Q<Label>("message");
            return m.style.display.value == DisplayStyle.None ? "(none)" : m.text;
        }

        private IReadOnlyList<UnitView> Units() => map.Session.State.AsView().Units;

        private string Describe(UnitView u) => "u" + u.Id + " " + u.Role + " owner " + u.Owner + " at " + u.Pos.X + "," + u.Pos.Y + " moves " + u.MovesLeft;

        private string Sel()
        {
            SelectionModel s = map.Interaction.Selection;
            return "selected [" + string.Join(",", s.SelectedIds) + "] mode " + s.Mode + " hover tile " + (s.HoveredTile.HasValue ? s.HoveredTile.Value.ToString() : "-") + " hover unit " + s.HoveredUnitId + " pending " + (map.Interaction.PendingTarget.HasValue ? map.Interaction.PendingTarget.Value.ToString() : "-");
        }

        private void Stats(string phase, int from)
        {
            List<float> slice = frameMs.Skip(from).OrderBy(x => x).ToList();
            if (slice.Count == 0) return;
            Note("frame time (" + phase + ", batch mode, not representative): n " + slice.Count + " mean " + slice.Average().ToString("0.0") + " ms, p95 " + slice[(int)(slice.Count * 0.95f)].ToString("0.0") + " ms, max " + slice[slice.Count - 1].ToString("0.0") + " ms");
        }

        // ----- the session -----

        [UnityTest]
        public IEnumerator PlayASkirmishThroughRealInput()
        {
            yield return Boot();
            yield return SetSize(1280, 720);
            int local = map.Session.LocalSlot;

            Note("== 1. start");
            foreach (UnitView u in Units()) Note("  " + Describe(u));
            Note("  hud: " + map.Hud.DumpText());
            Note("  hint: " + ((Label)map.Hud.HintStrip).text);
            Note("  stacks: " + string.Join("; ", map.Banners.Stacks.Where(s => s.Value.Count > 1).Select(s => s.Key + " x" + s.Value.Count)));
            yield return Shot("start");

            Note("== 2. hover a banner");
            Note("  input diag: current mouse " + Mouse.current?.name + " mine " + mouse.name + " added " + mouse.added + " enabled " + mouse.enabled + " update mode " + InputSystem.settings.updateMode + " focused " + Application.isFocused + " devices " + string.Join(",", InputSystem.devices.Select(d => d.name + (d.enabled ? "" : "(off)"))));
            UnitView commander = Units().First(u => u.Owner == local && u.Role == UnitRole.Commander);
            yield return MoveMouse(map.ScreenPointOfBanner(commander.Id), 5);
            Note("  mouse pos " + mouse.position.ReadValue() + " target " + map.ScreenPointOfBanner(commander.Id) + " current pos " + Mouse.current?.position.ReadValue());
            Note("  " + Sel());
            Issue(map.Interaction.Selection.HoveredUnitId == commander.Id, "hover reaches the commander banner");
            yield return Shot("hover-banner");

            Note("== 3. click the commander (real mouse)");
            yield return Click(map.ScreenPointOfBanner(commander.Id));
            for (int i = 0; i < 15; i++) yield return Frame();
            Note("  " + Sel());
            Issue(map.Interaction.Selection.IsSelected(commander.Id), "click selects");
            Issue(map.Hud.Root.Q("unit-card").style.display.value == DisplayStyle.Flex, "unit card shows");
            Note("  card: " + map.Hud.Root.Q<Label>("card-title").text + " | " + map.Hud.Root.Q<Label>("card-moves").text);
            yield return Shot("selected");

            Note("== 4. hover a far tile: path preview");
            var far = new GridPos(commander.Pos.X + 3, commander.Pos.Y);
            yield return MoveMouse(map.ScreenPointOfTile(far), 6);
            Note("  preview found " + map.Interaction.Preview.Found + " steps " + map.Interaction.Preview.Steps.Count + " cost " + map.Interaction.Preview.TotalCost + " dots " + map.Overlay.VisibleDots);
            Issue(map.Interaction.Preview.Found && map.Overlay.VisibleDots == 3, "3 path dots");
            yield return Shot("preview");

            Note("== 5. tap-twice rule with the mouse");
            yield return Click(map.ScreenPointOfTile(far));
            Note("  after first click: pending " + map.Interaction.PendingTarget + " orders " + map.Session.AcceptedCommands.Count + " message '" + Message() + "'");
            Issue(map.Interaction.PendingTarget == far && map.Session.AcceptedCommands.Count == 0, "first click only previews");
            yield return Shot("pending");
            yield return Click(map.ScreenPointOfTile(far));
            Issue(map.Session.AcceptedCommands.Count == 1, "second click confirms");
            yield return Frame();
            Issue(map.Runner.IsBusy, "move animation plays");
            yield return Shot("moving");
            yield return WaitIdle();
            Note("  after move: " + Sel() + " message '" + Message() + "'");
            yield return Shot("moved");

            Note("== 6. unreachable / blocked target and right click");
            var tooFar = new GridPos(commander.Pos.X + 3, commander.Pos.Y + 4);
            yield return Click(map.ScreenPointOfTile(tooFar));
            Note("  far tile click: pending " + map.Interaction.PendingTarget + " preview found " + map.Interaction.Preview.Found + " steps " + map.Interaction.Preview.Steps.Count + " message '" + Message() + "'");
            yield return Shot("far-tile-preview");
            yield return Click(map.ScreenPointOfTile(new GridPos(commander.Pos.X + 3, commander.Pos.Y + 1)), true);
            Note("  right click: orders " + map.Session.AcceptedCommands.Count + " message '" + Message() + "' error " + map.Interaction.LastErrorCode);
            yield return WaitIdle();
            yield return Shot("right-click-order");

            Note("== 7. stacked banners");
            yield return PressKey(Key.Escape);
            var stacks = map.Banners.Stacks.Where(s => s.Value.Count > 1 && s.Value.Any(m => m.Owner == local)).ToList();
            if (stacks.Count == 0) Note("  no friendly stack left on the map");
            foreach (var stack in stacks.Take(1))
            {
                GridPos tile = stack.Key;
                Note("  stack at " + tile + " members " + string.Join(",", stack.Value.Select(m => m.Id)));
                var reached = new HashSet<int>();
                foreach (StackMemberView m in StackViews(tile))
                {
                    if (map.Banners.Banners[m.Id].Hidden) continue;
                    map.Interaction.Deselect();
                    yield return Click(map.ScreenPointOfBanner(m.Id));
                    reached.Add(map.Interaction.Selection.PrimaryId);
                    Issue(map.Interaction.Selection.PrimaryId == m.Id, "banner u" + m.Id + " click selects itself (got u" + map.Interaction.Selection.PrimaryId + ")");
                }

                Vector2? badge = map.ScreenPointOfBadge(tile);
                if (badge.HasValue)
                {
                    yield return Click(badge.Value);
                    Note("  badge click: " + Sel());
                    Issue(map.Interaction.Selection.SelectedIds.Count == stack.Value.Count, "badge selects the whole stack");
                    yield return Shot("stack-selected");
                }
                else
                {
                    Note("  no badge for the stack");
                }
            }

            Note("== 8. enemy: inspect and attack");
            UnitView? enemy = Units().FirstOrDefault(u => u.Owner != local);
            if (enemy != null)
            {
                Note("  enemy " + Describe(enemy));
                map.Rig.CenterOnTile(new GridPos(enemy.Pos.X, enemy.Pos.Y));
                for (int i = 0; i < 4; i++) yield return Frame();
                if (map.Banners.Banners.ContainsKey(enemy.Id))
                {
                    yield return Click(map.ScreenPointOfBanner(enemy.Id));
                    Note("  after clicking enemy banner: " + Sel() + " card '" + map.Hud.Root.Q<Label>("card-title").text + "' orders " + map.Interaction.OrdersSent);
                    Issue(!map.Interaction.Selection.CanCommand, "an enemy only inspects");
                    Note("  overlay pieces on: " + string.Join("; ", map.Overlay.ActivePieces().Select(p => p.name + "@" + p.position)));
                    float settleUntil = Time.unscaledTime + 0.4f;
                    while (Time.unscaledTime < settleUntil) yield return Frame();
                    Note("  holograms blending 0.4 s after the click: " + string.Join(", ", map.Banners.Banners.Where(b => b.Value.BlendPermille > 0).Select(b => "u" + b.Key + "=" + b.Value.BlendPermille)) + " t=" + Time.unscaledTime);
                    yield return Shot("enemy-inspect");
                    Note("  holograms blending after the picture: " + string.Join(", ", map.Banners.Banners.Where(b => b.Value.BlendPermille > 0).Select(b => "u" + b.Key + "=" + b.Value.BlendPermille)) + " t=" + Time.unscaledTime);
                }
            }
            else
            {
                Note("  no enemy unit exists in the skirmish scenario state");
            }

            Note("== 8b. order a friendly stack at an enemy stack (attack?)");
            {
                map.Rig.CenterOnTile(new GridPos(enemy!.Pos.X, enemy.Pos.Y));
                for (int i = 0; i < 3; i++) yield return Frame();
                map.Interaction.Deselect();
                map.Interaction.SelectNext();
                Note("  selected for the test: " + Sel());
                yield return Click(map.ScreenPointOfTile(new GridPos(enemy.Pos.X, enemy.Pos.Y)), true);
                Note("  right click on the enemy tile: orders " + map.Session.AcceptedCommands.Count + " error " + map.Interaction.LastErrorCode + " message '" + Message() + "'");
                yield return Shot("order-at-enemy");
                Note("  note: no UI path issues an AttackCommand (GameSession.Submit supports it)");
                map.Interaction.Deselect();
            }

            Note("== 9. found a base from the founder, clicking the real button");
            UnitView founder = Units().First(u => u.Owner == local && u.Role == UnitRole.Founder);
            map.Rig.CenterOnTile(new GridPos(founder.Pos.X, founder.Pos.Y));
            for (int i = 0; i < 4; i++) yield return Frame();
            yield return Click(map.ScreenPointOfBanner(founder.Id));
            Note("  " + Sel() + " found button " + map.Hud.Root.Q<Button>("found-base").style.display.value);
            yield return Shot("founder-selected");
            int pieces = map.Structures.PieceCount;
            yield return Click(CentreOf("found-base"));
            yield return WaitIdle();
            Note("  structures " + pieces + " -> " + map.Structures.PieceCount + " founder banner still there: " + map.Banners.Banners.ContainsKey(founder.Id) + " message '" + Message() + "'");
            Issue(map.Structures.PieceCount == pieces + 1, "clicking the Found base button with the mouse founds a base");
            yield return Shot("base-founded");

            {
                StructurePiece[] near = map.Structures.Pieces.Where(p => System.Math.Abs(p.RuleTile.X - 3) + System.Math.Abs(p.RuleTile.Y - 3) <= 1).ToArray();
                Note("  structure pieces within 1 of (3,3): " + string.Join("; ", near.Select(p => p.Role + "@" + p.RuleTile + " art " + p.UsesArt + " sprite " + (p.Renderer.sprite != null ? p.Renderer.sprite.name : "none") + " order " + p.Renderer.sortingOrder + " enabled " + p.Renderer.enabled)));
                map.Interaction.Deselect();
                map.Rig.CenterOnTile(new GridPos(3, 3));
                map.Rig.SetModel(map.Rig.Model.ZoomTo(1400, (int)Mid().x, (int)Mid().y));
                for (int i = 0; i < 4; i++) yield return Frame();
                yield return Shot("base-closeup");
            }

            Note("== 10. build: is there any build UI?");
            Note("  buttons: " + string.Join(", ", map.Hud.Root.Query<Button>().ToList().Select(b => b.name + "(" + (b.resolvedStyle.display == DisplayStyle.None ? "hidden" : "shown") + ")")));

            Note("== 11. keyboard: Tab to the next unit, then end turn with E several times");
            yield return PressKey(Key.Tab);
            Note("  Tab: " + Sel());
            yield return Shot("tab-next");
            for (int turn = 0; turn < 4; turn++)
            {
                yield return PressKey(Key.E);
                yield return WaitIdle();
                Note("  turn label '" + map.Hud.Root.Q<Label>("turn-label").text + "' season '" + map.Hud.Root.Q<Label>("season-label").text + "' state turn " + map.Session.State.Turn + " moves left of commander " + Units().First(u => u.Id == commander.Id).MovesLeft);
                if (turn == 1) yield return Shot("after-two-turns");
            }

            Note("== 12. end-turn button with the real mouse");
            {
                Button et = map.Hud.Root.Q<Button>("end-turn");
                et.RegisterCallback<PointerEnterEvent>(e => uitkEvents += "E");
                et.RegisterCallback<PointerDownEvent>(e => uitkEvents += "D");
                et.RegisterCallback<ClickEvent>(e => uitkEvents += "C");
                yield return MoveMouse(CentreOf("end-turn"), 3);
                yield return Frame();
                Note("  diag: end-turn enter/down/click " + uitkEvents + " eventSystems " + Object.FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None).Count(m => m.GetType().Name.Contains("EventSystem") || m.GetType().Name.Contains("InputModule")) + " panels " + Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None).Length + " panelSettings " + map.Hud.Document.panelSettings.name + " target " + map.Hud.Document.panelSettings.targetTexture + " scale " + map.Hud.Document.panelSettings.scaleMode + " worldBound " + et.worldBound + " screen " + Screen.width + "x" + Screen.height + " focused " + Application.isFocused);
            }
            int before = map.Session.State.Turn;
            yield return Click(CentreOf("end-turn"));
            yield return WaitIdle();
            Note("  uitk events on end-turn: '" + uitkEvents + "'");
            Issue(map.Session.State.Turn == before + 1, "clicking the End turn button with the mouse ends the turn (turn " + before + " -> " + map.Session.State.Turn + ")");
            yield return Shot("end-turn-button");

            Note("== 13. pan and zoom");
            int panFrom = frameMs.Count;
            CameraModel cam0 = map.Rig.Model;
            string selBefore = string.Join(",", map.Interaction.Selection.SelectedIds);
            yield return Drag(At(0.5f, 0.45f), At(0.4f, 0.5f), 10);
            CameraModel cam1 = map.Rig.Model;
            Note("  drag: centre " + cam0.CenterX + "," + cam0.CenterY + " -> " + cam1.CenterX + "," + cam1.CenterY + "; selection unchanged: " + (selBefore == string.Join(",", map.Interaction.Selection.SelectedIds)));
            Issue(cam1.CenterX != cam0.CenterX || cam1.CenterY != cam0.CenterY, "mouse drag pans");
            Issue(selBefore == string.Join(",", map.Interaction.Selection.SelectedIds), "a drag does not select or order");
            yield return Shot("panned");
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.D));
            for (int i = 0; i < 20; i++) yield return Frame();
            InputSystem.QueueStateEvent(keyboard, new KeyboardState());
            yield return Frame();
            Note("  D held: centre " + map.Rig.Model.CenterX + "," + map.Rig.Model.CenterY);
            yield return Shot("pan-key");
            int z0 = map.Rig.Model.ZoomPermille;
            yield return Scroll(Mid(), 120f);
            int z1 = map.Rig.Model.ZoomPermille;
            yield return Scroll(Mid(), 120f);
            yield return Scroll(Mid(), 120f);
            Note("  wheel up x3: zoom " + z0 + " -> " + z1 + " -> " + map.Rig.Model.ZoomPermille);
            Issue(z1 > z0, "wheel up zooms in");
            yield return Shot("zoom-in");
            for (int i = 0; i < 9; i++) yield return PressKey(Key.Minus, 1);
            Note("  minus x9: zoom " + map.Rig.Model.ZoomPermille);
            yield return Shot("zoom-out-max");
            for (int i = 0; i < 4; i++) yield return PressKey(Key.Equals, 1);
            Note("  plus x4: zoom " + map.Rig.Model.ZoomPermille);
            Stats("pan and zoom", panFrom);
            yield return Shot("zoom-mid");

            Note("== 14. lake and shore at several zooms (look at the pictures)");
            map.Rig.Refit();
            for (int i = 0; i < 4; i++) yield return Frame();
            yield return Shot("fit-full-map");
            map.Rig.SetModel(map.Rig.Model.ZoomTo(1400, (int)Mid().x, (int)Mid().y));
            for (int i = 0; i < 3; i++) yield return Frame();
            yield return Shot("zoom1400-centre");
            map.Rig.SetModel(map.Rig.Model.ZoomTo(2000, (int)Mid().x, (int)Mid().y));
            for (int i = 0; i < 3; i++) yield return Frame();
            yield return Shot("zoom2000-centre");
            foreach ((string label, GridPos where) in new[] { ("lake", new GridPos(2, 7)), ("river-east", new GridPos(11, 2)), ("river-west", new GridPos(0, 8)), ("river-mid", new GridPos(6, 6)) })
            {
                map.Rig.SetModel(map.Rig.Model.ZoomTo(1400, (int)Mid().x, (int)Mid().y).CenterOn(new Conquest.Presentation.IsoProjection().GridToWorld(where)));
                for (int i = 0; i < 3; i++) yield return Frame();
                yield return Shot("zoom1400-" + label);
            }

            Note("== 15. language switch to Bengali (L key)");
            map.Rig.Refit();
            string english = map.Hud.DumpText();
            yield return PressKey(Key.L);
            for (int i = 0; i < 6; i++) yield return Frame();
            Note("  locale " + map.Text.Locale + "; hud: " + map.Hud.DumpText());
            Issue(map.Hud.DumpText() != english, "HUD relabels");
            yield return Shot("bengali");
            UnitView anyMine = Units().First(u => u.Owner == local);
            yield return Click(map.ScreenPointOfBanner(anyMine.Id));
            yield return Shot("bengali-unit-card");
            yield return Click(CentreOf("language-button"));
            for (int i = 0; i < 4; i++) yield return Frame();
            Note("  language button click -> locale " + map.Text.Locale);
            Issue(map.Text.Locale == Localizer.English, "language button toggles back with the mouse");

            Note("== 16. debug panel (F3)");
            yield return PressKey(Key.F3);
            yield return Shot("debug-panel");
            yield return PressKey(Key.F3);

            Note("== 17. touch: tap, tap-twice, drag, pinch");
            yield return PressKey(Key.Escape);
            EnsureTouch();
            yield return Frame();
            UnitView mine = Units().First(u => u.Owner == local && u.Id != founder.Id && map.Banners.Banners.ContainsKey(u.Id));
            map.Rig.Refit();
            for (int i = 0; i < 4; i++) yield return Frame();
            yield return Tap(map.ScreenPointOfBanner(mine.Id));
            Note("  tap unit: " + Sel() + " hint '" + ((Label)map.Hud.HintStrip).text + "' minHit " + map.Banners.MinHitPx);
            Issue(map.Interaction.Selection.IsSelected(mine.Id), "tap selects");
            yield return Shot("touch-selected");
            var tdest = new GridPos(mine.Pos.X, mine.Pos.Y + 2);
            yield return Tap(map.ScreenPointOfTile(tdest));
            Note("  first tap tile: pending " + map.Interaction.PendingTarget + " message '" + Message() + "'");
            Issue(map.Interaction.PendingTarget == tdest, "first tap previews");
            yield return Shot("touch-pending");
            int ordersBefore = map.Session.AcceptedCommands.Count;
            yield return Tap(map.ScreenPointOfTile(tdest));
            Issue(map.Session.AcceptedCommands.Count == ordersBefore + 1, "second tap confirms");
            yield return WaitIdle();
            CameraModel tc0 = map.Rig.Model;
            yield return TouchDrag(At(0.55f, 0.45f), At(0.45f, 0.5f), 8);
            Note("  one-finger drag: centre " + tc0.CenterX + "," + tc0.CenterY + " -> " + map.Rig.Model.CenterX + "," + map.Rig.Model.CenterY);
            Issue(map.Rig.Model.CenterX != tc0.CenterX || map.Rig.Model.CenterY != tc0.CenterY, "finger drag pans");
            int zt0 = map.Rig.Model.ZoomPermille;
            yield return Pinch(Mid(), 30, 100, 10);
            Note("  pinch out: zoom " + zt0 + " -> " + map.Rig.Model.ZoomPermille);
            Issue(map.Rig.Model.ZoomPermille > zt0, "pinch out zooms in");
            yield return Shot("touch-pinch");
            Note("  touch hud buttons: end-turn height " + map.Hud.Root.Q("end-turn").worldBound.height + " panel units; found-base " + map.Hud.Root.Q("found-base").worldBound.height);

            Note("== 18. portrait phone (1080x1920) with touch");
            yield return SetSize(1080, 1920);
            map.Rig.Refit();
            for (int i = 0; i < 4; i++) yield return Frame();
            yield return Shot("portrait-fit");
            UnitView portraitUnit = Units().First(u => u.Owner == local && map.Banners.Banners.ContainsKey(u.Id) && !map.Banners.Banners[u.Id].Hidden);
            yield return Tap(map.ScreenPointOfBanner(portraitUnit.Id));
            Note("  portrait tap: " + Sel());
            yield return Shot("portrait-selected");
            yield return Tap(CentreOf("end-turn"));
            yield return WaitIdle();
            Note("  portrait end-turn tap: state turn " + map.Session.State.Turn);
            yield return Shot("portrait-after-end-turn");
            map.Text.SetLocale(Localizer.Bengali);
            for (int i = 0; i < 6; i++) yield return Frame();
            yield return Shot("portrait-bengali");
            map.Text.SetLocale(Localizer.English);
            yield return SetSize(1280, 720);
            map.Rig.Refit();
            yield return Shot("back-to-landscape");

            Note("== 19. replay agrees");
            GameState replay = GameApp.Content!.Boot.State;
            foreach (Command c in map.Session.AcceptedCommands) replay = CommandEngine.Apply(replay, c, GameApp.Content!.Boot.Services).State;
            Issue(StateHasher.HashHex(map.Session.State) == StateHasher.HashHex(replay), "headless replay of " + map.Session.AcceptedCommands.Count + " commands matches the live hash");
            Stats("whole session", 0);
            Assert.AreEqual(0, errors.Count, "console errors during the session: " + string.Join(" | ", errors));
        }

        private readonly struct StackMemberView
        {
            public StackMemberView(int id) => Id = id;

            public int Id { get; }
        }

        private IEnumerable<StackMemberView> StackViews(GridPos tile) => map.Banners.StackAt(tile).Select(m => new StackMemberView(m.Id));
    }
}
