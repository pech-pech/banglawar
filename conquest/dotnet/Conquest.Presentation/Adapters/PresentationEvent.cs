using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>
    /// The events the view reacts to. This is the presentation's own vocabulary; a small mapper in the
    /// Unity-side adapter turns the core's typed events (Conquest.Core Contracts) into these. Nothing here
    /// carries rules data.
    /// </summary>
    public enum PresentationEventKind
    {
        UnitMoved,
        UnitSpawned,
        UnitDestroyed,
        UnitAttacked,
        BuildingStarted,
        BuildingCompleted,
        TurnStarted,
        SeasonChanged,
    }

    public sealed class PresentationEvent
    {
        public PresentationEventKind Kind { get; }

        /// <summary>Unit id, or SelectionModel.NoUnit for events about tiles, buildings or the turn.</summary>
        public int UnitId { get; }

        /// <summary>Manifest role id without the kind prefix, for example "scout" or "core". Null for turn events.</summary>
        public string? Role { get; }

        /// <summary>Manifest slot such as "f1" (the player's art) or "f2". Null when the art is not per faction.</summary>
        public string? Slot { get; }
        public GridPos Position { get; }

        /// <summary>For UnitMoved: origin first, then every tile entered. For UnitAttacked: the target tile only.</summary>
        public IReadOnlyList<GridPos> Path { get; }

        /// <summary>SeasonChanged: the season id from the core (for example "season.wet"). TurnStarted: unused.</summary>
        public string? SeasonId { get; }
        public int Turn { get; }

        public PresentationEvent(
            PresentationEventKind kind,
            int unitId,
            string? role,
            string? slot,
            GridPos position,
            IReadOnlyList<GridPos>? path = null,
            string? seasonId = null,
            int turn = 0)
        {
            Kind = kind;
            UnitId = unitId;
            Role = role;
            Slot = slot;
            Position = position;
            Path = path ?? Array.Empty<GridPos>();
            SeasonId = seasonId;
            Turn = turn;
        }
    }
}
