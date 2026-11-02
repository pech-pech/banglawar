using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// The inverted-hull outline needs ONE normal per position, otherwise hard edges tear open at the corners.
    /// Bakes the averaged (smoothed) normal into vertex colour RGB (n*0.5+0.5) and sets alpha to 0.5 as a marker.
    /// ToyPlastic's outline pass reads it. Runs for runtime placeholders and, via an AssetPostprocessor, for FBX imports.
    /// </summary>
    public static class MeshSmoothNormals
    {
        public static void Bake(Mesh mesh)
        {
            var verts = mesh.vertices;
            var normals = mesh.normals;
            if (normals == null || normals.Length != verts.Length) { mesh.RecalculateNormals(); normals = mesh.normals; }

            var sum = new Dictionary<Vector3Int, Vector3>(verts.Length);
            const float q = 10000f;
            for (int i = 0; i < verts.Length; i++)
            {
                var key = new Vector3Int(Mathf.RoundToInt(verts[i].x * q), Mathf.RoundToInt(verts[i].y * q), Mathf.RoundToInt(verts[i].z * q));
                sum.TryGetValue(key, out var acc);
                sum[key] = acc + normals[i];
            }
            var colors = new Color[verts.Length];
            for (int i = 0; i < verts.Length; i++)
            {
                var key = new Vector3Int(Mathf.RoundToInt(verts[i].x * q), Mathf.RoundToInt(verts[i].y * q), Mathf.RoundToInt(verts[i].z * q));
                Vector3 n = sum[key].normalized;
                if (n.sqrMagnitude < 0.5f) n = normals[i];
                colors[i] = new Color(n.x * 0.5f + 0.5f, n.y * 0.5f + 0.5f, n.z * 0.5f + 0.5f, 0.5f);
            }
            mesh.colors = colors;
        }
    }
}
