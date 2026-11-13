using System;
using System.Collections.Generic;

namespace MixerMad.Sim
{
    public sealed class DailySpecResult { public string key; public List<Seg> spec; public string wx; public int dino, reroll; }

    /// <summary>buildLevel / buildYard / dailySpec ported from the JS (same operation order so the floats match bit for bit).</summary>
    public static class LevelBuilder
    {
        sealed class Pts
        {
            public List<double> x = new List<double>(), y = new List<double>();
            public void Push(double a, double b) { x.Add(a); y.Add(b); }
        }
        static Level Finish(Pts p)
        {
            var L = new Level(); L.N = p.x.Count; L.X = p.x.ToArray(); L.Y = p.y.ToArray();
            double minY = double.PositiveInfinity; for (int i = 0; i < L.N; i++) minY = Math.Min(minY, L.Y[i]);
            L.minY = minY; return L;
        }

        /// <summary>JS buildLevel(spec). crevice = VINFO[vehicle].crevice &amp;&amp; !combo.</summary>
        public static Level BuildLevel(List<Seg> spec, bool crevice, Tuning T)
        {
            var p = new Pts(); p.Push(-30, 0); p.Push(0, 0); double x = 0, y = 0; var jumps = new List<double[]>();
            foreach (var s in spec)
            {
                string k = s.kind;
                if (k == "flat") { x += s.a; p.Push(x, y); }
                else if (k == "bumps")
                {
                    double n = s.c * 8;
                    for (int i = 1; i <= n; i++) { double t = i / 8.0; p.Push(x + s.a * i / n, y + s.b * (1 - Math.Cos(2 * Math.PI * t)) / 2); }
                    x += s.a;
                }
                else if (k == "hill")
                {
                    for (int i = 1; i <= 20; i++) p.Push(x + s.a * i / 20, y + s.b * (1 - Math.Cos(2 * Math.PI * i / 20)) / 2);
                    x += s.a;
                }
                else if (k == "slope")
                {
                    for (int i = 1; i <= 12; i++) p.Push(x + s.a * i / 12, y + s.b * (1 - Math.Cos(Math.PI * i / 12)) / 2);
                    x += s.a; y += s.b;
                }
                else if (k == "jump")
                {
                    jumps.Add(new[] { x, x + s.a + 0.05 });
                    for (int i = 1; i <= 10; i++) { double t = i / 10.0; p.Push(x + s.a * t, y + s.b * t * t); }
                    x += s.a; y += s.b; p.Push(x + 0.05, y - s.c); x += 0.05; y -= s.c;
                }
            }
            double flagX = x + T.flagOffset; x += T.platformLen; p.Push(x, y);
            double edgeX = x, depth = T.creviceDepth, gapW = T.creviceGap, top = y;
            if (crevice) { p.Push(x + T.creviceSlant, y - depth); p.Push(x + gapW - T.creviceSlant, y - depth); p.Push(x + gapW, y); }
            x += gapW; p.Push(x + 25, y);
            var L = Finish(p);
            L.jumps = jumps;
            L.flagX = flagX; L.edgeX = edgeX; L.gapL = edgeX; L.gapR = edgeX + gapW; L.gapBottom = top - depth; L.gapTop = top;
            return L;
        }

        // ---------------- Daily Dig ----------------
        static List<Seg> DailyGen(Rng R)
        {
            var parts = new List<Seg>(); parts.Add(new Seg("flat", 8, 0, 0)); bool climb = false;
            for (int i = 0; i < 9; i++)
            {
                double t = R.Next();
                if (t < 0.25)
                {
                    double n = 3 + Math.Floor(R.Next() * 2);
                    double a = n * (3.5 + R.Next()); double b = 0.35 + R.Next() * 0.25;
                    parts.Add(new Seg("bumps", a, b, n)); climb = false;
                }
                else if (t < 0.5)
                {
                    double a = 14 + R.Next() * 3; double b = 1.6 + R.Next() * 0.8;
                    parts.Add(new Seg("hill", a, b, 0)); climb = true;
                }
                else if (t < 0.7)
                {
                    bool up = R.Next() < 0.6; double h = 1.2 + R.Next() * 1.2;
                    double a = 10 + R.Next() * 4;
                    parts.Add(new Seg("slope", a, up ? h : -h, 0)); climb = up;
                }
                else if (t < 0.85)
                {
                    if (climb) parts.Add(new Seg("flat", 4, 0, 0));
                    double a = 7 + R.Next() * 1.5; double b = 1.2 + R.Next() * 0.3; double c = 1.4 + R.Next() * 1.0;
                    parts.Add(new Seg("jump", a, b, c)); parts.Add(new Seg("flat", 5, 0, 0)); climb = false;
                }
                else { parts.Add(new Seg("flat", 4 + R.Next() * 4, 0, 0)); climb = false; }
            }
            parts.Add(new Seg("flat", 6, 0, 0)); return parts;
        }

