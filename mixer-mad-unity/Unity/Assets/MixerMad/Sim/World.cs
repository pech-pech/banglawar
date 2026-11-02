using System;
using System.Collections.Generic;

namespace MixerMad.Sim
{
    public enum Phase { Drive, Stopping, Parked, Crashed, Action, Done }
    public enum GameMode { Classic, Load, Yard, Daily }
    public enum PropKind { None, Cone, Barrel, Pipe, Lump }

    public enum SimEventType
    {
        LevelStart, Crash, Reset, Land, Checkpoint, FinishLine, Parked, RockHit, Spill, Wheelie, PropHit, ActionStart, ActionEnd
    }

    /// <summary>One thing the 3D layer may want to react to (animation, sound, slow-mo). Value meaning depends on Type:
    /// Land = impact strength 0..1, Spill = percent lost, PropHit = impact strength, Finish/Parked = run time (s), Crash = crash count.</summary>
    public struct SimEvent
    {
        public SimEventType Type; public int Step; public double X, Y, Value; public string Text;
        public override string ToString() { return Type + "@" + Step + " x=" + X.ToString("0.00") + " " + Text; }
    }

    public struct InputFrame
    {
        public bool Gas, Brake, Tap;   // Tap: the single action button (yard crane drop / dozer push), edge-triggered by the caller
        public InputFrame(bool gas, bool brake) { Gas = gas; Brake = brake; Tap = false; }
    }

    /// <summary>A simulation point (truck node or prop). Verlet state x,y / px,py.</summary>
    public sealed class Pt
    {
        public double x, y, px, py, r, im;
        public Hit c;            // last contact (c.ok == JS "p.c truthy")
        public bool nc;          // no-collide (body corners when sprite geometry is present)
        // props only
        public PropKind kind; public double m, rot; public bool alive = true;
    }

    public sealed class Checkpoint { public double x; public bool hit; public double load = 100; }
    sealed class Link { public int a, b; public double len, k; }
    sealed class Beam { public double x, y, vy, len; public bool landed; }
    public sealed class ActionState { public Stop st; public double t, mt, wait; public int pushes; internal Beam beam; }

    public struct Pose { public double x, y, ang; }

    public sealed class WorldConfig
    {
        public GameMode Mode = GameMode.Classic;
        public int LevelIndex;           // 0-based
        public string Vehicle = "mixer";
        public int MixerSkin;            // 0-3 (mixer_skin1..4); the HTML picks it at random, collider shapes differ
        public string Weather;           // null = the level's own weather (LEVEL_WX / Daily)
        public string DailyKey;          // Daily mode date key "YYYY-MM-DD"
        public OracleLevel Override;     // optional recorded ground/zones/rocks/props (see OracleLevel)
        public int? Seed;                // replaces the level index in the weather/prop seeds (levelIdx*31+7, levelIdx*17+3)
    }

    /// <summary>
    /// The Mixer Mad drive simulation, ported line by line from mixer-mad-v7h.html (step(), tick(), nearest(), collide(), probeBody(),
    /// stepProps(), makeWeather(), resetTruck(), startLevel(), crash rules, checkpoints, Full Load spill, yard movers/actions).
    /// One call to Step() = one tick(DT) of the JS (DT = 1/120). Pure double maths; no Unity, no Box2D, no allocation in the step loop.
    /// </summary>
    public sealed partial class World
    {
        // ---- configuration ----
        public readonly Tuning T;
        public readonly GameData Data;
        readonly WorldConfig cfg;
        readonly double G, DT; readonly int ITER; readonly double WHEEL_R;

