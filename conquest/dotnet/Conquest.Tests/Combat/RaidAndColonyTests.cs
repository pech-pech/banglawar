using Conquest.Core.Combat;
using Conquest.Core.Contracts;

namespace Conquest.Tests.Combat
{
    public class RaidTests
    {
        [TestCase(1, 0)]
        [TestCase(2, 0)]
        [TestCase(3, 100)]
        [TestCase(4, 80)]
        [TestCase(5, 64)]
        [TestCase(6, 51)]
        [TestCase(7, 40)]
        public void SpoilsStartAtRoundThreeAndShrinkByFourFifthsPerRound(int round, int permille)
        {
            Assert.That(Raid.SpoilsPermille(round), Is.EqualTo(permille));
        }

        [TestCase(1, 0)]
        [TestCase(4, 0)]
        [TestCase(5, 1)]
        [TestCase(9, 1)]
        public void OneBuildingLevelFallsPerRoundAfterTheFourth(int round, int levels)
        {
            Assert.That(Raid.LevelsLoweredInRound(round), Is.EqualTo(levels));
        }

        [Test]
        public void SettleTakesFromEveryStockExceptPeople()
        {
            ResourceVector stock = new ResourceVector(1000, 0, 100, 0, 0, 50);

            RaidSpoils spoils = Raid.Settle(stock, roundsPlayed: 5);

            Assert.That(spoils.Seized, Is.EqualTo(new ResourceVector(224, 0, 22, 0, 0, 0)));
            Assert.That(spoils.Remaining, Is.EqualTo(new ResourceVector(776, 0, 78, 0, 0, 50)));
            Assert.That(spoils.BuildingLevelsLowered, Is.EqualTo(1));
        }

        [Test]
        public void ShortRaidsTakeNothing()
        {
            ResourceVector stock = new ResourceVector(1000, 10, 10, 10, 10, 10);
            RaidSpoils spoils = Raid.Settle(stock, roundsPlayed: 2);

            Assert.That(spoils.Seized, Is.EqualTo(ResourceVector.Zero));
            Assert.That(spoils.Remaining, Is.EqualTo(stock));
            Assert.That(spoils.BuildingLevelsLowered, Is.EqualTo(0));
        }

        [Test]
        public void LevelsAddUpOverTheRounds()
        {
            Assert.That(Raid.Settle(ResourceVector.Zero, 8).BuildingLevelsLowered, Is.EqualTo(4));
        }

        [Test]
        public void LowerLevelsHitsTheTallestBuildingsFirstAndFortsLast()
        {
            int[] levels = { 2, 3, 1, 4 };
            bool[] isFort = { false, false, false, true };

            int[] after = Raid.LowerLevels(levels, isFort, 4);

            Assert.That(after, Is.EqualTo(new[] { 0, 1, 1, 4 }));
            Assert.That(levels, Is.EqualTo(new[] { 2, 3, 1, 4 }), "the input is not changed");
        }

        [Test]
        public void FortsFallOnlyWhenNothingElseIsLeft()
        {
            int[] after = Raid.LowerLevels(new[] { 1, 2 }, new[] { false, true }, 2);
            Assert.That(after, Is.EqualTo(new[] { 0, 1 }));
        }
    }

    public class ColonyDefenceTests
    {
        [Test]
        public void MilitiaIsTwoPerCenterLevelAndFortsAddOneRangedPerLevel()
        {
            var specs = ColonyDefence.Generated(coreLevel: 3, fortLevels: 2, firstId: -1);

            Assert.That(specs.Count(s => s.Kind == UnitKind.Line), Is.EqualTo(6));
            Assert.That(specs.Count(s => s.Kind == UnitKind.Ranged), Is.EqualTo(2));
            Assert.That(specs.All(s => s.Strength == 2 && s.Generated), Is.True);
            Assert.That(specs.Select(s => s.Id).Distinct().Count(), Is.EqualTo(8));
            Assert.That(specs.All(s => s.Id < 0), Is.True);
        }

        [Test]
        public void PopulationPaysFiveForEachMilitiaStrengthPointLostButNotForFortRanged()
        {
            var specs = ColonyDefence.Generated(1, 1, -1);
            BattleState final = BattleState.Create(
                new[] { new BattleUnit(-1, BattleSide.Defender, UnitKind.Line, 1, 2, 0, 3) },
                new SideInfo(), new SideInfo());

            int loss = ColonyDefence.PopLoss(final, specs);

            Assert.That(loss, Is.EqualTo(5 * (1 + 2)), "one militia down by one point, the other gone (2); the ranged is free");
        }
    }
}
