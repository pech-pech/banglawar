using System;
using System.Collections.Generic;

namespace MixerMad.Sim
{
    /// <summary>One level-spec segment, e.g. ['bumps',14,0.4,4]. Kind plus up to 3 numbers (JS s[1], s[2], s[3]).</summary>
    public struct Seg
    {
        public string kind; public double a, b, c; public string text; // text: yard 'stop' vehicle kind
        public Seg(string k, double a, double b, double c) { kind = k; this.a = a; this.b = b; this.c = c; text = null; }
    }

    public sealed class YardDef { public string name, veh; public double par; public List<Seg> spec = new List<Seg>(); }

    /// <summary>Probe point of a vehicle body collider (local to the chassis frame).</summary>
    public struct Probe { public double lx, ly; public bool top; }

    /// <summary>Output of the HTML's vehGeom(): wheel radii, the 6 truck points, collision probes.</summary>
    public sealed class VehGeom
    {
        public string body;
        public double oy, toy, r4, r5, topY;
        public double[][] pts; // 6 x [x,y]
        public Probe[] probes;
    }

    /// <summary>Everything read from levels.json and vehicles.json.</summary>
    public sealed class GameData
    {
        public List<List<Seg>> levels = new List<List<Seg>>();
        public string[] levelWeather;
        public List<YardDef> yard = new List<YardDef>();
        public string[] dailyWeather;
        public int dinoCount = 6;
        public double[][] local; // LOCAL fallback layout
        public Dictionary<string, VehGeom[]> vehicles = new Dictionary<string, VehGeom[]>();

        public VehGeom Geom(string vehicle, int mixerSkin)
        {
            VehGeom[] g;
            if (!vehicles.TryGetValue(vehicle, out g) || g == null || g.Length == 0) return null;
            if (vehicle == "mixer") return g[((mixerSkin % g.Length) + g.Length) % g.Length];
            return g[0];
        }

        static List<Seg> ParseSpec(List<object> spec)
        {
            var r = new List<Seg>();
            foreach (var so in spec)
            {
                var s = (List<object>)so; var seg = new Seg();
                seg.kind = (string)s[0];
                if (s.Count > 1) { if (s[1] is string) seg.text = (string)s[1]; else seg.a = (double)s[1]; }
                if (s.Count > 2) seg.b = (double)s[2];
                if (s.Count > 3) seg.c = (double)s[3];
                r.Add(seg);
            }
            return r;
        }

        public static GameData FromJson(string levelsJson, string vehiclesJson)
        {
            var d = new GameData();
            var L = MiniJson.Obj(MiniJson.Parse(levelsJson));
            foreach (var lo in MiniJson.Arr(L["levels"])) d.levels.Add(ParseSpec(MiniJson.Arr(lo)));
            var wx = MiniJson.Arr(L["levelWeather"]); d.levelWeather = new string[wx.Count]; for (int i = 0; i < wx.Count; i++) d.levelWeather[i] = (string)wx[i];
            foreach (var yo in MiniJson.Arr(L["yard"]))
            {
                var y = MiniJson.Obj(yo); var yd = new YardDef();
                yd.name = (string)y["name"]; yd.veh = (string)y["veh"]; yd.par = (double)y["par"]; yd.spec = ParseSpec(MiniJson.Arr(y["spec"]));
                d.yard.Add(yd);
            }
            var dl = MiniJson.Obj(L["daily"]); var dw = MiniJson.Arr(dl["weather"]); d.dailyWeather = new string[dw.Count];
            for (int i = 0; i < dw.Count; i++) d.dailyWeather[i] = (string)dw[i];
            d.dinoCount = (int)(double)dl["dinoCount"];

            var V = MiniJson.Obj(MiniJson.Parse(vehiclesJson));
            var lc = MiniJson.Arr(V["local"]); d.local = new double[lc.Count][];
            for (int i = 0; i < lc.Count; i++) { var p = MiniJson.Arr(lc[i]); d.local[i] = new[] { (double)p[0], (double)p[1] }; }
            foreach (var kv in MiniJson.Obj(V["vehicles"]))
            {
                var arr = MiniJson.Arr(kv.Value); var gs = new VehGeom[arr.Count];
                for (int k = 0; k < arr.Count; k++)
                {
                    if (arr[k] == null) continue;
                    var g = MiniJson.Obj(arr[k]); var vg = new VehGeom();
                    vg.body = (string)g["body"]; vg.oy = (double)g["oy"]; vg.toy = g["toy"] == null ? 0 : (double)g["toy"];
                    vg.r4 = (double)g["r4"]; vg.r5 = (double)g["r5"]; vg.topY = (double)g["topY"];
                    var pl = MiniJson.Arr(g["pts"]); vg.pts = new double[pl.Count][];
                    for (int i = 0; i < pl.Count; i++) { var p = MiniJson.Arr(pl[i]); vg.pts[i] = new[] { (double)p[0], (double)p[1] }; }
                    var pr = MiniJson.Arr(g["probes"]); vg.probes = new Probe[pr.Count];
                    for (int i = 0; i < pr.Count; i++) { var q = MiniJson.Obj(pr[i]); vg.probes[i] = new Probe { lx = (double)q["lx"], ly = (double)q["ly"], top = (bool)q["top"] }; }
                    gs[k] = vg;
                }
                d.vehicles[kv.Key] = gs;
            }
            return d;
        }

