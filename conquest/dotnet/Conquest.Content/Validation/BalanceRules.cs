using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>Opening resources: every commodity total per slot inside its stated bounds, and the two sides within a stated ratio.</summary>
    internal static class BalanceRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            BalanceData bal = s.Balance;
            var bounds = new Dictionary<string, CommodityBound>();
            foreach (CommodityBound b in bal.CommodityBounds)
            {
                string p = "$.balance.commodity_bounds." + b.Resource;
                if (!Vocabulary.Contains(Vocabulary.Commodities, b.Resource))
                {
                    errors.Add(p, "balance.bounds", "'" + b.Resource + "' is not a commodity");
                }
                else if (b.Min > b.Max)
                {
                    errors.Add(p, "balance.bounds", "min is greater than max");
                }
                else
                {
                    bounds[b.Resource] = b;
                }
            }

            foreach (string c in Vocabulary.Commodities)
            {
                if (!bounds.ContainsKey(c))
                {
                    errors.Add("$.balance.commodity_bounds", "balance.bounds_missing", "no bounds stated for " + c);
                }
            }

            var totals = new List<int>();
            foreach (PlayerData player in s.Players)
            {
                int sum = 0;
                foreach (string c in Vocabulary.Commodities)
                {
                    int amount = SlotTotal(s, player, c);
                    sum += amount;
                    if (bounds.TryGetValue(c, out CommodityBound? bound) && (amount < bound.Min || amount > bound.Max))
                    {
                        errors.Add("$.balance.commodity_bounds." + c, "balance.commodity",
                            player.Slot + " opens with " + amount + " of " + c + ", outside " + bound.Min + ".." + bound.Max);
                    }
                }

                totals.Add(sum);
            }

            CheckRatio(bal, totals, errors);
        }

        private static void CheckRatio(BalanceData bal, List<int> totals, ErrorSink errors)
        {
            if (totals.Count < 2)
            {
                return;
            }

            int lo = int.MaxValue;
            int hi = 0;
            foreach (int t in totals)
            {
                lo = System.Math.Min(lo, t);
                hi = System.Math.Max(hi, t);
            }

            if (lo <= 0 || (long)hi * 100 > (long)lo * bal.MaxSlotRatioPct)
            {
                errors.Add("$.balance.max_slot_ratio_pct", "balance.ratio",
                    "opening totals " + hi + " and " + lo + " are further apart than " + bal.MaxSlotRatioPct + " percent");
            }
        }

        private static int SlotTotal(ScenarioData s, PlayerData player, string resource)
        {
            int total = player.StartKit?.Get(resource) ?? 0;
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (b.Owner == player.Slot)
                {
                    total += b.Stock.Get(resource);
                }
            }

            return total;
        }
    }
}
