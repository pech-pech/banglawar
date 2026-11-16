using System.Collections.Generic;
using MixerMad.Game;
using NUnit.Framework;
using UnityEngine;

namespace MixerMad.Tests
{
    /// <summary>
    /// LEVEL &amp; CAMERA workstream (P2 polish fixes 3, 4, 9; defects D4, D8; lesson L-MM-31).
    /// Props sit on the ground and stay clear of the lane, the cut face has its lip, line and strata,
    /// the back hill has no step walls, and the finish camera always holds the wheels and the pour.
    /// The road is built from the real sim line, padded exactly as SliceAssembler does.
    /// </summary>
    public sealed class LevelTests
    {
        const float Foot = 0.05f;
        readonly List<Object> _made = new List<Object>();

        [TearDown]
        public void TearDown()
        {
            foreach (var o in _made) if (o != null) Object.DestroyImmediate(o);
            _made.Clear();
        }

        RoadBuilder BuildRoad(out Vector2[] vLine)
        {
            var be = BackendFactory.Create(false);
            RoadPad.Extend(be.RoadLine, be.RoadSurface, 60f, 90f, out vLine, out var vSurf);
            var go = new GameObject("RoadTest"); _made.Add(go);
            var road = go.AddComponent<RoadBuilder>();
            road.roadMaterial = MMMaterials.Snow();
            road.Build(vLine, vSurf);
            return road;
        }

        // ------------------------------------------------------------------ road surface

        [Test]
        public void RoadTop_MatchesHeightAt_AndThePhysicsLine()
        {
            var road = BuildRoad(out var line);
            var m = road.BuiltMesh; var v = m.vertices;
            foreach (int i in m.GetTriangles(0))
            {
                float want = road.HeightAt(v[i].x, v[i].z);
                Assert.AreEqual(want, v[i].y, 0.02f, $"road top at ({v[i].x:F1}, {v[i].z:F1}) is off HeightAt, so props would hover or sink");
                if (Mathf.Abs(v[i].z) < 1e-4f)
                    Assert.AreEqual(SnowyPassData.HeightAt(line, v[i].x), v[i].y, 0.001f, "the lane must stay on the physics line");
            }
        }

        [Test]
        public void BackHill_HasNoStepWalls()
        {
            var road = BuildRoad(out var line);
            float zHill = road.roadHalfWidth + road.backShoulder + 3f;    // fully on the smoothed line from here back
            float worst = 0f, worstX = 0f;
            for (float x = line[0].x; x < line[line.Length - 1].x - 1f; x += 0.5f)
            {
                float step = Mathf.Abs(road.HeightAt(x + 0.5f, zHill) - road.HeightAt(x, zHill));
                if (step > worst) { worst = step; worstX = x; }
            }
            Assert.Less(worst, 0.35f, $"a {worst:F2} m step per 0.5 m on the back hill at x={worstX:F1}: that reads as a flat grey wall");
        }

        // ------------------------------------------------------------------ fences (D4, L-MM-31)

        [Test]
        public void Fences_StandOnTheGround_RailsSpanPostToPost_AndRunsClose()
        {
            var road = BuildRoad(out var line);
            var plan = SnowyPassDecor.PlanFences(road, line[0].x, line[line.Length - 1].x);
            Assert.Greater(plan.runs.Count, 5, "too few fence runs");
            float z = SnowyPassDecor.FenceZ(road);
            Assert.GreaterOrEqual(z, road.LaneEdgeZ + 2f, "fence closer than 2 m to the lane edge");

            foreach (var f in plan.postFeet)
            {
                Assert.AreEqual(road.HeightAt(f.x, f.z), f.y, Foot, $"post foot floats or sinks at x={f.x:F1}");
                Assert.AreEqual(z, f.z, 1e-4f);
            }

            var postXs = new HashSet<float>();
            foreach (var f in plan.postFeet) postXs.Add(f.x);
            var touched = new HashSet<float>();
            foreach (var r in plan.rails)
            {
                foreach (var end in new[] { r.a, r.b })
                {
                    Assert.AreEqual(road.HeightAt(end.x, end.z) + r.height, end.y, Foot, $"rail end off the ground line at x={end.x:F1}");
                    Assert.IsTrue(postXs.Contains(end.x), $"rail end at x={end.x:F1} has no post (orphan end)");
                    touched.Add(end.x);
                }
                float midGround = road.HeightAt((r.a.x + r.b.x) * 0.5f, r.a.z) + r.height;
                Assert.AreEqual(midGround, (r.a.y + r.b.y) * 0.5f, FencePlanner.MaxSpanBend + 0.02f, "rail floats or digs in at mid-span");
            }
            foreach (var run in plan.runs)
            {
                Assert.Greater(run.y, run.x, "a run needs at least two posts");
                Assert.IsTrue(touched.Contains(plan.postFeet[run.x].x) && touched.Contains(plan.postFeet[run.y].x), "a run must start and end on a post with rails");
            }
        }

