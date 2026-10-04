using Conquest.Assets.Lookup;
using Conquest.Unity.Art;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Pictures by role: the imported art when the catalog has it, otherwise a drawn placeholder. Counts what it had
    /// to fake so the debug panel can say how much of the scene is real art.
    /// </summary>
    public sealed class ArtLibrary
    {
        private readonly ArtCatalogAsset? catalog;

        public ArtLibrary(ArtCatalogAsset? catalog)
        {
            this.catalog = catalog;
            PixelsPerUnit = ReadPixelsPerUnit(catalog);
            Placeholders = new ProceduralSprites(PixelsPerUnit);
            Banners = new BannerPictures(PixelsPerUnit);
        }

        /// <summary>Banner pictures prepared for a stretchable beam (cached per sprite).</summary>
        public BannerPictures Banners { get; }

        public int PixelsPerUnit { get; }

        public ProceduralSprites Placeholders { get; }

        public bool HasCatalog => catalog != null;

        public int ArtHits { get; private set; }

        public int PlaceholderHits { get; private set; }

        public bool TryGet(AssetRequest request, out ArtClip clip)
        {
            clip = default;
            if (catalog == null || !SafeTryGet(request, out clip))
            {
                PlaceholderHits++;
                return false;
            }

            ArtHits++;
            return true;
        }

        public bool TryGet(string kind, string role, string? state, string? slot, out ArtClip clip) =>
            TryGet(new AssetRequest(kind, role, state: state, slot: slot), out clip);

        private bool SafeTryGet(AssetRequest request, out ArtClip clip)
        {
            try
            {
                return catalog!.TryGet(request, out clip);
            }
            catch (System.Exception e) when (e is System.InvalidOperationException || e is System.IndexOutOfRangeException)
            {
                Debug.LogWarning("Art catalog lookup failed for " + request.Key + ": " + e.Message);
                clip = default;
                return false;
            }
        }

        private static int ReadPixelsPerUnit(ArtCatalogAsset? catalog)
        {
            if (catalog == null) return ViewSpace.DefaultPixelsPerUnit;
            try
            {
                return catalog.PixelsPerUnit;
            }
            catch (System.InvalidOperationException)
            {
                return ViewSpace.DefaultPixelsPerUnit;
            }
        }
    }
}
