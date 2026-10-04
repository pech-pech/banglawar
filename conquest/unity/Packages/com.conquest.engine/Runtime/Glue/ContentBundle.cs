using System;
using System.Collections.Generic;
using Conquest.Assets.Lookup;
using Conquest.Content;
using Conquest.Content.Model;

namespace Conquest.Glue
{
    /// <summary>Everything the game loads from text before it can start: scenario, theme, UI strings and the first state.</summary>
    public sealed class ContentBundle
    {
        private ContentBundle(ScenarioData scenario, ThemeData theme, Localizer text, SeasonLookup seasons, StartResult boot, AssetCatalog? catalog)
        {
            Scenario = scenario;
            Theme = theme;
            Text = text;
            Seasons = seasons;
            Boot = boot;
            Catalog = catalog;
        }

        public ScenarioData Scenario { get; }

        public ThemeData Theme { get; }

        public Localizer Text { get; }

        public SeasonLookup Seasons { get; }

        public StartResult Boot { get; }

        /// <summary>The asset catalogue when a sprite sheet was supplied; null otherwise.</summary>
        public AssetCatalog? Catalog { get; }

        /// <summary>Loads and checks the three texts. Throws <see cref="ContentLoadException"/> with every message on a problem.</summary>
        public static ContentBundle Load(string scenarioJson, string themeJson, string stringsJson, string allowListJson, string? spriteSheetJson, IScenarioBootstrap bootstrap)
        {
            LoadResult<AllowListData> allow = ContentLoader.LoadAllowList(allowListJson);
            Check("allow list", allow.Errors, allow.Ok);
            LoadResult<ScenarioData> scenario = ContentLoader.LoadScenario(scenarioJson, allow.Data);
            Check("scenario", scenario.Errors, scenario.Ok);
            AssetCatalog? catalog = spriteSheetJson == null ? null : AssetCatalog.FromJson(spriteSheetJson);
            LoadResult<ThemeData> theme = ContentLoader.LoadTheme(themeJson, scenario.Data, null, allow.Data);
            Check("theme", theme.Errors, theme.Ok);
            Localizer text = Localizer.FromJson(stringsJson, theme.Data);
            StartResult boot = bootstrap.Create(scenario.Data!);
            return new ContentBundle(scenario.Data!, theme.Data!, text, new SeasonLookup(scenario.Data!, theme.Data), boot, catalog);
        }

        private static void Check(string what, IReadOnlyList<ContentError> errors, bool ok)
        {
            if (ok) return;
            var messages = new List<string>();
            foreach (ContentError e in errors) messages.Add(what + ": " + e);
            throw new ContentLoadException(messages);
        }
    }

    public sealed class ContentLoadException : Exception
    {
        public ContentLoadException(IReadOnlyList<string> messages) : base(string.Join("; ", messages))
        {
            Messages = messages;
        }

        public IReadOnlyList<string> Messages { get; }
    }
}
