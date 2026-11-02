using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Snowy mountain pass set dressing, all procedural, all OFF the physics plane (z > 5 or behind the road):
    /// 4 layered ridge silhouettes with fog grading (no outline: background rule), pine stands merged into one
    /// mesh per band, snow fences, orange plough markers, a cabin with a night window light, and a few boulders.
    /// Life never enters the play lane (z in [-3.6, 3.6] is empty of props). Fences stand at least 2 m behind the lane edge.
    /// Everything sits on the ground: placement samples the lowest ground under each footprint (RoadBuilder.GroundMin).
    /// Deterministic: seeded, so every run and every machine builds the same mountains.
    /// </summary>
    public static class SnowyPassDecor
    {
        public static Transform Build(Transform parent, RoadBuilder road, Vector2[] line, int seed = 7)
        {
            var root = new GameObject("Decor").transform;
            root.SetParent(parent, false);
            var rng = new System.Random(seed);
            float x0 = line[0].x - 60f, x1 = line[line.Length - 1].x + 80f;    // ridges run past the ends
            float g0 = line[0].x, g1 = line[line.Length - 1].x;                  // props only where the ground mesh exists

            // ---- ridge layers (parallax comes free from the perspective camera)
            Layer(root, "Ridge_0", MMMaterials.Snow(), x0, x1, z: 38f, baseY: -2f, amp: 16f, freq: 0.045f, seed: seed + 1, snowLine: 0.35f);
            Layer(root, "Ridge_1", MMMaterials.Snow(), x0, x1, z: 78f, baseY: 2f, amp: 30f, freq: 0.030f, seed: seed + 2, snowLine: 0.25f);
            Layer(root, "Ridge_2", MMMaterials.Snow(), x0, x1, z: 130f, baseY: 8f, amp: 46f, freq: 0.020f, seed: seed + 3, snowLine: 0.2f);
            Layer(root, "Ridge_3", MMMaterials.Snow(), x0, x1, z: 200f, baseY: 14f, amp: 70f, freq: 0.012f, seed: seed + 4, snowLine: 0.15f);

            // ---- pines on the back hill: near / far bands plus trunks, each merged into one mesh
            BuildPines(root, road, g0, g1, rng);

            // ---- snow fences up the back bank (post to post, following the slope) + orange plough markers on the front edge
            BuildFences(root, road, g0, g1);
            BuildPloughMarkers(root, road, g0, g1);

            // ---- cabin on the hill near the lake (warm window light at night)
            BuildCabin(root, road, 128f, 15f);

            // ---- boulders (snow-capped), sunk into the snow and kept clear of the fence
            var rocks = new List<ProcMesh.Part>();
            Mesh rockMesh = ProcMesh.Sphere(0.5f, 6, 10);
            foreach (var b in PlaceBoulders(road, g0, g1, seed))
                rocks.Add(new ProcMesh.Part(rockMesh, b.centre, Quaternion.Euler(0, b.yaw, 0), b.size));
            Mat(root, "Boulders", ProcMesh.Combine(rocks, "Boulders"), "Dress_Roof");
            return root;
        }

        // ------------------------------------------------------------------ placement rules (public so tests can check them)

        // Fence z = lane edge + this (L-MM-31 asks for at least 2 m). With the camera framing the road at about 68% of the
        // screen, the camera sits about 2.8 m above the road, so anything on the back slope nearer than about 10 m projects
        // across the truck. At lane edge + 7 m the fence foot lands about 3.1 m up on the truck plane: above the cab and drum.
        public const float FenceBehindLane = 7f;
        public const float BoulderSink = 0.2f;          // fraction of a boulder's height below the lowest ground under it
        public const float TrunkSink = 0.15f;
        const int BoulderCount = 26;

        public static float FenceZ(RoadBuilder road) => road.LaneEdgeZ + FenceBehindLane;

        public static FencePlanner.Plan PlanFences(RoadBuilder road, float x0, float x1)
            => FencePlanner.Make(road.HeightAt, x0 + 4f, x1 - 4f, FenceZ(road));

        public struct Boulder { public Vector3 centre, size; public float yaw; }

        /// <summary>Boulders on the back hill: bottom sunk BoulderSink of their height below the lowest ground under them.</summary>
        public static List<Boulder> PlaceBoulders(RoadBuilder road, float x0, float x1, int seed)
        {
            var rng = new System.Random(seed * 31 + 5);
            var list = new List<Boulder>();
            float fenceZ = FenceZ(road);
            for (int tries = 0; list.Count < BoulderCount && tries < BoulderCount * 8; tries++)
            {
                float x = Mathf.Lerp(x0 + 6f, x1 - 6f, (float)rng.NextDouble());
                float s = Mathf.Lerp(0.8f, 2.2f, (float)rng.NextDouble());
                float z = Mathf.Lerp(fenceZ + 1f, 26f, (float)rng.NextDouble());   // behind the fence, so never across the truck
                float yaw = (float)rng.NextDouble() * 360f;
                var size = new Vector3(s * 1.3f, s * 0.8f, s);
                float halfXZ = size.x * 0.5f;                                     // yaw can turn the long side any way
                if (Mathf.Abs(z - fenceZ) < halfXZ + 0.6f) continue;              // keep them off the fence
                float half = size.y * 0.5f;
                float ground = road.GroundMin(x, z, halfXZ * 0.8f, halfXZ * 0.8f);
                list.Add(new Boulder { centre = new Vector3(x, ground + half - BoulderSink * size.y, z), size = size, yaw = yaw });
            }
            return list;
        }

        static void BuildFences(Transform root, RoadBuilder road, float x0, float x1)
        {
            var parts = new List<ProcMesh.Part>();
            Mesh post = ProcMesh.RoundedBox(new Vector3(0.12f, FencePlanner.PostHeight, 0.12f), 0.04f, 3);
            Mesh slat = ProcMesh.RoundedBox(new Vector3(1f, 0.12f, 0.05f), 0.02f, 2);
            var plan = PlanFences(road, x0, x1);
            foreach (var f in plan.postFeet)
                parts.Add(new ProcMesh.Part(post, f + Vector3.up * (FencePlanner.PostHeight * 0.5f), Quaternion.identity));
            foreach (var r in plan.rails)
            {
                Vector3 d = r.b - r.a;
                float len = d.magnitude + 0.10f;                                   // tuck the ends into the posts
                var rot = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
                parts.Add(new ProcMesh.Part(slat, (r.a + r.b) * 0.5f + new Vector3(0f, 0f, -0.08f), rot, new Vector3(len, 1f, 1f)));
            }
            Mat(root, "SnowFences", ProcMesh.Combine(parts, "Fences"), "Dress_Trunk");
        }

        static void BuildPloughMarkers(Transform root, RoadBuilder road, float x0, float x1)
        {
            var poles = new List<ProcMesh.Part>();
            Mesh pole = ProcMesh.RoundedBox(new Vector3(0.10f, 2.0f, 0.10f), 0.04f, 3);
            for (float x = x0 + 10f; x < x1 - 10f; x += 12f)
            {
                float z = -(road.roadHalfWidth + 0.55f);
                float y = road.GroundMin(x, z, 0.05f, 0.05f) - 0.05f;
                poles.Add(new ProcMesh.Part(pole, new Vector3(x, y + 1.0f, z), Quaternion.identity));
            }
            Mat(root, "PloughMarkers", ProcMesh.Combine(poles, "Poles"), "Dress_Pole", outline: true);
        }

        static void BuildPines(Transform root, RoadBuilder road, float x0, float x1, System.Random rng)
        {
            var near = new List<ProcMesh.Part>(); var far = new List<ProcMesh.Part>(); var trunks = new List<ProcMesh.Part>();
            Mesh tier = ProcMesh.Cone(1f, 1f, 0f, 9);
            Mesh trunk = ProcMesh.Cone(0.5f, 1f, 0.35f, 6);
            float zMin = FenceZ(road) + 3f, zMax = road.BackEdgeZ - 2f;
            int count = Mathf.RoundToInt((x1 - x0) / 5.5f);
            for (int i = 0; i < count; i++)
            {
                float x = x0 + 2f + (i + (float)rng.NextDouble()) * 5.5f;
                if (x > x1 - 2f) break;
                float z = Mathf.Lerp(zMin, zMax, (float)rng.NextDouble());
                if ((float)rng.NextDouble() < 0.18f) continue;                       // gaps for rhythm
                float h = Mathf.Lerp(3.2f, 7.5f, (float)rng.NextDouble());
                float r0 = h * 0.07f * 0.5f;                                         // trunk base radius
                float y = road.GroundMin(x, z, r0, r0) - TrunkSink;                  // sit on the lowest ground under the trunk
                var list = z < 14f ? near : far;
                for (int t = 0; t < 3; t++)                                          // 3 stacked cones
                {
                    float f = t / 3f;
                    float r = Mathf.Lerp(1.5f, 0.7f, f) * h * 0.30f;
                    list.Add(new ProcMesh.Part(tier, new Vector3(x, y + h * 0.18f + f * h * 0.30f, z), Quaternion.identity, new Vector3(r, h * 0.42f, r)));
                }
                trunks.Add(new ProcMesh.Part(trunk, new Vector3(x, y, z), Quaternion.identity, new Vector3(h * 0.07f, h * 0.22f + TrunkSink, h * 0.07f)));
            }
            Mat(root, "Pines_Near", ProcMesh.Combine(near, "PinesNear"), "Dress_Pine");
            Mat(root, "Pines_Far", ProcMesh.Combine(far, "PinesFar"), "Dress_Pine");
            Mat(root, "Pine_Trunks", ProcMesh.Combine(trunks, "PineTrunks"), "Dress_Trunk");
        }

        static GameObject Mat(Transform parent, string name, Mesh mesh, string mat, bool outline = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = MMMaterials.Get(mat);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            if (outline) MeshSmoothNormals.Bake(mesh);
            return go;
        }

        public static readonly Vector2 CabinHalf = new Vector2(2.6f, 2.0f);

        static void BuildCabin(Transform parent, RoadBuilder road, float x, float z)
        {
            float y = road.GroundMin(x, z, CabinHalf.x, CabinHalf.y) - 0.1f;   // the uphill side digs in, the downhill side touches
            var cabin = new GameObject("Cabin"); cabin.transform.SetParent(parent, false); cabin.transform.position = new Vector3(x, y, z);
            var box = ProcMesh.RoundedBox(Vector3.one, 0.06f, 3); MeshSmoothNormals.Bake(box);
            Part(cabin.transform, "Walls", box, "Dress_Cabin", new Vector3(0, 1.5f, 0), new Vector3(5.2f, 3f, 4f));
            var roof = ProcMesh.Cone(1f, 1f, 0f, 4); MeshSmoothNormals.Bake(roof);
            Part(cabin.transform, "Roof", roof, "Dress_Roof", new Vector3(0, 3.0f, 0), new Vector3(4.6f, 2.0f, 3.6f), Quaternion.Euler(0, 45f, 0));
            Part(cabin.transform, "Chimney", box, "Dress_Cabin", new Vector3(1.4f, 4.4f, 0.3f), new Vector3(0.6f, 1.6f, 0.6f));
            var win = Part(cabin.transform, "Window", box, "Toy_Hat", new Vector3(0.6f, 1.7f, -2.02f), new Vector3(1.0f, 0.9f, 0.08f));
            var l = new GameObject("Window_Light").AddComponent<Light>();
            l.transform.SetParent(cabin.transform, false); l.transform.localPosition = new Vector3(0.6f, 1.7f, -3f);
            l.type = LightType.Point; l.range = 9f; l.intensity = 6f; l.color = new Color(1f, 0.72f, 0.38f); l.shadows = LightShadows.None;
            cabin.AddComponent<NightLight>().target = l;
            cabin.transform.rotation = Quaternion.identity;
        }

        static GameObject Part(Transform parent, string name, Mesh mesh, string mat, Vector3 pos, Vector3 scale, Quaternion? rot = null)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = scale; go.transform.localRotation = rot ?? Quaternion.identity;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get(mat);
            return go;
        }

        // one ridge strip: x along the road, z fixed, silhouette from layered noise; vertex colour = snow by height
        static void Layer(Transform parent, string name, Material mat, float x0, float x1, float z, float baseY, float amp, float freq, int seed, float snowLine)
        {
            int cols = Mathf.CeilToInt((x1 - x0) / 3f);
            var v = new List<Vector3>(); var c = new List<Color>(); var uv = new List<Vector2>(); var t = new List<int>();
            for (int i = 0; i <= cols; i++)
            {
                float x = x0 + i * 3f;
                float n = MMMath.Noise1D(x * freq + seed * 17.3f) * 0.55f + MMMath.Noise1D(x * freq * 2.7f + seed * 3.1f) * 0.3f + MMMath.Noise1D(x * freq * 6f + seed) * 0.15f;
                float peak = baseY + amp * (0.35f + 0.65f * (n * 0.5f + 0.5f));
                // top vertex and a lower "snow line" vertex and the base: gives rock below and white above
                v.Add(new Vector3(x, peak, z)); c.Add(new Color(1f, 0f, 0.15f, 1f)); uv.Add(new Vector2(x, 1f));
                v.Add(new Vector3(x, Mathf.Lerp(baseY - 30f, peak, 1f - snowLine * 0.9f), z)); c.Add(new Color(0.8f, 0f, 1f, 1f)); uv.Add(new Vector2(x, 0.5f));
                v.Add(new Vector3(x, baseY - 30f, z)); c.Add(new Color(0f, 0f, 1f, 1f)); uv.Add(new Vector2(x, 0f));
            }
            for (int i = 0; i < cols; i++)
                for (int k = 0; k < 2; k++)
                {
                    int a = i * 3 + k, b = a + 1, a2 = a + 3, b2 = b + 3;
                    // faces the camera (-z): a (upper) -> a2 (upper right) -> b (lower)
                    t.Add(a); t.Add(a2); t.Add(b); t.Add(a2); t.Add(b2); t.Add(b);
                }
            var m = new Mesh { name = name, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            m.SetVertices(v); m.SetColors(c); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            m.RecalculateNormals(); m.RecalculateBounds();
            // lean the face up a touch so it catches light like a slope, not a billboard
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = m;
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }

    /// <summary>Turns a light on at night (cabin window).</summary>
    public sealed class NightLight : MonoBehaviour
    {
        public Light target;
        void Update() { if (target && DayNight.Instance) target.enabled = DayNight.Instance.Night01 > 0.4f; }
    }

    /// <summary>Cheap blob shadow for Low (no realtime shadows). A soft dark disc on the road under the truck.</summary>
    public sealed class BlobShadow : MonoBehaviour
    {
        public Transform truck;
        Transform _quad;
        void Start()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(go.GetComponent<Collider>());
            go.name = "BlobShadowQuad"; go.transform.SetParent(transform, false);
            var mr = go.GetComponent<MeshRenderer>();
            var m = new Material(MMMaterials.Particle(false)) { name = "BlobShadowMat" };
            m.SetColor("_Color", new Color(0.05f, 0.07f, 0.15f, 0.42f)); m.SetFloat("_NearFade", 0.1f);
            mr.sharedMaterial = m; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; mr.receiveShadows = false;
            _quad = go.transform;
        }
        void LateUpdate()
        {
            bool on = QualityPresets.Current.shadowCascades == 0 || !FeatureToggles.Shadows;
            if (_quad == null) return;
            _quad.gameObject.SetActive(on && truck != null);
            if (!on || truck == null) return;
            _quad.position = truck.position + new Vector3(0f, 0.05f, -0.2f);
            _quad.rotation = Quaternion.Euler(90f, 0f, 0f) * Quaternion.Euler(0f, 0f, 0f);
            _quad.rotation = Quaternion.Euler(90f, 0f, 0f);
            _quad.localScale = new Vector3(5.6f, 2.6f, 1f);
        }
    }
}
