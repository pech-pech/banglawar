using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Pipeline step 4 (GDD 8): production, food, population, per base in id order, integers only.
    /// ASSUMED and flagged gaps: the productivity modifier is the region bonus only (the terrain/river/discovery affinity
    /// table is not built yet), there is no tax or interest, and labour demand is not modelled. The converter is not
    /// scaled by the region bonus (it converts goods; it does not produce from the land).
    /// </summary>
    public static class EconomyStep
    {
        public static GameState Run(GameState state, IRuleHooks hooks, List<GameEvent> events)
        {
            return Run(state, hooks, Rules.RegionService.None, events);
        }

        /// <summary>As above, with the region bonus (spec 06 H6) added to the productivity modifier of the buildings it names.</summary>
        public static GameState Run(GameState state, IRuleHooks hooks, IRegionService regions, List<GameEvent> events)
        {
            GameState s = state;
            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                Base b = s.BaseTable[i];
                s = s.WithBase(RunBase(s, b, hooks, regions, events));
            }

            return s;
        }

        /// <summary>
        /// What the next end of turn will do to one base's stock, from the same code the pipeline runs (resource-bar forecast).
        /// The state's own turn is the turn that resolves. Events are discarded.
        /// </summary>
        public static ResourceVector Forecast(GameState state, Base b, IRuleHooks hooks, IRegionService regions)
        {
            Base after = RunBase(state, b, hooks, regions, new List<GameEvent>());
            return after.Stock.Subtract(b.Stock);
        }

        /// <summary>Population capacity: Center as Housing of its level, plus Housing, plus 40 per farm level (GDD 8.5).</summary>
        public static int Capacity(Base b, int turn)
        {
            int cap = RuleTables.HousingOf(b.CoreLevel);
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (!IsFunctional(x, turn))
                {
                    continue;
                }

                if (x.Role == BuildingRole.Habitat)
                {
                    cap += RuleTables.HousingOf(x.Level);
                }
                else if (x.Role == BuildingRole.Food)
                {
                    cap += RuleTables.FarmHousing(x.Level);
                }
            }

            return cap;
        }

        /// <summary>A new building works once <c>turn >= ReadyTurn</c>; one with a pending upgrade keeps working at its old level.</summary>
        public static bool IsFunctional(Building x, int turn) => x.PendingLevel > 0 || x.ReadyTurn <= turn;

        private static Base RunBase(GameState state, Base b, IRuleHooks hooks, IRegionService regions, List<GameEvent> events)
        {
            int turn = state.Turn;
            ResourceVector stock = Produce(state, b, hooks, regions);
            int pop = stock.Pop;
            int need = IntMath.FloorDiv(pop + RuleTables.PeoplePerFood - 1, RuleTables.PeoplePerFood);
            if (stock.Food < need)
            {
                int lost = pop == 0 ? 0 : System.Math.Min(pop, System.Math.Max(1, IntMath.Percent(pop, RuleTables.ShortagePct)));
                events.Add(new FoodShortage(b.Id, b.Owner));
                if (lost > 0)
                {
                    events.Add(new PopLost(b.Id, lost, "shortage", b.Owner));
                }

                return b with { Stock = stock.With(Resource.Food, 0).With(Resource.Pop, pop - lost) };
            }

            ResourceVector fed = stock.With(Resource.Food, stock.Food - need);
            int cap = Capacity(b, turn);
            int growth = pop == 0 ? 0 : System.Math.Max(1, IntMath.Percent(pop, RuleTables.GrowthPct));
            int target = pop + growth + Immigration(b, turn);
            int newPop = target > cap ? System.Math.Max(pop, cap) : target;
            return b with { Stock = fed.With(Resource.Pop, newPop) };
        }

        private static int Modifier(GameState state, Base b, IRegionService regions, BuildingRole role)
        {
            return IntMath.Clamp(regions.BonusPct(state, b.Owner, b.Id, role), RuleTables.ModifierMinPct, RuleTables.ModifierMaxPct);
        }

        /// <summary><c>floor(base * (100 + modifier) / 100)</c>; the food variant also applies the season percent with one floor.</summary>
        private static int Scaled(int baseOutput, int modifierPct, int seasonPct = 100)
        {
            return checked((int)IntMath.FloorDiv((long)baseOutput * (100 + modifierPct) * seasonPct, 10000L));
        }

        private static ResourceVector Produce(GameState state, Base b, IRuleHooks hooks, IRegionService regions)
        {
            int turn = state.Turn;
            ResourceVector stock = b.Stock;
            int foodPct = hooks.FoodOutputPct(turn);
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (!IsFunctional(x, turn))
                {
                    continue;
                }

                switch (x.Role)
                {
                    case BuildingRole.Food:
                        stock = Add(stock, Resource.Food, Scaled(RuleTables.FoodBase(x.Level), Modifier(state, b, regions, x.Role), foodPct));
                        break;
                    case BuildingRole.BasicExtractor:
                        stock = Add(stock, Resource.Basic, Scaled(RuleTables.ExtractorBase(x.Level), Modifier(state, b, regions, x.Role)));
                        break;
                    case BuildingRole.HardExtractor:
                        stock = Add(stock, Resource.Hard, Scaled(RuleTables.ExtractorBase(x.Level), Modifier(state, b, regions, x.Role)));
                        break;
                    case BuildingRole.CoinExtractor:
                        stock = Add(stock, Resource.Coin, Scaled(RuleTables.CoinBase(x.Level), Modifier(state, b, regions, x.Role)));
                        break;
                }
            }

            return Convert(b, stock, turn);
        }

        /// <summary>Commerce consumes 1 hard, 1 basic and 1 food per level and makes that many wares; it idles if short (GDD 8.3).</summary>
        private static ResourceVector Convert(Base b, ResourceVector stock, int turn)
        {
            ResourceVector s = stock;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (x.Role != BuildingRole.Converter || !IsFunctional(x, turn))
                {
                    continue;
                }

                int n = RuleTables.ExtractorBase(x.Level);
                if (s.Hard < n || s.Basic < n || s.Food < n)
                {
                    continue;
                }

                s = s.With(Resource.Hard, s.Hard - n).With(Resource.Basic, s.Basic - n).With(Resource.Food, s.Food - n).With(Resource.Wares, s.Wares + n);
            }

            return s;
        }

        private static int Immigration(Base b, int turn)
        {
            int total = 0;
            int ordinal = 0;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (x.Role == BuildingRole.Attractor && IsFunctional(x, turn))
                {
                    total += IntMath.Percent(RuleTables.ImmigrationOf(x.Level), RuleTables.ChurchWeightPct(ordinal));
                    ordinal++;
                }
            }

            return total;
        }

        private static ResourceVector Add(ResourceVector v, Resource r, int amount) => v.With(r, checked(v.Get(r) + amount));
    }
}
