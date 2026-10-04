using System;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>Builds starting states and applies setup edits (scenario setup and tests). Each call returns a new state.</summary>
    public static class GameFactory
    {
        public const int MaxSlots = 6;

        public static GameState NewGame(GameMap map, ulong seed, int slotCount)
        {
            if (slotCount < 1 || slotCount > MaxSlots)
            {
                throw new ArgumentOutOfRangeException(nameof(slotCount), "Slots must be 1..6.");
            }

            var factions = new FactionState[slotCount];
            for (int i = 0; i < slotCount; i++)
            {
                factions[i] = new FactionState(i, false, false);
            }

            return new GameState(
                0,
                map,
                seed,
                RngState.FromSeed(seed),
                slotCount,
                1,
                1,
                ImmArray<Unit>.Empty,
                ImmArray<Base>.Empty,
                ImmArray<FactionState>.From(factions),
                ImmArray<AttackOrder>.Empty,
                ImmArray<ExtEntry>.Empty,
                false,
                -1);
        }

        /// <summary>Adds a unit with a fresh id, full strength and full movement. Throws for impossible setup (a programming error).</summary>
        public static GameState AddUnit(GameState s, int owner, UnitRole role, int level, TileCoord pos, out int id)
        {
            return AddUnit(s, owner, role, level, pos, 0, 0, out id);
        }

        /// <summary>As above, housed in a base (<paramref name="attachedBase"/>) and/or carried by a commander (<paramref name="leader"/>); 0 = none.</summary>
        public static GameState AddUnit(GameState s, int owner, UnitRole role, int level, TileCoord pos, int attachedBase, int leader, out int id)
        {
            if (owner < 0 || owner >= s.SlotCount)
            {
                throw new ArgumentOutOfRangeException(nameof(owner));
            }

            if (!s.InBounds(pos) || TerrainInfo.EntryCost(s.TerrainAt(pos), RoleIds.MoveClassOf(role)) == 0)
            {
                throw new ArgumentException("The unit cannot stand at " + pos + ".", nameof(pos));
            }

            id = s.NextUnitId;
            var unit = new Unit(id, owner, role, level, RuleTables.StartStrength(level), pos, RuleTables.MoveBudget(role, level), attachedBase, leader);
            return s with { NextUnitId = id + 1, UnitTable = s.UnitTable.Add(unit) };
        }

        public static GameState AddBase(GameState s, int owner, TileCoord pos, int coreLevel, ResourceVector stock, string? siteId, out int id)
        {
            if (owner < 0 || owner >= s.SlotCount)
            {
                throw new ArgumentOutOfRangeException(nameof(owner));
            }

            if (!s.InBounds(pos) || !TerrainInfo.IsBuildable(s.TerrainAt(pos)) || coreLevel < 1 || coreLevel > RuleTables.MaxLevel)
            {
                throw new ArgumentException("A base cannot be placed at " + pos + ".", nameof(pos));
            }

            id = s.NextBaseId;
            var b = new Base(id, owner, pos, siteId, coreLevel, 0, 0, stock, ImmArray<Building>.Empty);
            return s with { NextBaseId = id + 1, BaseTable = s.BaseTable.Add(b) };
        }

        /// <summary>Adds a finished building to a base (ready now).</summary>
        public static GameState AddBuilding(GameState s, int baseId, BuildingRole role, int level, TileCoord pos)
        {
            int bi = s.FindBaseIndex(baseId);
            if (bi < 0)
            {
                throw new ArgumentException("Unknown base.", nameof(baseId));
            }

            Base b = s.BaseTable[bi];
            return s.WithBase(b with { Buildings = b.Buildings.Add(new Building(role, level, pos, 0, 0)) });
        }
    }
}
