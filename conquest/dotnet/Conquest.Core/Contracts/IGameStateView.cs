using System.Collections.Generic;

namespace Conquest.Core.Contracts
{
    /// <summary>
    /// Read-only queries over a game state. Everything Combat and Rules code may know about the world.
    /// Owners are slot indices (0 = f1, 1 = f2 ...). Lists are ordered by ascending id.
    /// </summary>
    public interface IGameStateView
    {
        int Turn { get; }

        int Width { get; }

        int Height { get; }

        int SlotCount { get; }

        IReadOnlyList<UnitView> Units { get; }

        IReadOnlyList<BaseView> Bases { get; }

        bool InBounds(TileCoord c);

        Terrain TerrainAt(TileCoord c);

        bool TryGetUnit(int id, out UnitView unit);

        bool TryGetBase(int id, out BaseView baseView);

        /// <summary>All units standing on the tile, ordered by id.</summary>
        IReadOnlyList<UnitView> UnitsAt(TileCoord c);

        bool TryGetBaseAt(TileCoord c, out BaseView baseView);

        bool IsEliminated(int slot);

        /// <summary>A named integer counter reserved for Rules code (for example <c>no_base_turns.f2</c>); 0 when never set.</summary>
        long GetExt(string key);
    }
}
