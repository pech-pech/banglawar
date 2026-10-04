using System;
using System.Collections.Generic;
using System.Linq;

namespace Conquest.Core.Rules.EndConditions
{
    /// <summary>Load-time checks of the end-condition data (validation step 5, spec 06 H4): errors, never silent fixes.</summary>
    internal static class EndConditionValidator
    {
        public static IReadOnlyList<RuleIssue> Validate(EndConditionConfig config, int slotCount)
        {
            List<RuleIssue> issues = new List<RuleIssue>();
            CheckVictory(config, issues);
            for (int i = 0; i < config.Surrenders.Count; i++)
            {
                SurrenderEntry entry = config.Surrenders[i];
                string path = "/end_conditions/surrender/" + i;
                if (entry.Slot < 0 || entry.Slot >= slotCount)
                {
                    issues.Add(new RuleIssue("err.surrender_slot", path));
                }

                int nodes = 0;
                CheckPredicate(config, entry.When, slotCount, path + "/when", 1, ref nodes, issues);
                if (nodes > config.Victory.MaxNodes)
                {
                    issues.Add(new RuleIssue("err.predicate_nodes", path + "/when"));
                }
            }

            foreach (TagCount tc in config.TagCounts)
            {
                int actual = config.Sites.Count(s => s.Tags.Contains(tc.Tag, StringComparer.Ordinal));
                if (actual != tc.Count)
                {
                    issues.Add(new RuleIssue("err.tag_count", "/end_conditions/tag_counts/" + tc.Tag));
                }
            }

            return Frozen.List(issues);
        }

        private static void CheckVictory(EndConditionConfig config, List<RuleIssue> issues)
        {
            VictoryRules v = config.Victory;
            if ((v.HomelessTurnsLimit != null && v.HomelessTurnsLimit.Value < 1) || v.GraceTurns < 0 || config.DeadlineMaxTurns < 0)
            {
                issues.Add(new RuleIssue("err.victory_range", "/victory"));
            }

            if (config.DeadlineMaxTurns > 0 && v.DeadlineResult == DeadlineResult.None)
            {
                issues.Add(new RuleIssue("err.deadline_result", "/victory/deadline_result"));
            }

            if (config.Surrenders.Count > 0 && !v.ScenarioConditions)
            {
                issues.Add(new RuleIssue("err.hook_disabled", "/victory/scenario_conditions"));
            }
        }

        private static void CheckPredicate(
            EndConditionConfig config, Predicate p, int slotCount, string path, int depth, ref int nodes, List<RuleIssue> issues)
        {
            nodes++;
            if (depth > config.Victory.MaxDepth)
            {
                issues.Add(new RuleIssue("err.predicate_depth", path));
                return;
            }

            switch (p)
            {
                case AllOf all:
                    CheckChildren(config, all.Children, slotCount, path, depth, ref nodes, issues);
                    break;
                case AnyOf any:
                    CheckChildren(config, any.Children, slotCount, path, depth, ref nodes, issues);
                    break;
                case Not not:
                    CheckPredicate(config, not.Child, slotCount, path + "/not", depth + 1, ref nodes, issues);
                    break;
                case HoldsSite site:
                    CheckSlot(site.Slot, slotCount, path, issues);
                    CheckSite(config, site.Site, path, issues);
                    break;
                case HoldsSitesCount count:
                    CheckSlot(count.Slot, slotCount, path, issues);
                    CheckTag(config, count.Tag, path, issues);
                    break;
                case InitialSitesHeldAtMostPct initial:
                    CheckInitial(config, initial, slotCount, path, issues);
                    break;
                case BaseCount bases:
                    CheckSlot(bases.Slot, slotCount, path, issues);
                    break;
                case HasBase hasBase:
                    CheckSlot(hasBase.Slot, slotCount, path, issues);
                    break;
                case HasUnitRole role:
                    CheckSlot(role.Slot, slotCount, path, issues);
                    break;
            }
        }

        private static void CheckChildren(
            EndConditionConfig config, IReadOnlyList<Predicate> children, int slotCount, string path, int depth, ref int nodes, List<RuleIssue> issues)
        {
            for (int i = 0; i < children.Count; i++)
            {
                CheckPredicate(config, children[i], slotCount, path + "/" + i, depth + 1, ref nodes, issues);
            }
        }

        private static void CheckInitial(EndConditionConfig config, InitialSitesHeldAtMostPct p, int slotCount, string path, List<RuleIssue> issues)
        {
            CheckSlot(p.Slot, slotCount, path, issues);
            if (p.AtMostPct < 0 || p.AtMostPct > 100)
            {
                issues.Add(new RuleIssue("err.predicate_range", path));
            }

            if (p.TagsAny != null)
            {
                foreach (string tag in p.TagsAny)
                {
                    CheckTag(config, tag, path, issues);
                }
            }

            if (config.InitialSiteCount(p.Slot, p.TagsAny) == 0)
            {
                issues.Add(new RuleIssue("err.initial_sites_empty", path));
            }
        }

        private static void CheckSlot(int slot, int slotCount, string path, List<RuleIssue> issues)
        {
            if (slot < 0 || slot >= slotCount)
            {
                issues.Add(new RuleIssue("err.predicate_slot", path));
            }
        }

        private static void CheckSite(EndConditionConfig config, string site, string path, List<RuleIssue> issues)
        {
            if (!config.Sites.Any(s => string.Equals(s.Id, site, StringComparison.Ordinal)))
            {
                issues.Add(new RuleIssue("err.predicate_site", path));
            }
        }

        private static void CheckTag(EndConditionConfig config, string tag, string path, List<RuleIssue> issues)
        {
            if (!config.Sites.Any(s => s.Tags.Contains(tag, StringComparer.Ordinal)))
            {
                issues.Add(new RuleIssue("err.predicate_tag", path));
            }
        }
    }
}
