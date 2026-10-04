using System;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>
    /// Meaning checks for a scenario that already has the right shape: references resolve, the map and the
    /// pre-placed bases obey the placement rules, arrivals and entry tiles are legal, schedules are consistent,
    /// the end conditions can be reached, and the opening resources are balanced. Every error carries the JSON
    /// path of the field to fix. Words are checked separately by <see cref="ContentWordScanner"/>.
    /// </summary>
    public static class ScenarioValidator
    {
        public static void Validate(ScenarioData s, ErrorSink errors)
        {
            CheckHeader(s, errors);
            MapRules.Check(s, errors);
            PlayerRules.Check(s, errors);
            EntryRules.Check(s, errors);
            ArrivalRules.Check(s, errors);
            BaseRules.Check(s, errors);
            RegionRules.Check(s, errors);
            ScheduleRules.Check(s, errors);
            EndRules.Check(s, errors);
            BalanceRules.Check(s, errors);
        }

        private static void CheckHeader(ScenarioData s, ErrorSink errors)
        {
            if (s.Schema != "scenario/1")
            {
                errors.Add("$.schema", "scenario.schema", "expected 'scenario/1' but found '" + s.Schema + "'");
            }

            if (s.Requires.Ruleset != "conquest-core" || s.Requires.Major != 1)
            {
                errors.Add("$.requires", "scenario.requires", "only conquest-core major 1 is supported");
            }

            if (s.Requires.Variants.Count == 0)
            {
                errors.Add("$.requires.variants", "scenario.requires", "name at least one variant");
            }

            if (s.Settings.MaxTurns < 1 || s.Settings.MaxTurns > Vocabulary.MaxTurns)
            {
                errors.Add("$.settings.max_turns", "settings.max_turns", "must be 1.." + Vocabulary.MaxTurns);
            }

            if (s.Settings.NativeSettlements != 0)
            {
                errors.Add("$.settings.native_settlements", "settings.native_settlements", "this ruleset keeps native settlements off (0)");
            }

            CheckChoice(errors, "$.settings.difficulty", s.Settings.Difficulty, new[] { "easy", "normal", "hard" });
            CheckChoice(errors, "$.settings.resources", s.Settings.Resources, new[] { "scarce", "normal", "rich" });
            CheckChoice(errors, "$.settings.movement", s.Settings.Movement, new[] { "slow", "normal", "fast" });

            if (!CalendarMath.TryParseDate(s.Calendar.Epoch, out _))
            {
                errors.Add("$.calendar.epoch", "calendar.epoch", "expected a date written yyyy-MM-dd");
            }
        }

        private static void CheckChoice(ErrorSink errors, string path, string value, string[] allowed)
        {
            if (Array.IndexOf(allowed, value) < 0)
            {
                errors.Add(path, "settings.value", "'" + value + "' is not one of " + string.Join(", ", allowed));
            }
        }
    }
}
