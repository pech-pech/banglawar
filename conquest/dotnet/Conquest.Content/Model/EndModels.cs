using System.Collections.Generic;

namespace Conquest.Content.Model
{
    /// <summary>
    /// One node of a surrender predicate (hook H4 grammar). Exactly the fields that belong to <see cref="Kind"/>
    /// are set; the rest are null/empty. Core maps this tree onto its predicate evaluator.
    /// </summary>
    public sealed class PredicateData
    {
        public PredicateData(
            string kind,
            string? slot = null,
            string? site = null,
            string? tag = null,
            int? atLeast = null,
            int? atMost = null,
            int? atMostPct = null,
            int? turn = null,
            string? role = null,
            IReadOnlyList<string>? tagsAny = null,
            IReadOnlyList<PredicateData>? children = null)
        {
            Kind = kind;
            Slot = slot;
            Site = site;
            Tag = tag;
            AtLeast = atLeast;
            AtMost = atMost;
            AtMostPct = atMostPct;
            Turn = turn;
            Role = role;
            TagsAny = tagsAny ?? new List<string>();
            Children = children ?? new List<PredicateData>();
        }

        public string Kind { get; }

        public string? Slot { get; }

        public string? Site { get; }

        public string? Tag { get; }

        public int? AtLeast { get; }

        public int? AtMost { get; }

        public int? AtMostPct { get; }

        public int? Turn { get; }

        public string? Role { get; }

        public IReadOnlyList<string> TagsAny { get; }

        /// <summary>Operands of all_of / any_of; exactly one for not.</summary>
        public IReadOnlyList<PredicateData> Children { get; }
    }

    public sealed class SurrenderRule
    {
        public SurrenderRule(string slot, string winnerSlot, PredicateData when)
        {
            Slot = slot;
            WinnerSlot = winnerSlot;
            When = when;
        }

        /// <summary>The slot that leaves play when <see cref="When"/> holds.</summary>
        public string Slot { get; }

        /// <summary>The slot that wins when this rule fires.</summary>
        public string WinnerSlot { get; }

        public PredicateData When { get; }
    }

    public sealed class EliminationData
    {
        public EliminationData(int homelessTurnsLimit, int noBaseNoFounderGraceTurns)
        {
            HomelessTurnsLimit = homelessTurnsLimit;
            NoBaseNoFounderGraceTurns = noBaseNoFounderGraceTurns;
        }

        public int HomelessTurnsLimit { get; }

        public int NoBaseNoFounderGraceTurns { get; }
    }

    public sealed class DeadlineData
    {
        public DeadlineData(int maxTurns, string result, string? winnerSlot, string? lastTurnContainsDate)
        {
            MaxTurns = maxTurns;
            Result = result;
            WinnerSlot = winnerSlot;
            LastTurnContainsDate = lastTurnContainsDate;
        }

        public int MaxTurns { get; }

        /// <summary>"draw" or "winner".</summary>
        public string Result { get; }

        /// <summary>Set only when <see cref="Result"/> is "winner".</summary>
        public string? WinnerSlot { get; }

        public string? LastTurnContainsDate { get; }
    }

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

    public sealed class EndConditionsData
    {
        public EndConditionsData(
            IReadOnlyList<SurrenderRule> surrender,
            EliminationData elimination,
            DeadlineData deadline,
            IReadOnlyList<TagCount> tagCounts)
        {
            Surrender = surrender;
            Elimination = elimination;
            Deadline = deadline;
            TagCounts = tagCounts;
        }

        public IReadOnlyList<SurrenderRule> Surrender { get; }

        public EliminationData Elimination { get; }

        public DeadlineData Deadline { get; }

        public IReadOnlyList<TagCount> TagCounts { get; }
    }
}
