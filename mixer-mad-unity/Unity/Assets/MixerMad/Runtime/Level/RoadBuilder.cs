using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Turns the level's physics road line into a 3D road mesh with snow shoulders and a rock wall.
    /// The top of the road at z = 0 follows the line to within 0.001 m (same polyline, resampled on the same vertices),
    /// so what the player sees under the wheels IS the physics line. There are NO colliders here: collision lives
    /// in the sim only. Visual extras (shoulders, banks, wall) are free to wander in depth.
    ///
    /// Vertex colour: R snow cover, G ice, B cliff wall. UV0 = (distance along road in metres, z).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class RoadBuilder : MonoBehaviour
    {
        [Header("Cross-section (metres, z toward the camera is negative)")]
        public float roadHalfWidth = 2.6f;
        public float frontShoulder = 1.0f;     // snow bank in front of the lane (toward the camera)
        public float backShoulder = 1.4f;
        public float backBankRise = 1.1f;
        public float backHillDepth = 14f;      // hill rising behind the lane
        public float backHillRise = 5f;
        public float baseDepth = 7f;           // how far the wall hangs below the lowest road point
        public float maxSegment = 1.0f;

        public Material roadMaterial;
        public Mesh BuiltMesh { get; private set; }

        struct Prof { public float z, dy, snow, ice, wall; public Prof(float z, float dy, float snow, float ice = 0, float wall = 0) { this.z = z; this.dy = dy; this.snow = snow; this.ice = ice; this.wall = wall; } }

        List<Prof> _prof;
        Vector2[] _line;

        /// <summary>Visual surface height at (x, z) including shoulders and the back hill. Used to plant props.</summary>
        public float HeightAt(float x, float z)
        {
            float baseY = SnowyPassData.HeightAt(_line, x);
            if (_prof == null) return baseY;
            if (z <= _prof[0].z) return baseY + _prof[0].dy;
            for (int i = 0; i < _prof.Count - 1; i++)
                if (z <= _prof[i + 1].z) return baseY + Mathf.Lerp(_prof[i].dy, _prof[i + 1].dy, Mathf.InverseLerp(_prof[i].z, _prof[i + 1].z, z));
            return baseY + _prof[_prof.Count - 1].dy;
        }

        public float BackEdgeZ => roadHalfWidth + backShoulder + backHillDepth;

        public void Build(Vector2[] line, byte[] surface)
        {
            var pts = new List<Vector2>(line.Length * 2);
            var ice = new List<float>(line.Length * 2);
            for (int i = 0; i < line.Length - 1; i++)
            {
                Vector2 a = line[i], b = line[i + 1];
                float s = (surface != null && i < surface.Length && surface[i] == SnowyPassData.Ice) ? 1f : 0f;
                int n = Mathf.Max(1, Mathf.CeilToInt(Vector2.Distance(a, b) / maxSegment));
                for (int k = 0; k < n; k++) { pts.Add(Vector2.Lerp(a, b, (float)k / n)); ice.Add(s); }
            }
            pts.Add(line[line.Length - 1]); ice.Add(ice[ice.Count - 1]);

            // cross-section from the camera side to the hill side
            float zf = -(roadHalfWidth + frontShoulder), zb = roadHalfWidth + backShoulder;
            _line = line;
            _prof = new List<Prof>
            {
                new Prof(zf,                          -0.30f, 1f),   // rounded snow lip at the front edge
                new Prof(-roadHalfWidth - 0.45f,      -0.02f, 1f),
                new Prof(-roadHalfWidth,               0.00f, 0.55f),
                new Prof(-roadHalfWidth * 0.55f,       0.00f, 0.0f, 1f),
                new Prof(0f,                           0.00f, 0.0f, 1f),   // physics line sits here
                new Prof( roadHalfWidth * 0.55f,       0.00f, 0.0f, 1f),
                new Prof( roadHalfWidth,               0.00f, 0.55f),
                new Prof(zb,                           backBankRise, 1f),
                new Prof(zb + backHillDepth * 0.5f,    backBankRise + backHillRise * 0.45f, 1f),
                new Prof(zb + backHillDepth,           backBankRise + backHillRise, 1f),
            };

            var prof = _prof;
            int cols = prof.Count, rows = pts.Count;
            var verts = new List<Vector3>(rows * cols + rows * 2);
            var cols0 = new List<Color>(verts.Capacity);
            var uvs = new List<Vector2>(verts.Capacity);
            var topTris = new List<int>((rows - 1) * (cols - 1) * 6);
            var wallTris = new List<int>((rows - 1) * 6);

            float run = 0f;
            for (int r = 0; r < rows; r++)
            {
                if (r > 0) run += Vector2.Distance(pts[r - 1], pts[r]);
                for (int c = 0; c < cols; c++)
                {
                    var p = prof[c];
                    // ice stays only inside the lane; fade it toward the edges so the lake reads as a frozen strip
                    float iceV = ice[r] * p.ice;
                    verts.Add(new Vector3(pts[r].x, pts[r].y + p.dy, p.z));
                    cols0.Add(new Color(p.snow, iceV, 0f, 1f));
                    uvs.Add(new Vector2(run, p.z));
                }
            }
            for (int r = 0; r < rows - 1; r++)
                for (int c = 0; c < cols - 1; c++)
                {
                    int i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
                    // winding: normal points up (+y) when viewed from above, x forward, z depth
                    topTris.Add(i0); topTris.Add(i1); topTris.Add(i2);
                    topTris.Add(i2); topTris.Add(i1); topTris.Add(i3);
                }

            // front rock wall: from the lip at zf down to the base
            float minY = float.MaxValue;
            for (int r = 0; r < rows; r++) minY = Mathf.Min(minY, pts[r].y);
            float baseY = minY - baseDepth;
            int wallStart = verts.Count;
            for (int r = 0; r < rows; r++)
            {
                run = r == 0 ? 0f : uvs[r * cols].x;
                verts.Add(new Vector3(pts[r].x, pts[r].y - 0.30f, zf));
                cols0.Add(new Color(0.15f, 0f, 1f, 1f));
                uvs.Add(new Vector2(run, 0f));
                verts.Add(new Vector3(pts[r].x, baseY, zf + 0.8f));
                cols0.Add(new Color(0f, 0f, 1f, 1f));
                uvs.Add(new Vector2(run, 1f));
            }
            for (int r = 0; r < rows - 1; r++)
            {
                int a = wallStart + r * 2, b = a + 1, c2 = a + 2, d = a + 3;
                // faces the camera (-z)
                wallTris.Add(a); wallTris.Add(c2); wallTris.Add(b);
                wallTris.Add(c2); wallTris.Add(d); wallTris.Add(b);
            }

            var mesh = new Mesh { name = "MM_Road", indexFormat = verts.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.SetVertices(verts);
            mesh.SetColors(cols0);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(topTris, 0);
            mesh.SetTriangles(wallTris, 1);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            BuiltMesh = mesh;

            var mf = GetComponent<MeshFilter>() ?? gameObject.AddComponent<MeshFilter>();
            var mr = GetComponent<MeshRenderer>() ?? gameObject.AddComponent<MeshRenderer>();
            mf.sharedMesh = mesh;
            mr.sharedMaterials = new[] { roadMaterial, roadMaterial };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            mr.receiveShadows = true;
        }

        /// <summary>Debug: the physics line in the Scene view. This is the only collision source.</summary>
        public Vector2[] debugLine;
        void OnDrawGizmosSelected()
        {
            if (debugLine == null) return;
            Gizmos.color = Color.magenta;
            for (int i = 0; i < debugLine.Length - 1; i++)
                Gizmos.DrawLine(new Vector3(debugLine[i].x, debugLine[i].y, 0), new Vector3(debugLine[i + 1].x, debugLine[i + 1].y, 0));
        }
    }
}
