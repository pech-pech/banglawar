using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Json;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>Reads the canonical <c>state</c> object back into a <see cref="GameState"/>, checking ranges, order and references.</summary>
    internal static class GameStateReader
    {
        private const int Big = 1_000_000_000;

        public static GameState? Read(ObjectView o, List<SaveError> errors)
        {
            int before = errors.Count;
            int turn = o.Int("turn", 0, Big);
            ulong seed = o.ULong("seed");
            ulong rng = o.ULong("rng");
            int slots = o.Int("slots", 1, GameFactory.MaxSlots);
            int nextUnit = o.Int("next_unit", 1, Big);
            int nextBase = o.Int("next_base", 1, Big);
            bool over = o.Bool("over");
            int winner = o.Int("winner", -1, GameFactory.MaxSlots);
            GameMap? map = ReadMap(o.Child("map"), errors);
            ImmArray<FactionState> factions = ReadFactions(o.Array("factions"), slots, errors);
            if (map == null)
            {
                return null;
            }

            var ctx = new ReadContext(map, slots, errors);
            ImmArray<Unit> units = ReadUnits(o.Array("units"), ctx, nextUnit);
            ImmArray<Base> bases = ReadBases(o.Array("bases"), ctx, nextBase);
            var state = new GameState(
                turn, map, seed, new RngState(rng), slots, nextUnit, nextBase, units, bases, factions,
                QueueReader.Attacks(o.Array("attacks"), ctx), ReadExt(o.Array("ext"), errors), over, winner,
                QueueReader.Recruits(o.Array("recruits"), ctx), QueueReader.Patron(o.Array("patron"), ctx), QueueReader.Intel(o.Array("intel"), ctx));
            o.Finish();
            if (errors.Count == before)
            {
                IntegrityCheck.Run(state, errors);
            }

            return errors.Count == before ? state : null;
        }

        private static GameMap? ReadMap(ObjectView? m, List<SaveError> errors)
        {
            if (m == null)
            {
                return null;
            }

            int w = m.Int("w", 1, GameMap.MaxSize);
            int h = m.Int("h", 1, GameMap.MaxSize);
            string tiles = m.Str("tiles");
            m.Finish();
            if (tiles.Length != w * h)
            {
                m.Fail("tiles", SaveFormat.BadValue, "tile count does not match the size");
                return null;
            }

            var terrain = new Terrain[tiles.Length];
            for (int i = 0; i < tiles.Length; i++)
            {
                int code = tiles[i] - '0';
                if (code < 0 || code > (int)Terrain.Peak)
                {
                    m.Fail("tiles", SaveFormat.BadValue, "unknown terrain code");
                    return null;
                }

                terrain[i] = (Terrain)code;
            }

            return GameMap.Create(w, h, terrain);
        }

        private static ImmArray<FactionState> ReadFactions(JsonArray? a, int slots, List<SaveError> errors)
        {
            var list = new List<FactionState>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? f = ObjectView.Of(a[i], errors);
                if (f != null)
                {
                    list.Add(new FactionState(i, f.Bool("elim"), f.Bool("ended")));
                    f.Finish();
                }
            }

            if (a != null && list.Count != slots)
            {
                errors.Add(new SaveError(a.Pointer, SaveFormat.BadValue, "one faction entry per slot is required"));
            }

            return ImmArray<FactionState>.From(list);
        }

        private static ImmArray<ExtEntry> ReadExt(JsonArray? a, List<SaveError> errors)
        {
            var list = new List<ExtEntry>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? e = ObjectView.Of(a[i], errors);
                if (e == null)
                {
                    continue;
                }

                string key = e.Str("k");
                long value = e.Long("v");
                e.Finish();
                if (list.Count > 0 && string.CompareOrdinal(list[list.Count - 1].Key, key) >= 0)
                {
                    e.Fail("k", SaveFormat.BadOrder, "ext keys must be strictly ascending (ordinal)");
                }

                if (value == 0)
                {
                    e.Fail("v", SaveFormat.BadValue, "a zero counter must not be stored");
                }

                list.Add(new ExtEntry(key, value));
            }

            return ImmArray<ExtEntry>.From(list);
        }

        private static ImmArray<Unit> ReadUnits(JsonArray? a, ReadContext ctx, int nextId)
        {
            var list = new List<Unit>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? u = ObjectView.Of(a[i], ctx.Errors);
                if (u == null)
                {
                    continue;
                }

                int id = u.Int("id", 1, nextId - 1);
                int owner = u.Int("owner", 0, ctx.Slots - 1);
                UnitRole role = ctx.Role(u, "role");
                TileCoord pos = ctx.Tile(u);
                var unit = new Unit(id, owner, role, u.Int("level", 1, RuleTables.MaxLevel), u.Int("strength", 1, Big), pos, u.Int("moves", 0, Big),
                    u.Int("base", 0, Big), u.Int("leader", 0, Big), u.Int("rep", 0, 10));
                u.Finish();
                ctx.Ascending(u, list.Count > 0 ? list[list.Count - 1].Id : 0, id);
                list.Add(unit);
            }

            return ImmArray<Unit>.From(list);
        }

        private static ImmArray<Base> ReadBases(JsonArray? a, ReadContext ctx, int nextId)
        {
            var list = new List<Base>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? b = ObjectView.Of(a[i], ctx.Errors);
                if (b == null)
                {
                    continue;
                }

                int id = b.Int("id", 1, nextId - 1);
                int owner = b.Int("owner", 0, ctx.Slots - 1);
                TileCoord pos = ctx.Tile(b);
                string? site = b.NullableStr("site");
                int core = b.Int("core", 1, RuleTables.MaxLevel);
                int pending = b.Int("pending_core", 0, RuleTables.MaxLevel);
                int coreReady = b.Int("core_ready", 0, Big);
                ResourceVector stock = ctx.Vector(b.Array("stock"));
                ImmArray<Building> buildings = ReadBuildings(b.Array("buildings"), ctx);
                b.Finish();
                ctx.Ascending(b, list.Count > 0 ? list[list.Count - 1].Id : 0, id);
                list.Add(new Base(id, owner, pos, site, core, pending, coreReady, stock, buildings));
            }

            return ImmArray<Base>.From(list);
        }

        private static ImmArray<Building> ReadBuildings(JsonArray? a, ReadContext ctx)
        {
            var list = new List<Building>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? v = ObjectView.Of(a[i], ctx.Errors);
                if (v == null)
                {
                    continue;
                }

                BuildingRole role = ctx.BuildingRole(v);
                int level = v.Int("level", 1, RuleTables.MaxLevel);
                TileCoord pos = ctx.Tile(v);
                list.Add(new Building(role, level, pos, v.Int("ready", 0, Big), v.Int("pending", 0, RuleTables.MaxLevel)));
                v.Finish();
            }

            return ImmArray<Building>.From(list);
        }
    }
}
