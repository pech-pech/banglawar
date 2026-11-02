using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Turns the level's physics road line into a 3D road mesh with snow shoulders, a back hill and a cut face.
    /// The top of the road at z = 0 follows the line to within 0.001 m (same polyline, resampled on the same vertices),
    /// so what the player sees under the wheels IS the physics line. There are NO colliders here: collision lives
    /// in the sim only. Visual extras (shoulders, banks, the cut face) are free to wander in depth.
    ///
    /// The back hill follows a SMOOTHED copy of the line (moving average), blended in from the lane edge, so a sharp
    /// step in the road (the ramp lip) does not raise a tall flat wall behind the lane.
    /// The front cut face is built by <see cref="CutFace"/> (snow overhang, navy line, frozen-soil strata, AO).
    ///
    /// Vertex colour: R snow cover, G ice, B cliff wall, A shade (1 = none). UV0 = (distance along road in metres, z).
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
        public float plateauDepth = 16f;       // gentle ground behind the crest, so far pines stand on something
        public float plateauRise = 2f;
        public float backSmoothRadius = 7f;    // moving-average half width (m) for the back hill
        public float baseDepth = 7f;           // how far the cut face hangs below the lowest road point
        public float maxSegment = 1.0f;

        public Material roadMaterial;
        public Mesh BuiltMesh { get; private set; }
        /// <summary>The cut-face extras (navy line, icicles, pebbles), built with the road.</summary>
        public Transform Details { get; private set; }

        struct Prof { public float z, dy, snow, ice; public Prof(float z, float dy, float snow, float ice = 0) { this.z = z; this.dy = dy; this.snow = snow; this.ice = ice; } }

        List<Prof> _prof;
        Vector2[] _line;

        /// <summary>Edge of the play lane (the truck never comes nearer the camera or the hill than this).</summary>
        public float LaneEdgeZ => roadHalfWidth + frontShoulder;
        /// <summary>Front lip of the road top, where the cut face starts.</summary>
        public float FrontLipZ => -(roadHalfWidth + frontShoulder);
        public float BackEdgeZ => roadHalfWidth + backShoulder + backHillDepth + plateauDepth;
        public Vector2[] Line => _line;

        /// <summary>Road line height at x (the physics line, linear between points).</summary>
        public float LineAt(float x) => SnowyPassData.HeightAt(_line, x);

        /// <summary>Moving average of the line around x (triangle weights, 1 m steps).</summary>
        public float SmoothLineAt(float x)
        {
            int r = Mathf.Max(1, Mathf.RoundToInt(backSmoothRadius));
            float sum = 0f, wsum = 0f;
            for (int k = -r; k <= r; k++)
            {
                float w = r + 1 - Mathf.Abs(k);
                sum += w * SnowyPassData.HeightAt(_line, x + k); wsum += w;
            }
            return sum / wsum;
        }

        /// <summary>How much of the smoothed line a point at depth z follows: 0 on the lane and in front, 1 well up the hill.</summary>
        public float SmoothWeight(float z) => z <= roadHalfWidth ? 0f : Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(roadHalfWidth, roadHalfWidth + backShoulder + 3f, z));

        /// <summary>Visual surface height at (x, z) including shoulders and the back hill. Used to plant props.</summary>
        public float HeightAt(float x, float z)
        {
            if (_line == null) return 0f;
            float lineY = LineAt(x);
            if (_prof == null) return lineY;
            float w = SmoothWeight(z);
            float baseY = w > 0f ? Mathf.Lerp(lineY, SmoothLineAt(x), w) : lineY;
            return baseY + ProfileDy(z);
        }

        float ProfileDy(float z)
        {
            if (z <= _prof[0].z) return _prof[0].dy;
            for (int i = 0; i < _prof.Count - 1; i++)
                if (z <= _prof[i + 1].z) return Mathf.Lerp(_prof[i].dy, _prof[i + 1].dy, Mathf.InverseLerp(_prof[i].z, _prof[i + 1].z, z));
            return _prof[_prof.Count - 1].dy;
        }

        /// <summary>Lowest visual ground under a rectangle (centre plus corners and edge midpoints). Props use it to sit, never hover.</summary>
        public float GroundMin(float x, float z, float halfX, float halfZ)
        {
            float m = HeightAt(x, z);
            for (int i = -1; i <= 1; i++)
                for (int k = -1; k <= 1; k++)
                    m = Mathf.Min(m, HeightAt(x + i * halfX, z + k * halfZ));
            return m;
        }

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

            _line = line;
            _prof = MakeProfile();

            var verts = new List<Vector3>(pts.Count * 40);
            var colors = new List<Color>(verts.Capacity);
            var uvs = new List<Vector2>(verts.Capacity);
            var topTris = BuildTop(pts, ice, verts, colors, uvs);
            float wallBase = MinY(pts) - baseDepth;
            var wallTris = CutFace.Build(pts, FrontLipZ, wallBase, verts, colors, uvs);

            var mesh = new Mesh { name = "MM_Road", indexFormat = verts.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.SetVertices(verts);
            mesh.SetColors(colors);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(topTris, 0);
            mesh.SetTriangles(wallTris, 1);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            BuiltMesh = mesh;

            var mf = TryGetComponent<MeshFilter>(out var mf0) ? mf0 : gameObject.AddComponent<MeshFilter>();
            var mr = TryGetComponent<MeshRenderer>(out var mr0) ? mr0 : gameObject.AddComponent<MeshRenderer>();
            mf.sharedMesh = mesh;
            mr.sharedMaterials = new[] { roadMaterial, roadMaterial };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            mr.receiveShadows = true;

            if (Details != null) DestroyImmediate(Details.gameObject);
            Details = CutFace.BuildDetails(transform, pts, FrontLipZ, wallBase);
        }

        static float MinY(List<Vector2> pts)
        {
            float m = float.MaxValue;
            for (int r = 0; r < pts.Count; r++) m = Mathf.Min(m, pts[r].y);
            return m;
        }

        List<Prof> MakeProfile()
        {
            float zf = FrontLipZ, zb = roadHalfWidth + backShoulder, crest = zb + backHillDepth;
            return new List<Prof>
            {
                new Prof(zf,                          CutFace.LipDrop, 1f),   // rounded snow lip at the front edge
                new Prof(-roadHalfWidth - 0.45f,      -0.02f, 1f),
                new Prof(-roadHalfWidth,               0.00f, 0.55f),
                new Prof(-roadHalfWidth * 0.55f,       0.00f, 0.0f, 1f),
                new Prof(0f,                           0.00f, 0.0f, 1f),   // physics line sits here
                new Prof( roadHalfWidth * 0.55f,       0.00f, 0.0f, 1f),
                new Prof( roadHalfWidth,               0.00f, 0.55f),
                new Prof(zb,                           backBankRise, 1f),
                new Prof(zb + backHillDepth * 0.5f,    backBankRise + backHillRise * 0.45f, 1f),
                new Prof(crest,                        backBankRise + backHillRise, 1f),
                new Prof(crest + plateauDepth * 0.5f,  backBankRise + backHillRise + plateauRise * 0.6f, 1f),
                new Prof(crest + plateauDepth,         backBankRise + backHillRise + plateauRise, 1f),
            };
        }

        List<int> BuildTop(List<Vector2> pts, List<float> ice, List<Vector3> verts, List<Color> colors, List<Vector2> uvs)
        {
            int cols = _prof.Count, rows = pts.Count;
            var tris = new List<int>((rows - 1) * (cols - 1) * 6);
            float run = 0f;
            for (int r = 0; r < rows; r++)
            {
                if (r > 0) run += Vector2.Distance(pts[r - 1], pts[r]);
                float x = pts[r].x, smooth = SmoothLineAt(x);
                for (int c = 0; c < cols; c++)
                {
                    var p = _prof[c];
                    float w = SmoothWeight(p.z);
                    float y = Mathf.Lerp(pts[r].y, smooth, w) + p.dy;
                    // ice stays only inside the lane; fade it toward the edges so the lake reads as a frozen strip
                    verts.Add(new Vector3(x, y, p.z));
                    colors.Add(new Color(p.snow, ice[r] * p.ice, 0f, 1f));
                    uvs.Add(new Vector2(run, p.z));
                }
            }
            for (int r = 0; r < rows - 1; r++)
                for (int c = 0; c < cols - 1; c++)
                {
                    int i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
                    // winding: normal points up (+y) when viewed from above, x forward, z depth
                    tris.Add(i0); tris.Add(i1); tris.Add(i2);
                    tris.Add(i2); tris.Add(i1); tris.Add(i3);
                }
            return tris;
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
