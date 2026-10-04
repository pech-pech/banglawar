using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>Pipeline step 1: every queued attack is resolved in queue order through <see cref="ICombatResolver"/>.</summary>
    internal static class BattleStep
    {
        public static GameState Run(GameState state, TurnServices services, List<GameEvent> events)
        {
            GameState s = state with { Attacks = ImmArray<AttackOrder>.Empty };
            for (int i = 0; i < state.Attacks.Count; i++)
            {
                s = ResolveOne(s, state.Attacks[i], services, events);
            }

            return s;
        }

        private static GameState ResolveOne(GameState s, AttackOrder order, TurnServices services, List<GameEvent> events)
        {
            if (services.Combat == null)
            {
                events.Add(new AttackCancelled(order.Slot, "no_resolver"));
                return s;
            }

            var attackers = new List<UnitView>();
            for (int k = 0; k < order.UnitIds.Count; k++)
            {
                int ui = s.FindUnitIndex(order.UnitIds[k]);
                if (ui >= 0 && s.UnitTable[ui].Pos.DistanceTo(order.Target) <= Attacks.Reach)
                {
                    attackers.Add(GameState.ToView(s.UnitTable[ui]));
                }
            }

            if (attackers.Count == 0)
            {
                events.Add(new AttackCancelled(order.Slot, "out_of_reach"));
                return s;
            }

            List<UnitView> defenders = Attacks.EnemyUnitsAt(s, order.Slot, order.Target);
            int bi = s.FindBaseIndexAt(order.Target);
            BaseView? targetBase = bi >= 0 && s.BaseTable[bi].Owner != order.Slot ? GameState.ToView(s.BaseTable[bi]) : null;
            if (defenders.Count == 0 && targetBase == null)
            {
                events.Add(new AttackCancelled(order.Slot, "target_gone"));
                return s;
            }

            int defenderSlot = defenders.Count > 0 ? defenders[0].Owner : targetBase!.Owner;
            GameState drawn = s with { Rng = s.Rng.Next(out ulong seed) };
            var ctx = new CombatContext(drawn, seed, order, defenderSlot, attackers, defenders, targetBase, services);
            CombatResult result = services.Combat.Resolve(ctx);
            events.Add(Summary(order, defenderSlot, attackers, defenders, result));
            return Apply(drawn, order, targetBase, result, events);
        }

        private static GameEvent Summary(AttackOrder order, int defenderSlot, List<UnitView> attackers, List<UnitView> defenders, CombatResult result)
        {
            return new AttackResolved(
                order.Slot,
                defenderSlot,
                order.Target,
                ImmArray<int>.From(Ids(attackers)),
                ImmArray<int>.From(Ids(defenders)),
                order.Kind,
                result.Winner == BattleWinner.Attacker ? AttackResolved.WinnerAttacker
                    : result.Winner == BattleWinner.Defender ? AttackResolved.WinnerDefender : AttackResolved.WinnerNone);
        }

        private static List<int> Ids(List<UnitView> units)
        {
            var ids = new List<int>(units.Count);
            for (int i = 0; i < units.Count; i++)
            {
                ids.Add(units[i].Id);
            }

            return ids;
        }

        private static GameState Apply(GameState drawn, AttackOrder order, BaseView? targetBase, CombatResult result, List<GameEvent> events)
        {
            GameState after = ChangeApplier.Units(drawn, result.UnitChanges, events);
            after = ChangeApplier.Reputation(after, result.Reputation);
            after = ChangeApplier.Retreats(after, result.Retreats, events);
            after = ChangeApplier.Base(after, result.BaseChange);
            for (int e = 0; e < result.Events.Count; e++)
            {
                events.Add(result.Events[e]);
            }

            return result.Spoils.HasValue && targetBase != null
                ? ChangeApplier.Spoils(after, order.Slot, targetBase.Id, result.Spoils.Value, events)
                : after;
        }
    }
}
