using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using MixerMad.Sim;

// Crash / respawn probe for the mixer. Read-only: never changes sim behaviour.
//   dotnet run --project Sim.Probe -c Release [-- --data <dir>] [--skin 0] [--weather snow] [--maxcrash 20] [--cap 240] [--csv out.csv]
static class Program
{
    static string FindData(string[] args)
    {
        string a = Arg(args, "--data", null); if (a != null) return a;
        string d = AppContext.BaseDirectory;
        for (int k = 0; k < 10 && d != null; k++, d = Path.GetDirectoryName(d))
            if (File.Exists(Path.Combine(d, "Sim", "Data", "tuning.json"))) return Path.Combine(d, "Sim", "Data");
        throw new FileNotFoundException("Sim/Data");
    }
    static string Arg(string[] a, string n, string d) { for (int i = 0; i < a.Length - 1; i++) if (a[i] == n) return a[i + 1]; return d; }
    static string I(double v, string f = "F2") { return v.ToString(f, CultureInfo.InvariantCulture); }

    sealed class Pol { public string n; public double f; public string m; public double duty = -1; public bool human; public bool gasFreeze; public double th = 0.55; public int delay = 0; }
    sealed class Rec
    {
        public string pol; public int li; public int n; public long crashTick; public double cx, cy, ang, speed; public string reason;
        public int freeze; public long sinceReset = -1; public bool atCp; public double sx, lift, minWheelClear, minBodyClear, spawnAng, slopeAng, angErr, groundSlope5;
        public double cpX; public string zone; public bool zoneNear; public double rockDist;
        public double v0, maxPen, maxSpeed60, loopNext = -1; public bool loop;
        public bool hasReset;
    }

