using System;
using Conquest.Core.Contracts;

namespace Conquest.Core.Combat
{
    /// <summary>What a raid took in total.</summary>
    public sealed class RaidSpoils
    {
        public RaidSpoils(ResourceVector seized, ResourceVector remaining, int buildingLevelsLowered)
        {
            Seized = seized;
            Remaining = remaining;
            BuildingLevelsLowered = buildingLevelsLowered;
        }

        public ResourceVector Seized { get; }

        public ResourceVector Remaining { get; }

        public int BuildingLevelsLowered { get; }
    }

    /// <summary>
    /// Raid constants of the manual (GDD 11.6, 02 section 1.4, G17): from round 3 the raider takes 10% of the remaining
    /// stockpile each round, shrinking by 0.8 per round; from round 5 one building level falls each round. People are
    /// never a spoil (no civilian state in the simulation).
    /// </summary>
    public static class Raid
    {
        private const int FirstSpoilRound = 3;
        private const int FirstLevelRound = 5;
        private const int FirstSpoilPermille = 100;
        private const int DecayPercent = 80;

        public static int SpoilsPermille(int round)
        {
            if (round < FirstSpoilRound)
            {
                return 0;
            }

            int permille = FirstSpoilPermille;
            for (int r = FirstSpoilRound + 1; r <= round; r++)
            {
                permille = permille * DecayPercent / 100;
            }

            return permille;
        }

        public static int LevelsLoweredInRound(int round)
        {
            return round >= FirstLevelRound ? 1 : 0;
        }

        /// <summary>Applies every round from 1 to <paramref name="roundsPlayed"/> to a stockpile.</summary>
        public static RaidSpoils Settle(ResourceVector stock, int roundsPlayed)
        {
            ResourceVector remaining = stock;
            int levels = 0;
            for (int round = 1; round <= roundsPlayed; round++)
            {
                levels += LevelsLoweredInRound(round);
                int permille = SpoilsPermille(round);
                if (permille == 0)
                {
                    continue;
                }

                remaining = new ResourceVector(
                    Keep(remaining.Basic, permille),
                    Keep(remaining.Hard, permille),
                    Keep(remaining.Coin, permille),
                    Keep(remaining.Wares, permille),
                    Keep(remaining.Food, permille),
                    remaining.Pop);
            }

            return new RaidSpoils(stock.Subtract(remaining), remaining, levels);
        }

        /// <summary>
        /// Lowers building levels one at a time: the tallest ordinary building first (lowest index on a tie), forts only
        /// when nothing else is left (ASSUMED "harder to destroy" rule). The input array is not changed.
        /// </summary>
        public static int[] LowerLevels(int[] levels, bool[] isFort, int count)
        {
            int[] result = (int[])levels.Clone();
            for (int step = 0; step < count; step++)
            {
                int index = Tallest(result, isFort, wantFort: false);
                if (index < 0)
                {
                    index = Tallest(result, isFort, wantFort: true);
                }

                if (index < 0)
                {
                    break;
                }

                result[index]--;
            }

            return result;
        }

        private static int Tallest(int[] levels, bool[] isFort, bool wantFort)
        {
            int best = -1;
            for (int i = 0; i < levels.Length; i++)
            {
                if (isFort[i] == wantFort && levels[i] > 0 && (best < 0 || levels[i] > levels[best]))
                {
                    best = i;
                }
            }

            return best;
        }

        private static int Keep(int value, int permille)
        {
            long taken = (long)value * permille / 1000;
            return (int)(value - taken);
        }
    }
}
