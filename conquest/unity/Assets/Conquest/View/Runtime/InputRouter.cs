using Conquest.Presentation;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Conquest.UnityView
{
    /// <summary>What the player did this frame, device-independent. Screen positions use Unity's origin (bottom-left).</summary>
    public struct InputFrame
    {
        public bool HasPointer;
        public Vector2 Pointer;
        public bool Click;
        public Vector2 ClickPosition;
        public bool Additive;
        public bool SecondaryClick;
        public Vector2 DragDelta;
        public int ZoomSteps;
        public float PinchFactor;
        public Vector2 ZoomAnchor;
        public Vector2 KeyPan;
        public bool EndTurn;
        public bool Cancel;
        public bool NextUnit;
        public bool ToggleDebug;
        public bool ToggleLanguage;
        public bool Skip;
        public bool Touch;

        /// <summary>The last device used (see <see cref="PointerModeLatch"/>): true means touch wording, large targets and the touch HUD.</summary>
        public bool TouchMode;
    }

    /// <summary>
    /// Reads the Input System devices (mouse, keyboard, touchscreen) and turns them into one <see cref="InputFrame"/>:
    /// click, tap, drag-pan after a pixel threshold (6 for the mouse, 12 for a finger), wheel and pinch zoom, and the
    /// key bindings of the design (WASD or arrows pan, + and - zoom, E ends the turn, Esc cancels, Tab selects the
    /// next unit, F3 toggles the debug panel, L switches the language, Space skips animations).
    /// </summary>
    public sealed class InputRouter
    {
        public const float MouseDragPx = 6f;
        public const float TouchDragPx = 12f;
        public const float KeyPanPixelsPerSecond = 900f;

        private bool mouseDown;
        private Vector2 mouseStart;
        private bool mouseDragging;
        private int touchId = -1;
        private Vector2 touchStart;
        private bool touchDragging;
        private float lastPinchDistance;
        private PointerModeLatch? latch;
        private bool mouseUsed;
        private bool keyUsed;
        private Vector2? lastMousePos;

        public InputFrame Poll(float deltaSeconds)
        {
            var frame = new InputFrame { PinchFactor = 1f };
            mouseUsed = false;
            keyUsed = false;
            PollMouse(ref frame);
            PollTouch(ref frame);
            PollKeyboard(ref frame, deltaSeconds);
            frame.TouchMode = UpdateMode(frame.Touch);
            return frame;
        }

        private bool UpdateMode(bool touched)
        {
            bool hasMouse = Mouse.current != null;
            bool hasScreen = Touchscreen.current != null;
            PointerModeLatch current = latch ?? PointerModeLatch.Start(hasMouse, hasScreen);
            latch = current.Next(new PointerActivity(hasMouse, hasScreen, touched, mouseUsed || keyUsed));
            return latch.Value.IsTouch;
        }

        private void PollMouse(ref InputFrame frame)
        {
            Mouse? mouse = Mouse.current;
            if (mouse == null) return;
            Vector2 pos = mouse.position.ReadValue();
            frame.Pointer = pos;
            frame.HasPointer = touchId < 0;
            mouseUsed = mouse.delta.ReadValue() != Vector2.zero || (lastMousePos.HasValue && lastMousePos.Value != pos) || mouse.leftButton.wasPressedThisFrame || mouse.rightButton.wasPressedThisFrame || Mathf.Abs(mouse.scroll.ReadValue().y) > 0.01f;
            lastMousePos = pos;
            if (mouse.leftButton.wasPressedThisFrame)
            {
                mouseDown = true;
                mouseStart = pos;
                mouseDragging = false;
            }

            if (mouseDown && mouse.leftButton.isPressed)
            {
                if (!mouseDragging && (pos - mouseStart).magnitude > MouseDragPx) mouseDragging = true;
                if (mouseDragging) frame.DragDelta += mouse.delta.ReadValue();
            }

            if (mouseDown && mouse.leftButton.wasReleasedThisFrame)
            {
                if (!mouseDragging)
                {
                    frame.Click = true;
                    frame.ClickPosition = pos;
                }

                mouseDown = false;
                mouseDragging = false;
            }

            if (mouse.rightButton.wasPressedThisFrame)
            {
                frame.SecondaryClick = true;
                frame.ClickPosition = pos;
            }

            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f)
            {
                frame.ZoomSteps += scroll > 0 ? 1 : -1;
                frame.ZoomAnchor = pos;
            }
        }

        private void PollTouch(ref InputFrame frame)
        {
            Touchscreen? screen = Touchscreen.current;
            if (screen == null) return;
            int active = 0;
            Vector2 a = default;
            Vector2 b = default;
            foreach (var touch in screen.touches)
            {
                if (!touch.press.isPressed) continue;
                if (active == 0) a = touch.position.ReadValue();
                else if (active == 1) b = touch.position.ReadValue();
                active++;
            }

            frame.Touch = active > 0 || screen.primaryTouch.press.wasReleasedThisFrame;
            if (active >= 2)
            {
                float distance = (a - b).magnitude;
                if (lastPinchDistance > 1f) frame.PinchFactor = distance / lastPinchDistance;
                lastPinchDistance = distance;
                frame.ZoomAnchor = (a + b) / 2f;
                touchId = -1;
                return;
            }

            lastPinchDistance = 0f;
            var primary = screen.primaryTouch;
            if (primary.press.wasPressedThisFrame)
            {
                touchId = primary.touchId.ReadValue();
                touchStart = primary.position.ReadValue();
                touchDragging = false;
            }

            if (touchId >= 0 && primary.press.isPressed)
            {
                Vector2 pos = primary.position.ReadValue();
                if (!touchDragging && (pos - touchStart).magnitude > TouchDragPx) touchDragging = true;
                if (touchDragging) frame.DragDelta += primary.delta.ReadValue();
            }

            if (touchId >= 0 && primary.press.wasReleasedThisFrame)
            {
                if (!touchDragging)
                {
                    frame.Click = true;
                    frame.ClickPosition = primary.position.ReadValue();
                }

                touchId = -1;
                touchDragging = false;
            }
        }

        private void PollKeyboard(ref InputFrame frame, float dt)
        {
            Keyboard? k = Keyboard.current;
            if (k == null) return;
            keyUsed = k.anyKey.wasPressedThisFrame;
            frame.Additive = k.leftShiftKey.isPressed || k.rightShiftKey.isPressed;
            float x = (k.dKey.isPressed || k.rightArrowKey.isPressed ? 1f : 0f) - (k.aKey.isPressed || k.leftArrowKey.isPressed ? 1f : 0f);
            float y = (k.wKey.isPressed || k.upArrowKey.isPressed ? 1f : 0f) - (k.sKey.isPressed || k.downArrowKey.isPressed ? 1f : 0f);
            frame.KeyPan = new Vector2(x, y) * KeyPanPixelsPerSecond * dt;
            if (k.equalsKey.wasPressedThisFrame || k.numpadPlusKey.wasPressedThisFrame) frame.ZoomSteps += 1;
            if (k.minusKey.wasPressedThisFrame || k.numpadMinusKey.wasPressedThisFrame) frame.ZoomSteps -= 1;
            frame.EndTurn = k.eKey.wasPressedThisFrame;
            frame.Cancel = k.escapeKey.wasPressedThisFrame;
            frame.NextUnit = k.tabKey.wasPressedThisFrame || k.nKey.wasPressedThisFrame;
            frame.ToggleDebug = k.f3Key.wasPressedThisFrame || k.backquoteKey.wasPressedThisFrame;
            frame.ToggleLanguage = k.lKey.wasPressedThisFrame;
            frame.Skip = k.spaceKey.wasPressedThisFrame;
        }
    }
}