        // ---- read-only state for the renderer ----
        public Pt[] Points { get { return P; } }               // 0 rear-bottom, 1 front-bottom, 2 front-top, 3 rear-top, 4 rear wheel, 5 front wheel
        public double[] WheelAng { get { return wheelAng; } }
        public Phase State { get { return state; } }
        public GameMode Mode { get { return mode; } }
        public string Vehicle { get { return vehicle; } }
        public string Weather { get { return weather; } }
        public int LevelIndex { get { return levelIdx; } }
        public Level Level { get { return L; } }
        public double Load { get { return load; } }            // % cement/rocks/bricks (Full Load mode)
        public double Snow { get { return snow; } }
        public double RunTime { get { return run_t; } }        // the par timer (sim time while driving)
        public int Crashes { get { return run_crashes; } }
        public bool BrakeUsed { get { return run_brake; } }
        public double CrashT { get { return crashT; } }
        public string CrashReason { get { return crashReason; } }
        public Checkpoint Checkpoint { get { return cp; } }
        public List<Pt> Props { get { return props; } }
        public ActionState CurrentAction { get { return act; } }
        public long StepCount { get { return stepIndex; } }    // ticks processed
        public long PhysicsSteps { get { return physSteps; } } // calls of the JS step()
        public double SimTime { get { return stepIndex * DT; } }
        public bool RoofHit { get { return roofHit; } }
        public bool BodyHit { get { return bodyHit; } }
        public bool Wheelie { get { return wheelie; } }
        public double DrumAngle { get { return drumSpin; } }   // cosmetic: spins at 2.5 rad/s like the HTML
        public double AirTime { get { return airT; } }
        public int Stars { get { return stars; } }
        public double Acc { get { return acc; } }
        public double LastSpawnX { get { return lastSpawnX; } }  // read-only: where ResetTruck last put P-origin (for tools/tests)
        public double LastSpawnY { get { return lastSpawnY; } }
        public double CrashWait { get { return crashWait; } }
        public List<SimEvent> Events { get { return events; } }
        public void ClearEvents() { events.Clear(); }
        public VehGeom Geometry { get { return geo; } }

        /// <summary>truckPose() for the drive phase: origin = local y 0 (P0/P1 sit at y 0.1).</summary>
        public Pose TruckPose()
        {
            double cx = (P[0].x + P[1].x) / 2, cy = (P[0].y + P[1].y) / 2, a = Math.Atan2(P[1].y - P[0].y, P[1].x - P[0].x);
            return new Pose { x = cx + Math.Sin(a) * 0.1, y = cy - Math.Cos(a) * 0.1, ang = a };
        }
        /// <summary>chuteWorld() of the HTML (cement chute outlet) for face = 1, drum tilt 0.</summary>
        public void ChuteWorld(double drumTilt, out double x, out double y)
        {
            var p = TruckPose(); double lx = -2.5, ly = 0.75 + drumTilt * 0.3;
            x = p.x + lx * Math.Cos(p.ang) - ly * Math.Sin(p.ang); y = p.y + lx * Math.Sin(p.ang) + ly * Math.Cos(p.ang);
        }
        public double TruckX() { return (P[0].x + P[1].x) / 2; }

        // ---- internal state (names follow the JS) ----
        Pt[] P; Link[] C; double[] wheelAng = new double[2];
        Phase state; GameMode mode; string vehicle, weather; int levelIdx, skin;
        Level L; VehGeom geo; Checkpoint cp; DailySpecResult dailyCur;
        double lastSpawnX, lastSpawnY, graceT, crashT, finishT, crashWait, levelT, snow, airT, landT, wheelT, load, drumSpin;
        bool wheelie, roofHit, bodyHit, isSnow; double wxGripVal;
        double run_t; bool run_brake; int run_crashes;
        double yardT; int yardCrashes; ActionState act;
        string crashReason = "Flipped!";
        double acc; double propBudget = 1.5;
        List<Pt> props = new List<Pt>();
        InputFrame input;
        long stepIndex, physSteps; int stars;
        List<SimEvent> events = new List<SimEvent>(64);

        World(Tuning t, GameData d, WorldConfig c)
        {
            T = t; Data = d; cfg = c; G = t.g; DT = t.dt; ITER = t.iter; WHEEL_R = t.wheelR;
            propBudget = t.propBudgetMax;
        }

