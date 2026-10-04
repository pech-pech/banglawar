using System;
using System.IO;
using Conquest.Glue;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// The running game's shared objects, created once by the Boot scene (or by the Map scene when it is opened on
    /// its own): the loaded content, the core session and the view assets. A plain static holder keeps the scenes
    /// free of cross-scene references.
    /// </summary>
    public static class GameApp
    {
        public const string ScenarioFile = "conquest/scenario.json";
        public const string ThemeFile = "conquest/theme.json";
        public const string AllowListFile = "conquest/allowlist.json";
        public const string StringsFile = "ui-strings.json";

        public static ContentBundle? Content { get; private set; }

        public static GameSession? Session { get; private set; }

        public static ViewAssets? Assets { get; private set; }

        public static bool IsReady => Content != null && Session != null;

        public static void Reset()
        {
            Content = null;
            Session = null;
            Assets = null;
        }

        /// <summary>Loads the three data files and starts a new game. Throws <see cref="ContentLoadException"/> or <see cref="IOException"/>.</summary>
        public static void StartNewGame(IScenarioBootstrap? bootstrap = null)
        {
            Assets = ViewAssets.Load();
            ContentBundle content = ContentBundle.Load(
                ContentFiles.Read(ScenarioFile), ContentFiles.Read(ThemeFile), ContentFiles.Read(StringsFile), ContentFiles.Read(AllowListFile), null, bootstrap ?? new CoreScenarioBootstrap());
            Content = content;
            Session = new GameSession(content.Boot.State, content.Boot.LocalSlot, content.Boot.Services);
        }

        public static void EnsureStarted()
        {
            if (!IsReady) StartNewGame();
        }
    }

    /// <summary>Finds the game's data files: StreamingAssets first (copied by the editor setup), then the repository's data folder in the editor.</summary>
    public static class ContentFiles
    {
        public static string Read(string relativePath)
        {
            string inStreaming = Path.Combine(Application.streamingAssetsPath, relativePath);
            if (File.Exists(inStreaming)) return File.ReadAllText(inStreaming);
            string? fallback = RepositoryFallback(relativePath);
            if (fallback != null && File.Exists(fallback)) return File.ReadAllText(fallback);
            throw new FileNotFoundException("Game data file not found: " + relativePath + " (run Conquest > Slice > Prepare)", inStreaming);
        }

        private static string? RepositoryFallback(string relativePath)
        {
            // Assets -> unity -> conquest; the scenario and theme live in conquest/data.
            string conquest = Path.GetFullPath(Path.Combine(Application.dataPath, "..", ".."));
            switch (relativePath)
            {
                case GameApp.ScenarioFile: return Path.Combine(conquest, "data", "scenarios", "skirmish-1971.json");
                case GameApp.AllowListFile: return Path.Combine(conquest, "data", "allowlists", "content-words.json");
                case GameApp.ThemeFile: return Path.Combine(conquest, "data", "themes", "bd1971", "theme.json");
                default: return null;
            }
        }
    }
}
