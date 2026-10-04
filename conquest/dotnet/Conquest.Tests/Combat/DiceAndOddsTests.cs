using Conquest.Core.Combat;

namespace Conquest.Tests.Combat
{
    public class SplitMix64Tests
    {
        [Test]
        public void SeedZeroMatchesPublishedVector()
        {
            SplitMix64 dice = new SplitMix64(0);
            ulong[] expected = { 16294208416658607535UL, 7960286522194355700UL, 487617019471545679UL };

            foreach (ulong want in expected)
            {
                dice = dice.Next(out ulong got);
                Assert.That(got, Is.EqualTo(want));
            }
        }

        [Test]
        public void SeedFromReferenceImplementationMatches()
        {
            SplitMix64 dice = new SplitMix64(1234567);
            dice = dice.Next(out ulong first);
            dice = dice.Next(out ulong second);

            Assert.That(first, Is.EqualTo(6457827717110365317UL));
            Assert.That(second, Is.EqualTo(3203168211198807973UL));
        }

        [Test]
        public void NextDoesNotChangeTheSourceValue()
        {
            SplitMix64 dice = new SplitMix64(7);
            dice.Next(out ulong a);
            dice.Next(out ulong b);

            Assert.That(a, Is.EqualTo(b));
        }

        [Test]
        public void BelowStaysInRangeAndHitsEveryValue()
        {
            SplitMix64 dice = new SplitMix64(99);
            bool[] seen = new bool[6];
            for (int i = 0; i < 500; i++)
            {
                dice = dice.Below(6, out int roll);
                Assert.That(roll, Is.InRange(0, 5));
                seen[roll] = true;
            }

            Assert.That(seen, Is.All.True);
        }

        [Test]
        public void BelowOneIsAlwaysZero()
        {
            new SplitMix64(5).Below(1, out int roll);
            Assert.That(roll, Is.EqualTo(0));
        }

