using System;
using System.Collections.Generic;
using System.Globalization;

namespace MixerMad.Sim
{
    /// <summary>Per-vehicle physics row (MM_TUNING.phys[truck]). pull = force/mass and gtq = torque/mass are derived exactly like the HTML.</summary>
    public sealed class VehPhys
    {
        public double maxV, force, mass = 1, torque, air, spin, coast, link, tol, snowRoof, pull, gtq;
        public double[] w = new double[6];
        public string hull;
    }

    public sealed class VehInfo { public string world = "mixer"; public bool crevice; }

    public sealed class ZoneSpec { public int n; public double len; }

    /// <summary>
    /// Every tuning number of the sim. Loaded from Sim/Data/tuning.json. The JSON has the same top-level shape as the HTML's
    /// MM_TUNING blob (drive, phys, crash, weather, props, par) so a newer tuned build drops in by replacing those sections.
    /// Extra sections that the HTML keeps inside step() live under "consts" (field names below); "vinfo" says which trucks get a gap.
    /// </summary>
    public sealed class Tuning
    {
        // ---- globals ----
        public double dt = 1.0 / 120, wheelR = 0.5, holeMax = 1.8;
        public int iter = 8;

        // ---- MM_TUNING.drive ----
        public double g = 15, damping = 0.999, brake = 26, brakeMinV = 0.5, reverse = 11, reverseMaxV = 7, gripHeadroom = 3, brakeGrip = 26;

        // ---- MM_TUNING.crash ----
        public double upsideUy = -0.2, tippedAng = 1.2, tippedRate = 0.4, decay = 2, roofPushDot = -0.4, crashWait = 0.7, fallDepth = 15;
        public bool airCounts;
        public double respawnClearLift, respawnClear = 0.04;
        public bool propTouch = true;   // v7j: touching a prop counts as "touching" for crash time (v7h: no)

        // ---- MM_TUNING.weather ----
        public Dictionary<string, double> wxGrip = new Dictionary<string, double>();
        public double zoneGripMud = 0.7, zoneGripPuddle = 0.85, zoneGripSlush = 0.95, zoneGripSticky = 1.3;
        public double dragPuddle = 5, dragMud = 3, dragMudGrow = 3.5, dragMudGrowT = 40, dragSlush = 2, dragSticky = 0;
        public double zoneEase = 1.5, stickyPull = 2, snowRate = 0.035, snowVmaxCut = 0.35, rockKick = 2.6, bouncyRest = 0.85, bouncyMin = 6, jumpClear = 4;
        public Dictionary<string, double> propClear = new Dictionary<string, double>(), wxVmax = new Dictionary<string, double>(),
            wxPull = new Dictionary<string, double>(), wxGripCurve = new Dictionary<string, double>();
        public Dictionary<string, ZoneSpec> zones = new Dictionary<string, ZoneSpec>();

        // ---- MM_TUNING.props ----
        public Dictionary<string, double[]> propKinds = new Dictionary<string, double[]>();  // kind -> [r, m]
        public double lumpR0 = 0.4, lumpRVar = 0.2, lumpM = 0.4, lumpBreakV = 4, propBudget = 1.5, propRefill = 3, propMaxPush = 0.3, propBounce = 1.35;

        // ---- MM_TUNING.par ----
        public Dictionary<string, double> parK = new Dictionary<string, double>();
        public Dictionary<string, double[]> parT = new Dictionary<string, double[]>();

        public Dictionary<string, VehPhys> phys = new Dictionary<string, VehPhys>();
        public Dictionary<string, VehInfo> vinfo = new Dictionary<string, VehInfo>();

        // ---- consts: numbers the HTML keeps inline in step()/tick() ----
        public double stopDamp = 0.96;
        public double reverseMinX = 0.5;
        public double rockReach = 0.35;
        public double easeTail = 0.3;
        public double leftWallX = -1.5, startSlowX = 3, startSlowStop = 0.2, startSlowFloor = 0.85;
        public double stopSpeed = 0.3, stopTime = 0.4;
        public double spawnX = 5, spawnLift = 1.2;
        public double landAirT = 0.25, landVy = -2, loadSpillVy = 6.5, loadSpillK = 6, snowLandMin = 0.15;
        public double wheelieRel = 0.45, wheelieGrace = 0.6, wheelieT = 0.3, wheelieSpill = 10, wheelieReset = 0.25;
        public double probeR = 0.04, probeOffset = 0.1, probeT0 = 0.1, skidNy = 0.1, skidMaxPen = 0.2;
        public int probeIters = 3;
        public double propDamp = 0.995, propNear = 30, propLift = 0.8, propMassDiv = 6, propGroundFric = 0.02;
        public double flagOffset = 3, platformLen = 12, creviceDepth = 3.6, creviceGap = 5.5, creviceSlant = 0.25;
        public double cpFrom = 0.42, cpTo = 0.62, cpStep = 0.5, cpSpan = 2.5;
        public double yardStopRadius = 1.3, yardStopSpeed = 0.6, yardBrakeDamp = 0.94;
        public double bodyLinkK = 1, bounceWheelMinR = 0.3, bounceMinVn = -0.5;
        public int maxCatchUp = 8;
        // Unity-side respawn options beyond v7j (RESPAWN-REPORT.md options B, C). 0 = off = bit-exact v7j. Only on a respawn after a crash.
        public int respawnFlatBack = 0;
        public double respawnFlatMaxBack = 12, respawnFlatTol = 0.06, respawnGrace = 0;
        // behaviour switches. v7i and later: crash() ends the step, startLevel refills propBudget (v7h = 0 / 0).
        public int crashEarlyReturn = 1, resetPropBudgetOnStartLevel = 1;

