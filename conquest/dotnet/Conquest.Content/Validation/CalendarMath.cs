using System;
using System.Globalization;

namespace Conquest.Content.Validation
{
    /// <summary>Turn-to-date arithmetic for the scenario calendar (turn t covers days t*step .. t*step+step-1 after the epoch).</summary>
    public static class CalendarMath
    {
        public static bool TryParseDate(string text, out DateTime date)
        {
            return DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
        }

        public static string Format(DateTime date)
        {
            return date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        /// <summary>First day of a turn.</summary>
        public static DateTime TurnStart(DateTime epoch, int stepDays, int turn)
        {
            return epoch.AddDays((double)turn * stepDays);
        }

        /// <summary>True when the date falls inside the turn.</summary>
        public static bool TurnContains(DateTime epoch, int stepDays, int turn, DateTime date)
        {
            DateTime start = TurnStart(epoch, stepDays, turn);
            return date >= start && date < start.AddDays(stepDays);
        }
    }
}
