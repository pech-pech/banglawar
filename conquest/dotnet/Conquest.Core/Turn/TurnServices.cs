using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// The pluggable parts of the pipeline. Anything left null does nothing (attacks are then cancelled); the rule services
    /// default to their neutral form (no timed effects, no regions, no arrivals, no protected sites).
    /// </summary>
    public sealed class TurnServices
    {
        public TurnServices(
            ICombatResolver? combat = null,
            IRuleHooks? hooks = null,
            IHealingSource? healing = null,
            IEndConditions? endConditions = null,
            ITimedEffects? timedEffects = null,
            IRegionService? regions = null,
            IArrivalPlan? arrivals = null,
            IScenarioRules? scenario = null)
        {
            Combat = combat;
            Hooks = hooks ?? NeutralRuleHooks.Instance;
            Healing = healing;
            EndConditions = endConditions;
            TimedEffects = timedEffects ?? TimedEffectSet.None;
            Regions = regions ?? RegionService.None;
            Arrivals = arrivals ?? ArrivalPlan.Empty;
            Scenario = scenario ?? ScenarioRules.Default;
        }

        public static TurnServices Neutral { get; } = new TurnServices();

        public ICombatResolver? Combat { get; }

        public IRuleHooks Hooks { get; }

        public IHealingSource? Healing { get; }

        public IEndConditions? EndConditions { get; }

        public ITimedEffects TimedEffects { get; }

        public IRegionService Regions { get; }

        public IArrivalPlan Arrivals { get; }

        public IScenarioRules Scenario { get; }
    }
}