        static bool DailyOk(List<Seg> parts)
        {
            double x = 0, y = 0; var px = new List<double>(); var py = new List<double>(); px.Add(0); py.Add(0);
            foreach (var s in parts)
            {
                string k = s.kind;
                if (k == "flat") { x += s.a; px.Add(x); py.Add(y); }
                else if (k == "bumps")
                {
                    double n = s.c * 8;
                    for (int i = 1; i <= n; i++) { px.Add(x + s.a * i / n); py.Add(y + s.b * (1 - Math.Cos(2 * Math.PI * i / 8)) / 2); }
                    x += s.a;
                }
                else if (k == "hill")
                {
                    for (int i = 1; i <= 20; i++) { px.Add(x + s.a * i / 20); py.Add(y + s.b * (1 - Math.Cos(2 * Math.PI * i / 20)) / 2); }
                    x += s.a;
                }
                else if (k == "slope")
                {
                    for (int i = 1; i <= 12; i++) { px.Add(x + s.a * i / 12); py.Add(y + s.b * (1 - Math.Cos(Math.PI * i / 12)) / 2); }
                    x += s.a; y += s.b;
                }
                else if (k == "jump") { x += s.a; y += s.b - s.c; px.Add(x); py.Add(y); }
            }
            for (int i = 1; i < px.Count; i++)
            {
                double dx = px[i] - px[i - 1];
                if (dx > 0.3 && Math.Abs(py[i] - py[i - 1]) / dx > 0.6) return false;
            }
            for (int i = 0; i < px.Count; i++)
                for (int j = i + 1; j < px.Count && px[j] - px[i] <= 30; j++)
                    if (Math.Abs(py[j] - py[i]) > 4.2) return false;
            return true;
        }

        /// <summary>JS dailySpec(key): FNV-style string hash, re-roll with seed+n until the geometry check passes (max 20).</summary>
        public static DailySpecResult DailySpec(string key, GameData data)
        {
            uint h = 0;
            unchecked { foreach (char c in key) h = (h ^ (uint)c) * 16777619u; }
            Rng R; List<Seg> parts; int n = 0;
            do { R = new Rng(unchecked(h + (uint)n)); parts = DailyGen(R); n++; } while (!DailyOk(parts) && n < 20);
            var r = new DailySpecResult(); r.key = key; r.spec = parts;
            r.wx = data.dailyWeather[(int)Math.Floor(R.Next() * data.dailyWeather.Length)];
            r.dino = (int)Math.Floor(R.Next() * data.dinoCount); r.reroll = n - 1;
            return r;
        }

        // ---------------- Contraption Yard ----------------
        public static Level BuildYard(YardDef def, Tuning T)
        {
            var p = new Pts(); p.Push(-30, 0); p.Push(0, 0); double x = 0, y = 0;
            var movers = new List<Mover>(); var stops = new List<Stop>(); var kills = new List<Kill>(); Stop lastStop = null;
            foreach (var s in def.spec)
            {
                string k = s.kind;
                if (k == "flat") { x += s.a; p.Push(x, y); }
                else if (k == "stop") { lastStop = new Stop { kind = s.text, x = 0, done = false }; stops.Add(lastStop); }
                else if (k == "pit" || k == "planks" || k == "seesaw")
                {
                    double w = s.a, x0 = x, x1 = x + w;
                    p.Push(x0 + 0.05, y - 14); p.Push(x1 - 0.05, y - 14); p.Push(x1, y); x = x1;
                    kills.Add(new Kill { x0 = x0 + 0.5, x1 = x1 - 0.5, y = y - 2.5, msg = "Fell in the pit!" });
                    if (k == "pit" && lastStop != null && lastStop.kind == "crane")
                    {
                        lastStop.x = x0 - 3.0; lastStop.hasPit = true; lastStop.pitX0 = x0; lastStop.pitX1 = x1; lastStop.pitY = y; lastStop = null;
                    }
                    if (k == "planks") { int n = 4; double pw = w / n; for (int i = 0; i < n; i++) movers.Add(new PlankMover(x0 + i * pw, x0 + (i + 1) * pw, y, T.g)); }
                    if (k == "seesaw") movers.Add(new SeesawMover((x0 + x1) / 2, y, w / 2 + 0.6));
                }
                else if (k == "hole")
                {
                    double w = s.a, x0 = x, x1 = x + w, d = 3.2;
                    p.Push(x0 + 0.3, y - d); p.Push(x1 - 0.3, y - d); p.Push(x1, y); x = x1;
                    var fill = new FillMover(x0, x1, y - d, d); movers.Add(fill);
                    kills.Add(new Kill { x0 = x0 + 0.6, x1 = x1 - 0.6, y = y - 1.4, msg = "Stuck in the hole!", ok = fill, okFrac = 0.8 });
                    if (lastStop != null && lastStop.kind == "dozer") { lastStop.x = x0 - 3.4; lastStop.fill = fill; lastStop = null; }
                }
                else if (k == "lift")
                {
                    double w = s.a, amp = s.b, x0 = x, x1 = x + w;
                    p.Push(x0 + 0.05, y - 14); p.Push(x1 - 0.05, y - 14); p.Push(x1 - 0.05, y + amp); p.Push(x1, y + amp); x = x1;
                    movers.Add(new LiftMover(x0 + 0.15, x1 - 0.15, y, amp));
                    kills.Add(new Kill { x0 = x0 + 0.5, x1 = x1 - 0.5, y = y - 3, msg = "Fell off the lift!" });
                    y += amp;
                }
            }
            double flagX = x - 6; p.Push(x + 25, y);
            var L = Finish(p);
            L.flagX = flagX; L.edgeX = x + 100; L.gapL = x + 100; L.gapR = x + 105; L.gapBottom = y - 3; L.gapTop = y;
            L.movers = movers; L.stops = stops; L.kills = kills;
            return L;
        }
    }
}
