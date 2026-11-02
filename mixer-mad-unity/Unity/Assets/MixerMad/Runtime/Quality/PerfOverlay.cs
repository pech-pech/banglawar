using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MixerMad.Game
{
    /// <summary>
    /// F1 = overlay (frame ms, 1% low, GPU ms, sim ms per step, slow-mo state) and per-feature toggles
    /// (what does each thing cost). F2 = start/stop CSV logging to persistentDataPath.
    /// Answers the tech director's question with numbers; nothing here touches the sim.
    /// For GPU/CPU frame times enable Player Settings > "Frame Timing Stats" (the build script does).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class PerfOverlay : MonoBehaviour
    {
        public bool visible;
        public bool logging;

        const int Ring = 600;
        readonly float[] _ft = new float[Ring];
        int _i, _count;
        float _avgMs, _low1Fps, _minFps = 999f;
        float _gpuMs, _cpuMs, _tick;
        readonly FrameTiming[] _timing = new FrameTiming[1];
        readonly float[] _scratch = new float[Ring];
        StreamWriter _csv;
        float _logT;
        GUIStyle _style, _btn;

        public float AvgMs => _avgMs;
        public float Low1PercentFps => _low1Fps;
        public float GpuMs => _gpuMs;
        public float CpuMs => _cpuMs;

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            _ft[_i] = dt; _i = (_i + 1) % Ring; _count = Mathf.Min(_count + 1, Ring);

            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.f1Key.wasPressedThisFrame) visible = !visible;
                if (kb.f2Key.wasPressedThisFrame) ToggleLog();
            }

            _tick += dt;
            if (_tick >= 0.5f)
            {
                _tick = 0f;
                Recompute();
                FrameTimingManager.CaptureFrameTimings();
                if (FrameTimingManager.GetLatestTimings(1, _timing) > 0)
                {
                    _gpuMs = (float)_timing[0].gpuFrameTime;
                    _cpuMs = (float)_timing[0].cpuFrameTime;
                }
            }

            if (logging && _csv != null)
            {
                _logT += dt;
                if (_logT >= 1f) { _logT = 0f; WriteRow(); }
            }
        }

        void Recompute()
        {
            if (_count == 0) return;
            float sum = 0f;
            for (int k = 0; k < _count; k++) { _scratch[k] = _ft[k]; sum += _ft[k]; }
            _avgMs = sum / _count * 1000f;
            Array.Sort(_scratch, 0, _count);
            // 1% low = fps of the slowest 1% of frames
            int n = Mathf.Max(1, _count / 100);
            float worst = 0f;
            for (int k = 0; k < n; k++) worst += _scratch[_count - 1 - k];
            worst /= n;
            _low1Fps = worst > 0f ? 1f / worst : 0f;
            _minFps = 1f / Mathf.Max(0.0001f, _scratch[_count - 1]);
        }

        public void ToggleLog()
        {
            logging = !logging;
            if (logging)
            {
                string path = Path.Combine(Application.persistentDataPath, $"perf-{QualityPresets.Current.name}-{DateTime.Now:yyyyMMdd-HHmmss}.csv");
                _csv = new StreamWriter(path, false, Encoding.UTF8);
                _csv.WriteLine("t,preset,res,avg_ms,fps,low1_fps,gpu_ms,cpu_ms,sim_ms_per_step,sim_steps_frame,slowmo_scale,slowmo_pct_run,mem_mb");
                Debug.Log("[MixerMad] perf log: " + path);
            }
            else { _csv?.Dispose(); _csv = null; }
        }

        void WriteRow()
        {
            var sd = SimDriver.Instance;
            _csv.WriteLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                "{0:F1},{1},{2}x{3},{4:F2},{5:F1},{6:F1},{7:F2},{8:F2},{9:F3},{10},{11:F2},{12:F3},{13:F0}",
                Time.realtimeSinceStartup, QualityPresets.Current.name, Screen.width, Screen.height, _avgMs, 1000f / Mathf.Max(0.01f, _avgMs),
                _low1Fps, _gpuMs, _cpuMs, sd ? sd.AvgSimMsPerStep : 0, sd ? sd.StepsLastFrame : 0,
                sd && sd.slowMo ? sd.slowMo.Scale : 1f, sd && sd.slowMo ? sd.slowMo.SlowFraction : 0f,
                GC.GetTotalMemory(false) / 1048576f));
            _csv.Flush();
        }

        void OnDestroy() { _csv?.Dispose(); }

        void OnGUI()
        {
            if (!visible) return;
            if (_style == null)
            {
                _style = new GUIStyle(GUI.skin.label) { fontSize = 16, normal = { textColor = Color.white } };
                _btn = new GUIStyle(GUI.skin.button) { fontSize = 15 };
            }
            var sd = SimDriver.Instance;
            var p = QualityPresets.Current;
            float s = Mathf.Max(1f, Screen.height / 800f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(s, s, 1f));
            GUILayout.BeginArea(new Rect(8, 8, 420, 640), GUI.skin.box);
            GUILayout.Label($"<b>{p.name}</b>  {Screen.width}x{Screen.height}  scale {p.renderScale:0.00}  target {p.targetFps} fps", _style);
            GUILayout.Label($"frame {_avgMs:0.0} ms  ({1000f / Mathf.Max(0.01f, _avgMs):0} fps)   1% low {_low1Fps:0} fps   worst {_minFps:0}", _style);
            GUILayout.Label($"GPU {_gpuMs:0.0} ms   CPU {_cpuMs:0.0} ms   (needs Frame Timing Stats)", _style);
            if (sd != null)
            {
                GUILayout.Label($"sim {sd.AvgSimMsPerStep:0.000} ms/step   steps/frame {sd.StepsLastFrame}   total {sd.TotalSteps}", _style);
                if (sd.slowMo) GUILayout.Label($"slow-mo {sd.slowMo.Current}  x{sd.slowMo.Scale:0.00}   {sd.slowMo.SlowFraction * 100f:0.0}% of run (cap 12%)", _style);
                GUILayout.Label($"car x {sd.Render.chassisPos.x:0.0} m   speed {sd.Render.speed:0.0} m/s   air {sd.Render.airTime:0.00}s", _style);
            }
            var dn = DayNight.Instance; var w = Weather.Instance;
            if (dn) GUILayout.Label($"time {dn.time01:0.00} {dn.Phase}   weather {(w ? w.kind.ToString() : "-")}   wet {(w ? w.Wetness : 0):0.00}", _style);

            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            for (int i = 0; i < 4; i++)
                if (GUILayout.Button(QualityPresets.Table[i].name, _btn)) { if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)i); }
            GUILayout.EndHorizontal();

            bool ch = false;
            ch |= Toggle("Shadows", ref FeatureToggles.Shadows);
            ch |= Toggle("Bloom / post", ref FeatureToggles.Bloom);
            ch |= Toggle("Finish DoF", ref FeatureToggles.Dof);
            ch |= Toggle("Planar reflection", ref FeatureToggles.Planar);
            ch |= Toggle("Outline (navy hull)", ref FeatureToggles.Outline);
            ch |= Toggle("All post-processing", ref FeatureToggles.PostProcess);
            bool wp = FeatureToggles.WeatherParticles > 0.5f; if (Toggle("Snow particles", ref wp)) { FeatureToggles.WeatherParticles = wp ? 1f : 0f; ch = true; }
            bool fs = FeatureToggles.FogSheets > 0.5f; if (Toggle("Mist sheets", ref fs)) { FeatureToggles.FogSheets = fs ? 1f : 0f; ch = true; }
            if (ch) FeatureToggles.Notify();

            GUILayout.Space(6);
            GUILayout.Label(logging ? "F2: logging to CSV (press to stop)" : "F2: start CSV log   F1: hide", _style);
            GUILayout.EndArea();
        }

        bool Toggle(string label, ref bool v)
        {
            bool n = GUILayout.Toggle(v, " " + label, _style);
            bool changed = n != v; v = n; return changed;
        }
    }

    /// <summary>
    /// Headless-friendly benchmark: `-mmBenchmark 40` plays a scripted bot (gas held) for 40 s on each preset
    /// Low..Ultra, writes benchmark-summary.csv into persistentDataPath and quits. Slow-mo stays ON (that is the real case).
    /// </summary>
    public sealed class BenchmarkRunner : MonoBehaviour, ISimInputSource
    {
        public float secondsPerPreset = 40f;
        public float warmup = 4f;
        int _preset = -1; float _t; readonly List<float> _frames = new List<float>(4096);
        readonly StringBuilder _out = new StringBuilder("preset,res,frames,avg_ms,fps,low1_fps,p99_ms,gpu_ms,cpu_ms,sim_ms_step\n");
        PerfOverlay _perf;
        public static bool Requested
        {
            get { foreach (var a in Environment.GetCommandLineArgs()) if (a == "-mmBenchmark") return true; return false; }
        }

        public SimInput Sample() => new SimInput { gas = 1f, brake = 0f };

        void Start()
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-mmBenchmark" && float.TryParse(args[i + 1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var s)) secondsPerPreset = s;
            _perf = FindAnyObjectByType<PerfOverlay>();
            var input = FindAnyObjectByType<InputReader>(); if (input) input.enabled = false;
            if (SimDriver.Instance) SimDriver.Instance.InputSource = this;
            Next();
        }

        void Next()
        {
            _preset++;
            if (_preset > 3) { Finish(); return; }
            QualityPresets.Instance.SetLevel((QualityLevel)_preset);
            Application.targetFrameRate = -1;      // uncapped so the numbers show headroom, not the cap
            if (SimDriver.Instance) SimDriver.Instance.Restart();
            _t = 0f; _frames.Clear();
        }

        void Update()
        {
            _t += Time.unscaledDeltaTime;
            if (_t > Mathf.Min(warmup, secondsPerPreset * 0.25f)) _frames.Add(Time.unscaledDeltaTime);
            if (SimDriver.Instance && SimDriver.Instance.Curr.finished) SimDriver.Instance.Restart();
            if (_t >= secondsPerPreset && _frames.Count > 0)
            {
                _frames.Sort();
                float sum = 0f; foreach (var f in _frames) sum += f;
                float avg = sum / Mathf.Max(1, _frames.Count);
                int n = Mathf.Max(1, _frames.Count / 100); float worst = 0f;
                for (int k = 0; k < n; k++) worst += _frames[_frames.Count - 1 - k]; worst /= n;
                float p99 = _frames.Count > 0 ? _frames[Mathf.Min(_frames.Count - 1, Mathf.FloorToInt(_frames.Count * 0.99f))] : 0f;
                var sd = SimDriver.Instance;
                _out.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "{0},{1}x{2},{3},{4:F2},{5:F1},{6:F1},{7:F2},{8:F2},{9:F2},{10:F3}\n",
                    QualityPresets.Current.name, Screen.width, Screen.height, _frames.Count, avg * 1000f, 1f / Mathf.Max(0.0001f, avg), 1f / Mathf.Max(0.0001f, worst), p99 * 1000f,
                    _perf ? _perf.GpuMs : 0f, _perf ? _perf.CpuMs : 0f, sd ? sd.AvgSimMsPerStep : 0);
                Next();
            }
        }

        void Finish()
        {
            string path = Path.Combine(Application.persistentDataPath, "benchmark-summary.csv");
            File.WriteAllText(path, _out.ToString());
            Debug.Log("[MixerMad] benchmark written: " + path + "\n" + _out);
            Application.Quit(0);
        }
    }
}
