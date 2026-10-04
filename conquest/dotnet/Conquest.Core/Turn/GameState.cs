using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// The complete simulation state. Immutable: every change produces a new instance with <c>with</c>.
    /// Unit and base tables are sorted by ascending id. The terrain <see cref="Map"/> is shared by reference.
    /// </summary>
    public sealed record GameState(
        int Turn,
        GameMap Map,
        ulong Seed,
        RngState Rng,
        int SlotCount,
        int NextUnitId,
        int NextBaseId,
        ImmArray<Unit> UnitTable,
        ImmArray<Base> BaseTable,
        ImmArray<FactionState> Factions,
        ImmArray<AttackOrder> Attacks,
        ImmArray<ExtEntry> Ext,
        bool MatchOver,
        int WinnerSlot,
        ImmArray<RecruitOrder> Recruits = default,
        ImmArray<PatronOrder> PatronOrders = default,
        ImmArray<IntelRecord> Intel = default) : IGameStateView
    {
        public int Width => Map.Width;

        public int Height => Map.Height;

        IReadOnlyList<UnitView> IGameStateView.Units => ProjectUnits(null);

        IReadOnlyList<BaseView> IGameStateView.Bases => BaseViews();

        public bool InBounds(TileCoord c) => Map.InBounds(c);

        public Terrain TerrainAt(TileCoord c) => Map.TerrainAt(c);

        public bool TryGetUnit(int id, out UnitView unit)
        {
            int i = FindUnitIndex(id);
            unit = i < 0 ? null! : ToView(UnitTable[i]);
            return i >= 0;
        }

        public bool TryGetBase(int id, out BaseView baseView)
        {
            int i = FindBaseIndex(id);
            baseView = i < 0 ? null! : ToView(BaseTable[i]);
            return i >= 0;
        }

        public IReadOnlyList<UnitView> UnitsAt(TileCoord c) => ProjectUnits(c);

        public bool TryGetBaseAt(TileCoord c, out BaseView baseView)
        {
            int i = FindBaseIndexAt(c);
            baseView = i < 0 ? null! : ToView(BaseTable[i]);
            return i >= 0;
        }

        public bool IsEliminated(int slot) => slot >= 0 && slot < Factions.Count && Factions[slot].Eliminated;

        public long GetExt(string key)
        {
            for (int i = 0; i < Ext.Count; i++)
            {
                if (string.Equals(Ext[i].Key, key, StringComparison.Ordinal))
                {
                    return Ext[i].Value;
                }
            }

            return 0;
        }

        /// <summary>Sets a counter, keeping the table sorted by ordinal key. A value of 0 removes the entry (default elision).</summary>
        public GameState WithExt(string key, long value)
        {
            ImmArray<ExtEntry> table = Ext;
            for (int i = 0; i < table.Count; i++)
            {
                int cmp = string.CompareOrdinal(table[i].Key, key);
                if (cmp == 0)
                {
                    return this with { Ext = value == 0 ? table.RemoveAt(i) : table.SetItem(i, new ExtEntry(key, value)) };
                }

                if (cmp > 0)
                {
                    return value == 0 ? this : this with { Ext = table.Insert(i, new ExtEntry(key, value)) };
                }
            }

            return value == 0 ? this : this with { Ext = table.Add(new ExtEntry(key, value)) };
        }

        public int FindUnitIndex(int id)
        {
            int lo = 0;
            int hi = UnitTable.Count - 1;
            while (lo <= hi)
            {
                int mid = IntMath.Midpoint(lo, hi);
                int cmp = UnitTable[mid].Id.CompareTo(id);
                if (cmp == 0)
                {
                    return mid;
                }

                if (cmp < 0)
                {
                    lo = mid + 1;
                }
                else
                {
                    hi = mid - 1;
                }
            }

            return -1;
        }

        public int FindBaseIndex(int id)
        {
            int lo = 0;
            int hi = BaseTable.Count - 1;
            while (lo <= hi)
            {
                int mid = IntMath.Midpoint(lo, hi);
                int cmp = BaseTable[mid].Id.CompareTo(id);
                if (cmp == 0)
                {
                    return mid;
                }

                if (cmp < 0)
                {
                    lo = mid + 1;
                }
                else
                {
                    hi = mid - 1;
                }
            }

            return -1;
        }

        public int FindBaseIndexAt(TileCoord c)
        {
            for (int i = 0; i < BaseTable.Count; i++)
            {
                if (BaseTable[i].Pos == c)
                {
                    return i;
                }
            }

            return -1;
        }

        public GameState WithUnit(Unit unit)
        {
            int i = FindUnitIndex(unit.Id);
            return this with { UnitTable = UnitTable.SetItem(i, unit) };
        }

        public GameState WithBase(Base value)
        {
            int i = FindBaseIndex(value.Id);
            return this with { BaseTable = BaseTable.SetItem(i, value) };
        }

        /// <summary>Removes a unit and releases the units it carried (a carried unit keeps its place and is simply unattached).</summary>
        public GameState WithoutUnit(int id)
        {
            int i = FindUnitIndex(id);
            if (i < 0)
            {
                return this;
            }

            ImmArray<Unit> table = UnitTable.RemoveAt(i);
            for (int k = 0; k < table.Count; k++)
            {
                if (table[k].Leader == id)
                {
                    table = table.SetItem(k, table[k] with { Leader = 0 });
                }
            }

            return this with { UnitTable = table };
        }

        /// <summary>Removes a base and releases the units it housed.</summary>
        public GameState WithoutBase(int id)
        {
            int i = FindBaseIndex(id);
            if (i < 0)
            {
                return this;
            }

            ImmArray<Unit> table = UnitTable;
            for (int k = 0; k < table.Count; k++)
            {
                if (table[k].AttachedBase == id)
                {
                    table = table.SetItem(k, table[k] with { AttachedBase = 0 });
                }
            }

            return this with { BaseTable = BaseTable.RemoveAt(i), UnitTable = table };
        }

        public static UnitView ToView(Unit u) => new UnitView(
            u.Id, u.Owner, u.Role, u.Level, u.Strength, u.Pos, u.MovesLeft, RuleTables.MaxStrengthOf(u.Level, u.Strength), u.AttachedBase, u.Leader, u.Reputation);

        public static BaseView ToView(Base b)
        {
            var buildings = new List<BuildingView>(b.Buildings.Count);
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                buildings.Add(new BuildingView(x.Role, x.Level, x.Pos, x.ReadyTurn));
            }

            return new BaseView(b.Id, b.Owner, b.Pos, b.SiteId, b.CoreLevel, b.Stock, ImmArray<BuildingView>.From(buildings), b.PendingCoreLevel);
        }

        private IReadOnlyList<UnitView> ProjectUnits(TileCoord? at)
        {
            var list = new List<UnitView>();
            for (int i = 0; i < UnitTable.Count; i++)
            {
                if (at == null || UnitTable[i].Pos == at.Value)
                {
                    list.Add(ToView(UnitTable[i]));
                }
            }

            return list;
        }

        private IReadOnlyList<BaseView> BaseViews()
        {
            var list = new List<BaseView>(BaseTable.Count);
            for (int i = 0; i < BaseTable.Count; i++)
            {
                list.Add(ToView(BaseTable[i]));
            }

            return list;
        }
    }
}
