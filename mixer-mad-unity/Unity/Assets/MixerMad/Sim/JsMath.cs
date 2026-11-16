using System;
using System.Runtime.CompilerServices;

namespace MixerMad.Sim
{
    /// <summary>JavaScript number semantics where they differ from System.Math.</summary>
    public static class JsMath
    {
        /// <summary>V8's Math.hypot for two arguments (scale by max, Kahan sum, sqrt, rescale). Verified bit-identical to node 22 on 3M random pairs.
        /// Naive sqrt(x*x+y*y) differs in the last bit ~40% of the time, which is enough to break the 1e-9 T1 check.</summary>
        public static double Hypot(double a, double b)
        {
            a = Math.Abs(a); b = Math.Abs(b);
            if (double.IsInfinity(a) || double.IsInfinity(b)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            double max = a > b ? a : b;
            if (max == 0) return 0;
            double sum = 0, comp = 0, n = a / max, summand = n * n - comp, prelim = sum + summand;
            comp = (prelim - sum) - summand; sum = prelim;
            n = b / max; summand = n * n - comp; prelim = sum + summand;
            comp = (prelim - sum) - summand; sum = prelim;
            return Math.Sqrt(sum) * max;
        }
        /// <summary>Math.sign (returns 0 for +-0, NaN for NaN).</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Sign(double v) { return v > 0 ? 1.0 : v < 0 ? -1.0 : v; }
        /// <summary>Math.round: floor(x+0.5), so -2.5 -> -2 (C# Math.Round is banker's).</summary>
        public static double Round(double v) { return Math.Floor(v + 0.5); }
        /// <summary>JS "a||b" for numbers.</summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Or(double v, double d) { return (v == 0 || double.IsNaN(v)) ? d : v; }
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Min(double a, double b) { return a < b ? a : b; }
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Max(double a, double b) { return a > b ? a : b; }
    }

    /// <summary>Deterministic helpers copied from the JS: seeded() (mulberry32) and hash().</summary>
    public sealed class Rng
    {
        uint t;
        public Rng(uint seed) { t = seed; }
        /// <summary>JS: t+=0x6D2B79F5; r=Math.imul(t^t>>>15,1|t); r^=r+Math.imul(r^r>>>7,61|r); return ((r^r>>>14)>>>0)/4294967296.
        /// uint wrap-around equals the JS int32 ops (t itself is an unbounded double in JS, but only t mod 2^32 is ever used).</summary>
        public double Next()
        {
            unchecked
            {
                t += 0x6D2B79F5u;
                uint r = (t ^ (t >> 15)) * (1u | t);
                r ^= r + (r ^ (r >> 7)) * (61u | r);
                return (r ^ (r >> 14)) / 4294967296.0;
            }
        }
        /// <summary>JS seed>>>0 for a double seed that may exceed 2^32 or be negative.</summary>
        public static Rng FromDouble(double seed) { return new Rng(ToUint32(seed)); }
        public static uint ToUint32(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return 0;
            double m = Math.Truncate(v) % 4294967296.0; if (m < 0) m += 4294967296.0; return (uint)m;
        }
        /// <summary>JS hash(n): fract(sin(n*127.1+311.7)*43758.5453).</summary>
        public static double Hash(double n)
        {
            double s = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.Floor(s);
        }
    }
}
