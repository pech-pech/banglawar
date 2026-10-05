using System;
using System.Collections.Generic;
using Conquest.Bootstrap;
using Conquest.Content.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Glue
{
    /// <summary>The first game state of a scenario, the services the turn pipeline needs and the local player's slot.</summary>
    public sealed class StartResult
    {
        public StartResult(GameState state, TurnServices services, int localSlot, IReadOnlyList<GameEvent> events, IReadOnlyList<int>? aiSlots = null)
        {
            AiSlots = aiSlots ?? Array.Empty<int>();
            State = state;
            Services = services;
            LocalSlot = localSlot;
            Events = events;
        }

        public GameState State { get; }

        public TurnServices Services { get; }

        public int LocalSlot { get; }

        /// <summary>Slots the scenario gives to the computer (<c>control: "ai"</c>), ascending.</summary>
        public IReadOnlyList<int> AiSlots { get; }

        /// <summary>Turn-0 events (arrival spawns).</summary>
        public IReadOnlyList<GameEvent> Events { get; }
    }

    /// <summary>
    /// SWAP SPOT 1. Turns scenario data into the core's first state. The only class that calls the core's scenario
    /// bootstrapper; replace it here if its signature changes.
    /// </summary>
    public interface IScenarioBootstrap
    {
        StartResult Create(ScenarioData scenario);
    }

    public sealed class CoreScenarioBootstrap : IScenarioBootstrap
    {
        public const ulong SliceSeed = 1971UL;

        public StartResult Create(ScenarioData scenario)
        {
            if (scenario == null) throw new ArgumentNullException(nameof(scenario));
            Conquest.Bootstrap.BootResult boot = ScenarioBootstrapper.Boot(scenario, SliceSeed);
            if (!boot.Ok)
            {
                var messages = new List<string>();
                foreach (BootError e in boot.Errors) messages.Add("boot: " + e);
                throw new ContentLoadException(messages);
            }

            int local = -1;
            var ai = new List<int>();
            foreach (BootPlayer p in boot.Players)
            {
                if (string.Equals(p.Control, "ai", StringComparison.Ordinal)) ai.Add(p.Slot);
                if (local < 0 && string.Equals(p.Control, "human", StringComparison.Ordinal)) local = p.Slot;
            }

            if (local < 0) local = 0;
            return new StartResult(boot.State!, boot.Services!, local, boot.Events, ai);
        }
    }
}
