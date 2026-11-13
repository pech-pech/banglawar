using System;
using System.IO;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// `-mmStills &lt;folder&gt;` (optional `-mmStillsQuality 0..3`, default High): drives the run with the gas held and
    /// saves four stills: start, mid-drive in snowfall, the first big jump, the finish. Then quits.
    /// Add `-mmStillsSet full` for the whole review set instead (see <see cref="StillsSetRunner"/>).
    /// Review tool only; it reads the sim like any view and never writes to it.
    /// </summary>
    public sealed class StillsRunner : MonoBehaviour, ISimInputSource
    {
        const float StartShotAt = 2.0f;        // s after the run starts (camera settled)
        const float JumpShotDelay = 0.0f;      // s after BigAir (fires mid-flight, once air time passes the big-air mark)
        const float FinishShotDelay = 1.6f;    // s after Finish: finish swoop under way
        const float GiveUpAfter = 240f;        // s of real time

        const float LogEvery = 5f;
        float _nextLog = LogEvery;
        string _dir;
        float _t, _jumpAt = -1f, _finishAt = -1f;
        bool _start, _mid, _jump, _finish, _quitting;
        int _pending, _failed;
        SimDriver _sim;

        public static bool Requested => ArgValue("-mmStills") != null;

        internal static string ArgValue(string name)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
            return null;
        }

        // Settings that reached the finish without a crash in the headless search (MixerMad.Editor.StillsBotSearch).
        // The first is the fastest; a stalled attempt restarts with the next one.
        internal static readonly StillsBot[] Bots =
        {
            new StillsBot(-0.60f, 0.35f, 1.0f, 13f),
            new StillsBot(-0.60f, 0.15f, 1.0f, 9f),
            new StillsBot(-0.35f, 0.15f, 1.0f, 6f),
        };
        const float StallSeconds = 6f, StallMetres = 1f;
        int _attempt; float _progressX, _progressT;
        StillsBot Bot => Bots[_attempt % Bots.Length];

        public SimInput Sample() => Bot.Drive(_sim != null ? _sim.Curr : null);

        void Start()
        {
            if (StillsSet.IsFull(Environment.GetCommandLineArgs()))
            {
                // `-mmStillsSet full`: the whole review set (times of day, weather, ice, crash, Calm, on/off pairs).
                gameObject.AddComponent<StillsSetRunner>();
                Destroy(this);
                return;
            }
            _dir = ArgValue("-mmStills");
            try { Directory.CreateDirectory(_dir); }
            catch (Exception e) { Debug.LogError("[MixerMad] stills: cannot create " + _dir + ": " + e.Message); Application.Quit(3); return; }
            int q = 2;
            var qs = ArgValue("-mmStillsQuality");
            if (qs != null && int.TryParse(qs, out var parsed)) q = Mathf.Clamp(parsed, 0, 3);
            if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)q);
            var input = FindAnyObjectByType<InputReader>(); if (input) input.enabled = false;
            var weather = FindAnyObjectByType<Weather>(); if (weather) weather.SetWeather(WeatherKind.Snow);
            _sim = SimDriver.Instance;
            if (_sim == null) { Debug.LogError("[MixerMad] stills: no SimDriver"); Application.Quit(3); return; }
            _sim.InputSource = this;
            _sim.SimEventRaised += OnEvent;
            _sim.Restart();
        }

        void OnDestroy() { if (_sim != null) _sim.SimEventRaised -= OnEvent; }

        void OnEvent(SimEvent e)
        {
            if (e.kind == SimEventKind.BigAir && _jumpAt < 0f) _jumpAt = _t + JumpShotDelay;
            if (e.kind == SimEventKind.Finish && _finishAt < 0f) _finishAt = _t + FinishShotDelay;
        }

        void Update()
        {
            _t += Time.unscaledDeltaTime;
            CheckStall();
            if (_t >= _nextLog)
            {
                _nextLog += LogEvery;
                var c = _sim.Curr;
                Debug.Log($"[MixerMad] stills t={_t:F0}s x={c.chassisPos.x:F1}/{(_sim.Backend != null ? _sim.Backend.FinishX : 0f):F0} v={c.speed:F1} ang={c.chassisAngle:F2} grounded={c.grounded} crashed={c.crashed} load={c.load01:F2}");
            }
            if (!_start && _t >= StartShotAt) _start = Shot("01_start");
            float finishX = _sim.Backend != null ? _sim.Backend.FinishX : 0f;
            if (!_mid && _start && finishX > 0f && _sim.Curr.chassisPos.x >= finishX * 0.5f) _mid = Shot("02_mid_drive_snow");
            if (!_jump && _jumpAt >= 0f && _t >= _jumpAt) _jump = Shot("03_jump");
            if (!_finish && _finishAt >= 0f && _t >= _finishAt) _finish = Shot("04_finish");
            bool done = _start && _mid && _jump && _finish;
            if ((done && _pending == 0) || _t > GiveUpAfter)
            {
                if (_quitting) return;
                _quitting = true;
                done &= _failed == 0;
                Debug.Log($"[MixerMad] stills done={done} start={_start} mid={_mid} jump={_jump} finish={_finish} t={_t:F1}s folder={_dir}");
                Application.Quit(done ? 0 : 4);
                enabled = false;
            }
        }

        /// <summary>A stuck or crashed truck restarts the run with the next speed cap, so some attempt reaches the finish.</summary>
        void CheckStall()
        {
            if (_finishAt >= 0f) return;
            float x = _sim.Curr.chassisPos.x;
            if (x > _progressX + StallMetres) { _progressX = x; _progressT = _t; return; }
            if (_t - _progressT < StallSeconds) return;
            _attempt++;
            Debug.Log($"[MixerMad] stills: stalled at x={x:F1}, attempt {_attempt + 1}: {Bot}");
            _sim.Restart();
            _progressX = float.NegativeInfinity; _progressT = _t;
        }

        bool Shot(string name)
        {
            string path = Path.Combine(_dir, name + ".png");
            Debug.Log($"[MixerMad] still {name} at t={_t:F1}s x={_sim.Curr.chassisPos.x:F1}: {path}");
            _pending++;
            StartCoroutine(StillCapture.Capture(path, ok => { if (!ok) _failed++; _pending--; }));
            return true;   // the shot is taken; a failed write is counted in _failed and fails the run
        }
    }
}
