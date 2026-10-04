using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Rules.EndConditions;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Combat
{
    /// <summary>The Combat and Rules services plugged into the turn pipeline through its contract interfaces.</summary>
    public class EngineIntegrationTests
    {
        private static EndConditionConfig Config()
        {
            return new EndConditionConfig(
                new VictoryRules(),
                new[] { new SiteInfo("site.capital", 1, new[] { "capital" }) },
                new SurrenderEntry[0],
                0,
                new TagCount[0]);
        }

        private static TurnServices Services()
        {
            return new TurnServices(
                new CombatResolver(new CombatResolverOptions(BattleTestKit.AlwaysHit)),
                SeasonTable.Disabled,
                new HealingStep(HealingConfig.Neutral),
                new EndConditionEvaluator(Config()));
        }

        private static GameState Siege(out int[] attackerIds)
        {
            GameState s = New();
            attackerIds = new int[3];
            s = Unit(s, 0, UnitRole.Line, 4, 3, out attackerIds[0], level: 5);
            s = Unit(s, 0, UnitRole.Line, 4, 4, out attackerIds[1], level: 5);
            s = Unit(s, 0, UnitRole.Shock, 4, 5, out attackerIds[2], level: 5);
            s = Base(s, 1, 5, 4, out _, core: 1, stock: Rich, site: "site.capital");
            return s;
        }

        [Test]
        public void ACaptureRunsThroughTheTurnPipeline()
        {
            GameState s = Siege(out int[] ids);
            s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.From(ids), new TileCoord(5, 4))));
            List<GameEvent> events = new List<GameEvent>();

            GameState after = EndAll(s, Services(), events);

            var captured = after.BaseTable.Single();
            Assert.That(captured.Owner, Is.EqualTo(0));
            Assert.That(captured.SiteId, Is.EqualTo("site.capital"));
            Assert.That(events.OfType<SiteTaken>().Single(), Is.EqualTo(new SiteTaken("site.capital", 1, 0, "capture")));
            Assert.That(events.OfType<MatchWon>().Single(), Is.EqualTo(new MatchWon(0, "last_standing")));
            Assert.That(events.OfType<UnitDestroyed>().Select(e => e.Unit).Distinct().Count(), Is.EqualTo(events.OfType<UnitDestroyed>().Count()), "no unit is reported destroyed twice");
        }

        [Test]
        public void ARaidOnAProtectedSiteRunsThroughThePipelineAsACapture()
        {
            GameState s = Siege(out int[] ids);
            s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.From(ids), new TileCoord(5, 4), AttackKind.Raid)));
            TurnServices services = new TurnServices(
                new CombatResolver(new CombatResolverOptions(BattleTestKit.AlwaysHit)),
                SeasonTable.Disabled,
                scenario: new ScenarioRules(new[] { "site.capital" }));
            List<GameEvent> events = new List<GameEvent>();

            GameState after = EndAll(s, services, events);

            Assert.That(after.BaseTable.Single().Owner, Is.EqualTo(0));
            Assert.That(events.OfType<SiteTaken>().Single().Via, Is.EqualTo("raid"));
        }

        [Test]
        public void SeasonsFlowThroughTheHookInterface()
        {
            SeasonTable table = new SeasonTable(
                true, new[] { new SeasonDefinition("season.a", 150, 100, 90) }, new[] { new SeasonRange(0, 5, "season.a") });
            IRuleHooks hooks = table;

            Assert.That(hooks.SeasonAt(2), Is.EqualTo("season.a"));
            Assert.That(hooks.MoveCostPct(2, MoveClass.Land), Is.EqualTo(150));
            Assert.That(hooks.FoodOutputPct(2), Is.EqualTo(90));
            Assert.That(hooks.SeasonAt(9), Is.EqualTo(NeutralRuleHooks.NeutralSeason));
        }
    }
}