        public static World Create(Tuning tuning, GameData data, WorldConfig cfg)
        {
            var w = new World(tuning, data, cfg);
            w.mode = cfg.Mode; w.vehicle = cfg.Vehicle; w.skin = cfg.MixerSkin;
            w.StartLevel(cfg.LevelIndex);
            return w;
        }

        /// <summary>Convenience: Create(tuning, level, vehicle, weather, seed).</summary>
        public static World Create(Tuning tuning, GameData data, int level, string vehicle, string weather, int? seed)
        {
            return Create(tuning, data, new WorldConfig { LevelIndex = level, Vehicle = vehicle, Weather = weather, Seed = seed });
        }

        // ------------------------------------------------------------------ level setup
        int NLevels() { return mode == GameMode.Yard ? Data.yard.Count : mode == GameMode.Daily ? 1 : Data.levels.Count; }
        bool IsLoad() { return mode == GameMode.Load && (vehicle == "mixer" || vehicle == "dump" || vehicle == "crane"); }
        int SeedIdx() { return cfg.Seed.HasValue ? cfg.Seed.Value : levelIdx; }

        string Wx()
        {
            if (cfg.Weather != null) return cfg.Weather;
            if (mode == GameMode.Yard) return "clear";
            if (mode == GameMode.Daily) return dailyCur.wx;
            return Data.levelWeather[levelIdx % Data.levelWeather.Length];
        }

        void StartLevel(int i)
        {
            levelIdx = i % NLevels();
            if (mode == GameMode.Yard) { var yd = Data.yard[levelIdx]; vehicle = yd.veh; L = LevelBuilder.BuildYard(yd, T); yardT = 0; yardCrashes = 0; }
            else if (mode == GameMode.Daily)
            {
                vehicle = "digger"; dailyCur = LevelBuilder.DailySpec(cfg.DailyKey ?? "2026-11-02", Data);
                L = LevelBuilder.BuildLevel(dailyCur.spec, T.vinfo[vehicle].crevice, T);
            }
            else L = LevelBuilder.BuildLevel(Data.levels[levelIdx], T.vinfo[vehicle].crevice, T);
            run_t = 0; run_brake = false; run_crashes = 0;
            if (T.resetPropBudgetOnStartLevel != 0) propBudget = T.propBudgetMax;
            weather = Wx(); isSnow = weather == "snow";
            double gv; wxGripVal = T.wxGrip.TryGetValue(weather, out gv) ? gv : 0; // JS: (WXGRIP[wx()]||1) applied in GripK
            cp = null;
            if (levelIdx >= 1 && mode != GameMode.Yard)
            {
                bool have = false; double bx = 0, bsl = 0;
                for (double x = L.flagX * T.cpFrom; x < L.flagX * T.cpTo; x += T.cpStep)
                {
                    double sl = Math.Abs(L.GroundY(x + T.cpSpan) - L.GroundY(x - T.cpSpan));
                    if (!have || sl < bsl) { have = true; bx = x; bsl = sl; }
                }
                if (have) cp = new Checkpoint { x = bx, hit = false, load = 100 };
            }
            if (cfg.Override != null) { L.X = cfg.Override.X; L.Y = cfg.Override.Y; L.N = L.X.Length; }
            MakeWeather();
            ResetTruck(false);
            Emit(SimEventType.LevelStart, P[0].x, P[0].y, levelIdx, vehicle);
        }

        // ------------------------------------------------------------------ truck
        void ApplyMass()
        {
            var w = T.Phys(vehicle).w;
            for (int i = 0; i < P.Length; i++) P[i].im = 1 / (w[i] * ((i == 2 || i == 3) ? 1 + snow * T.snowMass : 1));
        }

