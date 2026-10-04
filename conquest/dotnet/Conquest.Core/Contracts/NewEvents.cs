namespace Conquest.Core.Contracts
{
    // Events added after the first contract (recruiting, completed buildings, attacks, patron trade, intel).
    // Ids follow the "ev." naming of Events.cs; none has free text. Owner events go to one slot only.

    /// <summary>A unit appeared: <c>Cause</c> is "recruit" (finished recruit order) or "arrival" (scenario arrival, spec 06 H1).</summary>
    public sealed record UnitSpawned(int Unit, int Owner, UnitRole Role, int Level, TileCoord Pos, string Cause) : GameEvent
    {
        public const string CauseRecruit = "recruit";
        public const string CauseArrival = "arrival";

        public override string Id => "ev.unit_spawned";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Owner;
    }

    public sealed record RecruitOrdered(int Base, UnitRole Role, int Level, int Slot) : GameEvent
    {
        public override string Id => "ev.recruit_ordered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>A building order or building upgrade became functional.</summary>
    public sealed record BuildingCompleted(int Base, BuildingRole Role, int Level, int Slot) : GameEvent
    {
        public override string Id => "ev.building_completed";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record CoreUpgradeCompleted(int Base, int Level, int Slot) : GameEvent
    {
        public override string Id => "ev.core_upgrade_completed";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>An attack order was queued (owner only; the target and units are not shown to opponents until it fires).</summary>
    public sealed record AttackOrdered(int Slot, ImmArray<int> Units, TileCoord Target, AttackKind Kind) : GameEvent
    {
        public override string Id => "ev.attack_ordered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>
    /// A queued attack fired and was resolved at the end of the turn. <c>Winner</c> is "attacker", "defender" or "none";
    /// the per-unit results follow as <c>ev.unit_destroyed</c> and the other battle events. Public (both sides saw it).
    /// </summary>
    public sealed record AttackResolved(
        int AttackerSlot,
        int DefenderSlot,
        TileCoord Target,
        ImmArray<int> Attackers,
        ImmArray<int> Defenders,
        AttackKind Kind,
        string Winner) : GameEvent
    {
        public const string WinnerAttacker = "attacker";
        public const string WinnerDefender = "defender";
        public const string WinnerNone = "none";

        public override string Id => "ev.attack_resolved";
    }

    /// <summary>A raid carried stock away; <c>Seized</c> was credited to the raider's base <c>ToBase</c> (0 = no base to receive it).</summary>
    public sealed record RaidSpoilsTaken(int FromBase, int ToBase, int TakerSlot, ResourceVector Seized) : GameEvent
    {
        public override string Id => "ev.raid_spoils";
    }

    public sealed record UnitRetreated(int Unit, TileCoord From, TileCoord To, int Owner) : GameEvent
    {
        public override string Id => "ev.unit_retreated";
    }

    public sealed record PatronOrdered(int Base, Resource Resource, int Amount, bool Buy, int Slot) : GameEvent
    {
        public override string Id => "ev.patron_ordered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    public sealed record PatronDelivered(int Base, Resource Resource, int Amount, bool Buy, int Slot) : GameEvent
    {
        public override string Id => "ev.patron_delivered";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }

    /// <summary>A patron order was cancelled and refunded (<c>Reason</c> "patron_link_cut" or "base_lost").</summary>
    public sealed record PatronCancelled(int Base, Resource Resource, int Amount, bool Buy, int Slot, string Reason) : GameEvent
    {
        public override string Id => "ev.patron_cancelled";

        public override EventVisibility Visibility => EventVisibility.Owner;

        public override int OwnerSlot => Slot;
    }
}
