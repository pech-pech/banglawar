using System;
using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>Season table and schedule (hook H3), timed effects (H5) and the calendar dates they are anchored to.</summary>
    internal static class ScheduleRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            CheckSeasonTable(s, errors);
            CheckSchedule(s, errors);
            CheckTimed(s, errors);
        }

        private static void CheckSeasonTable(ScenarioData s, ErrorSink errors)
        {
            if (s.SeasonTable.Count == 0)
            {
                errors.Add("$.season_table", "season.table_empty", "define at least one season");
            }

            foreach (SeasonDefinition d in s.SeasonTable)
            {
                string p = "$.season_table." + d.Id;
                Bound(errors, p + ".move_cost_pct_land", d.MoveCostPctLand, 50, 300);
                Bound(errors, p + ".move_cost_pct_water", d.MoveCostPctWater, 50, 300);
                Bound(errors, p + ".food_output_pct", d.FoodOutputPct, 50, 200);
            }
        }

        private static void Bound(ErrorSink errors, string path, int value, int min, int max)
        {
            if (value < min || value > max)
            {
                errors.Add(path, "season.bounds", "value " + value + " is outside the allowed " + min + ".." + max);
            }
        }

        private static void CheckSchedule(ScenarioData s, ErrorSink errors)
        {
            bool haveEpoch = CalendarMath.TryParseDate(s.Calendar.Epoch, out DateTime epoch);
            int previousEnd = -1;
            for (int i = 0; i < s.SeasonSchedule.Count; i++)
            {
                SeasonRange r = s.SeasonSchedule[i];
                string p = "$.season_schedule[" + i + "]";
                if (r.FromTurn > r.ToTurn)
                {
                    errors.Add(p, "season.range", "from_turn is after to_turn");
                }

                if (r.FromTurn <= previousEnd)
                {
                    errors.Add(p + ".from_turn", "season.order", "ranges must be sorted and must not overlap");
                }

                previousEnd = Math.Max(previousEnd, r.ToTurn);
                if (r.ToTurn >= s.Settings.MaxTurns)
                {
                    errors.Add(p + ".to_turn", "season.beyond_max", "range reaches turn " + r.ToTurn + " but max_turns is " + s.Settings.MaxTurns);
                }

                if (!HasSeason(s, r.Season))
                {
                    errors.Add(p + ".season", "season.unknown", "season '" + r.Season + "' is not in the season table");
                }

                CheckDate(haveEpoch, epoch, s.Calendar.StepDays, r.FromTurn, r.FirstTurnContainsDate, p + ".first_turn_contains_date", "season.date_mismatch", errors);
            }
        }

        private static bool HasSeason(ScenarioData s, string id)
        {
            foreach (SeasonDefinition d in s.SeasonTable)
            {
                if (d.Id == id)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Checks that a turn contains a stated date; shared by seasons, timed effects and the deadline.</summary>
        public static void CheckDate(bool haveEpoch, DateTime epoch, int stepDays, int turn, string? date, string path, string code, ErrorSink errors)
        {
            if (date == null)
            {
                return;
            }

            if (!CalendarMath.TryParseDate(date, out DateTime wanted))
            {
                errors.Add(path, "calendar.date_format", "expected a date written yyyy-MM-dd");
                return;
            }

            if (haveEpoch && !CalendarMath.TurnContains(epoch, stepDays, turn, wanted))
            {
                DateTime start = CalendarMath.TurnStart(epoch, stepDays, turn);
                errors.Add(path, code, "turn " + turn + " covers " + CalendarMath.Format(start) + " to "
                    + CalendarMath.Format(start.AddDays(stepDays - 1)) + ", not " + date);
            }
        }

        private static void CheckTimed(ScenarioData s, ErrorSink errors)
        {
            bool haveEpoch = CalendarMath.TryParseDate(s.Calendar.Epoch, out DateTime epoch);
            var ids = new HashSet<string>();
            for (int i = 0; i < s.TimedEffects.Count; i++)
            {
                TimedEffectData t = s.TimedEffects[i];
                string p = "$.timed_effects[" + i + "]";
                if (!ids.Add(t.Id))
                {
                    errors.Add(p + ".id", "timed.duplicate", "timed effect id '" + t.Id + "' is used twice");
                }

                if (t.FromTurn >= s.Settings.MaxTurns)
                {
                    errors.Add(p + ".from_turn", "timed.turn", "from_turn is not before max_turns");
                }

                if (t.ToTurn.HasValue && t.ToTurn.Value < t.FromTurn)
                {
                    errors.Add(p + ".to_turn", "timed.range", "to_turn is before from_turn");
                }

                if (EntryRules.FindPlayer(s, t.TargetSlot) == null)
                {
                    errors.Add(p + ".target_slot", "timed.target", "slot '" + t.TargetSlot + "' is not a player");
                }

                CheckDate(haveEpoch, epoch, s.Calendar.StepDays, t.FromTurn, t.FirstTurnContainsDate, p + ".first_turn_contains_date", "timed.date_mismatch", errors);
                for (int j = 0; j < t.Effects.Count; j++)
                {
                    CheckEffect(t.Effects[j], p + ".effects[" + j + "]", errors);
                }
            }
        }

        private static void CheckEffect(TimedEffectKind e, string p, ErrorSink errors)
        {
            if (!Vocabulary.Contains(Vocabulary.TimedEffectKinds, e.Kind))
            {
                errors.Add(p + ".kind", "timed.kind", "unknown effect kind '" + e.Kind + "'");
                return;
            }

            if (e.Kind == "patron_link_cut" && e.InFlight != "cancel_refund")
            {
                errors.Add(p + ".in_flight", "timed.in_flight", "patron_link_cut needs in_flight 'cancel_refund'");
            }

            if (e.Kind == "panic_modifier" && (e.Scope != "defending_base" || !e.Permille.HasValue))
            {
                errors.Add(p, "timed.panic", "panic_modifier needs scope 'defending_base' and a permille value");
            }
        }
    }
}
