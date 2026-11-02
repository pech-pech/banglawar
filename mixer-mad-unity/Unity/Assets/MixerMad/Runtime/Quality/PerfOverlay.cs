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
        float _gpuMs = float.NaN, _cpuMs = float.NaN, _tick;
        readonly FrameTiming[] _timing = new FrameTiming[FrameTimingAccumulator.Window];
        readonly FrameTimingAccumulator _timings = new FrameTimingAccumulator();
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

            _timings.Capture(_timing);
            _tick += dt;
            if (_tick >= 0.5f)
            {
                _tick = 0f;
                Recompute();
                _gpuMs = _timings.GpuMs; _cpuMs = _timings.CpuMs;   // NaN when the half second had no reading
                _timings.Reset();
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
                "{0:F1},{1},{2}x{3},{4:F2},{5:F1},{6:F1},{7},{8},{9:F3},{10},{11:F2},{12:F3},{13:F0}",
                Time.realtimeSinceStartup, QualityPresets.Current.name, Screen.width, Screen.height, _avgMs, 1000f / Mathf.Max(0.01f, _avgMs),
                _low1Fps, BenchmarkRunner.F(_gpuMs, "F2"), BenchmarkRunner.F(_cpuMs, "F2"), sd ? sd.AvgSimMsPerStep : 0, sd ? sd.StepsLastFrame : 0,
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
            GUILayout.BeginArea(new Rect(8, 8, 420, 860), GUI.skin.box);
            GUILayout.Label($"<b>{p.name}</b>  {Screen.width}x{Screen.height}  scale {p.renderScale:0.00}  target {p.targetFps} fps", _style);
            GUILayout.Label($"frame {_avgMs:0.0} ms  ({1000f / Mathf.Max(0.01f, _avgMs):0} fps)   1% low {_low1Fps:0} fps   worst {_minFps:0}", _style);
            GUILayout.Label($"GPU {BenchmarkRunner.F(_gpuMs, "0.0")} ms   CPU {BenchmarkRunner.F(_cpuMs, "0.0")} ms   (needs Frame Timing Stats)", _style);
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
            ch |= Toggle("SSAO (Ultra)", ref FeatureToggles.Ssao);
            ch |= Toggle("Light shafts", ref FeatureToggles.LightShafts);
            ch |= Toggle("Contact shadows", ref FeatureToggles.ContactShadows);
            if (ch) FeatureToggles.Notify();
            bool fx = false;   // showcase FX (Runtime/FX/FxToggles.cs)
            fx |= Toggle("FX: wheel spray", ref FxToggles.Spray); fx |= Toggle("FX: landing puffs", ref FxToggles.LandingPuff);
            fx |= Toggle("FX: exhaust", ref FxToggles.Exhaust); fx |= Toggle("FX: tyre tracks", ref FxToggles.Tracks);
            fx |= Toggle("FX: beacon", ref FxToggles.Beacon); fx |= Toggle("FX: headlamps", ref FxToggles.Headlights);
            fx |= Toggle("FX: gold sparkle", ref FxToggles.Sparkle); fx |= Toggle("Living world", ref FxToggles.LivingWorld);
            if (fx) FxToggles.Notify();

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
    /// Headless benchmark (D10, L-MM-35). `-mmBenchmark 40` plays a scripted bot (gas held) and measures, in order:
    ///  1. a warm-up pass on High (`-mmBenchmarkWarmup`, default 10 s), thrown away, so first-run costs (shader
    ///     compiles, JIT, caches) do not land on whichever preset happens to go first;
    ///  2. each preset Low..Ultra for 40 s, in a shuffled order with a fixed seed (same order every run);
    ///  3. on High, each FeatureToggles flag off and on (`-mmBenchmarkFeature`, default 15 s each; 0 skips), found by
    ///     reflection so flags added later are measured too.
    /// Every run also drops its first `settle` seconds. Writes benchmark-summary.csv, benchmark-features.csv and
    /// benchmark-runs.csv to persistentDataPath and, with `-mmBenchmarkOut &lt;dir&gt;`, to that folder too. Then quits.
    /// Slow-mo stays ON (that is the real case).
    /// </summary>
    public sealed class BenchmarkRunner : MonoBehaviour, ISimInputSource
    {
        public const int ShuffleSeed = 20261102;
        const int MeasuredPreset = (int)QualityLevel.High;

        public float secondsPerPreset = 40f;
        public float secondsPerFeature = 15f;
        public float warmupSeconds = 10f;
        public float settle = 4f;

        internal enum RunKind { Warmup, Preset, FeatureOff, FeatureOn }

        internal readonly struct Run
        {
            public readonly RunKind kind; public readonly int preset; public readonly string flag; public readonly float seconds;
            public Run(RunKind kind, int preset, string flag, float seconds) { this.kind = kind; this.preset = preset; this.flag = flag; this.seconds = seconds; }
            public string Label => kind == RunKind.Preset ? QualityPresets.Table[preset].name : kind == RunKind.Warmup ? "warmup" : flag + (kind == RunKind.FeatureOn ? ":on" : ":off");
        }

        internal struct Result { public Run run; public int order, frames, gpuSamples; public float avgMs, fps, low1Fps, p99Ms, gpuMs, cpuMs, simMsStep; }

        List<Run> _plan;
        readonly List<Result> _results = new List<Result>();
        Dictionary<string, object> _flagsAtStart;
        int _index = -1;
        float _t; double _simMs; long _simSteps;
        readonly List<float> _frames = new List<float>(8192);
        readonly FrameTiming[] _timing = new FrameTiming[FrameTimingAccumulator.Window];
        readonly FrameTimingAccumulator _timings = new FrameTimingAccumulator();

        public static bool Requested
        {
            get { foreach (var a in Environment.GetCommandLineArgs()) if (a == "-mmBenchmark") return true; return false; }
        }

        public SimInput Sample() => new SimInput { gas = 1f, brake = 0f };

        /// <summary>Fisher-Yates shuffle of 0..count-1 with a fixed seed: the same order on every run and machine.</summary>
        internal static int[] Shuffled(int count, int seed)
        {
            var order = new int[count];
            for (int i = 0; i < count; i++) order[i] = i;
            var rng = new System.Random(seed);
            for (int i = count - 1; i > 0; i--) { int j = rng.Next(i + 1); (order[i], order[j]) = (order[j], order[i]); }
            return order;
        }

        /// <summary>The whole benchmark as a list of runs. Pure, so a test can check it.</summary>
        internal static List<Run> Plan(IReadOnlyList<string> flags, float presetSeconds, float featureSeconds, float warmupSeconds, int seed)
        {
            var plan = new List<Run>();
            if (warmupSeconds > 0f) plan.Add(new Run(RunKind.Warmup, MeasuredPreset, null, warmupSeconds));
            foreach (int p in Shuffled(QualityPresets.Table.Length, seed)) plan.Add(new Run(RunKind.Preset, p, null, presetSeconds));
            if (featureSeconds <= 0f || flags == null) return plan;
            var coin = new System.Random(seed + 1);   // off-first or on-first per flag, so neither side always runs warmer
            foreach (var f in flags)
            {
                bool offFirst = coin.Next(2) == 0;
                plan.Add(new Run(offFirst ? RunKind.FeatureOff : RunKind.FeatureOn, MeasuredPreset, f, featureSeconds));
                plan.Add(new Run(offFirst ? RunKind.FeatureOn : RunKind.FeatureOff, MeasuredPreset, f, featureSeconds));
            }
            return plan;
        }

        static float FloatArg(string[] args, string name, float fallback)
        {
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == name && float.TryParse(args[i + 1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v)) return v;
            return fallback;
        }

        static string StringArg(string[] args, string name)
        {
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return null;
        }

        void Start()
        {
            var args = Environment.GetCommandLineArgs();
            secondsPerPreset = FloatArg(args, "-mmBenchmark", secondsPerPreset);
            secondsPerFeature = FloatArg(args, "-mmBenchmarkFeature", Mathf.Min(secondsPerFeature, secondsPerPreset));
            warmupSeconds = FloatArg(args, "-mmBenchmarkWarmup", warmupSeconds);
            var input = FindAnyObjectByType<InputReader>(); if (input) input.enabled = false;
            if (SimDriver.Instance) SimDriver.Instance.InputSource = this;
            _flagsAtStart = FeatureToggleFields.Snapshot();
            _plan = Plan(FeatureToggleFields.Names(), secondsPerPreset, secondsPerFeature, warmupSeconds, ShuffleSeed);
            Debug.Log($"[MixerMad] benchmark plan ({_plan.Count} runs, seed {ShuffleSeed}): " + string.Join(" ", _plan.ConvertAll(r => r.Label)));
            Next();
        }

        void Next()
        {
            _index++;
            if (_index >= _plan.Count) { Finish(); return; }
            var run = _plan[_index];
            FeatureToggleFields.Restore(_flagsAtStart);
            if (run.kind == RunKind.FeatureOff || run.kind == RunKind.FeatureOn)
            {
                FeatureToggleFields.Set(FeatureToggleFields.Find(run.flag), run.kind == RunKind.FeatureOn);
                FeatureToggles.Notify();
            }
            QualityPresets.Instance.SetLevel((QualityLevel)run.preset);
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = -1;      // uncapped so the numbers show headroom, not the cap
            if (SimDriver.Instance) SimDriver.Instance.Restart();
            _t = 0f; _frames.Clear(); _timings.Reset(); _simMs = 0; _simSteps = 0;
        }

        void Update()
        {
            if (_plan == null || _index >= _plan.Count) return;
            float dt = Time.unscaledDeltaTime;
            _t += dt;
            var sd = SimDriver.Instance;
            if (sd && sd.Curr.finished) sd.Restart();
            if (_t > Mathf.Min(settle, _plan[_index].seconds * 0.25f))
            {
                _frames.Add(dt);
                _timings.Capture(_timing);   // only frames after the settle time; NaN (written n/a) if none had a reading
                if (sd && sd.StepsLastFrame > 0) { _simMs += sd.LastSimMs; _simSteps += sd.StepsLastFrame; }
            }
            else FrameTimingManager.CaptureFrameTimings();   // keep the manager's history current during the settle time
            if (_t >= _plan[_index].seconds && _frames.Count > 0) { _results.Add(Measure(_plan[_index], _index)); Next(); }
        }

        Result Measure(Run run, int order)
        {
            _frames.Sort();
            float sum = 0f; foreach (var f in _frames) sum += f;
            float avg = sum / _frames.Count;
            int n = Mathf.Max(1, _frames.Count / 100); float worst = 0f;
            for (int k = 0; k < n; k++) worst += _frames[_frames.Count - 1 - k];
            worst /= n;
            float p99 = _frames[Mathf.Min(_frames.Count - 1, Mathf.FloorToInt(_frames.Count * 0.99f))];
            var r = new Result
            {
                run = run, order = order, frames = _frames.Count, avgMs = avg * 1000f, fps = 1f / Mathf.Max(0.0001f, avg),
                low1Fps = 1f / Mathf.Max(0.0001f, worst), p99Ms = p99 * 1000f,
                gpuMs = _timings.GpuMs, cpuMs = _timings.CpuMs, gpuSamples = _timings.GpuSamples,
                simMsStep = _simSteps > 0 ? (float)(_simMs / _simSteps) : 0f,
            };
            Debug.Log($"[MixerMad] benchmark {run.Label}: {r.avgMs:F2} ms, gpu {F(r.gpuMs, "F2")} ({_timings.GpuSamples} samples), cpu {F(r.cpuMs, "F2")}, sim {r.simMsStep:F3} ms/step");
            return r;
        }

        void Finish()
        {
            FeatureToggleFields.Restore(_flagsAtStart);
            var files = new Dictionary<string, string>
            {
                ["benchmark-summary.csv"] = SummaryCsv(_results),
                ["benchmark-features.csv"] = FeaturesCsv(_results),
                ["benchmark-runs.csv"] = RunsCsv(_results),
            };
            var dirs = new List<string> { Application.persistentDataPath };
            string outDir = StringArg(Environment.GetCommandLineArgs(), "-mmBenchmarkOut");
            if (!string.IsNullOrEmpty(outDir)) dirs.Add(outDir);
            int code = 0;
            foreach (var dir in dirs)
            {
                try
                {
                    Directory.CreateDirectory(dir);
                    foreach (var kv in files) File.WriteAllText(Path.Combine(dir, kv.Key), kv.Value);
                    Debug.Log("[MixerMad] benchmark written to " + dir);
                }
                catch (Exception e) { code = 5; Debug.LogError("[MixerMad] benchmark: cannot write to " + dir + ": " + e.Message); }
            }
            Debug.Log("[MixerMad] benchmark summary\n" + files["benchmark-summary.csv"] + "\nfeatures\n" + files["benchmark-features.csv"]);
            Application.Quit(code);
        }

        /// <summary>A number for the CSV; NaN (no reading, e.g. no GPU sample in a run) is written "n/a", never 0.</summary>
        internal static string F(float v, string fmt) => float.IsNaN(v) ? "n/a" : v.ToString(fmt, System.Globalization.CultureInfo.InvariantCulture);

        /// <summary>One row per preset in table order (Low..Ultra); run_order shows where it ran in the shuffle.</summary>
        internal static string SummaryCsv(List<Result> results)
        {
            var sb = new StringBuilder("preset,res,frames,avg_ms,fps,low1_fps,p99_ms,gpu_ms,cpu_ms,sim_ms_step,run_order\n");
            var presets = results.FindAll(r => r.run.kind == RunKind.Preset);
            presets.Sort((a, b) => a.run.preset.CompareTo(b.run.preset));
            foreach (var r in presets)
                sb.Append(QualityPresets.Table[r.run.preset].name).Append(',').Append(Screen.width).Append('x').Append(Screen.height).Append(',')
                  .Append(r.frames).Append(',').Append(F(r.avgMs, "F2")).Append(',').Append(F(r.fps, "F1")).Append(',').Append(F(r.low1Fps, "F1")).Append(',')
                  .Append(F(r.p99Ms, "F2")).Append(',').Append(F(r.gpuMs, "F2")).Append(',').Append(F(r.cpuMs, "F2")).Append(',').Append(F(r.simMsStep, "F3")).Append(',')
                  .Append(r.order).Append('\n');
            return sb.ToString();
        }

        /// <summary>One row per flag: High preset, flag off vs on; cost = on minus off (negative = noise).</summary>
        internal static string FeaturesCsv(List<Result> results)
        {
            var sb = new StringBuilder("flag,preset,frames_off,frames_on,avg_ms_off,avg_ms_on,frame_cost_ms,gpu_ms_off,gpu_ms_on,gpu_cost_ms,cpu_ms_off,cpu_ms_on,cpu_cost_ms\n");
            var seen = new List<string>();
            foreach (var r in results) if (r.run.flag != null && !seen.Contains(r.run.flag)) seen.Add(r.run.flag);
            foreach (var flag in seen)
            {
                var off = results.Find(r => r.run.flag == flag && r.run.kind == RunKind.FeatureOff);
                var on = results.Find(r => r.run.flag == flag && r.run.kind == RunKind.FeatureOn);
                if (off.frames == 0 || on.frames == 0) continue;
                sb.Append(flag).Append(',').Append(QualityPresets.Table[on.run.preset].name).Append(',').Append(off.frames).Append(',').Append(on.frames).Append(',')
                  .Append(F(off.avgMs, "F3")).Append(',').Append(F(on.avgMs, "F3")).Append(',').Append(F(on.avgMs - off.avgMs, "F3")).Append(',')
                  .Append(F(off.gpuMs, "F3")).Append(',').Append(F(on.gpuMs, "F3")).Append(',').Append(F(on.gpuMs - off.gpuMs, "F3")).Append(',')
                  .Append(F(off.cpuMs, "F3")).Append(',').Append(F(on.cpuMs, "F3")).Append(',').Append(F(on.cpuMs - off.cpuMs, "F3")).Append('\n');
            }
            return sb.ToString();
        }

        /// <summary>Every run in the order it ran, warm-up included, so a first-run outlier is visible. gpu_samples says how
        /// many frames had a GPU reading: uncapped frames on Metal often have none, and a mean of a few is not worth much.</summary>
        internal static string RunsCsv(List<Result> results)
        {
            var sb = new StringBuilder("order,run,preset,frames,avg_ms,gpu_ms,cpu_ms,sim_ms_step,gpu_samples\n");
            foreach (var r in results)
                sb.Append(r.order).Append(',').Append(r.run.Label).Append(',').Append(QualityPresets.Table[r.run.preset].name).Append(',').Append(r.frames).Append(',')
                  .Append(F(r.avgMs, "F3")).Append(',').Append(F(r.gpuMs, "F3")).Append(',').Append(F(r.cpuMs, "F3")).Append(',').Append(F(r.simMsStep, "F4")).Append(',').Append(r.gpuSamples).Append('\n');
            return sb.ToString();
        }
    }
}
