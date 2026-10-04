using System;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules.EndConditions
{
    /// <summary>Pure evaluation of a predicate against a game state view. Draws no randomness and changes nothing.</summary>
    public sealed class PredicateEvaluator
    {
        private readonly EndConditionConfig _config;

        public PredicateEvaluator(EndConditionConfig config)
        {
            _config = config;
        }

        public bool Evaluate(Predicate predicate, IGameStateView view)
        {
            switch (predicate)
            {
                case AllOf all:
                    return all.Children.Select(c => Evaluate(c, view)).ToList().All(r => r);
                case AnyOf any:
                    return any.Children.Select(c => Evaluate(c, view)).ToList().Any(r => r);
                case Not not:
                    return !Evaluate(not.Child, view);
                case HoldsSite site:
                    return Holds(view, site.Slot, site.Site);
                case HoldsSitesCount count:
                    return _config.Sites.Count(s => s.Tags.Contains(count.Tag, StringComparer.Ordinal) && Holds(view, count.Slot, s.Id)) >= count.AtLeast;
                case InitialSitesHeldAtMostPct initial:
                    return InitialHeldAtMost(view, initial);
                case BaseCount bases:
                    return BaseCountMatches(view, bases);
                case TurnAtLeast turn:
                    return view.Turn >= turn.Turn;
                case HasBase hasBase:
                    return view.Bases.Any(b => b.Owner == hasBase.Slot);
                case HasUnitRole role:
                    return view.Units.Any(u => u.Owner == role.Slot && u.Role == role.Role);
                default:
                    throw new ArgumentException("unknown predicate kind " + predicate.GetType().Name);
            }
        }

        private static bool Holds(IGameStateView view, int slot, string site)
        {
            return view.Bases.Any(b => b.Owner == slot && string.Equals(b.SiteId, site, StringComparison.Ordinal));
        }

        private bool InitialHeldAtMost(IGameStateView view, InitialSitesHeldAtMostPct p)
        {
            var initial = _config.InitialSites(p.Slot, p.TagsAny);
            if (initial.Count == 0)
            {
                return false;
            }

            int held = initial.Count(id => Holds(view, p.Slot, id));
            return (long)held * 100 <= (long)p.AtMostPct * initial.Count;
        }

        private static bool BaseCountMatches(IGameStateView view, BaseCount p)
        {
            int count = view.Bases.Count(b => b.Owner == p.Slot);
            return (p.AtLeast == null || count >= p.AtLeast.Value) && (p.AtMost == null || count <= p.AtMost.Value);
        }
    }
}