        void ResetTruck(bool fromCp)
        {
            if (!fromCp && cp != null) cp.hit = false;
            bool atCp = fromCp && cp != null && cp.hit;
            double sx = atCp ? cp.x : T.spawnX;
            load = atCp ? cp.load : 100;
            geo = Data.Geom(vehicle, skin);
            double[][] pts = geo != null ? geo.pts : Data.local;
            if (fromCp && T.respawnFlatBack != 0) sx = FlatRespawnX(sx, pts);
            double sy = L.GroundY(sx) + T.spawnLift;
            if (fromCp && T.respawnClearLift != 0)
                for (int i = 0; i < pts.Length; i++)
                {
                    if (geo != null && i < 4) continue; // body corners do not collide with the ground when sprite geometry is present
                    double r = i >= 4 ? (geo != null ? (i == 4 ? geo.r4 : geo.r5) : WHEEL_R) : 0.06;
                    sy = Math.Max(sy, L.GroundY(sx + pts[i][0]) + r + T.respawnClear - pts[i][1]);
                }
            graceT = fromCp ? T.respawnGrace : 0;
            lastSpawnX = sx; lastSpawnY = sy;
            P = new Pt[pts.Length];
            for (int i = 0; i < pts.Length; i++)
            {
                double r = i >= 4 ? (geo != null ? (i == 4 ? geo.r4 : geo.r5) : WHEEL_R) : 0.06;
                double x = sx + pts[i][0], y = sy + pts[i][1];
                var p = new Pt { x = x, y = y, px = x, py = y, r = r };
                if (geo != null && i < 4) p.nc = true;
                P[i] = p;
            }
            var links = new List<Link>();
            for (int i = 0; i < 4; i++) for (int j = i + 1; j < 4; j++) links.Add(MakeLink(i, j, T.bodyLinkK));
            for (int w = 4; w < 6; w++) for (int i = 0; i < 4; i++) links.Add(MakeLink(w, i, T.wheelLinkK));
            C = links.ToArray();
            snow = 0; levelT = 0; wheelie = false; wheelT = 0; landT = -9;
            if (L.rocks != null) foreach (var r in L.rocks) r.hit = false;
            if (L.movers != null) foreach (var m in L.movers) if (m.hasReset) m.Reset();
            ApplyMass(); SpawnProps();
            wheelAng[0] = 0; wheelAng[1] = 0; state = Phase.Drive; crashT = 0; finishT = 0; airT = 0;
            // JS also clears the finale/UI state here; none of it is sim state.
        }
        double FlatRespawnX(double cpx, double[][] pts)
        {
            double lo = 1e9, hi = -1e9; foreach (var q in pts) { lo = Math.Min(lo, q[0]); hi = Math.Max(hi, q[0]); }
            lo -= 0.5; hi += 0.5;
            for (double x = cpx; x >= T.spawnX && x >= cpx - T.respawnFlatMaxBack; x -= 0.5)
            {
                double gl = 1e9, gh = -1e9; bool clean = true;
                for (double u = x + lo; u <= x + hi; u += 0.25)
                {
                    double y = L.GroundY(u); gl = Math.Min(gl, y); gh = Math.Max(gh, y);
                    if (ZoneAt(u) != ZoneKind.None) clean = false;
                }
                if (L.rocks != null) foreach (var rk in L.rocks) if (rk.x >= x + lo && rk.x <= x + hi) clean = false;
                if (clean && gh - gl <= T.respawnFlatTol) return x;
            }
            return cpx;
        }
        Link MakeLink(int a, int b, double k)
        {
            return new Link { a = a, b = b, len = JsMath.Hypot(P[a].x - P[b].x, P[a].y - P[b].y), k = k };
        }

        // ------------------------------------------------------------------ zones / weather
        public ZoneKind ZoneAt(double x)
        {
            var zs = L.zones;
            for (int i = 0; i < zs.Count; i++) { var z = zs[i]; if (x >= z.x0 && x <= z.x1) return z.kind; }
            return ZoneKind.None;
        }
        double GripK(ZoneKind z)
        {
            double zg = z == ZoneKind.Mud ? T.gripMud : z == ZoneKind.Puddle ? T.gripPuddle : z == ZoneKind.Slush ? T.gripSlush : z == ZoneKind.Sticky ? T.gripSticky : 0;
            return JsMath.Or(wxGripVal, 1) * JsMath.Or(zg, 1);
        }

