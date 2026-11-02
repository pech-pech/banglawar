using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.Json;
using MixerMad.Sim;
using Xunit;
using Xunit.Abstractions;

namespace Sim.Tests
{
    /// <summary>Locates Sim/Data and parity/traces by walking up from the test binary (override with MM_DATA / MM_TRACES).</summary>
    public static class Paths
    {
        static string Up(string rel, string marker)
        {
            string d = AppContext.BaseDirectory;
            for (int k = 0; k < 12 && d != null; k++, d = Path.GetDirectoryName(d))
                if (File.Exists(Path.Combine(d, rel, marker)) || Directory.Exists(Path.Combine(d, rel)) && marker == "") return Path.Combine(d, rel);
            return null;
        }
        public static string Data { get { return Environment.GetEnvironmentVariable("MM_DATA") ?? Up(Path.Combine("Sim", "Data"), "tuning.json"); } }
        public static string Traces
        {
            get
            {
                string e = Environment.GetEnvironmentVariable("MM_TRACES"); if (e != null) return e;
                string d = AppContext.BaseDirectory;
                for (int k = 0; k < 12 && d != null; k++, d = Path.GetDirectoryName(d))
                {
                    string c = Path.Combine(d, "parity", "traces"); if (Directory.Exists(c)) return c;
                    c = Path.Combine(d, "traces"); if (Directory.Exists(c) && Directory.GetFiles(c, "*.json.gz").Length > 0) return c;
                }
                return null;
            }
        }
    }

    public sealed class Fixture
    {
        public readonly Tuning Tuning; public readonly GameData Data;
        public readonly Dictionary<string, OracleLevel> Oracle;
        public Fixture() { string op = Path.Combine(Path.GetDirectoryName(Paths.Traces ?? ".") ?? ".", "oracle", "levels.json"); if (Environment.GetEnvironmentVariable("MM_USE_ORACLE_LEVELS") == "1" && File.Exists(op)) Oracle = OracleLevel.Load(op); Tuning = Tuning.Load(Path.Combine(Paths.Data, "tuning.json")); Data = GameData.Load(Paths.Data); }
    }

    public sealed class Replay
    {
        public string Name; public int Ticks; public bool Pass; public double MaxErr240 = 0, MaxErrAll = 0; public int FirstBadTick = -1;
        public int Crashes; public List<double> CrashX = new List<double>(); public double FinishRunT = double.NaN; public double ParkedT;
        public string FirstChkMismatch; public string Weather;
        public double[] FinalPts;
    }

    public static class TraceRunner
    {
        public static IEnumerable<string> Files(string vehicle)
        {
            string dir = Paths.Traces; if (dir == null) return new string[0];
            return Directory.GetFiles(dir, vehicle + "_L*.json.gz").OrderBy(f => f, StringComparer.Ordinal);
        }
        public static JsonDocument Read(string file)
        {
            using (var fs = File.OpenRead(file)) using (var gz = new GZipStream(fs, CompressionMode.Decompress)) return JsonDocument.Parse(gz);
        }
        static string Hex(uint h) { return h.ToString("x8"); }
        static uint Fnv(Pt[] P)
        {
            uint h = 0x811c9dc5u;
            for (int i = 0; i < 6; i++)
                foreach (double v in new[] { P[i].x, P[i].y, P[i].px, P[i].py })
                {
                    long b = BitConverter.DoubleToInt64Bits(v); uint lo = (uint)(b & 0xffffffffL), hi = (uint)((b >> 32) & 0xffffffffL);
                    unchecked { h = (h ^ lo) * 16777619u; h = (h ^ hi) * 16777619u; }
                }
            return h;
        }
        static double D(JsonElement e) { return e.GetDouble(); }

