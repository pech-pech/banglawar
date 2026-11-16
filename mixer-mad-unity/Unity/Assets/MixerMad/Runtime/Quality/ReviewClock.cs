using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// The cosmetic clock that review stills can stop (L-MM-33). Pausing the sim already stops the truck, the camera
    /// target, slow-mo-aware views and the FX emitters; this stops what still runs on real time: shader _Time (cloud
    /// drift, snow twinkle, ice wobble) and Unity's own scaled-time particles through Time.timeScale, and the views
    /// that read <see cref="Delta"/> / <see cref="Now"/> instead of Time.unscaled* (beacon blink, light-shaft
    /// breathing, snow gusts). Gameplay never reads it: the sim runs its own clock on unscaled time.
    /// Only the stills runner freezes it, and it always unfreezes before it lets the game run on.
    /// </summary>
    public static class ReviewClock
    {
        public static bool Frozen { get; private set; }

        static float _scaleBefore = 1f, _frozenAt, _frozenTotal;

        /// <summary>Real seconds this frame, 0 while frozen.</summary>
        public static float Delta => DeltaFor(Frozen, Time.unscaledDeltaTime);

        /// <summary>Real time since start minus every frozen stretch: stands still while frozen, never jumps after.</summary>
        public static float Now => NowFor(Time.unscaledTime, Frozen, _frozenAt, _frozenTotal);

        public static float DeltaFor(bool frozen, float realDelta) => frozen ? 0f : realDelta;

        public static float NowFor(float realNow, bool frozen, float frozenAt, float frozenTotal) =>
            (frozen ? frozenAt : realNow) - frozenTotal;

        /// <summary>Stops (or restarts) the cosmetic clock. Idempotent; keeps whatever time scale was set before.</summary>
        public static void Freeze(bool on)
        {
            if (on == Frozen) return;
            Frozen = on;
            if (on)
            {
                _frozenAt = Time.unscaledTime;
                _scaleBefore = Time.timeScale;
                Time.timeScale = 0f;
            }
            else
            {
                _frozenTotal += Time.unscaledTime - _frozenAt;
                Time.timeScale = _scaleBefore;
            }
        }
    }
}