        /// <summary>JS flatSpots(n, len, seed, minGap, pad).</summary>
        List<double> FlatSpots(int n, double len, double seed, double minGap, double pad)
        {
            var cand = new List<double>();
            for (double x = 12 + pad; x < L.flagX - len - 3 - pad; x += 0.5)
            {
                double lo = 1e9, hi = -1e9;
                for (double u = x - pad; u <= x + len + pad; u += 0.5) { double y = L.GroundY(u); lo = Math.Min(lo, y); hi = Math.Max(hi, y); }
                if (hi - lo < 0.04 * len + 0.1) cand.Add(x);
            }
            var pick = new List<double>(); int tries = 0; var R = Rng.FromDouble(seed * 7919 + 13);
            while (pick.Count < n && tries < 200 && cand.Count > 0)
            {
                tries++; double x = cand[(int)Math.Floor(R.Next() * cand.Count)];
                bool every = true; for (int i = 0; i < pick.Count; i++) if (!(Math.Abs(pick[i] - x) >= len + minGap)) { every = false; break; }
                if (every) pick.Add(x);
            }
            pick.Sort(); // numeric ascending (JS sort((a,b)=>a-b))
            return pick;
        }

        void AddZones(List<Zone> zs, ZoneKind kind, List<double> xs, double len, int max)
        {
            int n = 0; foreach (var x in xs) { if (n++ >= max) break; zs.Add(new Zone { kind = kind, x0 = x, x1 = x + len }); }
        }

        void MakeWeather()
        {
            if (cfg.Override != null)
            {
                L.zones = new List<Zone>(cfg.Override.zones); L.rocks = null;
                if (cfg.Override.rocks.Count > 0 || weather == "dirty") { L.rocks = new List<Rock>(); foreach (var rx in cfg.Override.rocks) L.rocks.Add(new Rock { x = rx }); }
                return;
            }
            string w = weather; var zs = new List<Zone>(); double seed = SeedIdx() * 31 + 7; L.zones = zs; L.rocks = null;
            if (w == "rain")
            {
                var mud = FlatSpots(2, 5, seed + 3, 6, 2); if (mud.Count == 0) mud = FlatSpots(2, 4, seed + 3, 6, 0);
                AddZones(zs, ZoneKind.Mud, mud, 5, int.MaxValue);
                var pu = FlatSpots(5, 2.5, seed, 4, 2); if (pu.Count == 0) pu = FlatSpots(5, 2.5, seed, 4, 0);
                var fil = new List<double>();
                foreach (var x in pu) { bool ok = true; foreach (var m in mud) if (!(Math.Abs(m - x) > 8)) { ok = false; break; } if (ok) fil.Add(x); }
                AddZones(zs, ZoneKind.Puddle, fil, 2.5, 3);
            }
            if (w == "slime")
            {
                double x = 12; var sticky = new List<double>(); var bouncy = new List<double>();
                while (x < L.flagX - 6)
                {
                    double sl = (L.GroundY(x + 3) - L.GroundY(x)) / 3;
                    if (sl > 0.25 && sticky.Count < 3) { sticky.Add(x - 1); x += 10; }
                    else if (Math.Abs(sl) < 0.05 && bouncy.Count < 3 && Rng.Hash(x + seed) < 0.3) { bouncy.Add(x); x += 12; }
                    else x += 1;
                }
                AddZones(zs, ZoneKind.Sticky, sticky, 5, int.MaxValue); AddZones(zs, ZoneKind.Bouncy, bouncy, 2.5, int.MaxValue);
            }
            if (w == "dirty")
            {
                var xs = FlatSpots(3, 6, seed, 5, 2); AddZones(zs, ZoneKind.Slush, xs, 6, int.MaxValue);
                L.rocks = new List<Rock>();
                foreach (var x in xs) L.rocks.Add(new Rock { x = x + 2 + Rng.Hash(x) * 2, hit = false });
                foreach (var x in FlatSpots(2, 1, seed + 9, 8, 0)) L.rocks.Add(new Rock { x = x, hit = false });
            }
            for (int i = 1; i < zs.Count; i++) { Zone zi = zs[i]; int j = i - 1; while (j >= 0 && zs[j].x0 > zi.x0) { zs[j + 1] = zs[j]; j--; } zs[j + 1] = zi; } // stable, like JS sort((a,b)=>a.x0-b.x0)
        }

