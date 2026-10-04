using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>
    /// The theme-template lookup order for an event (spec 06 section 8). The receiving slot picks the <c>@fN</c> override;
    /// <c>ev.site_taken</c> and <c>ev.match_won</c> have no base template, only side-keyed sub-keys chosen by comparing a
    /// payload slot with the receiver, so a loser never reads a victory text.
    /// </summary>
    public static class TemplateKeys
    {
        public static string SlotName(int slot)
        {
            return "f" + (slot + 1).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>Returns the keys to try, most specific first: <c>key@fN</c>, then <c>key</c>.</summary>
        public static string[] For(GameEvent gameEvent, int receiverSlot)
        {
            string key = BaseKey(gameEvent, receiverSlot);
            return new[] { key + "@" + SlotName(receiverSlot), key };
        }

        private static string BaseKey(GameEvent e, int receiver)
        {
            switch (e)
            {
                case SiteTaken taken:
                    return taken.TakerSlot == receiver ? "ev.site_taken.gained" : "ev.site_taken.lost";
                case MatchWon won:
                    return won.WinnerSlot == receiver ? "ev.match_won.player" : "ev.match_won.opponent";
                default:
                    return e.Id;
            }
        }
    }
}
