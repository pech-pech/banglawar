using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Tests.Combat;

namespace Conquest.Tests.Rules
{
    public class HealingRulesTests
    {
        private static HealBase Base(int id, int owner, HealBuilding[] buildings, params HealUnit[] units)
        {
            return new HealBase(id, owner, buildings, units);
        }

        private static readonly HealingConfig Hospital = new HealingConfig(
            new[] { new HealingSource("bld.scout_post", new[] { 1, 1, 2, 2 }) }, 5);

        [Test]
        public void NeutralRuleHealsOnePerTurnAtTheCore()
        {
            var healed = HealingRules.Compute(
                HealingConfig.Neutral,
                new[] { Base(1, 0, new[] { new HealBuilding("bld.core", 2) }, new HealUnit(10, 2, 4)) });

            Assert.That(healed.Single().NewStrength, Is.EqualTo(3));
            Assert.That(healed.Single().Amount, Is.EqualTo(1));
            Assert.That(healed.Single().Building, Is.EqualTo("bld.core"));
        }

        [Test]
        public void UnitsAtFullStrengthAreNotListed()
        {
            var healed = HealingRules.Compute(HealingConfig.Neutral, new[] { Base(1, 0, new[] { new HealBuilding("bld.core", 1) }, new HealUnit(10, 3, 3)) });
            Assert.That(healed, Is.Empty);
        }

        [Test]
        public void HospitalConfigurationStopsTheCoreHealing()
        {
            var healed = HealingRules.Compute(Hospital, new[] { Base(1, 0, new[] { new HealBuilding("bld.core", 4) }, new HealUnit(10, 1, 4)) });
            Assert.That(healed, Is.Empty);
        }

        [Test]
        public void HealRateFollowsTheSourceLevel()
        {
            var level1 = HealingRules.Compute(Hospital, new[] { Base(1, 0, new[] { new HealBuilding("bld.scout_post", 1) }, new HealUnit(10, 1, 5)) });
            var level3 = HealingRules.Compute(Hospital, new[] { Base(1, 0, new[] { new HealBuilding("bld.scout_post", 3) }, new HealUnit(10, 1, 5)) });

            Assert.That(level1.Single().Amount, Is.EqualTo(1));
            Assert.That(level3.Single().Amount, Is.EqualTo(2));
        }

        [Test]
        public void TheBestSourceWinsAndSourcesDoNotStack()
        {
            HealingConfig both = new HealingConfig(
                new[] { new HealingSource("bld.core", new[] { 1, 1, 1, 1 }), new HealingSource("bld.scout_post", new[] { 1, 1, 2, 2 }) }, 5);

            var healed = HealingRules.Compute(
                both,
                new[] { Base(1, 0, new[] { new HealBuilding("bld.core", 1), new HealBuilding("bld.scout_post", 4) }, new HealUnit(10, 1, 5)) });

            Assert.That(healed.Single().Amount, Is.EqualTo(2));
            Assert.That(healed.Single().Building, Is.EqualTo("bld.scout_post"));
        }

        [Test]
        public void TiesBetweenSourcesAreBrokenByOrdinalRoleId()
        {
            HealingConfig both = new HealingConfig(
                new[] { new HealingSource("bld.scout_post", new[] { 1 }), new HealingSource("bld.core", new[] { 1, 1, 1, 1 }) }, 5);

            var healed = HealingRules.Compute(
                both,
                new[] { Base(1, 0, new[] { new HealBuilding("bld.scout_post", 1), new HealBuilding("bld.core", 1) }, new HealUnit(10, 1, 5)) });

            Assert.That(healed.Single().Building, Is.EqualTo("bld.core"));
        }

        [Test]
        public void HealingStopsAtTheUnitsMaximumAndTheConfigCap()
        {
            var nearFull = HealingRules.Compute(Hospital, new[] { Base(1, 0, new[] { new HealBuilding("bld.scout_post", 4) }, new HealUnit(10, 4, 5)) });
            var overCap = HealingRules.Compute(Hospital, new[] { Base(1, 0, new[] { new HealBuilding("bld.scout_post", 4) }, new HealUnit(10, 4, 9)) });

            Assert.That(nearFull.Single().Amount, Is.EqualTo(1));
            Assert.That(overCap.Single().NewStrength, Is.EqualTo(5));
        }

        [Test]
        public void UnitsAreHealedInStableOrderByBaseThenUnit()
        {
            var healed = HealingRules.Compute(
                HealingConfig.Neutral,
                new[]
                {
                    Base(2, 1, new[] { new HealBuilding("bld.core", 1) }, new HealUnit(30, 1, 3), new HealUnit(5, 1, 3)),
                    Base(1, 0, new[] { new HealBuilding("bld.core", 1) }, new HealUnit(20, 1, 3)),
                });

            Assert.That(healed.Select(h => h.UnitId), Is.EqualTo(new[] { 20, 5, 30 }));
            Assert.That(healed.Select(h => h.OwnerSlot), Is.EqualTo(new[] { 0, 1, 1 }));
        }