        // ------------------------------------------------------------------ props
        void SpawnProps()
        {
            props.Clear(); if (L == null) return;
            if (cfg.Override != null) { foreach (var o in cfg.Override.props0) props.Add(new Pt { x = o.x, y = o.y, px = o.px, py = o.py, r = o.r, m = o.m, kind = o.kind, rot = 0, alive = true }); return; }
            double seed = SeedIdx() * 17 + 3;
            var xs = FlatSpots(8, 1.5, seed, 5, 0);
            foreach (var x in xs)
            {
                int ki = (int)Math.Floor(Rng.Hash(x * 3.3 + seed) * 3);
                PropKind k = ki == 0 ? PropKind.Cone : ki == 1 ? PropKind.Barrel : PropKind.Pipe;
                double r = k == PropKind.Cone ? 0.36 : k == PropKind.Barrel ? 0.42 : 0.35;
                double m = k == PropKind.Cone ? 0.3 : k == PropKind.Barrel ? 0.6 : 0.9;
                double y = L.GroundY(x) + r;
                props.Add(new Pt { x = x, y = y, px = x, py = y, r = r, m = m, kind = k, rot = 0, alive = true });
            }
            if (isSnow)
                foreach (var x in FlatSpots(8, 1, seed + 5, 3, 0))
                {
                    double r = 0.4 + Rng.Hash(x) * 0.2, y = L.GroundY(x) + r * 0.6;
                    props.Add(new Pt { x = x, y = y, px = x, py = y, r = r, m = 0.4, kind = PropKind.Lump, rot = 0, alive = true });
                }
        }

        void StepProps()
        {
            if (props.Count == 0) return;
            propBudget = Math.Min(T.propBudgetMax, propBudget + T.propBudgetRegen * DT);
            double tx = (P[0].x + P[1].x) / 2, tvx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2, tvy = ((P[0].y - P[0].py) + (P[1].y - P[1].py)) / 2;
            for (int bi = 0; bi < props.Count; bi++)
            {
                var b = props[bi]; if (!b.alive || Math.Abs(b.x - tx) > T.propNear) continue;
                double vx = (b.x - b.px) * T.propDamp, vy = (b.y - b.py) * T.propDamp; b.px = b.x; b.py = b.y; b.x += vx; b.y += vy - G * DT * DT;
                Collide(b, false); if (b.c.ok) { b.px += (b.x - b.px) * T.propGroundFric; }
                if (b.kind != PropKind.Cone) b.rot -= (b.x - b.px) / b.r;
                else if (Math.Abs(b.x - b.px) > 0.01 * DT * 60) b.rot = Math.Max(-1.6, Math.Min(1.6, b.rot - (b.x - b.px) * 2));
                bool hasN = false; double n0 = 0, n1 = 0, pen = 0;
                for (int k = 4; k < 6; k++)
                {
                    double dx = b.x - P[k].x, dy = b.y - P[k].y, d = JsMath.Hypot(dx, dy);
                    if (d < b.r + P[k].r && d > 1e-6 && b.r + P[k].r - d > pen) { pen = b.r + P[k].r - d; hasN = true; n0 = dx / d; n1 = dy / d; }
                }
                double sd = -1e9, sn0 = 0, sn1 = 0; bool hasSn = false;
                for (int i = 0; i < 4; i++)
                {
                    Pt a = P[i], c = P[(i + 1) % 4]; double ex = c.x - a.x, ey = c.y - a.y, el = JsMath.Or(JsMath.Hypot(ex, ey), 1.0);
                    double nx = ey / el, ny = -ex / el; double dd = (b.x - a.x) * nx + (b.y - a.y) * ny;
                    if (dd > sd) { sd = dd; sn0 = nx; sn1 = ny; hasSn = true; }
                }
                if (sd < b.r && b.r - sd > pen) { pen = b.r - sd; n0 = sn0; n1 = sn1; hasN = hasSn; }
                if (hasN)
                {
                    b.x += n0 * pen; b.y += n1 * pen;
                    double rvx = (b.x - b.px) - tvx, rvy = (b.y - b.py) - tvy, vn = (rvx * n0 + rvy * n1) / DT;
                    if (vn < 0)
                    {
                        if (b.kind == PropKind.Lump && -vn > T.propLumpKillV) { b.alive = false; Emit(SimEventType.PropHit, b.x, b.y, 0.3, "lump"); continue; }
                        b.px -= n0 * (-vn * T.propBounce) * DT; b.py -= n1 * (-vn * T.propBounce) * DT - T.propLift * DT;
                        double dv = Math.Min(Math.Min(T.propDvCap, b.m / T.propMassDiv * (-vn)), propBudget); propBudget -= dv;
                        for (int q = 0; q < P.Length; q++) { P[q].px += n0 * dv * DT; P[q].py += n1 * dv * DT; }
                        if (-vn > 2) Emit(SimEventType.PropHit, b.x, b.y, Math.Min(0.6, -vn / 15), "prop");
                    }
                }
            }
        }