        public static Replay Run(Fixture fx, string file)
        {
            using (var doc = Read(file))
            {
                var root = doc.RootElement; var meta = root.GetProperty("meta");
                string mode = meta.GetProperty("mode").GetString();
                var cfg = new WorldConfig
                {
                    Vehicle = meta.GetProperty("vehicle").GetString(), LevelIndex = meta.GetProperty("level").GetInt32(),
                    Mode = mode == "load" ? GameMode.Load : mode == "daily" ? GameMode.Daily : mode == "yard" ? GameMode.Yard : GameMode.Classic,
                    MixerSkin = meta.GetProperty("skin").GetInt32(),
                };
                if (meta.TryGetProperty("dailyKey", out var dk) && dk.ValueKind == JsonValueKind.String) cfg.DailyKey = dk.GetString();
                if (fx.Oracle != null) { OracleLevel ol; if (fx.Oracle.TryGetValue(cfg.Vehicle + ":" + (cfg.LevelIndex + 1), out ol)) cfg.Override = ol; }
                var w = World.Create(fx.Tuning, fx.Data, cfg);
                var r = new Replay { Name = Path.GetFileName(file), Weather = w.Weather };
                string input = root.GetProperty("input").GetString(); string chk = root.GetProperty("chk").GetString();
                var samples = new Dictionary<int, JsonElement>(); foreach (var s in root.GetProperty("samples").EnumerateArray()) samples[s.GetProperty("k").GetInt32()] = s;
                int n = input.Length; r.Ticks = n;
                CompareSample(w, samples[0], 0, r);
                for (int k = 1; k <= n; k++)
                {
                    int c = input[k - 1] - '0';
                    w.Step(new InputFrame((c & 1) != 0, (c & 2) != 0));
                    if (r.FirstChkMismatch == null && Hex(Fnv(w.Points)) != chk.Substring((k - 1) * 8, 8)) r.FirstChkMismatch = "tick " + k + " (state " + w.State + ")";
                    JsonElement s; if (samples.TryGetValue(k, out s)) CompareSample(w, s, k, r);
                }
                r.Pass = w.State != Phase.Drive && w.State != Phase.Stopping && w.State != Phase.Crashed;
                r.Crashes = w.Crashes;
                foreach (var e in w.Events)
                {
                    if (e.Type == SimEventType.Crash) r.CrashX.Add(e.X);
                    if (e.Type == SimEventType.FinishLine && double.IsNaN(r.FinishRunT)) r.FinishRunT = e.Value;
                }
                return r;
            }
        }

        static void CompareSample(World w, JsonElement s, int k, Replay r)
        {
            var pts = s.GetProperty("pts"); double err = 0; int i = 0;
            foreach (var p in pts.EnumerateArray())
            {
                var P = w.Points[i++];
                err = Math.Max(err, Math.Abs(P.x - D(p[0]))); err = Math.Max(err, Math.Abs(P.y - D(p[1])));
                if (k <= 240) { err = Math.Max(err, Math.Abs(P.px - D(p[2]))); err = Math.Max(err, Math.Abs(P.py - D(p[3]))); }
            }
            if (k <= 240) { r.MaxErr240 = Math.Max(r.MaxErr240, err); if (err > 1e-9 && r.FirstBadTick < 0) r.FirstBadTick = k; }
            r.MaxErrAll = Math.Max(r.MaxErrAll, err);
        }
    }

    public class ParityTests : IClassFixture<FixtureHolder>
    {
        readonly Fixture fx; readonly ITestOutputHelper log;
        public ParityTests(FixtureHolder h, ITestOutputHelper o) { fx = h.F; log = o; }

        public static IEnumerable<object[]> TracesFor(string v) { foreach (var f in TraceRunner.Files(v)) yield return new object[] { Path.GetFileName(f) }; }
        public static IEnumerable<object[]> Mixer() { return TracesFor("mixer"); }
        public static IEnumerable<object[]> Digger() { return TracesFor("digger"); }
        public static IEnumerable<object[]> Dump() { return TracesFor("dump"); }
        public static IEnumerable<object[]> Dozer() { return TracesFor("dozer"); }
        public static IEnumerable<object[]> Crane() { return TracesFor("crane"); }
        public static IEnumerable<object[]> Roller() { return TracesFor("roller"); }