        [Test]
        public void ValidateRejectsDuplicatesWrongLengthsAndUnknownRoles()
        {
            Func<string, int> levels = role => role == "bld.core" ? 4 : role == "bld.scout_post" ? 4 : 0;

            Assert.That(HealingRules.Validate(Hospital, levels), Is.Empty);
            Assert.That(HealingRules.Validate(new HealingConfig(new[] { new HealingSource("bld.scout_post", new[] { 1, 1 }) }, 5), levels).Select(i => i.Code),
                Is.EqualTo(new[] { "err.healing_levels" }));
            Assert.That(HealingRules.Validate(new HealingConfig(new[] { new HealingSource("bld.core", new[] { 1, 1, 1, 1 }), new HealingSource("bld.core", new[] { 1, 1, 1, 1 }) }, 5), levels).Select(i => i.Code),
                Does.Contain("err.healing_duplicate"));
            Assert.That(HealingRules.Validate(new HealingConfig(new[] { new HealingSource("bld.nope", new[] { 1 }) }, 5), levels).Select(i => i.Code),
                Does.Contain("err.healing_role"));
        }

        [Test]
        public void StepReadsTheViewAndHealsUnitsOnTheirBaseTile()
        {
            TileCoord home = new TileCoord(4, 4);
            FakeView view = new FakeView { Turn = 5 };
            view.BaseList.Add(new BaseView(
                1, 0, home, null, 2, ResourceVector.Zero,
                ImmArray<BuildingView>.Of(new BuildingView(BuildingRole.ScoutPost, 3, home, 5), new BuildingView(BuildingRole.ScoutPost, 4, home, 6))));
            view.UnitList.Add(new UnitView(10, 0, UnitRole.Line, 4, 2, home, 0));
            view.UnitList.Add(new UnitView(11, 1, UnitRole.Line, 4, 2, home, 0));
            view.UnitList.Add(new UnitView(12, 0, UnitRole.Line, 4, 2, new TileCoord(9, 9), 0));

            StepResult result = new HealingStep(Hospital).Compute(view);

            Assert.That(result.UnitChanges.Select(c => (c.UnitId, c.NewStrength)), Is.EqualTo(new[] { (10, 4) }), "level 3 hospital is functional (ready turn 5), level 4 is not yet");
            UnitHealed e = result.Events.OfType<UnitHealed>().Single();
            Assert.That((e.Unit, e.Amount, e.Building, e.Slot), Is.EqualTo((10, 2, "bld.scout_post", 0)));
        }

        [Test]
        public void StepTreatsTheCoreAsAlwaysFunctionalAndUsesItsLevel()
        {
            TileCoord home = new TileCoord(4, 4);
            FakeView view = new FakeView { Turn = 1 };
            view.BaseList.Add(new BaseView(1, 0, home, null, 3, ResourceVector.Zero, ImmArray<BuildingView>.Empty));
            view.UnitList.Add(new UnitView(10, 0, UnitRole.Line, 3, 1, home, 0));

            StepResult result = new HealingStep(HealingConfig.Neutral).Compute(view);

            Assert.That(result.UnitChanges.Single().NewStrength, Is.EqualTo(2));
            Assert.That(result.Events.OfType<UnitHealed>().Single().Building, Is.EqualTo("bld.core"));
        }

        [Test]
        public void StepWithNothingToHealReturnsNone()
        {
            Assert.That(new HealingStep(HealingConfig.Neutral).Compute(new FakeView()).UnitChanges.Count, Is.EqualTo(0));
        }
    }

    public class SeasonTableTests
    {
        private static SeasonTable Bd()
        {
            return new SeasonTable(
                true,
                new[]
                {
                    new SeasonDefinition("season.pre_wet", 100, 100, 90),
                    new SeasonDefinition("season.wet", 150, 100, 100, new[] { new RolePct(UnitRole.Shock, 200) }),
                    new SeasonDefinition("season.dry", 100, 100, 115),
                },
                new[] { new SeasonRange(0, 21, "season.pre_wet"), new SeasonRange(22, 62, "season.wet"), new SeasonRange(63, 88, "season.dry") });
        }

        [Test]
        public void DisabledTableIsNeutralEverywhere()
        {
            IRuleHooks hooks = SeasonTable.Disabled;
            Assert.That(hooks.SeasonAt(40), Is.EqualTo("season.neutral"));
            Assert.That(hooks.MoveCostPct(40, MoveClass.Land), Is.EqualTo(100));
            Assert.That(hooks.FoodOutputPct(40), Is.EqualTo(100));
            Assert.That(SeasonTable.Disabled.FoodOutput(7, 33, 40), Is.EqualTo(7 * 133 / 100));
        }

