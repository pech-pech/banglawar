using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Bootstrap
{
    /// <summary>Arrival schedule, entry groups and scenario-owned numbers (spec 06 H1, H2 flags, start kits).</summary>
    internal static class PlanBuilder
    {
        public static ArrivalPlan Arrivals(ScenarioData s, List<BootError> errors)
        {
            var groups = new List<EntryGroup>();
            foreach (EntryGroupData g in s.EntryGroups)
            {
                if (!SlotNames.TryParse(g.Slot, out int slot))
                {
                    errors.Add(new BootError("/entry_groups/" + g.Id, "err.boot_slot", "bad slot '" + g.Slot + "'"));
                    continue;
                }

                var tiles = new List<TileCoord>();
                foreach (TilePoint t in g.Tiles)
                {
                    tiles.Add(new TileCoord(t.X, t.Y));
                }

                groups.Add(new EntryGroup(g.Id, slot, ImmArray<TileCoord>.From(tiles)));
            }

            var arrivals = new List<ArrivalSpec>();
            for (int i = 0; i < s.Arrivals.Count; i++)
            {
                ArrivalSpec? spec = Arrival(s.Arrivals[i], i, errors);
                if (spec != null)
                {
                    arrivals.Add(spec);
                }
            }

            return new ArrivalPlan(arrivals, groups);
        }

        private static ArrivalSpec? Arrival(ArrivalData a, int index, List<BootError> errors)
        {
            string path = "/arrivals/" + index;
            if (!SlotNames.TryParse(a.Slot, out int slot))
            {
                errors.Add(new BootError(path, "err.boot_slot", "bad slot '" + a.Slot + "'"));
                return null;
            }

            var units = new List<ArrivalUnit>();
            foreach (UnitGroup u in a.Units)
            {
                if (!RoleIds.TryParse(u.Role, out UnitRole role))
                {
                    errors.Add(new BootError(path + "/units", "err.boot_role", "bad unit role '" + u.Role + "'"));
                    return null;
                }

                units.Add(new ArrivalUnit(role, u.Level, u.Count));
            }

            return new ArrivalSpec(index, a.Turn, slot, a.EntryGroup, ImmArray<ArrivalUnit>.From(units), a.AttachToFirstCommander, a.ViaPatron);
        }

        public static ScenarioRules Scenario(ScenarioData s, List<BootError> errors)
        {
            var protectedSites = new List<string>();
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (!b.RaidCanDestroy)
                {
                    protectedSites.Add(b.SiteId);
                }
            }

            var kits = new List<SlotKit>();
            foreach (PlayerData p in s.Players)
            {
                if (p.StartKit != null && SlotNames.TryParse(p.Slot, out int slot))
                {
                    kits.Add(new SlotKit(slot, BaseBuilder.Stock(p.StartKit, 0, true)));
                }
            }

            return new ScenarioRules(protectedSites, kits);
        }
    }
}
