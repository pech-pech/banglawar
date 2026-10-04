using System;
using System.IO;
using Conquest.Unity.Art;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Editor
{
    /// <summary>
    /// One-time and repeatable setup of the map slice: copies the scenario and theme into StreamingAssets, creates the
    /// view-assets data asset (art catalog, Bengali font, panel settings), writes the Boot and Map scenes and puts
    /// them in the build settings. Menu: Conquest > Slice > Prepare. Batch:
    /// -executeMethod Conquest.UnityView.Editor.SliceSetup.PrepareFromCommandLine
    /// </summary>
    public static class SliceSetup
    {
        public const string BootScenePath = "Assets/Scenes/Boot.unity";
        public const string MapScenePath = "Assets/Scenes/Map.unity";
        private const string ResourcesFolder = "Assets/Conquest/View/Resources";
        private const string ViewAssetsPath = ResourcesFolder + "/ConquestViewAssets.asset";
        private const string PanelSettingsPath = ResourcesFolder + "/ConquestPanelSettings.asset";
        private const string ThemePath = ResourcesFolder + "/ConquestTheme.tss";
        private const string FontPath = "Assets/ThirdParty/NotoSansBengali/NotoSansBengali-VF.ttf";
        private const string CatalogPath = "Assets/Art/Generated/ArtCatalog.asset";

        [MenuItem("Conquest/Slice/Prepare")]
        public static void PrepareFromMenu()
        {
            Prepare();
            Debug.Log("Slice prepared: data copied, view assets, Boot and Map scenes, build settings.");
        }

        public static void PrepareFromCommandLine()
        {
            try
            {
                Prepare();
                Debug.Log("Slice prepared.");
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("Slice setup failed: " + e);
                EditorApplication.Exit(1);
            }
        }

        public static void Prepare()
        {
            CopyData();
            Directory.CreateDirectory(ResourcesFolder);
            CreateViewAssets();
            CreateScenes();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        private static void CopyData()
        {
            string conquest = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".."));
            string target = Path.Combine(Application.dataPath, "StreamingAssets", "conquest");
            Directory.CreateDirectory(target);
            File.Copy(Path.Combine(conquest, "data", "scenarios", "skirmish-1971.json"), Path.Combine(target, "scenario.json"), true);
            File.Copy(Path.Combine(conquest, "data", "themes", "bd1971", "theme.json"), Path.Combine(target, "theme.json"), true);
            File.Copy(Path.Combine(conquest, "data", "allowlists", "content-words.json"), Path.Combine(target, "allowlist.json"), true);
        }

        private static void CreateViewAssets()
        {
            if (!File.Exists(ThemePath))
            {
                File.WriteAllText(ThemePath, "@import url(\"unity-theme://default\");\n");
                AssetDatabase.ImportAsset(ThemePath, ImportAssetOptions.ForceUpdate);
            }

            PanelSettings? panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                AssetDatabase.CreateAsset(panel, PanelSettingsPath);
            }

            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1280, 720);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = 0.5f;
            panel.themeStyleSheet = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            EditorUtility.SetDirty(panel);

            ViewAssets? assets = AssetDatabase.LoadAssetAtPath<ViewAssets>(ViewAssetsPath);
            if (assets == null)
            {
                assets = ScriptableObject.CreateInstance<ViewAssets>();
                AssetDatabase.CreateAsset(assets, ViewAssetsPath);
            }

            assets.artCatalog = AssetDatabase.LoadAssetAtPath<ArtCatalogAsset>(CatalogPath);
            assets.bengaliFont = AssetDatabase.LoadAssetAtPath<Font>(FontPath);
            assets.panelSettings = panel;
            EditorUtility.SetDirty(assets);
            if (assets.artCatalog == null) Debug.LogWarning("No art catalog at " + CatalogPath + ": the slice will draw placeholders (run conquest/tools/assets/run_pipeline.sh and Conquest > Art > Import Sprite Sheet).");
        }

        private static void CreateScenes()
        {
            Directory.CreateDirectory("Assets/Scenes");
            Scene boot = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Bootstrap").AddComponent<BootBootstrap>();
            EditorSceneManager.SaveScene(boot, BootScenePath);

            Scene map = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = 5f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.transform.position = new Vector3(0f, 0f, -10f);
            new GameObject("MapController").AddComponent<MapController>();
            EditorSceneManager.SaveScene(map, MapScenePath);

            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(BootScenePath, true),
                new EditorBuildSettingsScene(MapScenePath, true),
            };
        }
    }
}
