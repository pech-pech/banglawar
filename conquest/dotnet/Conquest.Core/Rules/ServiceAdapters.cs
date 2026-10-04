using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>Instance form of the static <see cref="FoodRules"/>, behind <see cref="IFoodRules"/>.</summary>
    public sealed class FoodService : IFoodRules
    {
        private readonly FoodConfig _config;

        public FoodService(FoodConfig? config = null)
        {
            _config = config ?? FoodConfig.Default;
        }

        public int Need(int pop)
        {
            return pop <= 0 ? 0 : IntMath.FloorDiv(pop + _config.PeoplePerFood - 1, _config.PeoplePerFood);
        }

        public FoodOutcome Resolve(int baseId, int slot, int pop, int stock, int produced)
        {
            return FoodRules.Resolve(_config, baseId, slot, pop, stock, produced);
        }
    }

    /// <summary>Instance form of the static <see cref="SiteCapture"/>, behind <see cref="ISiteCapture"/>.</summary>
    public sealed class SiteCaptureService : ISiteCapture
    {
        public static SiteCaptureService Instance { get; } = new SiteCaptureService();

        public SiteCaptureResult ResolveCapture(string? site, int ownerSlot, int takerSlot, bool attackerWon, bool captureLegal)
        {
            return SiteCapture.ResolveCapture(site, ownerSlot, takerSlot, attackerWon, captureLegal);
        }

        public SiteCaptureResult ResolveRaid(string? site, int ownerSlot, int raiderSlot, bool defendersBroken, bool raidCanDestroy, bool captureLegal)
        {
            return SiteCapture.ResolveRaid(site, ownerSlot, raiderSlot, defendersBroken, raidCanDestroy, captureLegal);
        }
    }

    /// <summary>Instance form of the static <see cref="TemplateKeys"/>, behind <see cref="ITemplateKeys"/>.</summary>
    public sealed class TemplateKeyProvider : ITemplateKeys
    {
        public static TemplateKeyProvider Instance { get; } = new TemplateKeyProvider();

        public string SlotName(int slot) => TemplateKeys.SlotName(slot);

        public string[] For(GameEvent gameEvent, int receiverSlot) => TemplateKeys.For(gameEvent, receiverSlot);
    }
}
