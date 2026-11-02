using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using MixerMad.Game;

namespace MixerMad.Editor
{
    /// <summary>
    /// One-click builder: MixerMad > Build Snowy Pass Scene.
    ///  1. project setup (URP Forward+ asset, Linear, Input System, Metal)
    ///  2. material assets in Resources/MixerMad (so shaders survive stripping in a player build)
    ///  3. a new scene assembled by SliceAssembler (road from the physics line, decor, truck, camera rig, HUD, ...)
    ///  4. the placeholder truck saved as a prefab; if Art/Models/Truck_Mixer.fbx exists it is used instead
    ///  5. scene saved to Assets/MixerMad/Scenes/SnowyPass.unity and added to the Build Settings
    /// </summary>
    public static class SceneBuilder
    {
        public const string ScenePath = "Assets/MixerMad/Scenes/SnowyPass.unity";
        public const string ResDir = "Assets/MixerMad/Resources/MixerMad";
        public const string PrefabDir = "Assets/MixerMad/Prefabs";
        public const string TruckFbx = "Assets/MixerMad/Art/Models/Truck_Mixer.fbx";

        [MenuItem("MixerMad/Build Snowy Pass Scene", priority = 0)]
        public static void BuildMenu() { Build(false); }

        [MenuItem("MixerMad/Build Snowy Pass Scene (reset materials)", priority = 2)]
        public static void BuildResetMenu() { Build(true); }

        public static void Build(bool resetMaterials)
        {
            bool restart = ProjectSetup.Apply();
            ProjectSetup.EnsureFolders("Assets/MixerMad/Scenes", ResDir, PrefabDir);
            CreateMaterials(resetMaterials);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var fbx = AssetDatabase.LoadAssetAtPath<GameObject>(TruckFbx);
            var result = SliceAssembler.Assemble(null, fbx);

            // lighting preview so the Scene view looks right before pressing Play (runtime components do this on Awake)
            var dn = result.sim.GetComponent<DayNight>();
            if (dn != null) dn.Preview();
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared; RenderSettings.fogDensity = 0.014f;

            // keep the placeholder truck as a prefab so artists see the target hierarchy
            if (fbx == null)
            {
                string pp = PrefabDir + "/Truck_Mixer_Placeholder.prefab";
                PrefabUtility.SaveAsPrefabAssetAndConnect(result.truck.gameObject, pp, InteractionMode.AutomatedAction);
            }

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("[MixerMad] Snowy pass scene saved: " + ScenePath + (fbx != null ? "  (truck from " + TruckFbx + ")" : "  (placeholder truck)") +
                      (restart ? "\n[MixerMad] RESTART the editor once so the new Input System setting takes effect." : ""));
        }

        static Material Make(string name, string shader, bool reset, System.Action<Material> configure)
        {
            string path = ResDir + "/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            bool created = false;
            if (m == null)
            {
                var sh = Shader.Find(shader);
                if (sh == null) { Debug.LogError("[MixerMad] shader not found (still importing?): " + shader); return null; }
                m = new Material(sh) { name = name };
                AssetDatabase.CreateAsset(m, path);
                created = true;
            }
            if (created || reset) { configure(m); EditorUtility.SetDirty(m); }
            return m;
        }

        static void CreateMaterials(bool reset)
        {
            foreach (var d in MMMaterials.Toys)
            {
                var def = d;
                Make(def.name, def.shader, reset, m => MMMaterials.ConfigureToy(m, def));
            }
            Make("Snow_Road", "MixerMad/SnowIce", reset, m => { });
            Make("FX_Sky", "MixerMad/SkyGradient", reset, m => { });
            Make("FX_ParticleAlpha", "MixerMad/SoftParticle", reset, m => MMMaterials.ConfigureParticle(m, false));
            Make("FX_ParticleAdd", "MixerMad/SoftParticle", reset, m => MMMaterials.ConfigureParticle(m, true));
        }
    }
}