        [TestCase(0)]
        [TestCase(-3)]
        public void BelowRejectsNonPositiveBounds(int n)
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new SplitMix64(1).Below(n, out _));
        }
    }

    public class OddsTests
    {
        private static readonly CombatRules R = CombatRules.Default;

        [Test]
        public void BaseChancesFollowTheGdd()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line)), Is.EqualTo(300));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Shock)), Is.EqualTo(320));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged)), Is.EqualTo(280));
        }

        [Test]
        public void FlankingAndCombinedArmsAreAdditive()
        {
            HitContext ctx = new HitContext(UnitKind.Line, flankSquares: 3, distinctKinds: 2);
            Assert.That(Odds.HitChance(R, ctx), Is.EqualTo(300 + 2 * 50 + 1 * 50));
        }

        [Test]
        public void ChargeAddsOnlyForShock()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Shock, charged: true)), Is.EqualTo(420));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line, charged: true)), Is.EqualTo(300));
        }

        [Test]
        public void RangedLosesPerRowOfDistance()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged, rowDistance: 1)), Is.EqualTo(280));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged, rowDistance: 3)), Is.EqualTo(180));
        }

        [Test]
        public void LoneRangedTargetBonusAppliesToMeleeOnly()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line, targetSquareOnlyRanged: true)), Is.EqualTo(450));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged, targetSquareOnlyRanged: true)), Is.EqualTo(280));
        }

        [Test]
        public void CounterBatteryReducesRangedAgainstRanged()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged, targetKind: UnitKind.Ranged)), Is.EqualTo(180));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line, targetKind: UnitKind.Ranged)), Is.EqualTo(300));
        }

        [Test]
        public void SideBonusIsAddedAndResultIsClamped()
        {
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line, sideBonusPermille: 40)), Is.EqualTo(340));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Line, flankSquares: 9, distinctKinds: 3, sideBonusPermille: 900)), Is.EqualTo(950));
            Assert.That(Odds.HitChance(R, new HitContext(UnitKind.Ranged, rowDistance: 12)), Is.EqualTo(50));
        }

        [Test]
        public void PanicChanceGrowsWithDamageAndRespondsToCommanders()
        {
            int fresh = Odds.PanicChance(R, lost: 0, max: 4, ownCharisma: 0, enemyReputation: 0, modifierPermille: 0);
            int hurt = Odds.PanicChance(R, lost: 2, max: 4, ownCharisma: 0, enemyReputation: 0, modifierPermille: 0);
            int charismatic = Odds.PanicChance(R, lost: 2, max: 4, ownCharisma: 5, enemyReputation: 0, modifierPermille: 0);
            int feared = Odds.PanicChance(R, lost: 2, max: 4, ownCharisma: 0, enemyReputation: 5, modifierPermille: 0);

            Assert.That(fresh, Is.EqualTo(50));
            Assert.That(hurt, Is.EqualTo(50 + 300));
            Assert.That(charismatic, Is.EqualTo(hurt - 100));
            Assert.That(feared, Is.EqualTo(hurt + 100));
        }

        [Test]
        public void PanicModifierIsAddedBeforeTheCapAndNeverNegative()
        {
            Assert.That(Odds.PanicChance(R, 3, 3, 0, 0, 100), Is.EqualTo(750));
            Assert.That(Odds.PanicChance(R, 3, 3, 0, 10, 500), Is.EqualTo(900));
            Assert.That(Odds.PanicChance(R, 0, 5, 10, 0, 0), Is.EqualTo(0));
        }
    }

    public class CommanderStatsTests
    {
        [Test]
        public void CharismaIsTwoPlusLevelPlusAnIntegerRollAndReputationStartsAtZero()
        {
            SplitMix64 dice = new SplitMix64(3);
            for (int i = 0; i < 50; i++)
            {
                CommanderStats c = CommanderStats.Create(2, dice, out dice);
                Assert.That(c.Charisma, Is.InRange(4, 6));
                Assert.That(c.Reputation, Is.EqualTo(0));
                Assert.That(c.Level, Is.EqualTo(2));
            }
        }

        [Test]
        public void CharismaIsClampedToTen()
        {
            CommanderStats c = CommanderStats.Create(9, new SplitMix64(1), out _);
            Assert.That(c.Charisma, Is.EqualTo(10));
        }

        [Test]
        public void ReputationMovesByOneAndStaysInRange()
        {
            CommanderStats c = new CommanderStats(1, 3, 0);
            Assert.That(c.AfterBattle(won: false).Reputation, Is.EqualTo(0));
            Assert.That(c.AfterBattle(won: true).Reputation, Is.EqualTo(1));
            Assert.That(new CommanderStats(1, 3, 10).AfterBattle(won: true).Reputation, Is.EqualTo(10));
            Assert.That(new CommanderStats(1, 3, 4).AfterBattle(won: false).Reputation, Is.EqualTo(3));
        }
    }

    public class GeometryTests
    {
        [Test]
        public void SlotsAreOneTwoTwo()
        {
            Assert.That(Geometry.Slots(CombatRules.Default, UnitKind.Line), Is.EqualTo(1));
            Assert.That(Geometry.Slots(CombatRules.Default, UnitKind.Shock), Is.EqualTo(2));
            Assert.That(Geometry.Slots(CombatRules.Default, UnitKind.Ranged), Is.EqualTo(2));
        }

        [Test]
        public void HomeRowsAndFlagsAreAtOppositeEnds()
        {
            CombatRules r = CombatRules.Default;
            Assert.That(Geometry.HomeRow(r, BattleSide.Attacker), Is.EqualTo(0));
            Assert.That(Geometry.HomeRow(r, BattleSide.Defender), Is.EqualTo(3));
            Assert.That(Geometry.FlagCol(r), Is.EqualTo(1));
        }

        [Test]
        public void OrthogonalAdjacencyOnly()
        {
            Assert.That(Geometry.Adjacent(1, 1, 1, 2), Is.True);
            Assert.That(Geometry.Adjacent(1, 1, 2, 1), Is.True);
            Assert.That(Geometry.Adjacent(1, 1, 2, 2), Is.False);
            Assert.That(Geometry.Adjacent(1, 1, 1, 1), Is.False);
        }
    }
}
