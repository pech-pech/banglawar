using System;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// SplitMix64 generator as an immutable value: every draw returns the next state, so dice can be passed in and out of
    /// pure functions. Integer-only; identical on every runtime.
    /// </summary>
    public readonly struct SplitMix64
    {
        private const ulong Gamma = 0x9E3779B97F4A7C15UL;
        private const ulong MixA = 0xBF58476D1CE4E5B9UL;
        private const ulong MixB = 0x94D049BB133111EBUL;

        public SplitMix64(ulong seed)
        {
            State = seed;
        }

        public ulong State { get; }

        /// <summary>Draws 64 random bits.</summary>
        public SplitMix64 Next(out ulong value)
        {
            unchecked
            {
                ulong state = State + Gamma;
                ulong z = state;
                z = (z ^ (z >> 30)) * MixA;
                z = (z ^ (z >> 27)) * MixB;
                value = z ^ (z >> 31);
                return new SplitMix64(state);
            }
        }

        /// <summary>Draws an unbiased integer in [0, n) by rejection sampling.</summary>
        public SplitMix64 Below(int n, out int result)
        {
            if (n <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(n), "bound must be positive");
            }

            ulong bound = (ulong)n;
            ulong threshold = unchecked(0UL - bound) % bound;
            SplitMix64 dice = this;
            while (true)
            {
                dice = dice.Next(out ulong value);
                if (value >= threshold)
                {
                    result = (int)(value % bound);
                    return dice;
                }
            }
        }
    }
}
