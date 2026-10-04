using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// A unit. <c>AttachedBase</c> is the base that houses it (0 = none; garrisons and scouts), <c>Leader</c> the commander
    /// that carries it (0 = none; it moves with the leader), <c>Reputation</c> a commander's record 0 to 10 (GDD 11.5).
    /// </summary>
    public sealed record Unit(
        int Id,
        int Owner,
        UnitRole Role,
        int Level,
        int Strength,
        TileCoord Pos,
        int MovesLeft,
        int AttachedBase = 0,
        int Leader = 0,
        int Reputation = 0);

    /// <summary>
    /// A building. Functional when <c>turn >= ReadyTurn</c>. A pending upgrade (<c>PendingLevel &gt; 0</c>) is applied at the
    /// deferred step (GDD 6.3 step 2) of the turn it becomes ready.
    /// </summary>
    public sealed record Building(BuildingRole Role, int Level, TileCoord Pos, int ReadyTurn, int PendingLevel);

    public sealed record Base(
        int Id,
        int Owner,
        TileCoord Pos,
        string? SiteId,
        int CoreLevel,
        int PendingCoreLevel,
        int CoreReadyTurn,
        ResourceVector Stock,
        ImmArray<Building> Buildings);

    public sealed record FactionState(int Slot, bool Eliminated, bool EndedTurn);

    /// <summary>A queued attack (GDD 6.1): fires at end of turn if the target is still within reach.</summary>
    public sealed record AttackOrder(int Slot, ImmArray<int> UnitIds, TileCoord Target, AttackKind Kind = AttackKind.Capture);

    /// <summary>A recruit paid for this turn; the unit appears at the base when the turn resolves (GDD 7.1).</summary>
    public sealed record RecruitOrder(int BaseId, UnitRole Role, int Level);

    /// <summary>
    /// A patron trade in flight (GDD 9). <c>Paid</c> is what the slot gave up at order time (coin for a buy, the goods for a
    /// sell); it is refunded when a cut link cancels the order. It is delivered when the turn resolves at <c>DeliverTurn</c>.
    /// </summary>
    public sealed record PatronOrder(int BaseId, int Slot, Resource Resource, int Amount, bool Buy, ResourceVector Paid, int DeliverTurn);

    /// <summary>What a slot knows about somebody else's base (spec 06 H2 intel seed). <c>Level</c> and <c>FortCount</c> are -1 when unknown.</summary>
    public sealed record IntelRecord(int Viewer, int BaseId, string? SiteId, TileCoord Pos, int Owner, int Level, int FortCount, int TurnSeen);

    public sealed record ExtEntry(string Key, long Value);
}
