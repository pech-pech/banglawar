using System;
using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Glue
{
    /// <summary>
    /// Which season a turn belongs to, from the scenario's schedule (the core only announces seasons through rule
    /// hooks, and the slice runs the neutral hooks, so the indicator reads the data itself). Turn labels come from the
    /// theme's calendar.
    /// </summary>
    public sealed class SeasonLookup
    {
        private readonly IReadOnlyList<SeasonRange> schedule;
        private readonly Dictionary<string, string> labels = new Dictionary<string, string>(StringComparer.Ordinal);

        public SeasonLookup(ScenarioData scenario, ThemeData? theme)
        {
            schedule = scenario.SeasonSchedule;
            if (theme == null) return;
            foreach (NamedEntry e in theme.SeasonLabels) labels[e.Key] = e.Value;
        }

        /// <summary>The season id for a turn, or null when no range covers it.</summary>
        public string? SeasonAt(int turn)
        {
            foreach (SeasonRange r in schedule)
            {
                if (turn >= r.FromTurn && turn <= r.ToTurn) return r.Season;
            }

            return null;
        }

        /// <summary>Theme wording for a season id (English), or the id itself.</summary>
        public string ThemeLabel(string? seasonId) => seasonId != null && labels.TryGetValue(seasonId, out string? text) ? text : seasonId ?? string.Empty;

        public string Label(Localizer text, int turn)
        {
            string? id = SeasonAt(turn);
            if (id == null) return string.Empty;
            string key = "label." + id;
            return text.Locale == Localizer.English ? ThemeLabel(id) : text.Has(key) ? text.Get(key) : ThemeLabel(id);
        }
    }
}
