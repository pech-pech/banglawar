using UnityEngine;
using UnityEngine.InputSystem;

namespace MixerMad.Game
{
    /// <summary>
    /// Touch + keyboard (+ mouse for the editor, + gamepad triggers) to a SimInput.
    /// Gas and brake zones are full-width columns of ~22% of the screen at each side (bottom 55% of the height),
    /// bigger than the pedal art. Multi-touch: gas and brake can be held together.
    /// Uses the new Input System only (set Active Input Handling to "Input System Package").
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class InputReader : MonoBehaviour, ISimInputSource
    {
        [Range(0.1f, 0.4f)] public float zoneWidth = 0.22f;
        [Range(0.2f, 1f)] public float zoneHeight = 0.55f;
        [Tooltip("Near-square screens (Fold unfolded) get bigger pedals, S5 section 6.")]
        public float nearSquareAspect = 1.45f;
        public float nearSquareZoneWidth = 0.26f;

        public float Gas { get; private set; }
        public float Brake { get; private set; }
        public bool GasHeld => Gas > 0.5f;
        public bool BrakeHeld => Brake > 0.5f;
        public bool AnyTouchedThisFrame { get; private set; }

        /// <summary>Gameplay input is blocked while a menu is open.</summary>
        public bool Blocked { get; set; }

        public float EffectiveZoneWidth => (float)Screen.width / Mathf.Max(1, Screen.height) < nearSquareAspect ? nearSquareZoneWidth : zoneWidth;

        /// <summary>Normalised screen rect (0..1) of the gas zone, honouring the pedal swap setting.</summary>
        public Rect GasZone => MMSettings.PedalsSwapped ? new Rect(0f, 0f, EffectiveZoneWidth, zoneHeight) : new Rect(1f - EffectiveZoneWidth, 0f, EffectiveZoneWidth, zoneHeight);
        public Rect BrakeZone => MMSettings.PedalsSwapped ? new Rect(1f - EffectiveZoneWidth, 0f, EffectiveZoneWidth, zoneHeight) : new Rect(0f, 0f, EffectiveZoneWidth, zoneHeight);

        void Update()
        {
            float gas = 0f, brake = 0f;
            AnyTouchedThisFrame = false;

            if (!Blocked)
            {
                float w = Screen.width, h = Screen.height;
                var gz = GasZone; var bz = BrakeZone;
                bool touchActive = false;

                var ts = Touchscreen.current;
                if (ts != null)
                {
                    var touches = ts.touches;
                    for (int i = 0; i < touches.Count; i++)
                    {
                        var t = touches[i];
                        if (!t.press.isPressed) continue;
                        touchActive = true;
                        Vector2 p = t.position.ReadValue();
                        Classify(p, w, h, gz, bz, ref gas, ref brake);
                    }
                }

                var mouse = Mouse.current;
                if (!touchActive && mouse != null && mouse.leftButton.isPressed)
                    Classify(mouse.position.ReadValue(), w, h, gz, bz, ref gas, ref brake);

                var kb = Keyboard.current;
                if (kb != null)
                {
                    if (kb.rightArrowKey.isPressed || kb.dKey.isPressed || kb.upArrowKey.isPressed || kb.wKey.isPressed) gas = 1f;
                    if (kb.leftArrowKey.isPressed || kb.aKey.isPressed || kb.downArrowKey.isPressed || kb.sKey.isPressed || kb.spaceKey.isPressed) brake = 1f;
                }

                var pad = Gamepad.current;
                if (pad != null)
                {
                    gas = Mathf.Max(gas, pad.rightTrigger.ReadValue());
                    brake = Mathf.Max(brake, pad.leftTrigger.ReadValue());
                    if (pad.buttonSouth.isPressed) gas = 1f;
                    if (pad.buttonWest.isPressed) brake = 1f;
                }
            }
            Gas = gas; Brake = brake;
        }

        static void Classify(Vector2 p, float w, float h, Rect gz, Rect bz, ref float gas, ref float brake)
        {
            float nx = p.x / w, ny = p.y / h;   // Input System: origin bottom-left
            if (gz.Contains(new Vector2(nx, ny))) gas = 1f;
            if (bz.Contains(new Vector2(nx, ny))) brake = 1f;
        }

        public SimInput Sample() => new SimInput { gas = Gas, brake = Brake };
    }
}
