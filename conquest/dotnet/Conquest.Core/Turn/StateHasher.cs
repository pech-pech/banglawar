using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// The per-turn state hash (13 section 3.4): FNV-1a-64 over a canonical text built from an explicit field list,
    /// in a fixed order, tables in id order. Defaults are elided (<c>site</c> only when set). Never uses record hash codes.
    /// </summary>
    public static class StateHasher
    {
        public static ulong Hash(GameState s) => Canonical(s).Hash();

        public static string HashHex(GameState s) => Fnv1a64.ToHex(Hash(s));

        public static CanonicalWriter Canonical(GameState s)
        {
            var w = new CanonicalWriter();
            w.Open("game").Int("turn", s.Turn).UInt("seed", s.Seed).UInt("rng", s.Rng.State).Int("slots", s.SlotCount);
            w.UInt("map", s.Map.Fingerprint).Int("nu", s.NextUnitId).Int("nb", s.NextBaseId);
            if (s.MatchOver)
            {
                w.Int("over", 1).Int("winner", s.WinnerSlot);
            }

            for (int i = 0; i < s.Factions.Count; i++)
            {
                FactionState f = s.Factions[i];
                w.Open("f").Int("slot", f.Slot).Int("elim", f.Eliminated ? 1 : 0).Int("ended", f.EndedTurn ? 1 : 0).Close();
            }

            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                WriteUnit(w, s.UnitTable[i]);
            }

            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                WriteBase(w, s.BaseTable[i]);
            }

            for (int i = 0; i < s.Attacks.Count; i++)
            {
                AttackOrder a = s.Attacks[i];
                w.Open("atk").Int("slot", a.Slot).Int("x", a.Target.X).Int("y", a.Target.Y);
                if (a.Kind != AttackKind.Capture)
                {
                    w.Int("kind", (int)a.Kind);
                }

                for (int k = 0; k < a.UnitIds.Count; k++)
                {
                    w.Int("u", a.UnitIds[k]);
                }

                w.Close();
            }

            WriteQueues(w, s);
            for (int i = 0; i < s.Ext.Count; i++)
            {
                w.Open("ext").Str("k", s.Ext[i].Key).Int("v", s.Ext[i].Value).Close();
            }

            return w.Close();
        }

        /// <summary>Recruit orders, patron orders and intel records; all default-elided, so a game without them hashes as before.</summary>
        private static void WriteQueues(CanonicalWriter w, GameState s)
        {
            for (int i = 0; i < s.Recruits.Count; i++)
            {
                RecruitOrder r = s.Recruits[i];
                w.Open("rec").Int("b", r.BaseId).Str("r", RoleIds.Of(r.Role)).Int("l", r.Level).Close();
            }

            for (int i = 0; i < s.PatronOrders.Count; i++)
            {
                PatronOrder p = s.PatronOrders[i];
                w.Open("pat").Int("b", p.BaseId).Int("o", p.Slot).Str("r", RoleIds.Of(p.Resource)).Int("n", p.Amount).Int("buy", p.Buy ? 1 : 0);
                w.Int("due", p.DeliverTurn).Int("pb", p.Paid.Basic).Int("ph", p.Paid.Hard).Int("pc", p.Paid.Coin).Int("pw", p.Paid.Wares);
                w.Int("pf", p.Paid.Food).Int("pp", p.Paid.Pop).Close();
            }

            for (int i = 0; i < s.Intel.Count; i++)
            {
                IntelRecord k = s.Intel[i];
                w.Open("intel").Int("v", k.Viewer).Int("b", k.BaseId).Int("o", k.Owner).Int("x", k.Pos.X).Int("y", k.Pos.Y);
                w.Int("l", k.Level).Int("f", k.FortCount).Int("t", k.TurnSeen);
                if (k.SiteId != null)
                {
                    w.Str("site", k.SiteId);
                }

                w.Close();
            }
        }

        private static void WriteUnit(CanonicalWriter w, Unit u)
        {
            w.Open("u").Int("id", u.Id).Int("o", u.Owner).Str("r", RoleIds.Of(u.Role)).Int("l", u.Level).Int("s", u.Strength);
            w.Int("x", u.Pos.X).Int("y", u.Pos.Y).Int("m", u.MovesLeft);
            if (u.AttachedBase != 0)
            {
                w.Int("ab", u.AttachedBase);
            }

            if (u.Leader != 0)
            {
                w.Int("ld", u.Leader);
            }

            if (u.Reputation != 0)
            {
                w.Int("rep", u.Reputation);
            }

            w.Close();
        }

        private static void WriteBase(CanonicalWriter w, Base b)
        {
            w.Open("b").Int("id", b.Id).Int("o", b.Owner).Int("x", b.Pos.X).Int("y", b.Pos.Y).Int("core", b.CoreLevel);
            if (b.SiteId != null)
            {
                w.Str("site", b.SiteId);
            }

            if (b.PendingCoreLevel > 0)
            {
                w.Int("pcore", b.PendingCoreLevel).Int("crt", b.CoreReadyTurn);
            }

            ResourceVector k = b.Stock;
            w.Int("basic", k.Basic).Int("hard", k.Hard).Int("coin", k.Coin).Int("wares", k.Wares).Int("food", k.Food).Int("pop", k.Pop);
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                Building x = b.Buildings[i];
                w.Open("bld").Str("r", RoleIds.Of(x.Role)).Int("l", x.Level).Int("x", x.Pos.X).Int("y", x.Pos.Y).Int("rt", x.ReadyTurn);
                if (x.PendingLevel > 0)
                {
                    w.Int("pl", x.PendingLevel);
                }

                w.Close();
            }

            w.Close();
        }
    }
}
