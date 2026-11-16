using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// `-mmStills &lt;folder&gt; -mmStillsSet full`: one run that captures every promised feature (L-MM-33/34).
    ///  Pass 1 (bot, day, snow): start, mid-drive, jump, frozen lake, finish. At mid-drive the sim is paused and the
    ///    same frame is shot at dawn, dusk and night, in a blizzard, and once per FeatureToggles flag on and off
    ///    (plus unchanged baseline shots, the noise floor; switch pairs are shot with the cosmetic clock frozen, see
    ///    <see cref="ReviewClock"/>, particle-budget pairs with it running). The planar pair is shot on the ice, DoF at
    ///    the finish, headlights and beacon at night, the landing puff just after a landing, the spray on a snowy drive.
    ///  Pass 2 (full gas): a frame inside the crash freeze.
    ///  Pass 3 (bot, Calm motion forced on): the jump and the finish.
    /// Writes stills.csv (one row per still: what was set when it was shot). Exit code 0 when every expected still
    /// was written, 4 otherwise. Review tool only: it drives the sim through the normal input source and Restart().
    /// </summary>
    public sealed class StillsSetRunner : MonoBehaviour, ISimInputSource
    {
        const float StartShotAt = 2.0f, FinishShotDelay = 1.6f, FinishPairsDelay = 4.0f, CrashShotDelay = 0.2f;
        const float PassLimit = 300f, CrashPassLimit = 60f;   // s of real time per pass (pass 1 includes the paused sessions)
        const float CameraSettle = 0.6f, FlagSettle = 0.6f, RampedFlagSettle = 13f;   // ramped: longer than the longest particle life (12 s)
        const float TimeOfDaySettle = 1.2f, BlizzardSettle = 4f, WeatherRestoreSettle = 3f;
        const float StallSeconds = 6f, StallMetres = 1f;
        const float IceShotFrom = 0.35f;   // fraction along the ice where the lake still is taken
        const float JumpAirTime = 0.45f;   // s in the air that counts as a jump when the bot never reaches big air
        const float LandingShotDelay = 0.15f;   // s after a landing: the puff has spread but not faded
        const int LandingMinPuff = 6, DriveMinSpray = 24;   // particles that make the puff / the spray clearly visible
        const float DriveMinSpeed = 9f;    // m/s: the spray is full at about 13.5 m/s; at the start it is a wisp
        const float FreezeSettle = 0.3f;   // s after freezing before the first still
        const float CameraStillMax = 6f, CameraStillMetres = 0.00002f, CameraStillDegrees = 0.0005f;
        const int CameraStillFrames = 20;  // frames in a row without camera movement that count as settled
        const float BeaconLitWait = 3f;    // s to wait for the blinking beacon to be lit before the night pairs freeze it

        string _dir;
        SimDriver _sim; DayNight _dayNight; Weather _weather; PlanarReflection _planar; TruckEmissives _emissives;
        StreamWriter _manifest;
        readonly HashSet<string> _written = new HashSet<string>();
        int _failed, _attempt;
        bool _fullGas;
        float _t, _passT, _bigAirAt, _finishAt, _crashAt, _landAt, _progressX, _progressT;

        StillsBot Bot => StillsRunner.Bots[_attempt % StillsRunner.Bots.Length];

        public SimInput Sample() => _fullGas ? new SimInput { gas = 1f } : Bot.Drive(_sim != null ? _sim.Curr : null);

        IEnumerator Start()
        {
            if (!Setup()) yield break;
            yield return MainPass();
            yield return CrashPass();
            yield return CalmPass();
            Finish();
        }

        bool Setup()
        {
            _dir = StillsRunner.ArgValue("-mmStills");
            try { Directory.CreateDirectory(_dir); _manifest = new StreamWriter(Path.Combine(_dir, "stills.csv")); }
            catch (Exception e) { Debug.LogError("[MixerMad] stills set: cannot write to " + _dir + ": " + e.Message); Application.Quit(3); return false; }
            _manifest.WriteLine("name,t,x,screen,preset,time01,weather,calm,particles,flags_off");
            int q = 2;
            var qs = StillsRunner.ArgValue("-mmStillsQuality");
            if (qs != null && int.TryParse(qs, out var parsed)) q = Mathf.Clamp(parsed, 0, 3);
            if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)q);
            var input = FindAnyObjectByType<InputReader>(); if (input) input.enabled = false;
            _sim = SimDriver.Instance;
            if (_sim == null) { Debug.LogError("[MixerMad] stills set: no SimDriver"); Application.Quit(3); return false; }
            _dayNight = DayNight.Instance ? DayNight.Instance : FindAnyObjectByType<DayNight>();
            if (_dayNight) { _dayNight.autoAdvance = false; _dayNight.time01 = StillsSet.Day; }
            _weather = Weather.Instance ? Weather.Instance : FindAnyObjectByType<Weather>();
            if (_weather) _weather.SetWeather(WeatherKind.Snow);
            _planar = FindAnyObjectByType<PlanarReflection>();
            _emissives = FindAnyObjectByType<TruckEmissives>();
            MMSettings.CalmMotionOverride = false;
            _sim.InputSource = this;
            _sim.SimEventRaised += OnEvent;
            Debug.Log($"[MixerMad] stills set: {Screen.width}x{Screen.height} preset {QualityPresets.Current.name}, flags {string.Join(" ", FeatureToggleFields.Names())}");
            return true;
        }

        void OnDestroy() { if (_sim != null) _sim.SimEventRaised -= OnEvent; _manifest?.Dispose(); ReviewClock.Freeze(false); }

        void OnEvent(SimEvent e)
        {
            if (e.kind == SimEventKind.BigAir && _bigAirAt < 0f) _bigAirAt = _t;
            if (e.kind == SimEventKind.Finish && _finishAt < 0f) _finishAt = _t;
            if (e.kind == SimEventKind.Crash && _crashAt < 0f) _crashAt = _t;
            if (e.kind == SimEventKind.Landing && _landAt < 0f) _landAt = _t;
        }

        void Update() { _t += Time.unscaledDeltaTime; _passT += Time.unscaledDeltaTime; }

        void BeginPass(bool fullGas)
        {
            _fullGas = fullGas; _attempt = 0; _passT = 0f;
            _bigAirAt = _finishAt = _crashAt = _landAt = -1f;
            _progressX = float.NegativeInfinity; _progressT = _t;
            _sim.Paused = false;
            _sim.Restart();
        }

        // ---- pass 1: the drive, with the paused sessions at mid-drive, on the ice and at the finish
        IEnumerator MainPass()
        {
            BeginPass(false);
            bool start = false, mid = false, jump = false, ice = false, finish = false, landing = false, drive = false;
            IceRange(out float iceX0, out float iceX1);
            bool hasIce = iceX1 > iceX0;
            if (!hasIce) Debug.LogWarning("[MixerMad] stills set: no ice range found, the frozen lake still is skipped");
            while (_passT < PassLimit && !(start && mid && jump && finish && landing && drive && (ice || !hasIce)))
            {
                CheckStall();
                float x = _sim.Curr.chassisPos.x, finishX = _sim.Backend != null ? _sim.Backend.FinishX : 0f;
                if (!start && _passT >= StartShotAt) { start = true; yield return Shot(StillsSet.Start); }
                if (!mid && start && finishX > 0f && x >= finishX * 0.5f) { mid = true; yield return MidSession(); }
                if (!jump && Jumping()) { jump = true; yield return Shot(StillsSet.Jump); }
                if (!landing && LandingShown()) { landing = true; yield return SpotSession(null, StillSpot.Landing); }
                if (!drive && start && SprayShown()) { drive = true; yield return SpotSession(null, StillSpot.Drive); }
                if (!ice && hasIce && x >= Mathf.Lerp(iceX0, iceX1, IceShotFrom) && x <= iceX1)
                { ice = true; yield return SpotSession(StillsSet.FrozenLake, StillSpot.Ice); }
                if (!finish && _finishAt >= 0f && _t >= _finishAt + FinishShotDelay) { finish = true; yield return FinishSession(); }
                if (finish) break;   // nothing after the finish can still be shot in this pass
                yield return null;
            }
        }

        /// <summary>Big air, or failing that any real jump (the bot does not always reach the big-air mark).</summary>
        bool Jumping() => _bigAirAt >= 0f || (!_sim.Curr.grounded && _sim.Curr.airTime >= JumpAirTime);

        /// <summary>Just after a landing whose puff is in view; a landing too soft for a puff waits for the next one.</summary>
        bool LandingShown()
        {
            if (_landAt < 0f || _t < _landAt + LandingShotDelay) return false;
            var puff = Emitter("LandingPuff");
            if (puff != null && puff.particleCount >= LandingMinPuff) return true;
            _landAt = -1f;
            return false;
        }

        /// <summary>Driving fast on snow with the wheel spray clearly in view.</summary>
        bool SprayShown()
        {
            var spray = Emitter("Spray");
            return spray != null && _sim.Curr.grounded && Mathf.Abs(_sim.Curr.speed) >= DriveMinSpeed && spray.particleCount >= DriveMinSpray;
        }

        readonly Dictionary<string, ParticleSystem> _emitters = new Dictionary<string, ParticleSystem>();

        /// <summary>The TruckFx particle system an emitter flag feeds (found by name once), or null.</summary>
        ParticleSystem Emitter(string flag)
        {
            string name = StillsSet.EmitterFor(flag);
            if (name == null) return null;
            if (_emitters.TryGetValue(name, out var ps) && ps) return ps;
            ps = FindObjectsByType<ParticleSystem>(FindObjectsInactive.Include, FindObjectsSortMode.None).FirstOrDefault(p => p.name == name);
            if (ps == null) Debug.LogWarning("[MixerMad] stills set: no particle system " + name + " for " + flag);
            _emitters[name] = ps;
            return ps;
        }

        /// <summary>The ice run the planar reflection uses; the level data when the component has none; never past the finish.</summary>
        void IceRange(out float x0, out float x1)
        {
            x0 = _planar != null ? _planar.iceX0 : 0f; x1 = _planar != null ? _planar.iceX1 : 0f;
            if (x1 <= x0) { x0 = SnowyPassData.IceX0; x1 = SnowyPassData.IceX1; }
            float finishX = _sim.Backend != null ? _sim.Backend.FinishX : 0f;
            if (finishX > 0f) x1 = Mathf.Min(x1, finishX - 1f);
        }

        IEnumerator MidSession()
        {
            _sim.Paused = true;
            yield return Wait(CameraSettle);
            yield return Shot(StillsSet.MidDrive);
            yield return Shot(StillsSet.BaselineLiveA);
            yield return Wait(FlagSettle);
            yield return Shot(StillsSet.BaselineLiveB);
            yield return Freeze(true);
            yield return Shot(StillsSet.BaselineA);
            yield return Wait(FlagSettle);
            yield return Shot(StillsSet.BaselineB);
            SetFrozen(false);
            yield return Pairs(StillSpot.Mid);
            yield return TimesOfDay();
            yield return BlizzardShot();
            Resume();
        }

        IEnumerator SpotSession(string still, StillSpot spot)
        {
            _sim.Paused = true;
            yield return Wait(CameraSettle);
            if (still != null) yield return Shot(still);
            yield return Pairs(spot);
            Resume();
        }

        IEnumerator FinishSession()
        {
            yield return Shot(StillsSet.Finish);
            yield return Wait(Mathf.Max(0f, _finishAt + FinishPairsDelay - _t));   // let the finish swoop settle first
            _sim.Paused = true;
            yield return Pairs(StillSpot.Finish);
            Resume();
        }

        /// <summary>One on/off pair per flag that shows at this spot; each flag goes back to its old value after.</summary>
        IEnumerator Pairs(StillSpot spot)
        {
            if (spot == StillSpot.Night) yield return WaitForBeaconLit();
            foreach (var f in FeatureToggleFields.All().Where(f => StillsSet.SpotFor(f.Name) == spot))
            {
                object old = f.GetValue(null);
                bool ramped = FeatureToggleFields.IsRamped(f);
                float settle = ramped ? RampedFlagSettle : FlagSettle;
                yield return Freeze(!ramped);   // a switch shows at once: freeze everything cosmetic so only the effect differs
                if (!FeatureToggleFields.IsOn(f)) { FeatureToggleFields.Set(f, true); FeatureToggles.Notify(); yield return Wait(settle); }
                yield return Shot(StillsSet.PairName(f.Name, true));
                FeatureToggleFields.Set(f, false); FeatureToggles.Notify();
                var emitter = Emitter(f.Name);
                if (emitter != null) emitter.Clear(true);   // what is already emitted would hang in the paused frame
                yield return Wait(settle);
                yield return Shot(StillsSet.PairName(f.Name, false));
                f.SetValue(null, old); FeatureToggles.Notify();
                yield return Wait(settle);
            }
            SetFrozen(false);
        }

        /// <summary>The beacon blinks; the night pairs freeze it while it is lit, so its glow is in the "on" still.</summary>
        IEnumerator WaitForBeaconLit()
        {
            if (_emissives == null) { Debug.LogWarning("[MixerMad] stills set: no TruckEmissives, beacon pair shot as it is"); yield break; }
            float until = _t + BeaconLitWait;
            while (!_emissives.BeaconLit && _t < until) yield return null;
            if (!_emissives.BeaconLit) Debug.LogWarning("[MixerMad] stills set: beacon never lit within " + BeaconLitWait + " s");
        }

        readonly List<ParticleSystem> _frozen = new List<ParticleSystem>();

        /// <summary>Freezes (or restarts) the cosmetic clock and every playing particle system, so two stills of a paused frame match.</summary>
        /// <summary>Freezes or restarts; on freezing, waits a few frames: the frame in flight when the clock stops still moves.</summary>
        IEnumerator Freeze(bool frozen)
        {
            bool changed = frozen != ReviewClock.Frozen;
            SetFrozen(frozen);
            if (!frozen || !changed) yield break;
            yield return Wait(FreezeSettle);
            yield return WaitCameraStill();
        }

        /// <summary>
        /// The camera keeps easing for a while after the sim pauses (it runs on real time); a sub-pixel drift between two
        /// stills shows as a changed outline on everything. Waits until it has not moved for a run of frames.
        /// </summary>
        IEnumerator WaitCameraStill()
        {
            var cam = Camera.main;
            if (cam == null) yield break;
            float until = _t + CameraStillMax;
            int still = 0;
            Vector3 pos = cam.transform.position; Quaternion rot = cam.transform.rotation; float fov = cam.fieldOfView;
            while (still < CameraStillFrames && _t < until)
            {
                yield return null;
                var tr = cam.transform;
                bool moved = (tr.position - pos).sqrMagnitude > CameraStillMetres * CameraStillMetres
                             || Quaternion.Angle(tr.rotation, rot) > CameraStillDegrees || Mathf.Abs(cam.fieldOfView - fov) > CameraStillDegrees;
                still = moved ? 0 : still + 1;
                pos = tr.position; rot = tr.rotation; fov = cam.fieldOfView;
            }
            if (still < CameraStillFrames) Debug.LogWarning("[MixerMad] stills set: camera still moving after " + CameraStillMax + " s");
        }

        void SetFrozen(bool frozen)
        {
            ReviewClock.Freeze(frozen);
            SetParticlesFrozen(frozen);
        }

        void SetParticlesFrozen(bool frozen)
        {
            if (frozen && _frozen.Count == 0)
            {
                foreach (var ps in FindObjectsByType<ParticleSystem>(FindObjectsSortMode.None))
                    if (ps.isPlaying) { ps.Pause(false); _frozen.Add(ps); }
            }
            else if (!frozen)
            {
                foreach (var ps in _frozen) if (ps) ps.Play(false);
                _frozen.Clear();
            }
        }

        IEnumerator TimesOfDay()
        {
            if (_dayNight == null) { Debug.LogWarning("[MixerMad] stills set: no DayNight, times of day skipped"); yield break; }
            var shots = new[] { (StillsSet.DawnStill, StillsSet.Dawn), (StillsSet.DuskStill, StillsSet.Dusk), (StillsSet.NightStill, StillsSet.Night) };
            foreach (var (name, time01) in shots)
            {
                _dayNight.time01 = time01;
                yield return Wait(TimeOfDaySettle);
                yield return Shot(name);
                if (name == StillsSet.NightStill) yield return Pairs(StillSpot.Night);   // the lamps only light after dark
            }
            _dayNight.time01 = StillsSet.Day;
            yield return Wait(TimeOfDaySettle);
        }

        IEnumerator BlizzardShot()
        {
            if (_weather == null) { Debug.LogWarning("[MixerMad] stills set: no Weather, blizzard skipped"); yield break; }
            _weather.SetWeather(WeatherKind.Blizzard);
            yield return Wait(BlizzardSettle);
            yield return Shot(StillsSet.Blizzard);
            _weather.SetWeather(WeatherKind.Snow);
            yield return Wait(WeatherRestoreSettle);
        }

        // ---- pass 2: full gas until the first crash, shot inside the crash freeze
        IEnumerator CrashPass()
        {
            BeginPass(true);
            while (_passT < CrashPassLimit)
            {
                if (_crashAt >= 0f && _t >= _crashAt + CrashShotDelay)
                {
                    if (!_sim.Curr.crashed) Debug.LogWarning("[MixerMad] stills set: crash still taken after the freeze ended");
                    yield return Shot(StillsSet.Crash);
                    yield break;
                }
                yield return null;
            }
            Debug.LogWarning("[MixerMad] stills set: no crash within " + CrashPassLimit + " s");
        }

        // ---- pass 3: Calm motion on (no shake, swoops or slow-mo): the jump and the finish
        IEnumerator CalmPass()
        {
            MMSettings.CalmMotionOverride = true;
            BeginPass(false);
            bool jump = false, finish = false;
            while (_passT < PassLimit && !(jump && finish))
            {
                CheckStall();
                if (!jump && Jumping()) { jump = true; yield return Shot(StillsSet.CalmJump); }
                if (!finish && _finishAt >= 0f && _t >= _finishAt + FinishShotDelay) { finish = true; yield return Shot(StillsSet.CalmFinish); }
                yield return null;
            }
            MMSettings.CalmMotionOverride = false;
        }

        /// <summary>A stuck or crashed truck restarts the pass with the next bot (stills already taken stay).</summary>
        void CheckStall()
        {
            if (_finishAt >= 0f || _sim.Paused) { _progressT = _t; return; }
            float x = _sim.Curr.chassisPos.x;
            if (x > _progressX + StallMetres) { _progressX = x; _progressT = _t; return; }
            if (_t - _progressT < StallSeconds) return;
            _attempt++;
            Debug.Log($"[MixerMad] stills set: stalled at x={x:F1}, attempt {_attempt + 1}: {Bot}");
            _bigAirAt = -1f;
            _sim.Restart();
            _progressX = float.NegativeInfinity; _progressT = _t;
        }

        /// <summary>Unpauses the sim; the time spent paused does not count as a stall.</summary>
        void Resume() { SetFrozen(false); _sim.Paused = false; _progressT = _t; }

        IEnumerator Wait(float seconds)
        {
            float until = _t + seconds;
            while (_t < until) yield return null;
        }

        IEnumerator Shot(string name)
        {
            string path = Path.Combine(_dir, name + ".png");
            Debug.Log($"[MixerMad] still {name} at t={_t:F1}s x={_sim.Curr.chassisPos.x:F1}: {path}");
            bool ok = false;
            yield return StillCapture.Capture(path, r => ok = r);
            if (!ok) { _failed++; yield break; }
            _written.Add(name);
            var ic = CultureInfo.InvariantCulture;
            var off = FeatureToggleFields.All().Where(f => !FeatureToggleFields.IsOn(f)).Select(f => f.Name);
            _manifest.WriteLine(string.Join(",", name, _t.ToString("F1", ic), _sim.Curr.chassisPos.x.ToString("F1", ic),
                $"{Screen.width}x{Screen.height}", QualityPresets.Current.name,
                _dayNight ? _dayNight.time01.ToString("F2", ic) : "", _weather ? _weather.kind.ToString() : "",
                MMSettings.CalmMotion ? "1" : "0", ReviewClock.Frozen ? "frozen" : "live", string.Join(" ", off)));
            _manifest.Flush();
        }

        void Finish()
        {
            var expected = StillsSet.ExpectedFiles(FeatureToggleFields.Names());
            var missing = expected.Where(n => !_written.Contains(n)).ToList();
            bool ok = missing.Count == 0 && _failed == 0;
            Debug.Log($"[MixerMad] stills set done={ok} written={_written.Count}/{expected.Count} failed={_failed} t={_t:F1}s folder={_dir}"
                      + (missing.Count > 0 ? " missing: " + string.Join(" ", missing) : ""));
            _manifest?.Dispose(); _manifest = null;
            ReviewClock.Freeze(false);
            Application.Quit(ok ? 0 : 4);
        }
    }
}
