using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class BootstrapTests
    {
        [Test]
        public void ScenarioMapBecomesTheCoreGrid()
        {
            StartResult boot = TestContent.Load().Boot;

            Assert.AreEqual(12, boot.State.Width);
            Assert.AreEqual(10, boot.State.Height);
            Assert.AreEqual(Terrain.WoodA, boot.State.TerrainAt(new TileCoord(0, 0)));
            Assert.AreEqual(Terrain.River, boot.State.TerrainAt(new TileCoord(10, 1)));
            Assert.AreEqual(Terrain.Still, boot.State.TerrainAt(new TileCoord(2, 7)), "the lake sits in the south-west");
            Assert.AreEqual(Terrain.Open, boot.State.TerrainAt(new TileCoord(8, 6)), "the old pond beside the capital is meadow now");
        }

        [Test]
        public void OpeningUnitsArePlacedOnTheEntryTiles()
        {
            StartResult boot = TestContent.Load().Boot;

            var mine = boot.State.UnitTable.Where(u => u.Owner == boot.LocalSlot).ToList();
            Assert.AreEqual(0, boot.LocalSlot);
            Assert.AreEqual(7, mine.Count, "five units from sector 8 and two from sector 6 arrive on turn 0");
            Assert.AreEqual(2, mine.Count(u => u.Role == UnitRole.Founder));
            Assert.AreEqual(1, mine.Count(u => u.Role == UnitRole.Scout));
            Assert.IsTrue(mine.All(u => u.Pos.X <= 3 && u.Pos.Y <= 5), "all on the west or north entry tiles");
        }

        [Test]
        public void PrePlacedBasesBringBuildingsAndGarrison()
        {
            StartResult boot = TestContent.Load().Boot;

            Assert.AreEqual(6, boot.State.BaseTable.Count);
            Base capital = boot.State.BaseTable.Single(b => b.SiteId == "site.capital");
            Assert.AreEqual(1, capital.Owner);
            Assert.AreEqual(3, capital.CoreLevel);
            Assert.AreEqual(5, capital.Buildings.Count);
            int garrisonAtCapital = boot.State.UnitTable.Count(u => u.Owner == 1 && u.Pos == capital.Pos);
            Assert.AreEqual(6, garrisonAtCapital, "three line, one shock, one ranged and the commander");
        }

        [Test]
        public void SameScenarioGivesTheSameStateHash()
        {
            ulong a = StateHasher.Hash(TestContent.Load().Boot.State);
            ulong b = StateHasher.Hash(TestContent.Load().Boot.State);

            Assert.AreEqual(a, b);
        }
    }
}
