using System;
using System.Collections.Generic;

namespace MixerMad.Sim
{
    public sealed partial class World
    {
        /// <summary>One tick of the sim: exactly the JS tick(DT) with the given input. Call at a fixed 120 Hz; never pass frame time.</summary>
        public void Step(InputFrame inp) { Tick(DT, inp); }

        /// <summary>JS tick(dt) (accumulator loop included). With dt == DT this runs one physics step, except while crashed (frozen).</summary>
        public void Tick(double dt, InputFrame inp)
        {
            input = inp; stepIndex++;
            if (inp.Tap && state == Phase.Action) ActionTap();
            if (state == Phase.Crashed)
            {
                crashWait -= dt;
                if (crashWait <= 0) { ResetTruck(true); Emit(SimEventType.Reset, P[0].x, P[0].y, cp != null && cp.hit ? 1 : 0, "reset"); }
            }
            if (state == Phase.Drive) { run_t += dt; if (input.Brake) run_brake = true; }
            if (mode == GameMode.Yard && (state == Phase.Drive || state == Phase.Action || state == Phase.Crashed || state == Phase.Stopping)) yardT += dt;
            drumSpin += dt * 2.5;
            if (state == Phase.Parked || state == Phase.Done) return; // finale (pour / toys / result) belongs to the presentation layer
            if (state == Phase.Action) { UpdAction(dt); RunSteps(dt); }
            else if (state != Phase.Crashed) RunSteps(dt);
        }

        void RunSteps(double dt)
        {
            acc += dt; int n = 0;
            while (acc >= DT && n < T.maxCatchUp) { StepCore(); acc -= DT; n++; }
            if (n == T.maxCatchUp) acc = 0;
        }

