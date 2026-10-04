using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Patron trade (GDD 9, ASSUMED numbers): needs a working Port; a buy pays coin at twice the base price, a sell receives
    /// the base price; goods arrive when the turn after next begins (delay 2); the import cap per base is 20, 40, 80 or
    /// 160 units in flight for a Port of level 1 to 4. Price elasticity (GDD 9 "each unit raises the price 1%") is not built.
    /// </summary>
    public static class PatronTrade
    {
        public const int DelayTurns = 2;
        public const int BuySpreadMultiplier = 2;

        private static readonly int[] ImportCapByLevel = { 20, 40, 80, 160 };

        /// <summary>Coin per unit: basic 2, hard 4, wares 8, food 1. Coin and people are not traded (0).</summary>
        public static int BasePrice(Resource resource)
        {
            switch (resource)
            {
                case Resource.Basic: return 2;
                case Resource.Hard: return 4;
                case Resource.Wares: return 8;
                case Resource.Food: return 1;
                default: return 0;
            }
        }

        public static int UnitPrice(Resource resource, bool buy) => BasePrice(resource) * (buy ? BuySpreadMultiplier : 1);

        public static CommandResult Order(GameState s, PatronTradeCommand cmd, TurnServices svc)
        {
            string? gate = svc.TimedEffects.OrderGate(cmd.Slot, s.Turn, true);
            if (gate != null)
            {
                return CommandResult.Failure(s, gate);
            }

            int bi = s.FindBaseIndex(cmd.BaseId);
            if (bi < 0)
            {
                return CommandResult.Failure(s, Err.UnknownBase);
            }

            Base b = s.BaseTable[bi];
            string? error = Check(s, b, cmd);
            if (error != null)
            {
                return CommandResult.Failure(s, error);
            }

            ResourceVector paid = cmd.Buy
                ? ResourceVector.Zero.With(Resource.Coin, cmd.Amount * UnitPrice(cmd.Resource, true))
                : ResourceVector.Zero.With(cmd.Resource, cmd.Amount);
            var order = new PatronOrder(b.Id, cmd.Slot, cmd.Resource, cmd.Amount, cmd.Buy, paid, s.Turn + DelayTurns - 1);
            GameState next = s.WithBase(b with { Stock = b.Stock.Subtract(paid) });
            next = next with { PatronOrders = next.PatronOrders.Add(order) };
            return CommandResult.Success(next, ImmArray<GameEvent>.Of(new PatronOrdered(b.Id, cmd.Resource, cmd.Amount, cmd.Buy, cmd.Slot)));
        }

        private static string? Check(GameState s, Base b, PatronTradeCommand cmd)
        {
            if (b.Owner != cmd.Slot)
            {
                return Err.NotOwner;
            }

            if (cmd.Amount <= 0)
            {
                return Err.BadAmount;
            }

            if (BasePrice(cmd.Resource) == 0)
            {
                return Err.NotTradable;
            }

            int portLevel = PortLevel(b, s.Turn);
            if (portLevel == 0)
            {
                return Err.NoBuilding;
            }

            if (cmd.Buy)
            {
                if (InFlightBuys(s, b.Id) + cmd.Amount > ImportCapByLevel[IntMath.Clamp(portLevel, 1, RuleTables.MaxLevel) - 1])
                {
                    return Err.ImportCap;
                }

                return b.Stock.Coin >= cmd.Amount * UnitPrice(cmd.Resource, true) ? null : Err.NotEnoughResources;
            }

            return b.Stock.Get(cmd.Resource) >= cmd.Amount ? null : Err.NotEnoughResources;
        }

        private static int PortLevel(Base b, int turn)
        {
            int level = 0;
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                if (x.Role == BuildingRole.Port && EconomyStep.IsFunctional(x, turn) && x.Level > level)
                {
                    level = x.Level;
                }
            }

            return level;
        }

        private static int InFlightBuys(GameState s, int baseId)
        {
            int total = 0;
            for (int i = 0; i < s.PatronOrders.Count; i++)
            {
                PatronOrder o = s.PatronOrders[i];
                if (o.BaseId == baseId && o.Buy)
                {
                    total += o.Amount;
                }
            }

            return total;
        }
    }
}
