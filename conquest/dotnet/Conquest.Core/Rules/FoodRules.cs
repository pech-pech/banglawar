using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    public sealed class FoodConfig
    {
        public FoodConfig(int peoplePerFood, int shortageLossPct)
        {
            PeoplePerFood = peoplePerFood;
            ShortageLossPct = shortageLossPct;
        }

        /// <summary>GDD 8.5 (ASSUMED): 1 food per 100 people per turn, 5 per cent leave on a shortage.</summary>
        public static FoodConfig Default { get; } = new FoodConfig(100, 5);

        public int PeoplePerFood { get; }

        public int ShortageLossPct { get; }
    }

    public sealed class FoodOutcome
    {
        public FoodOutcome(int newFood, int newPop, int popLost, bool shortage, IReadOnlyList<GameEvent> events)
        {
            NewFood = newFood;
            NewPop = newPop;
            PopLost = popLost;
            Shortage = shortage;
            Events = events;
        }

        public int NewFood { get; }

        public int NewPop { get; }

        public int PopLost { get; }

        public bool Shortage { get; }

        public IReadOnlyList<GameEvent> Events { get; }
    }

    /// <summary>
    /// Food, warnings and the shortage outcome (GDD 8.5, spec 06 G-8.5). The outcome is one death-neutral event,
    /// <c>ev.pop_lost{cause: "shortage"}</c>, plus the warning <c>warn.food_shortage</c>. No civilian state exists.
    /// </summary>
    public static class FoodRules
    {
        public static FoodOutcome Resolve(FoodConfig config, int baseId, int slot, int pop, int stock, int produced)
        {
            int need = Need(config, pop);
            int available = stock + produced;
            List<GameEvent> events = new List<GameEvent>();

            if (available >= need)
            {
                int left = available - need;
                bool lowNextTurn = left + produced < need;
                if (lowNextTurn)
                {
                    events.Add(new FoodShortage(baseId, slot));
                }

                return new FoodOutcome(left, pop, 0, false, Frozen.List(events));
            }

            int loss = pop <= 0 ? 0 : System.Math.Max(1, IntMath.Percent(pop, config.ShortageLossPct));
            loss = System.Math.Min(loss, pop);
            events.Add(new FoodShortage(baseId, slot));
            events.Add(new PopLost(baseId, loss, "shortage", slot));
            return new FoodOutcome(0, pop - loss, loss, true, Frozen.List(events));
        }

        /// <summary>People lost with the militia (GDD 11.6, ASSUMED 5 per strength point).</summary>
        public static int PopLossFromMilitia(int strengthLost, int perPoint = 5)
        {
            return strengthLost * perPoint;
        }

        private static int Need(FoodConfig config, int pop)
        {
            return pop <= 0 ? 0 : (pop + config.PeoplePerFood - 1) / config.PeoplePerFood;
        }
    }
}
