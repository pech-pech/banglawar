using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// The view side of the polish round with the real art catalog and the real scenario, no scene: banner beam
    /// stretching found on the real pictures, stack layout and badges, layering bands, footprint anchors, placeholders.
    /// </summary>
    public sealed class PolishViewTests
    {
        private GameObject root = null!;
        private ArtLibrary art = null!;
        private GameSession session = null!;
        private readonly IsoProjection iso = new IsoProjection();

        [SetUp]
        public void SetUp()
        {
            PolishSettings.Reset();
            root = new GameObject("PolishViewTests");
            ViewAssets? assets = ViewAssets.Load();
            art = new ArtLibrary(assets != null ? assets.artCatalog : null);
            session = TestContent.NewSession();
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(root);
            PolishSettings.Reset();
        }

        private static readonly string[] Roles = { "scout", "founder", "commander", "line", "shock", "ranged", "transport", "militia" };

        [Test]
        public void EveryClayAndSelectedBannerPictureHasAStretchableBeam()
        {
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
            foreach (string role in Roles)
            {
                foreach (string slot in new[] { "f1", "f2" })
                {
                    foreach (string? state in new[] { null, "selected" })
                    {
                        Assert.IsTrue(art.TryGet("u", role, state, slot, out ArtClip clip), role + " " + state + " " + slot);
                        BannerPicture picture = art.Banners.Get(clip.Frame(0));
                        Assert.IsTrue(picture.CanStretch, "no beam band found in " + clip.Entry.Key);
                        Assert.That(picture.Profile!.BeamWidth, Is.InRange(20, 30), clip.Entry.Key);
                        Assert.That(picture.DrawnBeamPx, Is.InRange(55, 75), clip.Entry.Key + ": the art's beam is about half the cloth");
                        Assert.That(picture.Sprite.border.y, Is.EqualTo(picture.Profile.BottomBorder));
                    }
                }
            }
        }

        [Test]
        public void ClayAndSelectedPicturesShareTheClothHeightAboveTheGround()
        {
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
            foreach (string role in Roles)
            {
                art.TryGet("u", role, null, "f1", out ArtClip clay);
                art.TryGet("u", role, "selected", "f1", out ArtClip selected);
                BannerPicture a = art.Banners.Get(clay.Frame(0));
                BannerPicture b = art.Banners.Get(selected.Frame(0));
                Assert.That(Mathf.Abs(a.DrawnBeamPx - b.DrawnBeamPx), Is.LessThanOrEqualTo(6), role + ": the hologram picture lines up with the clay");
            }
        }

        private BannerView Banner(string role, int owner = 0)
        {
            BannerView view = BannerView.Create(root.transform, art, 1, owner, role, owner == 0 ? "f1" : "f2");
            return view;
        }

        [Test]
        public void SizeCandidatesScaleByClassAndStretchOnlyTheBeam()
        {
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
            BannerView view = Banner("line");
            view.Configure(BannerSizing.For(PolishChoice.C1), SelectionLook.For(PolishChoice.C2));
            int cloth = view.ClothArtPx;
            int beam1 = view.BeamArtPx;
            Assert.AreEqual(0, view.ExtraBeamArtPx);

            view.Configure(BannerSizing.For(PolishChoice.C3), SelectionLook.For(PolishChoice.C2));
            Assert.AreEqual(cloth, view.ClothArtPx, "the cloth is never stretched");
            Assert.AreEqual(cloth, view.BeamArtPx, "C3: beam as long as the cloth");
            Assert.Greater(view.BeamArtPx, beam1);
            Assert.AreEqual(SpriteDrawMode.Sliced, view.ClayRenderer.drawMode);
            Assert.AreEqual(1500, view.ScalePermille);
            Assert.AreEqual(1.5f, view.transform.localScale.x, 1e-4f);
        }

        [Test]
        public void TheClothHitRectangleSitsAboveTheBeamAndGrowsWithTheScale()
        {
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
            var camGo = new GameObject("cam");
            camGo.transform.SetParent(root.transform);
            Camera cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 720f / (2f * 256f);
            cam.aspect = 1280f / 720f;
            cam.transform.position = new Vector3(0f, 0f, -10f);
            BannerView view = Banner("commander");
            view.Configure(BannerSizing.For(PolishChoice.C1), SelectionLook.For(PolishChoice.C2));
            view.Place(new GridPos(0, 0), new StackSlot(0, 0, 1000, true, 0), 0, 1, iso);
            PixelRect small = view.ScreenRect(cam, cam.pixelHeight);
            view.Configure(BannerSizing.For(PolishChoice.C3), SelectionLook.For(PolishChoice.C2));
            PixelRect big = view.ScreenRect(cam, cam.pixelHeight);
            Assert.Greater(big.Height, small.Height);
            Assert.Less(big.Bottom, small.Bottom, "a longer beam lifts the cloth (smaller screen y is higher)");
            Assert.That(small.Bottom, Is.LessThan(cam.pixelHeight / 2), "the cloth is above the tile centre");
        }

        private BannerLayer Layer(PolishOptions options)
        {
            PolishSettings.Set(options);
            var layer = new BannerLayer(root.transform, art, iso, session.State, session.LocalSlot);
            layer.SetOptions(options);
            layer.Reconcile(session.State);
            return layer;
        }

        [Test]
        public void TurnZeroArrivalsStackAndEveryUnitIsVisibleOrCounted()
        {
            foreach (PolishChoice c in new[] { PolishChoice.C1, PolishChoice.C2, PolishChoice.C3 })
            {
                PolishOptions options = PolishOptions.Default.With(PolishDecision.Stack, c);
                BannerLayer layer = Layer(options);
                int units = session.State.UnitTable.Count;
                Assert.AreEqual(units, layer.Count);
                int visible = layer.Banners.Values.Count(b => !b.Hidden);
                int counted = 0;
                foreach (KeyValuePair<GridPos, List<StackMember>> stack in layer.Stacks)
                {
                    int shown = stack.Value.Count(m => !layer.Banners[m.Id].Hidden);
                    int badge = StackLayout.BadgeNumber(options.Stack, stack.Value.Count);
                    Assert.IsTrue(shown == stack.Value.Count || shown + badge == stack.Value.Count || badge == stack.Value.Count, c + " stack at " + stack.Key);
                    counted += shown;
                }

                Assert.AreEqual(visible, counted);
                Assert.Greater(layer.Stacks.Max(s => s.Value.Count), 4, "the slice has a stack of five or more on turn 0");
                Object.DestroyImmediate(layer.Root.gameObject);
            }
        }

        [Test]
        public void TheCommanderLeadsItsStackAndASelectedUnitTakesTheLead()
        {
            BannerLayer layer = Layer(PolishOptions.Default);
            UnitView commander = session.State.AsView().Units.First(u => u.Owner == 0 && u.Role == UnitRole.Commander);
            var tile = new GridPos(commander.Pos.X, commander.Pos.Y);
            Assert.AreEqual(commander.Id, layer.StackAt(tile)[0].Id);
            Assert.AreEqual(0, layer.Banners[commander.Id].StackDepth);
            int other = layer.StackAt(tile)[2].Id;
            layer.SetSelection(SelectionModel.Create(0).Click(new UnitRef(other, 0), false));
            Assert.AreEqual(other, layer.StackAt(tile)[0].Id);
            Assert.AreEqual(0, layer.Banners[other].StackDepth);
            Assert.IsFalse(layer.Banners[other].Hidden);
            Assert.AreEqual(other, layer.UnitAt(tile), "a tap on the bare tile reaches the lead");
        }

        [Test]
        public void BadgesFollowTheStackStyle()
        {
            int Badges(PolishChoice c)
            {
                BannerLayer layer = Layer(PolishOptions.Default.With(PolishDecision.Stack, c));
                int n = layer.Badges().Count;
                Object.DestroyImmediate(layer.Root.gameObject);
                return n;
            }

            int stacksOfTwo = Layer(PolishOptions.Default).Stacks.Count(s => s.Value.Count >= 2);
            Assert.AreEqual(stacksOfTwo, Badges(PolishChoice.C2), "lead and peek: every stack");
            Assert.Less(Badges(PolishChoice.C1), stacksOfTwo, "row fan: only stacks with hidden units");
            Assert.AreEqual(0, Badges(PolishChoice.C3), "arc fan: no stack above six on turn 0");
        }

        [Test]
        public void BandsPutTheBannerGroupAboveTheOverlayGroupAboveTheWorld()
        {
            PolishSettings.Set(PolishOptions.Default.With(PolishDecision.Layering, PolishChoice.C3));
            BannerLayer banners = Layer(PolishSettings.Current);
            var overlay = new OverlayLayer(root.transform, art, iso);
            SortingGroup bannerGroup = banners.Root.GetComponent<SortingGroup>();
            SortingGroup overlayGroup = overlay.Root.GetComponent<SortingGroup>();
            Assert.IsTrue(bannerGroup.enabled && overlayGroup.enabled);
            Assert.Greater(bannerGroup.sortingOrder, overlayGroup.sortingOrder);
            Assert.Greater(overlayGroup.sortingOrder, SortKey.ForDepthLayer(new GridPos(255, 255), 5, 9));

            banners.SetOptions(PolishOptions.Default.With(PolishDecision.Layering, PolishChoice.C1));
            overlay.SetOptions(PolishOptions.Default.With(PolishDecision.Layering, PolishChoice.C1));
            Assert.IsFalse(bannerGroup.enabled, "the old layering has no bands");
            Assert.IsFalse(overlayGroup.enabled);
        }

        [Test]
        public void SelectionRingsFollowTheLook()
        {
            var overlay = new OverlayLayer(root.transform, art, iso);
            var selected = new List<(GridPos, int)> { (new GridPos(1, 1), 0), (new GridPos(1, 1), 0), (new GridPos(4, 2), 1) };
            overlay.SetOptions(PolishOptions.Default.With(PolishDecision.Selection, PolishChoice.C2));
            overlay.SetSelectionRings(selected);
            Assert.AreEqual(2, overlay.VisibleRings, "one ring per tile");
            overlay.SetOptions(PolishOptions.Default.With(PolishDecision.Selection, PolishChoice.C1));
            overlay.SetSelectionRings(selected);
            Assert.AreEqual(0, overlay.VisibleRings, "C1 relies on the art's own ring");
        }

        [Test]
        public void FootprintCandidatesPlaceTheEdgeBaseAsDocumented()
        {
            var layer = new StructureLayer(root.transform, art, iso);
            int OffMap(PolishChoice c)
            {
                layer.SetOptions(PolishOptions.Default.With(PolishDecision.Footprint, c));
                layer.Rebuild(session.State);
                return layer.Pieces.Sum(p => FootprintPlacement.OffMapTiles(p.Placement, 12, 10));
            }

            if (art.HasCatalog) Assert.Greater(OffMap(PolishChoice.C1), 0, "top-left anchors hang off the east and south edges");
            Assert.AreEqual(0, OffMap(PolishChoice.C2));
            Assert.AreEqual(0, OffMap(PolishChoice.C3));
            layer.SetOptions(PolishOptions.Default.With(PolishDecision.Footprint, PolishChoice.C3));
            StructurePiece edge = layer.Pieces.First(p => p.Role == "core" && p.RuleTile == new GridPos(11, 6));
            Assert.AreEqual(new GridPos(11, 6), edge.Placement.Origin);
            if (edge.UsesArt) Assert.AreEqual(0.5f, edge.Renderer.transform.localScale.x, 1e-4f, "the 2 x 2 core is fitted to its one rule tile");
        }

        [Test]
        public void BuildingsWithoutArtAreClayBlocksInTheirRoleTone()
        {
            var layer = new StructureLayer(root.transform, art, iso);
            layer.Rebuild(session.State);
            StructurePiece[] blocks = layer.Pieces.Where(p => !p.UsesArt).ToArray();
            if (art.HasCatalog) Assert.AreEqual(0, blocks.Length, "every role has a picture now (the garrison and the economy buildings were the last)");
            foreach (StructurePiece block in blocks)
            {
                StringAssert.StartsWith("block", block.Renderer.sprite.name);
                Assert.Greater(block.Renderer.sprite.rect.height, 64f, "a block has walls");
            }
        }

        [Test]
        public void WaterPlaceholdersTakeTheCandidateTone()
        {
            ContentBundle content = TestContent.Load();
            // water has art now, so the placeholder path is exercised the way a checkout without imported art sees it
            var tiles = new TileLayer(root.transform, new ArtLibrary(null), iso, content.Scenario, content.Theme);
            Assert.Greater(tiles.PlaceholderCount, 0, "with no art catalog the river and lake are drawn diamonds");
            foreach (PolishChoice c in new[] { PolishChoice.C1, PolishChoice.C2, PolishChoice.C3 })
            {
                PlaceholderStyle style = PlaceholderStyle.For(c);
                tiles.SetPlaceholders(style);
                SpriteRenderer water = tiles.Root.GetComponentsInChildren<SpriteRenderer>().First(r => r.gameObject.name.EndsWith(" water"));
                StringAssert.Contains(ColorUtility.ToHtmlStringRGBA(ViewUtil.ToColor(style.Water)), water.sprite.name, c.ToString());
                StringAssert.Contains(ColorUtility.ToHtmlStringRGBA(ViewUtil.ToColor(style.WaterBorder)), water.sprite.name, c + ": the subtle border");
            }
        }
    }
}
