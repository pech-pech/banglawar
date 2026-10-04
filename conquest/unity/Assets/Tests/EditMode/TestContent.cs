using Conquest.Glue;
using Conquest.UnityView;

namespace Conquest.UnityView.Tests
{
    /// <summary>Loads the real scenario, theme and strings once per call; tests never mutate what they get (the state is immutable).</summary>
    public static class TestContent
    {

        public static ContentBundle Load() =>
            ContentBundle.Load(
                ContentFiles.Read(GameApp.ScenarioFile), ContentFiles.Read(GameApp.ThemeFile), ContentFiles.Read(GameApp.StringsFile), ContentFiles.Read(GameApp.AllowListFile), null, new CoreScenarioBootstrap());

        public static GameSession NewSession()
        {
            ContentBundle content = Load();
            return new GameSession(content.Boot.State, content.Boot.LocalSlot, content.Boot.Services);
        }
    }
}