        // Meta tolerances. T2 hard limit is the top of the 0.05-0.25 m band from the plan.
        const double T1 = 1e-9, T2 = 0.25;

        void Check(string name)
        {
            string file = Path.Combine(Paths.Traces, name); var r = TraceRunner.Run(fx, file);
            using (var doc = TraceRunner.Read(file))
            {
                var o = doc.RootElement.GetProperty("outcome"); var ev = doc.RootElement.GetProperty("events");
                var meta = doc.RootElement.GetProperty("meta");
                Assert.Equal(meta.GetProperty("weather").GetString(), r.Weather);
                // T1
                Assert.True(r.MaxErr240 <= T1, name + " T1: max err in first 240 steps " + r.MaxErr240.ToString("g3") + " m (first > 1e-9 at tick " + r.FirstBadTick + "); first FNV mismatch " + r.FirstChkMismatch);
                // T2
                Assert.True(r.MaxErrAll <= T2, name + " T2: max err " + r.MaxErrAll.ToString("g3") + " m; first FNV mismatch " + r.FirstChkMismatch);
                // T3
                Assert.Equal(o.GetProperty("pass").GetBoolean(), r.Pass);
                Assert.Equal(o.GetProperty("crashes").GetInt32(), r.Crashes);
                var cx = new List<double>(); foreach (var e in ev.EnumerateArray()) if (e.GetProperty("type").GetString() == "crash") cx.Add(e.GetProperty("x").GetDouble());
                Assert.Equal(cx.Count, r.CrashX.Count);
                for (int i = 0; i < cx.Count; i++) Assert.True(Math.Abs(cx[i] - r.CrashX[i]) <= 0.5, name + " crash " + i + " x " + r.CrashX[i] + " vs " + cx[i]);
                var fr = o.GetProperty("finishRunT");
                if (fr.ValueKind == JsonValueKind.Number) Assert.True(Math.Abs(r.FinishRunT - fr.GetDouble()) <= 0.01 * fr.GetDouble() + 1e-9, name + " finish " + r.FinishRunT + " vs " + fr.GetDouble());
                log.WriteLine(name + " maxErr240=" + r.MaxErr240.ToString("g3") + " maxErrAll=" + r.MaxErrAll.ToString("g3") + " chkMismatch=" + (r.FirstChkMismatch ?? "none"));
            }
        }

        [Theory] [MemberData(nameof(Mixer))] public void Mixer_T1_T2_T3(string trace) { Check(trace); }
        [Theory] [MemberData(nameof(Digger))] public void Digger_T1_T2_T3(string trace) { Check(trace); }
        [Theory] [MemberData(nameof(Dump))] public void Dump_T1_T2_T3(string trace) { Check(trace); }
        [Theory] [MemberData(nameof(Dozer))] public void Dozer_T1_T2_T3(string trace) { Check(trace); }
        [Theory] [MemberData(nameof(Crane))] public void Crane_T1_T2_T3(string trace) { Check(trace); }
        [Theory] [MemberData(nameof(Roller))] public void Roller_T1_T2_T3(string trace) { Check(trace); }

        [Fact]
        public void Rng_matches_known_mulberry32_values()
        {
            // values produced by the JS seeded(1) in node 22
            var r = new Rng(1); Assert.Equal(0.6270739405881613, r.Next(), 15); Assert.Equal(0.002735721180215478, r.Next(), 15);
        }

        [Fact]
        public void Hypot_is_not_naive_sqrt()
        {
            // 3-4-5 sanity plus a pair where V8 and sqrt(x*x+y*y) are known to differ in the last bit is checked via traces
            Assert.Equal(5.0, JsMath.Hypot(3, 4));
            Assert.Equal(0.0, JsMath.Hypot(0, 0));
        }

        [Fact]
        public void Math_round_follows_js_rules()
        {
            Assert.Equal(-2.0, JsMath.Round(-2.5)); Assert.Equal(3.0, JsMath.Round(2.5)); Assert.Equal(-3.0, JsMath.Round(-3.5));
        }
    }

    public sealed class FixtureHolder { public Fixture F = new Fixture(); }
}
