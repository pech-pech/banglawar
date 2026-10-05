using System.Collections.Generic;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>
    /// The enemy bases a side has seen and no longer sees (GDD 5.2 intel memory): position, owner, level and the turn it was
    /// last seen, never a live reading. Seeded from the state's own intel records; <see cref="Observe"/> returns a new
    /// memory that refreshes records for bases in sight and forgets one whose tile is in sight with no such base standing there.
    /// Kept by the view, not saved. Immutable.
    /// </summary>
    public sealed class IntelMemory
    {
        public static readonly IntelMemory Empty = new IntelMemory(new List<IntelRecord>());

        private readonly List<IntelRecord> records;

        private IntelMemory(List<IntelRecord> records)
        {
            this.records = records;
        }

        public IReadOnlyList<IntelRecord> Records => records;

        public IntelMemory Observe(FogView fog, GameState state)
        {
            var next = new List<IntelRecord>();
            for (int i = 0; i < records.Count; i++) Merge(next, records[i], fog.Viewer);
            for (int i = 0; i < state.Intel.Count; i++) Merge(next, state.Intel[i], fog.Viewer);
            for (int i = next.Count - 1; i >= 0; i--)
            {
                if (fog.IsVisible(next[i].Pos)) next.RemoveAt(i);
            }

            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                Base b = state.BaseTable[i];
                if (b.Owner == fog.Viewer || !fog.IsVisible(b.Pos)) continue;
                next.Add(new IntelRecord(fog.Viewer, b.Id, b.SiteId, b.Pos, b.Owner, b.CoreLevel, -1, state.Turn));
            }

            next.Sort((a, c) => a.BaseId.CompareTo(c.BaseId));
            return new IntelMemory(next);
        }

        /// <summary>Remembered bases whose tile is not in sight now (those in sight are drawn live).</summary>
        public IReadOnlyList<IntelRecord> OutOfSight(FogView fog)
        {
            var list = new List<IntelRecord>();
            for (int i = 0; i < records.Count; i++)
            {
                if (!fog.IsVisible(records[i].Pos)) list.Add(records[i]);
            }

            return list;
        }

        private static void Merge(List<IntelRecord> into, IntelRecord record, int viewer)
        {
            if (record.Viewer != viewer || record.Owner == viewer) return;
            for (int i = 0; i < into.Count; i++)
            {
                if (into[i].BaseId != record.BaseId) continue;
                if (record.TurnSeen > into[i].TurnSeen) into[i] = record;
                return;
            }

            into.Add(record);
        }
    }
}
