using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Core.Combat
{
    /// <summary>The change to the attacked base plus the site events that go with it.</summary>
    internal sealed class BaseResult
    {
        public BaseResult(BaseChange change, IReadOnlyList<GameEvent> events, ResourceVector? spoils = null)
        {
            Change = change;
            Events = events;
            Spoils = spoils;
        }

        /// <summary>What a raid carried off, or null for a capture.</summary>
        public ResourceVector? Spoils { get; }

        public BaseChange Change { get; }

        public IReadOnlyList<GameEvent> Events { get; }
    }

    /// <summary>
    /// What a finished battle does to the attacked colony (GDD 11.6, spec 06 H2): capture damage, raid spoils, the
    /// protected-site conversion, and the people lost with the militia.
    /// </summary>
    internal sealed class BaseResolution
    {
        private readonly CombatResolverOptions _options;
        private readonly ICombatContext _context;
        private readonly BaseView _target;
        private readonly int _popLoss;
        private readonly int _rounds;

        public BaseResolution(CombatResolverOptions options, ICombatContext context, BaseView target, IReadOnlyList<BattleUnitSpec> generated, BattleState final)
        {
            _options = options;
            _context = context;
            _target = target;
            _popLoss = ColonyDefence.PopLoss(final, generated);
            _rounds = final.Round;
        }

        public BaseResult Build(bool attackerWon, ref SplitMix64 dice)
        {
            ResourceVector stock = _target.Stock.With(Resource.Pop, System.Math.Max(0, _target.Stock.Pop - _popLoss));
            return _context.Kind == AttackKind.Capture
                ? Capture(stock, attackerWon, ref dice)
                : ResolveRaid(stock, attackerWon, ref dice);
        }

        private BaseResult Capture(ResourceVector stock, bool attackerWon, ref SplitMix64 dice)
        {
            SiteCaptureResult site = _options.SiteCapture.ResolveCapture(_target.SiteId, _target.Owner, _context.AttackerSlot, attackerWon, _context.CaptureLegal);
            if (site.Fate != SiteFate.Captured)
            {
                return Result(BaseOutcome.Unchanged, stock, -1, _popLoss > 0, new int[0], site);
            }

            int[] levels = Levels();
            dice = LowerOneAtRandom(levels, dice, out int[] lowered);
            return Result(BaseOutcome.Captured, Halve(stock), -1, true, lowered, site);
        }

        private BaseResult ResolveRaid(ResourceVector stock, bool attackerWon, ref SplitMix64 dice)
        {
            RaidSpoils spoils = Raid.Settle(stock, _rounds);
            int[] levels = Levels();
            int[] lowered = Raid.LowerLevels(levels, IsFort(), spoils.BuildingLevelsLowered);
            bool canDestroy = _target.SiteId == null || _context.RaidCanDestroy;
            SiteCaptureResult site = _options.SiteCapture.ResolveRaid(_target.SiteId, _target.Owner, _context.AttackerSlot, attackerWon, canDestroy, _context.CaptureLegal);

            switch (site.Fate)
            {
                case SiteFate.Destroyed:
                    return WithSpoils(Result(BaseOutcome.Destroyed, null, -1, false, levels, site), spoils);
                case SiteFate.Captured:
                    return WithSpoils(Result(BaseOutcome.Captured, Halve(spoils.Remaining), -1, true, lowered, site), spoils);
                case SiteFate.SurvivesAtLevelOne:
                    return WithSpoils(Result(BaseOutcome.Unchanged, spoils.Remaining, 1, true, lowered, site), spoils);
                default:
                    return WithSpoils(Result(BaseOutcome.Unchanged, spoils.Remaining, -1, true, lowered, site), spoils);
            }
        }

        private static BaseResult WithSpoils(BaseResult result, RaidSpoils spoils)
        {
            return new BaseResult(result.Change, result.Events, spoils.Seized);
        }

        private BaseResult Result(BaseOutcome outcome, ResourceVector? stock, int coreLevel, bool sendStock, int[] newLevels, SiteCaptureResult site)
        {
            int newOwner = outcome == BaseOutcome.Captured ? _context.AttackerSlot : _target.Owner;
            BaseChange change = new BaseChange(
                _target.Id, outcome, newOwner, sendStock ? stock : null, coreLevel, ImmArray<BuildingLevelChange>.From(Diff(newLevels)));
            return new BaseResult(change, site.Events);
        }

        private IEnumerable<BuildingLevelChange> Diff(int[] newLevels)
        {
            for (int i = 0; i < newLevels.Length && i < _target.Buildings.Count; i++)
            {
                if (newLevels[i] != _target.Buildings[i].Level)
                {
                    yield return new BuildingLevelChange(i, newLevels[i]);
                }
            }
        }

        private int[] Levels()
        {
            return _target.Buildings.Select(b => b.Level).ToArray();
        }

        private bool[] IsFort()
        {
            return _target.Buildings.Select(b => b.Role == BuildingRole.Garrison).ToArray();
        }

        /// <summary>Capture damage (02 G16, ASSUMED): one random building loses one level.</summary>
        private static SplitMix64 LowerOneAtRandom(int[] levels, SplitMix64 dice, out int[] result)
        {
            result = (int[])levels.Clone();
            List<int> candidates = Enumerable.Range(0, levels.Length).Where(i => levels[i] > 0).ToList();
            if (candidates.Count == 0)
            {
                return dice;
            }

            dice = dice.Below(candidates.Count, out int pick);
            result[candidates[pick]]--;
            return dice;
        }

        /// <summary>Half of every stockpile is kept; people are not part of the stockpile (no civilian state).</summary>
        private static ResourceVector Halve(ResourceVector v)
        {
            return new ResourceVector(v.Basic / 2, v.Hard / 2, v.Coin / 2, v.Wares / 2, v.Food / 2, v.Pop);
        }
    }
}
