using System;
using System.IO;
using System.Linq;
using MixerMad.Sim;
using Xunit;

namespace Sim.Tests
{
    /// <summary>
    /// Respawn options for the Unity build (parity/RESPAWN-REPORT.md). The v7h behaviour is pinned (defect tests) and every option is
    /// off by default; each option test turns exactly one flag on. Scenario: mixer, Classic, level index 2 (snow), bot t0.8-none (no brake, no pitch
    /// release), which flips on the second hill, respawns at the checkpoint x=58.06 and flips again 2.05 s later.
    /// </summary>
    public class RespawnTests : IClassFixture<Fixture>
    {
        readonly Fixture fx;
        public RespawnTests(Fixture f) { fx = f; }

        Tuning Tune(params (string k, double v)[] set)
        {
            var t = Tuning.Load(Path.Combine(Paths.Data, "tuning.json"));
            foreach (var (k, v) in set) { var f = typeof(Tuning).GetField(k); if (f.FieldType == typeof(int)) f.SetValue(t, (int)v); else f.SetValue(t, v); }
            return t;
        }

        /// <summary>Drive t0.8-none until the Nth Reset event; returns the world right after that tick.</summary>
        World ToReset(Tuning t, int level, int nth, out long resetTick, out long lastCrashTick)
        {
            var w = World.Create(t, fx.Data, new WorldConfig { Mode = GameMode.Classic, LevelIndex = level, Vehicle = "mixer", MixerSkin = 0 });
            double tg = t.Phys("mixer").maxV * 0.8; int seen = 0; lastCrashTick = -1;
            for (int i = 0; i < 120 * 200; i++)
            {
                var P = w.Points; double vx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2 / t.dt;
                w.ClearEvents(); w.Step(new InputFrame(w.State == Phase.Drive && vx < tg, false));
                foreach (var e in w.Events)
                {
                    if (e.Type == SimEventType.Crash) lastCrashTick = w.StepCount;
                    if (e.Type == SimEventType.Reset && ++seen == nth) { resetTick = w.StepCount; return w; }
                }
            }
            throw new Exception("no reset #" + nth);
        }

        static double WheelClear(World w, double sx, double sy)
        {
            var g = fx_geo(w); double min = 1e9;
            for (int i = 4; i < 6; i++) min = Math.Min(min, sy + g.pts[i][1] - (i == 4 ? g.r4 : g.r5) - w.Level.GroundY(sx + g.pts[i][0]));
            return min;
        }
        static VehGeom fx_geo(World w) { return w.Geometry; }

        double MaxP0Rise(World w, double groundY, int ticks)
        {
            double max = double.MinValue;
            for (int i = 0; i < ticks; i++) { w.Step(new InputFrame(true, false)); max = Math.Max(max, w.Points[0].y - groundY); }
            return max;
        }

        [Fact]
        public void Defaults_are_off()
        {
            var t = Tuning.Load(Path.Combine(Paths.Data, "tuning.json"));
            Assert.Equal(0, t.respawnClearLift); Assert.Equal(0, t.respawnFlatBack); Assert.Equal(0.0, t.respawnGrace);
            Assert.Equal(0.7, t.crashWait); Assert.Equal(0, t.crashEarlyReturn);
        }

        [Fact]
        public void V7h_freeze_is_84_ticks_and_respawn_velocity_is_zero()
        {
            long rt, ct; var w = ToReset(Tune(), 0, 1, out rt, out ct); // flat start: no push-out
            Assert.Equal(84, rt - ct);
            // Reset tick = ResetTruck + one step(); px==x at spawn, so one gravity step is the only motion: |v| = g*dt = 0.125 m/s on y, 0 on x.
            foreach (var p in w.Points.Take(4)) { Assert.True(Math.Abs((p.x - p.px) / w.T.dt) < 0.2, "vx=" + (p.x - p.px) / w.T.dt); Assert.True(Math.Abs((p.y - p.py) / w.T.dt) < 0.5, "vy=" + (p.y - p.py) / w.T.dt); }
        }