        // ------------------------------------------------------------------ the JS step()
        void StepCore()
        {
            physSteps++;
            bool gas = state == Phase.Drive && input.Gas, brake = state == Phase.Drive && input.Brake;
            // integrate
            for (int i = 0; i < P.Length; i++)
            {
                Pt p = P[i]; double vx = (p.x - p.px) * T.damping, vy = (p.y - p.py) * T.damping;
                p.px = p.x; p.py = p.y; p.x += vx; p.y += vy - G * DT * DT;
            }
            if (state == Phase.Stopping) { for (int i = 0; i < P.Length; i++) { Pt p = P[i]; p.px = p.x - (p.x - p.px) * T.stopDamp; } }
            if (brake) YardBrakeAssist();
            // drive on contacting wheels
            double ax = P[1].x - P[0].x, ay = P[1].y - P[0].y, al = JsMath.Hypot(ax, ay); double ux = -ay / al, uy = ax / al;
            bool grounded = false;
            VehPhys ph = T.Phys(vehicle);
            for (int wi = 4; wi < 6; wi++)
            {
                Pt w = P[wi]; if (!w.c.ok) continue;
                grounded = true;
                double tx = w.c.ny, ty = -w.c.nx;
                double v = ((w.x - w.px) * tx + (w.y - w.py) * ty) / DT;
                double a = 0;
                ZoneKind z = ZoneAt(w.x); double vmax = ph.maxV * (1 - T.snowVmax * snow);
                if (gas && v < vmax) a = ph.acc;
                if (brake) a = v > T.brakeVThresh ? T.brakeFast : ((v > -T.reverseMaxSpeed && Math.Min(P[0].x, P[3].x) > T.reverseMinX) ? T.brakeSlow : 0);
                if (!gas && !brake) a = -JsMath.Sign(v) * Math.Min(Math.Abs(v) / DT, T.coastDecel * GripK(z));
                double gl = (gas ? ph.acc + T.gripGasBonus : T.gripNoGas) * GripK(z); a = Math.Max(-gl, Math.Min(gl, a));
                Zone zz = null;
                if (z != ZoneKind.None) { var zs = L.zones; for (int i = 0; i < zs.Count; i++) if (w.x >= zs[i].x0 && w.x <= zs[i].x1) { zz = zs[i]; break; } }
                double ease = zz != null ? Math.Min(Math.Min(1, (w.x - zz.x0) / T.easeLen), (zz.x1 - w.x) / T.easeLen + T.easeTail) : 1;
                double dragBase = z == ZoneKind.Puddle ? T.dragPuddle : z == ZoneKind.Mud ? T.dragMudBase + T.dragMudRamp * Math.Min(1, levelT / T.dragMudRampT)
                    : z == ZoneKind.Slush ? T.dragSlush : z == ZoneKind.Sticky ? T.dragSticky : 0;
                double drag = dragBase * ease;
                if (drag != 0) a -= JsMath.Sign(v) * Math.Min(Math.Abs(v) / DT, drag);
                if (z == ZoneKind.Sticky) { w.px += w.c.nx * T.stickyPull * DT * DT; w.py += w.c.ny * T.stickyPull * DT * DT; }
                if (L.rocks != null)
                    for (int i = 0; i < L.rocks.Count; i++)
                    {
                        Rock r = L.rocks[i];
                        if (!r.hit && Math.Abs(w.x - r.x) < T.rockReach) { r.hit = true; w.py -= T.rockImpulse * DT; Emit(SimEventType.RockHit, w.x, w.y, 0.5, "rock"); }
                    }
                for (int i = 0; i < P.Length; i++) { Pt q = P[i]; q.px -= tx * a * 0.5 * DT * DT; q.py -= ty * a * 0.5 * DT * DT; }
            }
            // air / reaction torque: gas = nose up, brake = nose down
            double omega = (((P[1].x - P[1].px) - (P[0].x - P[0].px)) * ux + ((P[1].y - P[1].py) - (P[0].y - P[0].py)) * uy) / DT / al;
            double tq = 0; if (gas) tq = 1; if (brake) tq = -1;
            if (tq != 0)
            {
                double strength = grounded ? T.groundTorque * ph.gt : ph.air;
                if (tq * omega < T.omegaMax)
                {
                    double k = tq * strength * DT * DT;
                    P[1].px -= ux * k; P[1].py -= uy * k; P[2].px -= ux * k; P[2].py -= uy * k;
                    P[0].px += ux * k; P[0].py += uy * k; P[3].px += ux * k; P[3].py += uy * k;
                }
            }
            // constraints + collisions
            for (int i = 0; i < P.Length; i++) P[i].c = default(Hit);
            roofHit = false; bodyHit = false;
            for (int it = 0; it < ITER; it++)
            {
                for (int ci = 0; ci < C.Length; ci++)
                {
                    Link c = C[ci]; Pt a2 = P[c.a], b2 = P[c.b]; double dx = b2.x - a2.x, dy = b2.y - a2.y, d = JsMath.Or(JsMath.Hypot(dx, dy), 1e-9);
                    double diff = (d - c.len) / d * c.k, sa = a2.im / (a2.im + b2.im), sb = 1 - sa;
                    a2.x += dx * diff * sa; a2.y += dy * diff * sa; b2.x -= dx * diff * sb; b2.y -= dy * diff * sb;
                }
                for (int i = 0; i < P.Length; i++) if (!P[i].nc) Collide(P[i], true);
                if (geo != null && it >= ITER - T.probeIters) ProbeBody();
            }
            StepProps();
            if (L.movers != null) for (int i = 0; i < L.movers.Count; i++) L.movers[i].Update(DT);
            for (int i = 0; i < P.Length; i++) { Pt p = P[i]; if (p.x < T.leftWallX) { p.x = T.leftWallX; if (p.px < p.x) p.px = p.x; } }
            {
                double mx = Math.Min(P[0].x, P[3].x);
                if (mx < T.startSlowX)
                {
                    double k = mx < T.startSlowStop ? 0 : Math.Max(T.startSlowFloor, mx / T.startSlowX);
                    for (int i = 0; i < P.Length; i++) { Pt p = P[i]; if (p.x < p.px) p.px = p.x - (p.x - p.px) * k; }
                }
            }
            for (int k = 0; k < 2; k++) { Pt w = P[4 + k]; wheelAng[k] -= (w.x - w.px) / WHEEL_R; }
            JuiceStep(grounded);
            // crash: roof touches ground, or upside down too long
            bool upsideDown = uy < T.upsideUy; bool tipped = Math.Abs(Math.Atan2(P[1].y - P[0].y, P[1].x - P[0].x)) > T.tippedAng;
            if (state == Phase.Drive)
            {
                if ((geo != null ? roofHit : (P[2].c.ok || P[3].c.ok)) || upsideDown) crashT += DT;
                else if (tipped && ((geo != null ? bodyHit : (P[0].c.ok || P[1].c.ok)) || P[4].c.ok || P[5].c.ok)) crashT += DT * T.tippedFactor;
                else crashT = Math.Max(0, crashT - DT * T.crashDecay);
                if (P[0].y < L.minY - T.fallDepth) Crash("Fell off!");
                else if (KillHit()) { }
                else if (crashT > ph.tol) Crash(upsideDown ? "Flipped!" : "Roof hit!");
                if (T.crashEarlyReturn != 0 && state == Phase.Crashed) return;
                levelT += DT;
                if (isSnow) { snow = Math.Min(1, snow + DT * T.snowRate); if (((int)(levelT * 120)) % 60 == 0) ApplyMass(); }
                double cx = (P[0].x + P[1].x) / 2;
                if (L.stops != null)
                {
                    double v = Math.Abs(P[0].x - P[0].px) / DT;
                    for (int i = 0; i < L.stops.Count; i++)
                    {
                        Stop st = L.stops[i];
                        if (!st.done && Math.Abs(cx - st.x) < T.yardStopRadius && v < T.yardStopSpeed && (P[4].c.ok || P[5].c.ok)) { StartAction(st); break; }
                    }
                }
                if (cp != null && !cp.hit && cx > cp.x) { cp.hit = true; cp.load = load; Emit(SimEventType.Checkpoint, cx, P[0].y, load, "checkpoint"); }
                if (IsLoad())
                {
                    double ang = Math.Atan2(P[1].y - P[0].y, P[1].x - P[0].x), x4 = P[4].x, x5 = P[5].x;
                    double slope = Math.Atan2(L.GroundY(x5) - L.GroundY(x4), JsMath.Or(x5 - x4, 1.0)), rel = Math.Abs(ang - slope);
                    bool one = P[4].c.ok != P[5].c.ok;
                    if (one && rel > T.wheelieRel && levelT - landT > T.wheelieGrace) wheelT += DT; else wheelT = 0;
                    if (wheelT > T.wheelieT && !wheelie) { wheelie = true; Emit(SimEventType.Wheelie, cx, P[0].y, 0, "wheelie"); Spill(T.wheelieSpill); }
                    else if (rel < T.wheelieReset && P[4].c.ok && P[5].c.ok) wheelie = false;
                }
                if (cx > L.flagX) { state = Phase.Stopping; finishT = 0; Emit(SimEventType.FinishLine, cx, P[0].y, run_t, "finish line"); }
            }
            else if (state == Phase.Stopping)
            {
                finishT += DT; double v = Math.Abs(P[0].x - P[0].px) / DT;
                if (finishT > T.stopTime && v < T.stopSpeed) { state = Phase.Parked; OnParked(); }
            }
        }

