namespace Conquest.Core.Contracts
{
    public enum EventVisibility
    {
        /// <summary>Public event delivered to every player.</summary>
        All = 0,

        /// <summary>Delivered only to <see cref="GameEvent.OwnerSlot"/>.</summary>
        Owner = 1,

        /// <summary>Delivered to the slots named by <see cref="GameEvent.VisibleTo"/> (for example both sides of a site change).</summary>
        Parties = 2,
    }

    /// <summary>
    /// Base type of every event (spec 06 section 8). Ids and payload names follow the event table; no payload has free text.
    /// Slots are written as slot indices here; the theme layer renders them as f1, f2 ...
    /// </summary>
    public abstract record GameEvent
    {
        public abstract string Id { get; }

        public virtual EventVisibility Visibility => EventVisibility.All;

        /// <summary>The slot an <see cref="EventVisibility.Owner"/> event is for; -1 for public events.</summary>
        public virtual int OwnerSlot => -1;

        /// <summary>True when the event is delivered to <paramref name="slot"/>. Parties events override this.</summary>
        public virtual bool VisibleTo(int slot)
        {
            return Visibility == EventVisibility.All || (Visibility == EventVisibility.Owner && slot == OwnerSlot);
        }
    }

    // ----- events listed in the variant spec (06 section 8) -----

    public sealed record ArrivalDeferred(int Slot, string Group, int ArrivalIndex) : GameEvent
    {
        public override string Id => "ev.arrival_deferred";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record ArrivalCancelled(int Slot, int ArrivalIndex, string Reason) : GameEvent
    {
        public override string Id => "ev.arrival_cancelled";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>
    /// A site changed hands. <c>Via</c> is <see cref="ViaRaid"/> (a raid that would destroy a protected site) or
    /// <see cref="ViaCapture"/> (an ordinary capture; spec 06 lists only "raid", so the theme template must not branch on it).
    /// Delivered to <c>From</c> and <c>TakerSlot</c> only (spec 06 section 8); the theme picks gained or lost by comparing slots.
    /// </summary>
    public sealed record SiteTaken(string Site, int From, int TakerSlot, string Via) : GameEvent
    {
        public const string ViaRaid = "raid";
        public const string ViaCapture = "capture";

        public override string Id => "ev.site_taken";

        public override EventVisibility Visibility => EventVisibility.Parties;

        public override bool VisibleTo(int slot) => slot == From || slot == TakerSlot;
    }

    public sealed record SeasonStarted(string Season) : GameEvent
    {
        public override string Id => "ev.season_started";
    }

    public sealed record FactionEliminated(int Slot, string Reason, int Turns) : GameEvent
    {
        public override string Id => "ev.faction_eliminated";
    }

    public sealed record FactionSurrendered(int Slot, int Turn) : GameEvent
    {
        public override string Id => "ev.faction_surrendered";
    }

    public sealed record MatchWon(int WinnerSlot, string Reason) : GameEvent
    {
        public override string Id => "ev.match_won";
    }

    public sealed record MatchDrawn(string Reason) : GameEvent
    {
        public override string Id => "ev.match_drawn";
    }

    public sealed record TimedEffectStarted(string EffectId, int TargetSlot) : GameEvent
    {
        public override string Id => "ev.timed_effect_started";
    }

    public sealed record UnitHealed(int Unit, int Amount, string Building, int Slot) : GameEvent
    {
        public override string Id => "ev.unit_healed";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>Death-neutral shortage outcome. <c>Cause</c> is "shortage" only.</summary>
    public sealed record PopLost(int Base, int Amount, string Cause, int Slot) : GameEvent
    {
        public override string Id => "ev.pop_lost";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record FoodShortage(int Base, int Slot) : GameEvent
    {
        public override string Id => "warn.food_shortage";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    // ----- events emitted by the Map/Turn core -----

    public sealed record UnitMoved(int Unit, TileCoord From, TileCoord To, int Slot) : GameEvent
    {
        public override string Id => "ev.unit_moved";
    }

    public sealed record BaseFounded(int Base, int Owner, TileCoord Pos) : GameEvent
    {
        public override string Id => "ev.base_founded";
    }

    public sealed record BuildingOrdered(int Base, BuildingRole Role, int Level, int Slot) : GameEvent
    {
        public override string Id => "ev.building_ordered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record CoreUpgradeOrdered(int Base, int Level, int Slot) : GameEvent
    {
        public override string Id => "ev.core_upgrade_ordered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record AttackCancelled(int Slot, string Reason) : GameEvent
    {
        public override string Id => "ev.attack_cancelled";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record UnitDestroyed(int Unit, int Owner) : GameEvent
    {
        public override string Id => "ev.unit_destroyed";
    }

    public sealed record TurnEnded(int Turn) : GameEvent
    {
        public override string Id => "ev.turn_ended";
    }
}
