using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Rules.EndConditions;
using Conquest.Tests.Combat;

namespace Conquest.Tests.Rules
{
    internal static class EndKit
    {
        public static readonly TileCoord Spot = new TileCoord(1, 1);

        public static BaseView Base(int id, int owner, string? site = null)
        {
            return new BaseView(id, owner, Spot, site, 1, ResourceVector.Zero, ImmArray<BuildingView>.Empty);
        }

        public static UnitView Unit(int id, int owner, UnitRole role = UnitRole.Founder)
        {
            return new UnitView(id, owner, role, 1, 1, Spot, 0);
        }

        public static FakeView View(int turn, int slots, IEnumerable<BaseView>? bases = null, IEnumerable<UnitView>? units = null)
        {
            FakeView v = new FakeView { Turn = turn, SlotCount = slots };
            v.BaseList.AddRange(bases ?? new BaseView[0]);
            v.UnitList.AddRange(units ?? new UnitView[0]);
            return v;
        }

        public static EndConditionConfig Config(VictoryRules? victory = null, IEnumerable<SiteInfo>? sites = null, IEnumerable<SurrenderEntry>? surrenders = null, int deadline = 0, IEnumerable<TagCount>? tagCounts = null)
        {
            return new EndConditionConfig(
                victory ?? new VictoryRules(scenarioConditions: true),
                (sites ?? new SiteInfo[0]).ToList(),
                (surrenders ?? new SurrenderEntry[0]).ToList(),
                deadline,
                (tagCounts ?? new TagCount[0]).ToList());
        }
    }

    public class EndConditionEvaluatorTests
    {
        private static EndCheckResult Run(EndConditionConfig cfg, FakeView v)
        {
            return new EndConditionEvaluator(cfg).Evaluate(v);
        }

