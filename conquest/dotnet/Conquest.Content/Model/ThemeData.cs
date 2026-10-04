using System.Collections.Generic;

namespace Conquest.Content.Model
{
    public sealed class NamedEntry
    {
        public NamedEntry(string key, string value)
        {
            Key = key;
            Value = value;
        }

        public string Key { get; }

        public string Value { get; }
    }

    public sealed class FactionStyle
    {
        public FactionStyle(string slot, string name, string adjective, string color)
        {
            Slot = slot;
            Name = name;
            Adjective = adjective;
            Color = color;
        }

        public string Slot { get; }

        public string Name { get; }

        public string Adjective { get; }

        /// <summary>#rrggbb.</summary>
        public string Color { get; }
    }

    public sealed class RoleAsset
    {
        public RoleAsset(string role, string asset, string glyph)
        {
            Role = role;
            Asset = asset;
            Glyph = glyph;
        }

        public string Role { get; }

        /// <summary>Role-level asset key, <c>kind.role</c>; the resolver adds level and @slot.</summary>
        public string Asset { get; }

        /// <summary>Fallback painter hint used when no picture exists.</summary>
        public string Glyph { get; }
    }

    /// <summary>
    /// A theme pack as plain data. It holds text and asset references only; no rule number lives here.
    /// <c>Labels</c> keys are a role id, optionally followed by <c>@f2</c> for the opposing side's wording.
    /// </summary>
    public sealed class ThemeData
    {
        public ThemeData(
            string schema,
            string id,
            string version,
            string requiresRuleset,
            int requiresMajor,
            string defaultLocale,
            string displayName,
            IReadOnlyList<FactionStyle> factions,
            IReadOnlyList<NamedEntry> labels,
            IReadOnlyList<NamedEntry> terrainAssets,
            IReadOnlyList<RoleAsset> buildingAssets,
            IReadOnlyList<RoleAsset> unitAssets,
            IReadOnlyList<string> plannedAssets,
            IReadOnlyList<NamedEntry> seasonLabels,
            IReadOnlyList<NamedEntry> siteNames,
            IReadOnlyList<NamedEntry> entryNames,
            IReadOnlyList<NamedEntry> regionNames)
        {
            Schema = schema;
            Id = id;
            Version = version;
            RequiresRuleset = requiresRuleset;
            RequiresMajor = requiresMajor;
            DefaultLocale = defaultLocale;
            DisplayName = displayName;
            Factions = factions;
            Labels = labels;
            TerrainAssets = terrainAssets;
            BuildingAssets = buildingAssets;
            UnitAssets = unitAssets;
            PlannedAssets = plannedAssets;
            SeasonLabels = seasonLabels;
            SiteNames = siteNames;
            EntryNames = entryNames;
            RegionNames = regionNames;
        }

        public string Schema { get; }

        public string Id { get; }

        public string Version { get; }

        public string RequiresRuleset { get; }

        public int RequiresMajor { get; }

        public string DefaultLocale { get; }

        public string DisplayName { get; }

        public IReadOnlyList<FactionStyle> Factions { get; }

        public IReadOnlyList<NamedEntry> Labels { get; }

        /// <summary>Art look id to tile asset key.</summary>
        public IReadOnlyList<NamedEntry> TerrainAssets { get; }

        public IReadOnlyList<RoleAsset> BuildingAssets { get; }

        public IReadOnlyList<RoleAsset> UnitAssets { get; }

        /// <summary>Asset keys the theme names that the manifest does not hold yet; the glyph is drawn until they do.</summary>
        public IReadOnlyList<string> PlannedAssets { get; }

        public IReadOnlyList<NamedEntry> SeasonLabels { get; }

        public IReadOnlyList<NamedEntry> SiteNames { get; }

        public IReadOnlyList<NamedEntry> EntryNames { get; }

        public IReadOnlyList<NamedEntry> RegionNames { get; }

        public string? FindName(IReadOnlyList<NamedEntry> list, string key)
        {
            foreach (NamedEntry e in list)
            {
                if (e.Key == key)
                {
                    return e.Value;
                }
            }

            return null;
        }
    }

    public sealed class AllowListEntry
    {
        public AllowListEntry(string scope, string path, string word, string reviewer, string reason)
        {
            Scope = scope;
            Path = path;
            Word = word;
            Reviewer = reviewer;
            Reason = reason;
        }

        /// <summary>"scenario" or "theme".</summary>
        public string Scope { get; }

        public string Path { get; }

        public string Word { get; }

        public string Reviewer { get; }

        public string Reason { get; }
    }

    public sealed class AllowListData
    {
        public static readonly AllowListData Empty = new AllowListData(new List<AllowListEntry>());

        public AllowListData(IReadOnlyList<AllowListEntry> entries)
        {
            Entries = entries;
        }

        public IReadOnlyList<AllowListEntry> Entries { get; }
    }
}
