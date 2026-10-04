namespace Conquest.Presentation
{
    /// <summary>Which kind of pointer the player is using right now (decides hint wording, hit-target size and the touch HUD).</summary>
    public enum PointerKind
    {
        Mouse = 0,
        Touch = 1,
    }

    /// <summary>What the input devices did in one frame.</summary>
    public readonly struct PointerActivity
    {
        public PointerActivity(bool hasMouse, bool hasTouchscreen, bool touched, bool mouseOrKeyboardUsed)
        {
            HasMouse = hasMouse;
            HasTouchscreen = hasTouchscreen;
            Touched = touched;
            MouseOrKeyboardUsed = mouseOrKeyboardUsed;
        }

        public bool HasMouse { get; }

        public bool HasTouchscreen { get; }

        /// <summary>A finger was down or lifted this frame.</summary>
        public bool Touched { get; }

        /// <summary>The mouse moved, clicked or scrolled, or a key was pressed this frame.</summary>
        public bool MouseOrKeyboardUsed { get; }
    }

    /// <summary>
    /// Remembers the LAST device used, so a machine with both a mouse and a touchscreen does not flicker between touch and
    /// mouse wording while a finger is up. Rules: no touchscreen means mouse; a touchscreen and no mouse (a phone) means touch,
    /// always; with both, a touch switches to touch and mouse or keyboard use switches back (touch wins if both happen in
    /// the same frame); a quiet frame changes nothing. The first frame starts as touch only when there is no mouse.
    /// </summary>
    public readonly struct PointerModeLatch
    {
        private PointerModeLatch(PointerKind current)
        {
            Current = current;
        }

        public PointerKind Current { get; }

        public bool IsTouch => Current == PointerKind.Touch;

        public static PointerModeLatch Start(bool hasMouse, bool hasTouchscreen) =>
            new PointerModeLatch(hasTouchscreen && !hasMouse ? PointerKind.Touch : PointerKind.Mouse);

        public PointerModeLatch Next(PointerActivity activity)
        {
            if (!activity.HasTouchscreen) return new PointerModeLatch(PointerKind.Mouse);
            if (!activity.HasMouse) return new PointerModeLatch(PointerKind.Touch);
            if (activity.Touched) return new PointerModeLatch(PointerKind.Touch);
            if (activity.MouseOrKeyboardUsed) return new PointerModeLatch(PointerKind.Mouse);
            return this;
        }
    }
}
