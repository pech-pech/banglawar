using System;
using System.Collections.Generic;
using Conquest.Assets.Lookup;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using UnityEngine;
using IsoProjection = Conquest.Presentation.IsoProjection;

namespace Conquest.UnityView
{
    /// <summary>
    /// Plays the cues the <see cref="AnimationDirector"/> decided, with presentation time only (it never feeds the
    /// core). Blocking cues serialize, non-blocking ones run beside them. Banners a cue owns are marked busy so the
    /// reconcile step leaves them alone; <see cref="Idle"/> fires when everything has finished, and the controller
    /// then snaps the whole view to the state.
    /// </summary>
    public sealed class CueRunner
    {
        private sealed class Running
        {
            public AnimationCue Cue = null!;
            public float ElapsedMs;
            public BannerView? Banner;
            public int Segment = -1;
        }

        private const float BobPixels = 10f;
        private readonly BannerLayer banners;
        private readonly ArtLibrary art;
        private readonly IsoProjection iso;
        private readonly Func<GameState> currentState;
        private readonly Action<AnimationCue> announce;
        private readonly Queue<AnimationCue> pending = new Queue<AnimationCue>();
        private readonly List<Running> active = new List<Running>();
        private bool ranSomething;

        public CueRunner(BannerLayer banners, ArtLibrary art, IsoProjection iso, Func<GameState> currentState, Action<AnimationCue> announce)
        {
            this.banners = banners;
            this.art = art;
            this.iso = iso;
            this.currentState = currentState;
            this.announce = announce;
        }

        /// <summary>Raised once when the queue and every running cue have finished.</summary>
        public event Action? Idle;

        public bool IsBusy => pending.Count > 0 || active.Count > 0;

        /// <summary>Total cues ever started, for tests and the debug panel.</summary>
        public int Started { get; private set; }

        public string? LastClipKey { get; private set; }

        public void Enqueue(IEnumerable<AnimationCue> cues)
        {
            foreach (AnimationCue cue in cues) pending.Enqueue(cue);
        }

        /// <summary>Finishes everything at once (the skip-animations key); the controller reconciles afterwards.</summary>
        public void Skip()
        {
            while (IsBusy) Tick(1000f);
        }

        public void Tick(float deltaMs)
        {
            StartPending();
            for (int i = active.Count - 1; i >= 0; i--)
            {
                Running r = active[i];
                r.ElapsedMs += deltaMs;
                bool done = Update(r);
                if (!done) continue;
                Finish(r);
                active.RemoveAt(i);
            }

            StartPending();
            if (ranSomething && !IsBusy)
            {
                ranSomething = false;
                Idle?.Invoke();
            }
        }

        private void StartPending()
        {
            while (pending.Count > 0 && !HasBlockingActive())
            {
                AnimationCue cue = pending.Dequeue();
                var running = new Running { Cue = cue };
                Begin(running);
                Started++;
                ranSomething = true;
                if (cue.DurationMs <= 0) Finish(running);
                else active.Add(running);
            }
        }

        private bool HasBlockingActive()
        {
            foreach (Running r in active)
            {
                if (r.Cue.Blocking) return true;
            }

            return false;
        }

        private void Begin(Running r)
        {
            AnimationCue cue = r.Cue;
            switch (cue.Kind)
            {
                case CueKind.MoveAlong:
                case CueKind.FadeOut:
                    if (banners.TryGet(cue.UnitId, out BannerView view))
                    {
                        r.Banner = view;
                        view.Busy = true;
                        if (cue.Kind == CueKind.FadeOut) view.Dying = true;
                    }

                    break;
                case CueKind.SpawnIn:
                    banners.Reconcile(currentState());
                    if (banners.TryGet(cue.UnitId, out BannerView spawned)) r.Banner = spawned;
                    break;
                case CueKind.ShowTurn:
                case CueKind.ShowSeason:
                    announce(cue);
                    break;
            }
        }

        private bool Update(Running r)
        {
            AnimationCue cue = r.Cue;
            float t = Mathf.Min(1f, r.ElapsedMs / Mathf.Max(1, cue.DurationMs));
            switch (cue.Kind)
            {
                case CueKind.MoveAlong: return UpdateMove(r);
                case CueKind.FadeOut:
                    r.Banner?.SetAlpha(1f - t);
                    break;
                case CueKind.SpawnIn:
                    r.Banner?.SetAlpha(t);
                    break;
            }

            return r.ElapsedMs >= cue.DurationMs;
        }

        private bool UpdateMove(Running r)
        {
            AnimationCue cue = r.Cue;
            BannerView? banner = r.Banner;
            if (banner == null || cue.Path.Count < 2) return true;
            int steps = cue.Path.Count - 1;
            int ms = AnimationDirector.MsPerTile;
            int segment = Mathf.Min(steps - 1, (int)(r.ElapsedMs / ms));
            float into = Mathf.Min(ms, r.ElapsedMs - segment * ms);
            int progress = Mathf.RoundToInt(into * 1000f / ms);
            GridPos from = cue.Path[segment];
            GridPos to = cue.Path[segment + 1];
            if (segment != r.Segment)
            {
                r.Segment = segment;
                BeginSegment(r, banner, from, to);
            }

            PixelPoint p = iso.GridToWorld(from, to, progress);
            if (!banner.UsingMoveClip) p = new PixelPoint(p.X, p.Y - Mathf.RoundToInt(Mathf.Abs(Mathf.Sin(into / ms * Mathf.PI)) * BobPixels));
            banner.PlaceAt(p, from, to, progress);
            return r.ElapsedMs >= cue.DurationMs;
        }

        private void BeginSegment(Running r, BannerView banner, GridPos from, GridPos to)
        {
            Facing facing = FacingMath.FromDelta(to.X - from.X, to.Y - from.Y, r.Cue.Facing);
            string state = ClipCatalogAdapter.WalkState(facing);
            bool found = art.TryGet(new AssetRequest("u", banner.Role, state: state, slot: banner.Slot), out ArtClip clip) && clip.Entry.State == state;
            banner.BeginMove(clip, found, Time.unscaledTimeAsDouble);
            if (found) LastClipKey = clip.Entry.Key;
        }

        private void Finish(Running r)
        {
            AnimationCue cue = r.Cue;
            BannerView? banner = r.Banner;
            if (banner == null) return;
            switch (cue.Kind)
            {
                case CueKind.MoveAlong:
                    banner.EndMove();
                    banner.Busy = false;
                    break;
                case CueKind.FadeOut:
                    banners.Remove(banner.UnitId);
                    break;
                case CueKind.SpawnIn:
                    banner.SetAlpha(1f);
                    break;
            }
        }
    }
}