        // ------------------------------------------------------------------ collision
        /// <summary>JS nearest(p): deepest penetration among solid movers and ground segments.</summary>
        Hit Nearest(double x, double y, double ppx, double ppy, double r)
        {
            Hit best = new Hit();
            if (L.movers != null)
            {
                for (int mi = 0; mi < L.movers.Count; mi++)
                {
                    var m = L.movers[mi]; if (!m.solid) continue;
                    for (int i = 0; i < m.segCount; i++)
                    {
                        double ax = m.segs[i * 4], ay = m.segs[i * 4 + 1], bx = m.segs[i * 4 + 2], by = m.segs[i * 4 + 3];
                        if (Math.Max(ax, bx) < x - r - 0.5 || Math.Min(ax, bx) > x + r + 0.5) continue;
                        double ex = bx - ax, ey = by - ay, l2 = JsMath.Or(ex * ex + ey * ey, 1e-9); double t = ((x - ax) * ex + (y - ay) * ey) / l2; t = Math.Max(0, Math.Min(1, t));
                        { double ln0 = Math.Sqrt(l2), unx = -ey / ln0, uny = ex / ln0; if ((ppx - ax) * unx + (ppy - ay) * uny < -0.08) continue; }
                        double cx = ax + ex * t, cy = ay + ey * t, dx = x - cx, dy = y - cy, d = JsMath.Hypot(dx, dy); if (d >= r) continue;
                        double ln = Math.Sqrt(l2), nx = d > 1e-6 ? dx / d : -ey / ln, ny = d > 1e-6 ? dy / d : ex / ln, pen = r - d;
                        if (!best.ok || pen > best.pen) { best.ok = true; best.pen = pen; best.nx = nx; best.ny = ny; best.m = m; }
                    }
                }
            }
            double[] gx = L.X, gy = L.Y;
            for (int i = 1; i < L.N; i++)
            {
                double ax = gx[i - 1], ay = gy[i - 1], bx = gx[i], by = gy[i];
                if (Math.Max(ax, bx) < x - r - 0.5 || Math.Min(ax, bx) > x + r + 0.5) continue;
                double ex = bx - ax, ey = by - ay, l2 = JsMath.Or(ex * ex + ey * ey, 1e-9);
                double t = ((x - ax) * ex + (y - ay) * ey) / l2; t = Math.Max(0, Math.Min(1, t));
                double cx = ax + ex * t, cy = ay + ey * t, dx = x - cx, dy = y - cy, d = JsMath.Hypot(dx, dy);
                if (d >= r) continue;
                double ln = Math.Sqrt(l2);
                double nx = d > 1e-6 ? dx / d : -ey / ln, ny = d > 1e-6 ? dy / d : ex / ln;
                double pen = r - d;
                if (!best.ok || pen > best.pen) { best.ok = true; best.pen = pen; best.nx = nx; best.ny = ny; best.m = null; }
            }
            return best;
        }

