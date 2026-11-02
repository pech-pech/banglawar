using System;
using System.Collections;
using System.Globalization;
using System.IO;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Review evidence for the FX (L-MM-33), never used in play:
    ///  - `-mmFxTime t01` sets the time of day once (dusk/night stills for the headlamps); `-mmCalm 0|1` forces Calm motion;
    ///  - with `-mmStills dir`: extra stills `05_fx_landing` just after the first big landing and `06_fx_finish` 0.3 s after the finish;
    ///  - with `-mmCrashRepro dir`: `fx.csv` (per frame: live particles, the OLDEST particle age, the longest tyre-track
    ///    segment, seconds since the last teleport) and `fx_respawn_N.png` two frames after the first teleports.
    ///    tools/fx_analyze.py checks that no particle or track outlives a teleport (no streak).
    /// </summary>
    [DefaultExecutionOrder(32001)]
    public sealed class FxProbe : MonoBehaviour
    {
        const int RespawnStills = 4, RespawnStillDelayFrames = 2;
        const float FinishStillDelay = 0.3f, LandingStillDelay = 0.12f, LandingMinImpact = 2.5f, LandingEarliest = 3f;

        public static bool Requested => Arg("-mmStills") != null || Arg("-mmCrashRepro") != null || Arg("-mmFxTime") != null || Arg("-mmCalm") != null;

        static string Arg(string name)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
            return null;
        }

        FxInstaller.Result _r; SimDriver _sim;
        string _stillsDir, _crashDir;
        StreamWriter _csv;
        readonly ParticleSystem.Particle[] _buf = new ParticleSystem.Particle[2048];
        float _t, _sinceTeleport = 999f, _landingAt = -1f, _finishAt = -1f;
        int _frame, _teleports, _stillAtFrame = -1;
        bool _landingShot, _finishShot;

        public void Bind(FxInstaller.Result r, SimDriver sim)
        {
            _r = r; _sim = sim;
            _stillsDir = Arg("-mmStills"); _crashDir = Arg("-mmCrashRepro");
            var calm = Arg("-mmCalm");                             // same switch as CrashRepro: review both modes without the saved settings
            if (calm == "0") MMSettings.CalmMotionOverride = false; else if (calm == "1") MMSettings.CalmMotionOverride = true;
            var ts = Arg("-mmFxTime");
            if (ts != null && float.TryParse(ts, NumberStyles.Float, CultureInfo.InvariantCulture, out var t01) && DayNight.Instance != null)
            {
                DayNight.Instance.autoAdvance = false;
                DayNight.Instance.SetTime(t01);
            }
            if (_sim != null) { _sim.Teleported += OnTeleported; _sim.SimEventRaised += OnEvent; }
            if (_crashDir != null)
            {
                try
                {
                    Directory.CreateDirectory(_crashDir);
                    _csv = new StreamWriter(Path.Combine(_crashDir, "fx.csv"));
                    _csv.WriteLine("frame,t,since_teleport,teleports,live,oldest_age,longest_track,track_segments,crashed");
                }
                catch (Exception e) { Debug.LogError("[MixerMad] fx probe: " + e.Message); }
            }
        }

        void OnDestroy()
        {
            if (_sim != null) { _sim.Teleported -= OnTeleported; _sim.SimEventRaised -= OnEvent; }
            _csv?.Dispose(); _csv = null;
        }

        void OnApplicationQuit() { _csv?.Flush(); }

        void OnTeleported()
        {
            _sinceTeleport = 0f; _teleports++;
            if (_crashDir != null && _teleports <= RespawnStills) _stillAtFrame = _frame + RespawnStillDelayFrames;
        }

        void OnEvent(SimEvent e)
        {
            if (e.kind == SimEventKind.Landing && e.magnitude >= LandingMinImpact && _t > LandingEarliest && _landingAt < 0f && _stillsDir != null)
                _landingAt = _t + LandingStillDelay;
            if (e.kind == SimEventKind.Finish && _finishAt < 0f && _stillsDir != null) _finishAt = _t + FinishStillDelay;
        }

        void LateUpdate()
        {
            float dt = Time.unscaledDeltaTime;
            _t += dt; _frame++;
            if (_sim != null) _sinceTeleport += _sim.PresentationDelta;
            if (!_landingShot && _landingAt >= 0f && _t >= _landingAt) { _landingShot = true; StartCoroutine(Capture(Path.Combine(_stillsDir, "05_fx_landing.png"))); }
            if (!_finishShot && _finishAt >= 0f && _t >= _finishAt) { _finishShot = true; Debug.Log($"[MixerMad] fx: live particles at the finish still {(_r.fx ? _r.fx.LiveParticles : 0)}"); StartCoroutine(Capture(Path.Combine(_stillsDir, "06_fx_finish.png"))); }
            if (_stillAtFrame >= 0 && _frame >= _stillAtFrame)
            {
                _stillAtFrame = -1;
                StartCoroutine(Capture(Path.Combine(_crashDir, $"fx_respawn_{_teleports}.png")));
            }
            if (_csv != null) Log();
        }

        void Log()
        {
            int live = 0; float oldest = 0f;
            foreach (var ps in GetComponentsInChildren<ParticleSystem>())
            {
                if (ps.name == "Chimney_Smoke") continue;   // static emitter far from the truck
                int n = ps.GetParticles(_buf);
                live += n;
                for (int i = 0; i < n; i++) oldest = Mathf.Max(oldest, _buf[i].startLifetime - _buf[i].remainingLifetime);
            }
            float longest = 0f; int segs = 0;
            if (_r.tracks != null) foreach (var b in _r.tracks.Buffers) { longest = Mathf.Max(longest, b.LongestSegment()); segs += b.Count; }
            var ic = CultureInfo.InvariantCulture;
            bool crashed = _sim != null && _sim.Curr.crashed;
            _csv.WriteLine($"{_frame},{_t.ToString("F4", ic)},{_sinceTeleport.ToString("F4", ic)},{_teleports},{live},{oldest.ToString("F4", ic)},{longest.ToString("F3", ic)},{segs},{(crashed ? 1 : 0)}");
        }

        IEnumerator Capture(string path)
        {
            yield return new WaitForEndOfFrame();
            int w = Screen.width, h = Screen.height;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            try
            {
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0, false);
                tex.Apply(false);
                PngWriter.Write(path, tex.GetPixels32(), w, h);
                Debug.Log("[MixerMad] fx still " + path);
            }
            catch (Exception e) { Debug.LogError("[MixerMad] fx still failed " + path + ": " + e.Message); }
            finally { Destroy(tex); }
        }
    }
}
