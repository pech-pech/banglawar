using System;
using System.Collections.Generic;

namespace MixerMad.Sim
{
    public enum ZoneKind { None = 0, Mud, Puddle, Slush, Sticky, Bouncy }

    public sealed class Zone { public ZoneKind kind; public double x0, x1; }
    public sealed class Rock { public double x; public bool hit; }

    /// <summary>Contact result of Nearest(): penetration depth, push-out normal and the mover that was hit (null = ground).</summary>
    public struct Hit
    {
        public bool ok; public double pen, nx, ny; public Mover m;
    }

    /// <summary>Yard stop (mid-level action trigger).</summary>
    public sealed class Stop
    {
        public string kind; public double x; public bool done;
        public bool hasPit; public double pitX0, pitX1, pitY;
        public FillMover fill;
    }
    public sealed class Kill
    {
        public double x0, x1, y; public string msg; public FillMover ok; public double okFrac; // ok: killed unless fill.h >= fill.depth*okFrac
    }

    /// <summary>Level geometry. Ground is a polyline (X[i],Y[i]); Movers add solid segments.</summary>
    public sealed class Level
    {
        public double[] X, Y; public int N;
        public double flagX, edgeX, gapL, gapR, gapBottom, gapTop, minY;
        public List<Zone> zones = new List<Zone>();
        public List<double[]> jumps;       // [ramp, land] x of each jump (v7j zone clearance); null for yard
        public List<Rock> rocks;           // null when none (JS L.rocks=null)
        public List<Mover> movers;         // null for classic levels
        public List<Stop> stops;           // yard only
        public List<Kill> kills;           // yard only

        /// <summary>JS groundY(x).</summary>
        public double GroundY(double x)
        {
            for (int i = 1; i < N; i++)
            {
                if (X[i] >= x)
                {
                    double ax = X[i - 1], ay = Y[i - 1], bx = X[i], by = Y[i];
                    double t = (x - ax) / JsMath.Or(bx - ax, 1.0);
                    return ay + (by - ay) * t;
                }
            }
            return 0;
        }
    }

    // ---------------- yard movers ----------------
    public abstract class Mover
    {
        public bool solid = true;
        public double[] segs = new double[4]; public int segCount;  // flat [ax,ay,bx,by] per segment
        public bool touched;
        public bool hasReset, hasContact;
        public double g = 15;
        public virtual void Reset() { }
        public virtual void OnContact(Pt p) { }
        public abstract void Update(double dt);
    }

    public sealed class PlankMover : Mover
    {
        public double x0, x1, y, dy, vy, rot, t = -1;
        public PlankMover(double x0, double x1, double y, double g) { this.x0 = x0; this.x1 = x1; this.y = y; this.g = g; hasReset = true; hasContact = true; }
        public override void Reset() { solid = true; dy = 0; vy = 0; rot = 0; t = -1; Update(0); }
        public override void OnContact(Pt p) { if (t < 0) t = 0; }
        public override void Update(double dt)
        {
            if (t >= 0) t += dt;
            if (t > 0.55) { vy -= g * dt; dy += vy * dt; rot += dt * 0.8; }
            if (dy < -6) solid = false;
            double sh = (t >= 0 && t < 0.55) ? Math.Sin(t * 60) * 0.04 : 0;
            double cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 - 0.04, c = Math.Cos(rot), s = Math.Sin(rot);
            segs[0] = cx - hw * c; segs[1] = y + dy + sh - hw * s; segs[2] = cx + hw * c; segs[3] = y + dy + sh + hw * s; segCount = 1;
        }
    }

    public sealed class SeesawMover : Mover
    {
        public double px, py, h, ang, w, torq; readonly double rest = 0.3;
        public SeesawMover(double px, double gy, double h)
        {
            this.px = px; this.h = h; py = gy + Math.Sin(rest) * h - 0.05; ang = rest; hasReset = true; hasContact = true;
        }
        public override void Reset() { ang = rest; w = 0; torq = 0; Update(0); }
        public override void OnContact(Pt p) { torq += -(p.x - px) * (p.im != 0 ? 1 / p.im : 1); }
        public override void Update(double dt)
        {
            double alpha = torq * 0.9 - w * 1.8 + (torq == 0 ? (rest - ang) * 0.6 : 0); torq = 0;
            w += alpha * dt; ang += w * dt;
            if (ang > rest) { ang = rest; w = Math.Min(0, w); }
            if (ang < -rest) { ang = -rest; w = Math.Max(0, w); }
            double c = Math.Cos(ang), s = Math.Sin(ang);
            segs[0] = px - h * c; segs[1] = py - h * s; segs[2] = px + h * c; segs[3] = py + h * s; segCount = 1;
        }
    }

    public sealed class LiftMover : Mover
    {
        public double x0, x1, gy, amp, t, y;
        public LiftMover(double x0, double x1, double gy, double amp) { this.x0 = x0; this.x1 = x1; this.gy = gy; this.amp = amp; y = gy; }
        public override void Update(double dt)
        {
            t += dt; double T = 6; y = gy + amp * (1 - Math.Cos(2 * Math.PI * t / T)) / 2;
            segs[0] = x0; segs[1] = y; segs[2] = x1; segs[3] = y; segCount = 1;
        }
    }

    /// <summary>Dirt fill in the yard hole (raised by the dozer action). No reset in the JS: h persists across crashes.</summary>
    public sealed class FillMover : Mover
    {
        public double x0, x1, y0, depth, h;
        public FillMover(double x0, double x1, double y0, double depth) { this.x0 = x0; this.x1 = x1; this.y0 = y0; this.depth = depth; segCount = 0; }
        public override void Update(double dt)
        {
            if (h > 0.05) { segs[0] = x0; segs[1] = y0 + h; segs[2] = x1; segs[3] = y0 + h; segCount = 1; } else segCount = 0;
        }
    }

    /// <summary>Beam laid across the pit by the crane action.</summary>
    public sealed class BeamMover : Mover
    {
        public BeamMover(double L0, double R0, double gy)
        {
            segs = new double[12];
            Set(0, L0 - 0.8, gy - 0.15, L0, gy); Set(1, L0, gy, R0, gy); Set(2, R0, gy, R0 + 0.8, gy - 0.15); segCount = 3;
        }
        void Set(int i, double ax, double ay, double bx, double by) { segs[i * 4] = ax; segs[i * 4 + 1] = ay; segs[i * 4 + 2] = bx; segs[i * 4 + 3] = by; }
        public override void Update(double dt) { }
    }
}
