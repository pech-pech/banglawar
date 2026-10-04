using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules.EndConditions
{
    /// <summary>
    /// The predicate grammar shared by surrender conditions and mission goals (spec 06 H4). Slots are slot indices
    /// (0 = f1); sites and tags are opaque scenario ids. Predicates are pure data; <see cref="PredicateEvaluator"/> reads them.
    /// </summary>
    public abstract class Predicate
    {
    }

    public sealed class AllOf : Predicate
    {
        public AllOf(IEnumerable<Predicate> children)
        {
            Children = Frozen.List(children);
        }

        public IReadOnlyList<Predicate> Children { get; }
    }

    public sealed class AnyOf : Predicate
    {
        public AnyOf(IEnumerable<Predicate> children)
        {
            Children = Frozen.List(children);
        }

        public IReadOnlyList<Predicate> Children { get; }
    }

    public sealed class Not : Predicate
    {
        public Not(Predicate child)
        {
            Child = child;
        }

        public Predicate Child { get; }
    }

    /// <summary>A base with that site id exists and is owned by the slot.</summary>
    public sealed class HoldsSite : Predicate
    {
        public HoldsSite(int slot, string site)
        {
            Slot = slot;
            Site = site;
        }

        public int Slot { get; }

        public string Site { get; }
    }

    /// <summary>The slot owns at least <c>AtLeast</c> bases whose site carries the tag.</summary>
    public sealed class HoldsSitesCount : Predicate
    {
        public HoldsSitesCount(int slot, string tag, int atLeast)
        {
            Slot = slot;
            Tag = tag;
            AtLeast = atLeast;
        }

        public int Slot { get; }

        public string Tag { get; }

        public int AtLeast { get; }
    }

    /// <summary>
    /// <c>held_initial * 100 &lt;= at_most_pct * initial_site_count</c>, counting only the slot's starting sites (optionally
    /// those with one of <c>TagsAny</c>). Bases founded later count in neither number.
    /// </summary>
    public sealed class InitialSitesHeldAtMostPct : Predicate
    {
        public InitialSitesHeldAtMostPct(int slot, int atMostPct, IEnumerable<string>? tagsAny)
        {
            Slot = slot;
            AtMostPct = atMostPct;
            TagsAny = tagsAny == null ? null : Frozen.List(tagsAny);
        }

        public int Slot { get; }

        public int AtMostPct { get; }

        public IReadOnlyList<string>? TagsAny { get; }
    }

    public sealed class BaseCount : Predicate
    {
        public BaseCount(int slot, int? atLeast, int? atMost)
        {
            Slot = slot;
            AtLeast = atLeast;
            AtMost = atMost;
        }

        public int Slot { get; }

        public int? AtLeast { get; }

        public int? AtMost { get; }
    }

    public sealed class TurnAtLeast : Predicate
    {
        public TurnAtLeast(int turn)
        {
            Turn = turn;
        }

        public int Turn { get; }
    }

    public sealed class HasBase : Predicate
    {
        public HasBase(int slot)
        {
            Slot = slot;
        }

        public int Slot { get; }
    }

    public sealed class HasUnitRole : Predicate
    {
        public HasUnitRole(int slot, UnitRole role)
        {
            Slot = slot;
            Role = role;
        }

        public int Slot { get; }

        public UnitRole Role { get; }
    }
}
