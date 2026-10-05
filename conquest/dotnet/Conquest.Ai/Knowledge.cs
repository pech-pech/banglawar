using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Ai
{
    /// <summary>An enemy base the slot knows about: seen now, or remembered in its intel records (level -1 when unknown).</summary>
    public sealed class KnownBase
    {
        public KnownBase(TileCoord pos, int owner, int level, bool inView)
        {
            Pos = pos;
            Owner = owner;
            Level = level;
            InView = inView;
        }

        public TileCoord Pos { get; }

        public int Owner { get; }

        public int Level { get; }

        public bool InView { get; }
    }

    /// <summary>
    /// What one slot may know: its own units and bases (exact), enemy units only within sight of its own units and bases, and
    /// enemy bases that are in sight or recorded in its intel. It never reads an enemy unit, stock or base outside that.
    /// </summary>
    public sealed class Knowledge
    {
        private readonly GameState _state;

        private Knowledge(GameState state, int side, List<Unit> units, List<Base> bases, List<Unit> enemyUnits, List<KnownBase> enemyBases)
        {
            _state = state;
            Side = side;
            Units = units;
            Bases = bases;
            EnemyUnits = enemyUnits;
            EnemyBases = enemyBases;
        }

        public int Side { get; }

        public IReadOnlyList<Unit> Units { get; }

        public IReadOnlyList<Base> Bases { get; }

        public IReadOnlyList<Unit> EnemyUnits { get; }

        public IReadOnlyList<KnownBase> EnemyBases { get; }

        public static Knowledge Of(GameState state, int side)
        {
            var units = new List<Unit>();
            var bases = new List<Base>();
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                if (state.UnitTable[i].Owner == side)
                {
                    units.Add(state.UnitTable[i]);
                }
            }

            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                if (state.BaseTable[i].Owner == side)
                {
                    bases.Add(state.BaseTable[i]);
                }
            }

            var enemyUnits = new List<Unit>();
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                Unit u = state.UnitTable[i];
                if (u.Owner != side && InSight(units, bases, u.Pos))
                {
                    enemyUnits.Add(u);
                }
            }

            return new Knowledge(state, side, units, bases, enemyUnits, EnemyBasesOf(state, side, units, bases));
        }

        /// <summary>Whether a tile is within sight of an own unit or base.</summary>
        public bool CanSee(TileCoord tile) => InSight(Units, Bases, tile);

        public IReadOnlyList<Unit> EnemyUnitsAt(TileCoord tile)
        {
            var list = new List<Unit>();
            for (int i = 0; i < EnemyUnits.Count; i++)
            {
                if (EnemyUnits[i].Pos == tile)
                {
                    list.Add(EnemyUnits[i]);
                }
            }

            return list;
        }

        public bool IsTileTaken(TileCoord tile)
        {
            for (int i = 0; i < _state.UnitTable.Count; i++)
            {
                if (_state.UnitTable[i].Pos == tile && _state.UnitTable[i].Owner != Side && CanSee(tile))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool InSight(IReadOnlyList<Unit> units, IReadOnlyList<Base> bases, TileCoord tile) =>
            Conquest.Presentation.SightRules.InSight(units, bases, tile);

        private static List<KnownBase> EnemyBasesOf(GameState state, int side, List<Unit> units, List<Base> bases)
        {
            var list = new List<KnownBase>();
            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                Base b = state.BaseTable[i];
                if (b.Owner != side && InSight(units, bases, b.Pos))
                {
                    list.Add(new KnownBase(b.Pos, b.Owner, b.CoreLevel, true));
                }
            }

            for (int i = 0; i < state.Intel.Count; i++)
            {
                IntelRecord r = state.Intel[i];
                if (r.Viewer != side || r.Owner == side || InSight(units, bases, r.Pos) || Contains(list, r.Pos))
                {
                    continue;
                }

                list.Add(new KnownBase(r.Pos, r.Owner, r.Level, false));
            }

            list.Sort((a, b) => a.Pos.CompareTo(b.Pos));
            return list;
        }

        private static bool Contains(List<KnownBase> list, TileCoord pos)
        {
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i].Pos == pos)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
