using System.Collections.Generic;
using Conquest.Core.Rules;

namespace Conquest.Core.Contracts
{
    /// <summary>Spec 06 H5 queries. Pure functions of the entries and the turn; nothing is stored in the game state.</summary>
    public interface ITimedEffects
    {
        bool Enabled { get; }

        bool PatronLinkCut(int slot, int turn);

        /// <summary>What happens to a patron delivery that is due while the link is cut; null when the link is up.</summary>
        InFlightPolicy? InFlight(int slot, int turn);

        /// <summary>Integer per-mille added to the panic chance of a slot's units in battle.</summary>
        int PanicModifier(int slot, int turn, bool defendingBase);

        /// <summary>Order validation: <c>err.patron_link_cut</c> for patron orders while the link is cut, else null.</summary>
        string? OrderGate(int slot, int turn, bool isPatronOrder);

        bool ArrivalSuppressed(int slot, int turn, bool viaPatron);

        /// <summary>Public <c>ev.timed_effect_started</c> events for entries that start on the turn and ask to be announced.</summary>
        IReadOnlyList<TimedEffectStarted> Announcements(int turn);
    }

    /// <summary>Spec 06 H6: region lookup, the core cap checked when an upgrade is ordered, and the productivity bonus.</summary>
    public interface IRegionService
    {
        bool Enabled { get; }

        /// <summary>The region id of a tile, or null when the tile is in no region.</summary>
        string? RegionOf(TileCoord tile);

        /// <summary>Checks a core upgrade of <paramref name="baseId"/> to <paramref name="targetLevel"/> against the cap.</summary>
        RegionCheck CheckCoreUpgrade(IGameStateView state, int slot, int baseId, int targetLevel);

        /// <summary>Percentage points added to the productivity modifier of a building role at a base (0 when none).</summary>
        int BonusPct(IGameStateView state, int slot, int baseId, BuildingRole role);
    }

    /// <summary>Food need and the shortage outcome (GDD 8.5).</summary>
    public interface IFoodRules
    {
        int Need(int pop);

        FoodOutcome Resolve(int baseId, int slot, int pop, int stock, int produced);
    }

    /// <summary>What happens to a colony after a battle, and its <c>ev.site_taken</c> event (spec 06 H2).</summary>
    public interface ISiteCapture
    {
        SiteCaptureResult ResolveCapture(string? site, int ownerSlot, int takerSlot, bool attackerWon, bool captureLegal);

        SiteCaptureResult ResolveRaid(string? site, int ownerSlot, int raiderSlot, bool defendersBroken, bool raidCanDestroy, bool captureLegal);
    }

    /// <summary>The theme-template lookup order for an event (spec 06 section 8).</summary>
    public interface ITemplateKeys
    {
        string SlotName(int slot);

        /// <summary>The keys to try for a receiving slot, most specific first.</summary>
        string[] For(GameEvent gameEvent, int receiverSlot);
    }

    /// <summary>Scenario-owned numbers the turn pipeline needs: site flags, capture legality and the start kit.</summary>
    public interface IScenarioRules
    {
        /// <summary>Spec 06 H2 (C3): may a raid destroy this site? False for protected sites.</summary>
        bool RaidCanDestroy(string siteId);

        /// <summary>False when the two slots' archetypes may not capture each other's colonies (GDD 10).</summary>
        bool CaptureLegal(int attackerSlot, int defenderSlot);

        /// <summary>The stock of the first base a slot founds, or null for the default starting stock.</summary>
        ResourceVector? StartKit(int slot);
    }

    /// <summary>One unit group of a scheduled arrival.</summary>
    public sealed record ArrivalUnit(UnitRole Role, int Level, int Count);

    /// <summary>A scheduled arrival (spec 06 H1). <c>Group</c> is null for the neutral "arrive near the slot's home" rule.</summary>
    public sealed record ArrivalSpec(
        int Index,
        int Turn,
        int Slot,
        string? Group,
        ImmArray<ArrivalUnit> Units,
        bool AttachToFirstCommander,
        bool ViaPatron);

    /// <summary>A group of land tiles an arrival may land on, in priority order.</summary>
    public sealed record EntryGroup(string Id, int Slot, ImmArray<TileCoord> Tiles);

    /// <summary>The arrival schedule and entry groups of a scenario. Pure data; progress lives in the game state.</summary>
    public interface IArrivalPlan
    {
        /// <summary>After this many deferrals a blocked arrival lands on any free group tile of its slot; -1 = wait for ever.</summary>
        int MaxDeferTurns { get; }

        IReadOnlyList<ArrivalSpec> Arrivals { get; }

        IReadOnlyList<EntryGroup> Groups { get; }
    }

    /// <summary>
    /// Read-side queries the interface layer needs and the state view does not give: the resource-bar forecast, movement
    /// per turn and a move plan. Every answer comes from the same code the turn pipeline runs, so a preview equals the result.
    /// </summary>
    public interface IGameQueries
    {
        /// <summary>The change in a base's stock the next end of turn will make (production, food, population), as a delta.</summary>
        ResourceVector Forecast(int baseId);

        /// <summary>Whole movement points per turn of a role at a level (before any season percent).</summary>
        int MovesPerTurn(UnitRole role, int level);

        /// <summary>The path and cost the engine would use for a move order, or <c>Found == false</c>.</summary>
        MovePlan PlanMove(int unitId, TileCoord target);
    }

    /// <summary>A planned move: the steps (excluding the start), the cost in hundredths and the turns it takes.</summary>
    public sealed record MovePlan(bool Found, ImmArray<TileCoord> Steps, int CostHundredths, int Turns);
}