        bool KillHit()
        {
            if (L.kills == null) return false;
            double c = (P[0].x + P[1].x) / 2, cy = (P[0].y + P[1].y) / 2;
            for (int i = 0; i < L.kills.Count; i++)
            {
                Kill k = L.kills[i];
                if (c > k.x0 && c < k.x1 && cy < k.y && !(k.ok != null && k.ok.h >= k.ok.depth * k.okFrac)) { Crash(k.msg); return true; }
            }
            return false;
        }

        void JuiceStep(bool grounded)
        {
            double vy = ((P[0].y - P[0].py) + (P[1].y - P[1].py)) / 2 / DT;
            if (!grounded) airT += DT;
            else
            {
                if (airT > T.landAirT) landT = levelT;
                if (airT > T.landAirT && vy < T.landVy)
                {
                    double k = Math.Min(1, -vy / 14);
                    Emit(SimEventType.Land, TruckX(), P[0].y, k, "land");
                    if (snow > T.snowLandMin) { snow = 0; ApplyMass(); }
                    if (IsLoad() && -vy > T.loadSpillVy) Spill((-vy - T.loadSpillVy) * T.loadSpillK);
                }
                airT = 0;
            }
        }

        void Crash(string reason)
        {
            run_crashes++; if (mode == GameMode.Yard) yardCrashes++;
            if (act != null) act = null;
            state = Phase.Crashed; crashReason = reason ?? "Flipped!"; crashWait = T.crashWait;
            Emit(SimEventType.Crash, TruckX(), P[0].y, run_crashes, crashReason);
        }

        void Spill(double n)
        {
            if (n <= 0 || load <= 0) return;
            load = Math.Max(0, load - n);
            Emit(SimEventType.Spill, TruckX(), P[0].y, n, "spill");
        }

        // ------------------------------------------------------------------ finish
        public double ParTime()
        {
            double up = 0;
            if (mode == GameMode.Yard) return Data.yard[levelIdx].par;
            for (int i = 1; i < L.N; i++)
            {
                if (L.X[i] < 5 || L.X[i] > L.flagX) continue;
                double dy = L.Y[i] - L.Y[i - 1]; if (dy > 0) up += dy;
            }
            double pk; if (!T.parK.TryGetValue(vehicle, out pk)) pk = 0;
            return JsMath.Round((L.flagX - 5) / (T.Phys(vehicle).maxV * JsMath.Or(pk, 0.62)) + 0.3 * up + 2);
        }
        public int LoadStars() { return load >= 90 ? 3 : load >= 60 ? 2 : 1; }
        public int RaceStars()
        {
            int n = (run_crashes == 0 ? 1 : 0) + (!run_brake ? 1 : 0) + (run_t <= ParTime() ? 1 : 0);
            n = Math.Max(1, n); if (IsLoad()) n = Math.Min(n, LoadStars()); return n;
        }
        void OnParked()
        {
            if (mode == GameMode.Yard)
            {
                double par = Data.yard[levelIdx].par; stars = (yardCrashes == 0 && yardT <= par) ? 3 : yardCrashes <= 1 ? 2 : 1;
                state = Phase.Done;
            }
            else stars = RaceStars();
            Emit(SimEventType.Parked, TruckX(), P[0].y, run_t, "parked");
        }

