using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;
using Conquest.Unity.Art;
using UnityEditor;
using UnityEditor.U2D.Sprites;
using UnityEngine;

namespace Conquest.Unity.Art.Editor
{
    /// <summary>
    /// Turns the pipeline's output (Assets/Art/Generated: atlas PNGs + sprite_sheet.json, written by
    /// conquest/tools/assets/pack_atlas.py) into Unity assets:
    ///   * each atlas page is a Sprite (Multiple) texture, point filtered, uncompressed, no mipmaps,
    ///     pixels-per-unit = the sheet's tile width (256), one sprite per frame with the manifest's pivot;
    ///   * one AnimationClip per animated entry (SpriteRenderer.sprite curve; no AnimatorController);
    ///   * one ArtCatalogAsset (ScriptableObject) the game queries by role id.
    /// Menu: Conquest > Art > Import Sprite Sheet. Batch: -executeMethod Conquest.Unity.Art.Editor.AssetManifestImporter.ImportFromCommandLine
    ///
    /// STATUS: compiles in Unity 6000.6.3f1 batch mode (conquest/tools/assets/unity_compile_check.sh). The import
    /// itself has NOT been run in the editor yet (see conquest/tools/assets/README.md, "Unity import: unverified").
    /// </summary>
    public static class AssetManifestImporter
    {
        public const string GeneratedFolder = "Assets/Art/Generated";
        public const string SheetFileName = "sprite_sheet.json";
        public const string CatalogFileName = "ArtCatalog.asset";
        public const string ClipsFolderName = "Clips";
        private const int MaxTextureSize = 4096;

        [MenuItem("Conquest/Art/Import Sprite Sheet")]
        public static void ImportFromMenu()
        {
            try
            {
                string summary = Import(GeneratedFolder);
                Debug.Log(summary);
            }
            catch (Exception e)
            {
                Debug.LogError("Sprite sheet import failed: " + e.Message);
            }
        }

        public static void ImportFromCommandLine()
        {
            try
            {
                Debug.Log(Import(GeneratedFolder));
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("Sprite sheet import failed: " + e);
                EditorApplication.Exit(1);
            }
        }

        /// <summary>Runs the whole import for a folder under Assets. Returns a one-line summary; throws on any problem.</summary>
        public static string Import(string folder)
        {
            string sheetPath = folder + "/" + SheetFileName;
            if (!File.Exists(sheetPath))
                throw new FileNotFoundException("No " + sheetPath + ". Run conquest/tools/assets/run_pipeline.sh first.");
            AssetDatabase.ImportAsset(sheetPath, ImportAssetOptions.ForceUpdate);
            string json = File.ReadAllText(sheetPath);
            SpriteSheet sheet = SheetParser.Parse(json);

            var framesByPage = new List<List<(SheetEntry Entry, int Frame)>>();
            for (int i = 0; i < sheet.Pages.Count; i++) framesByPage.Add(new List<(SheetEntry, int)>());
            foreach (SheetEntry entry in sheet.Entries)
                for (int f = 0; f < entry.Frames.Count; f++) framesByPage[entry.Frames[f].Page].Add((entry, f));

            for (int p = 0; p < sheet.Pages.Count; p++)
                ConfigurePage(folder + "/" + sheet.Pages[p].File, sheet, sheet.Pages[p], framesByPage[p]);

            var spritesByName = new Dictionary<string, Sprite>(StringComparer.Ordinal);
            foreach (SheetPage page in sheet.Pages)
                foreach (UnityEngine.Object o in AssetDatabase.LoadAllAssetRepresentationsAtPath(folder + "/" + page.File))
                    if (o is Sprite s) spritesByName[s.name] = s;

            var allSprites = new List<Sprite>();
            var firstSprite = new int[sheet.Entries.Count];
            var clips = new AnimationClip[sheet.Entries.Count];
            string clipsFolder = folder + "/" + ClipsFolderName;
            Directory.CreateDirectory(clipsFolder);
            for (int e = 0; e < sheet.Entries.Count; e++)
            {
                SheetEntry entry = sheet.Entries[e];
                firstSprite[e] = allSprites.Count;
                var frames = new Sprite[entry.FrameCount];
                for (int f = 0; f < entry.FrameCount; f++)
                {
                    string name = SpriteGeometry.SpriteName(entry.Key, f);
                    if (!spritesByName.TryGetValue(name, out frames[f]))
                        throw new InvalidOperationException("Unity did not produce sprite " + name);
                    allSprites.Add(frames[f]);
                }
                if (entry.IsAnimated)
                    clips[e] = WriteClip(clipsFolder + "/" + SpriteGeometry.FileNameForKey(entry.Key) + ".anim", entry, frames);
            }

            var catalog = LoadOrCreateCatalog(folder + "/" + CatalogFileName);
            catalog.SetData(AssetDatabase.LoadAssetAtPath<TextAsset>(sheetPath), allSprites.ToArray(), firstSprite, clips);
            EditorUtility.SetDirty(catalog);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return "Imported " + sheet.Entries.Count + " entries, " + allSprites.Count + " sprites, " +
                   sheet.Pages.Count + " pages from " + sheetPath;
        }

