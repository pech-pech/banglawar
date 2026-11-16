using System;

namespace MixerMad.Game
{
    /// <summary>
    /// Pure fixed-step accumulator. Slow-mo scales how much time is ADDED, never the step size,
    /// so the sequence of sim steps (and inputs) is identical at any speed.
    /// Pure C#, unit-tested in Tests/EditMode.
    /// </summary>
    public struct FixedStepClock
    {
        public double Step;          // seconds per sim step (1/120)
        public double Accumulator;
        public int MaxStepsPerFrame; // spiral-of-death guard: drop render time, never sim steps

        public FixedStepClock(double step, int maxStepsPerFrame = 24)
        {
            Step = step; Accumulator = 0; MaxStepsPerFrame = maxStepsPerFrame;
        }

        /// <summary>Add presentation time already multiplied by the slow-mo factor.</summary>
        public void Add(double scaledSeconds)
        {
            Accumulator += scaledSeconds;
            double cap = Step * MaxStepsPerFrame;
            if (Accumulator > cap) Accumulator = cap;
        }

        public bool TryConsume()
        {
            if (Accumulator + 1e-12 < Step) return false;
            Accumulator -= Step;
            return true;
        }

        /// <summary>Blend factor between the previous and the current sim state (0..1).</summary>
        public float Alpha => (float)Math.Min(1.0, Math.Max(0.0, Accumulator / Step));
    }
}
