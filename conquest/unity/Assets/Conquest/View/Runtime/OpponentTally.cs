using System.Collections.Generic;
using Conquest.Glue;
using Conquest.Presentation;

namespace Conquest.UnityView
{
    /// <summary>
    /// What the other side visibly did during one end of turn, counted from the presentation events the local player may see
    /// (the mapper has already dropped events the viewer cannot see). Immutable; the turn banner shows it.
    /// </summary>
    public readonly struct OpponentTally
    {
        public static readonly OpponentTally Empty = new OpponentTally(0, 0, 0);

        public OpponentTally(int moves, int newUnits, int buildings)
        {
            Moves = moves;
            NewUnits = newUnits;
            Buildings = buildings;
        }

        public int Moves { get; }

        public int NewUnits { get; }

        public int Buildings { get; }

        public bool IsEmpty => Moves == 0 && NewUnits == 0 && Buildings == 0;

        public OpponentTally Add(OpponentTally other) => new OpponentTally(Moves + other.Moves, NewUnits + other.NewUnits, Buildings + other.Buildings);

        /// <summary>
        /// The banner line: "Opponent: 9 moves, 1 new unit". A count of zero is left out, so a quiet turn adds no clutter; the
        /// text is empty when nothing was seen. Singular and plural forms are separate strings.
        /// </summary>
        public string Describe(Localizer text)
        {
            var parts = new List<string>();
            AddPart(parts, text, Moves, "ui.opponent_moves");
            AddPart(parts, text, NewUnits, "ui.opponent_units");
            AddPart(parts, text, Buildings, "ui.opponent_buildings");
            return parts.Count == 0 ? string.Empty : text.Get("ui.opponent_prefix") + " " + string.Join(", ", parts);
        }

        private static void AddPart(List<string> parts, Localizer text, int count, string key)
        {
            if (count > 0) parts.Add(text.Format(count == 1 ? key + "_one" : key, count));
        }

        /// <summary>Counts the events whose slot is not <paramref name="localSlotId"/> ("f1", "f2", ...).</summary>
        public static OpponentTally Of(IReadOnlyList<PresentationEvent> events, string localSlotId)
        {
            int moves = 0, units = 0, buildings = 0;
            foreach (PresentationEvent e in events)
            {
                if (e.Slot == null || e.Slot == localSlotId) continue;
                switch (e.Kind)
                {
                    case PresentationEventKind.UnitMoved: moves++; break;
                    case PresentationEventKind.UnitSpawned: units++; break;
                    case PresentationEventKind.BuildingStarted:
                    case PresentationEventKind.BuildingCompleted: buildings++; break;
                }
            }

            return new OpponentTally(moves, units, buildings);
        }
    }
}
