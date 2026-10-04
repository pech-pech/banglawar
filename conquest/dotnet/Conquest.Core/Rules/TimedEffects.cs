using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    public enum InFlightPolicy
    {
        CancelRefund = 0,
        Deliver = 1,
    }

    public enum PanicScope
    {
        DefendingBase = 0,
        AllBattles = 1,
    }

    /// <summary>One timed faction effect (spec 06 H5): a window of turns, a target slot, and what changes.</summary>
    public sealed class TimedEffectEntry
    {
        public TimedEffectEntry(
            string id,
            int fromTurn,
            int? toTurn,
            int targetSlot,
            bool announce = false,
            bool patronLinkCut = false,
            InFlightPolicy inFlight = InFlightPolicy.CancelRefund,
            int panicPermille = 0,
            PanicScope scope = PanicScope.DefendingBase)
        {
            Id = id;
            FromTurn = fromTurn;
            ToTurn = toTurn;
            TargetSlot = targetSlot;
            Announce = announce;
            PatronLinkCut = patronLinkCut;
            InFlight = inFlight;
            PanicPermille = panicPermille;
            Scope = scope;
        }

        public string Id { get; }

        public int FromTurn { get; }

        public int? ToTurn { get; }

        public int TargetSlot { get; }

        public bool Announce { get; }

        public bool PatronLinkCut { get; }

        public InFlightPolicy InFlight { get; }

        public int PanicPermille { get; }

        public PanicScope Scope { get; }

        public bool IsActive(int turn)
        {
            return turn >= FromTurn && (ToTurn == null || turn <= ToTurn.Value);
        }
    }

    /// <summary>
    /// Spec 06 H5. <c>active(T)</c> is a pure function of the entries and the turn; nothing is stored in state. A cut patron
    /// link refuses new patron orders, handles orders in flight, and suppresses patron arrivals; the panic modifier is an
    /// integer per-mille added to a unit's panic chance in battle.
    /// </summary>
    public sealed class TimedEffectSet : ITimedEffects
    {
        private readonly int _panicMin;
        private readonly int _panicMax;

        public TimedEffectSet(bool enabled, IEnumerable<TimedEffectEntry> entries, int panicMin = -300, int panicMax = 300)
        {
            Enabled = enabled;
            Entries = Frozen.List(entries);
            _panicMin = panicMin;
            _panicMax = panicMax;
        }

        public static TimedEffectSet None { get; } = new TimedEffectSet(false, new TimedEffectEntry[0]);

        public bool Enabled { get; }

        public IReadOnlyList<TimedEffectEntry> Entries { get; }

        public bool PatronLinkCut(int slot, int turn)
        {
            return Active(slot, turn).Any(e => e.PatronLinkCut);
        }

        /// <summary>What happens to a patron delivery that is due while the link is cut; null when the link is up.</summary>
        public InFlightPolicy? InFlight(int slot, int turn)
        {
            TimedEffectEntry? cut = Active(slot, turn).FirstOrDefault(e => e.PatronLinkCut);
            return cut?.InFlight;
        }

        public int PanicModifier(int slot, int turn, bool defendingBase)
        {
            return Active(slot, turn)
                .Where(e => e.Scope == PanicScope.AllBattles || defendingBase)
                .Sum(e => e.PanicPermille);
        }

        /// <summary>Order validation: patron orders are refused with <c>err.patron_link_cut</c> while the link is cut.</summary>
        public string? OrderGate(int slot, int turn, bool isPatronOrder)
        {
            return isPatronOrder && PatronLinkCut(slot, turn) ? "err.patron_link_cut" : null;
        }

        public bool ArrivalSuppressed(int slot, int turn, bool viaPatron)
        {
            return viaPatron && PatronLinkCut(slot, turn);
        }

        /// <summary>Public <c>ev.timed_effect_started</c> events for entries that start on <paramref name="turn"/> and ask to be announced.</summary>
        public IReadOnlyList<TimedEffectStarted> Announcements(int turn)
        {
            if (!Enabled)
            {
                return Frozen.List<TimedEffectStarted>(null);
            }

            return Frozen.List(Entries.Where(e => e.Announce && e.FromTurn == turn).Select(e => new TimedEffectStarted(e.Id, e.TargetSlot)));
        }

        public IReadOnlyList<RuleIssue> Validate(int slotCount)
        {
            List<RuleIssue> issues = new List<RuleIssue>();
            if (!Enabled)
            {
                if (Entries.Count > 0)
                {
                    issues.Add(new RuleIssue("err.hook_disabled", "/hooks/timed_effects/enabled"));
                }

                return Frozen.List(issues);
            }

            for (int i = 0; i < Entries.Count; i++)
            {
                TimedEffectEntry e = Entries[i];
                string path = "/timed_effects/" + i;
                if (Entries.Take(i).Any(o => string.Equals(o.Id, e.Id, StringComparison.Ordinal)))
                {
                    issues.Add(new RuleIssue("err.timed_duplicate", path));
                }

                if (e.TargetSlot < 0 || e.TargetSlot >= slotCount)
                {
                    issues.Add(new RuleIssue("err.timed_slot", path));
                }

                if (e.ToTurn != null && e.ToTurn.Value < e.FromTurn)
                {
                    issues.Add(new RuleIssue("err.timed_range", path));
                }

                if (e.PanicPermille < _panicMin || e.PanicPermille > _panicMax)
                {
                    issues.Add(new RuleIssue("err.timed_bounds", path));
                }
            }

            return Frozen.List(issues);
        }

        private IEnumerable<TimedEffectEntry> Active(int slot, int turn)
        {
            return Enabled ? Entries.Where(e => e.TargetSlot == slot && e.IsActive(turn)) : Enumerable.Empty<TimedEffectEntry>();
        }
    }
}
