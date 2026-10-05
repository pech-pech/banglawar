using Conquest.Ai;
using Conquest.Glue;
using Conquest.Presentation;

namespace Conquest.UnityView
{
    /// <summary>Builds the computer opponent for a started scenario: the scripted AI for every slot with <c>control: "ai"</c>, a fixed seed (never the clock).</summary>
    public static class OpponentFactory
    {
        /// <summary>The seed the headless <c>OpponentDriver</c> runs use for the slice scenario, so a played game and a replay agree.</summary>
        public const ulong Seed = CoreScenarioBootstrap.SliceSeed;

        public static IOpponentTurn Create(StartResult boot) => new SlotOpponent(boot.AiSlots, new AiOpponentTurn(Seed));

        public static GameSession NewSession(StartResult boot)
        {
            return new GameSession(boot.State, boot.LocalSlot, boot.Services) { Opponent = Create(boot) };
        }
    }
}
