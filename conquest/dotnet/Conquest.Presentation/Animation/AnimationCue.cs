using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    public enum CueKind
    {
        /// <summary>Play a manifest clip on a unit or tile.</summary>
        PlayClip,

        /// <summary>Glide a banner along a path while its walk clip loops.</summary>
        MoveAlong,
        SpawnIn,
        FadeOut,

        /// <summary>A short procedural lunge toward the target when no attack clip exists.</summary>
        Nudge,
        ShowTurn,
        ShowSeason,
    }

    /// <summary>A single thing for the view to do, with its length in milliseconds. Cues carry no clock.</summary>
    public sealed class AnimationCue
    {
        public CueKind Kind { get; }
        public int UnitId { get; }
        public GridPos Tile { get; }
        public ClipInfo? Clip { get; }
        public Facing Facing { get; }
        public int DurationMs { get; }

        /// <summary>When true the view finishes this cue before it starts the next event's cues.</summary>
        public bool Blocking { get; }
        public IReadOnlyList<GridPos> Path { get; }
        public string? SoundId { get; }
        public string? SeasonId { get; }

        public AnimationCue(
            CueKind kind,
            int unitId,
            GridPos tile,
            ClipInfo? clip,
            Facing facing,
            int durationMs,
            bool blocking,
            IReadOnlyList<GridPos>? path = null,
            string? soundId = null,
            string? seasonId = null)
        {
            Kind = kind;
            UnitId = unitId;
            Tile = tile;
            Clip = clip;
            Facing = facing;
            DurationMs = durationMs;
            Blocking = blocking;
            Path = path ?? Array.Empty<GridPos>();
            SoundId = soundId;
            SeasonId = seasonId;
        }
    }
}
