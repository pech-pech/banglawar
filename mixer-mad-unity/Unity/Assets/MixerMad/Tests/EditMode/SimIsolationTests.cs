using System;
using NUnit.Framework;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// "Graphics can never change gameplay": the sim sees the same input on the same steps no matter how time is
    /// fed to the accumulator (slow-mo, frame rate, spikes). If these fail, the presentation layer leaked into the sim.
    /// </summary>
    public class SimIsolationTests
    {
        // A deterministic input script: gas for 3 s, brake 0.5 s, gas again; keyed to the STEP index, not to time.
        static SimInput Script(long step)
        {
            double t = step / 120.0;
            if (t < 3.0) return new SimInput { gas = 1f };
            if (t < 3.5) return new SimInput { brake = 1f };
            return new SimInput { gas = 1f };
        }

        // Run N steps through a FixedStepClock fed with the given frame pattern; returns a state hash.
        static long RunWith(Func<int, double> frameSeconds, Func<int, double> scale, int steps)
        {
            var sim = new DemoSimBackend();
            var clock = new FixedStepClock(sim.StepSeconds, 1000);
            var snap = new SimSnapshot();
            long done = 0; int frame = 0;
            while (done < steps)
            {
                clock.Add(frameSeconds(frame) * scale(frame));
                while (done < steps && clock.TryConsume()) { var inp = Script(done); sim.Step(in inp); done++; }
                frame++;
                Assert.Less(frame, 5_000_000, "clock never advanced");
            }
            sim.Capture(snap);
            return Hash(snap);
        }

        static long Hash(SimSnapshot s)
        {
            unchecked
            {
                long h = 1469598103934665603L;
                void Mix(double v) { h = (h ^ BitConverter.DoubleToInt64Bits(v)) * 1099511628211L; }
                Mix(s.chassisPos.x); Mix(s.chassisPos.y); Mix(s.chassisAngle); Mix(s.velocity.x); Mix(s.velocity.y);
                Mix(s.wheelPos[0].x); Mix(s.wheelPos[1].y);
                return h;
            }
        }

        [Test]
        public void SlowMo_DoesNotChange_TheSimResult()
        {
            const int steps = 120 * 12;
            long normal = RunWith(f => 1.0 / 60.0, f => 1.0, steps);
            long slow = RunWith(f => 1.0 / 60.0, f => (f / 30) % 2 == 0 ? 0.3 : 0.5, steps);          // 0.3x / 0.5x alternating
            long spiky = RunWith(f => f % 7 == 0 ? 0.09 : 1.0 / 144.0, f => 1.0, steps);              // frame-time spikes
            Assert.AreEqual(normal, slow, "slow-mo changed the sim");
            Assert.AreEqual(normal, spiky, "frame pacing changed the sim");
        }

        [Test]
        public void Sim_IsDeterministic()
        {
            Assert.AreEqual(RunWith(f => 1 / 60.0, f => 1.0, 3000), RunWith(f => 1 / 60.0, f => 1.0, 3000));
        }

        [Test]
        public void Interpolation_NeverWritesBack()
        {
            var a = new SimSnapshot(); var b = new SimSnapshot(); var o = new SimSnapshot();
            a.chassisPos = new UnityEngine.Vector2(0, 0); b.chassisPos = new UnityEngine.Vector2(1, 0);
            a.wheelCount = b.wheelCount = 2;
            SimSnapshot.Lerp(a, b, 0.25f, o);
            Assert.AreEqual(0.25f, o.chassisPos.x, 1e-6f);
            Assert.AreEqual(0f, a.chassisPos.x); Assert.AreEqual(1f, b.chassisPos.x);
        }

        [Test]
        public void SlowMo_Respects_Caps()
        {
            var go = new UnityEngine.GameObject("t");
            var sm = go.AddComponent<SlowMo>();
            Assert.AreEqual(1f, sm.Scale);
            Assert.AreEqual(0.12f, sm.runCapFraction, 1e-6f);
            Assert.AreEqual(1.2f, sm.jumpMaxSeconds, 1e-6f);
            Assert.AreEqual(1.0f, sm.crashMaxSeconds, 1e-6f);
            Assert.AreEqual(0.5f, sm.jumpScale, 1e-6f);
            Assert.AreEqual(0.3f, sm.crashScale, 1e-6f);
            UnityEngine.Object.DestroyImmediate(go);
        }
    }

    public class FixedStepClockTests
    {
        [Test]
        public void StepSize_IsNeverScaled()
        {
            var c = new FixedStepClock(1.0 / 120.0);
            c.Add(0.5 * (1.0 / 60.0));          // half-speed frame
            int n = 0; while (c.TryConsume()) n++;
            Assert.AreEqual(0, n);               // 4.16 ms < 8.33 ms: no step yet
            c.Add(0.5 * (1.0 / 60.0));
            while (c.TryConsume()) n++;
            Assert.AreEqual(1, n);
        }

        [Test]
        public void Guard_DropsRenderTime_NotSimSteps()
        {
            var c = new FixedStepClock(1.0 / 120.0, 24);
            c.Add(10.0);
            int n = 0; while (c.TryConsume()) n++;
            Assert.AreEqual(24, n);
        }
    }
}
