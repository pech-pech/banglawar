using System;

namespace Conquest.Presentation
{
    /// <summary>What a banner looks like. Clay is the idle look; the hologram looks mean "attention".</summary>
    public enum BannerVisualState
    {
        Clay = 0,
        ClayHover = 1,
        HologramSelected = 2,
        HologramStatus = 3,
    }

    public static class BannerVisualRules
    {
        /// <summary>Selected beats status beats hover beats plain clay.</summary>
        public static BannerVisualState Resolve(bool selected, bool hovered, bool hasStatus)
        {
            if (selected) return BannerVisualState.HologramSelected;
            if (hasStatus) return BannerVisualState.HologramStatus;
            return hovered ? BannerVisualState.ClayHover : BannerVisualState.Clay;
        }

        public static bool IsHologram(BannerVisualState state)
        {
            return state == BannerVisualState.HologramSelected || state == BannerVisualState.HologramStatus;
        }

        /// <summary>The manifest state name of the banner picture (key suffix, e.g. u.scout@f1.selected).</summary>
        public static string ClipState(BannerVisualState state)
        {
            switch (state)
            {
                case BannerVisualState.HologramSelected: return "selected";
                case BannerVisualState.HologramStatus: return "status";
                default: return "idle";
            }
        }
    }

    /// <summary>
    /// The cross-fade between two banner looks, as pure data evaluated at a presentation time (milliseconds).
    /// Blend 0 shows From, 1000 shows To; the curve is an integer smoothstep. Reversing mid-fade continues
    /// from the current blend instead of jumping.
    /// </summary>
    public sealed class BannerTransition
    {
        public const int HologramInMs = 180;
        public const int HologramOutMs = 120;

        public BannerVisualState From { get; }
        public BannerVisualState To { get; }
        public int StartMs { get; }
        public int StartProgressPermille { get; }

        private BannerTransition(BannerVisualState from, BannerVisualState to, int startMs, int startProgress)
        {
            From = from;
            To = to;
            StartMs = startMs;
            StartProgressPermille = startProgress;
        }

        public static BannerTransition Settled(BannerVisualState state)
        {
            return new BannerTransition(state, state, 0, 1000);
        }

        public int DurationMs => BannerVisualRules.IsHologram(To) ? HologramInMs : HologramOutMs;

        /// <summary>Linear progress 0..1000 at the given time.</summary>
        public int ProgressPermille(int nowMs)
        {
            if (From == To)
            {
                return 1000;
            }

            long elapsed = Math.Max(0, nowMs - StartMs);
            long p = StartProgressPermille + elapsed * 1000 / DurationMs;
            return (int)Math.Min(1000, p);
        }

        /// <summary>Eased blend 0..1000 (smoothstep: 3p^2 - 2p^3).</summary>
        public int BlendPermille(int nowMs)
        {
            long p = ProgressPermille(nowMs);
            return (int)(p * p * (3000 - 2 * p) / 1_000_000);
        }

        public bool IsSettled(int nowMs) => ProgressPermille(nowMs) >= 1000;

        public BannerTransition Begin(BannerVisualState next, int nowMs)
        {
            if (next == To)
            {
                return this;
            }

            int blend = BlendPermille(nowMs);
            if (next == From && From != To)
            {
                return new BannerTransition(To, From, nowMs, 1000 - blend);
            }

            BannerVisualState shown = blend >= 500 ? To : From;
            return new BannerTransition(shown, next, nowMs, 0);
        }
    }
}
