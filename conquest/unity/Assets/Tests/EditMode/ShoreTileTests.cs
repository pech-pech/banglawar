using System.Collections.Generic;
using System.Linq;
using Conquest.Content.Model;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using NUnit.Framework;
using UnityEngine;

namespace Conquest.UnityView.Tests
{
    /// <summary>The terrain grid on the real scenario: water tiles pick shore pieces from their neighbours, land keeps its look.</summary>
    public sealed class ShoreTileTests
    {
        private GameObject root = null!;
        private ArtLibrary art = null!;
        private ContentBundle content = null!;
        private TileLayer layer = null!;

        [SetUp]
        public void SetUp()
        {
            PolishSettings.Reset();
            root = new GameObject("ShoreTileTests");
            ViewAssets? assets = ViewAssets.Load();
            art = new ArtLibrary(assets != null ? assets.artCatalog : null);
            content = TestContent.Load();
            layer = new TileLayer(root.transform, art, new IsoProjection(), content.Scenario, content.Theme);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(root);
            PolishSettings.Reset();
        }

        private bool IsWaterTile(int x, int y)
        {
            LegendEntry? legend = content.Scenario.Map.FindLegend(content.Scenario.Map.Rows[y][x]);
            return legend != null && TileLayer.IsWater(legend.Terrain);
        }

        [Test]
        public void LandPredicateAgreesWithTheMapAndTreatsOutsideAsWater()
        {
            Assert.AreEqual(120, layer.TileCount);
            for (int y = 0; y < layer.Height; y++)
            {
                for (int x = 0; x < layer.Width; x++) Assert.AreEqual(!IsWaterTile(x, y), layer.IsLandAt(x, y), x + "," + y);
            }

            Assert.IsFalse(layer.IsLandAt(-1, 0));
            Assert.IsFalse(layer.IsLandAt(0, -1));
            Assert.IsFalse(layer.IsLandAt(layer.Width, 0));
            Assert.IsFalse(layer.IsLandAt(0, layer.Height));
        }

        [Test]
        public void EveryWaterTileOfTheScenarioGetsAShoreKeyTheCatalogueKnows()
        {
            var keys = new SortedSet<string>();
            for (int y = 0; y < layer.Height; y++)
            {
                for (int x = 0; x < layer.Width; x++)
                {
                    if (IsWaterTile(x, y)) keys.Add(ShoreAutotile.KeyAt(x, y, layer.IsLandAt));
                }
            }

            Assert.Greater(keys.Count, 3, "a river and a lake need several shore pieces: " + string.Join(",", keys));
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
            foreach (string key in keys)
            {
                Assert.IsTrue(art.TryGet(AssetKeyParts.Request(key, null), out ArtClip _), key + " is missing from the imported art");
            }
        }

        [Test]
        public void WaterTilesUseShorePicturesAndLandTilesDoNot()
        {
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");

            Assert.AreEqual(layer.TileCount, layer.ArtTileCount, "every tile has real art now");
            Assert.AreEqual(0, layer.PlaceholderCount);
            var shoreSprites = new HashSet<Sprite>();
            foreach (SpriteRenderer r in layer.Root.GetComponentsInChildren<SpriteRenderer>())
            {
                if (r.gameObject.name.EndsWith(" water")) shoreSprites.Add(r.sprite);
            }

            Assert.Greater(shoreSprites.Count, 3, "water tiles are not all the same picture");
        }
    }
}
