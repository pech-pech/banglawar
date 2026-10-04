using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// <see cref="ICombatResolver"/> for the engine: turns a combat context into a 3x4 battle, plays both sides with
    /// <see cref="BattleAutoPlayer"/> (human battles drive <see cref="BattleEngine"/> directly), and returns unit and base
    /// changes. A pure function of the context and the options; all dice come from <c>BattleSeed</c>.
    /// </summary>
    public sealed class CombatResolver : ICombatResolver
    {
        private readonly CombatResolverOptions _options;

        public CombatResolver(CombatResolverOptions options)
        {
            _options = options;
        }

        public CombatResult Resolve(ICombatContext context)
        {
            List<UnitView> attackers = context.Attackers.Where(IsFighter).ToList();
            List<UnitView> defenders = context.Defenders.Where(IsFighter).ToList();
            List<UnitView> bystanders = context.Defenders.Where(u => !IsFighter(u)).ToList();
            BaseView? target = context.TargetBase;

            if (attackers.Count == 0 || (defenders.Count == 0 && bystanders.Count == 0 && target == null))
            {
                return CombatResult.None;
            }

            if (defenders.Count == 0 && target == null)
            {
                CombatResult swept = UnitResult(context, null, bystanders, attackerWon: true);
                return swept with { Winner = BattleWinner.Attacker };
            }

            SplitMix64 dice = new SplitMix64(context.BattleSeed);
            IReadOnlyList<BattleUnitSpec> generated = target == null
                ? new BattleUnitSpec[0]
                : ColonyDefence.Generated(target.CoreLevel, FortLevels(target), -1);
            BattleState start = BuildBattle(context, attackers, defenders, generated, ref dice);
            BattleStepResult played = BattleAutoPlayer.Resolve(start, _options.Rules, dice);
            dice = played.Dice;

            bool attackerWon = played.State.Outcome!.Winner == BattleSide.Attacker;
            CombatResult units = UnitResult(context, played.State, bystanders, attackerWon);
            BattleWinner winner = attackerWon ? BattleWinner.Attacker : BattleWinner.Defender;
            ImmArray<ReputationChange> reputation = Reputations(context, attackerWon);
            ImmArray<UnitRetreat> retreats = RetreatPlanner.Plan(context, played.State, attackerWon);
            if (target == null)
            {
                return units with { Retreats = retreats, Winner = winner, Reputation = reputation };
            }

            BaseResult b = new BaseResolution(_options, context, target, generated, played.State).Build(attackerWon, ref dice);
            return new CombatResult(
                units.UnitChanges,
                b.Change,
                units.Events.AddRange(ImmArray<GameEvent>.From(b.Events)),
                retreats,
                b.Spoils,
                winner,
                reputation);
        }

        private static bool IsFighter(UnitView u)
        {
            return u.Strength > 0
                && (u.Role == UnitRole.Line || u.Role == UnitRole.Shock || u.Role == UnitRole.Ranged || u.Role == UnitRole.Militia);
        }

        private static int FortLevels(BaseView b)
        {
            return b.Buildings.Where(x => x.Role == BuildingRole.Garrison).Sum(x => x.Level);
        }

        private BattleState BuildBattle(
            ICombatContext context,
            List<UnitView> attackers,
            List<UnitView> defenders,
            IReadOnlyList<BattleUnitSpec> generated,
            ref SplitMix64 dice)
        {
            SideInfo attackInfo = SideFor(context, context.Attackers, context.AttackerSlot, false, ref dice);
            SideInfo defendInfo = SideFor(context, context.Defenders, context.DefenderSlot, context.TargetBase != null, ref dice);
            IEnumerable<BattleUnitSpec> attackSpecs = attackers.Select(ToSpec);
            IEnumerable<BattleUnitSpec> defendSpecs = defenders.Select(ToSpec).Concat(generated);
            return BattleFactory.Create(attackSpecs, attackInfo, defendSpecs, defendInfo);
        }

        private static UnitView? Leader(IReadOnlyList<UnitView> all)
        {
            return all.Where(u => u.Role == UnitRole.Commander).OrderByDescending(u => u.Level).ThenBy(u => u.Id).FirstOrDefault();
        }

        private SideInfo SideFor(ICombatContext context, IReadOnlyList<UnitView> all, int slot, bool defendingBase, ref SplitMix64 dice)
        {
            UnitView? leader = Leader(all);
            CommanderStats? stats = null;
            if (leader != null)
            {
                CommanderStats rolled = CommanderStats.Create(leader.Level, dice, out SplitMix64 next);
                dice = next;
                stats = new CommanderStats(rolled.Level, rolled.Charisma, leader.Reputation);
            }

            return new SideInfo(stats, context.PanicModifierPermille(slot, defendingBase));
        }

        /// <summary>The leading commander of each side gains 1 reputation for a win and loses 1 for a loss (GDD 11.5).</summary>
        private static ImmArray<ReputationChange> Reputations(ICombatContext context, bool attackerWon)
        {
            List<ReputationChange> changes = new List<ReputationChange>();
            AddReputation(changes, Leader(context.Attackers), attackerWon);
            AddReputation(changes, Leader(context.Defenders), !attackerWon);
            return ImmArray<ReputationChange>.From(changes);
        }

        private static void AddReputation(List<ReputationChange> changes, UnitView? leader, bool won)
        {
            if (leader != null)
            {
                changes.Add(new ReputationChange(leader.Id, new CommanderStats(leader.Level, 0, leader.Reputation).AfterBattle(won).Reputation));
            }
        }

        private BattleUnitSpec ToSpec(UnitView u)
        {
            UnitKind kind = u.Role == UnitRole.Shock ? UnitKind.Shock : u.Role == UnitRole.Ranged ? UnitKind.Ranged : UnitKind.Line;
            int cap = _options.Rules.MaxStrength;
            int strength = Math.Min(u.Strength, cap);
            return new BattleUnitSpec(u.Id, kind, strength, Math.Max(strength, Math.Min(u.Level, cap)));
        }

        /// <summary>
        /// Strength changes of real units; bystanders (units that cannot fight) die when the attacker wins. The turn pipeline
        /// raises <c>ev.unit_destroyed</c> itself for every change that reaches zero, so none is raised here.
        /// </summary>
        private CombatResult UnitResult(ICombatContext context, BattleState? final, List<UnitView> bystanders, bool attackerWon)
        {
            List<UnitChange> changes = new List<UnitChange>();
            int cap = _options.Rules.MaxStrength;

            foreach (UnitView u in context.Attackers.Concat(context.Defenders).Where(IsFighter).Where(_ => final != null))
            {
                int now = final?.Find(u.Id)?.Strength ?? 0;
                if (now != Math.Min(u.Strength, cap))
                {
                    changes.Add(new UnitChange(u.Id, now, null));
                }
            }

            if (attackerWon)
            {
                foreach (UnitView u in bystanders)
                {
                    changes.Add(new UnitChange(u.Id, 0, null));
                }
            }

            return new CombatResult(ImmArray<UnitChange>.From(changes.OrderBy(c => c.UnitId)), null, ImmArray<GameEvent>.Empty);
        }
    }
}
