using System;
using System.Collections.Generic;
using Conquest.Assets.Lookup;
using Conquest.Assets.Model;
using UnityEngine;
using Resolution = Conquest.Assets.Lookup.Resolution; // UnityEngine.Resolution also exists

namespace Conquest.Unity.Art
{
    /// <summary>
    /// Data asset the game queries for pictures: no AnimatorController, no scene wiring. It holds the sprite
    /// sheet JSON (the single source of truth for lookup, built into the pure-C# AssetCatalog) plus the Unity
    /// objects the importer made for it. Created by Assets/Editor/AssetManifestImporter.cs.
    ///
    /// Usage:
    ///   if (catalog.TryGet(new AssetRequest("u", "scout", state: "selected", slot: "f1"), out ArtClip art)) {
    ///       renderer.sprite = art.FrameAt(secondsSinceStart);
    ///   }
    /// </summary>
    [CreateAssetMenu(menuName = "Conquest/Art Catalog", fileName = "ArtCatalog")]
    public sealed class ArtCatalogAsset : ScriptableObject
    {
        [SerializeField] private TextAsset sheetJson;
        [SerializeField] private Sprite[] sprites = Array.Empty<Sprite>();
        [SerializeField] private int[] firstSpriteOfEntry = Array.Empty<int>();
        [SerializeField] private AnimationClip[] clipOfEntry = Array.Empty<AnimationClip>();

        private AssetCatalog catalog;
        private Dictionary<string, int> entryIndex;

        public int PixelsPerUnit => Catalog.Sheet.PixelsPerUnit;

        public AssetCatalog Catalog
        {
            get
            {
                EnsureBuilt();
                return catalog;
            }
        }

        /// <summary>Editor-only in practice: called by the importer after it has made the sprites and clips.</summary>
        public void SetData(TextAsset json, Sprite[] allSprites, int[] firstSprite, AnimationClip[] clips)
        {
            sheetJson = json;
            sprites = allSprites;
            firstSpriteOfEntry = firstSprite;
            clipOfEntry = clips;
            catalog = null;
            entryIndex = null;
        }

        public bool TryGet(AssetRequest request, out ArtClip art)
        {
            EnsureBuilt();
            Resolution hit = catalog.Resolve(request);
            if (hit == null)
            {
                art = default;
                return false;
            }
            int index = entryIndex[hit.Entry.Key];
            art = new ArtClip(hit, this, index);
            return true;
        }

        internal Sprite SpriteOf(int entry, int frame) => sprites[firstSpriteOfEntry[entry] + frame];

        internal AnimationClip ClipOf(int entry) => clipOfEntry[entry];

        private void EnsureBuilt()
        {
            if (catalog != null) return;
            if (sheetJson == null) throw new InvalidOperationException("ArtCatalog has no sprite sheet; run Conquest > Art > Import Sprite Sheet");
            catalog = AssetCatalog.FromJson(sheetJson.text);
            entryIndex = new Dictionary<string, int>(StringComparer.Ordinal);
            for (int i = 0; i < catalog.Sheet.Entries.Count; i++) entryIndex[catalog.Sheet.Entries[i].Key] = i;
        }

        private void OnEnable()
        {
            catalog = null;
            entryIndex = null;
        }
    }

    /// <summary>One resolved picture: the entry's data plus its Unity sprites. Cheap to copy.</summary>
    public readonly struct ArtClip
    {
        private readonly ArtCatalogAsset owner;
        private readonly int index;

        public Resolution Resolution { get; }
        public SheetEntry Entry => Resolution.Entry;
        public bool IsExact => Resolution.IsExact;
        public int FrameCount => Entry.FrameCount;

        /// <summary>Optional: an AnimationClip driving SpriteRenderer.sprite, for Animation or Playables use.</summary>
        public AnimationClip Clip => owner.ClipOf(index);

        internal ArtClip(Resolution resolution, ArtCatalogAsset owner, int index)
        {
            Resolution = resolution;
            this.owner = owner;
            this.index = index;
        }

        public Sprite Frame(int frame) => owner.SpriteOf(index, Mathf.Clamp(frame, 0, FrameCount - 1));

        /// <summary>The frame for an elapsed time; the caller owns the clock (nothing here reads Time).</summary>
        public Sprite FrameAt(double seconds) => Frame(AnimationClock.FrameAt(Entry, seconds));
    }
}