        public VehPhys Phys(string v) { VehPhys p; return phys.TryGetValue(v, out p) ? p : phys["mixer"]; }
        public static double Wk(Dictionary<string, double> d, string k, double dflt) { double v; return d.TryGetValue(k, out v) ? JsMath.Or(v, dflt) : dflt; }

        static double N(Dictionary<string, object> d, string k, double dflt) { object o; return d.TryGetValue(k, out o) && o is double ? (double)o : dflt; }
        static Dictionary<string, double> Map(object o)
        {
            var r = new Dictionary<string, double>();
            foreach (var kv in (Dictionary<string, object>)o) if (kv.Value is double) r[kv.Key] = (double)kv.Value;
            return r;
        }
        static double[] Arr(object o) { var l = (List<object>)o; var r = new double[l.Count]; for (int i = 0; i < r.Length; i++) r[i] = (double)l[i]; return r; }

        public static Tuning FromJson(string json)
        {
            var root = (Dictionary<string, object>)MiniJson.Parse(json);
            var t = new Tuning(); object o;
            t.dt = N(root, "dt", t.dt); t.iter = (int)N(root, "iter", t.iter); t.wheelR = N(root, "wheelR", t.wheelR); t.holeMax = N(root, "holeMax", t.holeMax);
            if (root.TryGetValue("drive", out o))
            {
                var d = (Dictionary<string, object>)o;
                t.g = N(d, "gravity", t.g); t.damping = N(d, "damping", t.damping); t.brake = N(d, "brake", t.brake); t.brakeMinV = N(d, "brakeMinV", t.brakeMinV);
                t.reverse = N(d, "reverse", t.reverse); t.reverseMaxV = N(d, "reverseMaxV", t.reverseMaxV); t.gripHeadroom = N(d, "gripHeadroom", t.gripHeadroom); t.brakeGrip = N(d, "brakeGrip", t.brakeGrip);
            }
            if (root.TryGetValue("crash", out o))
            {
                var d = (Dictionary<string, object>)o;
                t.upsideUy = N(d, "upsideUy", t.upsideUy); t.tippedAng = N(d, "tippedAng", t.tippedAng); t.tippedRate = N(d, "tippedRate", t.tippedRate); t.decay = N(d, "decay", t.decay);
                t.roofPushDot = N(d, "roofPushDot", t.roofPushDot); t.crashWait = N(d, "wait", t.crashWait); t.fallDepth = N(d, "fallDepth", t.fallDepth);
                object ac; t.airCounts = d.TryGetValue("airCounts", out ac) && ac is bool && (bool)ac;
                t.respawnClearLift = N(d, "respawnClearLift", 0); t.respawnClear = N(d, "respawnClear", t.respawnClear);
                object pt; t.propTouch = !d.TryGetValue("propTouch", out pt) || !(pt is bool) || (bool)pt;
            }
            if (root.TryGetValue("weather", out o))
            {
                var d = (Dictionary<string, object>)o;
                if (d.ContainsKey("grip")) t.wxGrip = Map(d["grip"]);
                if (d.ContainsKey("zoneGrip")) { var z = Map(d["zoneGrip"]); t.zoneGripMud = Wk(z, "mud", 0); t.zoneGripPuddle = Wk(z, "puddle", 0); t.zoneGripSlush = Wk(z, "slush", 0); t.zoneGripSticky = Wk(z, "sticky", 0); }
                if (d.ContainsKey("drag")) { var z = Map(d["drag"]); t.dragPuddle = Wk(z, "puddle", 0); t.dragMud = Wk(z, "mud", 0); t.dragMudGrow = Wk(z, "mudGrow", 0); t.dragMudGrowT = Wk(z, "mudGrowT", 1); t.dragSlush = Wk(z, "slush", 0); t.dragSticky = Wk(z, "sticky", 0); }
                t.zoneEase = N(d, "zoneEase", t.zoneEase); t.stickyPull = N(d, "stickyPull", t.stickyPull); t.snowRate = N(d, "snowRate", t.snowRate); t.snowVmaxCut = N(d, "snowVmaxCut", t.snowVmaxCut);
                t.rockKick = N(d, "rockKick", t.rockKick); t.bouncyRest = N(d, "bouncyRest", t.bouncyRest); t.bouncyMin = N(d, "bouncyMin", t.bouncyMin); t.jumpClear = N(d, "jumpClear", t.jumpClear);
                if (d.ContainsKey("propClear")) t.propClear = Map(d["propClear"]);
                if (d.ContainsKey("vmax")) t.wxVmax = Map(d["vmax"]);
                if (d.ContainsKey("pull")) t.wxPull = Map(d["pull"]);
                if (d.ContainsKey("gripCurve")) t.wxGripCurve = Map(d["gripCurve"]);
                if (d.ContainsKey("zones"))
                    foreach (var kv in (Dictionary<string, object>)d["zones"]) { var zz = (Dictionary<string, object>)kv.Value; t.zones[kv.Key] = new ZoneSpec { n = (int)N(zz, "n", 0), len = N(zz, "len", 0) }; }
            }
            if (root.TryGetValue("props", out o))
            {
                var d = (Dictionary<string, object>)o;
                if (d.ContainsKey("kinds")) foreach (var kv in (Dictionary<string, object>)d["kinds"]) { var k = (Dictionary<string, object>)kv.Value; t.propKinds[kv.Key] = new[] { N(k, "r", 0), N(k, "m", 0) }; }
                if (d.ContainsKey("lump")) { var l = (Dictionary<string, object>)d["lump"]; t.lumpR0 = N(l, "r0", t.lumpR0); t.lumpRVar = N(l, "rVar", t.lumpRVar); t.lumpM = N(l, "m", t.lumpM); t.lumpBreakV = N(l, "breakV", t.lumpBreakV); }
                t.propBudget = N(d, "budget", t.propBudget); t.propRefill = N(d, "refill", t.propRefill); t.propMaxPush = N(d, "maxPush", t.propMaxPush); t.propBounce = N(d, "bounce", t.propBounce);
            }
            if (root.TryGetValue("par", out o))
            {
                var d = (Dictionary<string, object>)o;
                if (d.ContainsKey("K")) t.parK = Map(d["K"]);
                if (d.ContainsKey("T")) foreach (var kv in (Dictionary<string, object>)d["T"]) t.parT[kv.Key] = Arr(kv.Value);
            }
            if (root.TryGetValue("phys", out o))
                foreach (var kv in (Dictionary<string, object>)o)
                {
                    if (kv.Key.Length > 0 && kv.Key[0] == '_') continue;
                    var d = (Dictionary<string, object>)kv.Value; var p = new VehPhys();
                    p.maxV = N(d, "maxV", 0); p.force = N(d, "force", 0); p.mass = N(d, "mass", 1); p.torque = N(d, "torque", 0); p.air = N(d, "air", 0); p.spin = N(d, "spin", 4.5);
                    p.coast = N(d, "coast", 1.2); p.link = N(d, "link", 0.45); p.tol = N(d, "tol", 0.5); p.snowRoof = N(d, "snowRoof", 0.8);
                    object h; p.hull = d.TryGetValue("hull", out h) ? h as string : null;
                    p.pull = p.force / p.mass; p.gtq = p.torque / p.mass;           // JS: pull:q.force/q.mass, gtq:q.torque/q.mass
                    var w = (List<object>)d["w"]; for (int i = 0; i < 6; i++) p.w[i] = (double)w[i];
                    t.phys[kv.Key] = p;
                }
            if (root.TryGetValue("vinfo", out o))
                foreach (var kv in (Dictionary<string, object>)o)
                {
                    var d = (Dictionary<string, object>)kv.Value; var vi = new VehInfo();
                    vi.world = (string)d["world"]; object c; vi.crevice = d.TryGetValue("crevice", out c) && (bool)c; t.vinfo[kv.Key] = vi;
                }
            if (root.TryGetValue("consts", out o))
                foreach (var kv in (Dictionary<string, object>)o)
                {
                    var f = typeof(Tuning).GetField(kv.Key);
                    if (f == null) throw new FormatException("tuning.json: unknown const '" + kv.Key + "'");
                    if (f.FieldType == typeof(int)) f.SetValue(t, (int)(double)kv.Value); else f.SetValue(t, (double)kv.Value);
                }
            if (!t.phys.ContainsKey("mixer")) throw new FormatException("tuning.json: phys.mixer missing");
            return t;
        }

        public static Tuning Load(string path) { return FromJson(System.IO.File.ReadAllText(path)); }
    }
}
