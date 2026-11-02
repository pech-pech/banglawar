using System;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Presentation-time slow-mo. Output is a single number (Scale) that SimDriver multiplies into the
    /// time it feeds the fixed-step accumulator. Step size, inputs and sim results never change.
    ///
    /// Rules (S3 6.3, user answers in section 7):
    ///  - big air:  0.5x for at most 1.2 s, cooldown 6 s
    ///  - crash:    0.3x for at most 1.0 s, then ease back over 0.4 s, cooldown 4 s
    ///  - total slow time capped at 12% of the run
    ///  - never in the first 3 s, never during finishes, off in Calm motion, off for bots/tests
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class SlowMo : MonoBehaviour
    {
        public enum Mode { None, Jump, Crash, EaseOut }

        [Header("Big air")]
        public float jumpScale = 0.5f;
        public float jumpMaxSeconds = 1.2f;
        public float jumpCooldown = 6f;
        public float jumpAirTimeTrigger = 0.8f;
        public float jumpHeightTrigger = 3f;
        [Header("Crash")]
        public float crashScale = 0.3f;
        public float crashMaxSeconds = 1.0f;
        public float crashCooldown = 4f;
        public float easeOutSeconds = 0.4f;
        [Header("Limits")]
        [Range(0f, 0.5f)] public float runCapFraction = 0.12f;
        public float noSlowMoFirstSeconds = 3f;
        public float easeInSeconds = 0.12f;

        public float Scale { get; private set; } = 1f;
        public Mode Current { get; private set; } = Mode.None;
        /// <summary>0 = normal speed, 1 = deepest slow-mo. Drives lens/particle extras.</summary>
        public float Intensity01 => Mathf.Clamp01((1f - Scale) / 0.7f);
        /// <summary>Audio pitch: dips to 0.85 at most, never 0.35, so sound stays understandable.</summary>
        public float AudioPitch => Mathf.Lerp(1f, 0.85f, Intensity01);
        public float SlowSecondsSpent => _spent;
        public float RunSeconds => _run;
        public float SlowFraction => _run > 0.01f ? _spent / _run : 0f;
        public bool Blocked { get; private set; }   // finish lock

        public event Action<Mode> ModeChanged;

        SimDriver _driver;
        float _run, _spent, _modeT, _cdJump, _cdCrash, _easeFrom = 1f;

        public static bool Allowed => !MMSettings.CalmMotion;

        public void Bind(SimDriver d)
        {
            if (_driver != null) _driver.SimEventRaised -= OnSimEvent;
            _driver = d;
            d.SimEventRaised += OnSimEvent;
            d.Restarted += ResetRun;
        }

        void OnDestroy()
        {
            if (_driver != null) { _driver.SimEventRaised -= OnSimEvent; _driver.Restarted -= ResetRun; }
        }

        public void ResetRun()
        {
            _run = _spent = _modeT = 0f; _cdJump = _cdCrash = 0f; Blocked = false;
            Scale = 1f; SetMode(Mode.None);
        }

        void OnSimEvent(SimEvent e) { HandleEvent(e); }

        internal void HandleEvent(SimEvent e)
        {
            switch (e.kind)
            {
                case SimEventKind.Respawn: ForceEnd(); break;   // never carry crash slow-mo into the new attempt
                case SimEventKind.BigAir: TryStart(Mode.Jump); break;
                case SimEventKind.Crash: TryStart(Mode.Crash); break;
                case SimEventKind.Finish: Blocked = true; ForceEnd(); break;
            }
        }

        bool CanStart(float planned)
        {
            if (!Allowed || Blocked || (_driver != null && _driver.slowMoOff)) return false;
            if (_run < noSlowMoFirstSeconds) return false;
            if (_spent + planned > runCapFraction * _run) return false;
            return true;
        }

        void TryStart(Mode m)
        {
            if (m == Mode.Jump)
            {
                if (_cdJump > 0f || Current == Mode.Crash || !CanStart(jumpMaxSeconds)) return;
                _cdJump = jumpCooldown + jumpMaxSeconds; SetMode(Mode.Jump);
            }
            else if (m == Mode.Crash)
            {
                if (_cdCrash > 0f || !CanStart(crashMaxSeconds)) return;   // a crash may replace a jump slow-mo
                _cdCrash = crashCooldown + crashMaxSeconds; SetMode(Mode.Crash);
            }
        }

        void ForceEnd()
        {
            if (Current == Mode.Jump || Current == Mode.Crash) { _easeFrom = Scale; SetMode(Mode.EaseOut); }
        }

        void SetMode(Mode m)
        {
            if (m == Current) return;
            Current = m; _modeT = 0f;
            ModeChanged?.Invoke(m);
        }

        /// <summary>Called once per frame by SimDriver with REAL delta time.</summary>
        public void Tick(float dt, SimDriver d)
        {
            if (!d.Paused && !Blocked) _run += dt;
            if (_cdJump > 0f) _cdJump -= dt;
            if (_cdCrash > 0f) _cdCrash -= dt;

            // Height trigger (the design says "airborne > 0.8 s or height > 3 m").
            var s = d.Curr;
            if (Current == Mode.None && !s.grounded && !s.crashed && d.Backend.RoadLine != null)
            {
                float h = s.chassisPos.y - SnowyPassData.HeightAt(d.Backend.RoadLine, s.chassisPos.x);
                if (h > jumpHeightTrigger) TryStart(Mode.Jump);
            }

            if (!Allowed || d.slowMoOff) { if (Current == Mode.Jump || Current == Mode.Crash) { _easeFrom = Scale; SetMode(Mode.EaseOut); } }

            float target = 1f;
            switch (Current)
            {
                case Mode.Jump:
                    target = jumpScale; _modeT += dt; _spent += dt;
                    if (_modeT >= jumpMaxSeconds || s.grounded && s.airTime <= 0f && _modeT > 0.25f || OverCap()) { _easeFrom = Scale; SetMode(Mode.EaseOut); }
                    break;
                case Mode.Crash:
                    target = crashScale; _modeT += dt; _spent += dt;
                    if (_modeT >= crashMaxSeconds || OverCap()) { _easeFrom = Scale; SetMode(Mode.EaseOut); }
                    break;
                case Mode.EaseOut:
                    _modeT += dt; _spent += dt * (1f - Scale) * 0.5f;
                    float k = easeOutSeconds <= 0f ? 1f : Mathf.Clamp01(_modeT / easeOutSeconds);
                    Scale = Mathf.Lerp(_easeFrom, 1f, MMMath.SmoothStep01(k));
                    if (k >= 1f) { Scale = 1f; SetMode(Mode.None); }
                    return;
            }
            // Ease in quickly so the drop is felt but not a hard cut.
            float rate = (1f - target) / Mathf.Max(0.01f, easeInSeconds);
            Scale = Mathf.MoveTowards(Scale, target, rate * dt);
        }

        bool OverCap() => _spent > runCapFraction * _run && _run > noSlowMoFirstSeconds;
    }
}
