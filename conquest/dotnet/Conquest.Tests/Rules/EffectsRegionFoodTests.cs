using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Tests.Rules
{
    public class TimedEffectTests
    {
        private static TimedEffectSet Linked(bool enabled = true)
        {
            return new TimedEffectSet(
                enabled,
                new[]
                {
                    new TimedEffectEntry("te.link_cut", 84, null, 1, announce: true, patronLinkCut: true, inFlight: InFlightPolicy.CancelRefund, panicPermille: 100, scope: PanicScope.DefendingBase),
                });
        }

        [TestCase(83, false)]
        [TestCase(84, true)]
        [TestCase(500, true)]
        public void OpenEndedEffectsStayActive(int turn, bool active)
        {
            Assert.That(Linked().PatronLinkCut(1, turn), Is.EqualTo(active));
        }

        [Test]
        public void BoundedEffectsEndOnTheirLastTurn()
        {
            TimedEffectSet set = new TimedEffectSet(true, new[] { new TimedEffectEntry("te.x", 5, 7, 0, patronLinkCut: true) });
            Assert.That(new[] { 4, 5, 7, 8 }.Select(t => set.PatronLinkCut(0, t)), Is.EqualTo(new[] { false, true, true, false }));
        }

        [Test]
        public void OnlyTheTargetSlotIsAffected()
        {
            Assert.That(Linked().PatronLinkCut(0, 90), Is.False);
            Assert.That(Linked().PanicModifier(0, 90, true), Is.EqualTo(0));
        }

        [Test]
        public void AnUnusedHookIsInertEvenWhenEntriesExist()
        {
            Assert.That(Linked(enabled: false).PatronLinkCut(1, 90), Is.False);
            Assert.That(Linked(enabled: false).PanicModifier(1, 90, true), Is.EqualTo(0));
            Assert.That(Linked(enabled: false).Announcements(84), Is.Empty);
        }

        [Test]
        public void PanicScopeSeparatesDefendingBaseFromAllBattles()
        {
            TimedEffectSet defending = Linked();
            TimedEffectSet everywhere = new TimedEffectSet(true, new[] { new TimedEffectEntry("te.all", 0, null, 1, panicPermille: 50, scope: PanicScope.AllBattles) });

            Assert.That(defending.PanicModifier(1, 90, true), Is.EqualTo(100));
            Assert.That(defending.PanicModifier(1, 90, false), Is.EqualTo(0));
            Assert.That(everywhere.PanicModifier(1, 90, false), Is.EqualTo(50));
            Assert.That(everywhere.PanicModifier(1, 90, true), Is.EqualTo(50));
        }

        [Test]
        public void ActiveModifiersAddUp()
        {
            TimedEffectSet two = new TimedEffectSet(true, new[]
            {
                new TimedEffectEntry("te.a", 0, null, 1, panicPermille: 100),
                new TimedEffectEntry("te.b", 0, null, 1, panicPermille: -30),
            });
            Assert.That(two.PanicModifier(1, 3, true), Is.EqualTo(70));
        }

        [Test]
        public void PatronOrdersAreRefusedWhileTheLinkIsCut()
        {
            Assert.That(Linked().OrderGate(1, 84, isPatronOrder: true), Is.EqualTo("err.patron_link_cut"));
            Assert.That(Linked().OrderGate(1, 84, isPatronOrder: false), Is.Null);
            Assert.That(Linked().OrderGate(1, 83, isPatronOrder: true), Is.Null);
            Assert.That(Linked().OrderGate(0, 99, isPatronOrder: true), Is.Null);
        }

        [Test]
        public void InFlightPolicyIsReportedOnlyWhileTheLinkIsCut()
        {
            Assert.That(Linked().InFlight(1, 90), Is.EqualTo(InFlightPolicy.CancelRefund));
            Assert.That(Linked().InFlight(1, 10), Is.Null);
        }

        [Test]
        public void PatronArrivalsAreSuppressedWhileCut()
        {
            Assert.That(Linked().ArrivalSuppressed(1, 90, viaPatron: true), Is.True);
            Assert.That(Linked().ArrivalSuppressed(1, 90, viaPatron: false), Is.False);
            Assert.That(Linked().ArrivalSuppressed(1, 50, viaPatron: true), Is.False);
        }

        [Test]
        public void AnnouncementsAreRaisedOnTheStartTurnOnlyAndOnlyWhenAsked()
        {
            Assert.That(Linked().Announcements(84).Select(e => (e.EffectId, e.TargetSlot)), Is.EqualTo(new[] { ("te.link_cut", 1) }));
            Assert.That(Linked().Announcements(85), Is.Empty);
            TimedEffectSet quiet = new TimedEffectSet(true, new[] { new TimedEffectEntry("te.q", 3, null, 1) });
            Assert.That(quiet.Announcements(3), Is.Empty);
        }

        [Test]
        public void ValidateChecksBoundsSlotsAndRanges()
        {
            Assert.That(Linked().Validate(2), Is.Empty);
            Assert.That(new TimedEffectSet(true, new[] { new TimedEffectEntry("te.a", 0, null, 1, panicPermille: 301) }).Validate(2).Select(i => i.Code), Does.Contain("err.timed_bounds"));
            Assert.That(new TimedEffectSet(true, new[] { new TimedEffectEntry("te.a", 0, null, 5) }).Validate(2).Select(i => i.Code), Does.Contain("err.timed_slot"));
            Assert.That(new TimedEffectSet(true, new[] { new TimedEffectEntry("te.a", 9, 3, 1) }).Validate(2).Select(i => i.Code), Does.Contain("err.timed_range"));
            Assert.That(new TimedEffectSet(true, new[] { new TimedEffectEntry("te.a", 0, null, 1), new TimedEffectEntry("te.a", 0, null, 1) }).Validate(2).Select(i => i.Code), Does.Contain("err.timed_duplicate"));
            Assert.That(new TimedEffectSet(false, new[] { new TimedEffectEntry("te.a", 0, null, 1) }).Validate(2).Select(i => i.Code), Is.EqualTo(new[] { "err.hook_disabled" }));
        }
    }

    public class RegionRulesTests
    {
        private static readonly RegionRulesConfig Config = new RegionRulesConfig(
            enabled: true, capMinLevel: 3, capMaxPerRegion: 1, cappedSlots: new[] { 0, 1 }, bonusPct: 5,
            bonusAppliesTo: new[] { BuildingRole.Food, BuildingRole.Converter });

        [Test]
        public void RegionMapLooksTilesUp()
        {
            RegionMap map = new RegionMap(3, 2, new[] { "region.r01", "region.r02" }, new[] { 0, 0, 1, -1, 1, 1 });

            Assert.That(map.RegionOf(0, 0), Is.EqualTo("region.r01"));
            Assert.That(map.RegionOf(2, 0), Is.EqualTo("region.r02"));
            Assert.That(map.RegionOf(0, 1), Is.Null);
            Assert.That(map.RegionOf(9, 9), Is.Null);
        }

        [Test]
        public void ASecondQualifyingCoreInTheSameRegionIsRefused()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 3) };

            RegionCheck check = RegionRules.CheckUpgrade(Config, 0, baseId: 2, "region.r01", targetLevel: 3, owned, new PendingUpgrade[0]);

            Assert.That(check.Allowed, Is.False);
            Assert.That(check.ErrorCode, Is.EqualTo("err.region_cap"));
            Assert.That(check.Region, Is.EqualTo("region.r01"));
        }

        [Test]
        public void AnotherRegionOrALowerLevelIsFine()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 3) };

            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, "region.r02", 3, owned, new PendingUpgrade[0]).Allowed, Is.True);
            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, "region.r01", 2, owned, new PendingUpgrade[0]).Allowed, Is.True);
        }

        [Test]
        public void UpgradingTheAlreadyQualifyingCoreItselfIsAllowed()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 3) };
            Assert.That(RegionRules.CheckUpgrade(Config, 0, 1, "region.r01", 4, owned, new PendingUpgrade[0]).Allowed, Is.True);
        }

        [Test]
        public void APendingUpgradeCountsAndCancellingFreesTheSlot()
        {
            var pending = new[] { new PendingUpgrade(1, 0, "region.r01", 3) };

            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, "region.r01", 3, new CoreInfo[0], pending).Allowed, Is.False);
            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, "region.r01", 3, new CoreInfo[0], new PendingUpgrade[0]).Allowed, Is.True);
        }

        [Test]
        public void OtherFactionsCoresDoNotCountAgainstMe()
        {
            var owned = new[] { new CoreInfo(1, 1, "region.r01", 4) };
            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, "region.r01", 3, owned, new PendingUpgrade[0]).Allowed, Is.True);
        }

        [Test]
        public void UnregionedBasesUnlistedSlotsAndDisabledRulesAreNeverCapped()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 3), new CoreInfo(3, 0, null, 3) };

            Assert.That(RegionRules.CheckUpgrade(Config, 0, 2, null, 3, owned, new PendingUpgrade[0]).Allowed, Is.True);
            RegionRulesConfig onlyF1 = new RegionRulesConfig(true, 3, 1, new[] { 0 }, 5, new BuildingRole[0]);
            Assert.That(RegionRules.CheckUpgrade(onlyF1, 1, 2, "region.r01", 3, owned, new PendingUpgrade[0]).Allowed, Is.True);
            Assert.That(RegionRules.CheckUpgrade(RegionRulesConfig.Disabled, 0, 2, "region.r01", 3, owned, new PendingUpgrade[0]).Allowed, Is.True);
        }

        [Test]
        public void OwnershipAboveTheCapIsNeverRevokedButBlocksFurtherUpgrades()
        {
            var overCap = new[] { new CoreInfo(1, 0, "region.r01", 3), new CoreInfo(2, 0, "region.r01", 4) };
            Assert.That(RegionRules.CheckUpgrade(Config, 0, 5, "region.r01", 3, overCap, new PendingUpgrade[0]).Allowed, Is.False);
        }

        [Test]
        public void TheBonusAppliesWhereTheFactionHoldsAQualifyingCoreAndToListedBuildingsOnly()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 3) };

            Assert.That(RegionRules.BonusPct(Config, 0, "region.r01", owned, BuildingRole.Food), Is.EqualTo(5));
            Assert.That(RegionRules.BonusPct(Config, 0, "region.r01", owned, BuildingRole.Port), Is.EqualTo(0));
            Assert.That(RegionRules.BonusPct(Config, 0, "region.r02", owned, BuildingRole.Food), Is.EqualTo(0));
            Assert.That(RegionRules.BonusPct(Config, 1, "region.r01", owned, BuildingRole.Food), Is.EqualTo(0));
            Assert.That(RegionRules.BonusPct(Config, 0, null, owned, BuildingRole.Food), Is.EqualTo(0));
            Assert.That(RegionRules.BonusPct(RegionRulesConfig.Disabled, 0, "region.r01", owned, BuildingRole.Food), Is.EqualTo(0));
        }

        [Test]
        public void ALowLevelCoreGivesNoBonus()
        {
            var owned = new[] { new CoreInfo(1, 0, "region.r01", 2) };
            Assert.That(RegionRules.BonusPct(Config, 0, "region.r01", owned, BuildingRole.Food), Is.EqualTo(0));
        }
    }

    public class FoodRulesTests
    {
        private static readonly FoodConfig Cfg = FoodConfig.Default;

        [Test]
        public void FedPeopleEatOneFoodPerStartedHundred()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, baseId: 1, slot: 0, pop: 250, stock: 10, produced: 0);

            Assert.That(o.NewFood, Is.EqualTo(7));
            Assert.That(o.NewPop, Is.EqualTo(250));
            Assert.That(o.Shortage, Is.False);
            Assert.That(o.Events, Is.Empty);
        }

        [Test]
        public void ProductionCountsTowardsTheMeal()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 1, 0, 250, 1, 5);
            Assert.That(o.NewFood, Is.EqualTo(3));
            Assert.That(o.Shortage, Is.False);
        }

        [Test]
        public void ARunningLowStockWarnsBeforeAnyoneIsLost()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 4, 1, 250, 4, 0);

            Assert.That(o.NewFood, Is.EqualTo(1));
            Assert.That(o.PopLost, Is.EqualTo(0));
            Assert.That(o.Events.Single(), Is.EqualTo(new FoodShortage(4, 1)));
        }

        [Test]
        public void AShortageEmptiesTheStoreAndCostsFivePercentOfPeople()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 4, 1, 250, 2, 0);

            Assert.That(o.Shortage, Is.True);
            Assert.That(o.NewFood, Is.EqualTo(0));
            Assert.That(o.PopLost, Is.EqualTo(12));
            Assert.That(o.NewPop, Is.EqualTo(238));
            Assert.That(o.Events, Does.Contain(new FoodShortage(4, 1)));
            Assert.That(o.Events, Does.Contain(new PopLost(4, 12, "shortage", 1)));
        }

        [Test]
        public void AShortageAlwaysCostsAtLeastOnePersonButNeverMoreThanThereAre()
        {
            Assert.That(FoodRules.Resolve(Cfg, 1, 0, 10, 0, 0).PopLost, Is.EqualTo(1));
            FoodOutcome last = FoodRules.Resolve(new FoodConfig(1, 5), 1, 0, 1, 0, 0);
            Assert.That(last.PopLost, Is.EqualTo(1));
            Assert.That(last.NewPop, Is.EqualTo(0));
        }

        [Test]
        public void NoPeopleNeedNoFood()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 1, 0, 0, 0, 0);
            Assert.That(o.Shortage, Is.False);
            Assert.That(o.Events, Is.Empty);
            Assert.That(o.NewFood, Is.EqualTo(0));
        }

        [Test]
        public void ProductionThatCoversTheNextMealGivesNoWarning()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 1, 0, 250, 3, 3);
            Assert.That(o.Events, Is.Empty);
        }

        [Test]
        public void EventsAreDeathNeutral()
        {
            FoodOutcome o = FoodRules.Resolve(Cfg, 1, 0, 250, 0, 0);
            Assert.That(o.Events.OfType<PopLost>().Single().Cause, Is.EqualTo("shortage"));
        }

        [Test]
        public void MilitiaLossesCostFivePeoplePerStrengthPoint()
        {
            Assert.That(FoodRules.PopLossFromMilitia(3), Is.EqualTo(15));
            Assert.That(FoodRules.PopLossFromMilitia(0), Is.EqualTo(0));
        }
    }

    public class SiteCaptureTests
    {
        [Test]
        public void AWonCaptureChangesOwnerAndTellsBothSlots()
        {
            SiteCaptureResult r = SiteCapture.ResolveCapture("site.capital", ownerSlot: 1, takerSlot: 0, attackerWon: true, captureLegal: true);

            Assert.That(r.Fate, Is.EqualTo(SiteFate.Captured));
            Assert.That(r.Events.Single(), Is.EqualTo(new SiteTaken("site.capital", 1, 0, "capture")));
        }

        [Test]
        public void ALostOrIllegalCaptureChangesNothing()
        {
            Assert.That(SiteCapture.ResolveCapture("s", 1, 0, false, true).Fate, Is.EqualTo(SiteFate.Unchanged));
            Assert.That(SiteCapture.ResolveCapture("s", 1, 0, true, false).Fate, Is.EqualTo(SiteFate.Unchanged));
            Assert.That(SiteCapture.ResolveCapture("s", 1, 0, false, true).Events, Is.Empty);
        }

        [Test]
        public void ASiteWithoutAnIdIsCapturedSilently()
        {
            SiteCaptureResult r = SiteCapture.ResolveCapture(null, 1, 0, true, true);
            Assert.That(r.Fate, Is.EqualTo(SiteFate.Captured));
            Assert.That(r.Events, Is.Empty);
        }

        [Test]
        public void ARaidThatLeavesTheDefendersStandingChangesNothing()
        {
            Assert.That(SiteCapture.ResolveRaid("s", 1, 0, defendersBroken: false, raidCanDestroy: true, captureLegal: true).Fate, Is.EqualTo(SiteFate.Unchanged));
        }

        [Test]
        public void ABrokenRaidDestroysADestructibleSite()
        {
            SiteCaptureResult r = SiteCapture.ResolveRaid("s", 1, 0, true, true, true);
            Assert.That(r.Fate, Is.EqualTo(SiteFate.Destroyed));
            Assert.That(r.Events, Is.Empty);
        }

        [Test]
        public void ABrokenRaidOnAProtectedSiteBecomesACaptureViaRaid()
        {
            SiteCaptureResult r = SiteCapture.ResolveRaid("site.fortress_1", 1, 0, true, false, true);

            Assert.That(r.Fate, Is.EqualTo(SiteFate.Captured));
            Assert.That(r.Events.Single(), Is.EqualTo(new SiteTaken("site.fortress_1", 1, 0, "raid")));
        }

        [Test]
        public void AProtectedSiteThatCannotBeCapturedSurvivesAtLevelOne()
        {
            SiteCaptureResult r = SiteCapture.ResolveRaid("site.fortress_1", 1, 0, true, false, false);
            Assert.That(r.Fate, Is.EqualTo(SiteFate.SurvivesAtLevelOne));
            Assert.That(r.Events, Is.Empty);
        }

        [Test]
        public void ARetakenSiteNamesTheNewTakerAsTheTakerSlot()
        {
            SiteCaptureResult r = SiteCapture.ResolveRaid("s", ownerSlot: 0, raiderSlot: 1, true, false, true);
            SiteTaken e = (SiteTaken)r.Events.Single();
            Assert.That((e.From, e.TakerSlot), Is.EqualTo((0, 1)));
        }
    }

    public class TemplateKeyTests
    {
        [Test]
        public void SiteTakenPicksGainedForTheTakerAndLostForTheLoser()
        {
            GameEvent e = new SiteTaken("site.capital", 1, 0, "raid");
            Assert.That(TemplateKeys.For(e, 0), Is.EqualTo(new[] { "ev.site_taken.gained@f1", "ev.site_taken.gained" }));
            Assert.That(TemplateKeys.For(e, 1), Is.EqualTo(new[] { "ev.site_taken.lost@f2", "ev.site_taken.lost" }));
        }

        [Test]
        public void MatchWonPicksPlayerOrOpponentByWinnerSlot()
        {
            GameEvent e = new MatchWon(0, "surrender");
            Assert.That(TemplateKeys.For(e, 0)[1], Is.EqualTo("ev.match_won.player"));
            Assert.That(TemplateKeys.For(e, 1)[1], Is.EqualTo("ev.match_won.opponent"));
        }

        [Test]
        public void OtherEventsUseTheirOwnIdWithTheReceivingSlotOverrideFirst()
        {
            Assert.That(TemplateKeys.For(new MatchDrawn("deadline"), 1), Is.EqualTo(new[] { "ev.match_drawn@f2", "ev.match_drawn" }));
            Assert.That(TemplateKeys.For(new FactionEliminated(1, "homeless_limit", 15), 0)[1], Is.EqualTo("ev.faction_eliminated"));
        }

        [Test]
        public void SlotNamesCountFromOne()
        {
            Assert.That(TemplateKeys.SlotName(0), Is.EqualTo("f1"));
            Assert.That(TemplateKeys.SlotName(5), Is.EqualTo("f6"));
        }
    }
}
