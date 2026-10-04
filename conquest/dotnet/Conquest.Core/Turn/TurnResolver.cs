using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    public sealed record TurnOutcome(GameState State, ImmArray<GameEvent> Events);

    /// <summary>
    /// End-of-turn pipeline (GDD 6.3, spec 06 section 2): 1 battles, 2 deferred actions and recruits, 3 patron deliveries,
    /// 3a scenario arrivals for the next turn, 4 economy, 5 healing, 5a end conditions, 6 advance the turn (season and timed
    /// effect announcements). Pure: same state and services give the same result.
    /// </summary>
    public static class TurnResolver
    {
        public static TurnOutcome Resolve(GameState state, TurnServices services)
        {
            var events = new List<GameEvent>();
            GameState s = BattleStep.Run(state, services, events);
            s = DeferredStep.Run(s, events);
            s = PatronStep.Run(s, services, events);
            s = ArrivalStep.Run(s, services, s.Turn + 1, events);
            s = EconomyStep.Run(s, services.Hooks, services.Regions, events);
            s = Heal(s, services, events);
            s = CheckEnd(s, services, events);
            s = Advance(s, services, events);
            return new TurnOutcome(s, ImmArray<GameEvent>.From(events));
        }

        // ----- steps 5 and 5a -----

        private static GameState Heal(GameState s, TurnServices services, List<GameEvent> events)
        {
            if (services.Healing == null)
            {
                return s;
            }

            StepResult r = services.Healing.Compute(s);
            GameState after = ChangeApplier.Units(s, r.UnitChanges, events);
            for (int i = 0; i < r.Events.Count; i++)
            {
                events.Add(r.Events[i]);
            }

            return after;
        }

        private static GameState CheckEnd(GameState s, TurnServices services, List<GameEvent> events)
        {
            if (services.EndConditions == null)
            {
                return s;
            }

            EndCheckResult r = services.EndConditions.Evaluate(s);
            GameState after = s;
            for (int i = 0; i < r.ExtUpdates.Count; i++)
            {
                after = after.WithExt(r.ExtUpdates[i].Key, r.ExtUpdates[i].Value);
            }

            for (int i = 0; i < r.EliminatedSlots.Count; i++)
            {
                int slot = r.EliminatedSlots[i];
                if (slot >= 0 && slot < after.Factions.Count)
                {
                    after = after with { Factions = after.Factions.SetItem(slot, after.Factions[slot] with { Eliminated = true }) };
                }
            }

            if (r.MatchEnded)
            {
                after = after with { MatchOver = true, WinnerSlot = r.WinnerSlot };
            }

            for (int i = 0; i < r.Events.Count; i++)
            {
                events.Add(r.Events[i]);
            }

            return after;
        }

        // ----- step 6 -----

        private static GameState Advance(GameState s, TurnServices services, List<GameEvent> events)
        {
            int next = s.Turn + 1;
            var units = new List<Unit>(s.UnitTable.Count);
            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                Unit u = s.UnitTable[i];
                units.Add(u with { MovesLeft = RuleTables.MoveBudget(u.Role, u.Level) });
            }

            var factions = new List<FactionState>(s.Factions.Count);
            for (int i = 0; i < s.Factions.Count; i++)
            {
                factions.Add(s.Factions[i] with { EndedTurn = false });
            }

            string before = services.Hooks.SeasonAt(s.Turn);
            string after = services.Hooks.SeasonAt(next);
            if (!string.Equals(before, after, System.StringComparison.Ordinal))
            {
                events.Add(new SeasonStarted(after));
            }

            IReadOnlyList<TimedEffectStarted> announced = services.TimedEffects.Announcements(next);
            for (int i = 0; i < announced.Count; i++)
            {
                events.Add(announced[i]);
            }

            events.Add(new TurnEnded(next));
            return s with { Turn = next, UnitTable = ImmArray<Unit>.From(units), Factions = ImmArray<FactionState>.From(factions) };
        }
    }
}
