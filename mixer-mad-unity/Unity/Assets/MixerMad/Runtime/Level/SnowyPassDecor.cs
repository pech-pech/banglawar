using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Snowy mountain pass set dressing, all procedural, all OFF the physics plane (z > 5 or behind the road):
    /// 4 layered ridge silhouettes with fog grading (no outline: background rule), pine stands merged into one
    /// mesh per band, snow fences, orange plough markers, a cabin with a night window light, and a few boulders.
    /// Life never enters the play lane (z in [-3.6, 3.6] is empty of props).
    /// Deterministic: seeded, so every run and every machine builds the same mountains.
    /// </summary>
    public static class SnowyPassDecor
    {
        public static Transform Build(Transform parent, RoadBuilder road, Vector2[] line, int seed = 7)
        {
            var root = new GameObject("Decor").transform;
            root.SetParent(parent, false);
            var rng = new System.Random(seed);
            float x0 = line[0].x - 60f, x1 = line[line.Length - 1].x + 80f;

            // ---- ridge layers (parallax comes free from the perspective camera)
            Layer(root, "Ridge_0", MMMaterials.Snow(), x0, x1, z: 38f, baseY: -2f, amp: 16f, freq: 0.045f, seed: seed + 1, snowLine: 0.35f);
            Layer(root, "Ridge_1", MMMaterials.Snow(), x0, x1, z: 78f, baseY: 2f, amp: 30f, freq: 0.030f, seed: seed + 2, snowLine: 0.25f);
            Layer(root, "Ridge_2", MMMaterials.Snow(), x0, x1, z: 130f, baseY: 8f, amp: 46f, freq: 0.020f, seed: seed + 3, snowLine: 0.2f);
            Layer(root, "Ridge_3", MMMaterials.Snow(), x0, x1, z: 200f, baseY: 14f, amp: 70f, freq: 0.012f, seed: seed + 4, snowLine: 0.15f);

            // ---- pines on the back hill: three merged bands (near / mid / far)
            var pineMesh = new Mesh[3];
            float backZ = road.BackEdgeZ;
            var near = new List<ProcMesh.Part>(); var far = new List<ProcMesh.Part>(); var trunks = new List<ProcMesh.Part>();
            Mesh tier = ProcMesh.Cone(1f, 1f, 0f, 9);
            Mesh trunk = ProcMesh.Cone(0.5f, 1f, 0.35f, 6);
            int count = Mathf.RoundToInt((x1 - x0) / 5.5f);
            for (int i = 0; i < count; i++)
            {
                float x = x0 + (i + (float)rng.NextDouble()) * 5.5f;
                float z = Mathf.Lerp(road.roadHalfWidth + road.backShoulder + 3.5f, backZ + 18f, (float)rng.NextDouble());
                if (z < 7.5f) z = 7.5f;                                              // nothing near the lane
                if ((float)rng.NextDouble() < 0.18f) continue;                       // gaps for rhythm
                float y = z <= backZ ? road.HeightAt(x, z) : road.HeightAt(x, backZ) + (z - backZ) * 0.22f;
                float h = Mathf.Lerp(3.2f, 7.5f, (float)rng.NextDouble());
                var list = z < 14f ? near : far;
                // 3 stacked cones
                for (int t = 0; t < 3; t++)
                {
                    float f = t / 3f;
                    float r = Mathf.Lerp(1.5f, 0.7f, f) * h * 0.30f;
                    float th = h * 0.42f;
                    var p = new Vector3(x, y + h * 0.18f + f * h * 0.30f, z);
                    list.Add(new ProcMesh.Part(tier, p, Quaternion.identity, new Vector3(r, th, r)));
                }
                trunks.Add(new ProcMesh.Part(trunk, new Vector3(x, y, z), Quaternion.identity, new Vector3(h * 0.07f, h * 0.22f, h * 0.07f)));
            }
            Mesh Merge(List<ProcMesh.Part> parts, string n) { var m = ProcMesh.Combine(parts, n); return m; }
            Mat(root, "Pines_Near", Merge(near, "PinesNear"), "Dress_Pine");
            Mat(root, "Pines_Far", Merge(far, "PinesFar"), "Dress_Pine");
            Mat(root, "Pine_Trunks", Merge(trunks, "PineTrunks"), "Dress_Trunk");

            // ---- snow fences along the back shoulder + orange plough markers on the front edge
            var fence = new List<ProcMesh.Part>(); var poles = new List<ProcMesh.Part>();
            Mesh post = ProcMesh.RoundedBox(new Vector3(0.12f, 1.4f, 0.12f), 0.04f, 3);
            Mesh slat = ProcMesh.RoundedBox(new Vector3(2.4f, 0.14f, 0.05f), 0.02f, 2);
            for (float x = x0 + 20f; x < x1 - 60f; x += 2.5f)
            {
                if ((int)(x / 2.5f) % 11 > 6) continue;                              // fence comes in runs
                float z = road.roadHalfWidth + road.backShoulder + 0.5f;
                float y = road.HeightAt(x, z);
                fence.Add(new ProcMesh.Part(post, new Vector3(x, y + 0.7f, z), Quaternion.identity));
                fence.Add(new ProcMesh.Part(slat, new Vector3(x + 1.25f, y + 0.5f, z - 0.05f), Quaternion.identity));
                fence.Add(new ProcMesh.Part(slat, new Vector3(x + 1.25f, y + 1.0f, z - 0.05f), Quaternion.identity));
            }
            Mesh pole = ProcMesh.RoundedBox(new Vector3(0.10f, 2.0f, 0.10f), 0.04f, 3);
            for (float x = x0 + 30f; x < x1 - 60f; x += 12f)
            {
                float z = -(road.roadHalfWidth + 0.55f);
                float y = road.HeightAt(x, z);
                poles.Add(new ProcMesh.Part(pole, new Vector3(x, y + 1.0f, z), Quaternion.identity));
            }
            Mat(root, "SnowFences", ProcMesh.Combine(fence, "Fences"), "Dress_Trunk");
            Mat(root, "PloughMarkers", ProcMesh.Combine(poles, "Poles"), "Dress_Pole", outline: true);

            // ---- cabin on the hill near the lake (warm window light at night)
            BuildCabin(root, road, 128f, 15f);

            // ---- boulders (snow-capped)
            var rocks = new List<ProcMesh.Part>();
            Mesh rockMesh = ProcMesh.Sphere(0.5f, 6, 10);
            for (int i = 0; i < 26; i++)
            {
                float x = Mathf.Lerp(x0 + 30f, x1 - 50f, (float)rng.NextDouble());
                float z = Mathf.Lerp(7f, 20f, (float)rng.NextDouble());
                float s = Mathf.Lerp(0.8f, 2.2f, (float)rng.NextDouble());
                rocks.Add(new ProcMesh.Part(rockMesh, new Vector3(x, road.HeightAt(x, z) + s * 0.2f, z), Quaternion.Euler(0, (float)rng.NextDouble() * 360f, 0), new Vector3(s * 1.3f, s * 0.8f, s)));
            }
            Mat(root, "Boulders", ProcMesh.Combine(rocks, "Boulders"), "Dress_Roof");
            return root;
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

        static void BuildCabin(Transform parent, RoadBuilder road, float x, float z)
        {
            float y = road.HeightAt(x, z);
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
