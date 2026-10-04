namespace Conquest.Core.Contracts
{
    /// <summary>
    /// Read-only projection of a unit. <c>Strength</c> is hit points and attack strength (GDD 11.1). The trailing fields are
    /// optional so older callers keep working: <c>MaxStrength</c> is the strength a full heal reaches (0 = not supplied),
    /// <c>AttachedBase</c> is the base that houses the unit (0 = none), <c>Leader</c> the commander carrying it (0 = none),
    /// <c>Reputation</c> a commander's record, 0 to 10 (GDD 11.5).
    /// </summary>
    public sealed record UnitView(
        int Id,
        int Owner,
        UnitRole Role,
        int Level,
        int Strength,
        TileCoord Pos,
        int MovesLeft,
        int MaxStrength = 0,
        int AttachedBase = 0,
        int Leader = 0,
        int Reputation = 0);

    /// <summary>Read-only projection of a building. It is functional when <c>turn >= ReadyTurn</c> (GDD 8.6).</summary>
    public sealed record BuildingView(BuildingRole Role, int Level, TileCoord Pos, int ReadyTurn);

    /// <summary>Read-only projection of a base (colony). <c>SiteId</c> is null unless a scenario pre-placed it (spec 06 H2).</summary>
    public sealed record BaseView(
        int Id,
        int Owner,
        TileCoord Pos,
        string? SiteId,
        int CoreLevel,
        ResourceVector Stock,
        ImmArray<BuildingView> Buildings,
        int PendingCoreLevel = 0);
}
