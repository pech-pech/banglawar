using UnityEditor;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Editor
{
    /// <summary>
    /// FBX files under Assets/MixerMad/Art/Models:
    ///  - bakes smoothed normals into vertex colour (alpha 0.5 marker) for the inverted-hull outline
    ///  - warns about missing node names the TruckView needs
    /// Blender export: Apply Transform on, +X forward, +Y up (FBX default: -Z forward, Y up, so set Forward = X, Up = Y),
    /// scale 1.0 = 1 m, "Apply Scalings: FBX Units Scale". Origin at the chassis bottom centre.
    /// </summary>
    public sealed class ModelPostprocessor : AssetPostprocessor
    {
        const string Root = "Assets/MixerMad/Art/Models/";

        // Bump when the import logic changes so Unity re-imports the models.
        public override uint GetVersion() { return 4; }

        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(Root)) return;
            var mi = (ModelImporter)assetImporter;
            mi.isReadable = true;                 // needed to bake outline normals at import
            mi.bakeAxisConversion = true;         // bake Blender's axis change into the meshes: every node keeps rotation 0, so spin axes stay local X/Z
            mi.importBlendShapes = true;
            mi.importCameras = false; mi.importLights = false;
            mi.optimizeMeshPolygons = true; mi.optimizeMeshVertices = true;
        }

        void OnPostprocessModel(GameObject g)
        {
            if (!assetPath.StartsWith(Root)) return;
            if (assetPath.Contains("Truck_")) NormalizeRig(g);
            foreach (var mf in g.GetComponentsInChildren<MeshFilter>(true)) if (mf.sharedMesh) MeshSmoothNormals.Bake(mf.sharedMesh);
            foreach (var sm in g.GetComponentsInChildren<SkinnedMeshRenderer>(true)) if (sm.sharedMesh) MeshSmoothNormals.Bake(sm.sharedMesh);

            if (assetPath.Contains("Truck_"))
            {
                string[] need = { "Visual", "Body", "Driver_Seat" };
                foreach (var n in need) if (Find(g.transform, n) == null) Debug.LogWarning($"[MixerMad] {assetPath}: missing node '{n}' (see README, Blender drop-in).");
                int wheels = 0;
                foreach (var t in g.GetComponentsInChildren<Transform>(true)) if (t.name.StartsWith("Wheel_")) wheels++;
                if (wheels < 2) Debug.LogWarning($"[MixerMad] {assetPath}: found {wheels} nodes named Wheel_F_n / Wheel_R_n (need at least 2).");
            }
        }

        /// <summary>
        /// Blender's FBX export leaves its axis change as a rotation on every node. TruckView spins wheels on
        /// local Z and the drum on local X, so every node is reset to rotation 0 (world position kept) and the
        /// rotation is moved into the mesh data. Only the drum keeps its designed tilt (Drum_Tilt and Drum).
        /// The root is included: TruckView overwrites the root rotation every frame, so a conversion kept there
        /// (with its inverse on Visual) would tip the truck over at run time.
        /// </summary>
        static void NormalizeRig(GameObject g)
        {
            var body = Find(g.transform, "Body");
            var tilt = Find(g.transform, "Drum_Tilt");
            Quaternion conversion = body ? body.rotation : Quaternion.identity;
            var all = g.GetComponentsInChildren<Transform>(true);
            var worldRot = new System.Collections.Generic.Dictionary<Transform, Quaternion>();
            var worldPos = new System.Collections.Generic.Dictionary<Transform, Vector3>();
            foreach (var t in all) { worldRot[t] = t.rotation; worldPos[t] = t.position; }
            var rotated = new System.Collections.Generic.Dictionary<Mesh, Quaternion>();
            Quaternion tiltRot = tilt ? worldRot[tilt] * Quaternion.Inverse(conversion) : Quaternion.identity;
            foreach (var t in all)                       // pre-order: parents are fixed before their children
            {
                bool keepsTilt = tilt != null && (t == tilt || t.parent == tilt);
                Quaternion target = keepsTilt ? tiltRot : Quaternion.identity;
                t.rotation = target;
                t.position = worldPos[t];
                var mf = t.GetComponent<MeshFilter>();
                if (!mf || !mf.sharedMesh) continue;
                var q = Quaternion.Inverse(target) * worldRot[t];
                if (rotated.TryGetValue(mf.sharedMesh, out var done))
                {
                    // a mesh shared by two nodes is rotated once; a different rotation would need its own copy
                    if (Quaternion.Angle(done, q) > 0.1f) Debug.LogError("[MixerMad] " + t.name + ": shared mesh " + mf.sharedMesh.name + " needs two different rotations; make the Blender parts single-user.");
                    continue;
                }
                rotated[mf.sharedMesh] = q;
                RotateMesh(mf.sharedMesh, q);
            }
        }

        static void RotateMesh(Mesh m, Quaternion q)
        {
            var v = m.vertices; for (int i = 0; i < v.Length; i++) v[i] = q * v[i];
            var n = m.normals; for (int i = 0; i < n.Length; i++) n[i] = q * n[i];
            var tg = m.tangents;
            for (int i = 0; i < tg.Length; i++) { var d = q * new Vector3(tg[i].x, tg[i].y, tg[i].z); tg[i] = new Vector4(d.x, d.y, d.z, tg[i].w); }
            m.vertices = v;
            if (n.Length == v.Length) m.normals = n;
            if (tg.Length == v.Length) m.tangents = tg;
            m.RecalculateBounds();
        }

        static Transform Find(Transform r, string n)
        {
            if (r.name == n) return r;
            for (int i = 0; i < r.childCount; i++) { var f = Find(r.GetChild(i), n); if (f) return f; }
            return null;
        }
    }
}
