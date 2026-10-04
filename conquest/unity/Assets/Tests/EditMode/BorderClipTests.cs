using System.Linq;
using Conquest.Content.Model;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using NUnit.Framework;
using UnityEngine;

namespace Conquest.UnityView.Tests
{
    /// <summary>Shore props must not be drawn outside the map: geometry of the border line and the masks on the real scenario.</summary>
    public sealed class BorderClipTests
    {
        private const int Hw = 128;
        private const int Hh = 64;

        [Test]
        public void NorthEastLineKeepsTheDiamondAndCutsWhatStandsAboveIt()
        {
            Assert.IsTrue(BorderClip.KeepsPixel(0, 0, true, false, Hw, Hh), "centre");
            Assert.IsTrue(BorderClip.KeepsPixel(Hw, 0, true, false, Hw, Hh), "right corner");
            Assert.IsTrue(BorderClip.KeepsPixel(0, -Hh, true, false, Hw, Hh), "top corner is on the line");
            Assert.IsFalse(BorderClip.KeepsPixel(0, -Hh - 1, true, false, Hw, Hh), "a reed above the top corner");
            Assert.IsFalse(BorderClip.KeepsPixel(64, -Hh - 40, true, false, Hw, Hh), "a reed above the NE edge");
            Assert.IsTrue(BorderClip.KeepsPixel(-64, -Hh - 20, true, false, Hw, Hh), "left of the top corner the NE line is lower, so this point is still map");
        }

        [Test]
        public void NorthWestLineIsTheMirrorImage()
        {
            Assert.IsFalse(BorderClip.KeepsPixel(-64, -Hh - 40, false, true, Hw, Hh));
            Assert.IsTrue(BorderClip.KeepsPixel(-Hw, 0, false, true, Hw, Hh));
            Assert.IsTrue(BorderClip.KeepsPixel(64, -Hh - 20, false, true, Hw, Hh), "just under the line extended to the right is still map");
        Assert.IsFalse(BorderClip.KeepsPixel(64, -Hh - 40, false, true, Hw, Hh), "the one line is shared by the whole border, also past the tile's own edge");
        }

        [Test]
        public void TheCornerTileCutsBothSides()
        {
            Assert.IsFalse(BorderClip.KeepsPixel(60, -Hh - 40, true, true, Hw, Hh));
            Assert.IsFalse(BorderClip.KeepsPixel(-60, -Hh - 40, true, true, Hw, Hh));
            Assert.IsTrue(BorderClip.KeepsPixel(0, 10, true, true, Hw, Hh));
        }

        [Test]
        public void NothingBelowTheDiamondIsEverCut()
        {
            for (int x = -Hw; x <= Hw; x += 8)
            {
                for (int y = 0; y <= 200; y += 8) Assert.IsTrue(BorderClip.KeepsPixel(x, y, true, true, Hw, Hh), x + "," + y);
            }
        }

        [Test]
        public void OnlyTheUpperBordersCount()
        {
            Assert.IsTrue(BorderClip.OnNorthEastBorder(0));
            Assert.IsFalse(BorderClip.OnNorthEastBorder(1));
            Assert.IsTrue(BorderClip.OnNorthWestBorder(0));
            Assert.IsFalse(BorderClip.OnNorthWestBorder(11));
        }

        [Test]
        public void MaskSpritesAreSharedAndMatchTheGeometry()
        {
            var clip = new BorderClip(256);
            Sprite ne = clip.MaskFor(true, false);
            Assert.AreSame(ne, clip.MaskFor(true, false));
            Assert.AreNotSame(ne, clip.MaskFor(false, true));
            Texture2D tex = ne.texture;
            Assert.AreEqual(BorderClip.MaskWidth, tex.width);
            Assert.AreEqual(0f, tex.GetPixel(128 + 64, 256 + 64 + 40).a, "above the NE edge (texture rows run up)");
            Assert.AreEqual(1f, tex.GetPixel(128, 256 - 10).a, "inside the diamond");
        }

        [Test]
        public void BorderWaterTilesOfTheRealMapAreMaskedAndNothingElseIs()
        {
            var root = new GameObject("BorderClipTests");
            try
            {
                ViewAssets? assets = ViewAssets.Load();
                var art = new ArtLibrary(assets != null ? assets.artCatalog : null);
                ContentBundle content = TestContent.Load();
                var layer = new TileLayer(root.transform, art, new IsoProjection(), content.Scenario, content.Theme);
                SpriteMask[] masks = root.GetComponentsInChildren<SpriteMask>();
                Assert.AreEqual(layer.ClippedTileCount, masks.Length);
                if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
                int expected = 0;
                for (int y = 0; y < layer.Height; y++)
                {
                    for (int x = 0; x < layer.Width; x++)
                    {
                        if ((x == 0 || y == 0) && !layer.IsLandAt(x, y)) expected++;
                    }
                }

                Assert.AreEqual(expected, layer.ClippedTileCount);
                Assert.Greater(expected, 0, "the river leaves the map on the NE border");
                foreach (SpriteMask m in masks)
                {
                    SpriteRenderer r = m.transform.parent.GetComponent<SpriteRenderer>();
                    Assert.AreEqual(SpriteMaskInteraction.VisibleInsideMask, r.maskInteraction);
                }
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }
    }
}
