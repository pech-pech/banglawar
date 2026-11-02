using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEditor.Build;

namespace MixerMad.Editor
{
    /// <summary>
    /// One-shot project settings for the slice: Linear colour space, Input System only, Metal on macOS,
    /// frame timing stats on (PerfOverlay GPU ms), a Forward+ URP asset, windowed 1280x800.
    /// Safe to run repeatedly. Input handler changes need an editor restart: the builder tells you.
    /// </summary>
    public static class ProjectSetup
    {
        public const string SettingsDir = "Assets/MixerMad/Settings";

        [MenuItem("MixerMad/1. Apply Project Setup", priority = 1)]
        public static void ApplyMenu() { Apply(); }

        public static bool Apply()
        {
            bool needsRestart = false;

            PlayerSettings.companyName = "PGS";
            PlayerSettings.productName = "Mixer Mad 3D";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.enableFrameTimingStats = true;
            PlayerSettings.runInBackground = true;
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.gpuSkinning = true;
            DisableEngineReporting();
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone, "com.pgs.mixermad3d");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);   // fast builds for the prototype; IL2CPP needs Xcode tools
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneOSX, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneOSX, new[] { GraphicsDeviceType.Metal });

            // Active Input Handling: 1 = Input System Package (new). No public API, so go through the serialized settings.
            var psAsset = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (psAsset != null && psAsset.Length > 0)
            {
                var so = new SerializedObject(psAsset[0]);
                var prop = so.FindProperty("activeInputHandler");
                if (prop != null && prop.intValue != 1) { prop.intValue = 1; so.ApplyModifiedProperties(); needsRestart = true; }
            }

            EnsureUrp();
            AssetDatabase.SaveAssets();
            if (needsRestart)
                Debug.LogWarning("[MixerMad] Active Input Handling was switched to the Input System package. Restart the Unity Editor once, then run MixerMad > Build Snowy Pass Scene.");
            return needsRestart;
        }

        static void EnsureFolder(string path)
        {
            var parts = path.Split('/');
            string cur = parts[0];
            for (int i = 1; i < parts.Length; i++)
            {
                string next = cur + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(cur, parts[i]);
                cur = next;
            }
        }

        /// <summary>
        /// Kids' game, no network calls: turn off Unity's hardware-statistics upload ("submitAnalytics") and keep
        /// analytics, crash reporting and engine diagnostics off. Set through the serialized PlayerSettings so it
        /// works whatever the public API calls it in this editor version.
        /// </summary>
        static void DisableEngineReporting()
        {
            var ps = Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings");
            if (ps == null) { Debug.LogError("[MixerMad] PlayerSettings not found; submitAnalytics not changed."); return; }
            var so = new SerializedObject(ps);
            var p = so.FindProperty("submitAnalytics");
            if (p == null) { Debug.LogError("[MixerMad] submitAnalytics property not found."); return; }
            if (p.boolValue) { p.boolValue = false; so.ApplyModifiedPropertiesWithoutUndo(); }
            PlayerSettings.enableCrashReportAPI = false;
        }

        public static void EnsureFolders(params string[] folders) { foreach (var f in folders) EnsureFolder(f); }

        /// <summary>Creates MM_URP.asset + MM_URP_Renderer.asset (Forward+) and makes them the default pipeline.</summary>
        static void EnsureUrp()
        {
            EnsureFolder(SettingsDir);
            string rendererPath = SettingsDir + "/MM_URP_Renderer.asset";
            string assetPath = SettingsDir + "/MM_URP.asset";

            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(assetPath);
            if (asset == null)
            {
                var rd = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(rd, rendererPath);
                rd.renderingMode = RenderingMode.ForwardPlus;                         // Forward+ (user answer / S2)
                EditorUtility.SetDirty(rd);
                asset = UniversalRenderPipelineAsset.Create(rd);
                AssetDatabase.CreateAsset(asset, assetPath);
            }
            asset.supportsHDR = true;
            asset.msaaSampleCount = 2;
            asset.renderScale = 0.8f;                                                 // High; QualityPresets overrides at runtime
            asset.supportsCameraDepthTexture = true;                                  // finish depth of field
            asset.shadowDistance = 55f;                                               // lane (31.7 m) + 15 m and more (L-MM-30); QualityPresets sets it per preset
            asset.shadowCascadeCount = 2;
            EditorUtility.SetDirty(asset);
            var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
            if (rendererData != null) { EnsurePostProcessData(rendererData); EnsureSsao(rendererData); }
            else Debug.LogError("[MixerMad] " + rendererPath + " missing; SSAO feature not added.");

            GraphicsSettings.defaultRenderPipeline = asset;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = asset;
            }
            QualitySettings.SetQualityLevel(current, false);
        }

        /// <summary>
        /// Adds URP's SSAO renderer feature (Ultra only, L-MM-32) to the renderer. It stays ACTIVE on disk because
        /// URP strips the SSAO shader and noise textures from a player build when no SSAO feature is active (the
        /// player then fails to create the pipeline); QualityPresets switches it off at runtime for every preset
        /// with ssao = false. Tuned for a side-on camera
        /// about 32 m away: depth-only source (the custom shaders have DepthOnly passes, no DepthNormals),
        /// a radius in metres that reaches wheel arches and the road lip, gentle intensity.
        /// </summary>
        static void EnsureSsao(UniversalRendererData rd)
        {
            ScreenSpaceAmbientOcclusion ssao = null;
            foreach (var f in rd.rendererFeatures) if (f is ScreenSpaceAmbientOcclusion s) ssao = s;
            if (ssao == null)
            {
                ssao = ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();
                ssao.name = "SSAO";
                AssetDatabase.AddObjectToAsset(ssao, rd);
                rd.rendererFeatures.Add(ssao);
                var so = new SerializedObject(rd);
                var map = so.FindProperty("m_RendererFeatureMap");
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(ssao, out _, out long localId);
                map.arraySize = rd.rendererFeatures.Count;
                map.GetArrayElementAtIndex(map.arraySize - 1).longValue = localId;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            ssao.SetActive(true);
            var fs = new SerializedObject(ssao);
            SetFloat(fs, "m_Settings.Intensity", 1.1f);
            SetFloat(fs, "m_Settings.Radius", 0.6f);
            SetFloat(fs, "m_Settings.DirectLightingStrength", 0.2f);
            SetFloat(fs, "m_Settings.Falloff", 60f);
            SetEnum(fs, "m_Settings.Source", 0);        // Depth
            SetEnum(fs, "m_Settings.NormalSamples", 1); // Medium
            SetEnum(fs, "m_Settings.Samples", 1);       // Medium (8)
            fs.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(ssao);
            EditorUtility.SetDirty(rd);
        }

        /// <summary>
        /// A renderer created with CreateInstance has no post-process data, and URP then switches ALL post-processing
        /// off (bloom, tonemapping, grade, DoF) whatever the camera and Volume say. Point it at URP's own data.
        /// </summary>
        static void EnsurePostProcessData(UniversalRendererData rd)
        {
            if (rd.postProcessData != null) return;
            const string path = "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset";
            rd.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(path);
            if (rd.postProcessData == null) { Debug.LogError("[MixerMad] " + path + " not found; post-processing stays off."); return; }
            EditorUtility.SetDirty(rd);
        }

        static void SetFloat(SerializedObject so, string path, float v)
        {
            var p = so.FindProperty(path);
            if (p == null) { Debug.LogError("[MixerMad] SSAO setting not found: " + path); return; }
            p.floatValue = v;
        }

        static void SetEnum(SerializedObject so, string path, int index)
        {
            var p = so.FindProperty(path);
            if (p == null) { Debug.LogError("[MixerMad] SSAO setting not found: " + path); return; }
            p.enumValueIndex = index;
        }
    }
}
