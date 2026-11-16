using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// Driver visibility (GAMEUP-REVIEW P2, fix 7): the placeholder builder must read at drive zoom. Head 1.3x,
    /// pupils that show in front of the eyes and are big enough for 8 px at 1080p, a brim that never covers the
    /// eyes, a seat that puts the face inside the Blender cab's side window, and the near arm out of the window
    /// for "woo". Geometry numbers come from Art/blender/mixer_truck.py (WINDOW, ROOF, CAB_HW).
    /// </summary>
    public class DriverTests
    {
        const string TruckFbx = "Assets/MixerMad/Art/Models/Truck_Mixer.fbx";
        // Window opening in Body space (Unity x forward, y up): sill 1.30, top 2.20, rear edge 0.42, front edge 1.44..1.56.
        const float SillY = 1.30f, WindowTopY = 2.20f, WindowRearX = 0.42f, WindowFrontX = 1.44f;
        const float CabHalfWidth = 0.92f, GlassZ = 0.875f;
        // Drive camera: about 56 px per metre at 1080p (wheel diameter 1.0 m = 62.5 px in the 1920x1200 02 still).
        // 8 px at 1080p is 0.143 m face-on; the 3/4 view foreshortens the width by about 15%, so ask for 0.17 m.
        const float MinPupilMetres = 0.17f;

        readonly List<GameObject> _made = new List<GameObject>();
        [SetUp] public void SetUp() { MMSettings.CalmMotionOverride = false; }
        [TearDown]
        public void TearDown()
        {
            MMSettings.CalmMotionOverride = null;
            foreach (var g in _made) if (g) Object.DestroyImmediate(g);
            _made.Clear();
        }

        DriverView BuildOnSeat(out Transform seat)
        {
            var go = new GameObject("Seat"); _made.Add(go);
            seat = go.transform;
            return DriverView.BuildPlaceholder(seat).GetComponent<DriverView>();
        }

        static Transform Find(Transform r, string n)
        {
            if (r.name == n) return r;
            for (int i = 0; i < r.childCount; i++) { var f = Find(r.GetChild(i), n); if (f) return f; }
            return null;
        }

        static Bounds B(Transform root, string n) { return Find(root, n).GetComponent<Renderer>().bounds; }

        [Test]
        public void Head_Is1_3TimesTheOldSize()
        {
            var dv = BuildOnSeat(out _);
            Assert.AreEqual(0.56f * 1.3f, Find(dv.transform, "Head").lossyScale.x, 1e-4f);
        }

        [Test]
        public void Pupils_SitInFrontOfTheEyes_AfterThePoseIsApplied()
        {
            var dv = BuildOnSeat(out _);
            foreach (var e in new[] { DriverEmotion.Idle, DriverEmotion.AirWoo, DriverEmotion.CrashDaze, DriverEmotion.Scared })
            {
                dv.PoseForTests(e, 0.37f);
                foreach (var side in new[] { "L", "R" })
                {
                    var eye = B(dv.transform, "Eye_" + side);
                    var pupil = B(dv.transform, "Pupil_" + side);
                    Assert.Less(pupil.min.z, eye.min.z - 0.005f, e + ": pupil " + side + " is sunk inside the eye (camera looks from -Z)");
                }
            }
        }

        [Test]
        public void Pupils_AreAtLeast8PixelsAt1080p()
        {
            var dv = BuildOnSeat(out _);
            dv.PoseForTests(DriverEmotion.Idle);
            foreach (var side in new[] { "L", "R" })
            {
                var pupil = B(dv.transform, "Pupil_" + side);
                Assert.GreaterOrEqual(Mathf.Min(pupil.size.x, pupil.size.y), MinPupilMetres, "pupil " + side);
            }
        }

        [Test]
        public void Brim_IsAboveTheEyesAndBrows()
        {
            var dv = BuildOnSeat(out _);
            dv.PoseForTests(DriverEmotion.Idle);
            float brimBottom = B(dv.transform, "Brim").min.y;
            foreach (var n in new[] { "Eye_L", "Eye_R", "Brow_L", "Brow_R" })
                Assert.Greater(brimBottom, B(dv.transform, n).max.y, n + " is under the brim");
        }

        GameObject TruckWithDriver(out Transform body, out DriverView dv)
        {
            var fbx = AssetDatabase.LoadAssetAtPath<GameObject>(TruckFbx);
            Assert.IsNotNull(fbx, "no truck FBX at " + TruckFbx);
            var truck = Object.Instantiate(fbx); _made.Add(truck);
            FbxTruckAdapter.Prepare(truck);
            body = Find(truck.transform, "Body");
            dv = truck.GetComponentInChildren<DriverView>(true);
            Assert.IsNotNull(dv, "FbxTruckAdapter did not seat a driver");
            return truck;
        }

        [Test]
        public void Seat_PutsTheFaceInsideTheSideWindow()
        {
            TruckWithDriver(out var body, out var dv);
            dv.PoseForTests(DriverEmotion.Idle);
            foreach (var n in new[] { "Eye_L", "Eye_R", "Mouth" })
            {
                var b = B(dv.transform, n);
                Vector3 lo = body.InverseTransformPoint(b.min), hi = body.InverseTransformPoint(b.max);
                Assert.Greater(Mathf.Min(lo.y, hi.y), SillY + 0.02f, n + " is below the window sill");
                Assert.Less(Mathf.Max(lo.y, hi.y), WindowTopY - 0.05f, n + " is above the window");
                Assert.Greater(Mathf.Min(lo.x, hi.x), WindowRearX + 0.02f, n + " is behind the rear pillar");
                Assert.Less(Mathf.Max(lo.x, hi.x), WindowFrontX - 0.02f, n + " is behind the front pillar");
            }
        }

        [Test]
        public void Driver_FitsInsideTheCab_AtRest()
        {
            TruckWithDriver(out var body, out var dv);
            dv.PoseForTests(DriverEmotion.Idle);
            foreach (var r in dv.GetComponentsInChildren<Renderer>())
            {
                if (r.name.StartsWith("Star_") || r.name == "Sweat") continue;     // hidden in the idle pose
                Vector3 lo = body.InverseTransformPoint(r.bounds.min), hi = body.InverseTransformPoint(r.bounds.max);
                Assert.Less(Mathf.Max(Mathf.Abs(lo.z), Mathf.Abs(hi.z)), GlassZ, r.name + " pokes through the side glass");
                Assert.Less(Mathf.Max(lo.y, hi.y), WindowTopY + 0.01f, r.name + " pokes into the roof");
            }
        }

        [Test]
        public void AirWoo_NearArmWavesOutOfTheWindow()
        {
            TruckWithDriver(out var body, out var dv);
            dv.PoseForTests(DriverEmotion.AirWoo, 0.2f);
            var mitten = body.InverseTransformPoint(B(Find(dv.transform, "Arm_L"), "Mitten").center);
            Assert.Less(mitten.z, -CabHalfWidth - 0.05f, "the near mitten does not clear the cab side");
            Assert.That(mitten.y, Is.InRange(SillY, WindowTopY + 0.3f), "the near arm should leave through the window, not the roof or door");
            dv.PoseForTests(DriverEmotion.Idle);
            var rest = body.InverseTransformPoint(B(Find(dv.transform, "Arm_L"), "Mitten").center);
            Assert.Greater(rest.z, -GlassZ, "the arm stays out of the window after the woo");
        }

        [Test]
        public void CalmMotion_KeepsTheWooArmStill()
        {
            MMSettings.CalmMotionOverride = true;
            var dv = BuildOnSeat(out _);
            var arm = Find(dv.transform, "Arm_L");
            dv.PoseForTests(DriverEmotion.AirWoo, 0.10f);
            var a = arm.localRotation;
            dv.PoseForTests(DriverEmotion.AirWoo, 0.25f);
            Assert.Less(Quaternion.Angle(a, arm.localRotation), 0.01f, "calm motion: no waving");
        }
    }
}