        private static void ConfigurePage(string path, SpriteSheet sheet, SheetPage page,
            List<(SheetEntry Entry, int Frame)> frames)
        {
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) throw new InvalidOperationException(path + " is not a texture");

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.spritePixelsPerUnit = sheet.PixelsPerUnit;
            importer.filterMode = FilterMode.Point;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.mipmapEnabled = false;
            importer.isReadable = false;
            importer.alphaIsTransparency = true;
            importer.sRGBTexture = true;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.maxTextureSize = MaxTextureSize;
            var textureSettings = new TextureImporterSettings();
            importer.ReadTextureSettings(textureSettings);
            textureSettings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(textureSettings);

            var factory = new SpriteDataProviderFactories();
            factory.Init();
            ISpriteEditorDataProvider provider = factory.GetSpriteEditorDataProviderFromObject(importer);
            provider.InitSpriteEditorDataProvider();

            var rects = new List<SpriteRect>(frames.Count);
            var pairs = new List<SpriteNameFileIdPair>(frames.Count);
            foreach (var (entry, frame) in frames)
            {
                SheetRect r = SpriteGeometry.ToUnityRect(entry.Frames[frame].Rect, page.Height);
                string name = SpriteGeometry.SpriteName(entry.Key, frame);
                var normalized = entry.NormalizedPivot;
                var rect = new SpriteRect
                {
                    name = name,
                    spriteID = StableId(name),
                    rect = new Rect(r.X, r.Y, r.Width, r.Height),
                    alignment = SpriteAlignment.Custom,
                    pivot = new Vector2((float)normalized.X, (float)normalized.Y),
                    border = Vector4.zero,
                };
                rects.Add(rect);
                pairs.Add(new SpriteNameFileIdPair(name, rect.spriteID));
            }
            provider.SetSpriteRects(rects.ToArray());
            provider.GetDataProvider<ISpriteNameFileIdDataProvider>().SetNameFileIdPairs(pairs);
            provider.Apply();
            importer.SaveAndReimport();
        }

        /// <summary>Same name, same id on every import, so prefabs and scenes keep their sprite references.</summary>
        private static GUID StableId(string name)
        {
            using (var md5 = MD5.Create())
            {
                byte[] hash = md5.ComputeHash(Encoding.UTF8.GetBytes(name));
                var sb = new StringBuilder(32);
                foreach (byte b in hash) sb.Append(b.ToString("x2"));
                return new GUID(sb.ToString());
            }
        }

        private static AnimationClip WriteClip(string path, SheetEntry entry, Sprite[] frames)
        {
            int fps = entry.Fps.GetValueOrDefault(1);
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            bool isNew = clip == null;
            if (isNew) clip = new AnimationClip();
            clip.name = Path.GetFileNameWithoutExtension(path);
            clip.frameRate = fps;

            // One key per frame plus a closing key so the last frame lasts as long as the others.
            var keys = new ObjectReferenceKeyframe[frames.Length + 1];
            for (int i = 0; i < frames.Length; i++)
                keys[i] = new ObjectReferenceKeyframe { time = (float)i / fps, value = frames[i] };
            keys[frames.Length] = new ObjectReferenceKeyframe { time = (float)frames.Length / fps, value = frames[frames.Length - 1] };
            EditorCurveBinding binding = EditorCurveBinding.PPtrCurve(string.Empty, typeof(SpriteRenderer), "m_Sprite");
            AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);

            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = entry.Loop;
            AnimationUtility.SetAnimationClipSettings(clip, settings);

            if (isNew) AssetDatabase.CreateAsset(clip, path);
            else EditorUtility.SetDirty(clip);
            return clip;
        }

        private static ArtCatalogAsset LoadOrCreateCatalog(string path)
        {
            var existing = AssetDatabase.LoadAssetAtPath<ArtCatalogAsset>(path);
            if (existing != null) return existing;
            var created = ScriptableObject.CreateInstance<ArtCatalogAsset>();
            AssetDatabase.CreateAsset(created, path);
            return created;
        }
    }
}
