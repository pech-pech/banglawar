using Conquest.Unity.Art;
using UnityEngine;
using UnityEngine.UIElements;

namespace Conquest.UnityView
{
    /// <summary>
    /// The few asset references the runtime needs, kept in one data asset (Resources/ConquestViewAssets) that the
    /// editor setup creates: the art catalog the importer made (generated, git-ignored), the Bengali font and the
    /// UI Toolkit panel settings. Any of them may be null: art falls back to drawn placeholders, the font to the
    /// default one, the panel settings to a code-made instance.
    /// </summary>
    public sealed class ViewAssets : ScriptableObject
    {
        public const string ResourceName = "ConquestViewAssets";

        public ArtCatalogAsset? artCatalog;
        public Font? bengaliFont;
        public PanelSettings? panelSettings;

        public static ViewAssets? Load() => Resources.Load<ViewAssets>(ResourceName);
    }
}
