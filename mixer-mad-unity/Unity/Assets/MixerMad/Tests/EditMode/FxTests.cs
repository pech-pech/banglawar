using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// FX pack and living world (P2 polish fixes 6 and 10). The teleport rule is the main one: after a crash respawn
    /// or an R restart, no particle, track segment or carry-over may link the crash spot to the respawn spot.
    /// </summary>
    public class FxTests
    {
        /// <summary>Drives forward 0.1 m per step on flat ground; on step RespawnAt jumps back to x = 2 and emits Respawn.</summary>
        sealed class JumpBackBackend : ISimBackend
        {
            public const int RespawnAt = 240;
            public int steps; public float x = 40f;
            readonly Queue<SimEvent> _ev = new Queue<SimEvent>();
            public double StepSeconds => 1.0 / 120.0;
            public Vector2[] RoadLine => new[] { new Vector2(-10, 0), new Vector2(500, 0) };
            public byte[] RoadSurface => null;
            public float FinishX => 400f;
            public void Reset() { steps = 0; x = 2f; }
            public void Step(in SimInput input)
            {
                steps++; x += 0.1f;
                if (steps == RespawnAt) { x = 2f; _ev.Enqueue(new SimEvent { kind = SimEventKind.Respawn }); }
            }
            public void Capture(SimSnapshot s)
            {
                s.chassisPos = new Vector2(x, 0f); s.chassisAngle = 0f; s.wheelCount = 2; s.grounded = true;
                s.velocity = new Vector2(12f, 0f); s.throttle = 1f;
                s.wheelPos[0] = new Vector2(x - 1.2f, 0.5f);
                s.wheelPos[1] = new Vector2(x + 1.1f, 0.5f);
            }
            public bool TryDequeueEvent(out SimEvent e) { if (_ev.Count > 0) { e = _ev.Dequeue(); return true; } e = default; return false; }
        }

        readonly List<Object> _made = new List<Object>();
        GameObject Make(string n) { var g = new GameObject(n); _made.Add(g); return g; }

        [SetUp] public void SetUp() { MMSettings.CalmMotionOverride = false; FxToggles.SetAll(true); }
        [TearDown]
        public void TearDown()
        {
            MMSettings.CalmMotionOverride = null; FxToggles.SetAll(true);
            foreach (var o in _made) if (o) Object.DestroyImmediate(o);
            _made.Clear();
        }

        SimDriver NewDriver(ISimBackend be) { var d = Make("Sim").AddComponent<SimDriver>(); d.InitForTests(be); return d; }

        // ------------------------------------------------------------------ TrackBuffer (plain class)
        [Test]
        public void Tracks_Clear_ForgetsTheLastPoint_SoTheRespawnNeverJoinsTheCrashSpot()
        {
            var b = new TrackBuffer(0.5f, 6f);
            for (int i = 0; i < 20; i++) b.Add(new Vector3(40f + i * 0.6f, 0f, -0.8f), i * 0.05f);
            Assert.Greater(b.Count, 0);
            b.Clear();
            Assert.AreEqual(0, b.Count); Assert.IsFalse(b.HasLast);
            b.Add(new Vector3(41.0f, 0f, -0.8f), 2f);              // close to the old strip, but the old strip is gone
            b.Add(new Vector3(41.6f, 0f, -0.8f), 2.05f);
            Assert.AreEqual(1, b.Count);
            Assert.AreEqual(41.0f, b[0].a.x, 1e-4f);
        }

        [Test]
        public void Tracks_FarJump_StartsANewStrip_InsteadOfALongSegment()
        {
            var b = new TrackBuffer(0.5f, 6f);
            b.Add(new Vector3(80f, 0f, 0f), 0f); b.Add(new Vector3(80.6f, 0f, 0f), 0.05f);
            b.Add(new Vector3(2f, 1.5f, 0f), 0.1f);                  // teleport without a Clear (second guard)
            b.Add(new Vector3(2.6f, 1.5f, 0f), 0.15f);
            Assert.AreEqual(2, b.Count);
            Assert.Less(b.LongestSegment(), TrackBuffer.MaxJoin);
        }

        [Test]
        public void Tracks_AreCappedAt64Segments_AndFadeOut()
        {
            var b = new TrackBuffer(0.5f, 6f);
            for (int i = 0; i < 300; i++) b.Add(new Vector3(i * 0.6f, 0f, 0f), i * 0.01f);
            Assert.AreEqual(TrackBuffer.MaxSegments, b.Count);
            Assert.AreEqual(1f, b.Fade(0f), 1e-4f);
            Assert.AreEqual(0f, b.Fade(6f), 1e-4f);
            b.Expire(100f);
            Assert.AreEqual(0, b.Count);
        }

        [Test]
        public void Tracks_LiftingAWheel_LeavesAGap()
        {
            var b = new TrackBuffer(0.5f, 6f);
            b.Add(new Vector3(0f, 0f, 0f), 0f); b.Add(new Vector3(0.6f, 0f, 0f), 0.1f);
            b.Lift();
            b.Add(new Vector3(2.0f, 0f, 0f), 0.2f); b.Add(new Vector3(2.6f, 0f, 0f), 0.3f);
            Assert.AreEqual(2, b.Count);
            Assert.AreEqual(2.0f, b[1].a.x, 1e-4f, "the strip after the jump joined the one before it");
        }

        // ------------------------------------------------------------------ components across a real SimDriver teleport
        [Test]
        public void TyreTracks_RespawnLeavesNoSegmentFromTheCrashSpot()
        {
            var be = new JumpBackBackend();
            var d = NewDriver(be);
            var truck = Make("Truck");
            var tracks = Make("Tracks").AddComponent<TyreTracks>();
            tracks.Init(truck.transform, d, null);
            int segsBefore = 0;
            for (int f = 0; f < 200; f++)
            {
                d.Tick(1f / 60f);
                tracks.Tick();
                if (be.steps < JumpBackBackend.RespawnAt) foreach (var b in tracks.Buffers) segsBefore = Mathf.Max(segsBefore, b.Count);
            }
            Assert.Greater(segsBefore, 0, "no tracks were laid before the respawn");
            foreach (var b in tracks.Buffers)
                for (int i = 0; i < b.Count; i++)
                {
                    Assert.Less(b[i].a.x, 30f, "a track segment from before the respawn survived it");
                    Assert.Less(Vector3.Distance(b[i].a, b[i].b), 1.5f, "streak: a long track segment");
                }
        }

        [Test]
        public void TruckFx_TeleportClearsEveryParticle()
        {
            var be = new JumpBackBackend();
            var d = NewDriver(be);
            var truck = Make("Truck");
            var fx = Make("Fx").AddComponent<TruckFx>();
            fx.Init(truck.transform, d);
            for (int f = 0; f < 30; f++) { d.Tick(1f / 60f); fx.Tick(); }
            Assert.Greater(fx.LiveParticles, 0, "no spray or exhaust before the respawn");
            fx.OnTeleported();
            Assert.AreEqual(0, fx.LiveParticles, "particles survived the teleport");
        }

        [Test]
        public void TruckFx_ToggleOff_EmitsNothing()
        {
            FxToggles.SetAll(false);
            var be = new JumpBackBackend();
            var d = NewDriver(be);
            var fx = Make("Fx").AddComponent<TruckFx>();
            fx.Init(Make("Truck").transform, d);
            for (int f = 0; f < 30; f++) { d.Tick(1f / 60f); fx.Tick(); }
            Assert.AreEqual(0, fx.LiveParticles);
        }

        // ------------------------------------------------------------------ budgets, meters, toggles, beacon
        [Test]
        public void Budget_UsesAShareOfThePreset_AndCalmHalvesIt()
        {
            foreach (var p in QualityPresets.Table)
            {
                var b = FxBudget.For(p.particleBudget, false);
                Assert.GreaterOrEqual(b.total, FxBudget.Min); Assert.LessOrEqual(b.total, FxBudget.Max);
                Assert.LessOrEqual(b.Sum, b.total + 30, p.name + ": the split overspends the FX budget");
                var c = FxBudget.For(p.particleBudget, true);
                Assert.Less(c.total, b.total + 1);
                if (b.total > FxBudget.Min) Assert.Less(c.total, b.total, p.name + ": Calm motion did not reduce particles");
            }
            Assert.Less(FxBudget.For(QualityPresets.Table[0].particleBudget, false).total, FxBudget.For(QualityPresets.Table[3].particleBudget, false).total);
        }

        [Test]
        public void EmitMeter_KeepsFractions_AndResets()
        {
            var m = new EmitMeter();
            int n = 0;
            for (int i = 0; i < 60; i++) n += m.Take(30f, 1f / 60f);
            Assert.AreEqual(30, n, 1);
            m.Take(30f, 0.02f); m.Reset();
            Assert.AreEqual(0, m.Take(30f, 0.01f));
        }

        [Test]
        public void Toggles_ParseTheCommandLineSpec()
        {
            FxToggles.Apply("none");
            Assert.IsFalse(FxToggles.Spray || FxToggles.Tracks || FxToggles.LivingWorld || FxToggles.Beacon);
            FxToggles.Apply("spray,world");
            Assert.IsTrue(FxToggles.Spray && FxToggles.LivingWorld);
            Assert.IsFalse(FxToggles.Tracks || FxToggles.Exhaust);
            FxToggles.Apply("all");
            Assert.IsTrue(FxToggles.Tracks && FxToggles.Headlights && FxToggles.Sparkle);
        }

        [Test]
        public void Beacon_BlinksSlowly_AndIsSteadyInCalmMotion()
        {
            int on = 0, flips = 0; bool last = TruckEmissives.BlinkOn(0f, false);
            for (int i = 0; i < 600; i++)
            {
                bool b = TruckEmissives.BlinkOn(i / 60f, false);
                if (b) on++; if (b != last) flips++; last = b;
                Assert.IsTrue(TruckEmissives.BlinkOn(i / 60f, true), "the beacon blinked in Calm motion");
            }
            Assert.That(on, Is.InRange(200, 400));
            Assert.LessOrEqual(flips, 16, "faster than a slow blink (10 s)");
        }

        // ------------------------------------------------------------------ living world stays out of the play lane
        [Test]
        public void LivingWorld_StaysOutOfThePlayLane()
        {
            var world = Make("World").transform;
            var cam = Make("Cam").AddComponent<Camera>();
            cam.transform.position = new Vector3(0f, 5f, -31.7f);
            var lw = Make("LW").AddComponent<LivingWorld>();
            lw.Init(world, null, cam);
            for (int i = 0; i < 2000; i++) { cam.transform.position += new Vector3(0.2f, 0f, 0f); lw.Tick(1f / 60f); }   // birds fly, the lift and plough recycle
            foreach (var r in lw.GetComponentsInChildren<Renderer>(true))
                Assert.Greater(r.bounds.min.z, 12f, r.name + " reaches into the play lane");
        }

        [Test]
        public void Exhaust_IsAShortPuffNearTheStack_NotALongDottedTrail()
        {
            // at a fast drive the oldest puff must still sit close behind the stack (it used to trail 6 m back)
            var truck = new Vector2(12f, 0f);
            foreach (float r in new[] { 0f, 0.5f, 1f })
            {
                var v = TruckFx.ExhaustVelocity(truck, 1f, r, r, r);
                float behind = (truck.x - v.x) * TruckFx.ExhaustLifeMax;
                Assert.Less(behind, 1.6f, "exhaust left behind as a trail");
                Assert.Greater(v.y, 0.4f, "exhaust should drift up");
            }
            Assert.LessOrEqual(TruckFx.ExhaustLifeMax, 1f, "exhaust puffs should fade fast");
        }
    }
}
