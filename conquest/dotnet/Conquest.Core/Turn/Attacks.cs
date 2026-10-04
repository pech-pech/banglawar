using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>Attack reach and target checks (ASSUMED reach: the target tile must be within 1 tile, 8-way).</summary>
    internal static class Attacks
    {
        public const int Reach = 1;

        /// <summary>Null when the tile holds an enemy unit or base; otherwise an error code.</summary>
        public static string? CheckTarget(GameState state, int slot, TileCoord tile)
        {
            bool friendly = false;
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                Unit u = state.UnitTable[i];
                if (u.Pos != tile)
                {
                    continue;
                }

                if (u.Owner != slot)
                {
                    return null;
                }

                friendly = true;
            }

            int b = state.FindBaseIndexAt(tile);
            if (b >= 0)
            {
                if (state.BaseTable[b].Owner != slot)
                {
                    return null;
                }

                friendly = true;
            }

            return friendly ? Err.FriendlyTarget : Err.NoTarget;
        }

        public static bool HasEnemyBase(GameState state, int slot, TileCoord tile)
        {
            int b = state.FindBaseIndexAt(tile);
            return b >= 0 && state.BaseTable[b].Owner != slot;
        }

        public static List<UnitView> EnemyUnitsAt(GameState state, int slot, TileCoord tile)
        {
            var list = new List<UnitView>();
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                Unit u = state.UnitTable[i];
                if (u.Pos == tile && u.Owner != slot)
                {
                    list.Add(GameState.ToView(u));
                }
            }

            return list;
        }
    }

    internal sealed class CombatContext : ICombatContext
    {
        private readonly TurnServices _services;

        public CombatContext(
            GameState state,
            ulong seed,
            AttackOrder order,
            int defenderSlot,
            IReadOnlyList<UnitView> attackers,
            IReadOnlyList<UnitView> defenders,
            BaseView? targetBase,
            TurnServices services)
        {
            State = state;
            BattleSeed = seed;
            AttackerSlot = order.Slot;
            DefenderSlot = defenderSlot;
            Target = order.Target;
            Attackers = attackers;
            Defenders = defenders;
            TargetBase = targetBase;
            Kind = order.Kind;
            _services = services;
        }

        public int Turn => State.Turn;

        public ulong BattleSeed { get; }

        public int AttackerSlot { get; }

        public int DefenderSlot { get; }

        public TileCoord Target { get; }

        public Terrain TargetTerrain => State.TerrainAt(Target);

        public IReadOnlyList<UnitView> Attackers { get; }

        public IReadOnlyList<UnitView> Defenders { get; }

        public BaseView? TargetBase { get; }

        public IGameStateView State { get; }

        public AttackKind Kind { get; }

        public bool RaidCanDestroy => TargetBase?.SiteId == null || _services.Scenario.RaidCanDestroy(TargetBase.SiteId);

        public bool CaptureLegal => _services.Scenario.CaptureLegal(AttackerSlot, DefenderSlot);

        public int PanicModifierPermille(int slot, bool defendingBase) => _services.TimedEffects.PanicModifier(slot, Turn, defendingBase);
    }
}
