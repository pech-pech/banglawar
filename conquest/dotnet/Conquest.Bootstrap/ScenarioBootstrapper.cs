using System.Collections.Generic;
using Conquest.Content.Model;
using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Bootstrap
{
    /// <summary>
    /// Turns a validated <see cref="ScenarioData"/> into a playable game: new game on the scenario map, pre-placed bases with
    /// attached garrisons and commanders, intel seeds, then the turn-0 arrivals on their entry tiles (spec 06 "New game"). The
    /// services carry every hook the scenario switches on. Pure: the same scenario and seed always give the same state and hash.
    /// </summary>
    public static class ScenarioBootstrapper
    {
        public static BootResult Boot(ScenarioData scenario, ulong seed)
        {
            var errors = new List<BootError>();
            GameMap? map = MapBuilder.Build(scenario.Map, errors);
            TurnServices services = Services(scenario, errors);
            if (map == null || scenario.Players.Count < 1 || scenario.Players.Count > GameFactory.MaxSlots)
            {
                errors.Add(new BootError("/players", "err.boot_players", "a scenario needs 1 to " + GameFactory.MaxSlots + " players and a valid map"));
                return Failed(scenario, errors);
            }

            GameState state = GameFactory.NewGame(map, seed, scenario.Players.Count);
            state = BaseBuilder.Place(state, scenario, errors);
            state = BaseBuilder.SeedIntel(state, scenario);
            var events = new List<GameEvent>();
            state = ArrivalStep.Run(state, services, 0, events);
            if (errors.Count > 0)
            {
                return Failed(scenario, errors);
            }

            return new BootResult(scenario.Id, state, services, events, Players(scenario), errors);
        }

        private static TurnServices Services(ScenarioData s, List<BootError> errors)
        {
            return new TurnServices(
                new CombatResolver(new CombatResolverOptions()),
                RulesBuilder.Seasons(s),
                RulesBuilder.Healing(),
                RulesBuilder.EndConditions(s, errors),
                RulesBuilder.TimedEffects(s, errors),
                RulesBuilder.Regions(s, errors),
                PlanBuilder.Arrivals(s, errors),
                PlanBuilder.Scenario(s, errors));
        }

        private static IReadOnlyList<BootPlayer> Players(ScenarioData s)
        {
            var list = new List<BootPlayer>();
            for (int i = 0; i < s.Players.Count; i++)
            {
                list.Add(new BootPlayer(i, s.Players[i].Control));
            }

            return list;
        }

        private static BootResult Failed(ScenarioData s, List<BootError> errors)
        {
            return new BootResult(s.Id, null, null, new List<GameEvent>(), new List<BootPlayer>(), errors);
        }
    }
}
