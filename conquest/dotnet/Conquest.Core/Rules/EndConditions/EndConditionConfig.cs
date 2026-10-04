using System;
using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Rules.EndConditions
{
    public enum DeadlineResult
    {
        None = 0,
        Draw = 1,
    }

    /// <summary>The <c>victory</c> section of the ruleset (spec 06 H4). Defaults are the neutral values of GDD 12.</summary>
    public sealed class VictoryRules
    {
        public VictoryRules(
            int? homelessTurnsLimit = 15,
            int graceTurns = 0,
            DeadlineResult deadlineResult = DeadlineResult.None,
            bool scenarioConditions = false,
            int maxDepth = 4,
            int maxNodes = 32)
        {
            HomelessTurnsLimit = homelessTurnsLimit;
            GraceTurns = graceTurns;
            DeadlineResult = deadlineResult;
            ScenarioConditions = scenarioConditions;
            MaxDepth = maxDepth;
            MaxNodes = maxNodes;
        }

        /// <summary>Consecutive end-of-turn checks with no base before a faction is eliminated; null = never.</summary>
        public int? HomelessTurnsLimit { get; }

        /// <summary>0 = a faction with no base and no founder is out at once; N = out after N consecutive such checks.</summary>
        public int GraceTurns { get; }

        public DeadlineResult DeadlineResult { get; }

        public bool ScenarioConditions { get; }

        public int MaxDepth { get; }

        public int MaxNodes { get; }
    }

    /// <summary>A pre-placed site as the end conditions see it: id, starting owner and objective tags.</summary>
    public sealed class SiteInfo
    {
        public SiteInfo(string id, int owner, IEnumerable<string> tags)
        {
            Id = id;
            Owner = owner;
            Tags = Frozen.List(tags);
        }

        public string Id { get; }

        public int Owner { get; }

        public IReadOnlyList<string> Tags { get; }
    }

    public sealed class SurrenderEntry
    {
        public SurrenderEntry(int slot, Predicate when)
        {
            Slot = slot;
            When = when;
        }

        public int Slot { get; }

        public Predicate When { get; }
    }

    /// <summary>The scenario's declared number of sites per objective tag, asserted at load.</summary>
    public sealed class TagCount
    {
        public TagCount(string tag, int count)
        {
            Tag = tag;
            Count = count;
        }

        public string Tag { get; }

        public int Count { get; }
    }

    /// <summary>
    /// Everything the end-of-turn check needs, fixed at scenario load (spec 06 H4): the victory rules, the pre-placed sites
    /// with their starting owners, the surrender entries, the deadline and the declared tag counts.
    /// </summary>
    public sealed class EndConditionConfig
    {
        public EndConditionConfig(
            VictoryRules victory,
            IEnumerable<SiteInfo> sites,
            IEnumerable<SurrenderEntry> surrenders,
            int deadlineMaxTurns,
            IEnumerable<TagCount> tagCounts)
        {
            Victory = victory;
            Sites = Frozen.List(sites);
            Surrenders = Frozen.List(surrenders);
            DeadlineMaxTurns = deadlineMaxTurns;
            TagCounts = Frozen.List(tagCounts);
        }

        public VictoryRules Victory { get; }

        public IReadOnlyList<SiteInfo> Sites { get; }

        public IReadOnlyList<SurrenderEntry> Surrenders { get; }

        public int DeadlineMaxTurns { get; }

        public IReadOnlyList<TagCount> TagCounts { get; }

        /// <summary>The ids of the slot's starting sites, in scenario order, optionally narrowed to sites with one of the tags.</summary>
        public IReadOnlyList<string> InitialSites(int slot, IReadOnlyList<string>? tagsAny)
        {
            return Frozen.List(Sites
                .Where(s => s.Owner == slot && (tagsAny == null || s.Tags.Any(t => tagsAny.Contains(t, StringComparer.Ordinal))))
                .Select(s => s.Id));
        }

        public int InitialSiteCount(int slot, IReadOnlyList<string>? tagsAny)
        {
            return InitialSites(slot, tagsAny).Count;
        }

        public IReadOnlyList<RuleIssue> Validate(int slotCount)
        {
            return EndConditionValidator.Validate(this, slotCount);
        }
    }
}
