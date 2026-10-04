using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>Writes a <see cref="GameState"/> as the canonical JSON <c>state</c> object (every field, defaults included).</summary>
    internal static class GameStateWriter
    {
        public static void Write(JsonText w, GameState s)
        {
            w.BeginObject("state");
            w.Int("turn", s.Turn).UInt("seed", s.Seed).UInt("rng", s.Rng.State).Int("slots", s.SlotCount);
            w.Int("next_unit", s.NextUnitId).Int("next_base", s.NextBaseId);
            w.Bool("over", s.MatchOver).Int("winner", s.WinnerSlot);
            WriteMap(w, s);
            WriteFactions(w, s);
            WriteUnits(w, s);
            WriteBases(w, s);
            WriteQueues(w, s);
            w.BeginArray("ext");
            for (int i = 0; i < s.Ext.Count; i++)
            {
                w.BeginObject().Str("k", s.Ext[i].Key).Int("v", s.Ext[i].Value).EndObject();
            }

            w.EndArray().EndObject();
        }

        private static void WriteMap(JsonText w, GameState s)
        {
            var tiles = new char[s.Width * s.Height];
            for (int y = 0; y < s.Height; y++)
            {
                for (int x = 0; x < s.Width; x++)
                {
                    tiles[(y * s.Width) + x] = (char)('0' + (int)s.TerrainAt(new TileCoord(x, y)));
                }
            }

            w.BeginObject("map").Int("w", s.Width).Int("h", s.Height).Str("tiles", new string(tiles)).EndObject();
        }

        private static void WriteFactions(JsonText w, GameState s)
        {
            w.BeginArray("factions");
            for (int i = 0; i < s.Factions.Count; i++)
            {
                w.BeginObject().Bool("elim", s.Factions[i].Eliminated).Bool("ended", s.Factions[i].EndedTurn).EndObject();
            }

            w.EndArray();
        }

        private static void WriteUnits(JsonText w, GameState s)
        {
            w.BeginArray("units");
            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                Unit u = s.UnitTable[i];
                w.BeginObject().Int("id", u.Id).Int("owner", u.Owner).Str("role", RoleIds.Of(u.Role)).Int("level", u.Level);
                w.Int("strength", u.Strength).Int("x", u.Pos.X).Int("y", u.Pos.Y).Int("moves", u.MovesLeft);
                w.Int("base", u.AttachedBase).Int("leader", u.Leader).Int("rep", u.Reputation).EndObject();
            }

            w.EndArray();
        }

        private static void WriteBases(JsonText w, GameState s)
        {
            w.BeginArray("bases");
            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                Base b = s.BaseTable[i];
                w.BeginObject().Int("id", b.Id).Int("owner", b.Owner).Int("x", b.Pos.X).Int("y", b.Pos.Y).NullableStr("site", b.SiteId);
                w.Int("core", b.CoreLevel).Int("pending_core", b.PendingCoreLevel).Int("core_ready", b.CoreReadyTurn);
                WriteStock(w, "stock", b.Stock);
                w.BeginArray("buildings");
                for (int k = 0; k < b.Buildings.Count; k++)
                {
                    Building x = b.Buildings[k];
                    w.BeginObject().Str("role", RoleIds.Of(x.Role)).Int("level", x.Level).Int("x", x.Pos.X).Int("y", x.Pos.Y);
                    w.Int("ready", x.ReadyTurn).Int("pending", x.PendingLevel).EndObject();
                }

                w.EndArray().EndObject();
            }

            w.EndArray();
        }

        private static void WriteStock(JsonText w, string key, ResourceVector v)
        {
            w.BeginArray(key).Item(v.Basic).Item(v.Hard).Item(v.Coin).Item(v.Wares).Item(v.Food).Item(v.Pop).EndArray();
        }

        private static void WriteQueues(JsonText w, GameState s)
        {
            w.BeginArray("attacks");
            for (int i = 0; i < s.Attacks.Count; i++)
            {
                AttackOrder a = s.Attacks[i];
                w.BeginObject().Int("slot", a.Slot).Int("x", a.Target.X).Int("y", a.Target.Y).Int("kind", (int)a.Kind);
                w.BeginArray("units");
                for (int k = 0; k < a.UnitIds.Count; k++)
                {
                    w.Item(a.UnitIds[k]);
                }

                w.EndArray().EndObject();
            }

            w.EndArray().BeginArray("recruits");
            for (int i = 0; i < s.Recruits.Count; i++)
            {
                RecruitOrder r = s.Recruits[i];
                w.BeginObject().Int("base", r.BaseId).Str("role", RoleIds.Of(r.Role)).Int("level", r.Level).EndObject();
            }

            w.EndArray().BeginArray("patron");
            for (int i = 0; i < s.PatronOrders.Count; i++)
            {
                PatronOrder p = s.PatronOrders[i];
                w.BeginObject().Int("base", p.BaseId).Int("slot", p.Slot).Str("resource", RoleIds.Of(p.Resource)).Int("amount", p.Amount);
                w.Bool("buy", p.Buy).Int("due", p.DeliverTurn);
                WriteStock(w, "paid", p.Paid);
                w.EndObject();
            }

            w.EndArray().BeginArray("intel");
            for (int i = 0; i < s.Intel.Count; i++)
            {
                IntelRecord k = s.Intel[i];
                w.BeginObject().Int("viewer", k.Viewer).Int("base", k.BaseId).NullableStr("site", k.SiteId).Int("x", k.Pos.X).Int("y", k.Pos.Y);
                w.Int("owner", k.Owner).Int("level", k.Level).Int("forts", k.FortCount).Int("seen", k.TurnSeen).EndObject();
            }

            w.EndArray();
        }
    }
}
