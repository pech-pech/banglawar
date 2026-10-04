using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>An immutable player command. Validated against the state by <see cref="CommandEngine"/>; never mutates it.</summary>
    public abstract record Command(int Slot);

    /// <summary>Moves a unit along the cheapest path that fits its remaining movement (GDD 5.1, 6.1).</summary>
    public sealed record MoveCommand(int Slot, int UnitId, TileCoord Target) : Command(Slot);

    /// <summary>A founder founds a base on its own tile (GDD 8.1).</summary>
    public sealed record FoundBaseCommand(int Slot, int UnitId) : Command(Slot);

    /// <summary>Places a level-1 building; it becomes functional next turn (GDD 8.6). Cost is paid now.</summary>
    public sealed record BuildCommand(int Slot, int BaseId, BuildingRole Role, TileCoord At) : Command(Slot);

    /// <summary>Upgrades building number <c>BuildingIndex</c>, or the Colony Center when it is -1.</summary>
    public sealed record UpgradeCommand(int Slot, int BaseId, int BuildingIndex) : Command(Slot);

    /// <summary>Queues an attack on a tile; it resolves when all players have ended the turn (GDD 6.1).</summary>
    public sealed record AttackCommand(int Slot, ImmArray<int> UnitIds, TileCoord Target, AttackKind Kind = AttackKind.Capture) : Command(Slot);

    /// <summary>Recruits a unit at a base. The cost is paid now; the unit appears when the turn resolves (GDD 7.1).</summary>
    public sealed record RecruitCommand(int Slot, int BaseId, UnitRole Role, int Level) : Command(Slot);

    /// <summary>Orders goods from (<c>Buy</c>) or to (<c>!Buy</c>) the patron through the base's port (GDD 9).</summary>
    public sealed record PatronTradeCommand(int Slot, int BaseId, Resource Resource, int Amount, bool Buy) : Command(Slot);

    /// <summary>Releases a unit from the commander that carries it and from the base that houses it.</summary>
    public sealed record DetachCommand(int Slot, int UnitId) : Command(Slot);

    /// <summary>Ends the slot's turn. When every active slot has ended, the turn resolves.</summary>
    public sealed record EndTurnCommand(int Slot) : Command(Slot);

    /// <summary>The outcome of a command: a new state with events, or the unchanged state with an error code.</summary>
    public sealed class CommandResult
    {
        private CommandResult(bool ok, GameState state, ImmArray<GameEvent> events, string? error)
        {
            Ok = ok;
            State = state;
            Events = events;
            Error = error;
        }

        public bool Ok { get; }

        public GameState State { get; }

        public ImmArray<GameEvent> Events { get; }

        /// <summary>An <c>err.*</c> code, or null on success.</summary>
        public string? Error { get; }

        public static CommandResult Success(GameState state, ImmArray<GameEvent> events) => new CommandResult(true, state, events, null);

        public static CommandResult Failure(GameState unchanged, string error) =>
            new CommandResult(false, unchanged, ImmArray<GameEvent>.Empty, error);
    }

    /// <summary>Error codes returned in <see cref="CommandResult.Error"/>.</summary>
    public static class Err
    {
        public const string MatchOver = "err.match_over";
        public const string BadSlot = "err.bad_slot";
        public const string Eliminated = "err.eliminated";
        public const string AlreadyEnded = "err.already_ended";
        public const string UnknownUnit = "err.unknown_unit";
        public const string UnknownBase = "err.unknown_base";
        public const string NotOwner = "err.not_owner";
        public const string OutOfBounds = "err.out_of_bounds";
        public const string Impassable = "err.impassable";
        public const string Unreachable = "err.unreachable";
        public const string WrongRole = "err.wrong_role";
        public const string IllegalSite = "err.illegal_site";
        public const string TooCloseToBase = "err.too_close_to_base";
        public const string OutsideArea = "err.outside_area";
        public const string TileOccupied = "err.tile_occupied";
        public const string NotEnoughResources = "err.not_enough_resources";
        public const string MaxLevel = "err.max_level";
        public const string CenterTooLow = "err.center_too_low";
        public const string NotReady = "err.not_ready";
        public const string UnknownBuilding = "err.unknown_building";
        public const string NoTarget = "err.no_target";
        public const string OutOfReach = "err.out_of_reach";
        public const string NoUnits = "err.no_units";
        public const string DuplicateBuilding = "err.duplicate_building";
        public const string NeedsWater = "err.needs_water";
        public const string FriendlyTarget = "err.friendly_target";
        public const string SupportCap = "err.support_cap";
        public const string NoBuilding = "err.no_building";
        public const string BadLevel = "err.bad_level";
        public const string BadAmount = "err.bad_amount";
        public const string NotTradable = "err.not_tradable";
        public const string ImportCap = "err.import_cap";
        public const string RegionCap = "err.region_cap";
    }
}
