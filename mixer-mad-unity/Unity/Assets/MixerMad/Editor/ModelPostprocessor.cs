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

        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(Root)) return;
            var mi = (ModelImporter)assetImporter;
            mi.isReadable = true;                 // needed to bake outline normals at import
            mi.importBlendShapes = true;
            mi.importCameras = false; mi.importLights = false;
            mi.optimizeMeshPolygons = true; mi.optimizeMeshVertices = true;
        }

        void OnPostprocessModel(GameObject g)
        {
            if (!assetPath.StartsWith(Root)) return;
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

        static Transform Find(Transform r, string n)
        {
            if (r.name == n) return r;
            for (int i = 0; i < r.childCount; i++) { var f = Find(r.GetChild(i), n); if (f) return f; }
            return null;
        }
    }
}
