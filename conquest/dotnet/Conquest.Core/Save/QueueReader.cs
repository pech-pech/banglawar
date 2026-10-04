using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Json;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>Reads the order queues and intel records of the state.</summary>
    internal static class QueueReader
    {
        private const int Big = 1_000_000_000;

        public static ImmArray<AttackOrder> Attacks(JsonArray? a, ReadContext ctx)
        {
            var list = new List<AttackOrder>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? o = ObjectView.Of(a[i], ctx.Errors);
                if (o == null)
                {
                    continue;
                }

                int slot = o.Int("slot", 0, ctx.Slots - 1);
                TileCoord target = ctx.Tile(o);
                int kind = o.Int("kind", 0, 1);
                var ids = new List<int>();
                JsonArray? units = o.Array("units");
                for (int k = 0; units != null && k < units.Count; k++)
                {
                    ids.Add(units[k] is JsonInt n && n.Value > 0 && n.Value <= Big ? (int)n.Value : Reject(ctx, units[k]));
                }

                o.Finish();
                list.Add(new AttackOrder(slot, ImmArray<int>.From(ids), target, (AttackKind)kind));
            }

            return ImmArray<AttackOrder>.From(list);
        }

        private static int Reject(ReadContext ctx, JsonValue at)
        {
            ctx.Errors.Add(new SaveError(at.Pointer, SaveFormat.BadValue, "expected a unit id"));
            return 0;
        }

        public static ImmArray<RecruitOrder> Recruits(JsonArray? a, ReadContext ctx)
        {
            var list = new List<RecruitOrder>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? o = ObjectView.Of(a[i], ctx.Errors);
                if (o != null)
                {
                    list.Add(new RecruitOrder(o.Int("base", 1, Big), ctx.Role(o, "role"), o.Int("level", 1, RuleTables.MaxLevel)));
                    o.Finish();
                }
            }

            return ImmArray<RecruitOrder>.From(list);
        }

        public static ImmArray<PatronOrder> Patron(JsonArray? a, ReadContext ctx)
        {
            var list = new List<PatronOrder>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? o = ObjectView.Of(a[i], ctx.Errors);
                if (o == null)
                {
                    continue;
                }

                int baseId = o.Int("base", 1, Big);
                int slot = o.Int("slot", 0, ctx.Slots - 1);
                Resource resource = ctx.Resource(o, "resource");
                int amount = o.Int("amount", 1, Big);
                bool buy = o.Bool("buy");
                int due = o.Int("due", 0, Big);
                list.Add(new PatronOrder(baseId, slot, resource, amount, buy, ctx.Vector(o.Array("paid")), due));
                o.Finish();
            }

            return ImmArray<PatronOrder>.From(list);
        }

        public static ImmArray<IntelRecord> Intel(JsonArray? a, ReadContext ctx)
        {
            var list = new List<IntelRecord>();
            for (int i = 0; a != null && i < a.Count; i++)
            {
                ObjectView? o = ObjectView.Of(a[i], ctx.Errors);
                if (o == null)
                {
                    continue;
                }

                int viewer = o.Int("viewer", 0, ctx.Slots - 1);
                int baseId = o.Int("base", 1, Big);
                string? site = o.NullableStr("site");
                TileCoord pos = ctx.Tile(o);
                list.Add(new IntelRecord(viewer, baseId, site, pos, o.Int("owner", 0, ctx.Slots - 1), o.Int("level", -1, RuleTables.MaxLevel), o.Int("forts", -1, Big), o.Int("seen", -1, Big)));
                o.Finish();
            }

            return ImmArray<IntelRecord>.From(list);
        }
    }
}
