using System;
using System.Collections.Generic;
using System.Globalization;

namespace MixerMad.Sim
{
    /// <summary>Per-vehicle physics row (the JS PHYS table). gt = ground torque multiplier (JS: phys().gt||1).</summary>
    public sealed class VehPhys
    {
        public double acc, maxV, air, tol, gt = 1.0;
        public double[] w = new double[6];
    }

    public sealed class VehInfo { public string world = "mixer"; public bool crevice; }

    /// <summary>
    /// Every tuning number of the sim. Loaded from Sim/Data/tuning.json. Field names under "consts" are matched
    /// to the public double fields below; the tables (phys, parK, wxGrip, zoneGrip, vinfo) are explicit.
    /// Defaults equal the v7h values so a missing key never changes feel.
    /// </summary>
    public sealed class Tuning
    {
        // globals (JS: const G = 15, DT = 1/120, ITER = 8; WHEEL_R = 0.5)
        public double g = 15, dt = 1.0 / 120, wheelR = 0.5;
        public int iter = 8;
        public double holeMax = 1.8;

        public Dictionary<string, VehPhys> phys = new Dictionary<string, VehPhys>();
        public Dictionary<string, double> parK = new Dictionary<string, double>();
        public Dictionary<string, double> wxGrip = new Dictionary<string, double>();
        public Dictionary<string, VehInfo> vinfo = new Dictionary<string, VehInfo>();

        // ---- consts (hand-listed numbers that live inside step()/tick() in the JS) ----
        public double damping = 0.999;            // verlet velocity damping
        public double stopDamp = 0.96;            // 'stopping' state extra x damping
        public double coastDecel = 1.2;           // engine braking when neither gas nor brake
        public double brakeFast = -26;            // brake when moving forward faster than brakeVThresh
        public double brakeVThresh = 0.5;
        public double brakeSlow = -11;            // gentle reverse braking
        public double reverseMaxSpeed = 7;        // v > -7
        public double reverseMinX = 0.5;          // rear x must be > 0.5 to reverse
        public double gripGasBonus = 3;           // grip limit with gas = acc + 3
        public double gripNoGas = 26;             // grip limit otherwise
        public double stickyPull = 7;
        public double rockImpulse = 2.6;
        public double rockReach = 0.35;
        public double easeLen = 1.5, easeTail = 0.3;
        public double dragPuddle = 5, dragSlush = 8, dragSticky = 0, dragMudBase = 3, dragMudRamp = 3.5, dragMudRampT = 40;
        public double gripMud = 0.7, gripPuddle = 0.85, gripSlush = 0.8, gripSticky = 1.4;
        public double groundTorque = 0.8, omegaMax = 4.5;
        public double bounceMinVn = -0.5, bounceRestitution = 0.85, bounceMinOut = 6, bounceWheelMinR = 0.3;
        public double leftWallX = -1.5, startSlowX = 3, startSlowStop = 0.2, startSlowFloor = 0.85;
        public double upsideUy = -0.2, tippedAng = 1.2, tippedFactor = 0.4, crashDecay = 2, fallDepth = 15;
        public double snowRate = 0.035, snowMass = 0.8, snowVmax = 0.15, snowLandMin = 0.15;
        public double stopSpeed = 0.3, stopTime = 0.4;
        public double spawnX = 5, spawnLift = 1.2, crashWait = 0.7;
        public double landAirT = 0.25, landVy = -2, loadSpillVy = 6.5, loadSpillK = 6;
        public double wheelieRel = 0.45, wheelieGrace = 0.6, wheelieT = 0.3, wheelieSpill = 10, wheelieReset = 0.25;
        public double probeR = 0.04, probeOffset = 0.1, probeT0 = 0.1, roofDot = -0.4, skidNy = 0.1, skidMaxPen = 0.2;
        public int probeIters = 3;
        public double propDamp = 0.995, propBudgetMax = 1.5, propBudgetRegen = 3, propNear = 30, propLumpKillV = 4;
        public double propBounce = 1.35, propLift = 0.8, propDvCap = 0.3, propMassDiv = 6, propGroundFric = 0.02;
        public double flagOffset = 3, platformLen = 12, creviceDepth = 3.6, creviceGap = 5.5, creviceSlant = 0.25;
        public double cpFrom = 0.42, cpTo = 0.62, cpStep = 0.5, cpSpan = 2.5;
        public double yardStopRadius = 1.3, yardStopSpeed = 0.6, yardBrakeDamp = 0.94;
        public double bodyLinkK = 1, wheelLinkK = 0.45;
        public int maxCatchUp = 8;
        // behaviour switches (v7h = 0/0). v7i: crash() returns early (rest of the drive block skipped) and startLevel resets propBudget.
        public int crashEarlyReturn = 0, resetPropBudgetOnStartLevel = 0;

        public VehPhys Phys(string v) { VehPhys p; return phys.TryGetValue(v, out p) ? p : phys["mixer"]; }

        public static Tuning FromJson(string json)
        {
            var root = (Dictionary<string, object>)MiniJson.Parse(json);
            var t = new Tuning();
            object o;
            if (root.TryGetValue("g", out o)) t.g = (double)o;
            if (root.TryGetValue("dt", out o)) t.dt = (double)o;
            if (root.TryGetValue("iter", out o)) t.iter = (int)(double)o;
            if (root.TryGetValue("wheelR", out o)) t.wheelR = (double)o;
            if (root.TryGetValue("holeMax", out o)) t.holeMax = (double)o;
            if (root.TryGetValue("phys", out o))
                foreach (var kv in (Dictionary<string, object>)o)
                {
                    var d = (Dictionary<string, object>)kv.Value; var p = new VehPhys();
                    p.acc = (double)d["acc"]; p.maxV = (double)d["maxV"]; p.air = (double)d["air"]; p.tol = (double)d["tol"];
                    object gt; p.gt = d.TryGetValue("gt", out gt) ? (double)gt : 1.0;
                    var w = (List<object>)d["w"]; for (int i = 0; i < 6; i++) p.w[i] = (double)w[i];
                    t.phys[kv.Key] = p;
                }
            if (root.TryGetValue("parK", out o)) foreach (var kv in (Dictionary<string, object>)o) t.parK[kv.Key] = (double)kv.Value;
            if (root.TryGetValue("wxGrip", out o)) foreach (var kv in (Dictionary<string, object>)o) t.wxGrip[kv.Key] = (double)kv.Value;
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
