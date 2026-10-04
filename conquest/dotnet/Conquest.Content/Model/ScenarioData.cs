using System.Collections.Generic;

namespace Conquest.Content.Model
{
    public sealed class RequiresData
    {
        public RequiresData(string ruleset, int major, int minMinor, IReadOnlyList<string> variants)
        {
            Ruleset = ruleset;
            Major = major;
            MinMinor = minMinor;
            Variants = variants;
        }

        public string Ruleset { get; }

        public int Major { get; }

        public int MinMinor { get; }

        public IReadOnlyList<string> Variants { get; }
    }

    /// <summary>
    /// A scenario as plain data. Mapping to Conquest.Core (names are the proposed ones; the Core agent owns them):
    /// <c>Map</c> becomes the terrain grid (legend role to the core terrain table; looks stay in content);
    /// <c>Players</c> and <c>EntryGroups</c> feed hook H1; <c>Arrivals</c> the arrival schedule;
    /// <c>PrePlacedBases</c> hook H2; <c>Regions</c> the region cap (H6); <c>SeasonSchedule</c> hook H3;
    /// <c>TimedEffects</c> hook H5; <c>EndConditions</c> the predicates of H4. Every list keeps file order,
    /// which is the processing order of the hooks. <c>Balance</c>, the calendar date checks and the content
    /// word scan are validation-only and never reach Core.
    /// </summary>
    public sealed class ScenarioData
    {
        public ScenarioData(
            string schema,
            string id,
            string version,
            RequiresData requires,
            string themeHint,
            SettingsData settings,
            CalendarData calendar,
            MapData map,
            IReadOnlyList<PlayerData> players,
            IReadOnlyList<EntryGroupData> entryGroups,
            IReadOnlyList<ArrivalData> arrivals,
            IReadOnlyList<PrePlacedBase> prePlacedBases,
            IReadOnlyList<RegionData> regions,
            IReadOnlyList<string> regionCapSlots,
            IReadOnlyList<SeasonDefinition> seasonTable,
            IReadOnlyList<SeasonRange> seasonSchedule,
            IReadOnlyList<TimedEffectData> timedEffects,
            BalanceData balance,
            EndConditionsData endConditions)
        {
            Schema = schema;
            Id = id;
            Version = version;
            Requires = requires;
            ThemeHint = themeHint;
            Settings = settings;
            Calendar = calendar;
            Map = map;
            Players = players;
            EntryGroups = entryGroups;
            Arrivals = arrivals;
            PrePlacedBases = prePlacedBases;
            Regions = regions;
            RegionCapSlots = regionCapSlots;
            SeasonTable = seasonTable;
            SeasonSchedule = seasonSchedule;
            TimedEffects = timedEffects;
            Balance = balance;
            EndConditions = endConditions;
        }

        public string Schema { get; }

        public string Id { get; }

        public string Version { get; }

        public RequiresData Requires { get; }

        public string ThemeHint { get; }

        public SettingsData Settings { get; }

        public CalendarData Calendar { get; }

        public MapData Map { get; }

        public IReadOnlyList<PlayerData> Players { get; }

        public IReadOnlyList<EntryGroupData> EntryGroups { get; }

        public IReadOnlyList<ArrivalData> Arrivals { get; }

        public IReadOnlyList<PrePlacedBase> PrePlacedBases { get; }

        public IReadOnlyList<RegionData> Regions { get; }

        public IReadOnlyList<string> RegionCapSlots { get; }

        public IReadOnlyList<SeasonDefinition> SeasonTable { get; }

        public IReadOnlyList<SeasonRange> SeasonSchedule { get; }

        public IReadOnlyList<TimedEffectData> TimedEffects { get; }

        public BalanceData Balance { get; }

        public EndConditionsData EndConditions { get; }
    }
}
