using System;

namespace Conquest.Core
{
    /// <summary>
    /// Integer-only arithmetic helpers. C# division truncates toward zero; the game rules floor.
    /// Every rate in the simulation goes through these helpers (see the Unity architecture plan, section 3).
    /// </summary>
    public static class IntMath
    {
        /// <summary>Divides and rounds toward negative infinity.</summary>
        public static int FloorDiv(int numerator, int denominator)
        {
            if (denominator == 0)
            {
                throw new DivideByZeroException();
            }

            int quotient = numerator / denominator;
            bool inexact = numerator % denominator != 0;
            bool signsDiffer = (numerator < 0) != (denominator < 0);
            return inexact && signsDiffer ? quotient - 1 : quotient;
        }

        /// <summary>Divides 64-bit integers and rounds toward negative infinity.</summary>
        public static long FloorDiv(long numerator, long denominator)
        {
            if (denominator == 0)
            {
                throw new DivideByZeroException();
            }

            long quotient = numerator / denominator;
            bool inexact = numerator % denominator != 0;
            bool signsDiffer = (numerator < 0) != (denominator < 0);
            return inexact && signsDiffer ? quotient - 1 : quotient;
        }

        /// <summary>The remainder that matches <see cref="FloorDiv(int,int)"/>: always has the sign of the denominator (0..d-1 for positive d).</summary>
        public static int FloorMod(int numerator, int denominator)
        {
            return numerator - (FloorDiv(numerator, denominator) * denominator);
        }

        /// <summary>The middle index of an inclusive range, rounded down (replaces <c>lo + ((hi - lo) &gt;&gt; 1)</c>).</summary>
        public static int Midpoint(int lo, int hi)
        {
            return lo + FloorDiv(hi - lo, 2);
        }

        /// <summary>Returns floor(value * numerator / denominator) computed in 64 bits, so the product cannot overflow.</summary>
        public static int MulDiv(int value, int numerator, int denominator)
        {
            return checked((int)FloorDiv((long)value * numerator, denominator));
        }

        /// <summary>Clamps a value into an inclusive range.</summary>
        public static int Clamp(int value, int min, int max)
        {
            return value < min ? min : value > max ? max : value;
        }

        /// <summary>Returns floor(value * percent / 100) without overflowing the intermediate product.</summary>
        public static int Percent(int value, int percent)
        {
            long product = (long)value * percent;
            long quotient = product / 100;
            if (product % 100 != 0 && product < 0)
            {
                quotient -= 1;
            }

            return checked((int)quotient);
        }
    }
}
