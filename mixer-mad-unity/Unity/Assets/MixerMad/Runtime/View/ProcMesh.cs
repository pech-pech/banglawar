using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Procedural toy meshes for the placeholder art: rounded boxes (bevelled like the Blender trucks will be),
    /// lathe solids, and a combiner. Everything is built at 1 m scale with the pivot where the part would hinge.
    /// Normals are smooth; MeshSmoothNormals bakes the outline normals afterwards.
    /// </summary>
    public static class ProcMesh
    {
        /// <summary>Box with rounded edges and corners, centred on the origin.</summary>
        public static Mesh RoundedBox(Vector3 size, float radius, int seg = 6)
        {
            Vector3 h = size * 0.5f;
            radius = Mathf.Min(radius, Mathf.Min(h.x, Mathf.Min(h.y, h.z)) - 0.001f);
            var verts = new List<Vector3>(); var norms = new List<Vector3>(); var uvs = new List<Vector2>(); var tris = new List<int>();
            Vector3[] axes = { Vector3.right, Vector3.up, Vector3.forward };
            for (int face = 0; face < 6; face++)
            {
                int ax = face % 3; float sign = face < 3 ? 1f : -1f;
                Vector3 n = axes[ax] * sign;
                Vector3 u = axes[(ax + 1) % 3], v = axes[(ax + 2) % 3];
                int start = verts.Count;
                for (int j = 0; j <= seg; j++)
                    for (int i = 0; i <= seg; i++)
                    {
                        float a = (i / (float)seg) * 2f - 1f, b = (j / (float)seg) * 2f - 1f;
                        Vector3 p = n + u * a + v * b;                       // point on the unit cube surface
                        Vector3 q = new Vector3(p.x * h.x, p.y * h.y, p.z * h.z);
                        Vector3 inner = new Vector3(
                            Mathf.Clamp(q.x, -(h.x - radius), h.x - radius),
                            Mathf.Clamp(q.y, -(h.y - radius), h.y - radius),
                            Mathf.Clamp(q.z, -(h.z - radius), h.z - radius));
                        Vector3 dir = q - inner;
                        Vector3 nn = dir.sqrMagnitude > 1e-8f ? dir.normalized : n;
                        verts.Add(inner + nn * radius); norms.Add(nn);
                        uvs.Add(new Vector2(i / (float)seg, j / (float)seg));
                    }
                for (int j = 0; j < seg; j++)
                    for (int i = 0; i < seg; i++)
                    {
                        int i0 = start + j * (seg + 1) + i, i1 = i0 + 1, i2 = i0 + seg + 1, i3 = i2 + 1;
                        // orient by the geometric normal so winding is right for either handedness
                        bool flip = Vector3.Dot(Vector3.Cross(u, v), n) > 0f;
                        if (!flip) { tris.Add(i0); tris.Add(i2); tris.Add(i1); tris.Add(i1); tris.Add(i2); tris.Add(i3); }
                        else { tris.Add(i0); tris.Add(i1); tris.Add(i2); tris.Add(i1); tris.Add(i3); tris.Add(i2); }
                    }
            }
            return Make("RoundedBox", verts, norms, uvs, tris);
        }

        /// <summary>
        /// Solid of revolution around the local Z axis. profile = (radius, z). Close the ends by starting and
        /// ending the profile at radius 0. Smooth normals from the profile.
        /// </summary>
        public static Mesh Lathe(IList<Vector2> profile, int segments = 28)
        {
            var verts = new List<Vector3>(); var norms = new List<Vector3>(); var uvs = new List<Vector2>(); var tris = new List<int>();
            int rows = profile.Count;
            for (int r = 0; r < rows; r++)
            {
                Vector2 prev = profile[Mathf.Max(0, r - 1)], next = profile[Mathf.Min(rows - 1, r + 1)];
                Vector2 tan = (next - prev).normalized;
                Vector2 nProf = new Vector2(tan.y, -tan.x);   // outward in (radius, z)
                for (int s = 0; s <= segments; s++)
                {
                    float a = s / (float)segments * Mathf.PI * 2f;
                    float c = Mathf.Cos(a), sn = Mathf.Sin(a);
                    verts.Add(new Vector3(profile[r].x * c, profile[r].x * sn, profile[r].y));
                    norms.Add(new Vector3(nProf.x * c, nProf.x * sn, nProf.y).normalized);
                    uvs.Add(new Vector2(s / (float)segments, r / (float)(rows - 1)));
                }
            }
            for (int r = 0; r < rows - 1; r++)
                for (int s = 0; s < segments; s++)
                {
                    int i0 = r * (segments + 1) + s, i1 = i0 + 1, i2 = i0 + segments + 1, i3 = i2 + 1;
                    tris.Add(i0); tris.Add(i1); tris.Add(i2); tris.Add(i1); tris.Add(i3); tris.Add(i2);
                }
            var m = Make("Lathe", verts, norms, uvs, tris);
            // make sure faces point outward whichever way the profile ran
            if (SignedVolume(m) < 0f) FlipWinding(m);
            return m;
        }

        /// <summary>Tyre: rounded-rectangle ring around Z, outer radius r, width w. Hub disc closes the middle.</summary>
        public static Mesh Wheel(float r, float w, float hubR)
        {
            var p = new List<Vector2>();
            float hw = w * 0.5f, bev = Mathf.Min(0.12f, w * 0.35f);
            p.Add(new Vector2(0f, -hw));
            p.Add(new Vector2(hubR, -hw));
            p.Add(new Vector2(r - bev, -hw));
            for (int i = 1; i <= 4; i++) { float a = i / 4f * Mathf.PI * 0.5f; p.Add(new Vector2(r - bev + Mathf.Sin(a) * bev, -hw + bev - Mathf.Cos(a) * bev)); }
            for (int i = 0; i <= 4; i++) { float a = i / 4f * Mathf.PI * 0.5f; p.Add(new Vector2(r - bev + Mathf.Cos(a) * bev, hw - bev + Mathf.Sin(a) * bev)); }
            p.Add(new Vector2(r - bev, hw));
            p.Add(new Vector2(hubR, hw));
            p.Add(new Vector2(0f, hw));
            return Lathe(p, 32);
        }

        /// <summary>Radius of the mixer drum at t (0 = open rear mouth, 1 = domed front).</summary>
        public static float DrumRadius(float t, float maxR, float endR)
        {
            float r = t < 0.5f ? Mathf.Lerp(endR, maxR, Mathf.SmoothStep(0f, 1f, t / 0.5f)) : maxR;
            if (t > 0.82f) { float k = (t - 0.82f) / 0.18f; r = maxR * Mathf.Sqrt(Mathf.Max(0f, 1f - k * k)); }
            return r;
        }

        /// <summary>Mixer drum along Z (rear at -Z, domed front at +Z), length L. Rotate to X with Euler(0,90,0).</summary>
        public static Mesh Drum(float length, float maxR, float endR)
        {
            var p = new List<Vector2> { new Vector2(0f, -length * 0.5f), new Vector2(endR * 0.62f, -length * 0.5f) };
            int n = 18;
            for (int i = 0; i <= n; i++)
            {
                float t = i / (float)n;
                p.Add(new Vector2(DrumRadius(t, maxR, endR), -length * 0.5f + t * length));
            }
            p[p.Count - 1] = new Vector2(0f, length * 0.5f);
            return Lathe(p, 40);
        }

        /// <summary>Torus-like ring around Z (stripe band on the drum).</summary>
        public static Mesh Ring(float radius, float tube, int segs = 36)
        {
            var p = new List<Vector2>();
            for (int i = 0; i <= 8; i++) { float a = i / 8f * Mathf.PI * 2f; p.Add(new Vector2(radius + Mathf.Cos(a) * tube, Mathf.Sin(a) * tube)); }
            return Lathe(p, segs);
        }

        public static Mesh Sphere(float radius, int lat = 12, int lon = 20)
        {
            var p = new List<Vector2>();
            for (int i = 0; i <= lat; i++) { float a = -Mathf.PI * 0.5f + i / (float)lat * Mathf.PI; p.Add(new Vector2(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius)); }
            p[0] = new Vector2(0, p[0].y); p[p.Count - 1] = new Vector2(0, p[p.Count - 1].y);
            return Lathe(p, lon);
        }

        /// <summary>Cone / tapered cylinder along +Y from y=0 (pine tier).</summary>
        public static Mesh Cone(float rBase, float height, float rTop = 0f, int segs = 10)
        {
            var p = new List<Vector2> { new Vector2(0, 0), new Vector2(rBase, 0), new Vector2(rTop, height) };
            if (rTop > 0f) p.Add(new Vector2(0, height)); else p[2] = new Vector2(0, height);
            return Transformed(Lathe(p, segs), Matrix4x4.Rotate(Quaternion.Euler(-90f, 0f, 0f)));
        }

        public static Mesh Transformed(Mesh m, Matrix4x4 t)
        {
            var v = m.vertices; var n = m.normals;
            var nm = t.inverse.transpose;
            for (int i = 0; i < v.Length; i++) { v[i] = t.MultiplyPoint3x4(v[i]); n[i] = nm.MultiplyVector(n[i]).normalized; }
            m.vertices = v; m.normals = n; m.RecalculateBounds();
            if (t.determinant < 0f) FlipWinding(m);
            return m;
        }

        public struct Part { public Mesh mesh; public Matrix4x4 matrix; public Part(Mesh m, Vector3 pos, Quaternion rot) { mesh = m; matrix = Matrix4x4.TRS(pos, rot, Vector3.one); }
            public Part(Mesh m, Vector3 pos, Quaternion rot, Vector3 scale) { mesh = m; matrix = Matrix4x4.TRS(pos, rot, scale); } }

        public static Mesh Combine(IList<Part> parts, string name)
        {
            var verts = new List<Vector3>(); var norms = new List<Vector3>(); var uvs = new List<Vector2>(); var tris = new List<int>();
            foreach (var part in parts)
            {
                int off = verts.Count;
                var v = part.mesh.vertices; var n = part.mesh.normals; var uv = part.mesh.uv; var t = part.mesh.triangles;
                var nm = part.matrix.inverse.transpose;
                for (int i = 0; i < v.Length; i++)
                {
                    verts.Add(part.matrix.MultiplyPoint3x4(v[i])); norms.Add(nm.MultiplyVector(n[i]).normalized);
                    uvs.Add(uv.Length > i ? uv[i] : Vector2.zero);
                }
                for (int i = 0; i < t.Length; i++) tris.Add(t[i] + off);
            }
            var m = Make(name, verts, norms, uvs, tris);
            return m;
        }

        static Mesh Make(string name, List<Vector3> v, List<Vector3> n, List<Vector2> uv, List<int> t)
        {
            var m = new Mesh { name = name, indexFormat = v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            m.SetVertices(v); m.SetNormals(n); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            m.RecalculateBounds();
            return m;
        }

        static float SignedVolume(Mesh m)
        {
            var v = m.vertices; var t = m.triangles; float vol = 0f;
            for (int i = 0; i < t.Length; i += 3) vol += Vector3.Dot(v[t[i]], Vector3.Cross(v[t[i + 1]], v[t[i + 2]]));
            // Unity front faces are clockwise seen from outside; with the plain cross-product formula that gives vol > 0
            return vol;
        }

        static void FlipWinding(Mesh m)
        {
            var t = m.triangles;
            for (int i = 0; i < t.Length; i += 3) { int a = t[i]; t[i] = t[i + 1]; t[i + 1] = a; }
            m.triangles = t;
        }
    }
}
