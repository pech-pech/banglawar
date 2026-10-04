using System;
using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>End conditions (hook H4): surrender predicates, elimination clocks, the deadline, and the tag counts they rely on.</summary>
    internal static class EndRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            EndConditionsData e = s.EndConditions;
            if (e.Surrender.Count == 0)
            {
                errors.Add("$.end_conditions.surrender", "end.no_victory_path", "at least one surrender rule is needed so the match can be won");
            }

            for (int i = 0; i < e.Surrender.Count; i++)
            {
                CheckSurrender(s, e.Surrender[i], "$.end_conditions.surrender[" + i + "]", errors);
            }

            CheckElimination(e.Elimination, errors);
            CheckDeadline(s, e.Deadline, errors);
            CheckTagCounts(s, e, errors);
        }

        private static void CheckSurrender(ScenarioData s, SurrenderRule rule, string path, ErrorSink errors)
        {
            if (EntryRules.FindPlayer(s, rule.Slot) == null)
            {
                errors.Add(path + ".slot", "end.slot", "slot '" + rule.Slot + "' is not a player");
            }

            if (EntryRules.FindPlayer(s, rule.WinnerSlot) == null)
            {
                errors.Add(path + ".winner_slot", "end.winner", "slot '" + rule.WinnerSlot + "' is not a player");
            }
            else if (rule.WinnerSlot == rule.Slot)
            {
                errors.Add(path + ".winner_slot", "end.winner", "a slot cannot win by its own surrender");
            }

            int nodes = 0;
            int depth = Depth(rule.When, 1, ref nodes);
            if (depth > Vocabulary.MaxPredicateDepth)
            {
                errors.Add(path + ".when", "predicate.depth", "predicate depth " + depth + " exceeds " + Vocabulary.MaxPredicateDepth);
            }

            if (nodes > Vocabulary.MaxPredicateNodes)
            {
                errors.Add(path + ".when", "predicate.nodes", "predicate has " + nodes + " nodes; the limit is " + Vocabulary.MaxPredicateNodes);
            }

            CheckPredicate(s, rule.When, path + ".when", errors);
        }

        private static int Depth(PredicateData p, int level, ref int nodes)
        {
            nodes++;
            int deepest = level;
            foreach (PredicateData c in p.Children)
            {
                deepest = Math.Max(deepest, Depth(c, level + 1, ref nodes));
            }

            return deepest;
        }

        private static void CheckPredicate(ScenarioData s, PredicateData p, string path, ErrorSink errors)
        {
            if (!Vocabulary.Contains(Vocabulary.PredicateKinds, p.Kind))
            {
                errors.Add(path, "predicate.unknown_kind", "unknown predicate kind '" + p.Kind + "'");
                return;
            }

            if ((p.Kind == "all_of" || p.Kind == "any_of") && p.Children.Count == 0)
            {
                errors.Add(path, "predicate.empty", p.Kind + " needs at least one operand");
            }

            if (p.Slot != null && EntryRules.FindPlayer(s, p.Slot) == null)
            {
                errors.Add(path + "." + p.Kind + ".slot", "predicate.slot", "slot '" + p.Slot + "' is not a player");
            }

            if (p.Site != null && !SiteExists(s, p.Site))
            {
                errors.Add(path + "." + p.Kind + ".site", "predicate.site", "site '" + p.Site + "' is not pre-placed in this scenario");
            }

            CheckTags(s, p, path, errors);
            CheckCounts(s, p, path, errors);
            for (int i = 0; i < p.Children.Count; i++)
            {
                CheckPredicate(s, p.Children[i], path + "." + p.Kind + "[" + i + "]", errors);
            }
        }

        private static void CheckTags(ScenarioData s, PredicateData p, string path, ErrorSink errors)
        {
            if (p.Tag != null && CountSitesWithTag(s, null, new[] { p.Tag }) == 0)
            {
                errors.Add(path + "." + p.Kind + ".tag", "predicate.tag", "no site carries the tag '" + p.Tag + "'");
            }

            foreach (string tag in p.TagsAny)
            {
                if (CountSitesWithTag(s, null, new[] { tag }) == 0)
                {
                    errors.Add(path + "." + p.Kind + ".tags_any", "predicate.tag", "no site carries the tag '" + tag + "'");
                }
            }

            if (p.Role != null && !Vocabulary.Contains(Vocabulary.Units, p.Role))
            {
                errors.Add(path + "." + p.Kind + ".role", "predicate.role", "unknown unit role '" + p.Role + "'");
            }
        }

        private static void CheckCounts(ScenarioData s, PredicateData p, string path, ErrorSink errors)
        {
            string body = path + "." + p.Kind;
            if (p.Kind == "holds_sites_count" && p.Tag != null && p.AtLeast.HasValue
                && p.AtLeast.Value > CountSitesWithTag(s, null, new[] { p.Tag }))
            {
                errors.Add(body + ".at_least", "predicate.unreachable",
                    "needs " + p.AtLeast.Value + " '" + p.Tag + "' sites but only " + CountSitesWithTag(s, null, new[] { p.Tag }) + " exist");
            }

            if (p.Kind == "base_count" && p.AtLeast.HasValue == p.AtMost.HasValue)
            {
                errors.Add(body, "predicate.base_count_bounds", "give exactly one of at_least and at_most");
            }

            if (p.Kind == "initial_sites_held_at_most_pct" && p.Slot != null)
            {
                string[] tags = new string[p.TagsAny.Count];
                for (int i = 0; i < tags.Length; i++)
                {
                    tags[i] = p.TagsAny[i];
                }

                if (CountSitesOwnedWithTags(s, p.Slot, tags) == 0)
                {
                    errors.Add(body + ".slot", "predicate.no_initial_sites", "slot '" + p.Slot + "' has no starting sites for this clause to count");
                }
            }
        }

        private static bool SiteExists(ScenarioData s, string id)
        {
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (b.SiteId == id)
                {
                    return true;
                }
            }

            return false;
        }

        private static int CountSitesWithTag(ScenarioData s, string? owner, string[] anyOf)
        {
            return owner == null ? CountSitesOwnedWithTags(s, null, anyOf) : CountSitesOwnedWithTags(s, owner, anyOf);
        }

        private static int CountSitesOwnedWithTags(ScenarioData s, string? owner, string[] anyOf)
        {
            int n = 0;
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (owner != null && b.Owner != owner)
                {
                    continue;
                }

                if (anyOf.Length == 0 || HasAny(b.Tags, anyOf))
                {
                    n++;
                }
            }

            return n;
        }

        private static bool HasAny(IReadOnlyList<string> tags, string[] anyOf)
        {
            foreach (string t in tags)
            {
                if (Array.IndexOf(anyOf, t) >= 0)
                {
                    return true;
                }
            }

            return false;
        }

        private static void CheckElimination(EliminationData el, ErrorSink errors)
        {
            if (el.HomelessTurnsLimit < 1)
            {
                errors.Add("$.end_conditions.elimination.homeless_turns_limit", "end.elimination", "the homeless limit must be at least 1");
            }

            if (el.NoBaseNoFounderGraceTurns > 0 && el.NoBaseNoFounderGraceTurns < el.HomelessTurnsLimit)
            {
                errors.Add("$.end_conditions.elimination.no_base_no_founder_grace_turns", "end.elimination",
                    "a grace shorter than the homeless limit would never decide anything");
            }
        }

        private static void CheckDeadline(ScenarioData s, DeadlineData d, ErrorSink errors)
        {
            if (d.MaxTurns != s.Settings.MaxTurns)
            {
                errors.Add("$.end_conditions.deadline.max_turns", "end.deadline_turns",
                    "deadline " + d.MaxTurns + " differs from settings.max_turns " + s.Settings.MaxTurns);
            }

            if (d.Result == "draw")
            {
                if (d.WinnerSlot != null)
                {
                    errors.Add("$.end_conditions.deadline.winner_slot", "end.deadline_winner", "a draw has no winner_slot");
                }
            }
            else if (d.Result == "winner")
            {
                if (d.WinnerSlot == null || EntryRules.FindPlayer(s, d.WinnerSlot) == null)
                {
                    errors.Add("$.end_conditions.deadline.winner_slot", "end.deadline_winner", "a winner deadline names a player slot");
                }
            }
            else
            {
                errors.Add("$.end_conditions.deadline.result", "end.deadline_result", "result must be 'draw' or 'winner'");
            }

            bool haveEpoch = CalendarMath.TryParseDate(s.Calendar.Epoch, out DateTime epoch);
            ScheduleRules.CheckDate(haveEpoch, epoch, s.Calendar.StepDays, s.Settings.MaxTurns - 1, d.LastTurnContainsDate,
                "$.end_conditions.deadline.last_turn_contains_date", "end.date_mismatch", errors);
        }

        private static void CheckTagCounts(ScenarioData s, EndConditionsData e, ErrorSink errors)
        {
            var declared = new HashSet<string>();
            foreach (TagCount tc in e.TagCounts)
            {
                declared.Add(tc.Tag);
                int actual = CountSitesWithTag(s, null, new[] { tc.Tag });
                if (actual != tc.Count)
                {
                    errors.Add("$.end_conditions.tag_counts." + tc.Tag, "end.tag_count",
                        "declared " + tc.Count + " but " + actual + " sites carry '" + tc.Tag + "'");
                }
            }

            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                foreach (string tag in b.Tags)
                {
                    if (!declared.Contains(tag) && Vocabulary.Contains(Vocabulary.Tags, tag))
                    {
                        errors.Add("$.end_conditions.tag_counts", "end.tag_undeclared", "tag '" + tag + "' is used by " + b.SiteId + " but not declared");
                        declared.Add(tag);
                    }
                }
            }
        }
    }
}