        [Test]
        public void FencePlanner_BreaksRunsOnSteps_AndEndsEachRunWithAPost()
        {
            // flat, then a 3 m cliff at x = 10, then flat: no rail may cross the cliff
            float Ground(float x, float z) => x < 10f ? 3f : 0f;
            var plan = FencePlanner.Make(Ground, 0f, 40f, 6f);
            foreach (var r in plan.rails) Assert.IsFalse(r.a.x < 10f && r.b.x > 10f, "a rail crosses the cliff");
            foreach (var run in plan.runs) Assert.Greater(run.y, run.x);
            Assert.AreEqual(plan.rails.Count, CountSpans(plan) * FencePlanner.RailHeights.Length);
        }

        static int CountSpans(FencePlanner.Plan p) { int n = 0; foreach (var r in p.runs) n += r.y - r.x; return n; }

        // ------------------------------------------------------------------ boulders, pines, cabin

        [Test]
        public void Boulders_SinkAFifth_AndStayOffTheFence()
        {
            var road = BuildRoad(out var line);
            var list = SnowyPassDecor.PlaceBoulders(road, line[0].x, line[line.Length - 1].x, 7);
            Assert.Greater(list.Count, 15);
            float fenceZ = SnowyPassDecor.FenceZ(road);
            foreach (var b in list)
            {
                float half = b.size.x * 0.5f;
                float bottom = b.centre.y - b.size.y * 0.5f;
                float low = road.GroundMin(b.centre.x, b.centre.z, half * 0.8f, half * 0.8f);
                Assert.AreEqual(low - SnowyPassDecor.BoulderSink * b.size.y, bottom, 0.01f, "boulder not sunk 20% under its lowest ground");
                Assert.Greater(Mathf.Abs(b.centre.z - fenceZ), half + 0.5f, "boulder sits on the fence");
                Assert.Greater(b.centre.z, road.LaneEdgeZ + 2f, "boulder too near the lane");
            }
        }

        [Test]
        public void GroundMin_IsTheLowestPointUnderAFootprint()
        {
            var road = BuildRoad(out var line);
            var rng = new System.Random(3);
            for (int i = 0; i < 200; i++)
            {
                float x = Mathf.Lerp(line[0].x, line[line.Length - 1].x, (float)rng.NextDouble());
                float z = Mathf.Lerp(8f, road.BackEdgeZ, (float)rng.NextDouble());
                float g = road.GroundMin(x, z, 2.6f, 2f);
                for (int a = -1; a <= 1; a++)
                    for (int c = -1; c <= 1; c++)
                        Assert.LessOrEqual(g, road.HeightAt(x + a * 2.6f, z + c * 2f) + 1e-4f, "a corner of the footprint would hover");
            }
        }

        [Test]
        public void Decor_Builds_AndEveryPropIsOffTheLane()
        {
            var road = BuildRoad(out var line);
            var parent = new GameObject("DecorTest"); _made.Add(parent);
            var root = SnowyPassDecor.Build(parent.transform, road, line);
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>())
            {
                if (mf.name.StartsWith("Ridge") || mf.name == "PloughMarkers") continue;
                var b = mf.GetComponent<MeshRenderer>().bounds;                 // world space
                Assert.Greater(mf.sharedMesh.vertexCount, 0, mf.name + " is empty");
                Assert.Greater(b.min.z, road.LaneEdgeZ + 2f - 0.6f, mf.name + " reaches into the lane");
            }
            var cabin = root.Find("Cabin");
            Assert.IsNotNull(cabin);
            Vector3 c = cabin.position;
            float front = road.HeightAt(c.x, c.z - SnowyPassDecor.CabinHalf.y), back = road.HeightAt(c.x, c.z + SnowyPassDecor.CabinHalf.y);
            Assert.LessOrEqual(c.y, Mathf.Min(front, back) + 1e-3f, "the cabin floats on its downhill side");
            Assert.Greater(c.y, Mathf.Min(front, back) - 0.5f, "the cabin is buried");
        }

        // ------------------------------------------------------------------ cut face

        [Test]
        public void CutFace_HasOverhang_Line_Strata_AndShade()
        {
            var road = BuildRoad(out var line);
            var m = road.BuiltMesh; var v = m.vertices; var col = m.colors;
            float zf = road.FrontLipZ;
            var wall = new HashSet<int>(m.GetTriangles(1));
            float minZ = float.MaxValue, minA = 1f;
            var tones = new HashSet<int>();
            foreach (int i in wall)
            {
                minZ = Mathf.Min(minZ, v[i].z);
                minA = Mathf.Min(minA, col[i].a);
                Assert.LessOrEqual(v[i].z, zf + CutFace.Lean + 0.05f, "the face leans too far back");
                if (col[i].b > 0f) tones.Add(Mathf.RoundToInt(col[i].b * 20f) * 1000 + Mathf.RoundToInt(col[i].r * 20f) * 10 + Mathf.RoundToInt(col[i].a * 5f));
            }
            Assert.AreEqual(zf - CutFace.OverhangOut, minZ, 0.01f, "no snow overhang sticking out toward the camera");
            Assert.Less(minA, 0.4f, "no dark shade under the lip");
            Assert.GreaterOrEqual(tones.Count, 4, "the dirt has no strata (one flat colour)");

            var details = road.Details;
            Assert.IsNotNull(details.Find("LipLine"), "no navy line under the lip");
            Assert.AreEqual("Toy_Navy", details.Find("LipLine").GetComponent<MeshRenderer>().sharedMaterial.name.Replace(" (Instance)", ""));
            Assert.Greater(details.Find("Icicles").GetComponent<MeshFilter>().sharedMesh.vertexCount, 0, "no icicles");
            Assert.Greater(details.Find("Pebbles").GetComponent<MeshFilter>().sharedMesh.vertexCount, 0, "no pebbles");
            foreach (var p in details.Find("LipLine").GetComponent<MeshFilter>().sharedMesh.vertices)
                Assert.Less(p.z, zf, "the navy line must sit proud of the face");
        }

