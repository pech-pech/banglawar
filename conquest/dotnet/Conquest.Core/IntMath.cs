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