        // ------------------------------------------------------------------ yard actions
        static double Meter(double t, double period) { return (1 - Math.Cos(2 * Math.PI * t / period)) / 2; }

        void YardBrakeAssist()
        {
            if (mode != GameMode.Yard || L.stops == null) return;
            double cx = TruckX(), vx = (P[0].x - P[0].px + P[1].x - P[1].px) / 2; if (vx <= 0) return;
            for (int i = 0; i < L.stops.Count; i++)
            {
                Stop st = L.stops[i];
                if (!st.done && st.kind == "crane" && cx > st.x - 1.5 && cx < st.x + 2)
                {
                    for (int k = 0; k < P.Length; k++) { Pt p = P[k]; p.px = p.x - (p.x - p.px) * T.yardBrakeDamp; }
                    return;
                }
            }
        }

        void StartAction(Stop st)
        {
            state = Phase.Action; act = new ActionState { st = st, t = 0, mt = 0, pushes = 0, wait = 0 };
            Emit(SimEventType.ActionStart, TruckX(), P[0].y, 0, st.kind);
        }

        /// <summary>Gauge value 0..1 the HTML shows during dozer pushes (Meter(mt, 1.0)); use it for the UI.</summary>
        public double ActionMeter() { return act == null ? 0 : Meter(act.mt, 1.0); }

        void YardHook(out double hx, out double hy)
        {
            double tipX = TruckX() + 4.4, tipY = L.GroundY(TruckX()) + 1.15 + 4.6, th = Math.Sin(act.t * 1.6) * 0.6;
            hx = tipX + Math.Sin(th) * 2.6; hy = tipY - Math.Cos(th) * 2.6;
        }

        void ActionTap()
        {
            if (act == null) return; ActionState a = act; Stop st = a.st;
            if (st.kind == "crane" && a.beam == null && a.wait <= 0)
            {
                double hx, hy; YardHook(out hx, out hy);
                a.beam = new Beam { x = hx, y = hy - 0.4, vy = 0, len = (st.pitX1 - st.pitX0) + 2.0, landed = false };
            }
            if (st.kind == "dozer" && a.wait <= 0)
            {
                double q = Meter(a.mt, 1.0); a.pushes++; a.wait = 0.6;
                st.fill.h = Math.Min(st.fill.depth, st.fill.h + st.fill.depth * (0.12 + 0.3 * q));
            }
        }

        void UpdAction(double dt)
        {
            ActionState a = act; if (a == null) return;
            a.t += dt; a.mt += dt; if (a.wait > 0) a.wait -= dt; Stop st = a.st;
            if (st.kind == "dozer")
            {
                if (st.fill.h >= st.fill.depth * 0.8 && a.wait <= 0) { st.fill.h = st.fill.depth - 0.02; st.fill.Update(0); EndAction(); }
            }
            if (st.kind == "crane" && a.beam == null)
            {
                double dx = st.x - TruckX();
                if (Math.Abs(dx) > 0.005) { double m = JsMath.Sign(dx) * Math.Min(Math.Abs(dx), 2.5 * dt); for (int i = 0; i < P.Length; i++) { P[i].x += m; P[i].px += m; } }
            }
            if (st.kind == "crane" && a.beam != null && !a.beam.landed)
            {
                Beam b = a.beam; b.vy -= G * dt; b.y += b.vy * dt; double gy = st.pitY + 0.06;
                if (b.y <= gy)
                {
                    double L0 = b.x - b.len / 2, R0 = b.x + b.len / 2;
                    if (L0 <= st.pitX0 - 0.25 && R0 >= st.pitX1 + 0.25)
                    {
                        b.y = gy; b.landed = true; L.movers.Add(new BeamMover(L0, R0, gy)); EndAction();
                    }
                    else if (b.y < gy - 10) { a.beam = null; a.wait = 0.8; }
                }
            }
        }

        void EndAction()
        {
            act.st.done = true; act = null; state = Phase.Drive;
            Emit(SimEventType.ActionEnd, TruckX(), P[0].y, 0, "action done");
        }
    }
}