        [Test]
        public void NeutralRuleEliminatesAFactionWithoutBaseOrFounderAtOnce()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) }, new[] { EndKit.Unit(1, 0, UnitRole.Line) });

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.EliminatedSlots, Is.EqualTo(ImmArray<int>.Of(1)));
            Assert.That(r.Events.OfType<FactionEliminated>().Single(), Is.EqualTo(new FactionEliminated(1, "no_base_no_founder", 0)));
            Assert.That(r.MatchEnded, Is.True);
            Assert.That(r.WinnerSlot, Is.EqualTo(0));
            Assert.That(r.Events.OfType<MatchWon>().Single(), Is.EqualTo(new MatchWon(0, "last_standing")));
        }

        [Test]
        public void AFounderWithoutABaseKeepsTheFactionAliveUntilTheHomelessLimit()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) }, new[] { EndKit.Unit(1, 1, UnitRole.Founder) });

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.MatchEnded, Is.False);
            Assert.That(r.EliminatedSlots.Count, Is.EqualTo(0));
            Assert.That(r.ExtUpdates, Does.Contain(new ExtUpdate("homeless_turns.f2", 1)));
        }

        [Test]
        public void TheHomelessLimitFiresOnTheFifteenthConsecutiveCheck()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) }, new[] { EndKit.Unit(1, 1, UnitRole.Founder) });
            v.Ext["homeless_turns.f2"] = 14;

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.Events.OfType<FactionEliminated>().Single(), Is.EqualTo(new FactionEliminated(1, "homeless_limit", 15)));
            Assert.That(r.MatchEnded, Is.True);
        }

        [Test]
        public void HoldingABaseResetsTheHomelessCounter()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0), EndKit.Base(2, 1) });
            v.Ext["homeless_turns.f2"] = 9;
            v.Ext["no_base_turns.f2"] = 9;

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.ExtUpdates, Does.Contain(new ExtUpdate("homeless_turns.f2", 0)));
            Assert.That(r.ExtUpdates, Does.Contain(new ExtUpdate("no_base_turns.f2", 0)));
            Assert.That(r.MatchEnded, Is.False);
        }

        [Test]
        public void GraceCountsConsecutiveChecksWithNeitherBaseNorFounder()
        {
            VictoryRules rules = new VictoryRules(homelessTurnsLimit: null, graceTurns: 3);
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) });
            v.Ext["no_base_turns.f2"] = 1;

            EndCheckResult second = Run(EndKit.Config(rules), v);
            Assert.That(second.ExtUpdates, Does.Contain(new ExtUpdate("no_base_turns.f2", 2)));
            Assert.That(second.MatchEnded, Is.False);

            v.Ext["no_base_turns.f2"] = 2;
            EndCheckResult third = Run(EndKit.Config(rules), v);
            Assert.That(third.Events.OfType<FactionEliminated>().Single(), Is.EqualTo(new FactionEliminated(1, "no_base_no_founder", 3)));
        }

        [Test]
        public void AFounderResetsTheGraceCounterButNotTheHomelessCounter()
        {
            VictoryRules rules = new VictoryRules(homelessTurnsLimit: 15, graceTurns: 15);
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) }, new[] { EndKit.Unit(1, 1, UnitRole.Founder) });
            v.Ext["no_base_turns.f2"] = 7;
            v.Ext["homeless_turns.f2"] = 7;

            EndCheckResult r = Run(EndKit.Config(rules), v);

            Assert.That(r.ExtUpdates, Does.Contain(new ExtUpdate("no_base_turns.f2", 0)));
            Assert.That(r.ExtUpdates, Does.Contain(new ExtUpdate("homeless_turns.f2", 8)));
        }

        [Test]
        public void NobodyIsEliminatedBeforeTheFifteenthCheckUnderTheScenarioRules()
        {
            VictoryRules rules = new VictoryRules(homelessTurnsLimit: 15, graceTurns: 15);
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) });
            v.Ext["homeless_turns.f2"] = 13;
            v.Ext["no_base_turns.f2"] = 13;

            Assert.That(Run(EndKit.Config(rules), v).MatchEnded, Is.False);
        }

        [Test]
        public void WhenBothRulesFireTogetherTheHomelessLimitWins()
        {
            VictoryRules rules = new VictoryRules(homelessTurnsLimit: 15, graceTurns: 15);
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) });
            v.Ext["homeless_turns.f2"] = 14;
            v.Ext["no_base_turns.f2"] = 14;

            EndCheckResult r = Run(EndKit.Config(rules), v);

            Assert.That(r.Events.OfType<FactionEliminated>().Single(), Is.EqualTo(new FactionEliminated(1, "homeless_limit", 15)));
        }

        [Test]
        public void ASlotAlreadyOutIsIgnoredAndTheLastOneStandingWins()
        {
            FakeView v = EndKit.View(5, 3, new[] { EndKit.Base(1, 0), EndKit.Base(2, 2) });
            v.Eliminated.Add(1);
            v.Eliminated.Add(2);

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.MatchEnded, Is.True);
            Assert.That(r.WinnerSlot, Is.EqualTo(0));
        }

        [Test]
        public void ASingleSlotGameNeverEndsByLastStanding()
        {
            Assert.That(Run(EndKit.Config(), EndKit.View(5, 1, new[] { EndKit.Base(1, 0) })).MatchEnded, Is.False);
        }

        [Test]
        public void EveryoneOutAtOnceIsADraw()
        {
            FakeView v = EndKit.View(5, 2);

            EndCheckResult r = Run(EndKit.Config(), v);

            Assert.That(r.MatchEnded, Is.True);
            Assert.That(r.WinnerSlot, Is.EqualTo(-1));
            Assert.That(r.Events.OfType<MatchDrawn>().Single().Reason, Is.EqualTo("all_out"));
            Assert.That(r.EliminatedSlots.Count, Is.EqualTo(2));
        }

        [Test]
        public void ASurrenderPredicateRemovesTheSlotAndNamesTheWinner()
        {
            Predicate when = new HoldsSite(0, "site.capital");
            EndConditionConfig cfg = EndKit.Config(
                new VictoryRules(), new[] { new SiteInfo("site.capital", 1, new[] { "capital" }) }, new[] { new SurrenderEntry(1, when) });
            FakeView v = EndKit.View(7, 2, new[] { EndKit.Base(1, 0, "site.capital"), EndKit.Base(2, 1) });

            EndCheckResult r = Run(cfg, v);

            Assert.That(r.Events.OfType<FactionSurrendered>().Single(), Is.EqualTo(new FactionSurrendered(1, 7)));
            Assert.That(r.EliminatedSlots, Is.EqualTo(ImmArray<int>.Of(1)));
            Assert.That(r.Events.OfType<MatchWon>().Single(), Is.EqualTo(new MatchWon(0, "surrender")));
            Assert.That(r.WinnerSlot, Is.EqualTo(0));
        }

        [Test]
        public void ASurrenderThatIsNotMetDoesNothing()
        {
            EndConditionConfig cfg = EndKit.Config(
                new VictoryRules(), new[] { new SiteInfo("site.capital", 1, new[] { "capital" }) }, new[] { new SurrenderEntry(1, new HoldsSite(0, "site.capital")) });
            FakeView v = EndKit.View(7, 2, new[] { EndKit.Base(1, 1, "site.capital"), EndKit.Base(2, 0) });

            Assert.That(Run(cfg, v).MatchEnded, Is.False);
        }

        [Test]
        public void ASlotEliminatedThisTurnIsNotAlsoAskedToSurrender()
        {
            EndConditionConfig cfg = EndKit.Config(
                new VictoryRules(), new SiteInfo[0], new[] { new SurrenderEntry(1, new TurnAtLeast(0)) });
            FakeView v = EndKit.View(7, 2, new[] { EndKit.Base(1, 0) });

            EndCheckResult r = Run(cfg, v);

            Assert.That(r.Events.OfType<FactionSurrendered>(), Is.Empty);
            Assert.That(r.Events.OfType<FactionEliminated>().Count(), Is.EqualTo(1));
            Assert.That(r.Events.OfType<MatchWon>().Single().Reason, Is.EqualTo("last_standing"));
        }

        [Test]
        public void TheDeadlineDrawsOnTheLastTurn()
        {
            VictoryRules rules = new VictoryRules(deadlineResult: DeadlineResult.Draw);
            EndConditionConfig cfg = EndKit.Config(rules, deadline: 89);
            Func<int, FakeView> at = turn => EndKit.View(turn, 2, new[] { EndKit.Base(1, 0), EndKit.Base(2, 1) });

            Assert.That(Run(cfg, at(87)).MatchEnded, Is.False);
            EndCheckResult last = Run(cfg, at(88));
            Assert.That(last.MatchEnded, Is.True);
            Assert.That(last.WinnerSlot, Is.EqualTo(-1));
            Assert.That(last.Events.OfType<MatchDrawn>().Single().Reason, Is.EqualTo("deadline"));
        }

        [Test]
        public void NoDeadlineResultMeansNoDeadline()
        {
            EndConditionConfig cfg = EndKit.Config(new VictoryRules(), deadline: 5);
            Assert.That(Run(cfg, EndKit.View(99, 2, new[] { EndKit.Base(1, 0), EndKit.Base(2, 1) })).MatchEnded, Is.False);
        }

        [Test]
        public void UnchangedCountersProduceNoExtUpdates()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0), EndKit.Base(2, 1) });
            Assert.That(Run(EndKit.Config(), v).ExtUpdates.Count, Is.EqualTo(0));
        }

        [Test]
        public void ARunIsAPureFunctionOfTheView()
        {
            FakeView v = EndKit.View(5, 2, new[] { EndKit.Base(1, 0) }, new[] { EndKit.Unit(1, 1) });
            v.Ext["homeless_turns.f2"] = 3;
            EndConditionEvaluator e = new EndConditionEvaluator(EndKit.Config());

            EndCheckResult a = e.Evaluate(v);
            EndCheckResult b = e.Evaluate(v);

            Assert.That(a.ExtUpdates, Is.EqualTo(b.ExtUpdates));
            Assert.That(a.Events.Count, Is.EqualTo(b.Events.Count));
            Assert.That(v.Ext["homeless_turns.f2"], Is.EqualTo(3));
        }

        [Test]
        public void TheFortressRuleFromTheScenarioPlaysOutAsSpecified()
        {
            List<SiteInfo> sites = new List<SiteInfo> { new SiteInfo("site.capital", 1, new[] { "capital" }) };
            for (int i = 1; i <= 6; i++)
            {
                sites.Add(new SiteInfo("site.fortress_" + i, 1, new[] { "fortress", "garrison_town" }));
            }

            sites.Add(new SiteInfo("site.zone_1", 1, new[] { "defence_zone", "garrison_town" }));
            sites.Add(new SiteInfo("site.zone_2", 1, new[] { "defence_zone", "garrison_town" }));
            for (int i = 1; i <= 11; i++)
            {
                sites.Add(new SiteInfo("site.town_" + i.ToString("00"), 1, new[] { "garrison_town" }));
            }

            Predicate surrender = new AnyOf(new Predicate[]
            {
                new HoldsSite(0, "site.capital"),
                new AllOf(new Predicate[]
                {
                    new HoldsSitesCount(0, "fortress", 3),
                    new InitialSitesHeldAtMostPct(1, 25, null),
                }),
            });
            EndConditionConfig cfg = EndKit.Config(
                new VictoryRules(), sites, new[] { new SurrenderEntry(1, surrender) }, tagCounts: new[] { new TagCount("fortress", 6) });

            Func<int, int, int, FakeView> scene = (playerFortresses, aiOthers, aiNewBases) =>
            {
                List<BaseView> bases = new List<BaseView>();
                int id = 1;
                for (int i = 1; i <= 6; i++)
                {
                    bases.Add(EndKit.Base(id++, i <= playerFortresses ? 0 : 1, "site.fortress_" + i));
                }

                List<SiteInfo> others = sites.Where(x => !x.Tags.Contains("fortress")).ToList();
                for (int k = 0; k < others.Count; k++)
                {
                    bases.Add(EndKit.Base(id++, k < aiOthers ? 1 : 0, others[k].Id));
                }

                for (int i = 0; i < aiNewBases; i++)
                {
                    bases.Add(EndKit.Base(id++, 1));
                }

                return EndKit.View(20, 2, bases);
            };

            PredicateEvaluator eval = new PredicateEvaluator(cfg);
            Assert.That(cfg.InitialSiteCount(1, null), Is.EqualTo(20));
            // 3 fortresses taken, the AI still holds 3 + 3 = 6 of its 20 starting positions: no surrender.
            Assert.That(eval.Evaluate(surrender, scene(3, 3, 0)), Is.False);
            // It holds 3 + 2 = 5, however many new bases it founded: surrender.
            Assert.That(eval.Evaluate(surrender, scene(3, 2, 10)), Is.True);
            // Only 2 fortresses taken: never enough, even when the AI holds almost nothing else.
            Assert.That(eval.Evaluate(surrender, scene(2, 1, 0)), Is.False);
            // Losing the capital is enough on its own.
            Assert.That(eval.Evaluate(surrender, scene(0, 0, 0)), Is.True);
        }
    }

    public class PredicateTests
    {
        private static EndConditionConfig Cfg()
        {
            return EndKit.Config(
                sites: new[]
                {
                    new SiteInfo("site.a", 1, new[] { "x", "y" }),
                    new SiteInfo("site.b", 1, new[] { "x" }),
                    new SiteInfo("site.c", 1, new string[0]),
                    new SiteInfo("site.d", 0, new[] { "x" }),
                });
        }

        private static FakeView View()
        {
            return EndKit.View(
                10, 2,
                new[] { EndKit.Base(1, 0, "site.a"), EndKit.Base(2, 1, "site.b"), EndKit.Base(3, 1, "site.c"), EndKit.Base(4, 1) },
                new[] { EndKit.Unit(1, 0, UnitRole.Line), EndKit.Unit(2, 1, UnitRole.Founder) });
        }

        private static bool Eval(Predicate p)
        {
            return new PredicateEvaluator(Cfg()).Evaluate(p, View());
        }

        [Test]
        public void HoldsSiteChecksTheOwnerOfThatSite()
        {
            Assert.That(Eval(new HoldsSite(0, "site.a")), Is.True);
            Assert.That(Eval(new HoldsSite(1, "site.a")), Is.False);
            Assert.That(Eval(new HoldsSite(1, "site.zzz")), Is.False);
        }

        [Test]
        public void HoldsSitesCountCountsOwnedSitesWithTheTag()
        {
            Assert.That(Eval(new HoldsSitesCount(1, "x", 1)), Is.True);
            Assert.That(Eval(new HoldsSitesCount(1, "x", 2)), Is.False);
            Assert.That(Eval(new HoldsSitesCount(0, "x", 1)), Is.True);
            Assert.That(Eval(new HoldsSitesCount(1, "y", 1)), Is.False);
        }

        [Test]
        public void InitialSitesFixedAtLoadAndTagsAnyNarrowTheSet()
        {
            EndConditionConfig cfg = Cfg();
            Assert.That(cfg.InitialSiteCount(1, null), Is.EqualTo(3));
            Assert.That(cfg.InitialSiteCount(1, new[] { "y" }), Is.EqualTo(1));
            Assert.That(cfg.InitialSites(1, null), Is.EqualTo(new[] { "site.a", "site.b", "site.c" }));
        }

        [Test]
        public void BoundariesOfTheInitialSitePercent()
        {
            EndConditionConfig cfg = Cfg();
            FakeView v = View();
            PredicateEvaluator e = new PredicateEvaluator(cfg);

            // slot 1 holds site.b and site.c = 2 of 3 initial sites (200 vs pct * 3)
            Assert.That(e.Evaluate(new InitialSitesHeldAtMostPct(1, 66, null), v), Is.False);
            Assert.That(e.Evaluate(new InitialSitesHeldAtMostPct(1, 67, null), v), Is.True);
        }

        [Test]
        public void BaseCountSupportsBothDirections()
        {
            Assert.That(Eval(new BaseCount(1, atLeast: 3, atMost: null)), Is.True);
            Assert.That(Eval(new BaseCount(1, atLeast: 4, atMost: null)), Is.False);
            Assert.That(Eval(new BaseCount(1, atLeast: null, atMost: 3)), Is.True);
            Assert.That(Eval(new BaseCount(1, atLeast: null, atMost: 2)), Is.False);
        }

        [Test]
        public void TurnHasBaseAndUnitRolePredicates()
        {
            Assert.That(Eval(new TurnAtLeast(10)), Is.True);
            Assert.That(Eval(new TurnAtLeast(11)), Is.False);
            Assert.That(Eval(new HasBase(0)), Is.True);
            Assert.That(Eval(new HasBase(5)), Is.False);
            Assert.That(Eval(new HasUnitRole(0, UnitRole.Line)), Is.True);
            Assert.That(Eval(new HasUnitRole(1, UnitRole.Line)), Is.False);
        }

        [Test]
        public void LogicCombinatorsAreFullyEvaluated()
        {
            Predicate yes = new TurnAtLeast(1);
            Predicate no = new TurnAtLeast(99);

            Assert.That(Eval(new AllOf(new[] { yes, yes })), Is.True);
            Assert.That(Eval(new AllOf(new[] { yes, no })), Is.False);
            Assert.That(Eval(new AnyOf(new[] { no, yes })), Is.True);
            Assert.That(Eval(new AnyOf(new[] { no, no })), Is.False);
            Assert.That(Eval(new Not(no)), Is.True);
            Assert.That(Eval(new AllOf(new Predicate[0])), Is.True);
            Assert.That(Eval(new AnyOf(new Predicate[0])), Is.False);
        }

        [Test]
        public void EvaluationLeavesTheViewUntouched()
        {
            FakeView v = View();
            int bases = v.BaseList.Count;
            new PredicateEvaluator(Cfg()).Evaluate(new HoldsSite(0, "site.a"), v);
            Assert.That(v.BaseList.Count, Is.EqualTo(bases));
        }
    }

    public class EndConditionValidationTests
    {
        private static IEnumerable<string> Codes(EndConditionConfig cfg, int slots = 2)
        {
            return cfg.Validate(slots).Select(i => i.Code);
        }

        private static SiteInfo[] Sites()
        {
            return new[] { new SiteInfo("site.a", 1, new[] { "x" }), new SiteInfo("site.b", 1, new[] { "x" }) };
        }

        [Test]
        public void ACleanScenarioHasNoIssues()
        {
            EndConditionConfig cfg = EndKit.Config(
                null, Sites(), new[] { new SurrenderEntry(1, new HoldsSite(0, "site.a")) }, tagCounts: new[] { new TagCount("x", 2) });
            Assert.That(cfg.Validate(2), Is.Empty);
        }

        [Test]
        public void UnknownSlotsSitesAndTagsAreLoadErrors()
        {
            Assert.That(Codes(EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(1, new HoldsSite(7, "site.a")) })), Does.Contain("err.predicate_slot"));
            Assert.That(Codes(EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(1, new HoldsSite(0, "site.nope")) })), Does.Contain("err.predicate_site"));
            Assert.That(Codes(EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(1, new HoldsSitesCount(0, "nope", 1)) })), Does.Contain("err.predicate_tag"));
            Assert.That(Codes(EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(9, new TurnAtLeast(1)) })), Does.Contain("err.surrender_slot"));
        }

        [Test]
        public void ASlotWithNoInitialSitesCannotBeNamedByThePercentPredicate()
        {
            EndConditionConfig cfg = EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(1, new InitialSitesHeldAtMostPct(0, 25, null)) });
            Assert.That(Codes(cfg), Does.Contain("err.initial_sites_empty"));
        }

        [Test]
        public void ThePercentMustBeBetweenZeroAndHundred()
        {
            EndConditionConfig cfg = EndKit.Config(sites: Sites(), surrenders: new[] { new SurrenderEntry(1, new InitialSitesHeldAtMostPct(1, 101, null)) });
            Assert.That(Codes(cfg), Does.Contain("err.predicate_range"));
        }

        [Test]
        public void DepthAndNodeLimitsAreEnforced()
        {
            Predicate deep = new TurnAtLeast(1);
            for (int i = 0; i < 4; i++)
            {
                deep = new Not(deep);
            }

            Predicate wide = new AnyOf(Enumerable.Range(0, 40).Select(i => (Predicate)new TurnAtLeast(i)).ToList());

            Assert.That(Codes(EndKit.Config(surrenders: new[] { new SurrenderEntry(1, deep) })), Does.Contain("err.predicate_depth"));
            Assert.That(Codes(EndKit.Config(surrenders: new[] { new SurrenderEntry(1, wide) })), Does.Contain("err.predicate_nodes"));
        }

        [Test]
        public void ADepthOfFourIsAllowed()
        {
            Predicate p = new Not(new Not(new Not(new TurnAtLeast(1))));
            Assert.That(Codes(EndKit.Config(surrenders: new[] { new SurrenderEntry(1, p) })), Is.Empty);
        }

        [Test]
        public void TagCountsMustMatchTheSitesExactly()
        {
            Assert.That(Codes(EndKit.Config(sites: Sites(), tagCounts: new[] { new TagCount("x", 3) })), Does.Contain("err.tag_count"));
            Assert.That(Codes(EndKit.Config(sites: Sites(), tagCounts: new[] { new TagCount("x", 2) })), Is.Empty);
        }

        [Test]
        public void VictoryRulesAreChecked()
        {
            Assert.That(Codes(EndKit.Config(new VictoryRules(graceTurns: -1))), Does.Contain("err.victory_range"));
            Assert.That(Codes(EndKit.Config(new VictoryRules(homelessTurnsLimit: 0))), Does.Contain("err.victory_range"));
            Assert.That(Codes(EndKit.Config(new VictoryRules(), deadline: 5)), Does.Contain("err.deadline_result"));
            Assert.That(Codes(EndKit.Config(new VictoryRules(deadlineResult: DeadlineResult.Draw), deadline: 5)), Is.Empty);
        }

        [Test]
        public void SurrenderEntriesRequireTheScenarioConditionsSwitch()
        {
            EndConditionConfig cfg = EndKit.Config(
                new VictoryRules(scenarioConditions: false), surrenders: new[] { new SurrenderEntry(1, new TurnAtLeast(1)) });
            Assert.That(Codes(cfg), Does.Contain("err.hook_disabled"));
        }
    }
}
