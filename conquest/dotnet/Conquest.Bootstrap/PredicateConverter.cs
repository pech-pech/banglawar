using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Rules.EndConditions;

namespace Conquest.Bootstrap
{
    /// <summary>Scenario predicate data to the core's <see cref="Predicate"/> tree (spec 06 H4 grammar).</summary>
    internal static class PredicateConverter
    {
        public static Predicate? Convert(PredicateData p, string path, List<BootError> errors)
        {
            switch (p.Kind)
            {
                case "all_of": return Children(p, path, errors, list => new AllOf(list));
                case "any_of": return Children(p, path, errors, list => new AnyOf(list));
                case "not": return Negate(p, path, errors);
                case "holds_site": return With(p, path, errors, s => new HoldsSite(s, p.Site ?? string.Empty));
                case "holds_sites_count": return With(p, path, errors, s => new HoldsSitesCount(s, p.Tag ?? string.Empty, p.AtLeast ?? 0));
                case "initial_sites_held_at_most_pct":
                    return With(p, path, errors, s => new InitialSitesHeldAtMostPct(s, p.AtMostPct ?? 0, p.TagsAny.Count == 0 ? null : p.TagsAny));
                case "base_count": return With(p, path, errors, s => new BaseCount(s, p.AtLeast, p.AtMost));
                case "turn_at_least": return new TurnAtLeast(p.Turn ?? 0);
                case "has_base": return With(p, path, errors, s => new HasBase(s));
                case "has_unit_role": return Role(p, path, errors);
                default:
                    errors.Add(new BootError(path, "err.boot_predicate", "unknown predicate kind '" + p.Kind + "'"));
                    return null;
            }
        }

        private static Predicate? Children(PredicateData p, string path, List<BootError> errors, System.Func<List<Predicate>, Predicate> make)
        {
            var list = new List<Predicate>();
            for (int i = 0; i < p.Children.Count; i++)
            {
                Predicate? child = Convert(p.Children[i], path + "/" + i, errors);
                if (child == null)
                {
                    return null;
                }

                list.Add(child);
            }

            return make(list);
        }

        private static Predicate? Negate(PredicateData p, string path, List<BootError> errors)
        {
            Predicate? child = p.Children.Count == 1 ? Convert(p.Children[0], path + "/0", errors) : null;
            return child == null ? null : new Not(child);
        }

        private static Predicate? With(PredicateData p, string path, List<BootError> errors, System.Func<int, Predicate> make)
        {
            if (!SlotNames.TryParse(p.Slot, out int slot))
            {
                errors.Add(new BootError(path, "err.boot_slot", "bad slot '" + p.Slot + "'"));
                return null;
            }

            return make(slot);
        }

        private static Predicate? Role(PredicateData p, string path, List<BootError> errors)
        {
            if (p.Role == null || !RoleIds.TryParse(p.Role, out UnitRole role))
            {
                errors.Add(new BootError(path, "err.boot_role", "bad unit role '" + p.Role + "'"));
                return null;
            }

            return With(p, path, errors, s => new HasUnitRole(s, role));
        }
    }
}
