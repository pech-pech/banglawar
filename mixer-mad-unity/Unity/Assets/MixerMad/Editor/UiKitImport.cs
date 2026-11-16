using UnityEditor;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Editor
{
    /// <summary>
    /// Imports M's glossy UI kit PNGs in Assets/MixerMad/Art/UI as UI sprites with fixed 9-slice borders,
    /// so the slicing is reproducible (L-MM-23: all four edges sliced, Fill Center on at use).
    /// Borders for the F04 plates come from Art/ui-kits/F04-9SLICE-NOTES.md (left, top, right, bottom in px).
    /// Run `-executeMethod MixerMad.Editor.UiKitImport.Run` to re-import and rewrite the HudSkin asset.
    /// </summary>
    public sealed class UiKitImport : AssetPostprocessor
    {
        public const string Folder = "Assets/MixerMad/Art/UI/";
        public const string SkinPath = Folder + "Resources/" + HudSkin.ResourceName + ".asset";

        // Unity's spriteBorder order is (left, bottom, right, top).
        static readonly Vector4 ButtonBorder = new Vector4(210, 180, 210, 180);
        static readonly Vector4 PanelBorder = new Vector4(330, 330, 330, 330);

        public override uint GetVersion() { return 1; }

        void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(Folder) || !assetPath.EndsWith(".png")) return;
            var ti = (TextureImporter)assetImporter;
            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = SpriteImportMode.Single;
            ti.mipmapEnabled = false;
            ti.alphaIsTransparency = true;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.filterMode = FilterMode.Bilinear;
            ti.maxTextureSize = 1024;
            ti.textureCompression = TextureImporterCompression.Uncompressed;   // UI art is small; keep the gloss crisp
            ti.spritePixelsPerUnit = 100f;
            ti.spriteBorder = BorderFor(assetPath);
        }

        public static Vector4 BorderFor(string path)
        {
            if (path.Contains("F04-button-9slice")) return ButtonBorder;
            if (path.Contains("F04-panel-9slice")) return PanelBorder;
            return Vector4.zero;
        }

        /// <summary>Re-imports the kit PNGs and (re)writes the HudSkin asset the runtime loads.</summary>
        public static void Run()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { Folder.TrimEnd('/') }))
                AssetDatabase.ImportAsset(AssetDatabase.GUIDToAssetPath(guid), ImportAssetOptions.ForceUpdate);
            WriteSkin();
        }

        public static HudSkin WriteSkin()
        {
            var skin = AssetDatabase.LoadAssetAtPath<HudSkin>(SkinPath);
            bool isNew = skin == null;
            if (isNew) skin = ScriptableObject.CreateInstance<HudSkin>();
            skin.button = Load("F04-button-9slice");
            skin.panel = Load("F04-panel-9slice");
            skin.gas = Load("ui2_candy_gas");
            skin.brake = Load("ui2_candy_brake");
            skin.starEmpty = Load("ui2_candy_star_empty");
            skin.starFull = Load("ui2_candy_star_full");
            if (isNew) AssetDatabase.CreateAsset(skin, SkinPath); else EditorUtility.SetDirty(skin);
            AssetDatabase.SaveAssets();
            Debug.Log("[MixerMad] HUD kit written to " + SkinPath);
            return skin;
        }

        static Sprite Load(string name)
        {
            var s = AssetDatabase.LoadAssetAtPath<Sprite>(Folder + name + ".png");
            if (s == null) Debug.LogError("[MixerMad] UI kit sprite missing: " + Folder + name + ".png (the HUD falls back to code plates)");
            return s;
        }
    }
}
