using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Unity.Cinemachine;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// `-mmCrashRepro &lt;folder&gt;`: plays scripted runs that crash the mixer and restart it in every awkward moment,
    /// and logs one CSV row per frame (sim state, slow-mo, truck rig, camera, driver, HUD, input) plus an event log.
    /// Scenarios: natural crashes (two crash bots), R during the crash freeze, R mid-air, R during big-air slow-mo,
    /// R after the finish. Review tooling only: it drives the sim through the normal input source and Restart().
    /// </summary>
    [DefaultExecutionOrder(32000)]   // log after the Cinemachine brain has placed the camera for this frame
    public sealed class CrashRepro : MonoBehaviour, ISimInputSource
    {
        enum Scenario { CrashGas, CrashFlip, RestartInFreeze, RestartMidAir, RestartInSlowMo, RestartAfterFinish, Done }

        const int TargetFps = 60;
        const float ScenarioSeconds = 70f;
        const int CrashesPerCrashScenario = 6;
        const int RestartsPerScenario = 3;

        static readonly StillsBot Careful = new StillsBot(-0.60f, 0.35f, 1.0f, 13f);

        string _dir;
        StreamWriter _frames, _events;
        SimDriver _sim; TruckView _truck; DriverView _driver; Hud _hud; CameraRig _rig; Camera _cam;
        Scenario _sc = Scenario.CrashGas;
        float _t, _scT, _pendingRestartAt = -1f;
        int _crashes, _restarts, _frame;
        bool _armed = true;
        SimInput _lastInput;
        string _note = "";

        public static bool Requested => ArgValue("-mmCrashRepro") != null;
        static string ArgValue(string name)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
            return null;
        }

        void Start()
        {
            _dir = ArgValue("-mmCrashRepro");
            var calm = ArgValue("-mmCalm");                        // review both modes without touching the saved settings
            if (calm == "0") MMSettings.CalmMotionOverride = false; else if (calm == "1") MMSettings.CalmMotionOverride = true;
            try { Directory.CreateDirectory(_dir); }
            catch (Exception e) { Debug.LogError("[MixerMad] crash repro: " + e.Message); Application.Quit(3); return; }
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = TargetFps;   // the player's real case, not the uncapped benchmark
            _sim = SimDriver.Instance;
            _truck = FindAnyObjectByType<TruckView>();
            _driver = FindAnyObjectByType<DriverView>();
            _hud = FindAnyObjectByType<Hud>();
            _rig = FindAnyObjectByType<CameraRig>();
            _cam = _rig != null ? _rig.cam : Camera.main;
            var input = FindAnyObjectByType<InputReader>(); if (input) input.enabled = false;
            _sim.InputSource = this;
            _sim.SimEventRaised += OnEvent;
            _sim.Teleported += () => Log("teleported", "");
            _frames = new StreamWriter(Path.Combine(_dir, "frames.csv"));
            _events = new StreamWriter(Path.Combine(_dir, "events.csv"));
            _frames.WriteLine("frame,t,scenario,simTime,simState,slowScale,slowMode,simX,simY,simAng,rootX,rootY,rootAng,bodyY,visScaleX,visScaleY,susp0,susp1,spin0,camX,camY,camZ,liveCam,blending,emotion,toast,finish,inGas,inBrake,note");
            _events.WriteLine("frame,t,scenario,event,detail,simX,simY,simAng");
            BeginScenario(Scenario.CrashGas);
        }

        void OnDestroy() { if (_sim != null) _sim.SimEventRaised -= OnEvent; _frames?.Dispose(); _events?.Dispose(); }

        void BeginScenario(Scenario s)
        {
            _sc = s; _scT = 0f; _crashes = 0; _restarts = 0; _armed = true; _pendingRestartAt = -1f;
            Log("scenario", s.ToString());
            if (s == Scenario.Done) { Finish(); return; }
            Restart("scenario start");
        }

        void Restart(string why) { _note = "R:" + why; Log("restart", why); _sim.Restart(); }

        public SimInput Sample()
        {
            var c = _sim.Curr;
            switch (_sc)
            {
                case Scenario.CrashGas:
                case Scenario.RestartInFreeze: _lastInput = new SimInput { gas = 1f }; break;                     // full gas everywhere (crashes)
                case Scenario.CrashFlip: _lastInput = c.grounded ? new SimInput { gas = 1f } : new SimInput { brake = 1f }; break;  // brake in the air = nose down = front flips
                default: _lastInput = Careful.Drive(c); break;
            }
            return _lastInput;
        }

        void OnEvent(SimEvent e)
        {
            Log(e.kind.ToString(), e.magnitude.ToString("F2", CultureInfo.InvariantCulture));
            float wait = 0f;
            switch (_sc)
            {
                case Scenario.CrashGas:
                case Scenario.CrashFlip:
                    if (e.kind == SimEventKind.Crash) _crashes++;
                    if (e.kind == SimEventKind.Finish) _pendingRestartAt = _t + 1.0f;
                    return;
                case Scenario.RestartInFreeze: if (e.kind == SimEventKind.Crash) wait = 0.35f; else return; break;
                case Scenario.RestartMidAir: if (e.kind == SimEventKind.Takeoff) wait = 0.15f; else return; break;
                case Scenario.RestartInSlowMo: if (e.kind == SimEventKind.BigAir) wait = 0.20f; else return; break;
                case Scenario.RestartAfterFinish: if (e.kind == SimEventKind.Finish) wait = 1.5f; else return; break;
            }
            if (_armed && _pendingRestartAt < 0f) _pendingRestartAt = _t + wait;
        }

        void Update()
        {
            if (_sc == Scenario.Done || _sim == null) return;
            float dt = Time.unscaledDeltaTime;
            _t += dt; _scT += dt;
            if (_pendingRestartAt >= 0f && _t >= _pendingRestartAt)
            {
                _pendingRestartAt = -1f; _restarts++;
                Restart(_sc.ToString());
            }
            bool crashDone = (_sc == Scenario.CrashGas || _sc == Scenario.CrashFlip) && _crashes >= CrashesPerCrashScenario;
            bool restartsDone = _sc >= Scenario.RestartInFreeze && _restarts >= RestartsPerScenario;
            if (crashDone || restartsDone || _scT > ScenarioSeconds) BeginScenario(_sc + 1);
        }

        void LateUpdate()
        {
            if (_frames == null || _sc == Scenario.Done) return;
            _frame++;
            var c = _sim.Curr; var slow = _sim.slowMo;
            var tr = _truck != null ? _truck.transform : null;
            var cam = _cam != null ? _cam.transform.position : Vector3.zero;
            string live = "", blend = "0";
            if (_rig != null && _rig.brain != null)
            {
                var a = _rig.brain.ActiveVirtualCamera as CinemachineCamera; live = a != null ? a.name : "";
                blend = _rig.brain.IsBlending ? "1" : "0";
            }
            float s0 = 0f, s1 = 0f, spin0 = 0f;
            if (_truck != null && _truck.wheels.Count > 1)
            {
                s0 = _truck.wheels[0].susp ? _truck.wheels[0].susp.localPosition.y : 0f;
                s1 = _truck.wheels[1].susp ? _truck.wheels[1].susp.localPosition.y : 0f;
                spin0 = _truck.wheels[0].spinDeg;
            }
            var ic = CultureInfo.InvariantCulture;
            var sb = new StringBuilder();
            sb.Append(_frame).Append(',').Append(_t.ToString("F4", ic)).Append(',').Append(_sc).Append(',')
              .Append(c.time.ToString("F4", ic)).Append(',').Append(c.crashed ? "crashed" : c.finished ? "finished" : "drive").Append(',')
              .Append(slow ? slow.Scale.ToString("F3", ic) : "1").Append(',').Append(slow ? slow.Current.ToString() : "").Append(',')
              .Append(c.chassisPos.x.ToString("F3", ic)).Append(',').Append(c.chassisPos.y.ToString("F3", ic)).Append(',').Append(c.chassisAngle.ToString("F3", ic)).Append(',')
              .Append(tr ? tr.position.x.ToString("F3", ic) : "").Append(',').Append(tr ? tr.position.y.ToString("F3", ic) : "").Append(',').Append(tr ? tr.eulerAngles.z.ToString("F2", ic) : "").Append(',')
              .Append(_truck && _truck.body ? _truck.body.localPosition.y.ToString("F3", ic) : "").Append(',')
              .Append(_truck && _truck.visual ? _truck.visual.localScale.x.ToString("F3", ic) : "").Append(',').Append(_truck && _truck.visual ? _truck.visual.localScale.y.ToString("F3", ic) : "").Append(',')
              .Append(s0.ToString("F3", ic)).Append(',').Append(s1.ToString("F3", ic)).Append(',').Append(spin0.ToString("F1", ic)).Append(',')
              .Append(cam.x.ToString("F3", ic)).Append(',').Append(cam.y.ToString("F3", ic)).Append(',').Append(cam.z.ToString("F3", ic)).Append(',')
              .Append(live).Append(',').Append(blend).Append(',').Append(_driver ? _driver.Current.ToString() : "").Append(',')
              .Append(_hud ? _hud.ToastText.Replace(",", ";") : "").Append(',').Append(_hud && _hud.FinishShown ? "1" : "0").Append(',')
              .Append(_lastInput.gas.ToString("F1", ic)).Append(',').Append(_lastInput.brake.ToString("F1", ic)).Append(',').Append(_note);
            _frames.WriteLine(sb.ToString());
            _note = "";
        }

        void Log(string ev, string detail)
        {
            if (_events == null) return;
            var c = _sim.Curr; var ic = CultureInfo.InvariantCulture;
            _events.WriteLine($"{_frame},{_t.ToString("F4", ic)},{_sc},{ev},{detail},{c.chassisPos.x.ToString("F3", ic)},{c.chassisPos.y.ToString("F3", ic)},{c.chassisAngle.ToString("F3", ic)}");
        }

        void Finish()
        {
            _frames?.Flush(); _events?.Flush();
            _frames?.Dispose(); _events?.Dispose(); _frames = null; _events = null;
            Debug.Log("[MixerMad] crash repro written to " + _dir);
            Application.Quit(0);
        }
    }
}
