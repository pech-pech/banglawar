using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// The front cut face of the road bank (the wall the camera looks at below the lane), S1 style:
    /// a rounded snow overhang, a navy line tucked under it, then matte frozen-soil strata with pebbles,
    /// dark ambient occlusion right under the lip and a vertical gradient that darkens toward the bottom.
    ///
    /// The face is part of the road mesh (submesh 1, SnowIce material). Its look comes from vertex colour:
    /// R snow, B dirt, A shade (the shader multiplies albedo by A). Strata boundaries get two vertices each
    /// (same position, different colour) so the bands are crisp, and wobble along x so they read as soil, not stripes.
    /// The navy line, icicles and pebbles are small extra meshes with the shared toy materials.
    /// Deterministic: seeded, the same on every run and machine.
    /// </summary>
    public static class CutFace
    {
        public const float LipDrop = -0.30f;        // top of the face below the road line (same as the road's front lip)
        public const float OverhangOut = 0.27f;     // how far the snow lip sticks out toward the camera
        public const float LineTop = -0.745f, LineBottom = -0.90f;    // navy line, below the road line
        public const float BandStep = 1.15f;        // average stratum thickness (m)
        public const float Lean = 0.8f;             // the face leans back this much from top to base
        const float DirtTop = -1.35f;               // where the strata start
        const int MaxBands = 16;

        struct Entry { public float dz, dy; public Color c; public Entry(float dz, float dy, Color c) { this.dz = dz; this.dy = dy; this.c = c; } }

        static Color Snow(float a) => new Color(1f, 0f, 0f, a);
        static Color Dirt(float a) => new Color(0f, 0f, 1f, a);

        // the fixed top of every section: overhang, the dark tuck under it, the first dirt
        static readonly Entry[] Top =
        {
            new Entry( 0.00f, LipDrop, Snow(1f)),
            new Entry(-0.20f, -0.38f, Snow(1f)),
            new Entry(-OverhangOut, -0.55f, Snow(0.95f)),
            new Entry(-0.18f, -0.70f, Snow(0.8f)),
            new Entry(-0.03f, -0.76f, Snow(0.7f)),
            new Entry(-0.03f, -0.76f, Dirt(0.30f)),     // same spot, dirt colour: a crisp edge with deep shade under the lip
            new Entry( 0.00f, -1.00f, Dirt(0.50f)),
            new Entry( 0.02f, DirtTop, Dirt(0.85f)),
        };

        // stratum colours (R snow frost, B dirt, A shade): brown, frosted, grey-brown, dark
        static readonly Color[] Bands =
        {
            new Color(0f, 0f, 1f, 1f),
            new Color(0.22f, 0f, 0.85f, 1f),
            new Color(0f, 0f, 0.55f, 0.92f),
            new Color(0f, 0f, 1f, 0.76f),
        };

        /// <summary>Wobble of stratum boundary k at x (metres, about +-0.3).</summary>
        public static float Wobble(float x, int k) => 0.3f * MMMath.Noise1D(x * 0.13f + k * 7.7f);

        /// <summary>Depth below the road line of stratum boundary k at x.</summary>
        public static float BandDepth(float x, int k) => -DirtTop + 0.25f + k * BandStep + Wobble(x, k);

        /// <summary>Darkening toward the bottom of the face: 1 at the top, 0.72 six metres down.</summary>
        public static float Gradient(float depth) => Mathf.Lerp(1f, 0.72f, Mathf.Clamp01(depth / 6f));

        /// <summary>z of the face at height y (it leans back from the strata top to the base).</summary>
        public static float FaceZ(float top, float y, float zf, float baseY)
        {
            float faceTop = top + DirtTop, span = Mathf.Max(0.01f, faceTop - baseY);
            return zf + 0.02f + Lean * Mathf.Clamp01((faceTop - y) / span);
        }

        /// <summary>Appends the face to the road's vertex lists; returns its triangles (facing the camera, -z).</summary>
        public static List<int> Build(List<Vector2> pts, float zf, float baseY, List<Vector3> verts, List<Color> colors, List<Vector2> uvs)
        {
            float maxTop = float.MinValue;
            for (int r = 0; r < pts.Count; r++) maxTop = Mathf.Max(maxTop, pts[r].y);
            int bands = Mathf.Clamp(Mathf.CeilToInt((maxTop - baseY + DirtTop) / BandStep) + 1, 1, MaxBands);
            int perRow = Top.Length + bands * 2 + 1;

            int start = verts.Count;
            float run = 0f;
            for (int r = 0; r < pts.Count; r++)
            {
                if (r > 0) run += Vector2.Distance(pts[r - 1], pts[r]);
                AppendSection(pts[r].x, pts[r].y, zf, baseY, bands, run, verts, colors, uvs);
            }

            var tris = new List<int>((pts.Count - 1) * (perRow - 1) * 6);
            for (int r = 0; r < pts.Count - 1; r++)
                for (int k = 0; k < perRow - 1; k++)
                {
                    int a = start + r * perRow + k, b = a + 1, c = a + perRow, d = c + 1;
                    tris.Add(a); tris.Add(c); tris.Add(b);
                    tris.Add(c); tris.Add(d); tris.Add(b);
                }
            return tris;
        }

        static void AppendSection(float x, float top, float zf, float baseY, int bands, float run, List<Vector3> verts, List<Color> colors, List<Vector2> uvs)
        {
            float faceTop = top + DirtTop;
            void Add(float y, float dz, Color c)
            {
                y = Mathf.Max(y, baseY);
                float depth = top - y;
                c.a *= Gradient(depth);
                verts.Add(new Vector3(x, y, zf + dz));
                colors.Add(c);
                uvs.Add(new Vector2(run, Mathf.Clamp01(depth / 12f)));
            }
            float LeanAt(float y) => FaceZ(top, y, zf, baseY) - zf;

            foreach (var e in Top) Add(top + e.dy, e.dz, e.c);
            float prev = faceTop;
            for (int k = 0; k < bands; k++)
            {
                float y = Mathf.Min(prev, top - BandDepth(x, k));      // never above the band before it
                prev = y;
                Add(y, LeanAt(y), Bands[k % Bands.Length]);              // bottom of band k
                Add(y, LeanAt(y), Bands[(k + 1) % Bands.Length]);        // top of band k+1, same spot
            }
            Add(baseY, LeanAt(baseY), Bands[bands % Bands.Length]);
        }

        // ------------------------------------------------------------------ details: navy line, icicles, pebbles

        /// <summary>Builds the navy line, icicles and pebbles as children of the road.</summary>
        public static Transform BuildDetails(Transform parent, List<Vector2> pts, float zf, float baseY, int seed = 11)
        {
            var root = new GameObject("CutFaceDetails").transform;
            root.SetParent(parent, false);
            Renderer(root, "LipLine", NavyLine(pts, zf), "Toy_Navy", false);
            var rng = new System.Random(seed);
            Renderer(root, "Icicles", Icicles(pts, zf, rng), "Dress_Roof", true);
            Renderer(root, "Pebbles", Pebbles(pts, zf, baseY, rng), "Dress_Roof", false);
            return root;
        }

        static void Renderer(Transform parent, string name, Mesh mesh, string mat, bool shadows)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = MMMaterials.Get(mat);
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        /// <summary>A thin strip just under the snow overhang, slightly proud of the face.</summary>
        public static Mesh NavyLine(List<Vector2> pts, float zf)
        {
            var v = new List<Vector3>(pts.Count * 2); var n = new List<Vector3>(v.Capacity); var uv = new List<Vector2>(v.Capacity); var t = new List<int>();
            Vector3 normal = new Vector3(0f, 0.2f, -1f).normalized;
            for (int r = 0; r < pts.Count; r++)
            {
                v.Add(new Vector3(pts[r].x, pts[r].y + LineTop, zf - 0.045f));
                v.Add(new Vector3(pts[r].x, pts[r].y + LineBottom, zf - 0.03f));
                n.Add(normal); n.Add(normal);
                uv.Add(new Vector2(pts[r].x, 1f)); uv.Add(new Vector2(pts[r].x, 0f));
            }
            for (int r = 0; r < pts.Count - 1; r++)
            {
                int a = r * 2, b = a + 1, c = a + 2, d = a + 3;
                t.Add(a); t.Add(c); t.Add(b);
                t.Add(c); t.Add(d); t.Add(b);
            }
            var m = new Mesh { name = "CutFaceLine", indexFormat = v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv); m.SetTriangles(t, 0); m.RecalculateBounds();
            return m;
        }

        /// <summary>Line height at x by linear interpolation over the (x-sorted) resampled points.</summary>
        public static float TopAt(List<Vector2> pts, float x)
        {
            if (x <= pts[0].x) return pts[0].y;
            int lo = 0, hi = pts.Count - 1;
            if (x >= pts[hi].x) return pts[hi].y;
            while (hi - lo > 1) { int mid = (lo + hi) >> 1; if (pts[mid].x <= x) lo = mid; else hi = mid; }
            return Mathf.Lerp(pts[lo].y, pts[hi].y, Mathf.InverseLerp(pts[lo].x, pts[hi].x, x));
        }

        static float Rand(System.Random rng, float a, float b) => Mathf.Lerp(a, b, (float)rng.NextDouble());

        static Mesh Icicles(List<Vector2> pts, float zf, System.Random rng)
        {
            var parts = new List<ProcMesh.Part>();
            Mesh cone = ProcMesh.Cone(1f, 1f, 0f, 6);
            Quaternion down = Quaternion.Euler(180f, 0f, 0f);
            for (float x = pts[0].x; x < pts[pts.Count - 1].x; x += 0.5f)
            {
                if (rng.NextDouble() < 0.5) continue;
                float xi = x + Rand(rng, -0.15f, 0.15f);
                float slope = Mathf.Abs(TopAt(pts, xi + 0.5f) - TopAt(pts, xi - 0.5f));
                if (slope > 0.5f) continue;                                             // no icicles on steep drops
                float len = Rand(rng, 0.12f, 0.42f), r = Rand(rng, 0.035f, 0.07f);
                parts.Add(new ProcMesh.Part(cone, new Vector3(xi, TopAt(pts, xi) - 0.70f, zf - 0.12f), down, new Vector3(r, len, r)));
            }
            return ProcMesh.Combine(parts, "Icicles");
        }

        static Mesh Pebbles(List<Vector2> pts, float zf, float baseY, System.Random rng)
        {
            var parts = new List<ProcMesh.Part>();
            Mesh ball = ProcMesh.Sphere(0.5f, 4, 7);
            for (float x = pts[0].x; x < pts[pts.Count - 1].x; x += 0.8f)
            {
                if (rng.NextDouble() < 0.35) continue;
                float xi = x + Rand(rng, -0.3f, 0.3f), top = TopAt(pts, xi);
                float depth = Rand(rng, 1.5f, 5.5f);
                float s = Rand(rng, 0.10f, 0.26f);
                // the face leans back with depth; sit the pebble half in it
                float z = FaceZ(top, top - depth, zf, baseY) - s * 0.15f;
                parts.Add(new ProcMesh.Part(ball, new Vector3(xi, top - depth, z), Quaternion.Euler(0f, 0f, Rand(rng, -40f, 40f)), new Vector3(s * 1.3f, s * 0.85f, s * 0.7f)));
            }
            return ProcMesh.Combine(parts, "Pebbles");
        }
    }
}