        [Fact]
        public void V7h_defect_L2_checkpoint_respawn_buries_wheels_and_launches_truck()
        {
            long rt, ct; var w = ToReset(Tune(), 2, 1, out rt, out ct);
            Assert.True(w.Checkpoint.hit);
            Assert.True(WheelClear(w, w.LastSpawnX, w.LastSpawnY) < -0.1, "wheels start inside the bump flank");
            double rise = MaxP0Rise(w, w.Level.GroundY(w.LastSpawnX), 90);
            Assert.True(rise > 5.0, "truck is thrown up by the penetration push-out, rise=" + rise);
        }

        [Fact]
        public void ClearLift_spawns_wheels_clear_and_removes_the_launch()
        {
            long rt, ct; var w = ToReset(Tune(("respawnClearLift", 1)), 2, 1, out rt, out ct);
            Assert.True(WheelClear(w, w.LastSpawnX, w.LastSpawnY) >= 0.039);
            double rise = MaxP0Rise(w, w.Level.GroundY(w.LastSpawnX), 90);
            Assert.True(rise < 2.5, "no launch, rise=" + rise);
        }

        [Fact]
        public void ClearLift_is_a_no_op_on_flat_ground()
        {
            long a, b; var w0 = ToReset(Tune(), 0, 1, out a, out b); var w1 = ToReset(Tune(("respawnClearLift", 1)), 0, 1, out a, out b);
            Assert.Equal(w0.LastSpawnX, w1.LastSpawnX); Assert.Equal(w0.LastSpawnY, w1.LastSpawnY);
        }

        [Fact]
        public void FlatBack_moves_the_respawn_back_onto_flat_clean_ground_but_never_before_start()
        {
            long rt, ct; var w = ToReset(Tune(("respawnFlatBack", 1), ("respawnFlatMaxBack", 30)), 2, 1, out rt, out ct);
            Assert.True(w.LastSpawnX < w.Checkpoint.x); Assert.True(w.LastSpawnX >= w.T.spawnX);
            var g = w.Geometry; double lo = g.pts.Min(q => q[0]) - 0.5, hi = g.pts.Max(q => q[0]) + 0.5, gl = 1e9, gh = -1e9;
            for (double u = w.LastSpawnX + lo; u <= w.LastSpawnX + hi; u += 0.25) { double y = w.Level.GroundY(u); gl = Math.Min(gl, y); gh = Math.Max(gh, y); Assert.Equal(ZoneKind.None, w.ZoneAt(u)); }
            Assert.True(gh - gl <= 0.06 + 1e-9);
        }

        [Fact]
        public void FlatBack_with_a_tiny_search_range_falls_back_to_the_checkpoint()
        {
            long rt, ct; var w = ToReset(Tune(("respawnFlatBack", 1), ("respawnFlatMaxBack", 0)), 2, 1, out rt, out ct);
            Assert.Equal(w.Checkpoint.x, w.LastSpawnX);
        }

        [Fact]
        public void Grace_delays_the_first_crash_after_a_respawn_past_the_grace_time()
        {
            var t = Tune(("respawnGrace", 3.2)); long rt, ct; var w = ToReset(t, 2, 1, out rt, out ct);
            long crashAt = -1; double tg = t.Phys("mixer").maxV * 0.8;
            for (int i = 0; i < 120 * 12 && crashAt < 0; i++)
            {
                var P = w.Points; double vx = ((P[0].x - P[0].px) + (P[1].x - P[1].px)) / 2 / t.dt;
                w.ClearEvents(); w.Step(new InputFrame(w.State == Phase.Drive && vx < tg, false));
                if (w.Events.Any(e => e.Type == SimEventType.Crash)) crashAt = w.StepCount;
            }
            Assert.True(crashAt < 0 || crashAt - rt >= 3.2 * 120 - 1, "crash " + (crashAt - rt) + " ticks after respawn");
        }

        [Fact]
        public void V7h_baseline_second_crash_comes_2s_after_respawn_without_grace()
        {
            long r1, c1; var w = ToReset(Tune(), 2, 1, out r1, out c1);
            long r2, c2; ToReset(Tune(), 2, 2, out r2, out c2);
            Assert.InRange(c2 - r1, 200, 300); // 2.05 s
        }
    }
}
