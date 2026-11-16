using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using MixerMad.Sim;

// Headless sweep runner. Same bot policies as games-design/mixer-mad/2026-11-02-physics-balance/sweep-tools/sweep.js.
//   dotnet run --project Sim.Runner -c Release [-- --data <Sim/Data dir>] [--out res.json] [--vehicles mixer,dump] [--cap 120]
// Writes res.json in the same shape sweep.js writes ({res:[{v,li,pol,pass,ft,crashes,cx,air,maxP,t}],wx,DT}) so an.js reads it unchanged.
static class Program
{
    static string FindData(string[] args)
    {
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--data") return args[i + 1];
        string d = AppContext.BaseDirectory;
        for (int k = 0; k < 10 && d != null; k++, d = Path.GetDirectoryName(d))
            if (File.Exists(Path.Combine(d, "Sim", "Data", "tuning.json"))) return Path.Combine(d, "Sim", "Data");
        throw new FileNotFoundException("Sim/Data/tuning.json not found; pass --data <dir>");
    }
    static string Arg(string[] a, string n, string d) { for (int i = 0; i < a.Length - 1; i++) if (a[i] == n) return a[i + 1]; return d; }

    sealed class Pol { public string n; public double f; public string m; public double duty = -1; }

    static string F(double v, string fmt) { return v.ToString(fmt, CultureInfo.InvariantCulture); }
    static string Num(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }

    static int Main(string[] args)
    {
        string dataDir = FindData(args);
        var tuning = Tuning.Load(Path.Combine(dataDir, "tuning.json"));
        var data = GameData.Load(dataDir);
        string outFile = Arg(args, "--out", "res.json");
        double CAP = double.Parse(Arg(args, "--cap", "120"), CultureInfo.InvariantCulture);
        string[] VEH = Arg(args, "--vehicles", "mixer,digger,dump,dozer,crane,roller").Split(',');
        var POL = new List<Pol>();
        foreach (double f in new[] { 0.55, 0.8, 1.0 }) foreach (string m in new[] { "none", "brake", "pitch" }) POL.Add(new Pol { n = "t" + Num(f) + "-" + m, f = f, m = m });
        foreach (double d in new[] { 0.5, 0.7, 0.85 }) POL.Add(new Pol { n = "duty" + Num(d), duty = d });

        double DT = tuning.dt;
        var sb = new StringBuilder("{\"res\":["); bool first = true;
        var passBy = new Dictionary<string, int>(); var totBy = new Dictionary<string, int>();
        var sw = System.Diagnostics.Stopwatch.StartNew(); long totalSteps = 0;
        foreach (string v in VEH)
            for (int li = 0; li < 8; li++)
                foreach (var pol in POL)
                {
                    var w = World.Create(tuning, data, new WorldConfig { Mode = GameMode.Classic, LevelIndex = li, Vehicle = v });
                    double t = 0, air = 0, maxP = 0, ft = 0; int crashes = 0, lastC = w.Crashes; bool pass = false; var cx = new List<string>();
                    while (t < CAP)
                    {
                        var P = w.Points; double vx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2 / DT; double ang = w.TruckPose().ang;
                        bool g = false, br = false;
                        if (w.State == Phase.Drive)
                        {
                            if (pol.duty >= 0) g = ((t % 0.6) / 0.6) < pol.duty;
                            else
                            {
                                double tg = tuning.Phys(v).maxV * pol.f; g = vx < tg;
                                if (pol.m == "brake" && vx > tg + 2.5) { g = false; br = true; }
                                if (pol.m == "pitch") { if (ang > 0.55) g = false; if (vx > tg + 2.5 && ang < 0.2) { g = false; br = true; } }
                            }
                        }
                        w.Step(new InputFrame(g, br)); t += DT;
                        if (w.State == Phase.Drive || w.State == Phase.Stopping)
                        {
                            var P2 = w.Points; bool gr = P2[4].c.ok || P2[5].c.ok; if (!gr) air += DT; maxP = Math.Max(maxP, Math.Abs(w.TruckPose().ang));
                        }
                        if (w.Crashes > lastC) { lastC = w.Crashes; crashes++; cx.Add(F(w.TruckX(), "F1")); }
                        if (w.State != Phase.Drive && w.State != Phase.Stopping && w.State != Phase.Crashed) { pass = true; ft = t; break; }
                        if (crashes >= 8) break;
                    }
                    totalSteps += w.StepCount;
                    string key = v; int pv; passBy.TryGetValue(key, out pv); passBy[key] = pv + (pass ? 1 : 0); totBy.TryGetValue(key, out pv); totBy[key] = pv + 1;
                    if (!first) sb.Append(','); first = false;
                    sb.Append("{\"v\":\"").Append(v).Append("\",\"li\":").Append(li).Append(",\"pol\":\"").Append(pol.n).Append("\",\"pass\":").Append(pass ? "true" : "false")
                      .Append(",\"ft\":").Append(pass ? Num(ft) : "null").Append(",\"crashes\":").Append(crashes).Append(",\"cx\":[").Append(string.Join(",", cx))
                      .Append("],\"air\":").Append(F(air, "F2")).Append(",\"maxP\":").Append(F(maxP, "F2")).Append(",\"t\":").Append(F(t, "F1")).Append('}');
                }
        sb.Append("],\"wx\":[");
        for (int i = 0; i < data.levelWeather.Length; i++) { if (i > 0) sb.Append(','); sb.Append('"').Append(data.levelWeather[i]).Append('"'); }
        sb.Append("],\"DT\":").Append(Num(DT)).Append(",\"errs\":0}");
        File.WriteAllText(outFile, sb.ToString());
        Console.WriteLine("steps: " + totalSteps + " in " + sw.Elapsed.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture) + " s -> " + outFile);
        foreach (var kv in totBy) Console.WriteLine("  " + kv.Key.PadRight(8) + passBy[kv.Key] + " / " + kv.Value + " pass");
        return 0;
    }
}