        [Test]
        public void CutFace_StrataAreOrdered_AndGradientDarkens()
        {
            for (float x = -50f; x < 300f; x += 7.3f)
                for (int k = 0; k < 8; k++)
                    Assert.Greater(CutFace.BandDepth(x, k + 1), CutFace.BandDepth(x, k), "strata cross each other");
            Assert.Greater(CutFace.Gradient(0f), CutFace.Gradient(6f));
            Assert.AreEqual(1f, CutFace.Gradient(0f), 1e-5f);
        }

        // ------------------------------------------------------------------ camera framing (fix 4) and finish (fix 9, D8)

        [Test]
        public void Gameplay_TargetSitsBelowCentre_SoTheRoadIsLowOnScreen()
        {
            // Cinemachine 3 screen y grows downward: the old -0.10 put the road at about 55%; the target now sits below centre.
            Assert.Greater(CameraRig.TargetScreenY, 0f);
            Assert.Less(CameraRig.TargetScreenY, 0.1f, "too low: the truck would crowd the pedals");
        }

        static readonly float[] Aspects = { 16f / 9f, 16f / 10f, 2176f / 1812f, 4f / 3f };

        [Test]
        public void FinishPose_KeepsWheelsAndPourInFrame_AtEveryAspectAndTime()
        {
            var truck = new Vector3(232f, 0.4f, 0f);
            foreach (float aspect in Aspects)
                foreach (bool calm in new[] { false, true })
                    for (float t = 0f; t <= 10f; t += 0.25f)
                    {
                        var pose = CameraRig.FinishPose(truck, t, aspect, calm, 3.2f, 7f);
                        var rot = Quaternion.LookRotation(pose.look - pose.pos, Vector3.up);
                        Assert.IsTrue(CameraRig.BoxInView(truck, pose.pos, rot, aspect, 1f), $"wheels, pour or cab out of frame (aspect {aspect:F2}, t {t:F2}, calm {calm})");
                    }
        }

        [Test]
        public void FinishPose_PushesInSlowly_AndCalmStaysStill()
        {
            var truck = new Vector3(10f, 2f, 0f);
            float aspect = 16f / 9f;
            var first = CameraRig.FinishPose(truck, 0f, aspect, false, 3.2f, 7f);
            float startRatio = Vector3.Distance(first.pos, first.look) / CameraRig.FitDistance(CameraRig.YawFrom, CameraRig.PitchFrom, aspect);
            Assert.AreEqual(CameraRig.FinishPushFrom, startRatio, 0.01f, "no push-in");
            var last = CameraRig.FinishPose(truck, 9f, aspect, false, 3.2f, 7f);
            Assert.AreEqual(CameraRig.FitDistance(CameraRig.YawTo, CameraRig.PitchTo, aspect), Vector3.Distance(last.pos, last.look), 0.01f, "the push-in must end at the fit distance");
            float prevRatio = float.MaxValue;
            for (float t = 3.2f; t <= 9f; t += 0.1f)                        // after the arc, the push-in only closes in
            {
                var p = CameraRig.FinishPose(truck, t, aspect, false, 3.2f, 7f);
                float d = Vector3.Distance(p.pos, p.look);
                Assert.LessOrEqual(d, prevRatio + 1e-3f, "the push-in went backwards");
                prevRatio = d;
            }

            var a = CameraRig.FinishPose(truck, 0f, aspect, true, 3.2f, 7f);
            var b = CameraRig.FinishPose(truck, 8f, aspect, true, 3.2f, 7f);
            Assert.AreEqual(a.pos, b.pos, "Calm motion: the finish camera must not move");
        }

        [Test]
        public void FinishDof_StartFollowsTheFocusDistance()
        {
            foreach (float focus in new[] { 6f, 9f, 13f, 20f })
            {
                float start = CameraRig.FinishDofStart(focus);
                Assert.Greater(start, focus + 1.3f, "the back of the truck would blur");
                Assert.Less(start, focus + 6f, "the background would stay sharp");
            }
            Assert.AreNotEqual(CameraRig.FinishDofStart(8f), CameraRig.FinishDofStart(12f), "DoF start is fixed again (D8)");
        }
    }
}