    static int Main(string[] args)
    {
        string dataDir = FindData(args);
        var tuning = Tuning.Load(Path.Combine(dataDir, "tuning.json"));
        var data = GameData.Load(dataDir);
        int skin = int.Parse(Arg(args, "--skin", "0")); string wxo = Arg(args, "--weather", null);
        int maxCrash = int.Parse(Arg(args, "--maxcrash", "20")); double CAP = double.Parse(Arg(args, "--cap", "240"), CultureInfo.InvariantCulture);
        string csv = Arg(args, "--csv", null);
        string trace = Arg(args, "--trace", null); string profile = Arg(args, "--profile", null);
        if (profile != null)
        {
            var wp = World.Create(tuning, data, new WorldConfig { Mode = GameMode.Classic, LevelIndex = int.Parse(profile.Split(':')[0]), Vehicle = "mixer", MixerSkin = skin, Weather = wxo });
            double x0 = double.Parse(profile.Split(':')[1], CultureInfo.InvariantCulture), x1 = double.Parse(profile.Split(':')[2], CultureInfo.InvariantCulture);
            Console.WriteLine("flagX=" + I(wp.Level.flagX) + " cp=" + (wp.Checkpoint != null ? I(wp.Checkpoint.x) : "none") + " N=" + wp.Level.N);
            for (double x = x0; x <= x1; x += 1) Console.WriteLine("x=" + I(x, "F0") + " y=" + I(wp.Level.GroundY(x)));
            return 0;
        }
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--set")
        {
            var kv = args[i + 1].Split('='); var f = typeof(Tuning).GetField(kv[0]); if (f == null) throw new Exception("no const " + kv[0]);
            double val = double.Parse(kv[1], CultureInfo.InvariantCulture); if (f.FieldType == typeof(int)) f.SetValue(tuning, (int)val); else f.SetValue(tuning, val);
        }
        var only = Arg(args, "--levels", null); var lvSet = only == null ? null : new HashSet<int>(only.Split(',').Select(int.Parse));
        double DT = tuning.dt; var ph = tuning.Phys("mixer");
        var POL = new List<Pol>();
        foreach (double f in new[] { 0.55, 0.8, 1.0 }) foreach (string m in new[] { "none", "brake", "pitch" }) POL.Add(new Pol { n = "t" + f.ToString(CultureInfo.InvariantCulture) + "-" + m, f = f, m = m });
        foreach (double d in new[] { 0.5, 0.7, 0.85 }) POL.Add(new Pol { n = "duty" + d.ToString(CultureInfo.InvariantCulture), duty = d });
        foreach (double th in new[] { 0.35, 0.55, 0.8 }) foreach (int dl in new[] { 4, 14, 30 }) foreach (bool gf in new[] { true, false })
            POL.Add(new Pol { n = "human-th" + th.ToString(CultureInfo.InvariantCulture) + "-d" + dl + (gf ? "-H" : "-R"), human = true, gasFreeze = gf, th = th, delay = dl });
        if (Arg(args, "--bots", "1") == "0") POL.RemoveAll(p => !p.human);

        var all = new List<Rec>(); var summary = new List<string>();
        var firstH = new Dictionary<string, Rec>(); var firstR = new Dictionary<string, Rec>();
        var outcome = new Dictionary<string, string>();
        for (int li = 0; li < 8; li++)
            foreach (var pol in POL)
            {
                if (lvSet != null && !lvSet.Contains(li)) continue;
                var w = World.Create(tuning, data, new WorldConfig { Mode = GameMode.Classic, LevelIndex = li, Vehicle = "mixer", MixerSkin = skin, Weather = wxo });
                double t = 0; bool pass = false; int crashes = 0; long lastReset = -1; Rec cur = null; var recs = new List<Rec>();
                var angHist = new List<double>(); bool relG = false; bool track = false; long trackEnd = 0;
                double maxSpdAfter = 0;
                while (t < CAP && crashes < maxCrash)
                {
                    var P = w.Points; double vx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2 / DT; double ang = w.TruckPose().ang;
                    bool g = false, br = false;
                    if (pol.human)
                    {
                        angHist.Add(ang); double da = angHist.Count > pol.delay ? angHist[angHist.Count - 1 - pol.delay] : 0;
                        if (da > pol.th) relG = true; else if (da < pol.th - 0.15) relG = false;
                        g = w.State == Phase.Crashed ? pol.gasFreeze : !relG;
                    }
                    else if (w.State == Phase.Drive)
                    {
                        if (pol.duty >= 0) g = ((t % 0.6) / 0.6) < pol.duty;
                        else
                        {
                            double tg = ph.maxV * pol.f; g = vx < tg;
                            if (pol.m == "brake" && vx > tg + 2.5) { g = false; br = true; }
                            if (pol.m == "pitch") { if (ang > 0.55) g = false; if (vx > tg + 2.5 && ang < 0.2) { g = false; br = true; } }
                        }
                    }
                    // pre-step snapshot for crash record
                    double preAng = ang, preSpd = vx, preCx = w.TruckX(), preY = P[0].y;
                    var phase0 = w.State;
                    w.ClearEvents();
                    w.Step(new InputFrame(g, br)); t += DT;
                    long tick = w.StepCount;
                    // velocity tracking after reset
                    if (trace != null && cur != null && cur.hasReset && cur.n == 1 && tick - lastReset <= 120 && trace == li + ":" + pol.n && tick > lastReset)
                    {
                        var Q = w.Points; double m = 0; for (int i = 0; i < Q.Length; i++) { double s = Math.Sqrt((Q[i].x - Q[i].px) * (Q[i].x - Q[i].px) + (Q[i].y - Q[i].py) * (Q[i].y - Q[i].py)) / DT; if (s > m) m = s; }
                        if ((tick - lastReset) % 4 == 0 || tick - lastReset < 8) Console.WriteLine("  +" + (tick - lastReset) + " x=" + I(w.TruckX()) + " y0=" + I(Q[0].y) + " ang=" + I(w.TruckPose().ang) + " maxSpd=" + I(m, "F1") + " wheels c=" + Q[4].c.ok + "/" + Q[5].c.ok + " pen=" + I(Math.Max(Q[4].c.pen, Q[5].c.pen), "F3"));
                    }
                    if (track)
                    {
                        var Q = w.Points; double m = 0; for (int i = 0; i < Q.Length; i++) { double s = Math.Sqrt((Q[i].x - Q[i].px) * (Q[i].x - Q[i].px) + (Q[i].y - Q[i].py) * (Q[i].y - Q[i].py)) / DT; if (s > m) m = s; }
                        if (m > cur.maxSpeed60) cur.maxSpeed60 = m;
                        if (tick >= trackEnd) track = false;
                    }
                    foreach (var e in w.Events)
                    {
                        if (e.Type == SimEventType.Crash)
                        {
                            crashes++;
                            if (cur != null && cur.sinceReset >= 0 && false) { }
                            var r = new Rec { pol = pol.n, li = li, n = crashes, crashTick = tick, cx = e.X, cy = e.Y, ang = preAng, speed = preSpd, reason = e.Text };
                            r.sinceReset = lastReset >= 0 ? tick - lastReset : -1;
                            // previous rec loop flag
                            if (recs.Count > 0 && lastReset >= 0 && tick - lastReset <= 360) { recs[recs.Count - 1].loop = true; recs[recs.Count - 1].loopNext = (tick - lastReset) * DT; }
                            recs.Add(r); cur = r;
                        }
                        else if (e.Type == SimEventType.Reset && cur != null)
                        {
                            lastReset = tick; cur.hasReset = true; cur.freeze = (int)(tick - cur.crashTick);
                            Analyse(w, tuning, data, skin, cur);
                            track = true; trackEnd = tick + 60;
                            var Q = w.Points; double m = 0; for (int i = 0; i < Q.Length; i++) { double s = Math.Sqrt((Q[i].x - Q[i].px) * (Q[i].x - Q[i].px) + (Q[i].y - Q[i].py) * (Q[i].y - Q[i].py)) / DT; if (s > m) m = s; }
                            cur.maxSpeed60 = m;
                        }
                    }
                    if (w.State != Phase.Drive && w.State != Phase.Stopping && w.State != Phase.Crashed) { pass = true; break; }
                }
                if (pol.human && recs.Count > 0) { var d = pol.gasFreeze ? firstH : firstR; d[li + "|" + pol.th + "|" + pol.delay] = recs[0]; }
                outcome[li + "|" + pol.n] = (pass ? "PASS" : "fail") + " crashes=" + crashes + " t=" + I(t, "F1");
                all.AddRange(recs);
            }

        var sb = new StringBuilder();
        void W(string s) { sb.AppendLine(s); Console.WriteLine(s); }
        W("# raw probe output  skin=" + skin + " weather=" + (wxo ?? "natural") + " maxcrash=" + maxCrash);
        W("## outcomes (level|policy)");
        for (int li = 0; li < 8; li++) if (lvSet == null || lvSet.Contains(li)) W("L" + li + " (" + data.levelWeather[li] + "): " + string.Join("; ", POL.Select(p => p.n + " " + outcome[li + "|" + p.n])));
        var done = all.Where(r => r.hasReset).ToList();
        { var dn = done; int passes = outcome.Count(o => o.Value.StartsWith("PASS")); int hp = outcome.Count(o => o.Key.Contains("human") && o.Value.StartsWith("PASS")), ht = outcome.Count(o => o.Key.Contains("human"));
          W("KPI crashes=" + all.Count + " respawns=" + dn.Count + " loops=" + dn.Count(r => r.loop) + " passRuns=" + passes + "/" + outcome.Count + " humanPass=" + hp + "/" + ht + " maxSpd60=" + (dn.Count == 0 ? "-" : I(dn.Max(r => r.maxSpeed60), "F1")) + " minWheelClear=" + (dn.Count == 0 ? "-" : I(dn.Min(r => r.minWheelClear))) + " meanFreezeTicks=" + (dn.Count == 0 ? "-" : I(dn.Average(r => r.freeze), "F0")) + " mean sec lost per crash(x m)=" + (dn.Count == 0 ? "-" : I(dn.Average(r => r.cx - r.sx), "F1"))); }
        W("## crashes total " + all.Count + ", with respawn " + done.Count);
        W("freeze ticks distinct: " + string.Join(",", done.Select(r => r.freeze).Distinct().OrderBy(x => x)));
        W("## per level: crashes, respawn at cp, loops(next crash <=3s), reasons");
        for (int li = 0; li < 8; li++)
        {
            var d = done.Where(r => r.li == li).ToList(); if (d.Count == 0) { W("L" + li + ": none"); continue; }
            W("L" + li + ": n=" + d.Count + " atCp=" + d.Count(r => r.atCp) + " loops=" + d.Count(r => r.loop) + " reasons=" + string.Join(",", d.GroupBy(r => r.reason).Select(g => g.Key + ":" + g.Count())) +
              " cpX=" + I(d[0].cpX, "F1") + " minWheelClear(min)=" + I(d.Min(r => r.minWheelClear)) + " minBodyClear(min)=" + I(d.Min(r => r.minBodyClear)) + " lift(P0)=" + I(d.Average(r => r.lift)) +
              " slopeAng deg(max abs)=" + I(d.Max(r => Math.Abs(r.slopeAng)) * 180 / Math.PI, "F1") + " angErr deg(max)=" + I(d.Max(r => r.angErr) * 180 / Math.PI, "F1") +
              " maxPen=" + I(d.Max(r => r.maxPen), "F3") + " maxSpd60 m/s=" + I(d.Max(r => r.maxSpeed60), "F1") + " zones: " + string.Join(",", d.Select(r => r.zone).Distinct()));
        }
        W("## crash loops (crash within 3 s of the respawn tick), by level and x of the crash that caused the respawn");
        foreach (var g in done.Where(r => r.loop).GroupBy(r => r.li)) W("L" + g.Key + ": " + g.Count() + " of " + done.Count(r => r.li == g.Key) + "; crash x=" + string.Join(" ", g.Select(r => I(r.cx, "F0")).GroupBy(s => s).Select(q => q.Key + "x" + q.Count())));
        var loopTimes = done.Where(r => r.loop).Select(r => r.loopNext).ToList();
        W("loop re-crash time s: " + (loopTimes.Count == 0 ? "-" : "min " + I(loopTimes.Min()) + " median " + I(loopTimes.OrderBy(x => x).ElementAt(loopTimes.Count / 2)) + " max " + I(loopTimes.Max())));
        W("overall: loops " + done.Count(r => r.loop) + " / " + done.Count + " = " + I(100.0 * done.Count(r => r.loop) / Math.Max(1, done.Count), "F1") + "%");
        W("## crash site vs respawn-from-checkpoint (atCp) fraction: " + done.Count(r => r.atCp) + "/" + done.Count);
        W("## gas through freeze: first crash only (identical before the reset tick), next-crash gap in s (H = gas held, R = released during freeze)");
        foreach (var kv in firstH.OrderBy(k => k.Key)) if (firstR.ContainsKey(kv.Key)) { var h = kv.Value; var q = firstR[kv.Key]; W("L" + kv.Key + ": H loop=" + h.loop + " next=" + I(h.loopNext) + " spd60=" + I(h.maxSpeed60, "F1") + " | R loop=" + q.loop + " next=" + I(q.loopNext) + " spd60=" + I(q.maxSpeed60, "F1") + (h.loop != q.loop || Math.Abs(h.loopNext - q.loopNext) > 1e-9 ? "  DIFF" : "")); }
        W("## inside-ground / spike respawns (pre-step spawn pose)");
        foreach (var r in done.Where(r => r.minWheelClear < 0 || r.minBodyClear < 0 || r.maxPen > 0.05).GroupBy(r => r.li + "|" + I(r.sx, "F1") + "|" + r.atCp).Select(g => g.First()))
            W("L" + r.li + " sx=" + I(r.sx) + " atCp=" + r.atCp + " wheelClear=" + I(r.minWheelClear) + " bodyClear=" + I(r.minBodyClear) + " slope=" + I(r.slopeAng * 180 / Math.PI, "F1") + "deg maxPen=" + I(r.maxPen, "F3") + " maxSpd60=" + I(r.maxSpeed60, "F1"));
        W("## distinct respawn poses (level, sx, atCp): clearances & velocity");
        foreach (var g in done.GroupBy(r => r.li + "|" + I(r.sx, "F1") + "|" + r.atCp).OrderBy(g => g.First().li).ThenBy(g => g.First().sx)) { var r = g.First(); W("L" + r.li + " sx=" + I(r.sx, "F1") + " atCp=" + r.atCp + " n=" + g.Count() + " P0 lift=" + I(r.lift) + " wheelClear=" + I(r.minWheelClear) + " bodyClear=" + I(r.minBodyClear) + " slope(5m)=" + I(r.groundSlope5 * 180 / Math.PI, "F1") + "deg wheelSlope=" + I(r.slopeAng * 180 / Math.PI, "F1") + "deg angle0=" + I(r.spawnAng * 180 / Math.PI, "F1") + "deg v0=" + I(r.v0, "F2") + " zone=" + r.zone + (r.zoneNear ? "(zone within 3m)" : "") + " rockDist=" + I(r.rockDist, "F1") + " pen=" + I(g.Max(q => q.maxPen), "F3") + " spd60=" + I(g.Max(q => q.maxSpeed60), "F1")); }
        if (csv != null) File.WriteAllText(csv, "pol,level,n,crashTick,cx,cy,reason,speed,ang,freeze,sinceReset,atCp,sx,loop,loopNext\n" + string.Join("\n", done.Select(r => string.Join(",", r.pol, r.li, r.n, r.crashTick, I(r.cx), I(r.cy), r.reason, I(r.speed), I(r.ang), r.freeze, r.sinceReset, r.atCp, I(r.sx), r.loop, I(r.loopNext)))));
        File.WriteAllText(Arg(args, "--out", "probe-out.txt"), sb.ToString());
        return 0;
    }

