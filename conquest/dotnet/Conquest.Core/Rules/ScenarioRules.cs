using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>One start kit: the stock of the first base a slot founds.</summary>
    public sealed class SlotKit
    {
        public SlotKit(int slot, ResourceVector stock)
        {
            Slot = slot;
            Stock = stock;
        }

        public int Slot { get; }

        public ResourceVector Stock { get; }
    }

    /// <summary><see cref="IScenarioRules"/> built from plain lists; no dictionary, so iteration order is never an issue.</summary>
    public sealed class ScenarioRules : IScenarioRules
    {
        private readonly IReadOnlyList<string> _protectedSites;
        private readonly IReadOnlyList<SlotKit> _kits;
        private readonly bool _captureLegal;

        public ScenarioRules(IEnumerable<string>? protectedSites = null, IEnumerable<SlotKit>? kits = null, bool captureLegal = true)
        {
            _protectedSites = Frozen.List(protectedSites);
            _kits = Frozen.List(kits);
            _captureLegal = captureLegal;
        }

        public static ScenarioRules Default { get; } = new ScenarioRules();

        public bool RaidCanDestroy(string siteId)
        {
            for (int i = 0; i < _protectedSites.Count; i++)
            {
                if (string.Equals(_protectedSites[i], siteId, StringComparison.Ordinal))
                {
                    return false;
                }
            }

            return true;
        }

        public bool CaptureLegal(int attackerSlot, int defenderSlot) => _captureLegal;

        public ResourceVector? StartKit(int slot)
        {
            for (int i = 0; i < _kits.Count; i++)
            {
                if (_kits[i].Slot == slot)
                {
                    return _kits[i].Stock;
                }
            }

            return null;
        }
    }

    /// <summary><see cref="IArrivalPlan"/> from lists: arrivals keep scenario list order, groups keep their file order.</summary>
    public sealed class ArrivalPlan : IArrivalPlan
    {
        public ArrivalPlan(IEnumerable<ArrivalSpec>? arrivals = null, IEnumerable<EntryGroup>? groups = null, int maxDeferTurns = -1)
        {
            Arrivals = Frozen.List(arrivals);
            Groups = Frozen.List(groups);
            MaxDeferTurns = maxDeferTurns;
        }

        public static ArrivalPlan Empty { get; } = new ArrivalPlan();

        public int MaxDeferTurns { get; }

        public IReadOnlyList<ArrivalSpec> Arrivals { get; }

        public IReadOnlyList<EntryGroup> Groups { get; }
    }
}
