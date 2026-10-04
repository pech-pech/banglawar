using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Pipeline step 3 (spec 06 H5): patron deliveries that are due. While a slot's link is cut, an order due now is refunded
    /// (<c>CancelRefund</c>) or delivered (<c>Deliver</c>), as the effect says. An order whose base has been lost is dropped.
    /// </summary>
    internal static class PatronStep
    {
        public static GameState Run(GameState state, TurnServices services, List<GameEvent> events)
        {
            GameState s = state with { PatronOrders = ImmArray<PatronOrder>.Empty };
            var waiting = new List<PatronOrder>();
            for (int i = 0; i < state.PatronOrders.Count; i++)
            {
                PatronOrder o = state.PatronOrders[i];
                if (o.DeliverTurn > state.Turn)
                {
                    waiting.Add(o);
                    continue;
                }

                s = Settle(s, o, services, events);
            }

            return s with { PatronOrders = ImmArray<PatronOrder>.From(waiting) };
        }

        private static GameState Settle(GameState s, PatronOrder o, TurnServices services, List<GameEvent> events)
        {
            int bi = s.FindBaseIndex(o.BaseId);
            if (bi < 0 || s.BaseTable[bi].Owner != o.Slot)
            {
                events.Add(new PatronCancelled(o.BaseId, o.Resource, o.Amount, o.Buy, o.Slot, "base_lost"));
                return s;
            }

            Base b = s.BaseTable[bi];
            InFlightPolicy? policy = services.TimedEffects.InFlight(o.Slot, s.Turn);
            if (policy == InFlightPolicy.CancelRefund)
            {
                events.Add(new PatronCancelled(o.BaseId, o.Resource, o.Amount, o.Buy, o.Slot, "patron_link_cut"));
                return s.WithBase(b with { Stock = b.Stock.Add(o.Paid) });
            }

            ResourceVector received = o.Buy
                ? ResourceVector.Zero.With(o.Resource, o.Amount)
                : ResourceVector.Zero.With(Resource.Coin, o.Amount * PatronTrade.UnitPrice(o.Resource, false));
            events.Add(new PatronDelivered(o.BaseId, o.Resource, o.Amount, o.Buy, o.Slot));
            return s.WithBase(b with { Stock = b.Stock.Add(received) });
        }
    }
}
