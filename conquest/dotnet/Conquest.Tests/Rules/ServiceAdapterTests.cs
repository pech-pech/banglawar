using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Tests.Rules;

/// <summary>The static rule helpers behind their contract interfaces (food, site capture, template keys).</summary>
public class ServiceAdapterTests
{
    [Test]
    public void Food_need_and_outcome_match_the_static_rules_through_the_interface()
    {
        IFoodRules food = new FoodService();

        Assert.That(food.Need(0), Is.EqualTo(0));
        Assert.That(food.Need(100), Is.EqualTo(1));
        Assert.That(food.Need(101), Is.EqualTo(2));
        FoodOutcome fed = food.Resolve(3, 0, 200, 10, 0);
        FoodOutcome starving = food.Resolve(3, 0, 200, 0, 0);
        Assert.That((fed.NewFood, fed.NewPop, fed.Shortage), Is.EqualTo((8, 200, false)));
        Assert.That(starving.Shortage, Is.True);
        Assert.That(starving.NewPop, Is.LessThan(200));
        Assert.That(starving.Events.OfType<PopLost>().Single().Cause, Is.EqualTo("shortage"));
    }

    [Test]
    public void A_custom_food_config_changes_the_need()
    {
        IFoodRules food = new FoodService(new FoodConfig(50, 10));

        Assert.That(food.Need(100), Is.EqualTo(2));
        Assert.That(food.Resolve(1, 0, 100, 0, 0).PopLost, Is.EqualTo(10));
    }

    [Test]
    public void Site_capture_through_the_interface_gives_the_same_fates_and_events()
    {
        ISiteCapture capture = SiteCaptureService.Instance;

        SiteCaptureResult taken = capture.ResolveCapture("site.a", 1, 0, attackerWon: true, captureLegal: true);
        SiteCaptureResult raided = capture.ResolveRaid("site.a", 1, 0, defendersBroken: true, raidCanDestroy: false, captureLegal: true);
        SiteCaptureResult destroyed = capture.ResolveRaid("site.a", 1, 0, defendersBroken: true, raidCanDestroy: true, captureLegal: true);
        SiteCaptureResult illegal = capture.ResolveRaid("site.a", 1, 0, defendersBroken: true, raidCanDestroy: false, captureLegal: false);

        Assert.That(taken.Fate, Is.EqualTo(SiteFate.Captured));
        Assert.That(taken.Events.Single(), Is.EqualTo(new SiteTaken("site.a", 1, 0, SiteTaken.ViaCapture)));
        Assert.That(raided.Events.Single(), Is.EqualTo(new SiteTaken("site.a", 1, 0, SiteTaken.ViaRaid)));
        Assert.That(destroyed.Fate, Is.EqualTo(SiteFate.Destroyed));
        Assert.That(illegal.Fate, Is.EqualTo(SiteFate.SurvivesAtLevelOne));
    }

    [Test]
    public void Template_keys_through_the_interface_pick_the_side_keyed_text()
    {
        ITemplateKeys keys = TemplateKeyProvider.Instance;
        var taken = new SiteTaken("site.a", 1, 0, "raid");

        Assert.That(keys.SlotName(2), Is.EqualTo("f3"));
        Assert.That(keys.For(taken, 0), Is.EqualTo(new[] { "ev.site_taken.gained@f1", "ev.site_taken.gained" }));
        Assert.That(keys.For(taken, 1), Is.EqualTo(new[] { "ev.site_taken.lost@f2", "ev.site_taken.lost" }));
        Assert.That(keys.For(new MatchWon(0, "surrender"), 1)[1], Is.EqualTo("ev.match_won.opponent"));
        Assert.That(keys.For(new TurnEnded(4), 0)[1], Is.EqualTo("ev.turn_ended"));
    }

    [Test]
    public void The_scenario_rules_default_to_nothing_protected_and_no_kit()
    {
        IScenarioRules rules = ScenarioRules.Default;

        Assert.That(rules.RaidCanDestroy("any"), Is.True);
        Assert.That(rules.CaptureLegal(0, 1), Is.True);
        Assert.That(rules.StartKit(0), Is.Null);
    }

    [Test]
    public void The_empty_region_service_and_timed_set_do_nothing()
    {
        Assert.That(RegionService.None.Enabled, Is.False);
        Assert.That(RegionService.None.RegionOf(new TileCoord(1, 1)), Is.Null);
        Assert.That(TimedEffectSet.None.Enabled, Is.False);
        Assert.That(((ITimedEffects)TimedEffectSet.None).PanicModifier(0, 5, true), Is.EqualTo(0));
    }
}
