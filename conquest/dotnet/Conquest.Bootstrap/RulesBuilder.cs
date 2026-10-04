using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;
using Conquest.Core.Rules.EndConditions;
using CoreSeasonDefinition = Conquest.Core.Rules.SeasonDefinition;
using CoreSeasonRange = Conquest.Core.Rules.SeasonRange;

namespace Conquest.Bootstrap
{
    /// <summary>Builds the rule services (hooks H1 to H7) a scenario switches on.</summary>
    internal static class RulesBuilder
    {
        public static SeasonTable Seasons(ScenarioData s)
        {
            var definitions = new List<CoreSeasonDefinition>();
            foreach (Conquest.Content.Model.SeasonDefinition d in s.SeasonTable)
            {
                definitions.Add(new CoreSeasonDefinition(d.Id, d.MoveCostPctLand, d.MoveCostPctWater, d.FoodOutputPct));
            }

            var schedule = new List<CoreSeasonRange>();
            foreach (Conquest.Content.Model.SeasonRange r in s.SeasonSchedule)
            {
                schedule.Add(new CoreSeasonRange(r.FromTurn, r.ToTurn, r.Season));
            }

            return new SeasonTable(definitions.Count > 0, definitions, schedule);
        }

        public static TimedEffectSet TimedEffects(ScenarioData s, List<BootError> errors)
        {
            var entries = new List<TimedEffectEntry>();
            for (int i = 0; i < s.TimedEffects.Count; i++)
            {
                TimedEffectData t = s.TimedEffects[i];
                if (!SlotNames.TryParse(t.TargetSlot, out int slot))
                {
                    errors.Add(new BootError("/timed_effects/" + i, "err.boot_slot", "bad target slot '" + t.TargetSlot + "'"));
                    continue;
                }

                entries.Add(Entry(t, slot));
            }

            var set = new TimedEffectSet(entries.Count > 0, entries);
            foreach (RuleIssue issue in set.Validate(s.Players.Count))
            {
                errors.Add(new BootError(issue.Path, issue.Code, "timed effect rejected"));
            }

            return set;
        }

        private static TimedEffectEntry Entry(TimedEffectData t, int slot)
        {
            bool cut = false;
            InFlightPolicy inFlight = InFlightPolicy.CancelRefund;
            int panic = 0;
            PanicScope scope = PanicScope.DefendingBase;
            foreach (TimedEffectKind e in t.Effects)
            {
                if (e.Kind == "patron_link_cut")
                {
                    cut = true;
                    inFlight = e.InFlight == "deliver" ? InFlightPolicy.Deliver : InFlightPolicy.CancelRefund;
                }
                else if (e.Kind == "panic_modifier")
                {
                    panic += e.Permille ?? 0;
                    scope = e.Scope == "all_battles" ? PanicScope.AllBattles : PanicScope.DefendingBase;
                }
            }

            return new TimedEffectEntry(t.Id, t.FromTurn, t.ToTurn, slot, t.Announce, cut, inFlight, panic, scope);
        }

        public static RegionService Regions(ScenarioData s, List<BootError> errors)
        {
            if (s.Regions.Count == 0)
            {
                return RegionService.None;
            }

            var byTile = new int[s.Map.Width * s.Map.Height];
            for (int i = 0; i < byTile.Length; i++)
            {
                byTile[i] = -1;
            }

            var ids = new List<string>();
            for (int r = 0; r < s.Regions.Count; r++)
            {
                ids.Add(s.Regions[r].Id);
                Paint(byTile, s.Map.Width, s.Map.Height, s.Regions[r], r);
            }

            var capped = new List<int>();
            foreach (string name in s.RegionCapSlots)
            {
                if (SlotNames.TryParse(name, out int slot))
                {
                    capped.Add(slot);
                }
                else
                {
                    errors.Add(new BootError("/region_cap_slots", "err.boot_slot", "bad slot '" + name + "'"));
                }
            }

            var config = new RegionRulesConfig(
                capped.Count > 0,
                BootDefaults.RegionCapMinLevel,
                BootDefaults.RegionCapMaxPerRegion,
                capped,
                BootDefaults.RegionBonusPct,
                new[] { BuildingRole.Food, BuildingRole.BasicExtractor, BuildingRole.HardExtractor, BuildingRole.CoinExtractor, BuildingRole.Converter });
            return new RegionService(new RegionMap(s.Map.Width, s.Map.Height, ids, byTile), config);
        }

        private static void Paint(int[] byTile, int width, int height, RegionData region, int index)
        {
            foreach (RectData rect in region.Rects)
            {
                for (int y = rect.Y; y < rect.Y + rect.Height && y < height; y++)
                {
                    for (int x = rect.X; x < rect.X + rect.Width && x < width; x++)
                    {
                        int at = (y * width) + x;
                        if (byTile[at] < 0)
                        {
                            byTile[at] = index;
                        }
                    }
                }
            }
        }

        /// <summary>Healing at the scout post (owner decision 2026-10-03, hook H7); every other role heals nothing.</summary>
        public static HealingStep Healing()
        {
            var sources = new[] { new HealingSource("bld.scout_post", new[] { 1, 1, 1, 1 }) };
            return new HealingStep(new HealingConfig(sources, BootDefaults.HealingMaxStrength));
        }

        public static EndConditionEvaluator? EndConditions(ScenarioData s, List<BootError> errors)
        {
            EndConditionsData e = s.EndConditions;
            var sites = new List<SiteInfo>();
            for (int i = 0; i < s.PrePlacedBases.Count; i++)
            {
                PrePlacedBase b = s.PrePlacedBases[i];
                if (SlotNames.TryParse(b.Owner, out int owner))
                {
                    sites.Add(new SiteInfo(b.SiteId, owner, b.Tags));
                }
            }

            var surrenders = new List<SurrenderEntry>();
            for (int i = 0; i < e.Surrender.Count; i++)
            {
                string path = "/end_conditions/surrender/" + i;
                Predicate? when = PredicateConverter.Convert(e.Surrender[i].When, path + "/when", errors);
                if (!SlotNames.TryParse(e.Surrender[i].Slot, out int slot) || when == null)
                {
                    errors.Add(new BootError(path, "err.boot_slot", "bad surrender entry"));
                    continue;
                }

                surrenders.Add(new SurrenderEntry(slot, when));
            }

            var counts = new List<Conquest.Core.Rules.EndConditions.TagCount>();
            foreach (Conquest.Content.Model.TagCount t in e.TagCounts)
            {
                counts.Add(new Conquest.Core.Rules.EndConditions.TagCount(t.Tag, t.Count));
            }

            var victory = new VictoryRules(
                e.Elimination.HomelessTurnsLimit,
                e.Elimination.NoBaseNoFounderGraceTurns,
                e.Deadline.Result == "draw" ? DeadlineResult.Draw : DeadlineResult.None,
                true,
                BootDefaults.PredicateMaxDepth,
                BootDefaults.PredicateMaxNodes);
            var config = new EndConditionConfig(victory, sites, surrenders, e.Deadline.MaxTurns, counts);
            foreach (RuleIssue issue in config.Validate(s.Players.Count))
            {
                errors.Add(new BootError(issue.Path, issue.Code, "end condition rejected"));
            }

            return new EndConditionEvaluator(config);
        }
    }
}