        public static GameData Load(string dataDir)
        {
            return FromJson(System.IO.File.ReadAllText(System.IO.Path.Combine(dataDir, "levels.json")),
                            System.IO.File.ReadAllText(System.IO.Path.Combine(dataDir, "vehicles.json")));
        }
    }

    /// <summary>Optional level data recorded from the HTML (parity/oracle/levels.json). Lets a World use V8's exact ground points, zones, rocks
    /// and props instead of re-deriving them with .NET sin/cos (last-bit differences).</summary>
    public sealed class OracleLevel
    {
        public double[] X, Y; public List<Zone> zones = new List<Zone>(); public List<double> rocks = new List<double>();
        public List<Pt> props0 = new List<Pt>();

        public static Dictionary<string, OracleLevel> Load(string path)
        {
            var res = new Dictionary<string, OracleLevel>();
            var root = MiniJson.Obj(MiniJson.Parse(System.IO.File.ReadAllText(path)));
            foreach (var kv in MiniJson.Obj(root["levels"]))
            {
                var e = MiniJson.Obj(kv.Value); var o = new OracleLevel();
                var pts = MiniJson.Arr(e["pts"]); o.X = new double[pts.Count]; o.Y = new double[pts.Count];
                for (int i = 0; i < pts.Count; i++) { var q = MiniJson.Arr(pts[i]); o.X[i] = (double)q[0]; o.Y[i] = (double)q[1]; }
                foreach (var zo in MiniJson.Arr(e["zones"]))
                {
                    var z = MiniJson.Arr(zo); string k = (string)z[0];
                    o.zones.Add(new Zone { kind = k == "mud" ? ZoneKind.Mud : k == "puddle" ? ZoneKind.Puddle : k == "slush" ? ZoneKind.Slush : k == "sticky" ? ZoneKind.Sticky : ZoneKind.Bouncy, x0 = (double)z[1], x1 = (double)z[2] });
                }
                foreach (var r in MiniJson.Arr(e["rocks"])) o.rocks.Add(r is double ? (double)r : (double)MiniJson.Arr(r)[0]);
                foreach (var po in MiniJson.Arr(e["props0"]))
                {
                    var q = MiniJson.Arr(po); string k = (string)q[0];
                    o.props0.Add(new Pt { kind = k == "cone" ? PropKind.Cone : k == "barrel" ? PropKind.Barrel : k == "pipe" ? PropKind.Pipe : PropKind.Lump,
                        x = (double)q[1], y = (double)q[2], px = (double)q[1], py = (double)q[2], r = (double)q[3], m = (double)q[4], alive = true });
                }
                res[kv.Key] = o;
            }
            return res;
        }
    }
}
