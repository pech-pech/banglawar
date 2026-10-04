using System;

namespace Conquest.Core
{
    /// <summary>
    /// Counter-based randomness on the SplitMix64 finaliser (13 section 3.2). Pure 64-bit integer operations,
    /// identical on every runtime. Stream codes come from <see cref="Fnv1a64"/>, never from string.GetHashCode.
    /// </summary>
    public static class Rng
    {
        private const ulong Gamma = 0x9E3779B97F4A7C15UL;

        /// <summary>The SplitMix64 mix of one value (adds the golden gamma, then the finaliser).</summary>
        public static ulong Mix(ulong x)
        {
            unchecked
            {
                ulong z = x + Gamma;
                z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
                z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
                return z ^ (z >> 31);
            }
        }

        /// <summary>One draw: <c>Mix(Mix(Mix(Mix(seed ^ stream) ^ turn) ^ key))</c>.</summary>
        public static ulong Draw(ulong seed, ulong streamCode, int turn, ulong key)
        {
            unchecked
            {
                ulong x = Mix(seed ^ streamCode);
                x = Mix(x ^ (ulong)(long)turn);
                x = Mix(x ^ key);
                return Mix(x);
            }
        }

        /// <summary>An unbiased integer in [lo, hiExclusive) by rejection sampling; bounded redraws use key + attempt.</summary>
        public static int Range(ulong seed, ulong streamCode, int turn, ulong key, int lo, int hiExclusive)
        {
            if (hiExclusive <= lo)
            {
                throw new ArgumentException("Empty range.");
            }

            ulong span = (ulong)((long)hiExclusive - lo);
            ulong threshold = unchecked(0UL - span) % span;
            for (ulong attempt = 0; ; attempt++)
            {
                ulong v = Draw(seed, streamCode, turn, unchecked(key + attempt));
                if (v >= threshold)
                {
                    return lo + (int)(v % span);
                }
            }
        }
    }

    /// <summary>Stable 64-bit stream codes (FNV-1a over the UTF-8 name).</summary>
    public static class RngStreams
    {
        public static readonly ulong Combat = Fnv1a64.Hash("combat");
        public static readonly ulong Economy = Fnv1a64.Hash("economy");
        public static readonly ulong Worldgen = Fnv1a64.Hash("worldgen");

        /// <summary>A per-key stream such as <c>combat:12</c>.</summary>
        public static ulong Named(string name, int id) => Fnv1a64.Hash(name + ":" + id.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    /// <summary>
    /// Sequential SplitMix64 generator state. Immutable: <see cref="Next"/> returns the value and the next state.
    /// Lives in <c>GameState</c> so the game's randomness is part of the hashed state.
    /// </summary>
    public readonly struct RngState : IEquatable<RngState>
    {
        public RngState(ulong state)
        {
            State = state;
        }

        public ulong State { get; }

        public static RngState FromSeed(ulong seed) => new RngState(seed);

        public RngState Next(out ulong value)
        {
            unchecked
            {
                ulong s = State + 0x9E3779B97F4A7C15UL;
                ulong z = s;
                z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
                z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
                value = z ^ (z >> 31);
                return new RngState(s);
            }
        }

        public bool Equals(RngState other) => State == other.State;

        public override bool Equals(object? obj) => obj is RngState o && Equals(o);

        public override int GetHashCode() => unchecked((int)State ^ (int)(State >> 32));
    }
}
