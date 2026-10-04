using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class EconomyTests
{
    private static Base Run(Base b, int turn = 5, IRuleHooks? hooks = null, List<GameEvent>? events = null)
    {
        GameState s = New(1);
        s = s with { Turn = turn, BaseTable = ImmArray<Base>.Of(b), NextBaseId = 2 };
        return EconomyStep.Run(s, hooks ?? NeutralRuleHooks.Instance, events ?? new List<GameEvent>()).BaseTable[0];
    }

    private static Base B(ResourceVector stock, int core = 4, params Building[] buildings) =>
        new Base(1, 0, new TileCoord(4, 4), null, core, 0, 0, stock, ImmArray<Building>.From(buildings));

    private static Building Bld(BuildingRole r, int level, int ready = 0, int pending = 0) =>
        new Building(r, level, new TileCoord(5, 4), ready, pending);

    [TestCase(1, 3)]
    [TestCase(2, 9)]
    [TestCase(3, 21)]
    [TestCase(4, 36)]
    public void Farms_produce_the_manual_amounts(int level, int output)
    {
        Base b = Run(B(new ResourceVector(0, 0, 0, 0, 0, 0), 4, Bld(BuildingRole.Food, level)));
        Assert.That(b.Stock.Food, Is.EqualTo(output));
    }

    [Test]
    public void Extractors_produce_by_level()
    {
        Base b = Run(B(ResourceVector.Zero, 4, Bld(BuildingRole.BasicExtractor, 3), Bld(BuildingRole.HardExtractor, 4), Bld(BuildingRole.CoinExtractor, 2)));
        Assert.That(b.Stock.Basic, Is.EqualTo(7));
        Assert.That(b.Stock.Hard, Is.EqualTo(12));
        Assert.That(b.Stock.Coin, Is.EqualTo(60));
    }

    [Test]
    public void Commerce_converts_when_it_can_and_idles_when_short()
    {
        Building c = Bld(BuildingRole.Converter, 2);
        Base ok = Run(B(new ResourceVector(5, 5, 0, 0, 5, 0), 4, c));
        Assert.That(ok.Stock.Wares, Is.EqualTo(3));
        Assert.That(ok.Stock.Basic, Is.EqualTo(2));
        Assert.That(ok.Stock.Hard, Is.EqualTo(2));
        Assert.That(ok.Stock.Food, Is.EqualTo(2));
        Base idle = Run(B(new ResourceVector(5, 1, 0, 0, 5, 0), 4, c));
        Assert.That(idle.Stock.Wares, Is.EqualTo(0));
        Assert.That(idle.Stock.Hard, Is.EqualTo(1));
    }

    [Test]
    public void Buildings_not_yet_ready_do_not_produce()
    {
        Base b = Run(B(ResourceVector.Zero, 4, Bld(BuildingRole.CoinExtractor, 1, ready: 6)), turn: 5);
        Assert.That(b.Stock.Coin, Is.EqualTo(0));
        Base later = Run(B(ResourceVector.Zero, 4, Bld(BuildingRole.CoinExtractor, 1, ready: 6)), turn: 6);
        Assert.That(later.Stock.Coin, Is.EqualTo(20));
        Base pending = Run(B(ResourceVector.Zero, 4, Bld(BuildingRole.CoinExtractor, 1, ready: 9, pending: 2)), turn: 5);
        Assert.That(pending.Stock.Coin, Is.EqualTo(20));
    }

    [Test]
    public void Population_grows_three_percent_up_to_housing()
    {
        Base b = Run(B(new ResourceVector(0, 0, 0, 0, 50, 200), 2));
        Assert.That(b.Stock.Pop, Is.EqualTo(206));
        Assert.That(b.Stock.Food, Is.EqualTo(48));
        Base capped = Run(B(new ResourceVector(0, 0, 0, 0, 50, 299), 2));
        Assert.That(capped.Stock.Pop, Is.EqualTo(300));
        Base over = Run(B(new ResourceVector(0, 0, 0, 0, 50, 350), 2));
        Assert.That(over.Stock.Pop, Is.EqualTo(350), "no forced loss above capacity");
    }

    [Test]
    public void Housing_and_farms_raise_capacity()
    {
        Base b = B(ResourceVector.Zero, 1, Bld(BuildingRole.Habitat, 2), Bld(BuildingRole.Food, 3), Bld(BuildingRole.Habitat, 1, ready: 99));
        Assert.That(EconomyStep.Capacity(b, 5), Is.EqualTo(100 + 300 + 120));
    }

    [Test]
    public void Churches_add_immigration_with_diminishing_returns()
    {
        Base b = Run(B(new ResourceVector(0, 0, 0, 0, 50, 100), 4, Bld(BuildingRole.Attractor, 2), Bld(BuildingRole.Attractor, 2), Bld(BuildingRole.Attractor, 1), Bld(BuildingRole.Attractor, 1)));
        // growth 3 + 20 + 15 + 5 + 5 = 48
        Assert.That(b.Stock.Pop, Is.EqualTo(148));
    }

    [Test]
    public void A_food_shortage_costs_five_percent_people_with_death_neutral_events()
    {
        var events = new List<GameEvent>();
        Base b = Run(B(new ResourceVector(0, 0, 0, 0, 1, 300), 4), events: events);
        Assert.That(b.Stock.Food, Is.EqualTo(0));
        Assert.That(b.Stock.Pop, Is.EqualTo(285));
        Assert.That(events, Is.EqualTo(new GameEvent[] { new FoodShortage(1, 0), new PopLost(1, 15, "shortage", 0) }));
    }

    [Test]
    public void A_shortage_always_costs_at_least_one_person_and_never_more_than_exist()
    {
        var events = new List<GameEvent>();
        Base small = Run(B(new ResourceVector(0, 0, 0, 0, 0, 10), 4), events: events);
        Assert.That(small.Stock.Pop, Is.EqualTo(9));
        var none = new List<GameEvent>();
        Base empty = Run(B(new ResourceVector(0, 0, 0, 0, 0, 0), 4), events: none);
        Assert.That(empty.Stock.Pop, Is.EqualTo(0));
        Assert.That(none, Is.Empty, "no people, no need, no shortage");
    }

    [Test]
    public void Food_output_follows_the_season_percent()
    {
        Base b = Run(B(ResourceVector.Zero, 4, Bld(BuildingRole.Food, 4)), hooks: new FakeHooks());
        Assert.That(b.Stock.Food, Is.EqualTo(18));
    }

    [Test]
    public void The_economy_runs_the_same_when_repeated()
    {
        Base start = B(new ResourceVector(10, 10, 10, 10, 40, 150), 3, Bld(BuildingRole.Food, 2), Bld(BuildingRole.Converter, 1));
        Assert.That(Run(start), Is.EqualTo(Run(start)));
    }
}