        [TestCase(0, "season.pre_wet")]
        [TestCase(21, "season.pre_wet")]
        [TestCase(22, "season.wet")]
        [TestCase(62, "season.wet")]
        [TestCase(63, "season.dry")]
        [TestCase(88, "season.dry")]
        [TestCase(89, "season.neutral")]
        [TestCase(-1, "season.neutral")]
        public void SeasonLookupHonoursInclusiveRangesAndFallsBackToNeutral(int turn, string expected)
        {
            Assert.That(Bd().SeasonAt(turn), Is.EqualTo(expected));
        }

        [Test]
        public void MovementClassPercentsComeFromTheSeason()
        {
            SeasonTable t = Bd();
            Assert.That(t.MoveCostPct(30, MoveClass.Land), Is.EqualTo(150));
            Assert.That(t.MoveCostPct(30, MoveClass.Water), Is.EqualTo(100));
            Assert.That(t.MoveCostPct(70, MoveClass.Land), Is.EqualTo(100));
        }

        [Test]
        public void AUnitOverrideBeatsTheClassPercent()
        {
            SeasonTable t = Bd();
            Assert.That(t.MoveCostPctFor(30, UnitRole.Shock), Is.EqualTo(200));
            Assert.That(t.MoveCostPctFor(30, UnitRole.Line), Is.EqualTo(150));
            Assert.That(t.MoveCostPctFor(30, UnitRole.Transport), Is.EqualTo(100));
        }

        [Test]
        public void StepCostIsTerrainCostTimesPercentInHundredths()
        {
            Assert.That(SeasonTable.StepCostHundredths(3, 150), Is.EqualTo(450));
            Assert.That(SeasonTable.StepCostHundredths(1, 100), Is.EqualTo(100));
        }

        [Test]
        public void FoodOutputFloorsOnceAfterBothPercents()
        {
            SeasonTable t = Bd();
            Assert.That(t.FoodOutput(10, 20, 30), Is.EqualTo(12));
            Assert.That(t.FoodOutput(10, 20, 5), Is.EqualTo(10), "10 * 120 * 90 / 10000 = 10.8 floors to 10");
            Assert.That(t.FoodOutput(7, 0, 70), Is.EqualTo(8));
            Assert.That(t.FoodOutput(10, -150, 70), Is.EqualTo(-6), "negative values floor toward minus infinity");
        }

        [Test]
        public void ASeasonStartedEventIsRaisedAtTheEndOfTheLastTurnOfASeason()
        {
            SeasonTable t = Bd();
            Assert.That(t.SeasonStartedAfter(21)!.Season, Is.EqualTo("season.wet"));
            Assert.That(t.SeasonStartedAfter(62)!.Season, Is.EqualTo("season.dry"));
            Assert.That(t.SeasonStartedAfter(30), Is.Null);
            Assert.That(SeasonTable.Disabled.SeasonStartedAfter(21), Is.Null);
        }

        [Test]
        public void ValidTableHasNoIssues()
        {
            Assert.That(Bd().Validate(), Is.Empty);
        }

        [Test]
        public void ValidateFindsOverlapOrderUnknownIdsAndBounds()
        {
            SeasonDefinition ok = new SeasonDefinition("season.a", 100, 100, 100);
            SeasonTable overlap = new SeasonTable(true, new[] { ok }, new[] { new SeasonRange(0, 10, "season.a"), new SeasonRange(10, 20, "season.a") });
            SeasonTable unknown = new SeasonTable(true, new[] { ok }, new[] { new SeasonRange(0, 10, "season.zzz") });
            SeasonTable reversed = new SeasonTable(true, new[] { ok }, new[] { new SeasonRange(10, 5, "season.a") });
            SeasonTable tooHard = new SeasonTable(true, new[] { new SeasonDefinition("season.a", 400, 100, 100) }, new SeasonRange[0]);
            SeasonTable tooRich = new SeasonTable(true, new[] { new SeasonDefinition("season.a", 100, 100, 250) }, new SeasonRange[0]);
            SeasonTable duplicate = new SeasonTable(true, new[] { ok, ok }, new SeasonRange[0]);

            Assert.That(overlap.Validate().Select(i => i.Code), Does.Contain("err.season_overlap"));
            Assert.That(unknown.Validate().Select(i => i.Code), Does.Contain("err.season_unknown"));
            Assert.That(reversed.Validate().Select(i => i.Code), Does.Contain("err.season_range"));
            Assert.That(tooHard.Validate().Select(i => i.Code), Does.Contain("err.season_bounds"));
            Assert.That(tooRich.Validate().Select(i => i.Code), Does.Contain("err.season_bounds"));
            Assert.That(duplicate.Validate().Select(i => i.Code), Does.Contain("err.season_duplicate"));
        }

        [Test]
        public void ASchedulePresentWhileTheHookIsOffIsALoadError()
        {
            SeasonTable off = new SeasonTable(false, new SeasonDefinition[0], new[] { new SeasonRange(0, 5, "season.a") });
            Assert.That(off.Validate().Select(i => i.Code), Is.EqualTo(new[] { "err.hook_disabled" }));
        }
    }
}