        void Collide(Pt p, bool truck)
        {
            Hit best = Nearest(p.x, p.y, p.px, p.py, p.r);
            if (!best.ok) return;
            p.x += best.nx * best.pen; p.y += best.ny * best.pen;
            double vx = p.x - p.px, vy = p.y - p.py, vn = vx * best.nx + vy * best.ny;
            if (vn < 0)
            {
                if (p.r > T.bounceWheelMinR && ZoneAt(p.x) == ZoneKind.Bouncy && vn < T.bounceMinVn * DT)
                {
                    double outv = Math.Max(-vn * T.bounceRestitution, T.bounceMinOut * DT);
                    p.px += best.nx * (vn + outv); p.py += best.ny * (vn + outv);
                }
                else { p.px += best.nx * vn; p.py += best.ny * vn; }
            }
            p.c = best;
            if (best.m != null && truck) { best.m.touched = true; if (best.m.hasContact) best.m.OnContact(p); }
        }

        void ProbeBody()
        {
            var g = geo;
            double ax = P[1].x - P[0].x, ay = P[1].y - P[0].y, al = JsMath.Or(JsMath.Hypot(ax, ay), 1.0), ux = ax / al, uy = ay / al, vx = -uy, vy = ux;
            double ox = (P[0].x + P[1].x) / 2 - vx * T.probeOffset, oy = (P[0].y + P[1].y) / 2 - vy * T.probeOffset;
            double mvx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2, mvy = ((P[0].y - P[0].py) + (P[1].y - P[1].py)) / 2;
            double x0 = g.pts[0][0], x1 = g.pts[1][0], t0 = T.probeT0, t1 = g.topY;
            var probes = g.probes;
            for (int qi = 0; qi < probes.Length; qi++)
            {
                Probe q = probes[qi];
                double wx = ox + q.lx * ux + q.ly * vx, wy = oy + q.lx * uy + q.ly * vy;
                Hit b = Nearest(wx, wy, wx - mvx, wy - mvy, T.probeR); if (!b.ok) continue;
                bodyHit = true; if (q.top && b.nx * vx + b.ny * vy < T.roofDot) roofHit = true; if (b.m != null) b.m.touched = true;
                if (!q.top && b.ny > T.skidNy) { b = new Hit { ok = true, pen = Math.Min(b.pen / b.ny, T.skidMaxPen), nx = 0, ny = 1, m = b.m }; }
                double s = Cl((q.lx - x0) / (x1 - x0)), t = Cl((q.ly - t0) / (t1 - t0));
                double w0 = (1 - s) * (1 - t), w1 = s * (1 - t), w2 = s * t, w3 = (1 - s) * t;
                double ss = 0; ss += w0 * w0; ss += w1 * w1; ss += w2 * w2; ss += w3 * w3;
                for (int i = 0; i < 4; i++)
                {
                    double wi = i == 0 ? w0 : i == 1 ? w1 : i == 2 ? w2 : w3;
                    double k = wi / ss * b.pen; Pt p = P[i];
                    p.x += b.nx * k; p.y += b.ny * k; p.px += b.nx * k; p.py += b.ny * k;
                    double vn = (p.x - p.px) * b.nx + (p.y - p.py) * b.ny;
                    if (vn < 0) { double f = Math.Min(1, wi * 2); p.px += b.nx * vn * f; p.py += b.ny * vn * f; }
                }
            }
        }
        static double Cl(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

        // ------------------------------------------------------------------ events
        void Emit(SimEventType type, double x, double y, double value, string text)
        {
            if (events.Count >= 4096) return;
            events.Add(new SimEvent { Type = type, Step = (int)stepIndex, X = x, Y = y, Value = value, Text = text });
        }
    }
}
