using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    public enum SiteFate
    {
        Unchanged = 0,
        Captured = 1,
        Destroyed = 2,

        /// <summary>A protected site whose capture is illegal: it stays with its owner at core level 1 (spec 06 H2).</summary>
        SurvivesAtLevelOne = 3,
    }

    public sealed class SiteCaptureResult
    {
        public SiteCaptureResult(SiteFate fate, IReadOnlyList<GameEvent> events)
        {
            Fate = fate;
            Events = events;
        }

        public SiteFate Fate { get; }

        public IReadOnlyList<GameEvent> Events { get; }
    }

    /// <summary>
    /// What happens to a colony after a battle, and the <c>ev.site_taken</c> event for it (spec 06 H2, C3). The event is
    /// meant for both the old owner and the taker; the theme picks the gained or lost text from <c>TakerSlot</c> (see
    /// <see cref="TemplateKeys"/>).
    /// </summary>
    public static class SiteCapture
    {
        private static readonly IReadOnlyList<GameEvent> NoEvents = Frozen.List<GameEvent>(null);

        public static SiteCaptureResult ResolveCapture(string? site, int ownerSlot, int takerSlot, bool attackerWon, bool captureLegal)
        {
            if (!attackerWon || !captureLegal)
            {
                return new SiteCaptureResult(SiteFate.Unchanged, NoEvents);
            }

            return Captured(site, ownerSlot, takerSlot, "capture");
        }

        public static SiteCaptureResult ResolveRaid(string? site, int ownerSlot, int raiderSlot, bool defendersBroken, bool raidCanDestroy, bool captureLegal)
        {
            if (!defendersBroken)
            {
                return new SiteCaptureResult(SiteFate.Unchanged, NoEvents);
            }

            if (raidCanDestroy)
            {
                return new SiteCaptureResult(SiteFate.Destroyed, NoEvents);
            }

            return captureLegal
                ? Captured(site, ownerSlot, raiderSlot, "raid")
                : new SiteCaptureResult(SiteFate.SurvivesAtLevelOne, NoEvents);
        }

        private static SiteCaptureResult Captured(string? site, int ownerSlot, int takerSlot, string via)
        {
            IReadOnlyList<GameEvent> events = site == null
                ? NoEvents
                : Frozen.List<GameEvent>(new GameEvent[] { new SiteTaken(site, ownerSlot, takerSlot, via) });
            return new SiteCaptureResult(SiteFate.Captured, events);
        }
    }
}
