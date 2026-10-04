using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Rules;

namespace Conquest.Core.Combat
{
    /// <summary>The whole battle at one moment. Immutable; <see cref="BattleEngine"/> returns new states.</summary>
    public sealed class BattleState
    {
        private readonly BattleUnit[] _sorted;

        private BattleState(
            BattleUnit[] sorted,
            SideInfo attacker,
            SideInfo defender,
            BattleSide toAct,
            int round,
            int attacksUsed,
            BattleOutcome? outcome)
        {
            _sorted = sorted;
            Units = Frozen.List(sorted);
            Attacker = attacker;
            Defender = defender;
            ToAct = toAct;
            Round = round;
            AttacksUsed = attacksUsed;
            Outcome = outcome;
        }

        /// <summary>All units, ordered by id.</summary>
        public IReadOnlyList<BattleUnit> Units { get; }

        public SideInfo Attacker { get; }

        public SideInfo Defender { get; }

        public BattleSide ToAct { get; }

        /// <summary>Round counter: an attacker turn plus a defender turn, starting at 1.</summary>
        public int Round { get; }

        /// <summary>Group attacks the acting side has made this turn.</summary>
        public int AttacksUsed { get; }

        public BattleOutcome? Outcome { get; }

        public static BattleState Create(IEnumerable<BattleUnit> units, SideInfo attacker, SideInfo defender)
        {
            BattleUnit[] sorted = units.OrderBy(u => u.Id).ToArray();
            for (int i = 1; i < sorted.Length; i++)
            {
                if (sorted[i].Id == sorted[i - 1].Id)
                {
                    throw new ArgumentException("duplicate unit id " + sorted[i].Id, nameof(units));
                }
            }

            return new BattleState(sorted, attacker, defender, BattleSide.Attacker, 1, 0, null);
        }

        public SideInfo Info(BattleSide side)
        {
            return side == BattleSide.Attacker ? Attacker : Defender;
        }

        /// <summary>The unit with that id, or null when it is gone or unknown.</summary>
        public BattleUnit? Find(int id)
        {
            int lo = 0;
            int hi = _sorted.Length - 1;
            while (lo <= hi)
            {
                int mid = (lo + hi) / 2;
                int c = _sorted[mid].Id.CompareTo(id);
                if (c == 0)
                {
                    return _sorted[mid];
                }

                if (c < 0)
                {
                    lo = mid + 1;
                }
                else
                {
                    hi = mid - 1;
                }
            }

            return null;
        }

        public int CountOf(BattleSide side)
        {
            int n = 0;
            for (int i = 0; i < _sorted.Length; i++)
            {
                if (_sorted[i].Side == side)
                {
                    n++;
                }
            }

            return n;
        }

        /// <summary>Replaces units by id (a null entry removes it). Ids not present are ignored.</summary>
        internal BattleState WithUnits(IReadOnlyList<BattleUnit> changed, IReadOnlyList<int> removedIds)
        {
            List<BattleUnit> next = new List<BattleUnit>(_sorted.Length);
            for (int i = 0; i < _sorted.Length; i++)
            {
                BattleUnit u = _sorted[i];
                if (removedIds.Contains(u.Id))
                {
                    continue;
                }

                BattleUnit? replacement = changed.FirstOrDefault(c => c.Id == u.Id);
                next.Add(replacement ?? u);
            }

            return new BattleState(next.ToArray(), Attacker, Defender, ToAct, Round, AttacksUsed, Outcome);
        }

        internal BattleState WithUnit(BattleUnit unit)
        {
            return WithUnits(new[] { unit }, new int[0]);
        }

        internal BattleState WithAttackUsed()
        {
            return new BattleState(_sorted, Attacker, Defender, ToAct, Round, AttacksUsed + 1, Outcome);
        }

        internal BattleState WithTurn(BattleSide toAct, int round)
        {
            return new BattleState(_sorted, Attacker, Defender, toAct, round, 0, Outcome);
        }

        internal BattleState WithOutcome(BattleOutcome outcome)
        {
            return new BattleState(_sorted, Attacker, Defender, ToAct, Round, AttacksUsed, outcome);
        }
    }
}
