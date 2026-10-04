using Conquest.Unity.Art;
using NUnit.Framework;
using UnityEngine;

namespace Conquest.UnityView.Tests
{
    /// <summary>The structures added with the second art batch resolve through the imported catalog by neutral role id.</summary>
    public sealed class NewBuildingArtTests
    {
        private static readonly string[] NewRoles =
            { "basic_extractor", "hard_extractor", "coin_extractor", "converter", "attractor", "academy", "garrison" };

        private ArtLibrary art = null!;

        [SetUp]
        public void SetUp()
        {
            ViewAssets? assets = ViewAssets.Load();
            art = new ArtLibrary(assets != null ? assets.artCatalog : null);
            if (!art.HasCatalog) Assert.Ignore("no imported art catalog in this checkout");
        }

        [Test]
        public void EveryNewRoleHasAPictureForBothSides()
        {
            foreach (string role in NewRoles)
            {
                foreach (string slot in new[] { "f1", "f2" })
                {
                    Assert.IsTrue(art.TryGet("bld", role, null, slot, out ArtClip clip), role + " " + slot);
                    Assert.IsNotNull(clip.Frame(0), role + " " + slot);
                }
            }
        }

        [Test]
        public void TheGarrisonIsTheCampForYouAndTheStrongpointForTheOpposingSide()
        {
            art.TryGet("bld", "garrison", null, "f1", out ArtClip mine);
            art.TryGet("bld", "garrison", null, "f2", out ArtClip theirs);

            Assert.AreEqual("bld.garrison", mine.Entry.Key);
            Assert.AreEqual("bld.garrison@f2", theirs.Entry.Key);
            Assert.AreNotEqual(mine.Frame(0), theirs.Frame(0));
            Assert.AreEqual(2, mine.Entry.Footprint.X);
            Assert.AreEqual(2, theirs.Entry.Footprint.Y);
        }

        [Test]
        public void OneByOneStructuresKeepTheOneTileFootprint()
        {
            foreach (string role in NewRoles)
            {
                if (role == "garrison") continue;
                art.TryGet("bld", role, null, "f1", out ArtClip clip);
                Assert.AreEqual(1, clip.Entry.Footprint.X, role);
                Assert.AreEqual(1, clip.Entry.Footprint.Y, role);
            }
        }
    }
}