    // pre-step spawn pose, computed from the same formula as World.ResetTruck(true)
    static void Analyse(World w, Tuning T, GameData d, int skin, Rec r)
    {
        var L = w.Level; var cp = w.Checkpoint; bool atCp = cp != null && cp.hit; r.atCp = atCp; r.cpX = cp != null ? cp.x : -1;
        double sx = w.LastSpawnX, sy = w.LastSpawnY; r.sx = sx; r.lift = T.spawnLift;
        var geo = d.Geom("mixer", skin); double[][] pts = geo != null ? geo.pts : d.local;
        double minW = 1e9, minB = 1e9;
        double[] X = new double[6], Y = new double[6];
        for (int i = 0; i < pts.Length; i++)
        {
            X[i] = sx + pts[i][0]; Y[i] = sy + pts[i][1];
            double rad = i >= 4 ? (geo != null ? (i == 4 ? geo.r4 : geo.r5) : T.wheelR) : 0.06;
            double clear = Y[i] - rad - L.GroundY(X[i]);
            if (i >= 4) minW = Math.Min(minW, clear); else minB = Math.Min(minB, Y[i] - L.GroundY(X[i]));
        }
        r.minWheelClear = minW; r.minBodyClear = minB;
        r.spawnAng = Math.Atan2(Y[1] - Y[0], X[1] - X[0]);
        r.slopeAng = Math.Atan2(L.GroundY(X[5]) - L.GroundY(X[4]), X[5] - X[4]);
        r.angErr = Math.Abs(r.spawnAng - r.slopeAng);
        r.groundSlope5 = Math.Atan2(L.GroundY(sx + 2.5) - L.GroundY(sx - 2.5), 5);
        r.v0 = 0; // px = x at spawn
        r.zone = w.ZoneAt(sx).ToString(); r.zoneNear = false;
        for (double u = sx - 3; u <= sx + 3; u += 0.5) if (w.ZoneAt(u) != ZoneKind.None) r.zoneNear = true;
        r.rockDist = 99; if (L.rocks != null) foreach (var rk in L.rocks) r.rockDist = Math.Min(r.rockDist, Math.Abs(rk.x - sx));
        var Pn = w.Points; for (int i = 0; i < Pn.Length; i++) if (Pn[i].c.ok) r.maxPen = Math.Max(r.maxPen, Pn[i].c.pen);
    }
}
