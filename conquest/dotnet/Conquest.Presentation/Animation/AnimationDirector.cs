using System;
using System.Collections.Generic;

namespace Conquest.Presentation
{
    /// <summary>
    /// Decides which cues to play for each game event, using clip names from the asset manifest. Pure: the
    /// same events and catalog always give the same cues. A missing clip never stops the game: movement
    /// falls back to a glide, death to a fade, attack to a nudge.
    /// </summary>
    public sealed class AnimationDirector
    {
        public const int MsPerTile = 320;
        public const int SpawnMs = 250;
        public const int FadeMs = 300;
        public const int NudgeMs = 200;
        public const int TurnBannerMs = 900;
        public const int SeasonBannerMs = 1200;

        public const string UnitKind = "u";
        public const string BuildingKind = "bld";

        public const string StateWalk = "walk";
        public const string StateIdle = "idle";
        public const string StateAttack = "attack";
        public const string StateDown = "down";
        public const string StateConstruct = "construct";
        public const string StateBuilt = "built";

        public const string SoundMove = "sfx.unit.move";
        public const string SoundSpawn = "sfx.unit.spawn";
        public const string SoundDown = "sfx.unit.down";
        public const string SoundAttack = "sfx.unit.attack";
        public const string SoundConstruct = "sfx.building.construct";
        public const string SoundBuilt = "sfx.building.built";
        public const string SoundTurn = "sfx.turn.start";
        public const string SoundSeason = "sfx.season.change";

        private readonly IClipCatalog catalog;

        public AnimationDirector(IClipCatalog catalog)
        {
            this.catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        }

        public IReadOnlyList<AnimationCue> DirectAll(IEnumerable<PresentationEvent> events)
        {
            if (events == null) throw new ArgumentNullException(nameof(events));

            var cues = new List<AnimationCue>();
            foreach (PresentationEvent e in events)
            {
                cues.AddRange(Direct(e));
            }

            return cues;
        }

        public IReadOnlyList<AnimationCue> Direct(PresentationEvent e)
        {
            if (e == null) throw new ArgumentNullException(nameof(e));

            switch (e.Kind)
            {
                case PresentationEventKind.UnitMoved: return Moved(e);
                case PresentationEventKind.UnitSpawned: return Spawned(e);
                case PresentationEventKind.UnitDestroyed: return Destroyed(e);
                case PresentationEventKind.UnitAttacked: return Attacked(e);
                case PresentationEventKind.BuildingStarted: return Building(e, StateConstruct, SoundConstruct);
                case PresentationEventKind.BuildingCompleted: return Building(e, StateBuilt, SoundBuilt);
                case PresentationEventKind.TurnStarted:
                    return One(new AnimationCue(CueKind.ShowTurn, SelectionModel.NoUnit, e.Position, null, Facing.SE, TurnBannerMs, false, null, SoundTurn));
                case PresentationEventKind.SeasonChanged:
                    return One(new AnimationCue(CueKind.ShowSeason, SelectionModel.NoUnit, e.Position, null, Facing.SE, SeasonBannerMs, false, null, SoundSeason, e.SeasonId));
                default:
                    return Array.Empty<AnimationCue>();
            }
        }

        private IReadOnlyList<AnimationCue> Moved(PresentationEvent e)
        {
            if (e.Path.Count < 2)
            {
                return Array.Empty<AnimationCue>();
            }

            Facing facing = FacingMath.FromDelta(e.Path[1].X - e.Path[0].X, e.Path[1].Y - e.Path[0].Y, Facing.SE);
            ClipInfo? clip = FindUnitClip(e, StateWalk, facing) ?? FindUnitClip(e, StateIdle, facing);
            int duration = (e.Path.Count - 1) * MsPerTile;
            return One(new AnimationCue(CueKind.MoveAlong, e.UnitId, e.Path[0], clip, facing, duration, true, e.Path, SoundMove));
        }

        private IReadOnlyList<AnimationCue> Spawned(PresentationEvent e)
        {
            ClipInfo? clip = FindUnitClip(e, StateIdle, Facing.SE);
            return One(new AnimationCue(CueKind.SpawnIn, e.UnitId, e.Position, clip, Facing.SE, SpawnMs, false, null, SoundSpawn));
        }

        private IReadOnlyList<AnimationCue> Destroyed(PresentationEvent e)
        {
            var cues = new List<AnimationCue>();
            ClipInfo? down = FindUnitClip(e, StateDown, Facing.SE);
            if (IsExact(down, StateDown))
            {
                cues.Add(new AnimationCue(CueKind.PlayClip, e.UnitId, e.Position, down, Facing.SE, down!.DurationMs, true, null, SoundDown));
                cues.Add(new AnimationCue(CueKind.FadeOut, e.UnitId, e.Position, null, Facing.SE, FadeMs, false));
            }
            else
            {
                cues.Add(new AnimationCue(CueKind.FadeOut, e.UnitId, e.Position, null, Facing.SE, FadeMs, true, null, SoundDown));
            }

            return cues;
        }

        private IReadOnlyList<AnimationCue> Attacked(PresentationEvent e)
        {
            GridPos target = e.Path.Count > 0 ? e.Path[0] : e.Position;
            Facing facing = FacingMath.FromDelta(target.X - e.Position.X, target.Y - e.Position.Y, Facing.SE);
            ClipInfo? attack = FindUnitClip(e, StateAttack, facing);
            if (IsExact(attack, StateAttack))
            {
                return One(new AnimationCue(CueKind.PlayClip, e.UnitId, e.Position, attack, facing, attack!.DurationMs, true, null, SoundAttack));
            }

            return One(new AnimationCue(CueKind.Nudge, e.UnitId, e.Position, null, facing, NudgeMs, true, null, SoundAttack));
        }

        private IReadOnlyList<AnimationCue> Building(PresentationEvent e, string state, string sound)
        {
            ClipInfo? clip = e.Role == null ? null : catalog.Find(BuildingKind, e.Role, state, e.Slot, Facing.SE);
            bool animated = clip != null && clip.Frames > 1;
            return One(new AnimationCue(CueKind.PlayClip, SelectionModel.NoUnit, e.Position, clip, Facing.SE, animated ? clip!.DurationMs : 0, false, null, sound));
        }

        private ClipInfo? FindUnitClip(PresentationEvent e, string state, Facing facing)
        {
            if (e.Role == null)
            {
                return null;
            }

            return catalog.Find(UnitKind, e.Role, state, e.Slot, FacingMath.RenderDirection(facing, out _));
        }

        private static bool IsExact(ClipInfo? clip, string state)
        {
            return clip != null && string.Equals(clip.State, state, StringComparison.Ordinal);
        }

        private static IReadOnlyList<AnimationCue> One(AnimationCue cue) => new[] { cue };
    }
}
