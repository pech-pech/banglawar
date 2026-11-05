using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// Crash respawn and R restart must be clean cuts: the views read the new pose on the respawn tick, the rest pose
    /// of the rig never moves, springs and slow-mo do not carry over, and no HUD text is left from the last attempt.
    /// </summary>
    public class RespawnTests
    {
        /// <summary>Drives forward 0.1 m per step; on step RespawnAt it teleports back to x = 2 and emits Respawn.</summary>
        sealed class TeleportBackend : ISimBackend
        {
            public const int RespawnAt = 30;
            public int steps; public float x = 50f, y = 4f, wheelDrop;
            readonly Queue<SimEvent> _ev = new Queue<SimEvent>();
            public double StepSeconds => 1.0 / 120.0;
            public Vector2[] RoadLine => new[] { new Vector2(-10, 0), new Vector2(500, 0) };
            public byte[] RoadSurface => null;
            public float FinishX => 400f;
            public void Reset() { steps = 0; x = 2f; y = 0f; }
            public void Step(in SimInput input)
            {
                steps++; x += 0.1f;
                if (steps == RespawnAt) { x = 2f; y = 1.5f; wheelDrop = 0.12f; _ev.Enqueue(new SimEvent { kind = SimEventKind.Respawn }); }
            }
            public void Capture(SimSnapshot s)
            {
                s.chassisPos = new Vector2(x, y); s.chassisAngle = 0f; s.wheelCount = 2; s.grounded = true;
                // mid-fall frames: the wheels hang lower than at rest
                s.wheelPos[0] = new Vector2(x - 1.2f, y - 0.65f - wheelDrop);
                s.wheelPos[1] = new Vector2(x + 1.1f, y - 0.65f - wheelDrop);
            }
            public bool TryDequeueEvent(out SimEvent e) { if (_ev.Count > 0) { e = _ev.Dequeue(); return true; } e = default; return false; }
        }

        readonly List<GameObject> _made = new List<GameObject>();
        GameObject Make(string n) { var g = new GameObject(n); _made.Add(g); return g; }
        [SetUp] public void SetUp() { MMSettings.CalmMotionOverride = false; }
        [TearDown] public void TearDown() { MMSettings.CalmMotionOverride = null; foreach (var g in _made) Object.DestroyImmediate(g); _made.Clear(); }

        SimDriver NewDriver(TeleportBackend be)
        {
            var d = Make("Sim").AddComponent<SimDriver>();
            d.InitForTests(be);
            return d;
        }

        [Test]
        public void RespawnTick_ViewsSeeTheNewPose_WhenTeleportedFires()
        {
            var be = new TeleportBackend();
            var d = NewDriver(be);
            Vector2 renderAtTeleport = new Vector2(float.NaN, float.NaN), prevAtTeleport = renderAtTeleport;
            d.Teleported += () => { renderAtTeleport = d.Render.chassisPos; prevAtTeleport = d.Prev.chassisPos; };
            for (int f = 0; f < 40; f++) d.Tick(1f / 60f);       // 2 steps per frame: the respawn lands mid-frame
            Assert.AreEqual(2f, renderAtTeleport.x, 0.001f, "Render still held the crash spot when the views snapped");
            Assert.AreEqual(2f, prevAtTeleport.x, 0.001f, "Prev still held the crash spot");
            Assert.Less(d.Render.chassisPos.x, 10f, "Render interpolated back toward the crash spot after the respawn");
        }

        [Test]
        public void SlowMo_EndsOnRespawn()
        {
            var be = new TeleportBackend();
            var d = NewDriver(be);
            var sm = d.gameObject.AddComponent<SlowMo>();
            sm.noSlowMoFirstSeconds = 0f; sm.runCapFraction = 0.5f;
            sm.Bind(d);
            for (int i = 0; i < 300; i++) sm.Tick(0.02f, d);         // 6 s of run so the cap allows a crash slow-mo
            sm.HandleEvent(new SimEvent { kind = SimEventKind.Crash });
            Assert.AreEqual(SlowMo.Mode.Crash, sm.Current);
            sm.HandleEvent(new SimEvent { kind = SimEventKind.Respawn });
            Assert.AreNotEqual(SlowMo.Mode.Crash, sm.Current, "crash slow-mo carried into the new attempt");
            for (int i = 0; i < 40; i++) sm.Tick(0.02f, d);           // ease-out is 0.4 s
            Assert.AreEqual(1f, sm.Scale, 1e-4f);
        }

        TruckView MakeTruck()
        {
            var root = Make("Truck");
            var visual = new GameObject("Visual"); visual.transform.SetParent(root.transform, false);
            visual.AddComponent<SquashStretch>();
            var body = new GameObject("Body"); body.transform.SetParent(visual.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.2f, 0f);
            foreach (var (axle, x) in new[] { ("R", -1.2f), ("F", 1.1f) })
            {
                var susp = new GameObject("Susp_" + axle + "_0"); susp.transform.SetParent(visual.transform, false);
                susp.transform.localPosition = new Vector3(x, 0.173f, -0.8f);
                var w = new GameObject("Wheel_" + axle + "_0"); w.transform.SetParent(susp.transform, false);
            }
            var tv = root.AddComponent<TruckView>();
            tv.AutoBind();
            return tv;
        }

        [Test]
        public void Teleport_KeepsTheRestPose_AndClearsSprings()
        {
            var be = new TeleportBackend { x = 5f, y = 0f };
            var d = NewDriver(be);
            var tv = MakeTruck();
            tv.ApplyFrame(d.Render, 1f / 60f);                         // first frame: rest pose captured here
            float bodyY = tv.body.localPosition.y;
            Vector3 suspRest = tv.wheels[0].susp.localPosition;
            be.x += 0.5f; d.InitForTests(be); tv.ApplyFrame(d.Render, 1f / 60f);   // drive a little: the wheels spin
            float spin = tv.wheels[0].spinDeg;
            Assert.AreNotEqual(0f, spin, "test setup: the wheel should have turned");

            tv.squash.Landing(15f);                                     // a big squash in progress
            be.x = 2f; be.wheelDrop = 0.12f; d.InitForTests(be);         // respawn 3.5 m back, wheels 12 cm low (mid-fall)
            tv.OnRestart();
            tv.ApplyFrame(d.Render, 1f / 60f);

            Assert.AreEqual(bodyY, tv.body.localPosition.y, 1e-4f, "body moved: the rest pose was re-captured on a mid-fall frame");
            Assert.AreEqual(Vector3.one.y, tv.visual.localScale.y, 0.02f, "squash carried over the teleport");
            Assert.Less(Mathf.Abs(tv.wheels[0].susp.localPosition.y - suspRest.y), tv.suspTravel + 1e-4f, "suspension jumped past its travel");
            Assert.AreEqual(spin, tv.wheels[0].spinDeg, 1e-3f, "wheel spin integrated the teleport distance");
        }

        [Test]
        public void CameraCut_OverridesBlends_RightAfterATeleport()
        {
            var smooth = new Unity.Cinemachine.CinemachineBlendDefinition(Unity.Cinemachine.CinemachineBlendDefinition.Styles.EaseInOut, 0.8f);
            CameraRig.CutUntilFrame = Time.frameCount + 2;
            var during = CameraRig.BlendOverride(null, null, smooth, null);
            Assert.AreEqual(Unity.Cinemachine.CinemachineBlendDefinition.Styles.Cut, during.Style, "the crash/finish camera blended across the teleport");
            CameraRig.CutUntilFrame = Time.frameCount - 1;
            Assert.AreEqual(smooth.Style, CameraRig.BlendOverride(null, null, smooth, null).Style, "normal blends must stay");
        }

        [Test]
        public void CameraSnap_LandsOnTheSettledFraming_ForTheNewPose()
        {
            // R pressed mid-air at speed: the follow is zoomed out and leading; the restart pose is at rest
            var camGo = Make("Cam"); var camera = camGo.AddComponent<Camera>();
            var rig = CameraRig.Build(camera, Make("Rig").transform);
            var fast = new SimSnapshot { chassisPos = new Vector2(10f, 1.7f), velocity = new Vector2(12f, 2f) };
            var proxyStart = new SimSnapshot { chassisPos = fast.chassisPos };
            rig.SnapTo(proxyStart);
            for (int f = 0; f < 120; f++) rig.Follow(fast, 1f / 60f);
            Assert.Greater(rig.VisibleHeight, CameraRig.HeightRest + 1f, "setup: the follow should be zoomed out at speed");

            var rest = new SimSnapshot { chassisPos = new Vector2(5.05f, 1.2f), velocity = Vector2.zero };
            rig.SnapTo(rest);
            var pc = rig.cmMain.GetComponent<Unity.Cinemachine.CinemachinePositionComposer>();
            Assert.AreEqual(CameraRig.HeightRest, rig.VisibleHeight, 1e-4f, "the zoom band carried over the cut and eases in afterwards");
            Assert.AreEqual(CameraRig.DistanceFor(CameraRig.HeightRest), pc.CameraDistance, 1e-4f, "Composer distance not set on the cut");
            Assert.AreEqual(5.05f, rig.proxy.position.x, 1e-4f, "look-ahead carried over the cut");

            // after the cut the framing is already settled: a second of follow at rest moves nothing
            float h = rig.VisibleHeight; Vector3 p = rig.proxy.position;
            for (int f = 0; f < 60; f++) rig.Follow(rest, 1f / 60f);
            Assert.AreEqual(h, rig.VisibleHeight, 1e-3f, "zoom drifted after the cut");
            Assert.Less(Vector3.Distance(p, rig.proxy.position), 1e-3f, "proxy drifted after the cut");
        }

        [Test]
        public void Hud_ClearsToastOnRestartAndRespawn()
        {
            var canvasParent = Make("UI").transform;
            var input = Make("Input").AddComponent<InputReader>();
            var hud = Hud.Build(canvasParent, input);
            _made.Add(hud.gameObject);
            hud.Toast("Ouch!");
            Assert.AreEqual("Ouch!", hud.ToastText);
            hud.ClearTransient();
            Assert.AreEqual("", hud.ToastText);
        }
    }
}
