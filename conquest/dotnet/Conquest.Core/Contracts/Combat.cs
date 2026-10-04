using System.Collections.Generic;

namespace Conquest.Core.Contracts
{
    /// <summary>How a colony is attacked: capture needs a battle win, a raid takes spoils round by round (GDD 11.6).</summary>
    public enum AttackKind
    {
        Capture = 0,
        Raid = 1,
    }

    /// <summary>Which side won a resolved battle.</summary>
    public enum BattleWinner
    {
        None = 0,
        Attacker = 1,
        Defender = 2,
    }

    /// <summary>
    /// Everything a battle needs, as a snapshot. Rules code derives all randomness from
    /// <see cref="BattleSeed"/> with <c>Rng.Draw(BattleSeed, streamCode, round, key)</c>; it never reads a clock.
    /// </summary>
    public interface ICombatContext
    {
        int Turn { get; }

        /// <summary>Seed for this battle, drawn from the game's SplitMix64 state in resolution order.</summary>
        ulong BattleSeed { get; }

        int AttackerSlot { get; }

        int DefenderSlot { get; }

        /// <summary>The tile that was attacked.</summary>
        TileCoord Target { get; }

        Terrain TargetTerrain { get; }

        /// <summary>The attacking units that were within reach of the target at resolution (ordered by id).</summary>
        IReadOnlyList<UnitView> Attackers { get; }

        /// <summary>Every defending unit on the target tile (ordered by id).</summary>
        IReadOnlyList<UnitView> Defenders { get; }

        /// <summary>The base on the target tile, or null when a unit stack was attacked.</summary>
        BaseView? TargetBase { get; }

        IGameStateView State { get; }

        /// <summary>Capture or raid. Only meaningful when <see cref="TargetBase"/> is not null.</summary>
        AttackKind Kind { get; }

        /// <summary>Spec 06 H2 (C3): false when a raid must not destroy the target site (it becomes a capture instead).</summary>
        bool RaidCanDestroy { get; }

        /// <summary>False when the two archetypes may not capture each other's colonies (GDD 10).</summary>
        bool CaptureLegal { get; }

        /// <summary>Spec 06 H5: the timed panic modifier in per-mille for a slot's units, already looked up for this turn.</summary>
        int PanicModifierPermille(int slot, bool defendingBase);
    }

    /// <summary>A strength change for one unit. <c>NewStrength &lt;= 0</c> removes the unit. <c>NewPos</c> moves a retreating unit.</summary>
    public sealed record UnitChange(int UnitId, int NewStrength, TileCoord? NewPos);

    public enum BaseOutcome
    {
        Unchanged = 0,
        Captured = 1,
        Destroyed = 2,
    }

    /// <summary>A building level change inside a base. <c>NewLevel == 0</c> removes the building. <c>Index</c> is the index in <see cref="BaseView.Buildings"/>.</summary>
    public sealed record BuildingLevelChange(int Index, int NewLevel);

    /// <summary>
    /// A change to the attacked base. <c>NewOwner</c> applies when <c>Outcome == Captured</c>.
    /// <c>NewStock</c> (when not null) replaces the stock, <c>NewCoreLevel &lt; 0</c> means unchanged.
    /// </summary>
    public sealed record BaseChange(
        int BaseId,
        BaseOutcome Outcome,
        int NewOwner,
        ResourceVector? NewStock,
        int NewCoreLevel,
        ImmArray<BuildingLevelChange> BuildingChanges);

    /// <summary>A surviving unit of the losing side moves to a neighbouring tile after a lost battle.</summary>
    public sealed record UnitRetreat(int UnitId, TileCoord To);

    /// <summary>A commander's new reputation after a battle (GDD 11.5: +1 won, -1 lost, 0 to 10).</summary>
    public sealed record ReputationChange(int UnitId, int NewReputation);

    /// <summary>
    /// The outcome of one battle. <c>Spoils</c> is what a raid took from the target base; the turn pipeline credits it to the
    /// attacker's first base. <c>Retreats</c> and <c>Reputation</c> are optional extras; leave them empty when unused.
    /// </summary>
    public sealed record CombatResult(
        ImmArray<UnitChange> UnitChanges,
        BaseChange? BaseChange,
        ImmArray<GameEvent> Events,
        ImmArray<UnitRetreat> Retreats = default,
        ResourceVector? Spoils = null,
        BattleWinner Winner = BattleWinner.None,
        ImmArray<ReputationChange> Reputation = default)
    {
        public static CombatResult None { get; } = new CombatResult(ImmArray<UnitChange>.Empty, null, ImmArray<GameEvent>.Empty);
    }

    /// <summary>Implemented in <c>Conquest.Core.Combat</c> (Rules core B). Must be a pure function of the context.</summary>
    public interface ICombatResolver
    {
        CombatResult Resolve(ICombatContext context);
    }
}
