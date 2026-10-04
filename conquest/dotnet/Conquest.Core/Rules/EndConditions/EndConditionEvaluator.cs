using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules.EndConditions
{
    /// <summary>
    /// Pipeline step 5a (spec 06 H4), as a stateless function of the game view. Counters live in the game's ext table
    /// (<c>no_base_turns.fN</c>, <c>homeless_turns.fN</c>) and come back as <see cref="ExtUpdate"/>s. Order: elimination,
    /// surrender in list order, winner, deadline.
    /// </summary>
    public sealed class EndConditionEvaluator : IEndConditions
    {
        public const string NoBasePrefix = "no_base_turns.";
        public const string HomelessPrefix = "homeless_turns.";

        private readonly EndConditionConfig _config;
        private readonly PredicateEvaluator _predicates;

        public EndConditionEvaluator(EndConditionConfig config)
        {
            _config = config;
            _predicates = new PredicateEvaluator(config);
        }

        public EndCheckResult Evaluate(IGameStateView state)
        {
            int slots = state.SlotCount;
            bool[] inPlay = Enumerable.Range(0, slots).Select(s => !state.IsEliminated(s)).ToArray();
            List<GameEvent> events = new List<GameEvent>();
            List<int> leaving = new List<int>();
            List<ExtUpdate> updates = new List<ExtUpdate>();

            Eliminate(state, inPlay, events, leaving, updates);
            bool surrendered = Surrender(state, inPlay, events, leaving);

            int remaining = inPlay.Count(p => p);
            bool ended = false;
            int winner = -1;
            if (slots >= 2 && remaining == 1)
            {
                winner = System.Array.IndexOf(inPlay, true);
                events.Add(new MatchWon(winner, surrendered ? "surrender" : "last_standing"));
                ended = true;
            }
            else if (slots >= 2 && remaining == 0)
            {
                events.Add(new MatchDrawn("all_out"));
                ended = true;
            }
            else if (_config.Victory.DeadlineResult == DeadlineResult.Draw && _config.DeadlineMaxTurns > 0 && state.Turn + 1 >= _config.DeadlineMaxTurns)
            {
                events.Add(new MatchDrawn("deadline"));
                ended = true;
            }

            return new EndCheckResult(ImmArray<int>.From(leaving), ended, winner, ImmArray<ExtUpdate>.From(updates), ImmArray<GameEvent>.From(events));
        }

        private void Eliminate(IGameStateView state, bool[] inPlay, List<GameEvent> events, List<int> eliminated, List<ExtUpdate> updates)
        {
            VictoryRules v = _config.Victory;
            for (int slot = 0; slot < inPlay.Length; slot++)
            {
                if (!inPlay[slot])
                {
                    continue;
                }

                bool hasBase = state.Bases.Any(b => b.Owner == slot);
                bool hasFounder = state.Units.Any(u => u.Owner == slot && u.Role == UnitRole.Founder);
                int noBase = Counter(state, NoBasePrefix, slot, !hasBase && !hasFounder, updates);
                int homeless = Counter(state, HomelessPrefix, slot, !hasBase, updates);

                FactionEliminated? leaving = null;
                if (v.HomelessTurnsLimit != null && homeless >= v.HomelessTurnsLimit.Value)
                {
                    leaving = new FactionEliminated(slot, "homeless_limit", v.HomelessTurnsLimit.Value);
                }
                else if (v.GraceTurns > 0 && noBase >= v.GraceTurns)
                {
                    leaving = new FactionEliminated(slot, "no_base_no_founder", v.GraceTurns);
                }
                else if (v.GraceTurns == 0 && !hasBase && !hasFounder)
                {
                    leaving = new FactionEliminated(slot, "no_base_no_founder", 0);
                }

                if (leaving != null)
                {
                    inPlay[slot] = false;
                    eliminated.Add(slot);
                    events.Add(leaving);
                }
            }
        }

        private static int Counter(IGameStateView state, string prefix, int slot, bool grows, List<ExtUpdate> updates)
        {
            string key = prefix + TemplateKeys.SlotName(slot);
            long before = state.GetExt(key);
            long after = grows ? before + 1 : 0;
            if (after != before)
            {
                updates.Add(new ExtUpdate(key, after));
            }

            return (int)after;
        }

        private bool Surrender(IGameStateView state, bool[] inPlay, List<GameEvent> events, List<int> eliminated)
        {
            bool any = false;
            foreach (SurrenderEntry entry in _config.Surrenders)
            {
                if (entry.Slot < 0 || entry.Slot >= inPlay.Length || !inPlay[entry.Slot] || !_predicates.Evaluate(entry.When, state))
                {
                    continue;
                }

                inPlay[entry.Slot] = false;
                eliminated.Add(entry.Slot);
                events.Add(new FactionSurrendered(entry.Slot, state.Turn));
                any = true;
            }

            return any;
        }
    }
}
