using System;
using System.Collections.Generic;
using System.Linq;

namespace Conquest.Presentation
{
    /// <summary>One unit of a stack as the view sees it.</summary>
    public readonly struct StackMember
    {
        public StackMember(int id, int owner, BannerSizeClass sizeClass)
        {
            Id = id;
            Owner = owner;
            SizeClass = sizeClass;
        }

        public int Id { get; }

        public int Owner { get; }

        public BannerSizeClass SizeClass { get; }

        public UnitRef Ref => new UnitRef(Id, Owner);
    }

    /// <summary>
    /// Rules for several units on one tile, so every unit stays selectable and countable:
    /// the lead (shown in front) is the selected unit when one is on the tile, otherwise the largest size class,
    /// then the lowest id; the display and click order is the lead first, then ascending ids; clicking the selected
    /// lead again selects the next unit of the stack (ascending ids, wrapping); a click on the count badge (or a
    /// double click) selects every friendly unit of the stack.
    /// </summary>
    public static class UnitStack
    {
        public static int LeadOf(IReadOnlyList<StackMember> members, SelectionModel selection)
        {
            if (members == null) throw new ArgumentNullException(nameof(members));
            if (selection == null) throw new ArgumentNullException(nameof(selection));
            if (members.Count == 0) return SelectionModel.NoUnit;
            if (members.Any(m => m.Id == selection.PrimaryId)) return selection.PrimaryId;
            int selected = members.Where(m => selection.IsSelected(m.Id)).Select(m => m.Id).DefaultIfEmpty(SelectionModel.NoUnit).Min();
            if (selected != SelectionModel.NoUnit) return selected;
            return members.OrderByDescending(m => (int)m.SizeClass).ThenBy(m => m.Id).First().Id;
        }

        /// <summary>The lead first, then the others in ascending id order.</summary>
        public static IReadOnlyList<StackMember> DisplayOrder(IReadOnlyList<StackMember> members, int leadId)
        {
            if (members == null) throw new ArgumentNullException(nameof(members));
            var ordered = new List<StackMember>(members.Count);
            ordered.AddRange(members.Where(m => m.Id == leadId));
            ordered.AddRange(members.Where(m => m.Id != leadId).OrderBy(m => m.Id));
            return ordered;
        }

        /// <summary>The unit after <paramref name="currentId"/> in ascending id order, wrapping; the first when current is not in the stack.</summary>
        public static int NextAfter(IReadOnlyList<int> ids, int currentId)
        {
            if (ids == null) throw new ArgumentNullException(nameof(ids));
            if (ids.Count == 0) return SelectionModel.NoUnit;
            int[] sorted = ids.OrderBy(id => id).ToArray();
            foreach (int id in sorted)
            {
                if (id > currentId) return id;
            }

            return sorted[0];
        }

        /// <summary>
        /// What a plain click on a banner of a stack does. Re-clicking the only selected unit of a stack of two or
        /// more cycles to the next one; any other plain or additive click is the ordinary selection click.
        /// </summary>
        public static SelectionModel Click(SelectionModel selection, IReadOnlyList<StackMember> stack, UnitRef clicked, bool additive)
        {
            if (selection == null) throw new ArgumentNullException(nameof(selection));
            if (stack == null) throw new ArgumentNullException(nameof(stack));
            bool cycles = !additive && stack.Count > 1 && selection.SelectedIds.Count == 1 && selection.PrimaryId == clicked.Id
                && stack.Any(m => m.Id == clicked.Id);
            if (!cycles) return selection.Click(clicked, additive);
            int next = NextAfter(stack.Select(m => m.Id).ToArray(), clicked.Id);
            StackMember member = stack.First(m => m.Id == next);
            return selection.Click(member.Ref, false);
        }

        /// <summary>Select the whole stack: every friendly unit (up to the group cap); an opposing stack inspects its lead.</summary>
        public static SelectionModel SelectAll(SelectionModel selection, IReadOnlyList<StackMember> stack, int leadId)
        {
            if (selection == null) throw new ArgumentNullException(nameof(selection));
            if (stack == null) throw new ArgumentNullException(nameof(stack));
            return selection.SelectGroup(stack.Select(m => m.Ref).ToArray(), leadId);
        }
    }
}
