using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class PatronTests
{
    private static GameState Harbour(out int baseId, int portLevel = 1)
    {
        GameState s = Base(New(), 0, 4, 5, out baseId, core: 2, stock: new ResourceVector(100, 100, 1000, 100, 100, 100));
        return GameFactory.AddBuilding(s, baseId, BuildingRole.Port, portLevel, new TileCoord(5, 5));
    }

    private static CommandResult Trade(GameState s, int b, Resource r, int amount, bool buy, TurnServices? svc = null) =>
        CommandEngine.Apply(s, new PatronTradeCommand(0, b, r, amount, buy), svc);

    private static TurnServices Cut(InFlightPolicy policy, int from = 0) =>
        new TurnServices(timedEffects: new TimedEffectSet(true, new[] { new TimedEffectEntry("te", from, null, 0, patronLinkCut: true, inFlight: policy) }));

    [Test]
    public void A_buy_pays_coin_now_at_twice_the_base_price_and_the_goods_arrive_after_the_delay()
    {
        GameState s = Harbour(out int b);

        CommandResult order = Trade(s, b, Resource.Hard, 10, buy: true);
        Assert.That(order.Ok, Is.True, order.Error);
        Assert.That(order.State.BaseTable[0].Stock.Coin, Is.EqualTo(1000 - (10 * 8)));
        Assert.That(order.Events.Single(), Is.EqualTo(new PatronOrdered(b, Resource.Hard, 10, true, 0)));

        var events = new List<GameEvent>();
        GameState turn1 = EndAll(order.State, null, events);
        Assert.That(turn1.BaseTable[0].Stock.Hard, Is.EqualTo(100), "not yet: the delay is two turns");
        Assert.That(turn1.PatronOrders.Count, Is.EqualTo(1));

        GameState turn2 = EndAll(turn1, null, events);
        Assert.That(turn2.BaseTable[0].Stock.Hard, Is.EqualTo(110));
        Assert.That(turn2.PatronOrders.Count, Is.EqualTo(0));
        Assert.That(events.OfType<PatronDelivered>().Single(), Is.EqualTo(new PatronDelivered(b, Resource.Hard, 10, true, 0)));
    }

    [Test]
    public void A_sell_hands_over_the_goods_now_and_pays_the_base_price_on_delivery()
    {
        GameState s = Harbour(out int b);

        GameState ordered = Ok(Trade(s, b, Resource.Basic, 20, buy: false));
        Assert.That(ordered.BaseTable[0].Stock.Basic, Is.EqualTo(80));

        GameState done = EndAll(EndAll(ordered));
        Assert.That(done.BaseTable[0].Stock.Coin, Is.EqualTo(1000 + (20 * 2)));
    }

    [Test]
    public void A_trade_needs_a_working_port_and_a_valid_amount_and_something_tradable()
    {
        GameState noPort = Base(New(), 0, 4, 5, out int a, core: 2, stock: new ResourceVector(100, 100, 1000, 100, 100, 100));
        GameState harbour = Harbour(out int b);
        GameState newPort = GameFactory.AddBuilding(Base(New(), 0, 4, 5, out int c, core: 2, stock: Rich), c, BuildingRole.Port, 1, new TileCoord(5, 5));
        Base pending = newPort.BaseTable[0];
        newPort = newPort.WithBase(pending with { Buildings = pending.Buildings.SetItem(0, pending.Buildings[0] with { ReadyTurn = 5 }) });

        Assert.That(Trade(noPort, a, Resource.Hard, 1, true).Error, Is.EqualTo(Err.NoBuilding));
        Assert.That(Trade(newPort, c, Resource.Hard, 1, true).Error, Is.EqualTo(Err.NoBuilding), "a port that is still being built does not trade");
        Assert.That(Trade(harbour, b, Resource.Hard, 0, true).Error, Is.EqualTo(Err.BadAmount));
        Assert.That(Trade(harbour, b, Resource.Coin, 5, true).Error, Is.EqualTo(Err.NotTradable));
        Assert.That(Trade(harbour, b, Resource.Pop, 5, false).Error, Is.EqualTo(Err.NotTradable));
        Assert.That(Trade(harbour, 99, Resource.Hard, 1, true).Error, Is.EqualTo(Err.UnknownBase));
        Assert.That(CommandEngine.Apply(harbour, new PatronTradeCommand(1, b, Resource.Hard, 1, true)).Error, Is.EqualTo(Err.NotOwner));
    }

    [Test]
    public void A_buy_needs_the_coin_and_a_sell_needs_the_goods()
    {
        GameState s = Base(New(), 0, 4, 5, out int b, core: 2, stock: new ResourceVector(100, 100, 30, 100, 100, 100));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Port, 1, new TileCoord(5, 5));

        Assert.That(Trade(s, b, Resource.Wares, 2, buy: true).Error, Is.EqualTo(Err.NotEnoughResources), "2 x 16 = 32 coin, only 30 held");
        Assert.That(Trade(s, b, Resource.Wares, 1, buy: true).Ok, Is.True);
        Assert.That(Trade(s, b, Resource.Basic, 101, buy: false).Error, Is.EqualTo(Err.NotEnoughResources));
        Assert.That(Trade(s, b, Resource.Basic, 100, buy: false).Ok, Is.True);
    }

    [Test]
    public void The_import_cap_per_port_level_limits_goods_in_flight()
    {
        GameState s = Harbour(out int b);
        s = Ok(Trade(s, b, Resource.Food, 15, buy: true));

        Assert.That(Trade(s, b, Resource.Food, 6, buy: true).Error, Is.EqualTo(Err.ImportCap));
        Assert.That(Trade(s, b, Resource.Food, 5, buy: true).Ok, Is.True);
        Assert.That(Trade(Harbour(out int big, portLevel: 3), big, Resource.Food, 80, buy: true).Ok, Is.True);
    }

    [Test]
    public void A_cut_link_refuses_new_orders_with_its_own_error()
    {
        GameState s = Harbour(out int b);

        Assert.That(Trade(s, b, Resource.Hard, 1, true, Cut(InFlightPolicy.CancelRefund)).Error, Is.EqualTo("err.patron_link_cut"));
        Assert.That(Trade(s, b, Resource.Hard, 1, true, Cut(InFlightPolicy.CancelRefund, from: 5)).Ok, Is.True, "the cut has not started yet");
    }

    [Test]
    public void Cancel_refund_gives_back_exactly_what_was_paid_for_a_buy_and_a_sell()
    {
        GameState s = Harbour(out int b);
        ResourceVector before = s.BaseTable[0].Stock;
        s = Ok(Trade(s, b, Resource.Hard, 10, buy: true));
        s = Ok(Trade(s, b, Resource.Basic, 20, buy: false));
        var events = new List<GameEvent>();

        // the link goes down at turn 1, so the orders due at the end of turn 1 are cancelled
        TurnServices svc = Cut(InFlightPolicy.CancelRefund, from: 1);
        GameState turn1 = EndAll(s, svc, events);
        GameState turn2 = EndAll(turn1, svc, events);

        ResourceVector after = turn2.BaseTable[0].Stock;
        Assert.That((after.Basic, after.Hard, after.Coin, after.Wares), Is.EqualTo((before.Basic, before.Hard, before.Coin, before.Wares)));
        Assert.That(events.OfType<PatronCancelled>().Select(e => e.Reason), Is.All.EqualTo("patron_link_cut"));
        Assert.That(events.OfType<PatronCancelled>().Count(), Is.EqualTo(2));
        Assert.That(turn2.PatronOrders.Count, Is.EqualTo(0));
    }

    [Test]
    public void Deliver_policy_lets_an_order_in_flight_arrive_despite_the_cut()
    {
        GameState s = Ok(Trade(Harbour(out int b), b, Resource.Hard, 10, buy: true));
        TurnServices svc = Cut(InFlightPolicy.Deliver, from: 1);

        GameState done = EndAll(EndAll(s, svc), svc);

        Assert.That(done.BaseTable[0].Stock.Hard, Is.EqualTo(110));
    }

    [Test]
    public void An_order_whose_base_was_lost_is_dropped_without_a_refund()
    {
        GameState s = Ok(Trade(Harbour(out int b), b, Resource.Hard, 10, buy: true));
        var events = new List<GameEvent>();

        GameState after = EndAll(EndAll(s.WithoutBase(b), null, events), null, events);

        Assert.That(after.PatronOrders.Count, Is.EqualTo(0));
        Assert.That(events.OfType<PatronCancelled>().Single().Reason, Is.EqualTo("base_lost"));
    }

    [Test]
    public void Prices_are_a_two_to_one_spread()
    {
        Assert.That(PatronTrade.UnitPrice(Resource.Wares, true), Is.EqualTo(16));
        Assert.That(PatronTrade.UnitPrice(Resource.Wares, false), Is.EqualTo(8));
        Assert.That(PatronTrade.BasePrice(Resource.Coin), Is.EqualTo(0));
    }
}
